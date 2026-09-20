-- ============================================================================
-- Studio5 migration 007 — atomic saves + TDS credit tracker.
-- Run after migration_006.sql (STEP B).
-- ============================================================================

-- 1. ATOMIC: save a tax invoice AND convert its proforma in one all-or-nothing step.
--    (Before, these were two separate calls; a network drop between them could leave an invoice saved but its PI still open.)
create or replace function record_tax_invoice(
    p_site_id uuid, p_sub_project_id uuid, p_po_id uuid, p_pi_id uuid,
    p_invoice_number text, p_invoice_date date,
    p_taxable numeric, p_gst numeric, p_gross numeric, p_document_id uuid
) returns uuid
language plpgsql as $$
declare v_id uuid; v_pi_site uuid;
begin
  if p_pi_id is not null then
    select site_id into v_pi_site from proforma_invoice where pi_id = p_pi_id;
    if v_pi_site is null then raise exception 'That proforma invoice does not exist.'; end if;
    if v_pi_site <> p_site_id then raise exception 'That proforma invoice belongs to a different site.'; end if;
  end if;

  insert into tax_invoice(site_id, sub_project_id, po_id, pi_id, invoice_number, invoice_date,
                          taxable_value, gst_amount, gross_invoice_value, document_id, status)
  values (p_site_id, p_sub_project_id, p_po_id, p_pi_id, trim(p_invoice_number), p_invoice_date,
          p_taxable, p_gst, p_gross, p_document_id, 'issued')
  returning invoice_id into v_id;

  if p_pi_id is not null then
    update proforma_invoice set status = 'converted_to_invoice', converted_invoice_id = v_id
    where pi_id = p_pi_id and status <> 'converted_to_invoice';
    if not found then raise exception 'That proforma invoice has already been converted to a tax invoice.'; end if;
  end if;
  return v_id;
end $$;

-- 2. ATOMIC: record a payment AND match it to invoices in one all-or-nothing step.
--    p_allocations = [{"invoice_id": "...", "amount": 123.45}, ...]  (may be empty: money not matched yet)
create or replace function record_payment(
    p_site_id uuid, p_po_id uuid, p_date date, p_amount numeric,
    p_type payment_type, p_mode payment_mode, p_reference text, p_remarks text,
    p_document_id uuid, p_allocations jsonb default '[]'::jsonb
) returns uuid
language plpgsql as $$
declare v_id uuid; a record;
begin
  insert into payment(site_id, po_id, payment_date, amount_received, payment_type, payment_mode,
                      utr_or_reference, remarks, document_id)
  values (p_site_id, p_po_id, p_date, p_amount, p_type, p_mode,
          nullif(trim(p_reference), ''), nullif(trim(p_remarks), ''), p_document_id)
  returning payment_id into v_id;

  for a in select (x->>'invoice_id')::uuid as invoice_id, (x->>'amount')::numeric as amount
           from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x loop
    if a.amount is null or a.amount <= 0 then raise exception 'Each amount matched to an invoice must be above zero.'; end if;
    insert into payment_allocation(payment_id, invoice_id, sub_project_id, amount_allocated)
    select v_id, a.invoice_id, sub_project_id, a.amount from tax_invoice where invoice_id = a.invoice_id;
    if not found then raise exception 'One of the invoices you matched no longer exists.'; end if;
  end loop;
  return v_id;
end $$;

revoke execute on function record_tax_invoice(uuid,uuid,uuid,uuid,text,date,numeric,numeric,numeric,uuid) from public, anon;
revoke execute on function record_payment(uuid,uuid,date,numeric,payment_type,payment_mode,text,text,uuid,jsonb) from public, anon;
grant  execute on function record_tax_invoice(uuid,uuid,uuid,uuid,text,date,numeric,numeric,numeric,uuid) to authenticated;
grant  execute on function record_payment(uuid,uuid,date,numeric,payment_type,payment_mode,text,text,uuid,jsonb) to authenticated;

-- 3. TDS CREDIT TRACKER ------------------------------------------------------
-- Tax deducted by a client is a tax CREDIT, not cash you will receive. Track it until it is claimed.
alter table deduction add column if not exists certificate_received_on date;   -- Form 16A / GST-TDS certificate received
alter table deduction add column if not exists credit_claimed_on date;         -- seen in Form 26AS / GST portal and claimed

-- The loaded TDS rows defaulted to the day they were entered; use the invoice date instead (a clearer, real date).
update deduction d set deduction_date = t.invoice_date
from tax_invoice t
where t.invoice_id = d.invoice_id and d.deduction_type in ('tds','gst_tds')
  and d.category_note like '1% TDS on taxable value%';

create or replace view v_tds_credit as
select
    d.deduction_id, d.deduction_type,
    case when d.deduction_type = 'tds' then 'Income-tax TDS (Form 26AS)' else 'GST-TDS (GST portal)' end as tax_kind,
    c.client_id, c.display_name as client_name, s.site_id, s.site_name,
    t.invoice_id, t.invoice_number, t.invoice_date, t.taxable_value,
    d.deduction_date, d.amount,
    round(d.amount / nullif(t.taxable_value, 0) * 100, 2) as rate_pct,
    case when extract(month from d.deduction_date) >= 4
         then extract(year from d.deduction_date)::int
         else extract(year from d.deduction_date)::int - 1 end as fy_start,
    d.certificate_reference, d.certificate_received_on, d.credit_claimed_on,
    case when d.credit_claimed_on is not null then 'claimed'
         when d.certificate_received_on is not null then 'certificate_received'
         else 'awaiting_certificate' end as credit_state
from deduction d
join tax_invoice t on t.invoice_id = d.invoice_id
join site s        on s.site_id = t.site_id
join client c      on c.client_id = s.client_id
where d.deduction_type in ('tds','gst_tds');
alter view v_tds_credit set (security_invoker = true);
revoke all on v_tds_credit from anon;
