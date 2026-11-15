-- U4 / migration_015: integrity rules. Audit H3, H4, M9, M12, M17 (+ fn_integrity now sees hidden rows).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

-- H3: an invoice or payment cannot be lowered below what is already settled / matched.
do $$ begin
  -- INV-1 (₹1,18,000) has ₹1,00,000 matched.
  begin
    update public.tax_invoice set taxable_value = 80000, gst_amount = 14400, gross_invoice_value = 94400
     where invoice_number = 'INV-1';
    raise exception 'invoice lowered below what is already paid';
  exception when raise_exception then
    if sqlerrm = 'invoice lowered below what is already paid' then raise; end if;
  end;
  -- Payment UTR123 (₹1,00,000) is fully matched.
  begin
    update public.payment set amount_received = 60000 where utr_or_reference = 'UTR123';
    raise exception 'payment lowered below what is already matched';
  exception when raise_exception then
    if sqlerrm = 'payment lowered below what is already matched' then raise; end if;
  end;
  -- Raising them is still fine.
  update public.payment set amount_received = 120000 where utr_or_reference = 'UTR123';
end $$;

-- H4: PO and PI numbers are unique per site, ignoring case and spaces.
do $$ begin
  begin
    insert into public.purchase_order (site_id, po_number, po_date, total_value_with_gst)
    values ('51111111-0000-0000-0000-000000000001', ' po-x ', '2026-09-01', 1000);
    raise exception 'duplicate PO number accepted';
  exception when unique_violation then null;
  end;
  -- the same number on another site is fine
  insert into public.purchase_order (site_id, po_number, po_date, total_value_with_gst)
  values ('51111111-0000-0000-0000-000000000002', 'PO-X', '2026-09-01', 1000);
  insert into public.proforma_invoice (site_id, pi_number, pi_date, amount) values ('51111111-0000-0000-0000-000000000001', 'PI-1', '2026-09-01', 5000);
  begin
    insert into public.proforma_invoice (site_id, pi_number, pi_date, amount) values ('51111111-0000-0000-0000-000000000001', 'pi-1', '2026-09-02', 6000);
    raise exception 'duplicate PI number accepted';
  exception when unique_violation then null;
  end;
end $$;

-- M17: a PI that became a tax invoice stays converted and keeps its link.
do $$
declare v_pi uuid;
begin
  insert into public.proforma_invoice (site_id, pi_number, pi_date, amount, status, converted_invoice_id)
  values ('51111111-0000-0000-0000-000000000001', 'PI-CONV', '2026-09-01', 118000, 'converted_to_invoice', '11111111-0000-0000-0000-0000000000a1')
  returning pi_id into v_pi;
  begin
    update public.proforma_invoice set status = 'approved' where pi_id = v_pi;
    raise exception 'converted PI status changed';
  exception when raise_exception then
    if sqlerrm = 'converted PI status changed' then raise; end if;
  end;
  begin
    update public.proforma_invoice set converted_invoice_id = '11111111-0000-0000-0000-0000000000a2' where pi_id = v_pi;
    raise exception 'converted PI relinked';
  exception when raise_exception then
    if sqlerrm = 'converted PI relinked' then raise; end if;
  end;
  update public.proforma_invoice set remarks = 'note edits are fine' where pi_id = v_pi;
end $$;

-- A hold can be released (M2 groundwork) without tripping the integrity rules.
do $$
declare v_ded uuid;
begin
  insert into public.deduction (invoice_id, deduction_type, amount, deduction_date)
  values ('11111111-0000-0000-0000-0000000000a1', 'retention', 18000, '2026-09-01') returning deduction_id into v_ded;
  update public.deduction set status = 'released' where deduction_id = v_ded;
  assert (select status from public.deduction where deduction_id = v_ded) = 'released';
end $$;
reset role;

-- fn_integrity must count matches the signed-in user cannot see (pre-1 Aug rows).
-- INV-OLD (₹59,000, hidden) has ₹20,000 matched + ₹1,000 TDS. As postgres (sees all), lowering it below 21,000 must fail.
do $$ begin
  begin
    update public.tax_invoice set taxable_value = 10000, gst_amount = 1800, gross_invoice_value = 11800 where invoice_number = 'INV-OLD';
    raise exception 'hidden invoice lowered below settled';
  exception when raise_exception then
    if sqlerrm = 'hidden invoice lowered below settled' then raise; end if;
  end;
end $$;

-- M9 / M12: hardening checks.
do $$ begin
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('fn_audit_log_immutable','fn_integrity','fn_tally_lock','record_tax_invoice','record_payment','reporting_start')
            and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) = 0,
         'functions without a fixed search_path remain';
  assert (select prosecdef from pg_proc where proname = 'fn_integrity'), 'fn_integrity must see rows hidden from the user';
  assert to_regclass('public.idx_pi_po') is not null and to_regclass('public.idx_invoice_pi') is not null
     and to_regclass('public.idx_allocation_subproject') is not null, 'Studio5 foreign-key indexes missing';
end $$;
