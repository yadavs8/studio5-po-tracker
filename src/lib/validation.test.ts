import { describe, expect, it } from 'vitest';
import { check, poInput, piInput, invoiceInput, paymentInput, deductionInput } from './validation';

describe('shared form validation', () => {
  it('accepts a good PO and trims the number', () => {
    const r = check(poInput, { po_number: '  PO-1 ', po_date: '2026-09-01', total_value_with_gst: '118000' });
    expect(r).toEqual({ ok: true, data: { po_number: 'PO-1', po_date: '2026-09-01', total_value_with_gst: 118000 } });
  });
  it('refuses a blank number, a zero amount, an impossible or pre-start date', () => {
    expect(check(poInput, { po_number: ' ', po_date: '2026-09-01', total_value_with_gst: '1' })).toMatchObject({ ok: false });
    expect(check(poInput, { po_number: 'X', po_date: '2026-09-01', total_value_with_gst: '0' })).toEqual({ ok: false, error: 'The PO total must be above zero.' });
    expect(check(poInput, { po_number: 'X', po_date: '2026-02-30', total_value_with_gst: '5' })).toEqual({ ok: false, error: 'Please enter a real date.' });
    expect(check(poInput, { po_number: 'X', po_date: '2026-07-31', total_value_with_gst: '5' })).toEqual({ ok: false, error: 'The portal only keeps records from 1 Aug 2026 onwards — please check the date.' });
  });
  it('refuses amounts that are not numbers', () => {
    expect(check(piInput, { pi_number: 'PI-1', pi_date: '2026-09-01', amount: '12,000' })).toMatchObject({ ok: false });
    expect(check(piInput, { pi_number: 'PI-1', pi_date: '2026-09-01', amount: 'abc' })).toMatchObject({ ok: false });
  });
  it('applies the GST rule to invoices (decision 0004)', () => {
    expect(check(invoiceInput, { invoice_number: 'INV-1', invoice_date: '2026-09-01', taxable_value: '100000', gst_amount: '', total: '118000' }))
      .toEqual({ ok: true, data: { invoice_number: 'INV-1', invoice_date: '2026-09-01', taxable_value: 100000, gst_amount: 18000, gross_invoice_value: 118000 } });
    expect(check(invoiceInput, { invoice_number: 'INV-1', invoice_date: '2026-09-01', taxable_value: '100000', gst_amount: '', total: '' }))
      .toEqual({ ok: false, error: 'Enter the GST amount (0 if none).' });
    expect(check(invoiceInput, { invoice_number: 'INV-1', invoice_date: '2026-09-01', taxable_value: '100000', gst_amount: '0', total: '' }))
      .toMatchObject({ ok: true, data: { gst_amount: 0, gross_invoice_value: 100000 } });
  });
  it('validates payments and deductions', () => {
    expect(check(paymentInput, { payment_date: '2026-10-01', amount_received: '50000', utr_or_reference: ' UTR1 ' }))
      .toEqual({ ok: true, data: { payment_date: '2026-10-01', amount_received: 50000, utr_or_reference: 'UTR1' } });
    expect(check(paymentInput, { payment_date: '', amount_received: '50000', utr_or_reference: '' })).toMatchObject({ ok: false });
    expect(check(deductionInput, { deduction_type: 'tds', amount: '2000' })).toEqual({ ok: true, data: { deduction_type: 'tds', amount: 2000 } });
    expect(check(deductionInput, { deduction_type: '', amount: '2000' })).toMatchObject({ ok: false });
  });
});
