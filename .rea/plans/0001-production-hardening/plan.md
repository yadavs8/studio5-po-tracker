# Plan — production hardening

| Unit | Title | Depends on |
|------|-------|------------|
| U1 | Test harness, local Supabase seed, CI check job | — |
| U2 | Staff-only access: RLS + storage + audit/tally lock-down | U1 |
| U3 | Money views: no double count, exclude cancelled/draft | U1 |
| U4 | Integrity: amount edits, unique PO/PI numbers, PI status, FK indexes, search_path | U1 |
| U5 | Brought-forward summary (staff-only aggregate) | U2, U3, U8 |
| U6 | Upload flow safety: replace choice, lookup race, site/link resets, detector fixes | U4 |
| U7 | Pages: stale filters, error handling, races, payments crash | U3, U4, U5 |
| U12 | Money entry: GST, TDS date, retention release, validation | U7, U6 |
| U8 | Pagination: remove 1000-row truncation | U3 |
| U9 | UX: not-found states, friendly errors, mobile tables, dates in IST | U12 |
| U10 | Code health: lint to zero, deps cleanup + audit, docs, session cookie | U9 |
| U11 | Verify: full suite, browser re-test, security re-scan, audit statuses, ship | U2, U5, U6, U8, U9, U10 |

```mermaid
graph TD
  U1 --> U2 & U3 & U4
  U3 --> U8
  U2 & U3 & U8 --> U5
  U4 --> U6
  U3 & U4 & U5 --> U7
  U7 & U6 --> U12
  U12 --> U9 --> U10
  U2 & U5 & U6 & U8 & U9 & U10 --> U11
```

Units touching the same files (`reports/page.tsx`, `period.ts`, `documents.ts`, `statement/page.tsx`, `upload/page.tsx`) are chained so they run one at a time. `fetchAll` (U8) lands before U5 so brought-forward is not built on a truncating path.
