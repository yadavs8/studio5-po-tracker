-- migration_018: a PI reopens when its tax invoice is cancelled (decision 0012).
do $$
declare v_pi uuid; v_inv uuid; v_inv2 uuid; rec record;
begin
  insert into public.proforma_invoice (site_id, pi_number, pi_date, amount, status)
  values ('51111111-0000-0000-0000-000000000001', 'PI-R1', '2026-10-01', 1180, 'sent') returning pi_id into v_pi;
  v_inv := public.record_tax_invoice('51111111-0000-0000-0000-000000000001', null, null, v_pi, 'INV-R1', '2026-10-05', 1000, 180, 1180, null);
  assert (select status from public.proforma_invoice where pi_id = v_pi) = 'converted_to_invoice', 'converted';

  -- M17 still holds while the invoice is live
  begin
    update public.proforma_invoice set status = 'sent' where pi_id = v_pi;
    assert false, 'converted PI with a live invoice was reopened by hand';
  exception when raise_exception then null; end;

  -- cancelling the invoice reopens the PI
  update public.tax_invoice set status = 'cancelled' where invoice_id = v_inv;
  select * into rec from public.proforma_invoice where pi_id = v_pi;
  assert rec.status = 'sent' and rec.converted_invoice_id is null and rec.remarks like '%Reopened: tax invoice INV-R1 was cancelled%', format('reopen %s', to_jsonb(rec));
  assert (select pi_id from public.tax_invoice where invoice_id = v_inv) = v_pi, 'cancelled invoice keeps its PI as history';

  -- the corrected invoice can be made from the same PI
  v_inv2 := public.record_tax_invoice('51111111-0000-0000-0000-000000000001', null, null, v_pi, 'INV-R2', '2026-10-06', 1000, 180, 1180, null);
  select * into rec from public.proforma_invoice where pi_id = v_pi;
  assert rec.status = 'converted_to_invoice' and rec.converted_invoice_id = v_inv2, 'converted to the new invoice';

  -- un-cancelling the old invoice does not steal the PI from the new one
  update public.tax_invoice set status = 'issued' where invoice_id = v_inv;
  assert (select converted_invoice_id from public.proforma_invoice where pi_id = v_pi) = v_inv2, 'PI stays with the new invoice';

  -- un-cancel while the PI is still open converts it back
  update public.tax_invoice set status = 'cancelled' where invoice_id = v_inv2;
  update public.tax_invoice set status = 'cancelled' where invoice_id = v_inv;  -- already not linked: no change
  assert (select status from public.proforma_invoice where pi_id = v_pi) = 'sent', 'reopened again';
  update public.tax_invoice set status = 'issued' where invoice_id = v_inv2;
  select * into rec from public.proforma_invoice where pi_id = v_pi;
  assert rec.status = 'converted_to_invoice' and rec.converted_invoice_id = v_inv2, 'un-cancel converts it back';
end $$;

-- the doc generator path: voiding an invoice made from a PI reopens that PI
set local role service_role;
do $$
declare r jsonb; v_pi uuid;
begin
  r := public.link_generated_document(jsonb_build_object('kind','pi','source_ref','docgen:pi:26-27/70',
    'site_id','51111111-0000-0000-0000-000000000002','number','26-27/70','date','2026-10-02','amount',1180));
  v_pi := (r->>'record_id')::uuid;
  perform public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/070',
    'site_id','51111111-0000-0000-0000-000000000002','number','S51/26-27/070','date','2026-10-20',
    'taxable',1000,'gst',180,'gst_type','cgst_sgst','gst_rate',18,'round_off',0,'gross',1180,'pi_id',v_pi));
  assert public.cancel_generated_document('docgen:invoice:S51/26-27/070', 'wrong rate') = 'cancelled', 'cancel';
  assert (select status from public.proforma_invoice where pi_id = v_pi) = 'sent', 'PI reopened after a doc generator void';
  perform public.link_generated_document(jsonb_build_object('kind','invoice','source_ref','docgen:invoice:S51/26-27/071',
    'site_id','51111111-0000-0000-0000-000000000002','number','S51/26-27/071','date','2026-10-21',
    'taxable',1000,'gst',180,'gst_type','cgst_sgst','gst_rate',18,'round_off',0,'gross',1180,'pi_id',v_pi));
  assert (select status from public.proforma_invoice where pi_id = v_pi) = 'converted_to_invoice', 'new invoice from the reopened PI';
end $$;
reset role;

-- a signed-in staff member cancelling in the tracker reopens it too
insert into public.proforma_invoice (pi_id, site_id, pi_number, pi_date, amount, status)
values ('99999999-0000-0000-0000-0000000000e1', '51111111-0000-0000-0000-000000000001', 'PI-R3', '2026-10-01', 118, 'sent');
select public.record_tax_invoice('51111111-0000-0000-0000-000000000001', null, null, '99999999-0000-0000-0000-0000000000e1', 'INV-R3', '2026-10-05', 100, 18, 118, null);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
update public.tax_invoice set status = 'cancelled' where invoice_number = 'INV-R3';
do $$ begin
  assert (select status from public.proforma_invoice where pi_id = '99999999-0000-0000-0000-0000000000e1') = 'sent', 'staff cancel reopens';
end $$;
reset role;
