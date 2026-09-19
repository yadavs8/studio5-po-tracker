# Studio 5 Interiors - Project Rules

This document outlines the core business constraints and accounting logic for the Studio 5 Interiors portal. These rules must be strictly adhered to across all services and database interactions.

## 1. Five-Tier Financial Model
The accounting logic operates on a strict five-tier financial equation:
- **Contract Value** = Original PO + Approved Variations/Amendments
- **Invoiced Value** = Tax Invoices - Credit Notes + Debit Notes
- **Settlement Value** = Bank Receipt + TDS (194C) + GST-TDS + Retention + Debit Adjustments
- **Bank Receipt** = Cash hit in bank (matched via UTR)
- **Operational Outstanding** = Invoiced Value - Settlement Value

## 2. Payment Allocations (Many-to-Many)
- Payments do NOT have a simple one-to-one relationship with invoices.
- Payments are mapped many-to-many with invoices via the dedicated `payment_allocations` table.
- A single invoice can be settled across multiple receipts, and a single receipt can settle multiple invoices.

## 3. Default Payment Mode
- The default payment mode across the system is **digital bank transfer (RTGS/NEFT)**.

## 4. Retention Management
- Retention money is strictly segregated into a dedicated `retention_ledger`.
- Retention maturity is linked to the **Site Handover Date + DLP duration (in months)**.
