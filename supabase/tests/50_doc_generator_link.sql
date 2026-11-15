-- migration_017: the doc generator records its PIs and tax invoices here. Decision 0011.
-- Site Pune = 51111111-…-0001, Goa = 51111111-…-0002 (seed_test.sql).

-- 1. Signed-in users (even staff) and the public key cannot call the link functions.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    perform public.link_generated_document('{"kind":"pi"}'::jsonb);
    assert false, 'staff must not be able to call link_generated_document';
  exception when insufficient_privilege then null; end;
  begin
    perform public.cancel_generated_document('docgen:pi:x', null);
    assert false, 'staff must not be able to call cancel_generated_document';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform public.attach_generated_file('docgen:pi:x', 'pi/x.docx', 'x.docx');
    assert false, 'anon must not be able to call attach_generated_file';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 2. The doc generator's server (service role): a PI, its file, a retry, an invoice that converts it.
set local role service_role;
do $$
declare r jsonb; r2 jsonb; v_pi uuid; v_inv uuid; v_doc uuid; v_doc2 uuid; rec record;
begin
  r := public.link_generated_document(jsonb_build_object(
    'kind','pi','source_ref','docgen:pi:26-27/41','site_id','51111111-0000-0000-0000-000000000001',
    'number','26-27/41','date','2026-10-02','amount',118000,'subject','Lobby fit-out'));
  v_pi := (r->>'record_id')::uuid;
  assert r->>'record_type' = 'proforma_invoice' and not (r->>'existing')::boolean, format('PI link %s', r);
  select * into rec from public.proforma_invoice where pi_id = v_pi;
  assert rec.status = 'sent' and rec.amount = 118000 and rec.subject = 'Lobby fit-out' and rec.submitted_date = '2026-10-02', 'PI fields';

  -- a retry (answer lost, or the offline queue) returns the same record
  r2 := public.link_generated_document(jsonb_build_object(
    'kind','pi','source_ref','docgen:pi:26-27/41','site_id','51111111-0000-0000-0000-000000000001',
    'number','26-27/41','date','2026-10-02','amount',118000));
  assert (r2->>'record_id')::uuid = v_pi and (r2->>'existing')::boolean, 'retry must not duplicate';
  assert (select count(*) from public.proforma_invoice where pi_number = '26-27/41') = 1, 'one PI';

  -- the file is filed under the site with the PI's number and date (fn_file_document)
  v_doc := public.attach_generated_file('docgen:pi:26-27/41', 'pi/abc_PI.docx', 'PI.docx');
  v_doc2 := public.attach_generated_file('docgen:pi:26-27/41', 'pi/abc_PI.docx', 'PI.docx');
  assert v_doc = v_doc2, 'the same file twice is filed once';
  select * into rec from public.document where document_id = v_doc;
  assert rec.site_id = '51111111-0000-0000-0000-000000000001' and rec.doc_number = '26-27/41'
     and rec.linked_type = 'proforma_invoice' and rec.document_type = 'pi', format('filing %s', to_jsonb(rec));
  assert (select document_id from public.proforma_invoice where pi_id = v_pi) = v_doc, 'PI points at its file';
  begin
    perform public.attach_generated_file('docgen:pi:26-27/41', 'other-app/secret.pdf', 'x.pdf');
    assert false, 'a path outside pi/ or invoice/ accepted';
  exception when invalid_parameter_value then null; end;

  -- tax invoice made from that PI, rounded to the rupee
  r := public.link_generated_document(jsonb_build_object(
    'kind','invoice','source_ref','docgen:invoice:S51/26-27/007','site_id','51111111-0000-0000-0000-000000000001',
    'number','S51/26-27/007','date','2026-10-20','taxable',1000.40,'gst',180.07,'gst_type','cgst_sgst','gst_rate',18,
    'round_off',-0.47,'gross',1180,'pi_id',v_pi));
  v_inv := (r->>'record_id')::uuid;
  select * into rec from public.tax_invoice where invoice_id = v_inv;
  assert rec.gross_invoice_value = 1180 and rec.round_off = -0.47 and rec.gst_type = 'cgst_sgst' and rec.pi_id = v_pi
     and rec.status = 'issued', format('invoice %s', to_jsonb(rec));
  select * into rec from public.proforma_invoice where pi_id = v_pi;
  assert rec.status = 'converted_to_invoice' and rec.converted_invoice_id = v_inv, 'PI converted';

  -- refusals: unknown site, number already typed in by hand, PI of another site, PI already converted
  begin
    perform public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/42',
      'site_id','59999999-0000-0000-0000-000000000099','number','26-27/42','date','2026-10-02','amount',1));
    assert false, 'unknown site accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:INV-1',
      'site_id','51111111-0000-0000-0000-000000000001','number','INV-1','date','2026-10-02','taxable',1,'gst',0,'gross',1));
    assert false, 'hand-entered number accepted twice';
  exception when unique_violation then null; end;
  begin
    perform public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/008',
      'site_id','51111111-0000-0000-0000-000000000002','number','S51/26-27/008','date','2026-10-21',
      'taxable',100,'gst',18,'gross',118,'pi_id',v_pi));
    assert false, 'PI of another site accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:invoice:x',
      'site_id','51111111-0000-0000-0000-000000000001','number','x','date','2026-10-02','amount',1));
    assert false, 'mismatched reference accepted';
  exception when invalid_parameter_value then null; end;

  -- void: a converted PI cannot be cancelled; the invoice can (no payments yet)
  begin
    perform public.cancel_generated_document('docgen:pi:26-27/41', 'typo');
    assert false, 'converted PI cancelled';
  exception when invalid_parameter_value then null; end;
  assert public.cancel_generated_document('docgen:invoice:S51/26-27/007', 'wrong rate') = 'cancelled', 'invoice cancel';
  assert (select status from public.tax_invoice where invoice_id = v_inv) = 'cancelled', 'invoice is cancelled';
  assert public.cancel_generated_document('docgen:invoice:S51/26-27/007', null) = 'already cancelled', 'cancel twice';
  assert public.cancel_generated_document('docgen:pi:nothing', null) = 'not in tracker', 'unknown ref';

  -- a fresh PI can be cancelled, and drops out of the open PIs
  r := public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/43',
    'site_id','51111111-0000-0000-0000-000000000002','number','26-27/43','date','2026-10-05','amount',5000));
  assert public.cancel_generated_document('docgen:pi:26-27/43', 'client dropped it') = 'cancelled', 'PI cancel';
  select * into rec from public.proforma_invoice where source_ref = 'docgen:pi:26-27/43';
  assert rec.status = 'cancelled' and rec.remarks like '%Voided in the doc generator: client dropped it%', format('PI cancel %s', to_jsonb(rec));
end $$;
reset role;

-- 3. Round off: parts must still add up; round off is under ₹1; old rows are unaffected.
do $$ begin
  begin
    insert into public.tax_invoice (site_id, invoice_number, invoice_date, taxable_value, gst_amount, gross_invoice_value)
    values ('51111111-0000-0000-0000-000000000001', 'RO-BAD', '2026-10-01', 1000.40, 180.07, 1180);
    assert false, 'parts that do not add up (no round off) accepted';
  exception when check_violation then null; end;
  begin
    insert into public.tax_invoice (site_id, invoice_number, invoice_date, taxable_value, gst_amount, round_off, gross_invoice_value)
    values ('51111111-0000-0000-0000-000000000001', 'RO-BIG', '2026-10-01', 1000, 180, 5, 1185);
    assert false, 'a round off of ₹5 accepted';
  exception when check_violation then null; end;
  assert (select count(*) from public.tax_invoice where round_off <> 0 and source_ref is null) = 0, 'existing invoices keep round off 0';
  assert exists (select 1 from public.tally_setting where key = 'round_off_ledger' and value = 'Round Off'), 'Tally round-off ledger setting';
end $$;

-- 4. A signed-in user sees the linked PI like any other.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role service_role;
select public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/44',
  'site_id','51111111-0000-0000-0000-000000000001','number','26-27/44','date','2026-10-06','amount',2000));
reset role;
set local role authenticated;
do $$ begin
  assert (select count(*) from public.proforma_invoice where source_ref = 'docgen:pi:26-27/44') = 1, 'staff see the linked PI';
end $$;
reset role;

-- 5. Money-safety refusals and retries (review).
set local role service_role;
do $$
declare r jsonb; v_inv uuid; v_pi uuid;
begin
  -- invoice retry returns the existing record
  r := public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/020',
    'site_id','51111111-0000-0000-0000-000000000001','number','S51/26-27/020','date','2026-10-25',
    'taxable',1000,'gst',180,'gst_type','cgst_sgst','gst_rate',18,'round_off',0,'gross',1180));
  v_inv := (r->>'record_id')::uuid;
  r := public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/020',
    'site_id','51111111-0000-0000-0000-000000000001','number','S51/26-27/020','date','2026-10-25',
    'taxable',1000,'gst',180,'gst_type','cgst_sgst','gst_rate',18,'round_off',0,'gross',1180));
  assert (r->>'record_id')::uuid = v_inv and (r->>'existing')::boolean, 'invoice retry must not duplicate';

  -- dated before the tracker starts (hidden from staff) → refused
  begin
    perform public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/50',
      'site_id','51111111-0000-0000-0000-000000000001','number','26-27/50','date','2026-07-15','amount',100));
    assert false, 'pre-start date accepted';
  exception when invalid_parameter_value then null; end;

  -- unknown ref for a file
  begin
    perform public.attach_generated_file('docgen:pi:nothing', 'pi/x.docx', 'x.docx');
    assert false, 'attach to unknown ref accepted';
  exception when no_data_found then null; end;
end $$;
reset role;

-- an invoice with a payment matched cannot be cancelled
insert into public.payment (payment_id, site_id, payment_date, amount_received, utr_or_reference)
values ('b1111111-0000-0000-0000-0000000000d1', '51111111-0000-0000-0000-000000000001', '2026-10-30', 500, 'UTR-DG');
insert into public.payment_allocation (payment_id, invoice_id, amount_allocated)
select 'b1111111-0000-0000-0000-0000000000d1', invoice_id, 500 from public.tax_invoice where source_ref = 'docgen:invoice:S51/26-27/020';
set local role service_role;
do $$ begin
  begin
    perform public.cancel_generated_document('docgen:invoice:S51/26-27/020', 'x');
    assert false, 'paid invoice cancelled';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- an invoice already in Tally cannot be cancelled (fn_tally_lock)
set local role service_role;
select public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/021',
  'site_id','51111111-0000-0000-0000-000000000001','number','S51/26-27/021','date','2026-10-26',
  'taxable',100,'gst',18,'gst_type','cgst_sgst','gst_rate',18,'round_off',0,'gross',118));
reset role;
insert into public.tally_sync_log (record_type, record_id, tally_voucher_type, sync_status)
select 'invoice', invoice_id, 'Sales', 'pushed' from public.tax_invoice where source_ref = 'docgen:invoice:S51/26-27/021';
set local role service_role;
do $$ begin
  begin
    perform public.cancel_generated_document('docgen:invoice:S51/26-27/021', 'x');
    assert false, 'invoice in Tally cancelled';
  exception when raise_exception then null; end;
  assert (select status from public.tax_invoice where source_ref = 'docgen:invoice:S51/26-27/021') = 'issued', 'still issued';
end $$;
reset role;

-- a PI linked to a PO cannot be cancelled; a cancelled PI cannot be invoiced (either way in)
set local role service_role;
select public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/51',
  'site_id','51111111-0000-0000-0000-000000000001','number','26-27/51','date','2026-10-07','amount',300));
select public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/52',
  'site_id','51111111-0000-0000-0000-000000000001','number','26-27/52','date','2026-10-07','amount',400));
select public.cancel_generated_document('docgen:pi:26-27/52', 'dropped');
reset role;
update public.proforma_invoice set po_id = 'a1111111-0000-0000-0000-00000000000a' where source_ref = 'docgen:pi:26-27/51';
set local role service_role;
do $$
declare v_cancelled uuid := (select pi_id from public.proforma_invoice where source_ref = 'docgen:pi:26-27/52');
begin
  begin
    perform public.cancel_generated_document('docgen:pi:26-27/51', 'x');
    assert false, 'PI linked to a PO cancelled';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/022',
      'site_id','51111111-0000-0000-0000-000000000001','number','S51/26-27/022','date','2026-10-27',
      'taxable',100,'gst',18,'gross',118,'pi_id',v_cancelled));
    assert false, 'cancelled PI invoiced via the doc generator';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_tax_invoice('51111111-0000-0000-0000-000000000001', null, null, v_cancelled,
      'MAN-1', '2026-10-27', 100, 18, 118, null);
    assert false, 'cancelled PI invoiced via record_tax_invoice';
  exception when raise_exception then null; end;
end $$;
reset role;
