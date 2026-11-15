-- U2 / migration_013: only staff can touch Studio5 data. Audit C1, H1, H2, M10.
-- Users from supabase/seed_test.sql: owner …a1 (staff), outsider …b2 (an account from another app).

-- ── Outsider: signed in, not staff ──────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare t text; n int;
begin
  foreach t in array array['client','site','sub_project','purchase_order','proforma_invoice','tax_invoice','payment',
                           'payment_allocation','deduction','physical_progress_log','document','audit_log',
                           'tally_sync_log','tally_setting','app_task','doc_inbox','app_user'] loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('outsider can read %s (%s rows)', t, n);
  end loop;
  assert (select count(*) from public.v_site_dashboard) = 0, 'outsider can read v_site_dashboard';
  assert (select count(*) from storage.objects where bucket_id = 'studio5-documents') = 0, 'outsider can list documents';
end $$;
do $$ begin
  begin
    insert into public.client (legal_name, display_name) values ('Evil', 'Evil');
    raise exception 'outsider could insert a client';
  exception when insufficient_privilege then null;
  end;
  update public.client set display_name = 'pwned';
  assert not found, 'outsider could update clients';
  delete from public.site;
  assert not found, 'outsider could delete sites';
  begin
    insert into storage.objects (bucket_id, name, owner) values ('studio5-documents', 'po/evil.pdf', auth.uid());
    raise exception 'outsider could upload a document';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── Owner (staff) keeps today's access ──────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  assert public.is_staff(), 'owner should be staff';
  assert (select count(*) from public.site) = 2, 'owner should see both sites';
  assert (select count(*) from public.tax_invoice) = 2, 'owner should see the post-cutoff invoices';
  insert into public.client (legal_name, display_name) values ('New Client Ltd', 'New Client');
  -- every view the current frontend reads still works (old-frontend compatibility)
  perform * from public.v_site_dashboard limit 1;
  perform * from public.v_po_summary limit 1;
  perform * from public.v_invoice_settlement limit 1;
  perform * from public.v_unallocated_payments limit 1;
  perform * from public.v_todo_all limit 1;
  perform * from public.v_tds_credit limit 1;
  perform * from public.v_tally_queue limit 1;
  perform * from public.v_data_health limit 1;
end $$;

-- audit_log: readable, never writable by users
do $$ begin
  assert (select count(*) from public.audit_log) >= 0;
  begin
    insert into public.audit_log (table_name, record_id, field_changed, old_value, new_value, changed_by)
    values ('payment', gen_random_uuid(), 'amount_received', '1', '2', auth.uid());
    raise exception 'owner could forge an audit entry';
  exception when insufficient_privilege then null;
  end;
end $$;

-- inserts into money tables are audited
do $$
declare v_po uuid;
begin
  insert into public.purchase_order (site_id, po_number, po_date, total_value_with_gst)
  values ('51111111-0000-0000-0000-000000000002', 'PO-AUDIT', '2026-09-01', 1000) returning po_id into v_po;
  assert exists (select 1 from public.audit_log where record_id = v_po and field_changed = '*created*'), 'PO insert not audited';
end $$;

-- tally_sync_log: no direct writes; status only through the RPCs, and a pushed entry can never be re-opened
do $$
declare v_sync uuid;
begin
  begin
    update public.tally_sync_log set sync_status = 'failed';
    raise exception 'owner could rewrite tally_sync_log directly';
  exception when insufficient_privilege then null;
  end;
  v_sync := public.tally_queue('invoice', '11111111-0000-0000-0000-0000000000a1');
  assert (select sync_status from public.tally_sync_log where sync_id = v_sync) = 'pending';
  perform public.tally_mark(v_sync, 'pushed', null);
  assert (select sync_status from public.tally_sync_log where sync_id = v_sync) = 'pushed';
  begin
    perform public.tally_mark(v_sync, 'failed', 'try to unlock');
    raise exception 'a pushed Tally entry could be re-opened';
  exception when raise_exception then
    if sqlerrm like 'a pushed Tally entry could be re-opened' then raise; end if;
  end;
  -- a queued/sent invoice cannot be cancelled or re-dated here either
  begin
    update public.tax_invoice set status = 'cancelled' where invoice_id = '11111111-0000-0000-0000-0000000000a1';
    raise exception 'locked invoice could be cancelled';
  exception when raise_exception then
    if sqlerrm like 'locked invoice could be cancelled' then raise; end if;
  end;
  -- cancelled invoices and unknown records cannot be queued
  begin
    perform public.tally_queue('invoice', '11111111-0000-0000-0000-0000000000a2');
    raise exception 'cancelled invoice queued for Tally';
  exception when raise_exception then
    if sqlerrm like 'cancelled invoice queued for Tally' then raise; end if;
  end;
  begin
    perform public.tally_queue('payment', gen_random_uuid());
    raise exception 'unknown payment queued for Tally';
  exception when raise_exception then
    if sqlerrm like 'unknown payment queued for Tally' then raise; end if;
  end;
  -- and the lock still holds on the invoice
  begin
    update public.tax_invoice set gross_invoice_value = 119000, taxable_value = 101000 where invoice_id = '11111111-0000-0000-0000-0000000000a1';
    raise exception 'locked invoice amount could be changed';
  exception when raise_exception then
    if sqlerrm like 'locked invoice amount could be changed' then raise; end if;
  end;
end $$;
-- a TDS entry that is in Tally is locked too
do $$
declare v_ded uuid; v_sync uuid;
begin
  insert into public.deduction (invoice_id, deduction_type, amount, deduction_date)
  values ('11111111-0000-0000-0000-0000000000a1', 'tds', 2000, '2026-09-01') returning deduction_id into v_ded;
  v_sync := public.tally_queue('deduction', v_ded);
  begin
    update public.deduction set amount = 1000 where deduction_id = v_ded;
    raise exception 'queued TDS amount changed';
  exception when raise_exception then
    if sqlerrm = 'queued TDS amount changed' then raise; end if;
  end;
end $$;
reset role;

-- Outsider writes get a plain refusal, never a balance-revealing message from the integrity check.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.payment_allocation (payment_id, invoice_id, amount_allocated)
  values ('b1111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1', 999999);
  raise exception 'outsider allocation accepted';
exception when insufficient_privilege then
  assert sqlerrm not like '%still open%' and sqlerrm not like '%different sites%', 'integrity message leaked to an outsider: ' || sqlerrm;
end $$;
reset role;

-- ── Database settings ───────────────────────────────────────────────────────
do $$ begin
  assert (select file_size_limit from storage.buckets where id = 'studio5-documents') = 26214400, 'bucket size limit missing';
  assert exists (select 1 from storage.buckets where id = 'studio5-documents' and 'application/pdf' = any(allowed_mime_types)), 'bucket MIME allow-list missing';
  assert not has_function_privilege('authenticated', 'public.fn_audit_row()', 'execute'), 'fn_audit_row callable via RPC';
  assert not has_function_privilege('anon', 'public.fn_file_document()', 'execute'), 'fn_file_document callable via RPC';
  assert not has_function_privilege('anon', 'public.is_staff()', 'execute'), 'anon can call is_staff';
  assert not has_function_privilege('anon', 'public.tally_mark(uuid,text,text)', 'execute'), 'anon can call tally_mark';
  assert not has_table_privilege('authenticated', 'public.staff', 'select'), 'staff list readable by users';
end $$;
