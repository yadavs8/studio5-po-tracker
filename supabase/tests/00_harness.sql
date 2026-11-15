-- Smoke test for the harness itself: fixtures loaded, owner can read through RLS.
do $$ begin
  assert (select count(*) from public.site) = 2, 'fixtures missing';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  -- migration_011 hides pre-1 Aug rows: INV-OLD (10 Jul) must not be visible.
  assert (select count(*) from public.tax_invoice) = 2, 'owner should see the 2 post-cutoff invoices';
end $$;
reset role;
