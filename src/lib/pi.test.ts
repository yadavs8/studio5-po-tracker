import { describe, it, expect } from 'vitest';
import { isOpenPi, PI_STATUS_LABEL } from './pi';

describe('isOpenPi', () => {
  it('counts PIs still waiting for an order or an invoice', () => {
    for (const s of ['draft', 'sent', 'revision_requested', 'approved']) expect(isOpenPi(s)).toBe(true);
  });
  it('leaves out PIs that became a tax invoice or were cancelled (e.g. voided in the doc generator)', () => {
    expect(isOpenPi('converted_to_invoice')).toBe(false);
    expect(isOpenPi('cancelled')).toBe(false);
  });
  it('has a plain label for every status', () => {
    expect(PI_STATUS_LABEL.cancelled).toBe('Cancelled');
    expect(Object.keys(PI_STATUS_LABEL)).toHaveLength(6);
  });
});
