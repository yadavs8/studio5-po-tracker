/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30, 2026-13-01 …). */
export function isRealDate(d: string | null | undefined): d is string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}


export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(1)}%`;
}

const IST = 'Asia/Kolkata';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "01 Aug 2026". A stored date (YYYY-MM-DD) is shown as exactly that day; a timestamp is shown
 * as the day it was in India. (new Date('2026-08-01') is midnight UTC, which is the previous
 * day on any computer west of UTC — so date-only values are never run through the local clock.)
 */
export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dateOnly = DATE_ONLY.test(d);
  const dt = new Date(dateOnly ? `${d}T00:00:00Z` : d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: dateOnly ? 'UTC' : IST });
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Whole days from a YYYY-MM-DD date to today in India (for "days unpaid" / ageing). */
export function daysSince(d: string): number {
  const toUtc = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10));
  return Math.round((toUtc(todayIST()) - toUtc(d.slice(0, 10))) / 86400000);
}

/** Short, easy-to-read amount for big numbers: ₹2.32 Cr, ₹65.46 L, ₹48,500. Exact figure is shown separately. */
export function formatCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  const v = Number(amount);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(a)}`;
}
