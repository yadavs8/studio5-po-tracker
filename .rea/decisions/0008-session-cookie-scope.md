# 0008 — Session cookie scoped to the app path

Status: accepted (2026-11-15)

The app stays on `yadavs8.github.io/studio5-po-tracker`. The Supabase auth cookie is scoped to path `/studio5-po-tracker` with a 30-day lifetime, `SameSite=Lax`, `Secure` on https. A custom domain remains the stronger fix and is recommended later. Audit M8.
