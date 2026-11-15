# Studio5 PO Tracker — Production-readiness audit

Audit date: 14 Nov 2026 · Branch: `rea-production-audit` · Base commit: `205ccb5`
Status: updated 15 Nov 2026 after the fixes (branch `rea-production-audit`). 46 FIXED, 1 MANUAL, 5 WONTFIX (with reasons).

## How this was audited

| Source | What it covered |
|---|---|
| `npm run build`, `tsc --noEmit`, `npm run lint`, `npm audit` | Build, types, lint, dependencies |
| Live Supabase project `studio5-portal` (read-only: policies, indexes, advisors, data sanity counts — no writes) | Real RLS, drift, data health |
| Local Supabase (Docker) with the repo's applied chain `studio5_schema.sql` + `migration_002…012`, seeded with synthetic data | Reproducing money bugs in SQL and in the browser |
| Playwright crawl of all 17 routes, desktop 1366px + mobile 390px, signed in | Crashes, console errors, failed requests, overflow, screenshots |
| REA `security-scanner` and `bug-scanner` agents + manual code reading of `src/`, `supabase/`, `tally-agent/`, `scripts/`, CI | Logic and security |

Each finding says how it was verified: **[repro-browser]**, **[repro-sql]**, **[live-db]** (seen in production data/config), **[code]** (by reading code; not executed), **[unverified]**.

### Facts that change the shape of the prompt's checklist
- The app is a **static export on GitHub Pages** (`next.config.ts: output: "export"`). There are **no API routes, no server actions, no server components fetching data, no CORS surface of our own**. Every query runs in the browser with the publishable key. **Postgres RLS + grants are the only security boundary.**
- There are **no vendors** in this app (the client is the counterparty; there is no vendor table). "Vendors" in the checklist maps to *clients & sites* here.
- The Supabase project `studio5-portal` is **shared with other apps** (doc generator: `generated_documents`, `doc_number_sequences`; Kharcha/trips: `daily_expenses`, `trips`, …). Any RLS change must not touch those tables.
- There are **no tests** in the repo.

### Totals
| Severity | Count |
|---|---|
| Critical | 4 |
| High | 13 |
| Medium | 19 |
| Low | 16 |
| **Total** | **52** |

---

## Critical

| ID | Area | Issue | Where | Verified | Repro | Proposed fix | Status |
|---|---|---|---|---|---|---|---|
| C1 | Security | **Any signed-in account has full read/write/delete on every Studio5 table and every stored document.** Policies are `to authenticated using (true)` (or only a date filter). No policy checks *who* the user is; `app_user` is empty and unused. The project URL + publishable key are public (they ship in the JS bundle and in `tally-agent/env.example.txt`). If public sign-ups are on — or if any other app on this shared project creates a user — that user owns all Studio5 financials. | `migration_002.sql:81,104-106`, `006:39`, `008:19`, `009:25`, `011:39-42`; live `pg_policies` | [live-db] policies confirmed; 1 auth user today. Sign-up setting not readable via SQL — **[unverified]** whether it is on. | `supabase.auth.signUp(...)` with the public key → `from('payment').select('*')`, `from('client').delete()`, `storage.from('studio5-documents').list()` | New migration: `staff` allow-list table + `is_staff()` SECURITY DEFINER fn; add **restrictive** `is_staff()` policies on all Studio5 tables + `studio5-documents` storage. Never touches the other apps' tables. Also: switch sign-ups off in dashboard. | FIXED — migration_013 staff allow-list + restrictive policies (test 10_access). Manual: switch off sign-ups (runbook step 2) |
| C2 | Money | **Receipts are double-counted per PO** when a payment tagged to PO X is matched to an invoice of PO Y: `tag` counts it under X and `alloc_other` counts it again under Y. Flows into the **client-facing Account statement**. | `migration_004.sql:20-31,53-56` (`v_po_summary`); `site/statement/page.tsx:106,116` | [repro-sql] + [repro-browser] (statement TOTAL "Payment received ₹2,00,000" vs ₹1,00,000 in bank) + **[live-db] 1 such allocation of ₹1,06,254 exists in production today** | Payment ₹1L tagged PO-X, allocated to INV on PO-Y → both POs show ₹1L received | New migration recreating `v_po_summary`: allocations count under the invoice's PO; a tagged payment counts under its PO only for its *unallocated* remainder. Same rule in statement page. | FIXED — migration_014 v_po_summary + lib/statement.ts (tests 20_money_views, statement.test, e2e) |
| C3 | Money | **Cancelled (and draft) invoices are counted** in billed, outstanding, ageing, chase list, billing %, and shown with status "Issued". No view filters `tax_invoice.status`; the Edit drawer allows setting `cancelled`. | `studio5_schema.sql` (`v_site_dashboard`), `migration_003.sql` (`v_normal_outstanding`, `v_invoice_settlement`), `migration_004.sql` (`v_po_summary`), `migration_008.sql` (`v_todo`) | [repro-sql] + [repro-browser] (INV-2 cancelled ₹2,36,000 shown "Issued", still to pay ₹2,36,000). [live-db] no cancelled invoices yet → latent. | Edit invoice → Status = Cancelled → totals unchanged | New migration recreating the views with `status not in ('cancelled','draft')`; computed status returns `cancelled`. | FIXED — migration_014 excludes cancelled/draft everywhere |
| C4 | Money / data | **Pre-1 Aug money is invisible, so outstanding is understated.** RLS hides every row dated before `reporting_start()` = 2026-08-01. In production **41 of 43 invoices and 45 of 50 payments** are pre-cutoff. Brought-forward code (`loadBroughtForward`) can never see those rows, so it is always 0 — the "Brought forward" lines promised in Reports/Statement never appear. A post-Aug payment against a July invoice cannot be matched (insert policy + `fn_integrity` refuse it). | `migration_011.sql`; `src/lib/period.ts:37-74`; `reports/page.tsx:93,136`; `site/statement/page.tsx:69` | [live-db] counts; [code] brought-forward dead path | July invoice ₹5L unpaid → outstanding shows ₹0; September receipt for it stays "Needs matching" | **NEEDS DECISION D2.** Either (a) a SECURITY DEFINER `v_brought_forward` per site (staff-only) feeding the existing UI, and allow matching to pre-cutoff invoices; or (b) delete the dead brought-forward code + labels and document that pre-Aug dues are tracked elsewhere. | FIXED — migration_016 brought_forward() staff-only totals (ADR 0002). Matching to pre-1 Aug invoices: out of scope |

## High

| ID | Area | Issue | Where | Verified | Proposed fix | Status |
|---|---|---|---|---|---|---|
| H1 | Security | Storage bucket `studio5-documents` has **no size limit or MIME allow-list**; any authenticated user can overwrite (`upsert`) or delete any file. Client-side checks only (`documents.ts:76`, `extractApi.ts:90-91`). | `migration_002.sql:99-106` | [live-db] `file_size_limit=null, allowed_mime_types=null` | New migration: 25 MB limit + MIME allow-list (pdf/png/jpeg/webp/docx/xlsx — confirm list, D6); split storage policy into select/insert/delete with `is_staff()`, no update. | FIXED — migration_013: 25 MB, MIME allow-list, staff-only, no overwrite |
| H2 | Security / audit | **Tally lock and audit trail can be bypassed.** `fn_tally_lock` trusts `tally_sync_log`, which any user can update (`set sync_status='failed'` → lock released). `audit_log` accepts direct inserts with any `changed_by` (forgery). Inserts into money tables are not audited (triggers are `after update or delete` only). | `migration_006.sql:56-77`, `002:54-66,81` | [code] + [live-db] policy `p_authenticated_all` on both tables | New migration: revoke insert/update/delete on `audit_log` & `tally_sync_log` from `authenticated` (select only); Tally status changes via SECURITY DEFINER RPC for the Tally agent user; add `after insert` audit triggers. **Check tally-agent writes first.** | FIXED — migration_013/015: logs read-only, tally_queue/tally_mark, insert audit, wider Tally lock |
| H3 | Money | **Editing an amount can leave an invoice/payment over-settled.** `fn_integrity` checks allocation/deduction rows, but not lowering `tax_invoice.gross_invoice_value` or `payment.amount_received`. | `migration_005.sql:18-82`; edit at `site/page.tsx:384`, `upload/page.tsx:416-424` | [code] | New migration: add tax_invoice + payment branches to `fn_integrity` (reject if new amount < already settled/allocated). | FIXED — migration_015 fn_integrity |
| H4 | Data | **No unique PO / PI number per site.** Upload "replace" looks up by number with `.limit(1).maybeSingle()` (unordered) — with duplicates it can overwrite the wrong record, and it deletes the old file. | `detector.ts:232-253`, `upload/page.tsx:197,357-449`; schema has only `uq_invoice_number_per_site` | [live-db] no duplicates exist today → safe to add | New migration: unique index on `(site_id, lower(btrim(po_number)))` and same for PI. **D3** confirms. | FIXED — migration_015 unique indexes with duplicate preflight |
| H5 | Upload UX/data | Replace is **on by default** (`overrideChoice ?? true`); lookup is debounced 350 ms + network and Save is not blocked while it's pending (creates duplicates); lookup errors treated as "no match". | `upload/page.tsx` | [code] | Require explicit choice when a match exists; disable Save while lookup pending; surface lookup errors. | FIXED — upload: explicit replace, save waits for lookup, lookup errors shown |
| H6 | Upload | A site **picked by hand is overwritten** by the file-name guess; the AI result clears chosen PO/PI links (`chooseSite` re-runs for the same site) → invoice saved without `p_pi_id`, PI stays open. | `upload/page.tsx:225,280` | [code] | Keep `site` in `touched` whenever set; only call `chooseSite` when the site actually changes. | FIXED — upload: hand-picked site and links kept |
| H7 | Runtime | **Payments page white-screens** after switching site with the match drawer open (`payments.find(...)!` → undefined). | `payments/page.tsx:155-157` | [code] | Reset drawer state on site change; guard undefined. | FIXED — payments drawer guarded and keyed (e2e step) |
| H8 | Data | **Supabase 1000-row cap silently truncates totals.** Whole-table selects in `period.ts` (Dashboard, All-sites report), `reports/page.tsx:89,131,165` (all deductions/invoices/allocations), `documents.ts:155` (`limit(2000)` capped at 1000). | as listed | [code]; tables are small today (≤ 210 rows) | Filter server-side by site / `in(...)`; page with `.range()` helper; or aggregate in SQL views. | FIXED — lib/fetchAll.ts everywhere a whole table is read |
| H9 | Security | **Old `supabase/migrations/2026*.sql`** create 8 tables **without RLS** and an RPC with no revoke. If anyone runs them (Supabase CLI `db push` picks this folder up automatically!) they are world-readable/writable with the public key. `supabase/seed.sql` targets that old model (`clients`, `payment_allocations`) and fails on the real schema. | `supabase/migrations/20260920_*.sql`, `supabase/seed.sql` | [code] | Move both to `supabase/archive/` with a header; replace `seed.sql` with a seed for the real schema (used by tests). | FIXED — moved to supabase/archive/, new seed_test.sql |
| H10 | Build | **`npm run lint` fails: 22 errors, 8 warnings.** 11 × `react-hooks/set-state-in-effect`, 8 × `no-explicit-any` (scripts), 3 × `no-require-imports` (scripts), 7 × `exhaustive-deps`, 1 unused var. | see lint log | [repro] | Fix in code (src); lint-ignore or type `scripts/` & `tally-agent/` properly. CI should run lint + tests. | FIXED — 0 errors, 0 warnings; CI gates on lint |
| H11 | Deps | `npm audit`: **26 vulns (1 critical, 9 high, 15 moderate, 1 low)**. `next` 16.3.5 critical (server-side; not exploitable in static export but bump is non-breaking → 16.4.6). Most others come from **`shadcn` CLI listed as a runtime dependency** and never imported. `xlsx` 0.18.5 (prototype pollution/ReDoS in *parsing*; we only write) has no npm fix. | `package.json` | [repro] | Bump `next` + `eslint-config-next`; remove unused deps (L-list); move `xlsx` to SheetJS CDN tarball 0.20.x (official distribution). | FIXED — 26 → 9; next 16.4.6, zod 4.6.7, 13 unused deps removed. Remaining: minimatch (dev lint tooling only, fix needs a downgrade) and xlsx (WONTFIX here: write-only use; fixed build only on cdn.sheetjs.com, blocked from this environment — one-line upgrade in README) |
| H12 | Tests/CI | **No tests and CI only builds** — `pages.yml` deploys on every push to `main` without lint/typecheck/tests; workflow-wide `pages: write`/`id-token: write`. | `.github/workflows/pages.yml` | [code] | Add vitest unit tests + SQL tests against local Supabase + Playwright smoke; CI job `check` (lint, tsc, unit) gating deploy; move permissions to deploy job. | FIXED — vitest (45), SQL tests (incl. upgrade guards), Playwright smoke + flows; CI check job gates deploy |
| H13 | Money | **Blank GST saves gross = taxable** (₹1,00,000 instead of ₹1,18,000) in Upload and Tax-invoice forms; AI path ignores the read total when GST parts are missing. | `upload/page.tsx:311,324,414`, `invoices/page.tsx:229`, `detector.ts:320` | [code] | **D4.** Require GST (0 allowed explicitly) or derive GST = total − taxable and warn on mismatch. | FIXED — lib/money.ts resolveGst in every invoice form, upload, edit drawer (ADR 0004) |

## Medium

| ID | Area | Issue | Where | Verified | Proposed fix | Status |
|---|---|---|---|---|---|---|
| M1 | Data | Switching client A→B keeps A's `siteId` (dropdown blank, "+ Add" writes to A's site). Switching site keeps `subProjectId` (lists empty, creates fail). | `invoices/page.tsx:57,63-69`, `payments/page.tsx:55`, `po-pi/page.tsx:46,53-58` | [code] | Reset dependent state in change handlers (also fixes the set-state-in-effect lint errors). | FIXED |
| M2 | Money | **No way to release retention** in the UI; while pending it counts as settled, so a `retention_release` payment is refused by `fn_integrity`. `retention_ledger` + Handover+DLP maturity from PROJECT_RULES §4 don't exist. | `migration_005`, UI | [code] | **D5** (business rule). Minimum: "Mark released" action on a hold. | FIXED — "Mark released" (ADR 0005); retention_ledger + DLP maturity deferred |
| M3 | Tax | TDS `deduction_date` defaults to the entry date, not the invoice date → March invoice entered in April lands in next FY in `v_tds_credit`. | `invoices/page.tsx:278` | [code] | Default `deduction_date` to `invoice_date`. **D7** confirms. | FIXED — deduction_date = invoice date (ADR 0007) |
| M4 | Errors | Supabase errors ignored → silently shows ₹0 / empty: `invoices/page.tsx:65-67,80,85`; `payments/page.tsx:56,71`; `statement/page.tsx:71,80`; `audit.ts:30`; `documents.ts:107,118`. | as listed | [code] | Check `error` everywhere; show `friendlyError`. | FIXED |
| M5 | Storage | Failed inserts leave orphan files + `document` rows (`po-pi/page.tsx:241,299` don't call `discardDocument`). | as listed | [code] | Discard on failure. | FIXED |
| M6 | Race | Out-of-order responses on fast site switching show the previous site's settlement figures (no alive/sequence guard; map not cleared). | `invoices/page.tsx:71-92` | [code] | Request-sequence guard. | FIXED — request counters / alive guards on list pages |
| M7 | Detector | Type order PI→PO→Invoice: "Tax Invoice against PO 4500.pdf" is detected as a PO (and saved as a PO when AI is skipped for .xlsx/.doc). Client-name keywords tie across all sites of a client (alphabetical first wins). Dates like 2026-02-30 accepted. | `detector.ts:85-142,179` | [code] | Prefer the most specific type phrase; break site ties by site-specific tokens only; validate calendar dates. Unit-tested. | FIXED — detector.test.ts |
| M8 | Security | Session cookie from `@supabase/ssr` defaults (`path=/`, not httpOnly, 400-day maxAge) on the shared origin `yadavs8.github.io` → any other Pages site of yours can read it. | `src/lib/supabase.ts` | [code] | **D8.** Custom domain/subdomain (best) or set cookie `path` to `/studio5-po-tracker` + shorter maxAge. Also fix stale "proxy.ts" comment. | FIXED — cookie path /studio5-po-tracker, 30 days (ADR 0008); custom domain still recommended |
| M9 | Security | 6 functions have mutable `search_path` (`fn_audit_log_immutable`, `fn_integrity`, `fn_tally_lock`, `record_tax_invoice`, `record_payment`, `reporting_start`). | live advisor | [live-db] | New migration: `alter function … set search_path = public`. | FIXED — migration_015 |
| M10 | Security | `fn_audit_row` and `fn_file_document` (SECURITY DEFINER trigger fns) are EXECUTE-able by anon/authenticated via `/rpc` (advisor). Not directly exploitable (trigger fns error when called outside a trigger) but noisy. | live advisor | [live-db] | Revoke EXECUTE from public/anon/authenticated. | FIXED — migration_013/015 |
| M11 | Security | Auth: leaked-password protection disabled. | live advisor | [live-db] | Dashboard toggle (manual step, listed in deploy). | MANUAL — dashboard toggle, runbook step 2 (not settable from code) |
| M12 | Perf | 16 unindexed foreign keys (Studio5 ones: `proforma_invoice.po_id`, `tax_invoice.pi_id`, `payment_allocation.sub_project_id`, `*.document_id` …). | live advisor | [live-db] | New migration adding the Studio5 FK indexes (not the other apps'). | FIXED — migration_015 |
| M13 | UX | Raw DB errors shown to users: `/site/?id=bad` → "invalid input syntax for type uuid…"; `/pi/?id=<missing>` → "Cannot coerce the result to a single JSON object". `/po/` without id still shows "Upload revision" buttons. | site, pi, po pages | [repro-browser] | Validate id; "Not found" state; map PGRST116 / 22P02 in `friendlyError`. | FIXED |
| M14 | UX | Mobile: Account statement overflows by **475 px**; site page by 19 px. | `site/statement/page.tsx`, `site/page.tsx` | [repro-browser] 390 px | Wrap tables in horizontal scroll containers; stack header buttons. | FIXED — e2e checks 390 px |
| M15 | Validation | No input validation layer: `zod` / `react-hook-form` are deps but unused. DB checks are the only guard (good backstops exist: positive amounts, GST adds up, same-site trigger, unique invoice no.). | all forms | [code] | Small shared zod schemas for PO / PI / invoice / payment used by forms + upload. | FIXED — lib/validation.ts (zod) |
| M16 | Money | Upload "replace PO" updates `total_value_with_gst` but leaves `taxable_value` / `gst_amount` stale. | `upload/page.tsx:385` | [code] | Update all three. | FIXED |
| M17 | Money | PI status can be hand-edited back from `converted_to_invoice`; `record_tax_invoice` then re-converts and overwrites `converted_invoice_id`. | `site/page.tsx:425` | [code] | Disallow leaving `converted_to_invoice` in UI + trigger. | FIXED — migration_015 + edit drawer |
| M18 | Money | Statement TOTAL "Balance" adds PO-based balances (PO − received − TDS) to invoice-based balances for no-PO invoices (mixed definitions). | `site/statement/page.tsx` | [code] | **D9.** | FIXED — separate totals (ADR 0009) |
| M19 | Docs | README says copy `.env.local.example` — no such file (all `.env*` are gitignored). No documented env vars list. | `README.md`, `.gitignore` | [repro] | Add committed `.env.example` (`!.env.example` in gitignore). | FIXED — .env.example, README |

## Low

| ID | Issue | Where | Proposed fix | Status |
|---|---|---|---|---|
| L1 | `new Date('YYYY-MM-DD')` parses as UTC: ageing days off by one in the first 5½ h of each IST day; dates shift outside IST. | `format.ts:18`, `reports/page.tsx:140` | Parse as local date / format with `timeZone: 'Asia/Kolkata'`; tested. | FIXED |
| L2 | Tower sheet "TDS" column also includes penalty & discount deductions. | `reports/page.tsx:109` | Separate column or filter. | FIXED — own column |
| L3 | Records hidden by the date filter still leak via `document`, storage and `audit_log.old_value`. (Business filter, not security.) | migration_011 | Document; resolved with D2. | WONTFIX — the 1-Aug rule is a business filter; those rows are now staff-only like everything else |
| L4 | `window.open(url,'_blank')` without `noopener`. | `document/page.tsx:56` | Add `noopener,noreferrer`. | FIXED |
| L5 | Tally agent user has full access (see C1); should be a narrower role. | `tally-agent/agent.js` | Covered by `staff` table role column; narrow later. | WONTFIX — one-person team: the agent login is staff; a narrower role can come with more users |
| L6 | Unused deps: `@anthropic-ai/sdk`, `@base-ui/react`, `@hookform/resolvers`, `@tanstack/react-table`, `class-variance-authority`, `clsx`, `tailwind-merge`, `shadcn`, `tw-animate-css`, `@supabase/supabase-js` (transitive via ssr), `cn` (re-exported in `utils.ts`, never imported); dev `pdf-parse`, `autoprefixer`. | `package.json` | Remove (zod kept if M15 adopted). | FIXED |
| L7 | Dead code: `src/lib/utils.ts`; `loadBroughtForward` (see C4). | | Remove / resolve. | FIXED |
| L8 | CI: actions pinned to tags not SHAs; `pages`/`id-token` permissions on the build job. | `pages.yml` | Pin + scope to deploy job. | FIXED |
| L9 | `<img>` instead of `next/image` warning (fine for static export with `unoptimized`; silence explicitly). | `document/page.tsx:139` | eslint-disable with reason. | FIXED |
| L10 | Duplicate `@AGENTS.md` import in `CLAUDE.md` after REA install. | `CLAUDE.md` | Keep one. | FIXED |
| L11 | Live DB has a `backup_20261031` schema with 6 PK-less tables (not exposed via API). | live | Owner decides whether to drop (**not touched**). | WONTFIX — not this app's schema; owner decides (untouched) |
| L12 | `generated_documents`, `doc_number_sequences`, `trusted_devices` have RLS on and no policies (other apps; deny-all is probably intended). | live | Out of scope — other repos. | WONTFIX — other apps' tables (untouched) |
| L13 | `formatDate` uses runtime locale timezone; statement "As on" date same. | `format.ts` | Covered by L1. | FIXED |
| L14 | PI/PO detail page "No order ID specified" sets state in effect (lint) and shows actions with no record. | `po/page.tsx:60`, `pi/page.tsx:48` | Covered by M13. | FIXED |
| L15 | `tally-agent/agent.js:24` unused `ymd`. | | Remove. | FIXED |
| L16 | Statement "Particulars" column always empty when PO has no scope description. | statement | Fall back to PO number / "—". | FIXED |

---

## Runtime results (Playwright, signed in, synthetic data)
- 17 routes × 2 viewports: **no crashes, no hydration errors, no console errors on valid routes.**
- Failed requests only on invalid ids (HTTP 400 `22P02`, HTTP 406 `PGRST116`) → M13.
- Mobile overflow → M14.
- Forms were exercised by reading code + SQL reproduction; interactive form runs (create/edit/delete each entity) are part of Step 4 verification once tests exist.

## NEEDS DECISION (business rules — I will not guess)
| # | Question | Blocks |
|---|---|---|
| D1 | Who may use the portal? Only you (the one existing login) + the Tally agent login? Is it OK that I add a `staff` allow-list and that **any other account on the shared project loses access to Studio5 data**? Are public sign-ups currently off? | C1, H1, H2 |
| D2 | Pre-1 Aug invoices/payments: should money still owed on them count in outstanding and be matchable to later receipts (brought forward), or is the portal deliberately "fresh from 1 Aug" and pre-Aug dues tracked elsewhere? | C4 |
| D3 | Are PO / PI numbers unique per site (case/space-insensitive)? | H4 |
| D4 | May GST be blank? Is 0 % GST a real case? When totals and parts disagree, which wins? | H13 |
| D5 | Retention: do you want a "release" action now, and should pending retention count as *settled* (invoice shows "fully settled" while money is held)? Full `retention_ledger` + DLP maturity now or later? | M2 |
| D6 | Allowed upload file types (PDF, JPG/PNG/WEBP, DOCX, XLSX?) and max size (25 MB?). | H1 |
| D7 | TDS financial year: by invoice date (my default) or by the date TDS was deducted/certificate date? TDS 194C base: taxable value or gross? | M3 |
| D8 | Can the app get its own domain/subdomain (best fix for shared-origin cookies), or keep `yadavs8.github.io` with a path-scoped cookie? | M8 |
| D9 | Statement TOTAL balance: PO-based for everything, or show PO balance and no-PO invoice balance as two separate totals? | M18 |
| D10 | Five-tier model gaps — credit/debit notes, PO variations/amendments, draft POs in contract value: build now, or out of scope for this hardening pass? | (scope) |


---

## Found and fixed during the work (not in the first audit)
| ID | Issue | Fix |
|---|---|---|
| N1 | `fn_integrity` ran with the user's rights, so its "already settled" sums missed rows hidden by the 1-Aug rule and could under-count | migration_015: SECURITY DEFINER, staff-guarded |
| N2 | Tally lock did not cover status (cancelling a booked invoice), dates, PO link, or TDS entries | migration_015 fn_tally_lock |
| N3 | Tally agent could post a voucher twice if recording the result failed | agent retries, then stops |
| N4 | `extractTextPreview` dropped the last run of text in a file | detector.ts (test) |
| N5 | Saving a half-empty PO / PI form did nothing at all, no message | validation.ts |
| N6 | Form labels were not linked to inputs (screen readers) | ui.tsx useId |
| N7 | Upload lookup: PostgREST treats `*` as a wildcard, so "replace" could match another record | exact re-check |
| N8 | In the new brought-forward code: an old advance matched to a new invoice was subtracted twice | migration_016 (test) |

## Remaining low items (reviewers' notes, not fixed in this pass)
- Upload: a failed "does this number exist" check is retried only when the number is retyped.
- Reports: the site picker lists only sites with invoices from 1 Aug, so a site with only brought-forward money cannot be exported per tower.
- Detail pages (site, PO, PI, document) have no stale-reply guard when the id in the link changes quickly; a failed reload keeps the previous record under the error banner.
- Validation rejects amounts typed as `.5` or `5.` (a clear message is shown).
- `brought_forward.balance` counts pending holds as owed while invoice balances show them separately (as before; a reporting choice).
