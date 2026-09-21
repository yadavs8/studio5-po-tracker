import { describe, expect, it } from 'vitest';
import { computeProjectFinancials } from './financials';
import { InvariantViolationError } from './errors';

describe('computeProjectFinancials', () => {
  it('applies the five-tier model from PROJECT_RULES.md', () => {
    const result = computeProjectFinancials(
      [{ total_po_value: 100_000 }, { total_po_value: 20_000 }], // Contract Value = 120,000
      [
        { invoice_id: 'inv-1', document_type: 'INVOICE', gross_total: 60_000 },
        { invoice_id: 'inv-2', document_type: 'DEBIT_NOTE', gross_total: 2_000 },
        { invoice_id: 'inv-3', document_type: 'CREDIT_NOTE', gross_total: 5_000 },
      ], // Invoiced Value = 60,000 + 2,000 - 5,000 = 57,000
      [{ gross_settlement_applied: 40_000 }], // Settled = 40,000
      [
        { withheld_amount: 3_000, status: 'WITHHELD' },
        { withheld_amount: 1_000, status: 'RELEASED' }, // excluded
      ]
    );

    expect(result.totalContractValue).toBe(120_000);
    expect(result.netInvoicedValue).toBe(57_000);
    expect(result.totalSettled).toBe(40_000);
    expect(result.operationalOutstanding).toBe(17_000); // 57,000 - 40,000
    expect(result.retentionBalance).toBe(3_000);
    expect(result.unbilledPOBalance).toBe(63_000); // 120,000 - 57,000
    expect(result.billingProgressPct).toBeCloseTo((57_000 / 120_000) * 100);
    expect(result.collectionProgressPct).toBeCloseTo((40_000 / 57_000) * 100);
  });

  it('returns zero progress percentages instead of dividing by zero', () => {
    const result = computeProjectFinancials([], [], [], []);

    expect(result.totalContractValue).toBe(0);
    expect(result.billingProgressPct).toBe(0);
    expect(result.collectionProgressPct).toBe(0);
    expect(result.unbilledPOBalance).toBe(0);
  });

  it('fails fast on non-numeric data instead of silently propagating NaN', () => {
    expect(() =>
      computeProjectFinancials(
        [{ total_po_value: Number('not-a-number') }],
        [],
        [],
        []
      )
    ).toThrow(InvariantViolationError);
  });
});
