-- ============================================================================
-- Studio5 migration 010 — a subject line for each proforma invoice.
-- What the PI is for ("Tile Work on Lily Pond"), shown as its line on the
-- account statement. remarks stays the work status / note.
-- The doc generator's migration_002_issue_flow.sql adds the same column and
-- fills it for PIs it creates; whichever runs first creates it.
-- Run after migration_009.sql.
-- ============================================================================
alter table proforma_invoice add column if not exists subject text;
