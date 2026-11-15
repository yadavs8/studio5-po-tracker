-- ============================================================================
-- Studio5 migration 013 — only Studio5 staff can touch Studio5 data.
-- Audit C1, H1, H2, M10. Decision: .rea/decisions/0001-staff-allow-list.md
--
-- WHY: every Studio5 table allowed ANY signed-in account full access, and this
-- Supabase project is shared with other apps whose users can sign in too.
--
-- WHAT IT DOES (only ever narrows access; touches no other app's tables):
--   1. public.staff allow-list + public.is_staff().
--   2. Enrols the auth users that exist right now (production: the owner, who is
--      also the Tally agent login). It ABORTS rather than lock everyone out, and
--      aborts if there are suspiciously many users (enrol those by hand instead).
--   3. A RESTRICTIVE policy is_staff() on every Studio5 table (ANDed with the
--      existing policies, so nothing gets wider).
--   4. studio5-documents bucket: staff only, 25 MB, allowed file types; files can
--      be added, read and removed but never overwritten.
--   5. audit_log and tally_sync_log become read-only for users. Tally status moves
--      only through tally_queue() / tally_mark(), and a pushed entry can never be
--      re-opened (that used to unlock a booked invoice's amount).
--   6. Inserts into money tables are audited too.
--   7. Trigger functions can no longer be called through /rest/v1/rpc.
--
-- RUN: once, in the SQL editor, AFTER checking `select email from auth.users;`
-- lists only people who should have access. Safe to run again (idempotent).
-- ADD SOMEONE LATER:  insert into public.staff (user_id, note)
--                     select id, 'name' from auth.users where email = '…';
-- ROLLBACK (restores the old, open access — only if something is badly wrong):
--   do $$ declare t text; begin foreach t in array array['app_user','document','client','site',
--     'sub_project','purchase_order','proforma_invoice','tax_invoice','payment','payment_allocation',
--     'deduction','physical_progress_log','audit_log','tally_sync_log','tally_setting','app_task','doc_inbox']
--     loop execute format('drop policy if exists p_staff_only on public.%I', t); end loop; end $$;
--   drop policy if exists studio5_docs_staff_select on storage.objects;  (and _insert, _delete)
--   create policy studio5_docs_rw on storage.objects for all to authenticated
--     using (bucket_id = 'studio5-documents') with check (bucket_id = 'studio5-documents');
--   grant insert, update, delete on public.audit_log, public.tally_sync_log to authenticated;
-- ============================================================================

begin;

-- 1. Allow-list -------------------------------------------------------------
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  added_at   timestamptz not null default now()
);
alter table public.staff enable row level security;   -- no policies: users cannot read or edit it
revoke all on public.staff from anon, authenticated;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;
revoke execute on function public.is_staff() from public, anon;
grant  execute on function public.is_staff() to authenticated;

-- 2. Enrol current users, with lock-out guards --------------------------------
do $$
declare n_users int; n_staff int;
begin
  select count(*) into n_users from auth.users;
  select count(*) into n_staff from public.staff;
  if n_staff = 0 then
    if n_users > 5 then
      raise exception 'migration_013: % auth users exist. Enrol the Studio5 people by hand (see header) and run again.', n_users;
    end if;
    insert into public.staff (user_id, note)
    select id, 'enrolled by migration_013: ' || coalesce(email, '?') from auth.users
    on conflict do nothing;
    raise notice 'migration_013 enrolled: %', (select string_agg(coalesce(email, id::text), ', ') from auth.users);
  end if;
  if n_users > 0 and not exists (select 1 from public.staff) then
    raise exception 'migration_013: refusing to leave the staff list empty (everyone would be locked out).';
  end if;
end $$;

-- 3. Restrictive staff-only policy on every Studio5 table ---------------------
do $$
declare t text;
begin
  foreach t in array array['app_user','document','client','site','sub_project','purchase_order',
                           'proforma_invoice','tax_invoice','payment','payment_allocation','deduction',
                           'physical_progress_log','audit_log','tally_sync_log','tally_setting','app_task','doc_inbox'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_staff_only on public.%I', t);
    execute format('create policy p_staff_only on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 4. Document storage ---------------------------------------------------------
update storage.buckets
   set file_size_limit = 26214400,   -- 25 MB
       allowed_mime_types = array[
         'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
 where id = 'studio5-documents';

drop policy if exists studio5_docs_rw            on storage.objects;
drop policy if exists studio5_docs_staff_select  on storage.objects;
drop policy if exists studio5_docs_staff_insert  on storage.objects;
drop policy if exists studio5_docs_staff_delete  on storage.objects;
create policy studio5_docs_staff_select on storage.objects for select to authenticated
  using (bucket_id = 'studio5-documents' and public.is_staff());
create policy studio5_docs_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'studio5-documents' and public.is_staff());
create policy studio5_docs_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'studio5-documents' and public.is_staff());

-- 5. audit_log / tally_sync_log: read-only for users --------------------------
revoke insert, update, delete, truncate on public.audit_log      from authenticated;
revoke insert, update, delete, truncate on public.tally_sync_log from authenticated;

-- Queue a record for Tally (the old "Send to Tally" / "Try again").
create or replace function public.tally_queue(p_record_type sync_record_type, p_record_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_voucher text;
begin
  if not public.is_staff() then raise exception 'Only Studio5 staff can send entries to Tally.'; end if;
  select sync_id into v_id from tally_sync_log
   where record_type = p_record_type and record_id = p_record_id and sync_status <> 'failed';
  if v_id is not null then return v_id; end if;   -- already queued or sent: never twice
  v_voucher := case p_record_type when 'invoice' then 'Sales' when 'payment' then 'Receipt' else 'Journal' end;
  insert into tally_sync_log (record_type, record_id, tally_voucher_type, sync_status)
  values (p_record_type, p_record_id, v_voucher, 'pending') returning sync_id into v_id;
  return v_id;
end $$;

-- The agent reports the outcome. Only a pending entry can change; pushed is final.
create or replace function public.tally_mark(p_sync_id uuid, p_status text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare v_now sync_status;
begin
  if not public.is_staff() then raise exception 'Only Studio5 staff can update Tally status.'; end if;
  if p_status not in ('pushed', 'failed') then raise exception 'Tally status must be pushed or failed.'; end if;
  select sync_status into v_now from tally_sync_log where sync_id = p_sync_id for update;
  if v_now is null then raise exception 'No such Tally queue entry.'; end if;
  if v_now <> 'pending' then raise exception 'This Tally entry is already %, so it cannot be changed.', v_now; end if;
  update tally_sync_log
     set sync_status   = p_status::sync_status,
         pushed_at     = case when p_status = 'pushed' then now() else pushed_at end,
         error_message = case when p_status = 'pushed' then null else left(p_error, 500) end
   where sync_id = p_sync_id;
end $$;

revoke execute on function public.tally_queue(sync_record_type, uuid) from public, anon;
revoke execute on function public.tally_mark(uuid, text, text)        from public, anon;
grant  execute on function public.tally_queue(sync_record_type, uuid) to authenticated;
grant  execute on function public.tally_mark(uuid, text, text)        to authenticated;

-- 6. Audit inserts too (one '*created*' row per new record) --------------------
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
    new_j := to_jsonb(new);
    rec_id := (new_j ->> pk_col)::uuid;
    if tg_op = 'INSERT' then
        insert into audit_log(table_name, record_id, field_changed, old_value, new_value, changed_by, reason)
        values (tg_table_name, rec_id, '*created*', null, new_j::text, auth.uid(), 'row created');
        return new;
    end if;
    old_j := to_jsonb(old);
    for k in select jsonb_object_keys(new_j) loop
        if k in ('updated_at') then continue; end if;
        if (old_j -> k) is distinct from (new_j -> k) then
            insert into audit_log(table_name, record_id, field_changed, old_value, new_value, changed_by)
            values (tg_table_name, rec_id, k, old_j ->> k, new_j ->> k, auth.uid());
        end if;
    end loop;
    return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('purchase_order','po_id'), ('proforma_invoice','pi_id'), ('tax_invoice','invoice_id'),
    ('payment','payment_id'), ('payment_allocation','allocation_id'), ('deduction','deduction_id')) as x(tbl, pk)
  loop
    execute format('drop trigger if exists trg_audit_%s on public.%I', r.tbl, r.tbl);
    execute format('create trigger trg_audit_%s after insert or update or delete on public.%I for each row execute function fn_audit_row(%L)', r.tbl, r.tbl, r.pk);
  end loop;
end $$;

-- 7. Trigger functions are not API endpoints ----------------------------------
revoke execute on function public.fn_audit_row()     from public, anon, authenticated;
revoke execute on function public.fn_file_document() from public, anon, authenticated;

commit;
