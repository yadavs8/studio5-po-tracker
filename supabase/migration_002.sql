-- ============================================================================
-- Studio5 migration 002 — audit triggers, RLS/auth gating, document storage,
-- physical progress on dashboard.
-- Run AFTER studio5_schema.sql, in the Supabase SQL Editor.
-- (Do NOT run supabase/migrations/2026*.sql — that is an older, unrelated model.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. AUDIT LOG
-- changed_by stores auth.uid() (Supabase Auth user), which is not an app_user
-- row yet, so the FK to app_user is dropped.
-- ---------------------------------------------------------------------------
alter table audit_log drop constraint if exists audit_log_changed_by_fkey;
alter table document  drop constraint if exists document_uploaded_by_fkey;
alter table physical_progress_log drop constraint if exists physical_progress_log_reported_by_fkey;

create or replace function fn_audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    pk_col text := tg_argv[0];
    old_j  jsonb;
    new_j  jsonb;
    k      text;
    rec_id uuid;
begin
    if tg_op = 'DELETE' then
        old_j := to_jsonb(old);
        rec_id := (old_j ->> pk_col)::uuid;
        insert into audit_log(table_name, record_id, field_changed, old_value, new_value, changed_by, reason)
        values (tg_table_name, rec_id, '*deleted*', old_j::text, null, auth.uid(), 'row deleted');
        return old;
    end if;

    old_j := to_jsonb(old);
    new_j := to_jsonb(new);
    rec_id := (new_j ->> pk_col)::uuid;
    for k in select jsonb_object_keys(new_j) loop
        if k in ('updated_at') then continue; end if;
        if (old_j -> k) is distinct from (new_j -> k) then
            insert into audit_log(table_name, record_id, field_changed, old_value, new_value, changed_by)
            values (tg_table_name, rec_id, k, old_j ->> k, new_j ->> k, auth.uid());
        end if;
    end loop;
    return new;
end $$;

drop trigger if exists trg_audit_purchase_order     on purchase_order;
drop trigger if exists trg_audit_proforma_invoice   on proforma_invoice;
drop trigger if exists trg_audit_tax_invoice        on tax_invoice;
drop trigger if exists trg_audit_payment            on payment;
drop trigger if exists trg_audit_payment_allocation on payment_allocation;
drop trigger if exists trg_audit_deduction          on deduction;

create trigger trg_audit_purchase_order     after update or delete on purchase_order     for each row execute function fn_audit_row('po_id');
create trigger trg_audit_proforma_invoice   after update or delete on proforma_invoice   for each row execute function fn_audit_row('pi_id');
create trigger trg_audit_tax_invoice        after update or delete on tax_invoice        for each row execute function fn_audit_row('invoice_id');
create trigger trg_audit_payment            after update or delete on payment            for each row execute function fn_audit_row('payment_id');
create trigger trg_audit_payment_allocation after update or delete on payment_allocation for each row execute function fn_audit_row('allocation_id');
create trigger trg_audit_deduction          after update or delete on deduction          for each row execute function fn_audit_row('deduction_id');

-- audit_log is append-only for app users
create or replace function fn_audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists trg_audit_log_immutable on audit_log;
create trigger trg_audit_log_immutable before update or delete on audit_log
    for each row execute function fn_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- 2. AUTH GATING — RLS: only signed-in users may touch anything
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array[
        'app_user','document','client','site','sub_project','purchase_order',
        'proforma_invoice','tax_invoice','payment','payment_allocation',
        'deduction','physical_progress_log','audit_log','tally_sync_log'
    ] loop
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists p_authenticated_all on %I', t);
        execute format('create policy p_authenticated_all on %I for all to authenticated using (true) with check (true)', t);
        execute format('revoke all on %I from anon', t);
    end loop;
end $$;

-- Views run with the caller's rights, so RLS above applies through them.
alter view v_invoice_settlement     set (security_invoker = true);
alter view v_normal_outstanding     set (security_invoker = true);
alter view v_retention_outstanding  set (security_invoker = true);
alter view v_advance_balance        set (security_invoker = true);
alter view v_unallocated_payments   set (security_invoker = true);
alter view v_site_dashboard         set (security_invoker = true);
revoke all on v_invoice_settlement, v_normal_outstanding, v_retention_outstanding,
              v_advance_balance, v_unallocated_payments, v_site_dashboard from anon;

-- ---------------------------------------------------------------------------
-- 3. DOCUMENT STORAGE (private bucket)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('studio5-documents', 'studio5-documents', false)
on conflict (id) do nothing;

drop policy if exists studio5_docs_rw on storage.objects;
create policy studio5_docs_rw on storage.objects for all to authenticated
    using (bucket_id = 'studio5-documents')
    with check (bucket_id = 'studio5-documents');

-- ---------------------------------------------------------------------------
-- 4. PHYSICAL PROGRESS on the dashboard
-- Site physical % = latest site-level entry (sub_project_id null) if any,
-- otherwise the average of each sub-project's latest entry.
-- Kept as its own column — never blended with billing_progress_pct.
-- ---------------------------------------------------------------------------
create or replace view v_latest_physical_progress as
with sub_latest as (
    select distinct on (sub_project_id) site_id, sub_project_id, progress_pct, reported_date
    from physical_progress_log
    where sub_project_id is not null
    order by sub_project_id, reported_date desc, created_at desc
),
site_latest as (
    select distinct on (site_id) site_id, progress_pct, reported_date
    from physical_progress_log
    where sub_project_id is null
    order by site_id, reported_date desc, created_at desc
),
sub_avg as (
    select site_id, round(avg(progress_pct), 2) as progress_pct, max(reported_date) as reported_date
    from sub_latest group by site_id
)
select s.site_id,
       coalesce(sl.progress_pct, sa.progress_pct)       as physical_progress_pct,
       coalesce(sl.reported_date, sa.reported_date)     as physical_progress_date
from site s
left join site_latest sl on sl.site_id = s.site_id
left join sub_avg sa     on sa.site_id = s.site_id
where sl.site_id is not null or sa.site_id is not null;
alter view v_latest_physical_progress set (security_invoker = true);

-- Append the new columns at the end (CREATE OR REPLACE VIEW allows this).
create or replace view v_site_dashboard as
select
    s.site_id,
    s.site_name,
    c.display_name as client_name,
    coalesce(po_sum.total_po_value, 0) as current_contract_value,
    coalesce(inv_sum.total_invoiced, 0) as total_invoiced,
    coalesce(no.total_collected, 0) as total_collected,
    coalesce(no.normal_outstanding, 0) as normal_outstanding,
    coalesce(ro.retention_outstanding, 0) as retention_outstanding,
    coalesce(ab.advance_balance, 0) as advance_balance,
    case when coalesce(po_sum.total_po_value,0) > 0
        then round(coalesce(inv_sum.total_invoiced,0) / po_sum.total_po_value * 100, 2)
        else null
    end as billing_progress_pct,
    pp.physical_progress_pct,
    pp.physical_progress_date
from site s
join client c on c.client_id = s.client_id
left join (select site_id, sum(total_value_with_gst) as total_po_value from purchase_order group by site_id) po_sum
    on po_sum.site_id = s.site_id
left join (select site_id, sum(gross_invoice_value) as total_invoiced from tax_invoice group by site_id) inv_sum
    on inv_sum.site_id = s.site_id
left join v_normal_outstanding no on no.site_id = s.site_id
left join v_retention_outstanding ro on ro.site_id = s.site_id
left join v_advance_balance ab on ab.site_id = s.site_id
left join v_latest_physical_progress pp on pp.site_id = s.site_id;
alter view v_site_dashboard set (security_invoker = true);
