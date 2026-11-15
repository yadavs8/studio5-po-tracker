# 2026-11-15 — production hardening (plan 0001)

Audit (.rea/audit.md): 52 findings → 46 FIXED, 1 MANUAL, 5 WONTFIX, + 8 found and fixed along the way.
Migrations 013–016 written and tested locally; NOT applied to production (owner runs the README runbook).

Root causes worth remembering:
- Every Studio5 policy was `to authenticated using (true)`; the Supabase project is shared, so "signed in" ≠ "staff". → [[0001-staff-allow-list]]
- v_po_summary counted a tagged payment under its PO AND under the PO of the invoice it paid.
- Trigger functions running as the user cannot see rows hidden by RLS: integrity sums must be SECURITY DEFINER.
- PostgREST caps every response at 1000 rows silently; PostgREST also turns `*` into a wildcard in ilike.
- `new Date('YYYY-MM-DD')` is midnight UTC: format date-only values with timeZone UTC, timestamps in Asia/Kolkata.

Test harness: `npx supabase --workdir test/supabase start` → `npm run test:db` (upgrade-path guards + idempotency) → `npm run test:e2e`.
