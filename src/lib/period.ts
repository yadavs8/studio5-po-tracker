import { supabase } from '@/lib/supabase';

// Reports, statements and the dashboard cover this date onwards. Everything
// earlier stays in the database but is summarised as one brought-forward
// balance per site, so money still owed from before is never lost.
// Change this one line to move the cut-off.
export const REPORTING_START = '2026-07-01';
export const REPORTING_START_LABEL = '1 Jul 2026';

/** True when a date (YYYY-MM-DD or ISO) falls on or after the cut-off. */
export const inPeriod = (d: string | null | undefined) => !!d && String(d).slice(0, 10) >= REPORTING_START;

/** Ask before saving a record dated before the cut-off. Returns false to cancel. */
export function confirmBeforeStart(date: string | null | undefined, what: string): boolean {
  if (!date || inPeriod(date)) return true;
  return window.confirm(`This ${what} is dated before ${REPORTING_START_LABEL}. Records before then are only counted in the brought-forward balance, not listed. Save it anyway?`);
}

export interface BroughtForward {
  billed: number;        // tax invoices dated before the cut-off
  received: number;      // money received before the cut-off (not tagged to a newer PO)
  tax: number;           // TDS and other non-hold deductions on those invoices
  held: number;          // amounts still held back on those invoices (counted as owed)
  receivedSince: number; // later payments applied to those older invoices
  balance: number;       // still to receive on the older work, as of today
}

const isHold = (t: string) => t === 'retention' || t === 'handover_hold';
const n = (v: unknown) => Number(v ?? 0);

/**
 * Brought-forward figures per site (or one site). A cash-ledger view:
 * billed before − received before − tax deducted before, then reduced by any
 * later payment matched to one of those older invoices.
 */
export async function loadBroughtForward(siteId?: string): Promise<Record<string, BroughtForward>> {
  const invQ = supabase.from('tax_invoice').select('invoice_id,site_id,invoice_date,gross_invoice_value');
  const payQ = supabase.from('payment').select('payment_id,site_id,po_id,payment_date,amount_received');
  const poQ = supabase.from('purchase_order').select('po_id,po_date');
  const [inv, pay, po, ded, alloc] = await Promise.all([
    siteId ? invQ.eq('site_id', siteId) : invQ,
    siteId ? payQ.eq('site_id', siteId) : payQ,
    siteId ? poQ.eq('site_id', siteId) : poQ,
    supabase.from('deduction').select('invoice_id,deduction_type,status,amount'),
    supabase.from('payment_allocation').select('payment_id,invoice_id,amount_allocated'),
  ]);
  const failed = [inv, pay, po, ded, alloc].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const invs = (inv.data ?? []) as { invoice_id: string; site_id: string; invoice_date: string; gross_invoice_value: number }[];
  const pays = (pay.data ?? []) as { payment_id: string; site_id: string; po_id: string | null; payment_date: string; amount_received: number }[];
  const newPo = new Set(((po.data ?? []) as { po_id: string; po_date: string }[]).filter((p) => inPeriod(p.po_date)).map((p) => p.po_id));
  const oldInv = new Map(invs.filter((i) => !inPeriod(i.invoice_date)).map((i) => [i.invoice_id, i.site_id]));
  const newPay = new Set(pays.filter((p) => inPeriod(p.payment_date)).map((p) => p.payment_id));

  const out: Record<string, BroughtForward> = {};
  const at = (s: string) => (out[s] ??= { billed: 0, received: 0, tax: 0, held: 0, receivedSince: 0, balance: 0 });

  invs.filter((i) => !inPeriod(i.invoice_date)).forEach((i) => { at(i.site_id).billed += n(i.gross_invoice_value); });
  pays.filter((p) => !inPeriod(p.payment_date) && !(p.po_id && newPo.has(p.po_id))).forEach((p) => { at(p.site_id).received += n(p.amount_received); });
  ((ded.data ?? []) as { invoice_id: string; deduction_type: string; status: string; amount: number }[]).forEach((d) => {
    const s = oldInv.get(d.invoice_id);
    if (!s) return;
    if (!isHold(d.deduction_type)) at(s).tax += n(d.amount);
    else if (d.status === 'pending') at(s).held += n(d.amount);
  });
  ((alloc.data ?? []) as { payment_id: string; invoice_id: string; amount_allocated: number }[]).forEach((a) => {
    const s = oldInv.get(a.invoice_id);
    if (s && newPay.has(a.payment_id)) at(s).receivedSince += n(a.amount_allocated);
  });
  Object.values(out).forEach((b) => { b.balance = b.billed - b.received - b.tax - b.receivedSince; });
  return out;
}

export interface PeriodFigures {
  poValue: number;  // POs dated on/after the cut-off
  billed: number;   // tax invoices dated on/after the cut-off
  received: number; // money received on/after the cut-off
  paidOn: number;   // payments matched to those invoices
  tax: number;      // TDS / other deductions on those invoices
  held: number;     // still held back on those invoices
  waiting: number;  // still unpaid on those invoices
}

/** Per-site figures for the reporting period only (from REPORTING_START). */
export async function loadPeriodFigures(): Promise<Record<string, PeriodFigures>> {
  const [inv, set, pay, po, ded] = await Promise.all([
    supabase.from('tax_invoice').select('invoice_id,site_id,invoice_date,gross_invoice_value'),
    supabase.from('v_invoice_settlement').select('invoice_id,total_payments_allocated,remaining_balance'),
    supabase.from('payment').select('site_id,payment_date,amount_received'),
    supabase.from('purchase_order').select('site_id,po_date,total_value_with_gst'),
    supabase.from('deduction').select('invoice_id,deduction_type,status,amount'),
  ]);
  const failed = [inv, set, pay, po, ded].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const out: Record<string, PeriodFigures> = {};
  const at = (s: string) => (out[s] ??= { poValue: 0, billed: 0, received: 0, paidOn: 0, tax: 0, held: 0, waiting: 0 });
  const settle = new Map(((set.data ?? []) as { invoice_id: string; total_payments_allocated: number; remaining_balance: number }[]).map((r) => [r.invoice_id, r]));
  const newInv = new Map<string, string>();

  ((inv.data ?? []) as { invoice_id: string; site_id: string; invoice_date: string; gross_invoice_value: number }[])
    .filter((i) => inPeriod(i.invoice_date))
    .forEach((i) => {
      newInv.set(i.invoice_id, i.site_id);
      const f = at(i.site_id), s = settle.get(i.invoice_id);
      f.billed += n(i.gross_invoice_value);
      f.paidOn += n(s?.total_payments_allocated);
      f.waiting += n(s?.remaining_balance ?? i.gross_invoice_value);
    });
  ((ded.data ?? []) as { invoice_id: string; deduction_type: string; status: string; amount: number }[]).forEach((d) => {
    const s = newInv.get(d.invoice_id);
    if (!s) return;
    if (!isHold(d.deduction_type)) at(s).tax += n(d.amount);
    else if (d.status === 'pending') at(s).held += n(d.amount);
  });
  ((pay.data ?? []) as { site_id: string; payment_date: string; amount_received: number }[])
    .filter((p) => inPeriod(p.payment_date)).forEach((p) => { at(p.site_id).received += n(p.amount_received); });
  ((po.data ?? []) as { site_id: string; po_date: string; total_value_with_gst: number }[])
    .filter((p) => inPeriod(p.po_date)).forEach((p) => { at(p.site_id).poValue += n(p.total_value_with_gst); });
  return out;
}
