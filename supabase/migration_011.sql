-- ============================================================================
-- Studio5 migration 011 — the portal starts on 1 Aug 2026.
-- Signed-in users only see POs, PIs, tax invoices, payments, payment matches,
-- deductions and progress dated on/after reporting_start(). Every page,
-- report, total and alert reads through these tables (all views are
-- security_invoker), so earlier records disappear everywhere at once.
-- Nothing is deleted: the rows stay in the tables, hidden. The service role
-- (doc-generator backend, SQL editor) still sees everything.
-- To move the start date, replace reporting_start().
-- Run after migration_010.sql.
-- ============================================================================

create or replace function public.reporting_start() returns date
language sql immutable
as $$ select date '2026-08-01' $$;
grant execute on function public.reporting_start() to authenticated;

do $$
declare
  t record;
begin
  -- table -> condition that makes a row part of the portal
  for t in select * from (values
    ('purchase_order',        'po_date >= public.reporting_start()'),
    ('proforma_invoice',      'pi_date >= public.reporting_start()'),
    ('tax_invoice',           'invoice_date >= public.reporting_start()'),
    ('payment',               'payment_date >= public.reporting_start()'),
    ('physical_progress_log', 'reported_date >= public.reporting_start()'),
    -- matches and deductions follow the payment / invoice they belong to
    ('payment_allocation',    'payment_id in (select payment_id from public.payment) and (invoice_id is null or invoice_id in (select invoice_id from public.tax_invoice))'),
    ('deduction',             'invoice_id in (select invoice_id from public.tax_invoice)')
  ) as x(tbl, cond)
  loop
    execute format('drop policy if exists p_authenticated_all on public.%I', t.tbl);
    execute format('drop policy if exists p_from_start_select on public.%I', t.tbl);
    execute format('drop policy if exists p_from_start_insert on public.%I', t.tbl);
    execute format('drop policy if exists p_from_start_update on public.%I', t.tbl);
    execute format('drop policy if exists p_from_start_delete on public.%I', t.tbl);
    execute format('create policy p_from_start_select on public.%I for select to authenticated using (%s)', t.tbl, t.cond);
    execute format('create policy p_from_start_insert on public.%I for insert to authenticated with check (%s)', t.tbl, t.cond);
    execute format('create policy p_from_start_update on public.%I for update to authenticated using (%s) with check (%s)', t.tbl, t.cond, t.cond);
    execute format('create policy p_from_start_delete on public.%I for delete to authenticated using (%s)', t.tbl, t.cond);
  end loop;
end $$;
