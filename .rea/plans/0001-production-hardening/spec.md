# Spec — production hardening

## What & why
Fix the security boundary (RLS/storage), the money math in the SQL views and forms, the upload flow's data-safety issues, error/empty/mobile states, and code health, and add the missing test + CI safety net so regressions are caught before GitHub Pages deploys.

## Scope
- **In:** audit items C1–C4, H1–H13, M1–M19, L1–L16 (subject to decisions D1–D10).
- **Out:** other apps on the shared Supabase project; `backup_20261031`; Render backend; new accounting features (credit/debit notes, variations, retention ledger with DLP) unless D10/D5 pull them in.

## Key constraints
- New migrations only: `supabase/migration_013_*.sql` onward, each idempotent, each with a header saying exactly what it changes and how to roll back. Applied to **local** Supabase and tested; production apply is a manual step you run (listed in the deploy commands). Nothing destructive; no data deletes.
- RLS only gets stricter. Policies added as `AS RESTRICTIVE` so existing permissive ones can't widen access.
- Test-first: each fix gets a failing test first (vitest for `src/lib`, SQL tests run with `psql` against local Supabase for migrations, Playwright for UI flows), then the fix.
- Next.js 16 docs in `node_modules/next/dist/docs/` are the reference (per AGENTS.md).

## Decisions
| # | Decision | Choice | Alternatives Rejected | Rationale |
|---|----------|--------|------------------------|-----------|
| 1 | Test stack | vitest (unit) + psql SQL assertions on local Supabase + Playwright smoke | Jest; pgTAP | vitest works with TS/ESM out of the box; pgTAP needs an extension the shared prod project doesn't have; Playwright is preinstalled |
| 2 | Access model | `staff` allow-list + `is_staff()` restrictive policies (pending D1) | Role claims in JWT; per-row ownership | One small team, shared project — an allow-list is simplest and can't leak to other apps' users |
| 3 | View fixes | Recreate views in a new migration (`create or replace view`, same columns) | Compute in JS | Keeps one source of truth for money, used by every page and the statement |
