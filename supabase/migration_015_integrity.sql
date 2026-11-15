-- ============================================================================
-- Studio5 migration 015 — integrity rules. Audit H3, H4, M9, M12, M17.
--
--  H3  Lowering an invoice or payment amount below what is already paid/matched
--      left it "over-settled". Now refused.
--  H4  PO and PI numbers are unique per site (ignoring case and spaces), so
--      Upload's "replace" can never hit the wrong record. Decision 0003.
--      The migration first checks for duplicates and STOPS, naming them, if any
--      exist (fix those rows first, then run again) — it never half-applies.
--  M17 A PI that has become a tax invoice stays converted and keeps its link.
--      (Releasing a retention hold needs no change: it already passes.)
--  +   fn_integrity used to run with the signed-in user's rights, so its sums
--      could not see matches/deductions hidden by the 1-Aug rule and could
--      under-count what is already settled. It now sees every row.
--  M9  Fixed search_path on the remaining functions.
--  M12 Indexes for Studio5 foreign keys that had none.
--
-- Safe to run again. Run after migration_014.
-- ROLLBACK: drop index uq_po_number_per_site, uq_pi_number_per_site;
--           re-run fn_integrity from migration_005.sql.
-- ============================================================================

begin;

-- H4 preflight: refuse (and say which) if duplicates exist today.
do $$
declare d text;
begin
  select string_agg(format('PO "%s" on site %s (%s times)', po_number, site_id, c), '; ') into d
  from (select site_id, min(po_number) as po_number, count(*) as c from public.purchase_order
        group by site_id, lower(btrim(po_number)) having count(*) > 1) x;
  if d is not null then raise exception 'migration_015: duplicate PO numbers must be fixed first: %', d; end if;
  select string_agg(format('PI "%s" on site %s (%s times)', pi_number, site_id, c), '; ') into d
  from (select site_id, min(pi_number) as pi_number, count(*) as c from public.proforma_invoice
        group by site_id, lower(btrim(pi_number)) having count(*) > 1) x;
  if d is not null then raise exception 'migration_015: duplicate PI numbers must be fixed first: %', d; end if;
end $$;
create unique index if not exists uq_po_number_per_site on public.purchase_order   (site_id, lower(btrim(po_number)));
create unique index if not exists uq_pi_number_per_site on public.proforma_invoice (site_id, lower(btrim(pi_number)));

-- Integrity trigger: same rules as migration_005, plus H3 and M17; sees all rows.
create or replace function public.fn_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_gross numeric; v_alloc numeric; v_ded numeric; v_amt numeric; v_pay_site uuid; v_inv_site uuid;
begin
  if tg_table_name in ('tax_invoice','proforma_invoice','purchase_order') then
    if tg_table_name <> 'purchase_order' and new.po_id is not null then
      select site_id into v_site from purchase_order where po_id = new.po_id;
      if v_site is distinct from new.site_id then raise exception 'That purchase order belongs to a different site.'; end if;
    end if;
    if new.sub_project_id is not null then
      select site_id into v_site from sub_project where sub_project_id = new.sub_project_id;
      if v_site is distinct from new.site_id then raise exception 'That sub-project belongs to a different site.'; end if;
    end if;
    -- H3: an invoice cannot drop below what is already paid + deducted.
    -- (nested ifs: PL/pgSQL may read new.<field> even when an earlier AND test is false)
    if tg_table_name = 'tax_invoice' and tg_op = 'UPDATE' then
      if new.gross_invoice_value < old.gross_invoice_value then
        select coalesce(sum(amount_allocated), 0) into v_alloc from payment_allocation where invoice_id = new.invoice_id;
        select coalesce(sum(amount), 0) into v_ded from deduction
          where invoice_id = new.invoice_id and not (deduction_type in ('retention','handover_hold') and status = 'released');
        if new.gross_invoice_value + 0.005 < v_alloc + v_ded then
          raise exception 'This invoice already has % paid or deducted against it, so its total cannot be lower than that. Remove a payment match or deduction first.', round(v_alloc + v_ded, 2);
        end if;
      end if;
    end if;
    -- M17: a converted PI stays converted and keeps its tax-invoice link.
    if tg_table_name = 'proforma_invoice' and tg_op = 'UPDATE' then
      if old.status = 'converted_to_invoice'
         and (new.status is distinct from old.status
              or (old.converted_invoice_id is not null and new.converted_invoice_id is distinct from old.converted_invoice_id)) then
        raise exception 'This proforma invoice has already become a tax invoice, so its status and link cannot be changed.';
      end if;
    end if;

  elsif tg_table_name = 'payment' then
    if new.po_id is not null then
      select site_id into v_site from purchase_order where po_id = new.po_id;
      if v_site is distinct from new.site_id then raise exception 'That purchase order belongs to a different site.'; end if;
    end if;
    -- H3: a payment cannot drop below what is already matched to invoices.
    if tg_op = 'UPDATE' then
     if new.amount_received < old.amount_received then
      select coalesce(sum(amount_allocated), 0) into v_alloc from payment_allocation where payment_id = new.payment_id;
      if new.amount_received + 0.005 < v_alloc then
        raise exception 'This payment is already matched to invoices for %, so its amount cannot be lower than that. Remove a match first.', round(v_alloc, 2);
      end if;
     end if;
    end if;

  elsif tg_table_name = 'payment_allocation' then
    select site_id, amount_received into v_pay_site, v_amt from payment where payment_id = new.payment_id;
    if new.invoice_id is not null then
      select site_id, gross_invoice_value into v_inv_site, v_gross from tax_invoice where invoice_id = new.invoice_id;
      if v_pay_site is distinct from v_inv_site then raise exception 'The payment and the invoice belong to different sites.'; end if;
      select coalesce(sum(amount_allocated),0) into v_alloc from payment_allocation
        where invoice_id = new.invoice_id and allocation_id is distinct from new.allocation_id;
      select coalesce(sum(amount),0) into v_ded from deduction
        where invoice_id = new.invoice_id and not (deduction_type in ('retention','handover_hold') and status = 'released');
      if v_alloc + v_ded + new.amount_allocated > v_gross + 0.005 then
        raise exception 'This is more than the invoice still needs. Only % is still open on it.', round(v_gross - v_alloc - v_ded, 2);
      end if;
    end if;
    select coalesce(sum(amount_allocated),0) into v_alloc from payment_allocation
      where payment_id = new.payment_id and allocation_id is distinct from new.allocation_id;
    if v_alloc + new.amount_allocated > v_amt + 0.005 then
      raise exception 'This is more than the payment amount. Only % of this payment is still unmatched.', round(v_amt - v_alloc, 2);
    end if;

  elsif tg_table_name = 'deduction' then
    if not (new.deduction_type in ('retention','handover_hold') and new.status = 'released') then
      select gross_invoice_value into v_gross from tax_invoice where invoice_id = new.invoice_id;
      select coalesce(sum(amount_allocated),0) into v_alloc from payment_allocation where invoice_id = new.invoice_id;
      select coalesce(sum(amount),0) into v_ded from deduction
        where invoice_id = new.invoice_id and deduction_id is distinct from new.deduction_id
          and not (deduction_type in ('retention','handover_hold') and status = 'released');
      if v_alloc + v_ded + new.amount > v_gross + 0.005 then
        raise exception 'This deduction is more than the invoice still needs. Only % is still open on it.', round(v_gross - v_alloc - v_ded, 2);
      end if;
    end if;
  end if;
  return new;
end $$;

-- fn_tally_lock must also see the whole queue, whoever is signed in.
alter function public.fn_tally_lock()          security definer;
alter function public.fn_tally_lock()          set search_path = public;
alter function public.fn_audit_log_immutable() set search_path = public;
alter function public.reporting_start()        set search_path = public;
alter function public.record_tax_invoice(uuid,uuid,uuid,uuid,text,date,numeric,numeric,numeric,uuid) set search_path = public;
alter function public.record_payment(uuid,uuid,date,numeric,payment_type,payment_mode,text,text,uuid,jsonb) set search_path = public;

-- Trigger functions are not API endpoints.
revoke execute on function public.fn_integrity()           from public, anon, authenticated;
revoke execute on function public.fn_tally_lock()          from public, anon, authenticated;
revoke execute on function public.fn_audit_log_immutable() from public, anon, authenticated;

-- M12: indexes for Studio5 foreign keys.
create index if not exists idx_pi_po                    on public.proforma_invoice (po_id);
create index if not exists idx_pi_subproject            on public.proforma_invoice (sub_project_id);
create index if not exists idx_pi_converted_invoice     on public.proforma_invoice (converted_invoice_id);
create index if not exists idx_pi_document              on public.proforma_invoice (document_id);
create index if not exists idx_invoice_pi               on public.tax_invoice (pi_id);
create index if not exists idx_invoice_document         on public.tax_invoice (document_id);
create index if not exists idx_po_document              on public.purchase_order (document_id);
create index if not exists idx_payment_document         on public.payment (document_id);
create index if not exists idx_deduction_document       on public.deduction (document_id);
create index if not exists idx_allocation_subproject    on public.payment_allocation (sub_project_id);
create index if not exists idx_allocation_created_by    on public.payment_allocation (created_by);
create index if not exists idx_progress_subproject      on public.physical_progress_log (sub_project_id);
create index if not exists idx_sync_triggered_by        on public.tally_sync_log (triggered_by);

commit;
