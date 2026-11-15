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

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
