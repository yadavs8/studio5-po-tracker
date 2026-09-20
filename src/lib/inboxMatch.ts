// Pure helpers (no network): link a document read by the AI to your clients, sites, POs and existing records,
// and check the fields before anything is saved. Tested by scripts/test-inbox.mts.

export const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const STOP = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'the', 'and', 'of', 'co', 'company', 'india', 'a', 'unit', 'at', 'for', 'in']);
const tokens = (s: string | null | undefined) => (s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

/** 0..1. Dice score on words, with credit when one text is contained in the other. */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((t) => { if (B.has(t)) common++; });
  const dice = (2 * common) / (A.size + B.size);
  const contain = Math.min(A.size, B.size) >= 2 ? (common / Math.min(A.size, B.size)) * 0.9 : 0;
  return Math.max(dice, contain);
}

function best<T>(items: T[], text: string | null, names: (t: T) => (string | null)[], min: number): T | null {
  if (!text) return null;
  let top: T | null = null, score = 0;
  for (const it of items) {
    const s = Math.max(...names(it).map((n) => similarity(text, n)), 0);
    if (s > score) { score = s; top = it; }
  }
  return score >= min ? top : null;
}

export interface ClientLite { client_id: string; legal_name: string; display_name: string; gstin: string | null }
export interface SiteLite { site_id: string; client_id: string; site_name: string }
export interface PoLite { po_id: string; site_id: string; po_number: string }

export function matchClient(clients: ClientLite[], name: string | null, gstin: string | null): ClientLite | null {
  const g = norm(gstin);
  if (g.length >= 10) { const hit = clients.find((c) => norm(c.gstin) === g); if (hit) return hit; }
  return best(clients, name, (c) => [c.legal_name, c.display_name], 0.5);
}
export function matchSite(sites: SiteLite[], hint: string | null, scope: string | null): SiteLite | null {
  return best(sites, hint, (s) => [s.site_name], 0.4) ?? best(sites, scope, (s) => [s.site_name], 0.5);
}
export function matchPo(pos: PoLite[], ref: string | null): PoLite | null {
  const r = norm(ref);
  if (r.length < 3) return null;
  return pos.find((p) => norm(p.po_number) === r) ?? pos.find((p) => { const n = norm(p.po_number); return n.length >= 6 && r.length >= 6 && (n.includes(r) || r.includes(n)); }) ?? null;
}

export const isIsoDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const num = (s: string | number | null | undefined): number => { const n = Number(String(s ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };

export type DocKind = 'purchase_order' | 'proforma_invoice' | 'tax_invoice' | 'payment_advice';
export interface Draft {
  kind: DocKind; siteId: string; number: string; date: string;
  taxable: string; gst: string; total: string; amount: string; // amount = payment amount
}
export interface CheckContext {
  existingNumbers: string[];                  // same kind, same site
  today: string;                              // YYYY-MM-DD
  poLeftToBill?: number | null;               // for invoices linked to a PO
  matchedTotal?: number;                      // payment: sum matched to invoices
}

/** errors block saving; warnings are shown but allow saving. */
export function checkDraft(d: Draft, c: CheckContext): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!d.siteId) errors.push('Choose the site this belongs to.');
  if (d.kind !== 'payment_advice' && !d.number.trim()) errors.push('The document number is missing.');
  if (!isIsoDate(d.date)) errors.push('The date is missing or not valid.');
  else if (d.date > c.today) warnings.push('The date is in the future. Please check it.');

  if (d.kind === 'payment_advice') {
    if (num(d.amount) <= 0) errors.push('The amount received must be above zero.');
    if ((c.matchedTotal ?? 0) - num(d.amount) > 0.005) errors.push('You matched more than the amount received.');
  } else if (d.kind === 'tax_invoice') {
    const t = num(d.taxable), g = num(d.gst), tot = num(d.total);
    if (t <= 0) errors.push('The taxable value must be above zero.');
    if (Math.abs(t + g - tot) > 0.05) errors.push(`Taxable value + GST (${(t + g).toFixed(2)}) does not equal the invoice total (${tot.toFixed(2)}). Please correct the figures.`);
    if (c.poLeftToBill != null && tot > c.poLeftToBill + 0.5) warnings.push(`This invoice is more than what is left to bill on its PO (${c.poLeftToBill.toFixed(2)} left).`);
  } else {
    if (num(d.total) <= 0) errors.push(d.kind === 'purchase_order' ? 'The PO total (with GST) must be above zero.' : 'The amount must be above zero.');
  }
  if (d.kind !== 'payment_advice' && d.number.trim() && c.existingNumbers.some((n) => norm(n) === norm(d.number))) {
    errors.push(`"${d.number.trim()}" is already recorded for this site. This looks like a duplicate.`);
  }
  return { errors, warnings };
}

/** Suggest how a payment covers open invoices: only the invoices the advice names, in the order given, never more than each still needs. */
export function suggestMatches(amount: number, open: { invoice_id: string; invoice_number: string; remaining: number }[], mentioned: string[]): Record<string, number> {
  const want = new Set(mentioned.map(norm));
  const ordered = open.filter((o) => want.has(norm(o.invoice_number))); // only invoices the advice names; nothing is guessed
  const out: Record<string, number> = {};
  let left = amount;
  for (const o of ordered) {
    if (left <= 0.005) break;
    const x = Math.min(left, o.remaining);
    if (x > 0.005) { out[o.invoice_id] = Math.round(x * 100) / 100; left -= x; }
  }
  return out;
}
