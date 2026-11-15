# Studio5 Project Tracker

Tracks every Studio5 site: purchase orders, proforma invoices, tax invoices, money received and work progress.
Next.js + Supabase. Static site on GitHub Pages: https://yadavs8.github.io/studio5-po-tracker/ (every push to `main` redeploys).

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run dev` then open http://localhost:3000

## Database (Supabase SQL editor, in this order, once)
`supabase/studio5_schema.sql`, then `migration_002.sql` … `migration_016_*.sql` in number order (`migration_006.sql` runs in two steps, see its header; `migration_013` needs the staff email line, see below).
The old, unrelated model is kept in `supabase/archive/` only for reference — never run it.
Create the login user under Authentication → Users and **switch off public sign-ups** (Authentication → Sign In / Providers).

### Who can see the data
Only logins listed in `public.staff` can read or change anything (the project is shared with other apps).
Add someone: `insert into public.staff (user_id, note) select id, 'name' from auth.users where email = 'them@example.com';`

### Upgrading the live database (migrations 013–016), in this order
Each step is safe to run again. The current site keeps working after every step, so the database goes first and the new site last.
1. Take a backup (Database → Backups, or `pg_dump`).
2. Authentication settings: switch off public sign-ups; switch on leaked-password protection.
3. SQL editor — `migration_013_staff_access.sql`, with this line pasted **first** (your own login email; add the Tally agent's login if it has its own):
   `set studio5.staff_emails = 'you@example.com';`
   Check: `select u.email from public.staff s join auth.users u on u.id = s.user_id;` lists exactly the right people.
4. On the Tally PC: pull this repo and restart the agent (it now records results through `tally_mark`).
5. SQL editor — `migration_014_money_views.sql`, then `migration_015_integrity.sql` (if it stops on duplicate PO/PI numbers, fix those rows and run it again), then `migration_016_brought_forward.sql`.
6. Merge the pull request into `main`; GitHub Pages redeploys the site.
7. Open the site, sign in, and check a site page and its Account statement.
Each migration's header says exactly what it changes and how to roll it back.

## Tests
- `npm test` — unit tests (vitest). `npm run typecheck`, `npm run lint`.
- Database and browser tests use a **local** Supabase in Docker (never the live project):
  1. `npx supabase --workdir test/supabase start`
  2. `npm run test:db` — rebuilds the local database from `supabase/`, re-applies every new migration to prove it is safe to re-run, loads `supabase/seed_test.sql` and runs `supabase/tests/*.sql`.
  3. `npm run test:e2e` — starts the app against the local stack and checks every page on desktop and phone, plus the main flows.
- CI runs lint, typecheck and unit tests on every push and pull request; Pages deploys only from `main` after they pass.

## Deploy (GitHub Pages)
The workflow in `.github/workflows/pages.yml` builds a static export and publishes it. In the repo settings set Pages → Source = GitHub Actions, and add two Actions secrets:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the *publishable* key only — never the secret key).
Automatic document reading: the Upload page sends PDFs and images to the Render backend (`POST /po-extract`, see `src/lib/extractApi.ts`), which reads them with Claude as the signed-in user. The backend needs `ANTHROPIC_API_KEY`, `PO_SUPABASE_URL` and `PO_SUPABASE_ANON_KEY` set for this project. Set `NEXT_PUBLIC_EXTRACT_URL` to point at a different backend.

## Documents
Every uploaded file is filed under its site (`migration_012.sql`): POs / work orders, proforma invoices, tax invoices, payment advices, challans, TDS certificates, letters and anything else.
- **Upload document** reads the file, picks the site and kind, and saves it. A PO, PI or tax invoice also creates (or replaces) its record; the other kinds are filed only and can be linked to a work order.
- **Documents** (side menu) lists every file across all sites, with search and filters. Each site page has the same list for that site.
- A database trigger files any document attached to a PO, PI, invoice or payment from any page, so nothing ends up unfiled.

## Known limits
- `xlsx` 0.18.5 (Excel export) has advisories in its *file-reading* code; the app only writes files. To move to the
  fixed release: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (SheetJS publishes fixes only there).
- The login cookie is limited to this app's path; a custom domain would isolate it from other GitHub Pages sites.
