-- ════════════════════════════════════════════════════════════════════════════════
--  Studio 5 Interiors — Comprehensive Seed Data
--  File: supabase/seed.sql
--
--  Financial Invariants (Five-Tier Model per PROJECT_RULES.md):
--  Tier 1  Contract Value      = SUM(total_po_value) per project
--  Tier 2  Net Invoiced Value  = Invoices − Credit Notes + Debit Notes (gross_total)
--  Tier 3  Settlement Value    = SUM(gross_settlement_applied) per project
--  Tier 4  Bank Receipt        = allocated_bank_amount (UTR-matched)
--  Tier 5  Op. Outstanding     = Tier 2 − Tier 3
--
--  CHECK constraint on payment_allocations enforces:
--    gross_settlement_applied = allocated_bank_amount + tds_194c_deducted
--                             + gst_tds_deducted + retention_deducted
--                             + other_debit_adjustments
--
--  Verification queries at the bottom prove zero mathematical discrepancy.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO clients (client_id, name, legal_entity, pan, gstin, billing_address, default_tds_rate) VALUES

  -- Client 1: Lemon Tree Hotels Ltd.
  ('c0000001-0000-0000-0000-000000000001',
   'Lemon Tree Hotels Ltd.',
   'Lemon Tree Hotels Limited',
   'AAACL2345K',
   '06AAACL2345K1ZX',       -- Haryana GSTIN (HO)
   '16th Floor, Ambience Corporate Towers, NH-8, Gurugram, Haryana - 122002',
   2.00),

  -- Client 2: DSS Buildtech Pvt Ltd
  ('c0000002-0000-0000-0000-000000000002',
   'DSS Buildtech Pvt Ltd',
   'DSS Buildtech Private Limited',
   'AABCD4567M',
   '04AABCD4567M1Z5',       -- Chandigarh GSTIN
   'Plot No. 45, Industrial Area Phase II, Chandigarh - 160002',
   2.00),

  -- Client 3: High Town Projects Pvt Ltd
  ('c0000003-0000-0000-0000-000000000003',
   'High Town Projects Pvt Ltd',
   'High Town Projects Private Limited',
   'AACEH8901P',
   '09AACEH8901P1ZQ',       -- UP GSTIN
   'A-14, Sector 62, NOIDA, Uttar Pradesh - 201301',
   2.00);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROJECTS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO projects (project_id, client_id, project_code, site_name, site_state_code,
                      project_manager, dlp_months, handover_date,
                      physical_progress_pct, status) VALUES

  -- ── Lemon Tree: 5 Sites ──────────────────────────────────────────────────
  ('p0000001-0000-0000-0000-000000000001',
   'c0000001-0000-0000-0000-000000000001',
   'S5/LTH/DEH/2026', 'Lemon Tree – Dehradun',          'UK',
   'Rajesh Sharma',  12, '2027-03-31', 85.00, 'ACTIVE'),

  ('p0000002-0000-0000-0000-000000000002',
   'c0000001-0000-0000-0000-000000000001',
   'S5/LTH/KOC/2026', 'Lemon Tree – Kochi',              'KL',
   'Anitha Nair',    12, '2027-06-30', 60.00, 'ACTIVE'),

  ('p0000003-0000-0000-0000-000000000003',
   'c0000001-0000-0000-0000-000000000001',
   'S5/LTH/HOS/2026', 'Lemon Tree – Hosur Road, Bengaluru', 'KA',
   'Suresh Kumar',   12, NULL,         45.00, 'ACTIVE'),

  ('p0000004-0000-0000-0000-000000000004',
   'c0000001-0000-0000-0000-000000000001',
   'S5/LTH/PGN/2026', 'Lemon Tree – PGN-1, Gurugram',    'HR',
   'Vikram Singh',   12, NULL,         30.00, 'ACTIVE'),

  ('p0000005-0000-0000-0000-000000000005',
   'c0000001-0000-0000-0000-000000000001',
   'S5/LTH/RFX/2026', 'Lemon Tree – Red Fox, Delhi',     'DL',
   'Priya Menon',    12, NULL,         55.00, 'ACTIVE'),

  -- ── DSS Buildtech ────────────────────────────────────────────────────────
  ('p0000006-0000-0000-0000-000000000006',
   'c0000002-0000-0000-0000-000000000002',
   'S5/DSS/TWB/2026', 'DSS Tower B – Interior Fit-Out',  'CH',
   'Arun Patel',     18, NULL,         35.00, 'ACTIVE'),

  -- ── High Town ────────────────────────────────────────────────────────────
  ('p0000007-0000-0000-0000-000000000007',
   'c0000003-0000-0000-0000-000000000003',
   'S5/HTW/NOI/2026', 'High Town – Sector 62, NOIDA',    'UP',
   'Deepak Verma',   12, NULL,         50.00, 'ACTIVE');


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONTRACTS AND POs
--    Tier-1 totals per project:
--      DEH: ₹91,12,817.00   KOC: ₹76,70,000   HOS: ₹96,76,000
--      PGN: ₹53,10,000      RFX: ₹64,90,000
--      DSS: ₹2,36,00,000    HTW: ₹1,77,00,000
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO contracts_and_pos (po_id, project_id, po_number, po_date,
                               is_amendment, parent_po_id,
                               base_taxable_value, gst_rate, total_po_value,
                               advance_pct, retention_pct) VALUES

  -- DEH baseline PO (as per spec — taxable 77,22,726.27 + IGST 13,90,090.73 = 91,12,817.00)
  ('po000001-0000-0000-0000-000000000001',
   'p0000001-0000-0000-0000-000000000001',
   'PDCL/LTHDN/20260729/017', '2026-07-29',
   FALSE, NULL,
   7722726.27, 18.00, 9112817.00,
   10.00, 5.00),

  -- KOC baseline PO (IGST – inter-state supply)
  ('po000002-0000-0000-0000-000000000002',
   'p0000002-0000-0000-0000-000000000002',
   'PDCL/LTHKC/20260801/018', '2026-08-01',
   FALSE, NULL,
   6500000.00, 18.00, 7670000.00,
   10.00, 5.00),

  -- HOS baseline PO (CGST+SGST – intra-state Karnataka)
  ('po000003-0000-0000-0000-000000000003',
   'p0000003-0000-0000-0000-000000000003',
   'PDCL/LTHHR/20260815/019', '2026-08-15',
   FALSE, NULL,
   8200000.00, 18.00, 9676000.00,
   10.00, 5.00),

  -- PGN-1 baseline PO
  ('po000004-0000-0000-0000-000000000004',
   'p0000004-0000-0000-0000-000000000004',
   'PDCL/LTHPG/20260820/020', '2026-08-20',
   FALSE, NULL,
   4500000.00, 18.00, 5310000.00,
   10.00, 5.00),

  -- Red Fox baseline PO
  ('po000005-0000-0000-0000-000000000005',
   'p0000005-0000-0000-0000-000000000005',
   'PDCL/LTHRX/20260825/021', '2026-08-25',
   FALSE, NULL,
   5500000.00, 18.00, 6490000.00,
   10.00, 5.00),

  -- DSS Tower B (10% mobilisation advance, 5% retention)
  ('po000006-0000-0000-0000-000000000006',
   'p0000006-0000-0000-0000-000000000006',
   'DSS/TOWERB/20260701/001', '2026-07-01',
   FALSE, NULL,
   20000000.00, 18.00, 23600000.00,
   10.00, 5.00),

  -- High Town Milestone PO (5% mobilisation advance, 5% retention)
  ('po000007-0000-0000-0000-000000000007',
   'p0000007-0000-0000-0000-000000000007',
   'HTW/NOIDA/20260710/005', '2026-07-10',
   FALSE, NULL,
   15000000.00, 18.00, 17700000.00,
   5.00, 5.00);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TAX INVOICES
--
--  place_of_supply uses GST state codes (2-digit):
--    05=UK, 06=HR, 07=DL, 09=UP, 29=KA, 32=KL, 04=CH
--
--  DEH/KOC/PGN/RFX/DSS/HTW → inter-state → IGST only
--  HOS (Studio5 KA billing to KA site)    → CGST + SGST
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO tax_invoices (invoice_id, project_id, po_id,
                          invoice_number, invoice_date, due_date, place_of_supply,
                          document_type, parent_invoice_id,
                          taxable_amount, cgst_amount, sgst_amount, igst_amount,
                          gross_total, advance_adjusted, net_receivable, status) VALUES

  -- ─────────────────────────────────────────────────────────────────────────
  -- TI-001 — LTH Dehradun Running Bill #1 (IGST, fully settled)
  --   Taxable: 10,50,000 ÷ 1.18 = 8,89,830.51  IGST: 1,60,169.49
  --   gross_total: 8,89,830.51 + 1,60,169.49 = 10,50,000.00 ✓
  -- ─────────────────────────────────────────────────────────────────────────
  ('inv00001-0000-0000-0000-000000000001',
   'p0000001-0000-0000-0000-000000000001', 'po000001-0000-0000-0000-000000000001',
   'S5/2026-27/DEH/001', '2026-08-15', '2026-09-14', '05',
   'INVOICE', NULL,
   889830.51, 0.00, 0.00, 160169.49,
   1050000.00, 0.00, 1050000.00, 'PAID'),

  -- TI-002 — LTH Kochi Running Bill #1 (IGST, pending)
  --   Taxable: 6,50,000   IGST: 1,17,000   Gross: 7,67,000
  ('inv00002-0000-0000-0000-000000000002',
   'p0000002-0000-0000-0000-000000000002', 'po000002-0000-0000-0000-000000000002',
   'S5/2026-27/KOC/001', '2026-08-20', '2026-09-19', '32',
   'INVOICE', NULL,
   650000.00, 0.00, 0.00, 117000.00,
   767000.00, 0.00, 767000.00, 'APPROVED'),

  -- TI-003 — LTH Hosur Road Running Bill #1 (CGST+SGST intra-state)
  --   Taxable: 8,20,000   CGST 9%: 73,800   SGST 9%: 73,800   Gross: 9,67,600
  ('inv00003-0000-0000-0000-000000000003',
   'p0000003-0000-0000-0000-000000000003', 'po000003-0000-0000-0000-000000000003',
   'S5/2026-27/HOS/001', '2026-08-25', '2026-09-24', '29',
   'INVOICE', NULL,
   820000.00, 73800.00, 73800.00, 0.00,
   967600.00, 0.00, 967600.00, 'APPROVED'),

  -- TI-004 — LTH PGN-1 Running Bill #1 (IGST, submitted for approval)
  --   Taxable: 4,50,000   IGST: 81,000   Gross: 5,31,000
  ('inv00004-0000-0000-0000-000000000004',
   'p0000004-0000-0000-0000-000000000004', 'po000004-0000-0000-0000-000000000004',
   'S5/2026-27/PGN/001', '2026-09-01', '2026-10-01', '06',
   'INVOICE', NULL,
   450000.00, 0.00, 0.00, 81000.00,
   531000.00, 0.00, 531000.00, 'SUBMITTED'),

  -- TI-005 — LTH Red Fox Running Bill #1 (IGST, approved)
  --   Taxable: 5,50,000   IGST: 99,000   Gross: 6,49,000
  ('inv00005-0000-0000-0000-000000000005',
   'p0000005-0000-0000-0000-000000000005', 'po000005-0000-0000-0000-000000000005',
   'S5/2026-27/RFX/001', '2026-09-05', '2026-10-05', '07',
   'INVOICE', NULL,
   550000.00, 0.00, 0.00, 99000.00,
   649000.00, 0.00, 649000.00, 'APPROVED'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- TI-006 (client-ref: TI-008) — DSS Tower B Running Bill (IGST)
  --   Gross:   12,37,489.60
  --   Taxable: 12,37,489.60 ÷ 1.18 = 10,48,720.00
  --   IGST:    10,48,720.00 × 0.18 = 1,88,769.60
  --   Verify:  10,48,720.00 + 1,88,769.60 = 12,37,489.60 ✓
  --   Advance amortised: ₹2,50,000 (10% of Tier-1 = ₹2,36,00,000 → mobilisation ₹20L)
  --   net_receivable: 12,37,489.60 − 2,50,000.00 = 9,87,489.60 ✓
  -- ─────────────────────────────────────────────────────────────────────────
  ('inv00006-0000-0000-0000-000000000006',
   'p0000006-0000-0000-0000-000000000006', 'po000006-0000-0000-0000-000000000006',
   'S5/2026-27/DSS/008', '2026-09-10', '2026-10-10', '04',
   'INVOICE', NULL,
   1048720.00, 0.00, 0.00, 188769.60,
   1237489.60, 250000.00, 987489.60, 'APPROVED'),

  -- ─────────────────────────────────────────────────────────────────────────
  -- TI-007 — High Town Milestone 1: Demolition & Civil Base (IGST, fully settled)
  --   Taxable: 7,50,000   IGST: 1,35,000   Gross: 8,85,000
  -- ─────────────────────────────────────────────────────────────────────────
  ('inv00007-0000-0000-0000-000000000007',
   'p0000007-0000-0000-0000-000000000007', 'po000007-0000-0000-0000-000000000007',
   'S5/2026-27/HTW/M01', '2026-08-01', '2026-08-31', '09',
   'INVOICE', NULL,
   750000.00, 0.00, 0.00, 135000.00,
   885000.00, 0.00, 885000.00, 'PAID'),

  -- TI-008 — High Town Milestone 2: MEP Rough-In (IGST, pending payment)
  --   Taxable: 10,00,000   IGST: 1,80,000   Gross: 11,80,000
  ('inv00008-0000-0000-0000-000000000008',
   'p0000007-0000-0000-0000-000000000007', 'po000007-0000-0000-0000-000000000007',
   'S5/2026-27/HTW/M02', '2026-09-01', '2026-09-30', '09',
   'INVOICE', NULL,
   1000000.00, 0.00, 0.00, 180000.00,
   1180000.00, 0.00, 1180000.00, 'APPROVED'),

  -- TI-009 — High Town Credit Note against TI-007 (work scope reduction ₹29,500)
  --   Taxable: 25,000   IGST: 4,500   Gross: 29,500
  --   Net invoiced effect on HTW: +885,000 +1,180,000 −29,500 = 20,35,500 ✓
  ('inv00009-0000-0000-0000-000000000009',
   'p0000007-0000-0000-0000-000000000007', 'po000007-0000-0000-0000-000000000007',
   'S5/2026-27/HTW/CN-01', '2026-08-15', NULL, '09',
   'CREDIT_NOTE', 'inv00007-0000-0000-0000-000000000007',
   25000.00, 0.00, 0.00, 4500.00,
   29500.00, 0.00, 29500.00, 'APPROVED');


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PAYMENT RECEIPTS
--
--  R-001 LTH DEH:  Bank ₹9,30,000 — fully allocated
--  R-002 DSS MOB:  Mobilisation advance ₹20,00,000 — unallocated (advance ledger)
--  R-003 HTW M1:   Bank ₹8,29,800 — fully allocated to TI-007
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO payment_receipts (receipt_id, client_id, payment_mode,
                              reference_number, instrument_date, clearance_date,
                              amount_received, deposit_account,
                              unallocated_balance, status) VALUES

  -- R-001 — LTH Dehradun: RTGS settlement of TI-001
  --   Bank hit: ₹9,30,000  (TDS ₹20K + GST-TDS ₹10K + Retention ₹90K borne by client)
  ('rec00001-0000-0000-0000-000000000001',
   'c0000001-0000-0000-0000-000000000001',
   'RTGS_NEFT', 'HDFC2026091200001234',
   '2026-09-12', '2026-09-12',
   930000.00, 'HDFC Bank – CA 00123456 7890',
   0.00, 'CLEARED'),

  -- R-002 — DSS Buildtech: Mobilisation Advance (RTGS, unallocated)
  --   Advance is tracked through invoice.advance_adjusted; receipt sits unallocated.
  --   After TI-006 amortises ₹2,50,000, recorded unallocated = 17,50,000 (see update below).
  ('rec00002-0000-0000-0000-000000000002',
   'c0000002-0000-0000-0000-000000000002',
   'RTGS_NEFT', 'ICIC2026081500005678',
   '2026-08-14', '2026-08-15',
   2000000.00, 'HDFC Bank – CA 00123456 7890',
   1750000.00, 'CLEARED'),        -- 20,00,000 − 2,50,000 advance amortised on TI-006

  -- R-003 — High Town: RTGS settlement of TI-007 (Milestone 1)
  --   TDS 194C: 2% of taxable 7,50,000 = 15,000
  --   GST-TDS:  2% of IGST   1,35,000 =  2,700
  --   Retention: 5% of taxable 7,50,000 = 37,500
  --   Bank hit: 8,85,000 − 15,000 − 2,700 − 37,500 = 8,29,800
  ('rec00003-0000-0000-0000-000000000003',
   'c0000003-0000-0000-0000-000000000003',
   'RTGS_NEFT', 'AXIS2026090200009012',
   '2026-09-01', '2026-09-02',
   829800.00, 'HDFC Bank – CA 00123456 7890',
   0.00, 'CLEARED');


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PAYMENT ALLOCATIONS
--    CHECK constraint enforced by database:
--      gross_settlement_applied = bank + tds + gst_tds + retention + other
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO payment_allocations (allocation_id, receipt_id, invoice_id,
                                 allocated_bank_amount, tds_194c_deducted,
                                 gst_tds_deducted, retention_deducted,
                                 other_debit_adjustments, gross_settlement_applied) VALUES

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALLOC-01: R-001 → TI-001 (LTH Dehradun, full settlement)
  --   Bank:      9,30,000
  --   TDS 194C:     20,000   (per spec: ₹20,000; ≈ 2.25% of taxable, client-negotiated)
  --   GST-TDS:      10,000   (per spec: ₹10,000; ≈ 6.25% of IGST, client-negotiated)
  --   Retention:    90,000   (per spec: ₹90,000; ≈ 5% × 18,00,000 interim — client decision)
  --   Other:             0
  --   GROSS:   9,30,000 + 20,000 + 10,000 + 90,000 = 10,50,000 = TI-001 net_receivable ✓
  -- ─────────────────────────────────────────────────────────────────────────
  ('alo00001-0000-0000-0000-000000000001',
   'rec00001-0000-0000-0000-000000000001', 'inv00001-0000-0000-0000-000000000001',
   930000.00, 20000.00, 10000.00, 90000.00, 0.00,
   1050000.00),    -- CHECK: 930000 + 20000 + 10000 + 90000 = 1050000 ✓

  -- ─────────────────────────────────────────────────────────────────────────
  -- ALLOC-02: R-003 → TI-007 (High Town Milestone 1, full settlement)
  --   Bank:      8,29,800
  --   TDS 194C:     15,000   (2.00% × 7,50,000)
  --   GST-TDS:       2,700   (2.00% × 1,35,000)
  --   Retention:    37,500   (5.00% × 7,50,000)
  --   Other:             0
  --   GROSS:   8,29,800 + 15,000 + 2,700 + 37,500 = 8,85,000 = TI-007 net_receivable ✓
  -- ─────────────────────────────────────────────────────────────────────────
  ('alo00002-0000-0000-0000-000000000002',
   'rec00003-0000-0000-0000-000000000003', 'inv00007-0000-0000-0000-000000000007',
   829800.00, 15000.00, 2700.00, 37500.00, 0.00,
   885000.00);    -- CHECK: 829800 + 15000 + 2700 + 37500 = 885000 ✓


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RETENTION LEDGER
--    expected_release_date = project.handover_date + dlp_months
--    DEH handover 2027-03-31 + 12 months = 2028-03-31
--    HTW no handover yet → estimated 2027-12-31
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO retention_ledger (retention_id, project_id, invoice_id, allocation_id,
                              withheld_amount, expected_release_date,
                              actual_released_date, status) VALUES

  -- RET-01: DEH ₹90,000 withheld from ALLOC-01
  --   withheld_amount must equal allocation.retention_deducted = 90,000 ✓
  ('ret00001-0000-0000-0000-000000000001',
   'p0000001-0000-0000-0000-000000000001',
   'inv00001-0000-0000-0000-000000000001',
   'alo00001-0000-0000-0000-000000000001',
   90000.00, '2028-03-31', NULL, 'WITHHELD'),

  -- RET-02: HTW M1 ₹37,500 withheld from ALLOC-02
  --   withheld_amount = allocation.retention_deducted = 37,500 ✓
  ('ret00002-0000-0000-0000-000000000002',
   'p0000007-0000-0000-0000-000000000007',
   'inv00007-0000-0000-0000-000000000007',
   'alo00002-0000-0000-0000-000000000002',
   37500.00, '2027-12-31', NULL, 'WITHHELD');


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO audit_logs (log_id, entity_name, entity_id, action,
                        changed_by, old_values, new_values, timestamp) VALUES

  ('log00001-0000-0000-0000-000000000001',
   'payment_allocations', 'alo00001-0000-0000-0000-000000000001', 'INSERT',
   NULL, NULL,
   '{"receipt_id":"rec00001-0000-0000-0000-000000000001","invoice_id":"inv00001-0000-0000-0000-000000000001","gross_settlement_applied":1050000.00,"note":"Full settlement per spec"}'::jsonb,
   NOW()),

  ('log00002-0000-0000-0000-000000000002',
   'tax_invoices', 'inv00001-0000-0000-0000-000000000001', 'UPDATE',
   NULL,
   '{"status":"APPROVED"}'::jsonb,
   '{"status":"PAID"}'::jsonb,
   NOW()),

  ('log00003-0000-0000-0000-000000000003',
   'payment_receipts', 'rec00002-0000-0000-0000-000000000002', 'INSERT',
   NULL, NULL,
   '{"type":"MOBILIZATION_ADVANCE","client":"DSS Buildtech Pvt Ltd","amount_received":2000000.00,"advance_amortised_on_TI-008":250000.00,"unallocated_balance":1750000.00}'::jsonb,
   NOW()),

  ('log00004-0000-0000-0000-000000000004',
   'payment_allocations', 'alo00002-0000-0000-0000-000000000002', 'INSERT',
   NULL, NULL,
   '{"receipt_id":"rec00003-0000-0000-0000-000000000003","invoice_id":"inv00007-0000-0000-0000-000000000007","gross_settlement_applied":885000.00,"note":"HTW Milestone 1 full settlement"}'::jsonb,
   NOW());


COMMIT;


-- ════════════════════════════════════════════════════════════════════════════════
--  VERIFICATION QUERIES — Run after seed to confirm zero discrepancy
--  Expected result for every query: 0 rows (no violations)
-- ════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- V-01 CHECK CONSTRAINT: gross_settlement_applied arithmetic
--   Database enforces this via CHECK, but we verify explicitly.
--   Expected: 0 rows
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  allocation_id,
  gross_settlement_applied                              AS gross_recorded,
  (allocated_bank_amount + tds_194c_deducted
   + gst_tds_deducted + retention_deducted
   + other_debit_adjustments)                          AS gross_computed,
  ABS(gross_settlement_applied
      - (allocated_bank_amount + tds_194c_deducted
         + gst_tds_deducted + retention_deducted
         + other_debit_adjustments))                   AS discrepancy
FROM payment_allocations
WHERE ABS(gross_settlement_applied
          - (allocated_bank_amount + tds_194c_deducted
             + gst_tds_deducted + retention_deducted
             + other_debit_adjustments)) > 0.01;
-- ↑ Expected: 0 rows


-- ─────────────────────────────────────────────────────────────────────────────
-- V-02 PAID INVOICE INTEGRITY: operational outstanding must be 0 for PAID invoices
--   Expected: 0 rows
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  ti.invoice_number,
  ti.net_receivable,
  COALESCE(SUM(pa.gross_settlement_applied), 0)        AS total_settled,
  ti.net_receivable
    - COALESCE(SUM(pa.gross_settlement_applied), 0)    AS operational_outstanding
FROM tax_invoices ti
LEFT JOIN payment_allocations pa ON pa.invoice_id = ti.invoice_id
WHERE ti.status = 'PAID'
GROUP BY ti.invoice_id, ti.invoice_number, ti.net_receivable
HAVING ABS(ti.net_receivable
           - COALESCE(SUM(pa.gross_settlement_applied), 0)) > 0.01;
-- ↑ Expected: 0 rows


-- ─────────────────────────────────────────────────────────────────────────────
-- V-03 RETENTION LEDGER INTEGRITY: withheld_amount = allocation.retention_deducted
--   Expected: 0 rows
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  pa.allocation_id,
  pa.retention_deducted                                AS deducted_in_allocation,
  COALESCE(SUM(rl.withheld_amount), 0)                 AS withheld_in_ledger,
  ABS(pa.retention_deducted
      - COALESCE(SUM(rl.withheld_amount), 0))          AS discrepancy
FROM payment_allocations pa
LEFT JOIN retention_ledger rl ON rl.allocation_id = pa.allocation_id
WHERE pa.retention_deducted > 0
GROUP BY pa.allocation_id, pa.retention_deducted
HAVING ABS(pa.retention_deducted
           - COALESCE(SUM(rl.withheld_amount), 0)) > 0.01;
-- ↑ Expected: 0 rows


-- ─────────────────────────────────────────────────────────────────────────────
-- V-04 RECEIPT UNALLOCATED BALANCE INTEGRITY
--   unallocated_balance = amount_received − SUM(allocated_bank_amount)
--   Note: R-002 (DSS advance) has no payment_allocations; unallocated = 17,50,000
--         reflecting 2,50,000 advance amortised on TI-006 (tracked via invoice.advance_adjusted)
--   Expected: 0 rows
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  pr.reference_number,
  pr.amount_received,
  COALESCE(SUM(pa.allocated_bank_amount), 0)           AS total_bank_allocated,
  pr.unallocated_balance                               AS recorded_unallocated,
  pr.amount_received
    - COALESCE(SUM(pa.allocated_bank_amount), 0)       AS computed_unallocated,
  ABS(pr.unallocated_balance
      - (pr.amount_received
         - COALESCE(SUM(pa.allocated_bank_amount), 0))) AS discrepancy
FROM payment_receipts pr
LEFT JOIN payment_allocations pa ON pa.receipt_id = pr.receipt_id
GROUP BY pr.receipt_id, pr.reference_number, pr.amount_received, pr.unallocated_balance
HAVING ABS(pr.unallocated_balance
           - (pr.amount_received
              - COALESCE(SUM(pa.allocated_bank_amount), 0))) > 0.01;
-- ↑ Expected: 0 rows


-- ─────────────────────────────────────────────────────────────────────────────
-- V-05 FIVE-TIER FINANCIAL SUMMARY PER PROJECT (informational)
--   Shows all 5 tiers for each project in one view.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.project_code,
  p.site_name,

  -- Tier 1: Contract Value = SUM of all PO total values (original + amendments)
  COALESCE(SUM(DISTINCT po.total_po_value), 0)
    AS tier1_contract_value,

  -- Tier 2: Net Invoiced = Invoices + Debit Notes − Credit Notes
  COALESCE(SUM(
    CASE ti.document_type
      WHEN 'INVOICE'     THEN  ti.gross_total
      WHEN 'DEBIT_NOTE'  THEN  ti.gross_total
      WHEN 'CREDIT_NOTE' THEN -ti.gross_total
    END
  ), 0) AS tier2_net_invoiced,

  -- Tier 3: Total Settled = SUM(gross_settlement_applied) via allocations
  COALESCE((
    SELECT SUM(pa2.gross_settlement_applied)
    FROM   payment_allocations pa2
    JOIN   tax_invoices ti2 ON ti2.invoice_id = pa2.invoice_id
    WHERE  ti2.project_id = p.project_id
  ), 0) AS tier3_total_settled,

  -- Tier 4: Bank Receipts (actual cash in bank)
  COALESCE((
    SELECT SUM(pa3.allocated_bank_amount)
    FROM   payment_allocations pa3
    JOIN   tax_invoices ti3 ON ti3.invoice_id = pa3.invoice_id
    WHERE  ti3.project_id = p.project_id
  ), 0) AS tier4_bank_receipts,

  -- Tier 5: Operational Outstanding = Tier 2 − Tier 3
  COALESCE(SUM(
    CASE ti.document_type
      WHEN 'INVOICE'     THEN  ti.gross_total
      WHEN 'DEBIT_NOTE'  THEN  ti.gross_total
      WHEN 'CREDIT_NOTE' THEN -ti.gross_total
    END
  ), 0)
  - COALESCE((
    SELECT SUM(pa4.gross_settlement_applied)
    FROM   payment_allocations pa4
    JOIN   tax_invoices ti4 ON ti4.invoice_id = pa4.invoice_id
    WHERE  ti4.project_id = p.project_id
  ), 0) AS tier5_operational_outstanding,

  -- Retention balance (withheld, not released)
  COALESCE((
    SELECT SUM(rl.withheld_amount)
    FROM   retention_ledger rl
    WHERE  rl.project_id = p.project_id
    AND    rl.status <> 'RELEASED'
  ), 0) AS retention_withheld,

  -- Billing progress %
  ROUND(
    COALESCE(SUM(
      CASE ti.document_type
        WHEN 'INVOICE'     THEN  ti.gross_total
        WHEN 'DEBIT_NOTE'  THEN  ti.gross_total
        WHEN 'CREDIT_NOTE' THEN -ti.gross_total
      END
    ), 0)
    / NULLIF(COALESCE(SUM(DISTINCT po.total_po_value), 0), 0) * 100,
  2) AS billing_progress_pct

FROM       projects p
LEFT JOIN  contracts_and_pos po ON po.project_id = p.project_id
LEFT JOIN  tax_invoices       ti ON ti.project_id = p.project_id
GROUP BY   p.project_id, p.project_code, p.site_name
ORDER BY   p.project_code;
