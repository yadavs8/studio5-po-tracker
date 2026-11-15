import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { detectDocument, fromExtracted, isRealDate, type SiteMeta } from './detector';
import type { Extracted } from './extractApi';

const SITES: SiteMeta[] = [
  { site_id: 'kochi', site_name: 'Keys Hotel - Kochi', client_id: 'lt', client_name: 'Lemon Tree Hotels' },
  { site_id: 'hosur', site_name: 'Keys Hotel - Hosur Road', client_id: 'lt', client_name: 'Lemon Tree Hotels' },
  { site_id: 'pgn', site_name: 'Lemon Tree Hotels - PGN-1 Gurgaon', client_id: 'lt', client_name: 'Lemon Tree Hotels' },
  { site_id: 'redfox', site_name: 'Redfox Hotel East Delhi', client_id: 'rf', client_name: 'Redfox Hotels' },
];
const file = (name: string) => new File(['%PDF-1.4 binary'], name, { type: 'application/pdf' });

describe('detectDocument (quick file-name guess)', () => {
  it('reads "Tax Invoice against PO …" as a tax invoice, not a PO', async () => {
    expect((await detectDocument(file('Tax Invoice INV-204 against PO 4500.pdf'), SITES)).docType).toBe('invoice');
    expect((await detectDocument(file('Invoice 77 for WO-12.pdf'), SITES)).docType).toBe('invoice');
  });
  it('reads a file whose text says "Tax Invoice … Purchase Order No" as an invoice', async () => {
    const f = new File(['TAX INVOICE  Invoice No S5/I/204  Purchase Order No 4500123'], 'S5-204.pdf', { type: 'application/pdf' });
    expect((await detectDocument(f, SITES)).docType).toBe('invoice');
  });
  it('still reads PIs and POs', async () => {
    expect((await detectDocument(file('PI 042 Redfox.pdf'), SITES)).docType).toBe('pi');
    expect((await detectDocument(file('Proforma invoice 12.pdf'), SITES)).docType).toBe('pi');
    expect((await detectDocument(file('WO-1234 Kochi.pdf'), SITES)).docType).toBe('po');
  });
  it('does not pick an arbitrary site when only the client name matches', async () => {
    const d = await detectDocument(file('Lemon Tree PI 042.pdf'), SITES);
    expect(d.siteId).toBeNull();
  });
  it('picks the site when a site-specific word is in the name', async () => {
    expect((await detectDocument(file('Lemon Tree Kochi PI 042.pdf'), SITES)).siteId).toBe('kochi');
    expect((await detectDocument(file('Hosur PO-778.pdf'), SITES)).siteId).toBe('hosur');
  });
  it('ignores impossible dates', async () => {
    expect((await detectDocument(file('PI 042 2026-02-30.pdf'), SITES)).date).toBe('');
    expect((await detectDocument(file('PI 042 31-04-2026.pdf'), SITES)).date).toBe('');
    expect((await detectDocument(file('PI 042 15-04-2026.pdf'), SITES)).date).toBe('2026-04-15');
  });
});

describe('isRealDate', () => {
  it('checks the calendar, including leap years', () => {
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('26-01-01')).toBe(false);
  });
});

describe('fromExtracted (AI reading)', () => {
  const ex = (over: Partial<Extracted>): Extracted => ({
    document_type: 'tax_invoice', document_number: 'S5/I/101', document_date: '2026-09-01', payment_date: null,
    client_name: 'Redfox Hotels', site_or_project: 'Redfox Hotel East Delhi', scope_description: '', po_reference: null,
    taxable_value: 100000, gst_type: 'cgst_sgst', igst_amount: null, cgst_amount: null, sgst_amount: null,
    total_amount: 118000, payment_amount: null, overall_confidence: 'high', ...over,
  } as Extracted);

  it('keeps the read total: GST = total − taxable when the GST parts were not read', () => {
    const d = fromExtracted(ex({}), SITES);
    expect(d.gst).toBe(18000);
    expect(d.amount).toBe(118000);
  });
  it('uses the GST parts when they were read', () => {
    expect(fromExtracted(ex({ cgst_amount: 9000, sgst_amount: 9000 }), SITES).gst).toBe(18000);
  });
  it('drops an impossible date', () => {
    expect(fromExtracted(ex({ document_date: '2026-02-31' }), SITES).date).toBe('');
  });
});
