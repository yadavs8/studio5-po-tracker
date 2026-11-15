-- ============================================================================
-- Studio5 migration 016 — money still owed on work before 1 Aug ("brought forward").
-- Audit C4. Decision: .rea/decisions/0002-brought-forward-summary.md
--
-- migration_011 hides every record dated before reporting_start() from signed-in
-- users. That stays. But money still owed on that older work vanished from every
-- total (in production most invoices and payments are older). This adds one
-- function that returns per-site TOTALS ONLY for that older work — never the rows —
-- and only to Studio5 staff. The Reports and Account statement "Brought forward"
-- lines read it.
--
-- Figures (same cash-ledger rule the app already used):
--   billed          tax invoices before the start (cancelled / draft left out)
--   received        money received before the start, except money tagged to a PO dated from the start
--   tax             TDS and other non-hold deductions on those older invoices
--   held            retention / handover holds still pending on them
--   received_since  later payments matched to those older invoices
--   balance         billed − received − tax − received_since
--
-- Safe to run again. Run after migration_015.
-- ROLLBACK: drop function public.brought_forward(uuid);
-- ============================================================================

begin;

create or replace function public.brought_forward(p_site_id uuid default null)
returns table (site_id uuid, billed numeric, received numeric, tax numeric, held numeric, received_since numeric, balance numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Only Studio5 staff can see these figures.' using errcode = '42501';
  end if;
  return query
  with old_inv as (
    select i.invoice_id, i.site_id, i.gross_invoice_value
    from tax_invoice i
    where i.invoice_date < reporting_start() and i.status not in ('cancelled', 'draft')
      and (p_site_id is null or i.site_id = p_site_id)
  ),
  new_po as (select po_id from purchase_order where po_date >= reporting_start()),
  b as (select o.site_id, sum(o.gross_invoice_value) as v from old_inv o group by o.site_id),
  r as (
    select p.site_id, sum(p.amount_received) as v from payment p
    where p.payment_date < reporting_start()
      and (p.po_id is null or p.po_id not in (select po_id from new_po))
      and (p_site_id is null or p.site_id = p_site_id)
    group by p.site_id
  ),
  d as (
    select o.site_id,
      sum(x.amount) filter (where x.deduction_type not in ('retention', 'handover_hold')) as tax,
      sum(x.amount) filter (where x.deduction_type in ('retention', 'handover_hold') and x.status = 'pending') as held
    from deduction x join old_inv o on o.invoice_id = x.invoice_id
    group by o.site_id
  ),
  s as (
    select o.site_id, sum(a.amount_allocated) as v
    from payment_allocation a
    join old_inv o on o.invoice_id = a.invoice_id
    join payment p on p.payment_id = a.payment_id and p.payment_date >= reporting_start()
    group by o.site_id
  ),
  sites as (select b.site_id from b union select r.site_id from r)
  select x.site_id,
    coalesce(b.v, 0), coalesce(r.v, 0), coalesce(d.tax, 0), coalesce(d.held, 0), coalesce(s.v, 0),
    coalesce(b.v, 0) - coalesce(r.v, 0) - coalesce(d.tax, 0) - coalesce(s.v, 0)
  from sites x
  left join b on b.site_id = x.site_id
  left join r on r.site_id = x.site_id
  left join d on d.site_id = x.site_id
  left join s on s.site_id = x.site_id;
end $$;

revoke execute on function public.brought_forward(uuid) from public, anon;
grant  execute on function public.brought_forward(uuid) to authenticated;

commit;
