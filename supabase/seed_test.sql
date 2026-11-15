-- Synthetic business fixtures for the SQL tests (scripts/test-db.sh). Never run on production.
insert into client (client_id, legal_name, display_name, default_tds_pct) values
  ('c1111111-0000-0000-0000-000000000001', 'Test Hotels Pvt Ltd', 'Test Hotels', 2);
insert into site (site_id, client_id, site_name, status) values
  ('51111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 'Test Hotels - Pune', 'active'),
  ('51111111-0000-0000-0000-000000000002', 'c1111111-0000-0000-0000-000000000001', 'Test Hotels - Goa',  'active');
insert into purchase_order (po_id, site_id, po_number, po_date, taxable_value, gst_amount, total_value_with_gst) values
  ('a1111111-0000-0000-0000-00000000000a', '51111111-0000-0000-0000-000000000001', 'PO-X', '2026-08-05', 1000000, 180000, 1180000),
  ('a1111111-0000-0000-0000-00000000000b', '51111111-0000-0000-0000-000000000001', 'PO-Y', '2026-08-10',  500000,  90000,  590000);
insert into tax_invoice (invoice_id, site_id, po_id, invoice_number, invoice_date, taxable_value, gst_type, gst_amount, gst_rate_pct, gross_invoice_value, status) values
  ('11111111-0000-0000-0000-0000000000a1', '51111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-00000000000b', 'INV-1',   '2026-09-01', 100000, 'cgst_sgst', 18000, 18, 118000, 'issued'),
  ('11111111-0000-0000-0000-0000000000a2', '51111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-00000000000a', 'INV-2',   '2026-09-15', 200000, 'cgst_sgst', 36000, 18, 236000, 'cancelled'),
  ('11111111-0000-0000-0000-0000000000a3', '51111111-0000-0000-0000-000000000001', null,                                   'INV-OLD', '2026-07-10',  50000, 'cgst_sgst',  9000, 18,  59000, 'issued');
insert into payment (payment_id, site_id, po_id, payment_date, amount_received, utr_or_reference) values
  ('b1111111-0000-0000-0000-000000000001', '51111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-00000000000a', '2026-09-20', 100000, 'UTR123'),
  ('b1111111-0000-0000-0000-000000000002', '51111111-0000-0000-0000-000000000001', null,                                   '2026-07-20',  20000, 'UTR-OLD');
insert into payment_allocation (payment_id, invoice_id, amount_allocated) values
  ('b1111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1', 100000),
  ('b1111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-0000000000a3',  20000);
insert into deduction (invoice_id, deduction_type, amount, deduction_date) values
  ('11111111-0000-0000-0000-0000000000a3', 'tds', 1000, '2026-07-10');
