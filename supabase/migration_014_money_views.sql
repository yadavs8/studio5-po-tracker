-- ============================================================================
-- Studio5 migration 014 — money totals: no double counting, cancelled invoices
-- do not count. Audit C2, C3.
--
-- C2  A payment tagged to PO X but matched to an invoice of PO Y was counted as
--     received on BOTH POs (and on the Account statement). Now:
--       received on a PO = money matched to that PO's invoices
--                        + the UNMATCHED part of payments tagged to that PO.
--     So the per-PO receipts always add up to what reached the bank. Money matched
--     to an invoice that was later cancelled still counts as received (everywhere).
-- C3  Cancelled and draft tax invoices were counted as billed and owed (and in
--     the 60-day chase list). They are now left out of every total; the invoice
--     itself still shows, with status "cancelled"/"draft" and nothing owing.
--
-- Every view keeps exactly the same columns in the same order, so the pages and
-- the views built on top (v_site_dashboard, v_data_health, v_todo…) keep working.
-- Safe to run again. Run after migration_013.
-- ROLLBACK (in this order, in one transaction): the create-or-replace view blocks for
-- v_invoice_settlement and v_normal_outstanding from migration_003.sql, v_retention_outstanding
-- from studio5_schema.sql, v_site_dashboard from migration_002.sql, v_po_summary from
-- migration_004.sql; then `alter view … set (security_invoker = true)` on each. Column lists
-- are unchanged, so the dependent views need nothing.
-- ============================================================================

begin;

-- Per-invoice settlement. Cancelled/draft: still listed, but owe nothing.
create or replace view public.v_invoice_settlement with (security_invoker = true) as
select
    ti.invoice_id,
    ti.site_id,
    ti.sub_project_id,
    ti.invoice_number,
    ti.gross_invoice_value,
    coalesce(alloc.total_allocated, 0)      as total_payments_allocated,
    coalesce(ded.total_deducted, 0)         as total_deducted,
    coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) as total_settled,
    case when ti.status in ('cancelled', 'draft') then 0
         else ti.gross_invoice_value - (coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0))
    end as remaining_balance,
    case
        when ti.status in ('cancelled', 'draft') then ti.status::text
        when coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) >= ti.gross_invoice_value
            then 'fully_settled'
        when coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) > 0
            then 'partially_settled'
        else 'issued'
    end as computed_status
from public.tax_invoice ti
left join (
    select invoice_id, sum(amount_allocated) as total_allocated
    from public.payment_allocation group by invoice_id
) alloc on alloc.invoice_id = ti.invoice_id
left join (
    select invoice_id, sum(amount) as total_deducted
    from public.deduction
    where not (deduction_type in ('retention','handover_hold') and status = 'released')
    group by invoice_id
) ded on ded.invoice_id = ti.invoice_id;

-- Per-site billed / collected / outstanding. Billed and outstanding: only invoices that count.
-- Collected: every rupee matched to this site's invoices — money matched to an invoice that was
-- later cancelled is still money received (same rule as v_po_summary and the statement).
create or replace view public.v_normal_outstanding with (security_invoker = true) as
with live as (
    select ti.site_id,
        sum(ti.gross_invoice_value) as total_invoiced,
        sum(coalesce(alloc.total_allocated, 0)) as live_collected,
        sum(coalesce(ded.total_deducted, 0)) as total_other_deductions
    from public.tax_invoice ti
    left join (
        select invoice_id, sum(amount_allocated) as total_allocated
        from public.payment_allocation group by invoice_id
    ) alloc on alloc.invoice_id = ti.invoice_id
    left join (
        select invoice_id, sum(amount) as total_deducted
        from public.deduction
        where not (deduction_type in ('retention','handover_hold') and status = 'released')
        group by invoice_id
    ) ded on ded.invoice_id = ti.invoice_id
    where ti.status not in ('cancelled', 'draft')
    group by ti.site_id
),
collected as (
    select ti.site_id, sum(pa.amount_allocated) as total_collected
    from public.payment_allocation pa join public.tax_invoice ti on ti.invoice_id = pa.invoice_id
    group by ti.site_id
)
select coalesce(l.site_id, c.site_id) as site_id,
    coalesce(l.total_invoiced, 0) as total_invoiced,
    coalesce(c.total_collected, 0) as total_collected,
    coalesce(l.total_other_deductions, 0) as total_other_deductions,
    coalesce(l.total_invoiced, 0) - coalesce(l.live_collected, 0) - coalesce(l.total_other_deductions, 0) as normal_outstanding
from live l full join collected c on c.site_id = l.site_id;

create or replace view public.v_retention_outstanding with (security_invoker = true) as
select ti.site_id,
    sum(d.amount) filter (where d.status = 'pending') as retention_outstanding
from public.deduction d
join public.tax_invoice ti on ti.invoice_id = d.invoice_id
where d.deduction_type in ('retention', 'handover_hold')
  and ti.status not in ('cancelled', 'draft')
group by ti.site_id;

create or replace view public.v_site_dashboard with (security_invoker = true) as
select s.site_id,
    s.site_name,
    c.display_name as client_name,
    coalesce(po_sum.total_po_value, 0) as current_contract_value,
    coalesce(inv_sum.total_invoiced, 0) as total_invoiced,
    coalesce(no.total_collected, 0) as total_collected,
    coalesce(no.normal_outstanding, 0) as normal_outstanding,
    coalesce(ro.retention_outstanding, 0) as retention_outstanding,
    coalesce(ab.advance_balance, 0) as advance_balance,
    case when coalesce(po_sum.total_po_value, 0) > 0
         then round(coalesce(inv_sum.total_invoiced, 0) / po_sum.total_po_value * 100, 2)
         else null end as billing_progress_pct,
    pp.physical_progress_pct,
    pp.physical_progress_date
from public.site s
join public.client c on c.client_id = s.client_id
left join (select site_id, sum(total_value_with_gst) as total_po_value
           from public.purchase_order group by site_id) po_sum on po_sum.site_id = s.site_id
left join (select site_id, sum(gross_invoice_value) as total_invoiced
           from public.tax_invoice where status not in ('cancelled', 'draft')
           group by site_id) inv_sum on inv_sum.site_id = s.site_id
left join public.v_normal_outstanding no on no.site_id = s.site_id
left join public.v_retention_outstanding ro on ro.site_id = s.site_id
left join public.v_advance_balance ab on ab.site_id = s.site_id
left join public.v_latest_physical_progress pp on pp.site_id = s.site_id;

create or replace view public.v_po_summary with (security_invoker = true) as
with live_inv as (   -- invoices that count
    select * from public.tax_invoice where status not in ('cancelled', 'draft')
),
inv as (
    select po_id, count(*) as invoice_count, sum(gross_invoice_value) as invoiced
    from live_inv where po_id is not null group by po_id
),
pis as (
    select po_id, count(*) as pi_count, sum(amount) as pi_total
    from public.proforma_invoice where po_id is not null group by po_id
),
pay_alloc as (       -- how much of each payment is matched to any invoice
    select payment_id, sum(amount_allocated) as allocated
    from public.payment_allocation group by payment_id
),
tag as (             -- the UNMATCHED part of payments tagged to the PO (advances etc.)
    select p.po_id, sum(greatest(p.amount_received - coalesce(pa.allocated, 0), 0)) as tagged_unmatched
    from public.payment p left join pay_alloc pa on pa.payment_id = p.payment_id
    where p.po_id is not null group by p.po_id
),
al_received as (     -- money matched to this PO's invoices, whichever PO the payment was tagged to
    select ti.po_id, sum(pa.amount_allocated) as matched
    from public.payment_allocation pa
    join public.tax_invoice ti on ti.invoice_id = pa.invoice_id
    where ti.po_id is not null group by ti.po_id
),
al_live as (         -- matched to this PO's invoices that count (for what is still owed)
    select ti.po_id, sum(pa.amount_allocated) as alloc_all
    from public.payment_allocation pa
    join live_inv ti on ti.invoice_id = pa.invoice_id
    where ti.po_id is not null group by ti.po_id
),
ded as (
    select ti.po_id,
           sum(d.amount) filter (where d.deduction_type not in ('retention','handover_hold')) as other_ded,
           sum(d.amount) filter (where d.deduction_type in ('retention','handover_hold') and d.status = 'pending') as hold_pending,
           sum(d.amount) filter (where not (d.deduction_type in ('retention','handover_hold') and d.status = 'released')) as ded_active
    from public.deduction d join live_inv ti on ti.invoice_id = d.invoice_id
    where ti.po_id is not null group by ti.po_id
)
select
    po.po_id, po.site_id, po.sub_project_id, po.po_number, po.po_date,
    po.scope_description, po.status, po.document_id,
    po.total_value_with_gst                                         as po_value,
    coalesce(pis.pi_count, 0)                                       as pi_count,
    coalesce(pis.pi_total, 0)                                       as pi_total,
    coalesce(inv.invoice_count, 0)                                  as invoice_count,
    coalesce(inv.invoiced, 0)                                       as invoiced,
    coalesce(al_received.matched, 0) + coalesce(tag.tagged_unmatched, 0) as received_bank,
    coalesce(ded.other_ded, 0)                                      as tds_and_other_deductions,
    coalesce(ded.hold_pending, 0)                                   as retention_pending,
    po.total_value_with_gst - coalesce(inv.invoiced, 0)             as yet_to_invoice,
    coalesce(inv.invoiced, 0) - coalesce(al_live.alloc_all, 0) - coalesce(ded.ded_active, 0) as invoice_outstanding,
    po.total_value_with_gst - (coalesce(al_received.matched, 0) + coalesce(tag.tagged_unmatched, 0)) - coalesce(ded.other_ded, 0) as balance_against_po
from public.purchase_order po
left join inv         on inv.po_id         = po.po_id
left join pis         on pis.po_id         = po.po_id
left join tag         on tag.po_id         = po.po_id
left join al_received on al_received.po_id = po.po_id
left join al_live     on al_live.po_id     = po.po_id
left join ded         on ded.po_id         = po.po_id;

revoke all on public.v_invoice_settlement, public.v_normal_outstanding, public.v_retention_outstanding,
              public.v_site_dashboard, public.v_po_summary from anon;

commit;
