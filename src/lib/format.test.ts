import { describe, expect, it } from 'vitest';
import { formatINR, formatCompact } from './format';

describe('formatINR', () => {
  it('uses Indian grouping and two decimals', () => {
    expect(formatINR(1500000)).toBe('₹15,00,000.00');
    expect(formatINR(450.5)).toBe('₹450.50');
  });
  it('shows a dash for missing values', () => {
    expect(formatINR(null)).toBe('—');
    expect(formatINR(undefined)).toBe('—');
  });
});

describe('formatCompact', () => {
  it('uses lakh and crore', () => {
    expect(formatCompact(23200000)).toBe('₹2.32 Cr');
    expect(formatCompact(6546000)).toBe('₹65.46 L');
    expect(formatCompact(48500)).toBe('₹48,500');
    expect(formatCompact(-250000)).toBe('-₹2.50 L');
  });
});
