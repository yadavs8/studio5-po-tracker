import { describe, expect, it } from 'vitest';
import { resolveGst, toPaise } from './money';

describe('resolveGst (decision 0004)', () => {
  it('adds GST to taxable when GST is given', () => {
    expect(resolveGst(100000, 18000, null)).toEqual({ ok: true, taxable: 100000, gst: 18000, gross: 118000 });
  });
  it('accepts an explicit 0 % GST', () => {
    expect(resolveGst(50000, 0, null)).toEqual({ ok: true, taxable: 50000, gst: 0, gross: 50000 });
  });
  it('derives GST from the total when GST is blank (never gross = taxable silently)', () => {
    expect(resolveGst(100000, null, 118000)).toEqual({ ok: true, taxable: 100000, gst: 18000, gross: 118000 });
  });
  it('refuses when both GST and the total are blank', () => {
    expect(resolveGst(100000, null, null)).toEqual({ ok: false, error: 'Enter the GST amount (0 if none).' });
  });
  it('refuses when the parts do not add up to the total (more than ₹1 off)', () => {
    const r = resolveGst(100000, 18000, 120000);
    expect(r.ok).toBe(false);
  });
  it('tolerates paise rounding up to ₹1', () => {
    expect(resolveGst(100000.4, 18000.07, 118000)).toMatchObject({ ok: true, gross: 118000.47 });
  });
  it('refuses a total smaller than the taxable value', () => {
    expect(resolveGst(100000, null, 90000).ok).toBe(false);
  });
  it('refuses a missing or non-positive taxable value', () => {
    expect(resolveGst(null, 18000, 118000).ok).toBe(false);
    expect(resolveGst(0, 0, 0).ok).toBe(false);
  });
  it('works in paise so 0.1 + 0.2 style errors cannot creep in', () => {
    expect(resolveGst(0.1, 0.2, null)).toMatchObject({ ok: true, gross: 0.3 });
    expect(toPaise(450.5)).toBe(45050);
  });
});
