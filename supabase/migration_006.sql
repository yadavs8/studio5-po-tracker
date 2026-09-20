-- ============================================================================
-- Studio5 migration 006 — Tally sync (one-way: tracker -> Tally).
-- RUN IN TWO STEPS in the Supabase SQL editor (Postgres cannot use a new enum
-- value in the same transaction that adds it):
--   STEP A: the single line right below.
--   STEP B: everything after the "STEP B" marker.
-- ============================================================================

-- STEP A ---------------------------------------------------------------------
alter type sync_record_type add value if not exists 'deduction';

-- STEP B ---------------------------------------------------------------------
-- 1. Per-site Tally ledger name (defaults to the client's legal name when blank).
alter table site add column if not exists tally_ledger_name text;
update site set tally_ledger_name = 'KEYS HOTEL BY LEMON TREE HOTEL HOSOR ROAD' where site_name like 'Keys Hotel - Hosur Road%' and tally_ledger_name is null;
update site set tally_ledger_name = 'Keys Hotel Kochi'                          where site_name = 'Keys Hotel - Kochi' and tally_ledger_name is null;
update site set tally_ledger_name = 'LEMON TREE HOTELS LIMITED - PGN-1 GGN'     where site_name like 'Lemon Tree Hotels - PGN-1%' and tally_ledger_name is null;
update site set tally_ledger_name = 'Redfox Hotel East Delhi (Mayur Vihar)'     where site_name like 'Redfox Hotel%' and tally_ledger_name is null;

-- 2. Tally settings (ledger names used in vouchers) — edited on the Tally page.
create table if not exists tally_setting (
    key   text primary key,
    value text not null default '',
    label text not null,
    hint  text
);
insert into tally_setting(key, value, label, hint) values
 ('company',      '',                          'Tally company name',        'Exactly as shown in Tally. The agent refuses to run while this is empty, so it can never post to the wrong company.'),
 ('sales_ledger', 'Sales - Interior Fit-Out',  'Sales ledger',              'Income ledger that tax invoices are booked to.'),
 ('igst_ledger',  'IGST',                      'IGST ledger',               'Used for inter-state invoices.'),
 ('cgst_ledger',  'CGST',                      'CGST ledger',               'Used for same-state invoices (half of the GST).'),
 ('sgst_ledger',  'SGST',                      'SGST ledger',               'Used for same-state invoices (other half).'),
 ('tds_ledger',   'TDS Receivable',            'TDS receivable ledger',     'Where tax deducted by clients is booked (an asset you claim back).'),
 ('bank_ledger',  'Bank Account',              'Bank ledger',               'Used for bank transfers and cheques.'),
 ('cash_ledger',  'Cash',                      'Cash ledger',               'Used for cash receipts.')
on conflict (key) do nothing;
alter table tally_setting enable row level security;
drop policy if exists p_authenticated_all on tally_setting;
create policy p_authenticated_all on tally_setting for all to authenticated using (true) with check (true);
revoke all on tally_setting from anon;

-- 3. One live queue entry per record — a record can never be queued or posted twice.
create unique index if not exists uq_tally_active on tally_sync_log(record_type, record_id) where sync_status <> 'failed';

-- 4. Baseline: everything entered so far is ALREADY in Tally, so it is marked as sent and never posted again.
insert into tally_sync_log(record_type, record_id, tally_voucher_type, sync_status, pushed_at, error_message)
select 'invoice'::sync_record_type, invoice_id, 'Sales', 'pushed'::sync_status, now(), 'Baseline: already in Tally before the tracker started' from tax_invoice
union all
select 'payment'::sync_record_type, payment_id, 'Receipt', 'pushed'::sync_status, now(), 'Baseline: already in Tally before the tracker started' from payment
union all
select 'deduction'::sync_record_type, deduction_id, 'Journal', 'pushed'::sync_status, now(), 'Baseline: already in Tally before the tracker started'
from deduction where deduction_type in ('tds','gst_tds')
on conflict do nothing;

-- 5. Once a record is in Tally (or waiting to go), its amounts cannot be changed here.
create or replace function fn_tally_lock() returns trigger language plpgsql as $$
declare v_type sync_record_type; v_id uuid; v_changed boolean := false; v_what text;
begin
  if tg_table_name = 'tax_invoice' then
    v_type := 'invoice'; v_id := old.invoice_id; v_what := 'invoice';
    if tg_op = 'DELETE' then v_changed := true;
    else v_changed := (new.invoice_number, new.taxable_value, new.gst_amount, new.gross_invoice_value, new.site_id)
                      is distinct from (old.invoice_number, old.taxable_value, old.gst_amount, old.gross_invoice_value, old.site_id); end if;
  elsif tg_table_name = 'payment' then
    v_type := 'payment'; v_id := old.payment_id; v_what := 'payment';
    if tg_op = 'DELETE' then v_changed := true;
    else v_changed := (new.amount_received, new.site_id) is distinct from (old.amount_received, old.site_id); end if;
  end if;
  if v_changed and exists (select 1 from tally_sync_log where record_type = v_type and record_id = v_id and sync_status in ('pushed','pending')) then
    raise exception 'This % is already in Tally (or waiting to be sent), so its amount or number cannot be changed or deleted here. Correct it in Tally first, or add a credit/debit note.', v_what;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_tally_lock on tax_invoice;
drop trigger if exists trg_tally_lock on payment;
create trigger trg_tally_lock before update or delete on tax_invoice for each row execute function fn_tally_lock();
create trigger trg_tally_lock before update or delete on payment     for each row execute function fn_tally_lock();

-- 6. Everything that can be sent, with its latest status.
create or replace view v_tally_queue as
select 'invoice'::text as record_type, t.invoice_id as record_id, 'Sales'::text as voucher_type, t.invoice_date as voucher_date,
       t.invoice_number as reference, t.site_id, s.site_name, coalesce(nullif(s.tally_ledger_name,''), c.legal_name) as party_ledger,
       t.gross_invoice_value as amount, l.sync_id, coalesce(l.sync_status::text, 'not_queued') as status, l.error_message, l.pushed_at
from tax_invoice t join site s on s.site_id = t.site_id join client c on c.client_id = s.client_id
left join lateral (select * from tally_sync_log x where x.record_type = 'invoice' and x.record_id = t.invoice_id order by x.created_at desc limit 1) l on true
union all
select 'payment', p.payment_id, 'Receipt', p.payment_date, coalesce(nullif(p.utr_or_reference,''), p.payment_type::text),
       p.site_id, s.site_name, coalesce(nullif(s.tally_ledger_name,''), c.legal_name), p.amount_received,
       l.sync_id, coalesce(l.sync_status::text, 'not_queued'), l.error_message, l.pushed_at
from payment p join site s on s.site_id = p.site_id join client c on c.client_id = s.client_id
left join lateral (select * from tally_sync_log x where x.record_type = 'payment' and x.record_id = p.payment_id order by x.created_at desc limit 1) l on true
union all
select 'deduction', d.deduction_id, 'Journal', d.deduction_date, 'TDS on ' || t.invoice_number,
       t.site_id, s.site_name, coalesce(nullif(s.tally_ledger_name,''), c.legal_name), d.amount,
       l.sync_id, coalesce(l.sync_status::text, 'not_queued'), l.error_message, l.pushed_at
from deduction d join tax_invoice t on t.invoice_id = d.invoice_id join site s on s.site_id = t.site_id join client c on c.client_id = s.client_id
left join lateral (select * from tally_sync_log x where x.record_type = 'deduction' and x.record_id = d.deduction_id order by x.created_at desc limit 1) l on true
where d.deduction_type in ('tds','gst_tds');
alter view v_tally_queue set (security_invoker = true);
revoke all on v_tally_queue from anon;
