-- U5 / migration_016: pre-1 Aug money owed, as staff-only per-site totals. Audit C4. Decision 0002.
-- Fixtures before the start: INV-OLD ₹59,000 (no PO), UTR-OLD ₹20,000 received (untagged, matched to it), TDS ₹1,000.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare b record;
begin
  -- the rows themselves stay hidden …
  assert (select count(*) from public.tax_invoice where invoice_number = 'INV-OLD') = 0, 'old invoice should stay hidden';
  -- … but the totals are available
  select * into b from public.brought_forward('51111111-0000-0000-0000-000000000001');
  assert b.billed = 59000,   format('billed %s', b.billed);
  assert b.received = 20000, format('received %s', b.received);
  assert b.tax = 1000,       format('tax %s', b.tax);
  assert b.held = 0,         format('held %s', b.held);
  assert b.received_since = 0, format('received since %s', b.received_since);
  assert b.balance = 38000,  format('balance %s', b.balance);
  -- all sites: one row per site that has older records
  assert (select count(*) from public.brought_forward()) = 1, 'only the site with older records';
end $$;

-- a later receipt matched to the old invoice (as the database owner, as an import would) reduces the balance
reset role;
insert into public.payment (payment_id, site_id, payment_date, amount_received, utr_or_reference)
values ('b1111111-0000-0000-0000-0000000000f1', '51111111-0000-0000-0000-000000000001', '2026-09-05', 8000, 'UTR-LATER');
insert into public.payment_allocation (payment_id, invoice_id, amount_allocated)
values ('b1111111-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-0000000000a3', 8000);
set local role authenticated;
do $$
declare b record;
begin
  select * into b from public.brought_forward('51111111-0000-0000-0000-000000000001');
  assert b.received_since = 8000, format('received since %s', b.received_since);
  assert b.balance = 30000, format('balance after later receipt %s', b.balance);
end $$;
reset role;

-- an old advance later matched to a NEW invoice is counted there, not also in the brought-forward
reset role;
insert into public.payment (payment_id, site_id, payment_date, amount_received, payment_type, utr_or_reference)
values ('b1111111-0000-0000-0000-0000000000f2', '51111111-0000-0000-0000-000000000001', '2026-07-25', 10000, 'advance', 'UTR-ADV-OLD');
insert into public.payment_allocation (payment_id, invoice_id, amount_allocated)
values ('b1111111-0000-0000-0000-0000000000f2', '11111111-0000-0000-0000-0000000000a1', 10000);   -- INV-1, Sept
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare b record;
begin
  select * into b from public.brought_forward('51111111-0000-0000-0000-000000000001');
  assert b.received = 20000, format('old advance used on a new invoice must not count as old money received, got %s', b.received);
  assert b.balance = 30000, format('balance should stay 30,000, got %s', b.balance);
end $$;
reset role;

-- outsiders and anon get nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  perform * from public.brought_forward();
  raise exception 'outsider read brought-forward totals';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon', 'public.brought_forward(uuid)', 'execute'), 'anon can call brought_forward';
  assert (select prosecdef from pg_proc where proname = 'brought_forward'), 'must be security definer';
  assert exists (select 1 from pg_proc where proname = 'brought_forward' and 'search_path=public' = any(proconfig)), 'search_path not fixed';
end $$;
