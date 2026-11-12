-- ============================================================================
-- Studio5 migration 012 — every document filed under its site.
-- Before: a file only belonged to a site through the PO / PI / invoice /
-- payment that pointed at it, so challans and other papers were attached to
-- nothing and could not be found again.
-- After: each document row carries its own site, number, date, original file
-- name, an optional PO / work order, and which record (if any) it belongs to.
-- A trigger keeps that filled in whichever page attaches the file.
-- Run after migration_011.sql. Safe to run more than once.
-- ============================================================================

-- 1. New kind of document. (Not used later in this script, so it can run in one go.)
alter type document_type add value if not exists 'challan';

-- 2. Filing details on the document itself.
alter table document add column if not exists site_id     uuid references site(site_id);
alter table document add column if not exists po_id       uuid references purchase_order(po_id) on delete set null;
alter table document add column if not exists doc_number  text;
alter table document add column if not exists doc_date    date;
alter table document add column if not exists file_name   text;
alter table document add column if not exists notes       text;
alter table document add column if not exists linked_type text
    check (linked_type is null or linked_type in ('purchase_order','proforma_invoice','tax_invoice','payment'));
alter table document add column if not exists linked_id   uuid;

create index if not exists idx_document_site   on document(site_id, doc_date desc);
create index if not exists idx_document_po     on document(po_id);
create index if not exists idx_document_linked on document(linked_type, linked_id);

-- 3. When a PO / PI / tax invoice / payment points at a file, file that document
--    under the same site with the record's number and date.
create or replace function fn_file_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    j      jsonb := to_jsonb(new);
    v_num  text;
    v_date date;
    v_po   uuid;
    v_id   uuid;
begin
    if new.document_id is null then return new; end if;

    case tg_table_name
        when 'purchase_order' then
            v_id := (j->>'po_id')::uuid;   v_num := j->>'po_number';      v_date := (j->>'po_date')::date;      v_po := v_id;
        when 'proforma_invoice' then
            v_id := (j->>'pi_id')::uuid;   v_num := j->>'pi_number';      v_date := (j->>'pi_date')::date;      v_po := (j->>'po_id')::uuid;
        when 'tax_invoice' then
            v_id := (j->>'invoice_id')::uuid; v_num := j->>'invoice_number'; v_date := (j->>'invoice_date')::date; v_po := (j->>'po_id')::uuid;
        when 'payment' then
            v_id := (j->>'payment_id')::uuid; v_num := coalesce(j->>'utr_or_reference', 'Payment'); v_date := (j->>'payment_date')::date; v_po := (j->>'po_id')::uuid;
    end case;

    -- A linked file always shows its record's current number and date (edits flow through).
    update document d set
        site_id     = new.site_id,
        po_id       = coalesce(v_po, d.po_id),
        doc_number  = v_num,
        doc_date    = v_date,
        linked_type = tg_table_name,
        linked_id   = v_id
    where d.document_id = new.document_id
      and (d.site_id, d.po_id, d.doc_number, d.doc_date, d.linked_type, d.linked_id)
          is distinct from (new.site_id, coalesce(v_po, d.po_id), v_num, v_date, tg_table_name::text, v_id);
    return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['purchase_order','proforma_invoice','tax_invoice','payment'] loop
    execute format('drop trigger if exists trg_file_document on public.%I', t);
    execute format('create trigger trg_file_document after insert or update on public.%I for each row execute function fn_file_document()', t);
  end loop;
end $$;

-- 4. File every document that already exists (records are read here without the 1 Aug filter).
update document d set site_id = x.site_id, po_id = x.po_id, doc_number = coalesce(d.doc_number, x.po_number),
       doc_date = coalesce(d.doc_date, x.po_date), linked_type = 'purchase_order', linked_id = x.po_id
from purchase_order x where x.document_id = d.document_id;

update document d set site_id = x.site_id, po_id = coalesce(x.po_id, d.po_id), doc_number = coalesce(d.doc_number, x.pi_number),
       doc_date = coalesce(d.doc_date, x.pi_date), linked_type = 'proforma_invoice', linked_id = x.pi_id
from proforma_invoice x where x.document_id = d.document_id;

update document d set site_id = x.site_id, po_id = coalesce(x.po_id, d.po_id), doc_number = coalesce(d.doc_number, x.invoice_number),
       doc_date = coalesce(d.doc_date, x.invoice_date), linked_type = 'tax_invoice', linked_id = x.invoice_id
from tax_invoice x where x.document_id = d.document_id;

update document d set site_id = x.site_id, po_id = coalesce(x.po_id, d.po_id), doc_number = coalesce(d.doc_number, x.utr_or_reference, 'Payment'),
       doc_date = coalesce(d.doc_date, x.payment_date), linked_type = 'payment', linked_id = x.payment_id
from payment x where x.document_id = d.document_id;

-- Original file name, without the folder and the random prefix added on upload.
update document set file_name = regexp_replace(regexp_replace(file_url, '^.*/', ''),
                                               '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_', '')
where file_name is null;
