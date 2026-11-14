# Brief — production hardening

## Goal
Make Studio5 PO Tracker production-ready: every issue in `.rea/audit.md` fixed (Critical → High → Medium → Low) or explicitly WONTFIX with a reason, with tests proving each fix.

## Context
See `.rea/audit.md` (52 findings, verification method per finding). Key facts: static export on GitHub Pages, no server code — RLS is the only security boundary; the Supabase project `studio5-portal` is shared with other apps; no tests exist; live data is clean (no duplicate numbers, no over-allocations).

## Decisions resolved
- (from the user's rules) Never delete production data; never weaken RLS; ask before any destructive migration; DB changes are new migrations only (`supabase/migration_013…`), never edits to applied files; ask when a business rule is unclear.
- Work happens on branch `rea-production-audit`; ship via PR, never push to main.

## Open questions
D1–D10 in `.rea/audit.md` § NEEDS DECISION.

## Scope
In: everything in `.rea/audit.md` except items marked out of scope. Out: other apps' tables on the shared project (`generated_documents`, `doc_number_sequences`, `trusted_devices`, kharcha/trips tables), the `backup_20261031` schema, the Render extract backend (separate repo), building credit/debit notes / variations unless D10 says so.
