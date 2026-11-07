# Studio5 Project Tracker

Tracks every Studio5 site: purchase orders, proforma invoices, tax invoices, money received and work progress.
Next.js + Supabase. Static site on GitHub Pages: https://yadavs8.github.io/studio5-po-tracker/ (every push to `main` redeploys).

## Run locally
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run dev` then open http://localhost:3000

## Database (Supabase SQL editor, in this order, once)
`supabase/studio5_schema.sql`, then `migration_002.sql` … `migration_005.sql`.
Then create the login user under Authentication → Users and switch off public sign-ups.

## Deploy (GitHub Pages)
The workflow in `.github/workflows/pages.yml` builds a static export and publishes it. In the repo settings set Pages → Source = GitHub Actions, and add two Actions secrets:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the *publishable* key only — never the secret key).
Automatic document reading: the Upload page sends PDFs and images to the Render backend (`POST /po-extract`, see `src/lib/extractApi.ts`), which reads them with Claude as the signed-in user. The backend needs `ANTHROPIC_API_KEY`, `PO_SUPABASE_URL` and `PO_SUPABASE_ANON_KEY` set for this project. Set `NEXT_PUBLIC_EXTRACT_URL` to point at a different backend.
