# Todo — production hardening

### U1 — Test harness, local Supabase seed, CI check job

Files: `package.json`, `vitest.config.ts`, `supabase/tests/*.sql`, `supabase/tests/run.sh`, `supabase/seed_test.sql`, `e2e/smoke.spec.ts`, `.github/workflows/pages.yml`, `.env.example`, `.gitignore`
Done when: `npm test` runs vitest; `npm run test:db` applies schema + migrations to a local Supabase and runs SQL assertions; `npm run test:e2e` runs a signed-in Playwright smoke over all routes; CI runs lint + typecheck + unit tests before the Pages build, with Pages permissions scoped to the deploy job and actions pinned to SHAs (H12, L8, M19).
Size: 1 smart-zone
Status: todo

### U2 — Staff-only access: RLS + storage + audit/tally lock-down

Files: `supabase/migration_013_staff_access.sql`, `supabase/tests/access.sql`, `tally-agent/*` (only if its writes need the new RPC)
Done when: SQL tests prove a non-staff authenticated user can read/write nothing in Studio5 tables or the `studio5-documents` bucket, staff keeps today's access, `audit_log`/`tally_sync_log` are select-only for users, Tally status changes go through an RPC, inserts are audited, bucket has size/MIME limits, trigger fns not executable via RPC (C1, H1, H2, M10, L5). Other apps' tables untouched.
Size: 1 smart-zone
Status: todo

### U3 — Money views: no double count, exclude cancelled/draft

Files: `supabase/migration_014_money_views.sql`, `supabase/tests/money_views.sql`, `src/app/site/statement/page.tsx`
Done when: SQL tests reproduce C2 (cross-PO tagged payment) and C3 (cancelled invoice) and pass after the migration: per-PO received sums to bank receipts; cancelled/draft invoices are excluded from billed/outstanding/ageing/todo and show status `cancelled`; statement uses the same rule; M18 per D9.
Size: 1 smart-zone
Status: todo

### U4 — Integrity: amount edits, unique PO/PI numbers, PI status, FK indexes, search_path

Files: `supabase/migration_015_integrity.sql`, `supabase/tests/integrity.sql`
Done when: SQL tests prove lowering an invoice/payment below what is settled/allocated is refused (H3), duplicate PO/PI numbers per site are refused (H4, per D3), a converted PI cannot change status (M17), Studio5 FK indexes exist (M12), the 6 functions have fixed search_path (M9).
Size: 1 smart-zone
Status: todo

### U5 — Brought-forward / pre-cutoff matching (per D2)

Files: `supabase/migration_016_brought_forward.sql` (option a) or `src/lib/period.ts`, `src/app/reports/page.tsx`, `src/app/site/statement/page.tsx` (option b), `supabase/tests/brought_forward.sql`, `src/lib/period.test.ts` — final list fixed once D2 is answered
Done when: per D2 — (a) a staff-only brought-forward source feeds the existing UI and a post-cutoff payment can be matched to a pre-cutoff invoice, with SQL + unit tests; or (b) dead brought-forward code and labels are removed and docs say so (C4, L3, L7).
Size: 1 smart-zone
Status: todo

### U6 — Upload flow safety: replace choice, lookup race, site/link resets, detector fixes

Files: `src/app/upload/page.tsx`, `src/lib/detector.ts`, `src/lib/detector.test.ts`
Done when: unit tests cover detector type precedence, site tie-break and calendar-date validation (M7); replace requires an explicit choice when a match exists and Save is disabled while lookup is pending, lookup errors surface (H5); a hand-picked site and chosen PO/PI links survive the AI result (H6); replace PO updates taxable/GST too (M16).
Size: 1 smart-zone
Status: todo

### U7 — Forms & pages: stale filters, error handling, races, payments crash, GST, TDS date, validation

Files: `src/app/invoices/page.tsx`, `src/app/payments/page.tsx`, `src/app/po-pi/page.tsx`, `src/app/master-data/page.tsx`, `src/app/site/page.tsx`, `src/app/site/statement/page.tsx`, `src/app/po/page.tsx`, `src/app/pi/page.tsx`, `src/app/document/page.tsx`, `src/lib/audit.ts`, `src/lib/documents.ts`, `src/lib/validation.ts`, `src/lib/validation.test.ts`, `e2e/flows.spec.ts`
Done when: client/site switches reset dependents (M1) without set-state-in-effect; every Supabase call checks `error` (M4); failed inserts discard uploaded files (M5); stale responses ignored (M6); payments drawer can't crash (H7); GST rule per D4 (H13); TDS date per D7 (M3); retention release per D5 (M2); shared zod schemas validate forms (M15); Playwright tests cover create/edit/delete PO, PI, invoice, payment + matching.
Size: 2 smart-zones — split into U7a (state/error/race fixes) and U7b (GST/TDS/retention/validation) at execution if needed
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

### U10 — Code health: lint to zero, deps cleanup + audit, archive old SQL, docs, session cookie

Files: `package.json`, `package-lock.json`, `eslint.config.mjs`, `scripts/*`, `tally-agent/agent.js`, `src/lib/utils.ts`, `src/lib/supabase.ts`, `supabase/migrations/*` → `supabase/archive/`, `supabase/seed.sql`, `README.md`, `.env.example`, `AGENTS.md` (outside managed blocks), `CLAUDE.md` (remove the duplicate import outside the readev-tools markers)
Done when: `npm run lint` 0 errors / 0 warnings (H10, L9, L15); unused deps removed, `next` bumped, `xlsx` from SheetJS CDN, `npm audit` has no critical/high that applies to shipped code (H11, L6, L7); old SQL archived and seed replaced (H9); cookie scoped per D8 (M8); README + `.env.example` + AGENTS.md project sections accurate (M19, L10).
Size: 1 smart-zone
Status: todo

### U11 — Verify: full suite, browser re-test, security re-scan, audit statuses, ship

Files: `.rea/audit.md`, `.rea/sessions/*`, `.rea/decisions/*`
Done when: ADRs recorded for D1–D10; build, typecheck, lint, unit, SQL and e2e all green; every Step-1 flow re-tested in the browser; `security-scanner` + `code-reviewer` re-run clean; each audit row marked FIXED / WONTFIX (reason); draft PR opened with deploy commands, including the manual dashboard steps (sign-ups off, leaked-password protection on — M11); L11/L12 marked WONTFIX (other apps / backup schema, out of scope).
Size: 1 smart-zone
Status: todo
