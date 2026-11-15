# 0002 — Pre-1 Aug dues shown as a staff-only brought-forward summary

Status: accepted (2026-11-15)

## Context
`migration_011` hides every row dated before 2026-08-01. In production 41/43 invoices and 45/50 payments are older, so money still owed on them showed as ₹0 and the brought-forward code could never see anything (audit C4).

## Decision
Keep the "portal starts 1 Aug" row filter. Add a SECURITY DEFINER function `brought_forward(site uuid default null)` that returns **per-site aggregate totals only** (billed, received, tax, held, received since, balance) for pre-cutoff records, callable only by staff. The existing Reports / Statement brought-forward lines read from it. Matching a new receipt to a pre-cutoff invoice stays out of scope (it would need the row filter relaxed — a separate decision).

## Consequences
Outstanding includes old dues without exposing old rows. No RLS policy is loosened.
