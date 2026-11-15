# Archived — old, unrelated data model. Never run these.

These files describe an earlier model (`clients`, `payment_allocations`, …) that was never applied
to the live database. They create tables **without row-level security** and a function callable by
anyone, so running them on a Supabase project would expose data to the public key.

They were moved out of `supabase/migrations/` because the Supabase CLI applies that folder
automatically. The real schema is `supabase/studio5_schema.sql` followed by
`supabase/migration_002.sql` onwards (see the root README).
