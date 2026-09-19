-- Migration: 20260920_initial_schema
-- Description: Initial schema for Studio 5 Interiors accounting system
-- Includes Five-Tier Financial Model structures, strict allocations, and retention management.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------------------------------------------------------
-- 1. CLIENTS
-------------------------------------------------------------------------------
CREATE TABLE clients (
    client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_entity VARCHAR(255) NOT NULL,
    pan VARCHAR(10),
    gstin VARCHAR(15),
    billing_address TEXT,
    default_tds_rate DECIMAL(5,2) DEFAULT 2.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 2. PROJECTS
-------------------------------------------------------------------------------
CREATE TABLE projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
    project_code VARCHAR(50) NOT NULL UNIQUE,
    site_name VARCHAR(255) NOT NULL,
    site_state_code VARCHAR(2),
    project_manager VARCHAR(255),
    dlp_months INT DEFAULT 12,
    handover_date DATE,
    physical_progress_pct DECIMAL(5,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 3. CONTRACTS AND POs
-------------------------------------------------------------------------------
CREATE TABLE contracts_and_pos (
    po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    po_number VARCHAR(100) NOT NULL UNIQUE,
    po_date DATE NOT NULL,
    is_amendment BOOLEAN DEFAULT FALSE,
    parent_po_id UUID REFERENCES contracts_and_pos(po_id) ON DELETE SET NULL,
    base_taxable_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    gst_rate DECIMAL(5,2) DEFAULT 18.00,
    total_po_value DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    advance_pct DECIMAL(5,2) DEFAULT 0.00,
    retention_pct DECIMAL(5,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 4. TAX INVOICES
-------------------------------------------------------------------------------
CREATE TABLE tax_invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,
    po_id UUID NOT NULL REFERENCES contracts_and_pos(po_id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    invoice_date DATE NOT NULL,
    due_date DATE,
    place_of_supply VARCHAR(2),
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE')),
    parent_invoice_id UUID REFERENCES tax_invoices(invoice_id) ON DELETE SET NULL,
    taxable_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    cgst_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    sgst_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    igst_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    gross_total DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    advance_adjusted DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    net_receivable DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 5. PAYMENT RECEIPTS
-------------------------------------------------------------------------------
CREATE TABLE payment_receipts (
    receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
    payment_mode VARCHAR(50) DEFAULT 'RTGS_NEFT' CHECK (payment_mode IN ('RTGS_NEFT', 'CHEQUE', 'CASH', 'UPI')),
    reference_number VARCHAR(100),
    instrument_date DATE,
    clearance_date DATE,
    amount_received DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    deposit_account VARCHAR(100),
    unallocated_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'CLEARED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 6. PAYMENT ALLOCATIONS (Many-to-Many mapping with full settlement logic)
-------------------------------------------------------------------------------
CREATE TABLE payment_allocations (
    allocation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID NOT NULL REFERENCES payment_receipts(receipt_id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES tax_invoices(invoice_id) ON DELETE RESTRICT,
    allocated_bank_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    tds_194c_deducted DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    gst_tds_deducted DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    retention_deducted DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    other_debit_adjustments DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    gross_settlement_applied DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint enforcing strict Five-Tier settlement mathematics
    CONSTRAINT chk_gross_settlement CHECK (
        gross_settlement_applied = (
            allocated_bank_amount + 
            tds_194c_deducted + 
            gst_tds_deducted + 
            retention_deducted + 
            other_debit_adjustments
        )
    )
);

-------------------------------------------------------------------------------
-- 7. RETENTION LEDGER
-------------------------------------------------------------------------------
CREATE TABLE retention_ledger (
    retention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES tax_invoices(invoice_id) ON DELETE CASCADE,
    allocation_id UUID NOT NULL REFERENCES payment_allocations(allocation_id) ON DELETE CASCADE,
    withheld_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    expected_release_date DATE,
    actual_released_date DATE,
    status VARCHAR(50) DEFAULT 'WITHHELD' CHECK (status IN ('WITHHELD', 'DUE_FOR_RELEASE', 'RELEASED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- 8. AUDIT LOGS
-------------------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    changed_by UUID,
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------------------------------------
-- OPTIMAL B-TREE INDEXES
-------------------------------------------------------------------------------
CREATE INDEX idx_projects_client_id ON projects USING btree (client_id);
CREATE INDEX idx_contracts_project_id ON contracts_and_pos USING btree (project_id);
CREATE INDEX idx_invoices_project_id ON tax_invoices USING btree (project_id);
CREATE INDEX idx_invoices_invoice_number ON tax_invoices USING btree (invoice_number);
CREATE INDEX idx_receipts_client_id ON payment_receipts USING btree (client_id);
CREATE INDEX idx_receipts_reference_number ON payment_receipts USING btree (reference_number);
CREATE INDEX idx_allocations_receipt_id ON payment_allocations USING btree (receipt_id);
CREATE INDEX idx_allocations_invoice_id ON payment_allocations USING btree (invoice_id);
CREATE INDEX idx_retention_project_id ON retention_ledger USING btree (project_id);
