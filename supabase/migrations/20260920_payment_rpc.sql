-- Migration: 20260920_payment_rpc
-- Description: Creates a secure RPC for transactional insertion of payment receipts, allocations, and retentions.

CREATE OR REPLACE FUNCTION record_bank_payment_transaction(
    p_client_id UUID,
    p_payment_mode VARCHAR,
    p_reference_number VARCHAR,
    p_instrument_date DATE,
    p_clearance_date DATE,
    p_amount_received DECIMAL,
    p_deposit_account VARCHAR,
    p_allocations JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_receipt_id UUID;
    v_unallocated DECIMAL := p_amount_received;
    alloc RECORD;
    v_allocation_id UUID;
    v_project_id UUID;
BEGIN
    -- 1. Insert the payment receipt
    INSERT INTO payment_receipts (
        client_id, payment_mode, reference_number, 
        instrument_date, clearance_date, amount_received, 
        deposit_account, unallocated_balance, status
    )
    VALUES (
        p_client_id, COALESCE(p_payment_mode, 'RTGS_NEFT'), p_reference_number, 
        p_instrument_date, p_clearance_date, p_amount_received, 
        p_deposit_account, p_amount_received, 'CLEARED'
    )
    RETURNING receipt_id INTO v_receipt_id;

    -- 2. Process all allocations in the JSON array
    FOR alloc IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(
        invoice_id UUID,
        allocated_bank_amount DECIMAL,
        tds_194c_deducted DECIMAL,
        gst_tds_deducted DECIMAL,
        retention_deducted DECIMAL,
        other_debit_adjustments DECIMAL,
        gross_settlement_applied DECIMAL
    )
    LOOP
        -- Insert into payment_allocations
        INSERT INTO payment_allocations (
            receipt_id, invoice_id, allocated_bank_amount, 
            tds_194c_deducted, gst_tds_deducted, retention_deducted, 
            other_debit_adjustments, gross_settlement_applied
        )
        VALUES (
            v_receipt_id, alloc.invoice_id, alloc.allocated_bank_amount, 
            alloc.tds_194c_deducted, alloc.gst_tds_deducted, alloc.retention_deducted, 
            alloc.other_debit_adjustments, alloc.gross_settlement_applied
        )
        RETURNING allocation_id INTO v_allocation_id;

        -- Deduct from unallocated balance
        v_unallocated := v_unallocated - alloc.allocated_bank_amount;

        -- Fetch project_id for the invoice
        SELECT project_id INTO v_project_id 
        FROM tax_invoices 
        WHERE invoice_id = alloc.invoice_id;

        -- Insert into retention_ledger if retention was deducted
        IF alloc.retention_deducted > 0 THEN
            INSERT INTO retention_ledger (
                project_id, invoice_id, allocation_id, withheld_amount, status
            )
            VALUES (
                v_project_id, alloc.invoice_id, v_allocation_id, alloc.retention_deducted, 'WITHHELD'
            );
        END IF;

        -- Update invoice status (Basic handling - sets to PARTIALLY_PAID)
        -- Complex logic for 'PAID' can be expanded here by comparing sums.
        UPDATE tax_invoices 
        SET status = 'PARTIALLY_PAID'
        WHERE invoice_id = alloc.invoice_id AND status NOT IN ('PAID');
        
    END LOOP;

    -- 3. Update the final unallocated balance on the receipt
    UPDATE payment_receipts 
    SET unallocated_balance = v_unallocated 
    WHERE receipt_id = v_receipt_id;

    RETURN v_receipt_id;
END;
$$;
