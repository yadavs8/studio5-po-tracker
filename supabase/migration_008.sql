-- ============================================================================
-- Studio5 migration 008 — "Needs your attention" (notification bar + To-do page).
-- Everything the bar shows is calculated live from the data (v_todo), so it can never go stale.
-- The few steps that only YOU can do (outside the app) live in a small checklist table.
-- ============================================================================

create table if not exists app_task (
    task_id    uuid primary key default gen_random_uuid(),
    sort       int not null default 0,
    title      text not null,
    detail     text,
    link       text,
    done       boolean not null default false,
    done_at    timestamptz,
    created_at timestamptz not null default now()
);
alter table app_task enable row level security;
drop policy if exists p_authenticated_all on app_task;
create policy p_authenticated_all on app_task for all to authenticated using (true) with check (true);
revoke all on app_task from anon;

insert into app_task(sort, title, detail, link)
select * from (values
 (1,  'Turn off public sign-ups in Supabase',        'Supabase → Authentication → Sign In / Providers → switch off "Allow new users to sign up". Then only people you add can log in.', null),
 (2,  'Set the Supabase Site URL',                   'Supabase → Authentication → URL Configuration → Site URL: https://studio5-project-tracker.onrender.com', null),
 (3,  'Send the DSS PO numbers and values',          'For each tower / package: PO number and value including GST. Then DSS invoices group under their PO.', '/po-pi'),
 (4,  'Decide about the installation invoices',      'DS/3, DS/4, DS/5, DS/6 are smaller than their PI amounts. Are they the whole bill or partial bills with more to come?', null),
 (5,  'Confirm the Wardrobes PO',                    'The sheet shows a PO of ₹15,09,810 but about ₹35L is invoiced. Is there a second PO or was work added later?', null),
 (6,  'Confirm TDS rates with your CA',              'Your DSS sheets deduct 1%. Check the correct rate and the tax credit process with your CA.', '/tds'),
 (7,  'Turn on the Tally HTTP-XML server',           'In Tally: F1 (Help) → Settings → Connectivity → Client/Server configuration, port 9000.', '/tally'),
 (8,  'Create a Tally TEST company',                 'A copy of the real company. Try the sync there first, never on the real books.', '/tally'),
 (9,  'Create the agent login in Supabase',          'Supabase → Authentication → Users → Add user (for example tally-agent@studio5.in). Steps are in tally-agent/README.md.', '/tally'),
 (10, 'Move Render to the Starter plan',             'The free plan sleeps when idle (first open takes up to a minute). Starter keeps it always on.', null),
 (11, 'Set up a regular backup',                     'The free Supabase plan has no automatic point-in-time recovery. Ask for a scheduled export before the boss relies on it.', null)
) as v(sort, title, detail, link)
where not exists (select 1 from app_task);

-- One row per kind of pending item. priority: 1 = fix now, 2 = soon, 3 = for your information.
create or replace view v_todo as
select (case severity when 'fix' then 1 else 2 end)::int as priority,
       code as code, message as title,
       string_agg(distinct site_name, ', ' order by site_name) as detail,
       sum(item_count)::int as item_count, sum(amount) as amount,
       case code
         when 'payment_unmatched' then '/payments' when 'placeholder_date' then '/payments' when 'advance_no_po' then '/payments'
         when 'invoice_no_po' then '/po-pi' when 'no_progress' then '/master-data' when 'pi_not_converted' then '/invoices'
         when 'po_overbilled' then '/data-health' when 'po_overreceived' then '/data-health' when 'invoice_overpaid' then '/data-health'
         else '/data-health' end as link
from v_data_health
group by severity, code, message
union all
select 2, 'tds_awaiting', 'Tax deducted (TDS): certificates still to collect from clients', null::text, count(*)::int, sum(amount), '/tds'
from v_tds_credit where credit_state = 'awaiting_certificate' having count(*) > 0
union all
select 2, 'tds_unclaimed', 'Tax deducted (TDS): certificate received, credit not yet claimed', null, count(*)::int, sum(amount), '/tds'
from v_tds_credit where credit_state = 'certificate_received' having count(*) > 0
union all
select 1, 'tally_failed', 'Entries Tally refused — needs your attention', null, count(*)::int, sum(amount), '/tally'
from v_tally_queue where status = 'failed' having count(*) > 0
union all
select 2, 'tally_pending', 'Entries waiting for the Tally agent on your PC', null, count(*)::int, sum(amount), '/tally'
from v_tally_queue where status = 'pending' having count(*) > 0
union all
select 3, 'tally_new', 'New entries not yet sent to Tally', null, count(*)::int, sum(amount), '/tally'
from v_tally_queue where status = 'not_queued' having count(*) > 0
union all
select 3, 'tally_setup', 'Enter your Tally company name (needed before anything can be sent)', null, 1, null, '/tally'
from tally_setting where key = 'company' and trim(value) = ''
union all
select 2, 'chase_60', 'Invoices unpaid for more than 60 days — time to chase', string_agg(distinct s.site_name, ', ' order by s.site_name),
       count(*)::int, sum(v.remaining_balance), '/reports'
from v_invoice_settlement v join tax_invoice t on t.invoice_id = v.invoice_id join site s on s.site_id = v.site_id
where v.remaining_balance > 0.5 and t.invoice_date < current_date - 60 having count(*) > 0
union all
select 3, 'setup_open', 'Setup and decision steps still open', string_agg(title, ' · ' order by sort), count(*)::int, null, '/todo'
from app_task where not done having count(*) > 0;

alter view v_todo set (security_invoker = true);
revoke all on v_todo from anon;
