# 0003 — PO and PI numbers are unique per site

Status: accepted (2026-11-15)

Unique indexes on `(site_id, lower(btrim(po_number)))` and `(site_id, lower(btrim(pi_number)))`. Production had no duplicates when checked (14 Nov 2026). Upload "replace" can then never hit the wrong record (audit H4).
