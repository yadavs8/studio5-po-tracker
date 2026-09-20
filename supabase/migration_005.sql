-- ============================================================================
-- Studio5 migration 005 — data-quality guardrails + Data Health view.
-- Run after migration_004.sql.
-- Rule of thumb: bad data is REFUSED at the database, in plain English, so it
-- cannot get in from any page.
-- ============================================================================

-- 1. Amounts must make sense -------------------------------------------------
alter table purchase_order   add constraint chk_po_total_pos    check (total_value_with_gst > 0);
alter table proforma_invoice add constraint chk_pi_amount_pos   check (amount > 0);
alter table tax_invoice      add constraint chk_inv_gross_pos   check (gross_invoice_value > 0);
alter table tax_invoice      add constraint chk_inv_taxable_pos check (taxable_value > 0);
alter table tax_invoice      add constraint chk_inv_gst_adds_up check (gst_amount is null or abs(taxable_value + gst_amount - gross_invoice_value) <= 0.05);
alter table payment          add constraint chk_pay_amount_pos  check (amount_received > 0);
alter table deduction        add constraint chk_ded_amount_pos  check (amount > 0);

-- 2. Cross-checks: everything must belong to the same site; nothing over-settled
create or replace function fn_integrity() returns trigger language plpgsql as $$
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

  elsif tg_table_name = 'payment' then
    if new.po_id is not null then
      select site_id into v_site from purchase_order where po_id = new.po_id;
      if v_site is distinct from new.site_id then raise exception 'That purchase order belongs to a different site.'; end if;
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

drop trigger if exists trg_integrity on tax_invoice;
drop trigger if exists trg_integrity on proforma_invoice;
drop trigger if exists trg_integrity on purchase_order;
drop trigger if exists trg_integrity on payment;
drop trigger if exists trg_integrity on payment_allocation;
drop trigger if exists trg_integrity on deduction;
create trigger trg_integrity before insert or update on tax_invoice        for each row execute function fn_integrity();
create trigger trg_integrity before insert or update on proforma_invoice   for each row execute function fn_integrity();
create trigger trg_integrity before insert or update on purchase_order     for each row execute function fn_integrity();
create trigger trg_integrity before insert or update on payment            for each row execute function fn_integrity();
create trigger trg_integrity before insert or update on payment_allocation for each row execute function fn_integrity();
create trigger trg_integrity before insert or update on deduction          for each row execute function fn_integrity();

-- 3. Data Health: everything that looks unclear, missing or wrong — computed live
create or replace view v_data_health as
select 'fix'::text as severity, 'payment_unmatched'::text as code, p.site_id, s.site_name, 'Payments'::text as area,
       'Money received but not matched to any invoice'::text as message,
       ('Received ' || to_char(p.payment_date,'DD Mon YYYY') || coalesce(' (' || nullif(p.utr_or_reference,'') || ')',''))::text as detail,
       'Payments page → Allocate, and pick the invoice(s) this money paid for.'::text as hint,
       u.unallocated_amount as amount, 1 as item_count
from v_unallocated_payments u join payment p on p.payment_id = u.payment_id join site s on s.site_id = p.site_id
where p.payment_type <> 'advance'
union all
select 'check', 'advance_no_po', p.site_id, s.site_name, 'Payments',
       'Advance received but not tied to a purchase order',
       'Received ' || to_char(p.payment_date,'DD Mon YYYY') || coalesce(' (' || nullif(p.utr_or_reference,'') || ')',''),
       'Tell us which PO this advance is for (Payments page).', u.unallocated_amount, 1
from v_unallocated_payments u join payment p on p.payment_id = u.payment_id join site s on s.site_id = p.site_id
where p.payment_type = 'advance' and p.po_id is null
union all
select 'fix', 'placeholder_date', p.site_id, s.site_name, 'Payments',
       'This payment has a temporary date — the real date was not in the source file',
       'Amount received ' || to_char(p.payment_date,'DD Mon YYYY') || ' (placeholder)' , 'Find the bank entry and correct the date.', p.amount_received, 1
from payment p join site s on s.site_id = p.site_id where p.remarks ilike '%DATE NOT IN SOURCE%'
union all
select 'fix', 'po_overbilled', v.site_id, s.site_name, 'Purchase orders',
       'Invoices add up to MORE than the purchase order',
       'PO ' || v.po_number, 'Check for a duplicate invoice, or record the extra work as a new PO / variation.', v.invoiced - v.po_value, 1
from v_po_summary v join site s on s.site_id = v.site_id where v.invoiced > v.po_value + 0.5
union all
select 'fix', 'po_overreceived', v.site_id, s.site_name, 'Purchase orders',
       'More money received than the purchase order value',
       'PO ' || v.po_number, 'Check that receipts are tagged to the right PO.', v.received_bank - v.po_value, 1
from v_po_summary v join site s on s.site_id = v.site_id where v.received_bank > v.po_value + 0.5
union all
select 'fix', 'invoice_overpaid', i.site_id, s.site_name, 'Invoices',
       'An invoice has been settled for more than its amount',
       'Invoice ' || i.invoice_number, 'Review the payments matched to this invoice.', -i.remaining_balance, 1
from v_invoice_settlement i join site s on s.site_id = i.site_id where i.remaining_balance < -0.5
union all
select 'check', 'invoice_no_file', t.site_id, s.site_name, 'Invoices',
       'Tax invoices with no file attached', count(*) || ' invoice(s) have no PDF/scan uploaded',
       'Open each invoice and attach the file.', null::numeric, count(*)::int
from tax_invoice t join site s on s.site_id = t.site_id
where t.document_id is null and t.invoice_number not like 'LEDGER-%' group by t.site_id, s.site_name
union all
select 'check', 'po_no_file', o.site_id, s.site_name, 'Purchase orders',
       'Purchase orders with no file attached', count(*) || ' PO(s) have no PDF/scan uploaded',
       'Attach the signed PO from the client.', null::numeric, count(*)::int
from purchase_order o join site s on s.site_id = o.site_id where o.document_id is null group by o.site_id, s.site_name
union all
select 'check', 'pi_no_file', x.site_id, s.site_name, 'Proforma invoices',
       'Proforma invoices with no file attached', count(*) || ' PI(s) have no PDF/scan uploaded',
       'Attach the PI that was sent to the client.', null::numeric, count(*)::int
from proforma_invoice x join site s on s.site_id = x.site_id where x.document_id is null group by x.site_id, s.site_name
union all
select 'check', 'invoice_no_po', t.site_id, s.site_name, 'Invoices',
       'Tax invoices not linked to a purchase order', count(*) || ' invoice(s) are not tied to any PO',
       'Add the PO, then link the invoice to it.', null::numeric, count(*)::int
from tax_invoice t join site s on s.site_id = t.site_id
where t.po_id is null and t.invoice_number not like 'LEDGER-%' group by t.site_id, s.site_name
union all
select 'check', 'pi_not_converted', x.site_id, s.site_name, 'Proforma invoices',
       'Client approved the PI but no tax invoice was raised', 'PI ' || x.pi_number,
       'Raise the tax invoice and link this PI.', x.amount, 1
from proforma_invoice x join site s on s.site_id = x.site_id where x.status = 'approved'
union all
select 'check', 'no_progress', o.site_id, s.site_name, 'Work progress',
       'No work progress has been logged for this site', 'The site has purchase orders but no progress entry',
       'Master Data → select the site → Log Progress.', null::numeric, 1
from (select distinct site_id from purchase_order) o join site s on s.site_id = o.site_id
where not exists (select 1 from physical_progress_log l where l.site_id = o.site_id);

alter view v_data_health set (security_invoker = true);
revoke all on v_data_health from anon;
