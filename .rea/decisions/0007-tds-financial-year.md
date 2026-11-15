# 0007 — TDS financial year follows the invoice date; base is taxable value

Status: accepted (2026-11-15)

New TDS deductions default `deduction_date` to the invoice date, so a March invoice entered in April stays in the March FY. The 194C rate shown keeps using the taxable value as its base (current behaviour). Audit M3.
