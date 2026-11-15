-- ============================================================================
-- Studio5 migration 018 — a PI reopens when its tax invoice is cancelled.
-- Decision: .rea/decisions/0012-reopen-pi-on-invoice-cancel.md (owner: "yes, reopen the PI")
--
-- WHY  Cancelling a tax invoice made from a PI left the PI "converted to invoice" for good
--      (rule M17), so the corrected invoice could not be made from that PI.
-- WHAT
--  1. fn_integrity: M17 still keeps a converted PI converted, except when its tax invoice is cancelled.
--  2. A trigger on tax_invoice: when an invoice made from a PI is cancelled (in the tracker, or voided
--     in the doc generator), the PI goes back to "sent", its invoice link is cleared and the remarks
--     say why. Un-cancelling that invoice converts the PI again if it is still open.
--     The cancelled invoice keeps its pi_id as history.
-- HOW TO RUN  Paste into the SQL editor of studio5-portal and run once. Safe to run again. After 017.
-- ROLLBACK  drop trigger trg_reopen_pi on public.tax_invoice; drop function public.fn_reopen_pi();
--           then re-run the fn_integrity section of migration_015_integrity.sql.
-- ============================================================================

begin;

-- 1. Integrity rule (migration_015's function; only the M17 part changes) ----------
create or replace function public.fn_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_gross numeric; v_alloc numeric; v_ded numeric; v_amt numeric; v_pay_site uuid; v_inv_site uuid;
begin
  -- This function can see every row, so it must not answer people who are not staff (its error
  -- messages would reveal balances). The SQL editor / service role has no auth.uid() and passes.
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
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
    -- M17: a converted PI stays converted and keeps its tax-invoice link —
    -- unless that tax invoice was cancelled (decision 0012): then the PI may reopen.
    if tg_table_name = 'proforma_invoice' and tg_op = 'UPDATE' then
      if old.status = 'converted_to_invoice'
         and (new.status is distinct from old.status
              or (old.converted_invoice_id is not null and new.converted_invoice_id is distinct from old.converted_invoice_id)) then
        if not exists (select 1 from tax_invoice where invoice_id = old.converted_invoice_id and status = 'cancelled') then
          raise exception 'This proforma invoice has already become a tax invoice, so its status and link cannot be changed.';
        end if;
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



-- 2. Reopen / re-convert the PI when its invoice is cancelled / un-cancelled ---------
create or replace function public.fn_reopen_pi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if new.pi_id is null then return new; end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update proforma_invoice
       set status = 'sent', converted_invoice_id = null,
           remarks = left(concat_ws(' · ', remarks, 'Reopened: tax invoice ' || new.invoice_number || ' was cancelled'), 1000)
     where pi_id = new.pi_id and converted_invoice_id = new.invoice_id;
  elsif old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    update proforma_invoice set status = 'converted_to_invoice', converted_invoice_id = new.invoice_id
     where pi_id = new.pi_id and converted_invoice_id is null and status not in ('converted_to_invoice', 'cancelled');
  end if;
  return new;
end $$;
revoke execute on function public.fn_reopen_pi() from public, anon, authenticated;

drop trigger if exists trg_reopen_pi on public.tax_invoice;
create trigger trg_reopen_pi after update of status on public.tax_invoice
  for each row execute function public.fn_reopen_pi();

commit;
