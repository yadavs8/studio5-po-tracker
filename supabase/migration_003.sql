-- ============================================================================
-- Studio5 migration 003 — fixes two bugs in the calculation views, found when
-- real data was loaded. Run after migration_002.sql.
--
-- 1. v_advance_balance joined payment -> allocation BEFORE summing, so a payment
--    allocated to N invoices was counted N times (advance_balance inflated).
--    Data Dictionary rule 6: advance balance = advances received - allocations of them.
-- 2. v_normal_outstanding left pending retention / handover-hold inside "normal
--    outstanding" while v_retention_outstanding reported it again (double count).
--    Data Dictionary rules 3 & 5: an invoice with a hold is settled, and the hold is
--    reported separately, never merged. A released hold is excluded here because
--    its release payment is already an allocation.
-- Column names/types are unchanged, so the app needs no change.
-- ============================================================================

create or replace view v_advance_balance as
select
    p.site_id,
    sum(p.amount_received) filter (where p.payment_type = 'advance') as total_advance_received,
    sum(coalesce(a.amt, 0)) filter (where p.payment_type = 'advance') as total_advance_allocated,
    sum(p.amount_received) filter (where p.payment_type = 'advance')
        - coalesce(sum(coalesce(a.amt, 0)) filter (where p.payment_type = 'advance'), 0) as advance_balance
from payment p
left join (
    select payment_id, sum(amount_allocated) as amt
    from payment_allocation
    group by payment_id
) a on a.payment_id = p.payment_id
group by p.site_id;

create or replace view v_normal_outstanding as
select
    ti.site_id,
    sum(ti.gross_invoice_value) as total_invoiced,
    sum(coalesce(alloc.total_allocated, 0)) as total_collected,
    sum(coalesce(ded.total_deducted, 0)) as total_other_deductions,
    sum(ti.gross_invoice_value)
        - sum(coalesce(alloc.total_allocated, 0))
        - sum(coalesce(ded.total_deducted, 0)) as normal_outstanding
from tax_invoice ti
left join (
    select invoice_id, sum(amount_allocated) as total_allocated
    from payment_allocation
    group by invoice_id
) alloc on alloc.invoice_id = ti.invoice_id
left join (
    -- TDS/penalty/etc, plus retention/holds that are still pending or written off.
    -- (Pending holds surface in v_retention_outstanding instead.)
    select invoice_id, sum(amount) as total_deducted
    from deduction
    where not (deduction_type in ('retention','handover_hold') and status = 'released')
    group by invoice_id
) ded on ded.invoice_id = ti.invoice_id
group by ti.site_id;

-- Same released-hold rule for the per-invoice settlement view, so a released hold is
-- not counted twice (once as the deduction, once as the release-payment allocation).
create or replace view v_invoice_settlement as
select
    ti.invoice_id,
    ti.site_id,
    ti.sub_project_id,
    ti.invoice_number,
    ti.gross_invoice_value,
    coalesce(alloc.total_allocated, 0)      as total_payments_allocated,
    coalesce(ded.total_deducted, 0)         as total_deducted,
    coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) as total_settled,
    ti.gross_invoice_value - (coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0)) as remaining_balance,
    case
        when coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) >= ti.gross_invoice_value
            then 'fully_settled'
        when coalesce(alloc.total_allocated, 0) + coalesce(ded.total_deducted, 0) > 0
            then 'partially_settled'
        else 'issued'
    end as computed_status
from tax_invoice ti
left join (
    select invoice_id, sum(amount_allocated) as total_allocated
    from payment_allocation
    group by invoice_id
) alloc on alloc.invoice_id = ti.invoice_id
left join (
    select invoice_id, sum(amount) as total_deducted
    from deduction
    where not (deduction_type in ('retention','handover_hold') and status = 'released')
    group by invoice_id
) ded on ded.invoice_id = ti.invoice_id;

alter view v_advance_balance    set (security_invoker = true);
alter view v_normal_outstanding set (security_invoker = true);
alter view v_invoice_settlement set (security_invoker = true);
revoke all on v_advance_balance, v_normal_outstanding, v_invoice_settlement from anon;
