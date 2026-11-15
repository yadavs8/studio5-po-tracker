-- ============================================================================
-- Studio5 migration 017 — PIs and tax invoices made in the doc generator appear here.
-- Decision: .rea/decisions/0011-doc-generator-link.md
--
-- WHY  A PI or tax invoice made in the doc generator had to be typed into the tracker again
--      (double entry, typos, missed PIs). Now the doc generator records it here itself, under
--      the site picked on its form, with the Word/PDF file attached.
--
-- WHAT
--  1. proforma_invoice.source_ref / tax_invoice.source_ref: "docgen:pi:<number>" — marks a
--     record as made by the doc generator, so a retry (e.g. after working offline) never
--     creates it twice.
--  2. tax_invoice.round_off: invoices from the doc generator are rounded to the rupee with a
--     "Round off" line. The parts check now reads taxable + GST + round off = total
--     (still within 5 paise); round off is under ₹1. Existing rows have round off 0, so the
--     check is unchanged for them and for every form in this app.
--  3. pi_status 'cancelled': a PI voided in the doc generator. It drops out of open PIs.
--  4. Tally setting 'round_off_ledger' (default "Round Off"): the agent books the round off
--     there, so the voucher still balances.
--  5. Three functions for the doc generator's server, callable ONLY with the service-role key
--     (never by signed-in users or the public key — RLS is unchanged):
--       link_generated_document(jsonb)   create the PI / tax invoice (and convert a PI)
--       attach_generated_file(...)       file the Word/PDF against it
--       cancel_generated_document(...)   void → PI cancelled / invoice cancelled
--
-- HOW TO RUN  Paste into the SQL editor of studio5-portal and run once. Safe to run again.
--             Run after migration_016.
-- ROLLBACK (only before any document was linked):
--   drop function public.link_generated_document(jsonb), public.attach_generated_file(text,text,text),
--                 public.cancel_generated_document(text,text);
--   alter table public.tax_invoice drop constraint chk_inv_parts_add_up, drop constraint chk_inv_round_off;
--   alter table public.tax_invoice add constraint chk_inv_gst_adds_up check (gst_amount is null or abs(taxable_value + gst_amount - gross_invoice_value) <= 0.05);
--   alter table public.tax_invoice drop column round_off, drop column source_ref;
--   alter table public.proforma_invoice drop column source_ref;
--   delete from public.tally_setting where key = 'round_off_ledger';
--   (an enum value cannot be removed; an unused 'cancelled' is harmless)
-- ============================================================================

begin;

-- 1. Where a record came from ------------------------------------------------
alter table public.proforma_invoice add column if not exists source_ref text;
alter table public.tax_invoice      add column if not exists source_ref text;
create unique index if not exists uq_pi_source_ref      on public.proforma_invoice (source_ref) where source_ref is not null;
create unique index if not exists uq_invoice_source_ref on public.tax_invoice      (source_ref) where source_ref is not null;

-- 2. Round off on tax invoices -----------------------------------------------
alter table public.tax_invoice add column if not exists round_off numeric(14,2) not null default 0;
alter table public.tax_invoice drop constraint if exists chk_inv_gst_adds_up;
alter table public.tax_invoice drop constraint if exists chk_inv_parts_add_up;
alter table public.tax_invoice add constraint chk_inv_parts_add_up
  check (gst_amount is null or abs(taxable_value + gst_amount + round_off - gross_invoice_value) <= 0.05);
alter table public.tax_invoice drop constraint if exists chk_inv_round_off;
alter table public.tax_invoice add constraint chk_inv_round_off check (abs(round_off) < 1);

-- 3. A PI can be cancelled (not used elsewhere in this script, so one transaction is fine)
alter type public.pi_status add value if not exists 'cancelled';

-- 4. Tally: where the round off is booked ------------------------------------
insert into public.tally_setting (key, value, label, hint) values
  ('round_off_ledger', 'Round Off', 'Round-off ledger', 'Where the paise rounded off an invoice total are booked (indirect income/expense).')
on conflict (key) do nothing;

-- 5a. Create the PI / tax invoice ----------------------------------------------
-- p = { kind: 'pi'|'invoice', source_ref, site_id, number, date, amount (PI),
--       subject, taxable, gst, gst_type, gst_rate, round_off, gross, pi_id (invoice, optional) }
create or replace function public.link_generated_document(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := p->>'kind';
  v_ref  text := p->>'source_ref';
  v_site uuid := nullif(p->>'site_id', '')::uuid;
  v_pi   uuid := nullif(p->>'pi_id', '')::uuid;
  v_id   uuid;
  v_pi_site uuid; v_pi_status pi_status;
begin
  if v_kind not in ('pi', 'invoice') or v_ref is null or v_ref not like 'docgen:' || v_kind || ':%' then
    raise exception 'Not a doc generator record (%).', coalesce(v_ref, 'no reference') using errcode = '22023';
  end if;
  if v_site is null or not exists (select 1 from site where site_id = v_site) then
    raise exception 'That site is not in the PO tracker (it may have been removed). Pick the site again.' using errcode = '22023';
  end if;

  if v_kind = 'pi' then
    select pi_id into v_id from proforma_invoice where source_ref = v_ref;
    if v_id is not null then return jsonb_build_object('record_type', 'proforma_invoice', 'record_id', v_id, 'existing', true); end if;
    if exists (select 1 from proforma_invoice where site_id = v_site and lower(btrim(pi_number)) = lower(btrim(p->>'number'))) then
      raise exception 'PI % is already in the PO tracker for this site (entered by hand). Attach the file to it there.', p->>'number' using errcode = '23505';
    end if;
    insert into proforma_invoice (site_id, pi_number, pi_date, amount, submitted_date, subject, remarks, status, source_ref)
    values (v_site, btrim(p->>'number'), (p->>'date')::date, (p->>'amount')::numeric, (p->>'date')::date,
            nullif(btrim(coalesce(p->>'subject', '')), ''), 'Made in the doc generator', 'sent', v_ref)
    returning pi_id into v_id;
    return jsonb_build_object('record_type', 'proforma_invoice', 'record_id', v_id, 'existing', false);
  end if;

  select invoice_id into v_id from tax_invoice where source_ref = v_ref;
  if v_id is not null then return jsonb_build_object('record_type', 'tax_invoice', 'record_id', v_id, 'existing', true); end if;
  if exists (select 1 from tax_invoice where site_id = v_site and invoice_number = btrim(p->>'number')) then
    raise exception 'Tax invoice % is already in the PO tracker for this site (entered by hand). Attach the file to it there.', p->>'number' using errcode = '23505';
  end if;
  if v_pi is not null then
    select site_id, status into v_pi_site, v_pi_status from proforma_invoice where pi_id = v_pi for update;
    if v_pi_site is null then raise exception 'That proforma invoice is not in the PO tracker.' using errcode = '22023'; end if;
    if v_pi_site <> v_site then raise exception 'That proforma invoice belongs to a different site.' using errcode = '22023'; end if;
    if v_pi_status in ('converted_to_invoice', 'cancelled') then
      raise exception 'That proforma invoice is already % in the PO tracker.', replace(v_pi_status::text, '_', ' ') using errcode = '22023';
    end if;
  end if;
  insert into tax_invoice (site_id, pi_id, po_id, invoice_number, invoice_date, taxable_value, gst_type, gst_amount,
                           gst_rate_pct, round_off, gross_invoice_value, status, source_ref)
  values (v_site, v_pi, (select po_id from proforma_invoice where pi_id = v_pi), btrim(p->>'number'), (p->>'date')::date,
          (p->>'taxable')::numeric, nullif(p->>'gst_type', '')::gst_type, (p->>'gst')::numeric,
          (p->>'gst_rate')::numeric, coalesce((p->>'round_off')::numeric, 0), (p->>'gross')::numeric, 'issued', v_ref)
  returning invoice_id into v_id;
  if v_pi is not null then
    update proforma_invoice set status = 'converted_to_invoice', converted_invoice_id = v_id where pi_id = v_pi;
  end if;
  return jsonb_build_object('record_type', 'tax_invoice', 'record_id', v_id, 'existing', false);
end $$;

-- 5b. File the Word / PDF against it (the newest file becomes the record's main file;
--     earlier ones stay filed under the site) -------------------------------------
create or replace function public.attach_generated_file(p_source_ref text, p_file_url text, p_file_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_doc uuid; v_pi uuid; v_inv uuid; v_site uuid;
begin
  select pi_id, site_id into v_pi, v_site from proforma_invoice where source_ref = p_source_ref;
  if v_pi is null then select invoice_id, site_id into v_inv, v_site from tax_invoice where source_ref = p_source_ref; end if;
  if v_site is null then raise exception 'No doc generator record % in the PO tracker yet.', p_source_ref using errcode = 'P0002'; end if;
  -- the same file sent twice (a retry) is filed once
  select document_id into v_doc from document where file_url = p_file_url;
  if v_doc is null then
    insert into document (file_url, file_name, document_type, site_id, notes)
    values (p_file_url, p_file_name, case when v_pi is not null then 'pi'::document_type else 'invoice'::document_type end,
            v_site, 'Made in the doc generator')
    returning document_id into v_doc;
  end if;
  if v_pi is not null then update proforma_invoice set document_id = v_doc where pi_id = v_pi;
  else update tax_invoice set document_id = v_doc where invoice_id = v_inv; end if;
  return v_doc;
end $$;

-- 5c. Void in the doc generator → cancelled here (refused when that would hide real money) --
create or replace function public.cancel_generated_document(p_source_ref text, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
declare r_pi proforma_invoice%rowtype; r_inv tax_invoice%rowtype;
begin
  select * into r_pi from proforma_invoice where source_ref = p_source_ref for update;
  if found then
    if r_pi.status = 'cancelled' then return 'already cancelled'; end if;
    if r_pi.status = 'converted_to_invoice' then
      raise exception 'This PI has already become a tax invoice in the PO tracker. Cancel the tax invoice there first.' using errcode = '22023';
    end if;
    if r_pi.po_id is not null then
      raise exception 'This PI is linked to a purchase order in the PO tracker. Unlink it there first.' using errcode = '22023';
    end if;
    update proforma_invoice set status = 'cancelled',
      remarks = left(concat_ws(' · ', remarks, 'Voided in the doc generator' || coalesce(': ' || nullif(btrim(p_reason), ''), '')), 1000)
    where pi_id = r_pi.pi_id;
    return 'cancelled';
  end if;

  select * into r_inv from tax_invoice where source_ref = p_source_ref for update;
  if not found then return 'not in tracker'; end if;
  if r_inv.status = 'cancelled' then return 'already cancelled'; end if;
  if exists (select 1 from payment_allocation where invoice_id = r_inv.invoice_id)
     or exists (select 1 from deduction where invoice_id = r_inv.invoice_id) then
    raise exception 'This invoice has payments or deductions matched to it in the PO tracker. Remove them there first.' using errcode = '22023';
  end if;
  update tax_invoice set status = 'cancelled' where invoice_id = r_inv.invoice_id; -- the Tally lock refuses this if it is in Tally
  return 'cancelled';
end $$;

-- Only the doc generator's server (service-role key) may call these.
revoke execute on function public.link_generated_document(jsonb)              from public, anon, authenticated;
revoke execute on function public.attach_generated_file(text, text, text)     from public, anon, authenticated;
revoke execute on function public.cancel_generated_document(text, text)       from public, anon, authenticated;
grant  execute on function public.link_generated_document(jsonb)              to service_role;
grant  execute on function public.attach_generated_file(text, text, text)     to service_role;
grant  execute on function public.cancel_generated_document(text, text)       to service_role;

commit;
