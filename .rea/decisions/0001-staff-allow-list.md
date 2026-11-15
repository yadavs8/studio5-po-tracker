# 0001 — Staff allow-list guards all Studio5 data

Status: accepted (2026-11-15; owner said "take the recommended option")

## Context
Every Studio5 table and the `studio5-documents` bucket allowed any authenticated user full access. The Supabase project is shared with other apps and the publishable key is public, so any account created on the project could read and wipe all Studio5 financials (audit C1, H1, H2).

## Decision
Add a `public.staff` table and a `public.is_staff()` SECURITY DEFINER function. Every Studio5 table and the `studio5-documents` bucket get an additional **restrictive** policy `using (is_staff())`. The migration enrols the auth users that exist when it is applied (today: exactly one — the owner, also used by the Tally agent). New people are added with one `insert into staff`. Public sign-ups should be switched off in the dashboard as well.

## Consequences
Other accounts on the shared project lose access to Studio5 data (intended). Other apps' tables are untouched. Policies only get stricter.
