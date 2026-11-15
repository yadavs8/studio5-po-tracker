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

import { vi } from 'vitest';
import { formatDate, todayIST, daysSince } from './format';

describe('dates are Indian dates whatever the computer clock says (tests run in UTC)', () => {
  it('shows a stored date as that same day', () => {
    expect(formatDate('2026-08-01')).toBe('01 Aug 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });
  it('shows a timestamp in IST', () => {
    // 20:00 UTC on 31 Jul is already 1 Aug in India
    expect(formatDate('2026-07-31T20:00:00Z')).toBe('01 Aug 2026');
  });
  it('knows today in India, even in the UTC evening', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T20:00:00Z')); // 01:30 on 15 Nov in India
    expect(todayIST()).toBe('2026-11-15');
    expect(daysSince('2026-09-16')).toBe(60);
    expect(daysSince('2026-09-15')).toBe(61);
    vi.useRealTimers();
  });
});
