import { describe, expect, it } from 'vitest';
import { statementFigures, type StatementInput } from './statement';

// Mirrors the SQL fixtures: PO-X, PO-Y; INV-1 on PO-Y; INV-2 cancelled on PO-X;
// ₹1L tagged to PO-X but matched to INV-1. v_po_summary (migration_014) already
// gives per-PO received without double counting.
const base: StatementInput = {
  pos: [
    { po_id: 'X', po_number: 'PO-X', po_date: '2026-08-05', po_value: 1180000, invoiced: 0, received_bank: 0, tds_and_other_deductions: 0, retention_pending: 0, balance_against_po: 1180000 },
    { po_id: 'Y', po_number: 'PO-Y', po_date: '2026-08-10', po_value: 590000, invoiced: 118000, received_bank: 100000, tds_and_other_deductions: 0, retention_pending: 0, balance_against_po: 490000 },
  ],
  invs: [
    { invoice_id: 'i1', po_id: 'Y', invoice_date: '2026-09-01', gross_invoice_value: 118000, status: 'issued' },
    { invoice_id: 'i2', po_id: 'X', invoice_date: '2026-09-15', gross_invoice_value: 236000, status: 'cancelled' },
  ],
  settle: { i1: { invoice_id: 'i1', total_payments_allocated: 100000, total_deducted: 0, remaining_balance: 18000 } },
  deds: [],
  pays: [{ payment_id: 'p1', po_id: 'X', payment_date: '2026-09-20', amount_received: 100000 }],
  allocByPay: { p1: 100000 },
  bf: null,
};

describe('statementFigures', () => {
  it('counts each rupee received once, matching the bank', () => {
    const f = statementFigures(base);
    expect(f.totals.received).toBe(100000);
    expect(f.totals.received).toBe(f.bankReceived);
  });

  it('leaves cancelled and draft invoices out of the statement', () => {
    const f = statementFigures(base);
    expect(f.invs.map((i) => i.invoice_id)).toEqual(['i1']);
    expect(f.totals.billed).toBe(118000);
  });

  it('keeps PO balances and no-PO invoice balances as separate totals', () => {
    const f = statementFigures({
      ...base,
      invs: [...base.invs, { invoice_id: 'i3', po_id: null, invoice_date: '2026-10-01', gross_invoice_value: 59000, status: 'issued' }],
      settle: { ...base.settle, i3: { invoice_id: 'i3', total_payments_allocated: 0, total_deducted: 0, remaining_balance: 59000 } },
    });
    expect(f.totals.balanceOnPos).toBe(1180000 + 490000);
    expect(f.totals.balanceNoPo).toBe(59000);
    expect(f.totals.billed).toBe(118000 + 59000);
  });

  it('shows money not yet matched or tagged as its own received line', () => {
    const f = statementFigures({
      ...base,
      pays: [...base.pays, { payment_id: 'p2', po_id: null, payment_date: '2026-10-05', amount_received: 25000 }],
    });
    expect(f.unassigned).toBe(25000);
    expect(f.totals.received).toBe(125000);
    expect(f.totals.received).toBe(f.bankReceived);
  });

  it('counts money matched to an invoice that was later cancelled as received', () => {
    const f = statementFigures({
      ...base,
      invs: [...base.invs, { invoice_id: 'i9', po_id: null, invoice_date: '2026-10-01', gross_invoice_value: 30000, status: 'cancelled' }],
      settle: { ...base.settle, i9: { invoice_id: 'i9', total_payments_allocated: 30000, total_deducted: 0, remaining_balance: 0 } },
      pays: [...base.pays, { payment_id: 'p3', po_id: null, payment_date: '2026-10-02', amount_received: 30000 }],
      allocByPay: { ...base.allocByPay, p3: 30000 },
    });
    expect(f.invs.map((i) => i.invoice_id)).toEqual(['i1']);
    expect(f.totals.received).toBe(130000);
    expect(f.totals.received).toBe(f.bankReceived);
  });

  it('only lists records from the reporting start', () => {
    const f = statementFigures({
      ...base,
      invs: [...base.invs, { invoice_id: 'old', po_id: null, invoice_date: '2026-07-10', gross_invoice_value: 59000, status: 'issued' }],
    });
    expect(f.invs.map((i) => i.invoice_id)).toEqual(['i1']);
  });

  it('adds brought-forward figures into the totals', () => {
    const f = statementFigures({ ...base, bf: { billed: 59000, received: 20000, tax: 1000, held: 0, receivedSince: 5000, balance: 33000 } });
    expect(f.totals.billed).toBe(118000 + 59000);
    expect(f.totals.received).toBe(100000 + 25000);
    expect(f.totals.balanceBroughtForward).toBe(33000);
  });
});
