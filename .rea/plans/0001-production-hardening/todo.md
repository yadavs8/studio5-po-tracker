# Todo — production hardening

### U1 — Test harness, local Supabase seed, CI check job

Files: `package.json`, `vitest.config.ts`, `test/supabase/supabase/config.toml`, `scripts/test-db.sh`, `supabase/tests/*.sql`, `supabase/seed_test.sql`, `supabase/migrations/*` + `supabase/seed.sql` → `supabase/archive/`, `e2e/smoke.mjs`, `.github/workflows/pages.yml`, `.env.example`, `.gitignore`
Done when: legacy `supabase/migrations/2026*.sql` and old `seed.sql` are archived out of any auto-applied path (H9); `npm test` runs vitest; `npm run test:db` resets a **local-only** Supabase, applies the applied chain + new migrations, **re-applies every new migration a second time (idempotency)**, and runs SQL assertions; `npm run test:e2e` runs a signed-in Playwright smoke over all routes; CI runs typecheck + unit tests before the Pages build (lint joins the gate in U10 once it is clean), with Pages permissions scoped to the deploy job and actions pinned to SHAs (H12, L8, M19).
Size: 1 smart-zone
Status: done

### U2 — Staff-only access: RLS + storage + audit/tally lock-down

Files: `supabase/migration_013_staff_access.sql`, `supabase/tests/access.sql`, `tally-agent/agent.js`, `tally-agent/README.md`
Done when: SQL tests prove a non-staff authenticated user can read/write nothing in Studio5 tables or the `studio5-documents` bucket, staff keeps today's access, `audit_log`/`tally_sync_log` are select-only for users, Tally status changes go through an RPC that cannot un-lock a pushed row, the Tally agent uses that RPC, inserts are audited, the migration aborts if it would leave `staff` empty and its header documents the rollback, the current frontend's queries still work for staff (compatibility test), re-apply is a no-op, bucket has size/MIME limits, trigger fns not executable via RPC (C1, H1, H2, M10, L5). Other apps' tables untouched.
Size: 1 smart-zone
Status: done

### U3 — Money views: no double count, exclude cancelled/draft

Files: `supabase/migration_014_money_views.sql`, `supabase/tests/money_views.sql`, `src/app/site/statement/page.tsx`
Done when: views are recreated with the same column names/order (new columns only appended; dependent views recreated in dependency order inside one transaction); SQL tests reproduce C2 (cross-PO tagged payment) and C3 (cancelled invoice) and pass after the migration: per-PO received sums to bank receipts; cancelled/draft invoices are excluded from billed/outstanding/ageing/todo and show status `cancelled`; statement uses the same rule; statement shows PO and no-PO balances separately (M18, ADR 0009); re-apply is a no-op.
Size: 1 smart-zone
Status: done

### U4 — Integrity: amount edits, unique PO/PI numbers, PI status, FK indexes, search_path

Files: `supabase/migration_015_integrity.sql`, `supabase/tests/integrity.sql`
Done when: SQL tests prove lowering an invoice/payment below what is settled/allocated is refused (H3), duplicate PO/PI numbers per site are refused (H4, ADR 0003) — the migration first checks for duplicates and aborts naming them rather than half-applying, a converted PI cannot change status (M17), Studio5 FK indexes exist (M12), the 6 functions have fixed search_path (M9); a hold can be marked released without tripping `fn_integrity`/RLS (M2 groundwork); re-apply is a no-op.
Size: 1 smart-zone
Status: done

### U5 — Brought-forward summary (staff-only aggregate)

Files: `supabase/migration_016_brought_forward.sql`, `supabase/tests/brought_forward.sql`, `src/lib/period.ts`, `src/lib/period.test.ts`, `src/app/reports/page.tsx`, `src/app/site/statement/page.tsx`
Done when: per ADR 0002, `brought_forward(site uuid default null)` (SECURITY DEFINER, fixed search_path, revoked from public/anon, refuses non-staff) returns per-site aggregates only for pre-cutoff records; SQL tests prove non-staff/anon are refused and no row-level data is returned; `loadBroughtForward` reads it and the existing Reports/Statement lines show the figures (C4, L7); re-apply is a no-op. Matching to pre-cutoff invoices stays out of scope.
Size: 1 smart-zone
Status: todo

### U6 — Upload flow safety: replace choice, lookup race, site/link resets, detector fixes

Files: `src/app/upload/page.tsx`, `src/lib/detector.ts`, `src/lib/detector.test.ts`, `src/lib/money.ts`, `src/lib/money.test.ts`
Done when: unit tests cover detector type precedence, site tie-break and calendar-date validation (M7); replace requires an explicit choice when a match exists and Save is disabled while lookup is pending, lookup errors surface (H5); a hand-picked site and chosen PO/PI links survive the AI result (H6); replace PO updates taxable/GST too (M16); upload uses the shared GST rule from `money.ts` (H13 upload part, ADR 0004) and the AI path no longer drops the read total.
Size: 1 smart-zone
Status: todo

### U7 — Pages: stale filters, error handling, races, payments crash

Files: `src/app/invoices/page.tsx`, `src/app/payments/page.tsx`, `src/app/po-pi/page.tsx`, `src/app/master-data/page.tsx`, `src/app/site/page.tsx`, `src/app/site/statement/page.tsx`, `src/app/document/page.tsx`, `src/lib/audit.ts`, `src/lib/documents.ts`, `e2e/flows.mjs`
Done when: client/site switches reset dependents (M1) without set-state-in-effect; every Supabase call checks `error` (M4); failed inserts discard uploaded files (M5); stale responses ignored (M6); payments drawer can't crash (H7); converted PI status locked in the UI (M17); e2e covers create/edit PO, PI, invoice, payment + matching on local Supabase.
Size: 1 smart-zone
Status: todo

### U12 — Money entry: GST, TDS date, retention release, validation

Files: `src/lib/money.ts`, `src/lib/validation.ts`, `src/lib/validation.test.ts`, `src/app/invoices/page.tsx`, `src/app/po-pi/page.tsx`, `src/app/site/page.tsx`, `src/app/upload/page.tsx`
Done when: GST rule per ADR 0004 in every invoice form (H13); TDS date defaults to invoice date (M3, ADR 0007); "Mark released" on pending holds (M2, ADR 0005); shared zod schemas validate PO / PI / invoice / payment forms including upload (M15), with unit tests.
Size: 1 smart-zone
Status: todo

### U8 — Pagination: remove 1000-row truncation

Files: `src/lib/fetchAll.ts`, `src/lib/period.ts`, `src/app/reports/page.tsx`, `src/lib/documents.ts`, `src/lib/fetchAll.test.ts`
Done when: a `fetchAll` helper pages with `.range()`; reports filter server-side by site; a unit test with a fake client returning >1000 rows proves totals include every row (H8).
Size: 1 smart-zone
Status: todo

### U9 — UX: not-found states, friendly errors, mobile tables, dates in IST

Files: `src/lib/plain.ts`, `src/lib/format.ts`, `src/lib/ui.tsx`, `src/app/site/**`, `src/app/po/page.tsx`, `src/app/pi/page.tsx`, `src/app/reports/page.tsx`, `src/lib/format.test.ts`, `src/lib/plain.test.ts`, `e2e/smoke.spec.ts`
Done when: invalid/missing ids show a plain "not found" state with no actions (M13, L14); `friendlyError` maps PGRST116/22P02; statement and site pages have no horizontal page overflow at 390 px (M14, Playwright check); dates format and age in Asia/Kolkata (L1, L13) with unit tests; L2, L4, L16 fixed.
Size: 1 smart-zone
Status: todo

### U10 — Code health: lint to zero, deps cleanup + audit, docs, session cookie

Files: `package.json`, `package-lock.json`, `eslint.config.mjs`, `scripts/*`, `tally-agent/agent.js`, `src/lib/utils.ts`, `src/lib/supabase.ts`, `.github/workflows/pages.yml`, `README.md`, `.env.example`, `AGENTS.md` (outside managed blocks), `CLAUDE.md` (remove the duplicate import outside the readev-tools markers)
Done when: `npm run lint` 0 errors / 0 warnings (H10, L9, L15); unused deps removed, `next` bumped, `xlsx` from SheetJS CDN, `npm audit` has no critical/high that applies to shipped code (H11, L6, L7); CI gate includes lint; cookie scoped per ADR 0008 (M8); README + `.env.example` + AGENTS.md project sections accurate (M19, L10).
Size: 1 smart-zone
Status: todo

### U11 — Verify: full suite, browser re-test, security re-scan, audit statuses, ship

Files: `.rea/audit.md`, `.rea/sessions/*`, `.rea/decisions/*`
Done when: build, typecheck, lint, unit, SQL and e2e all green; every Step-1 flow re-tested in the browser; `security-scanner` + `code-reviewer` re-run clean; each audit row marked FIXED / WONTFIX (reason); draft PR opened with an **ordered deploy runbook** (013 + updated Tally agent → 014–016 → merge frontend; each migration verified compatible with the old frontend), including the manual dashboard steps (sign-ups off, leaked-password protection on — M11); L11/L12 marked WONTFIX (other apps / backup schema, out of scope).
Size: 1 smart-zone
Status: todo
