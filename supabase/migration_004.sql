-- ============================================================================
-- Studio5 migration 004 — PO-centric tracking.
-- 1. payment.po_id: money received (esp. advances) can be tagged to the PO it is for.
-- 2. v_po_summary: one row per PO -> PIs, tax invoices, bank receipts, balances.
-- Run after migration_003.sql.
-- ============================================================================
alter table payment add column if not exists po_id uuid references purchase_order(po_id);
create index if not exists idx_payment_po on payment(po_id);

create or replace view v_po_summary as
with inv as (
    select po_id, count(*) as invoice_count, sum(gross_invoice_value) as invoiced
    from tax_invoice where po_id is not null group by po_id
),
pis as (
    select po_id, count(*) as pi_count, sum(amount) as pi_total
    from proforma_invoice where po_id is not null group by po_id
),
tag as (   -- payments explicitly tagged to the PO (advances etc.)
    select po_id, sum(amount_received) as tagged
    from payment where po_id is not null group by po_id
),
al as (    -- allocations against this PO's invoices; "other" = from payments not tagged to this PO
    select ti.po_id,
           sum(pa.amount_allocated) as alloc_all,
           sum(pa.amount_allocated) filter (where p.po_id is distinct from ti.po_id) as alloc_other
    from payment_allocation pa
    join tax_invoice ti on ti.invoice_id = pa.invoice_id
    join payment p on p.payment_id = pa.payment_id
    where ti.po_id is not null group by ti.po_id
),
ded as (
    select ti.po_id,
           sum(d.amount) filter (where d.deduction_type not in ('retention','handover_hold')) as other_ded,
           sum(d.amount) filter (where d.deduction_type in ('retention','handover_hold') and d.status = 'pending') as hold_pending,
           sum(d.amount) filter (where not (d.deduction_type in ('retention','handover_hold') and d.status = 'released')) as ded_active
    from deduction d join tax_invoice ti on ti.invoice_id = d.invoice_id
    where ti.po_id is not null group by ti.po_id
)
select
    po.po_id, po.site_id, po.sub_project_id, po.po_number, po.po_date,
    po.scope_description, po.status, po.document_id,
    po.total_value_with_gst                                   as po_value,
    coalesce(pis.pi_count, 0)                                 as pi_count,
    coalesce(pis.pi_total, 0)                                 as pi_total,
    coalesce(inv.invoice_count, 0)                            as invoice_count,
    coalesce(inv.invoiced, 0)                                 as invoiced,
    coalesce(tag.tagged, 0) + coalesce(al.alloc_other, 0)     as received_bank,
    coalesce(ded.other_ded, 0)                                as tds_and_other_deductions,
    coalesce(ded.hold_pending, 0)                             as retention_pending,
    po.total_value_with_gst - coalesce(inv.invoiced, 0)       as yet_to_invoice,
    coalesce(inv.invoiced, 0) - coalesce(al.alloc_all, 0) - coalesce(ded.ded_active, 0) as invoice_outstanding,
    po.total_value_with_gst - (coalesce(tag.tagged, 0) + coalesce(al.alloc_other, 0)) - coalesce(ded.other_ded, 0) as balance_against_po
from purchase_order po
left join inv  on inv.po_id  = po.po_id
left join pis  on pis.po_id  = po.po_id
left join tag  on tag.po_id  = po.po_id
left join al   on al.po_id   = po.po_id
left join ded  on ded.po_id  = po.po_id;

alter view v_po_summary set (security_invoker = true);
revoke all on v_po_summary from anon;
