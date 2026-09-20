-- Sanity check (item 6): after entering the Lemon Tree Group data, this must total
-- normal_outstanding = 1201864.92 (₹12,01,864.92) as of 19 Sep 2026.
-- Retention/handover-hold is reported in its own column and is NOT part of that figure.
select
    c.display_name,
    sum(d.total_invoiced)         as invoiced,
    sum(d.total_collected)        as collected,
    sum(d.normal_outstanding)     as normal_outstanding,      -- expect 1201864.92 for Lemon Tree Group
    sum(d.retention_outstanding)  as retention_outstanding    -- separate, never merged
from v_site_dashboard d
join site s   on s.site_id = d.site_id
join client c on c.client_id = s.client_id
where c.display_name ilike 'Lemon Tree%'
group by c.display_name;

-- Trace to source rows: per-invoice gross, TDS/other deductions, allocations.
select ti.invoice_number,
       ti.gross_invoice_value,
       coalesce((select sum(amount) from deduction x where x.invoice_id = ti.invoice_id
                 and x.deduction_type not in ('retention','handover_hold')), 0) as deductions,
       coalesce((select sum(amount_allocated) from payment_allocation a where a.invoice_id = ti.invoice_id), 0) as allocated
from tax_invoice ti
join site s on s.site_id = ti.site_id
join client c on c.client_id = s.client_id
where c.display_name ilike 'Lemon Tree%'
order by ti.invoice_date;
