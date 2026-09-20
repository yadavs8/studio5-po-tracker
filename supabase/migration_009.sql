-- ============================================================================
-- Studio5 migration 009 — document inbox ("Add documents").
-- Files you drop in wait here while the app reads them; nothing becomes a real
-- PO / invoice / payment until you press Confirm.
-- ============================================================================
create table if not exists doc_inbox (
    inbox_id          uuid primary key default gen_random_uuid(),
    file_path         text not null,                 -- path in the studio5-documents bucket (inbox/...)
    file_name         text not null,
    mime_type         text,
    size_bytes        bigint,
    status            text not null default 'uploaded'
                      check (status in ('uploaded','extracting','ready','saved','rejected','failed')),
    doc_type          text,                          -- what the app thinks it is / what you confirmed
    extracted         jsonb,                         -- what the app read (a suggestion only)
    error             text,
    saved_record_type text,
    saved_record_id   uuid,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists idx_doc_inbox_status on doc_inbox(status, created_at desc);
alter table doc_inbox enable row level security;
drop policy if exists p_authenticated_all on doc_inbox;
create policy p_authenticated_all on doc_inbox for all to authenticated using (true) with check (true);
revoke all on doc_inbox from anon;

-- The notification bar and To-do page read this: everything in v_todo plus documents waiting for you.
create or replace view v_todo_all as
select * from v_todo
union all
select 2, 'inbox_ready', 'Documents the app has read, waiting for you to check and confirm', null::text,
       count(*)::int, null::numeric, '/inbox'
from doc_inbox where status = 'ready' having count(*) > 0
union all
select 2, 'inbox_failed', 'Documents the app could not read — enter them by hand or upload a clearer copy', null,
       count(*)::int, null, '/inbox'
from doc_inbox where status = 'failed' having count(*) > 0;
alter view v_todo_all set (security_invoker = true);
revoke all on v_todo_all from anon;
