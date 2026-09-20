# Studio5 Project Tracker

Tracks every Studio5 site: purchase orders, proforma invoices, tax invoices, money received and work progress.
Next.js + Supabase. Deployed on Render from the `main` branch on GitHub (every push redeploys).

## Run locally
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run dev` then open http://localhost:3000

## Database (Supabase SQL editor, in this order, once)
`supabase/studio5_schema.sql`, then `migration_002.sql` … `migration_005.sql`.
Then create the login user under Authentication → Users and switch off public sign-ups.

## Deploy (Render)
Render reads `render.yaml`. Set two environment variables in the Render dashboard:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the *publishable* key only — never the secret key).
Push to `main` to deploy.
