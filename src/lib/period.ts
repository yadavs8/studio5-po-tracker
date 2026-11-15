import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// The portal starts on this date. Earlier records stay in the database but
// signed-in users never see the rows: migration_011's access rules (keyed to
// public.reporting_start(), which must match this date) hide them from every
// table and view. What is still owed on that older work is carried forward as
// per-site totals by brought_forward() (migration_016) — see loadBroughtForward.
export const REPORTING_START = '2026-08-01';
export const REPORTING_START_LABEL = '1 Aug 2026';

/** True when a date (YYYY-MM-DD or ISO) falls on or after the start. */
export const inPeriod = (d: string | null | undefined) => !!d && String(d).slice(0, 10) >= REPORTING_START;

/** Stop a record dated before the start (the database would refuse it). Returns false to cancel. */
export function confirmBeforeStart(date: string | null | undefined, what: string): boolean {
  if (!date || inPeriod(date)) return true;
  window.alert(`This ${what} is dated before ${REPORTING_START_LABEL}. The portal only keeps records from ${REPORTING_START_LABEL} onwards — please check the date.`);
  return false;
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
 * Brought-forward figures per site (or one site): money still owed on work dated before
 * REPORTING_START. The rows themselves stay hidden (migration_011); the database function
 * brought_forward() (migration_016, staff only) returns the per-site totals:
 * billed before − received before − tax deducted before − later payments matched to those invoices.
 */
export async function loadBroughtForward(siteId?: string): Promise<Record<string, BroughtForward>> {
  const { data, error } = await supabase.rpc('brought_forward', { p_site_id: siteId ?? null });
  if (error) throw new Error(error.message);
  const out: Record<string, BroughtForward> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out[String(r.site_id)] = {
      billed: n(r.billed), received: n(r.received), tax: n(r.tax), held: n(r.held),
      receivedSince: n(r.received_since), balance: n(r.balance),
    };
  }
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
  // Whole tables, so page through them (lib/fetchAll): a plain select stops at 1000 rows.
  // Cancelled / draft invoices are not bills (migration_014).
  const [invRows, setRows, payRows, poRows, dedRows] = await Promise.all([
    fetchAll(() => supabase.from('tax_invoice').select('invoice_id,site_id,invoice_date,gross_invoice_value').not('status', 'in', '(cancelled,draft)').order('invoice_id')),
    fetchAll(() => supabase.from('v_invoice_settlement').select('invoice_id,total_payments_allocated,remaining_balance').order('invoice_id')),
    fetchAll(() => supabase.from('payment').select('site_id,payment_date,amount_received').order('payment_id')),
    fetchAll(() => supabase.from('purchase_order').select('site_id,po_date,total_value_with_gst').order('po_id')),
    fetchAll(() => supabase.from('deduction').select('invoice_id,deduction_type,status,amount').order('deduction_id')),
  ]);
  const inv = { data: invRows }, set = { data: setRows }, pay = { data: payRows }, po = { data: poRows }, ded = { data: dedRows };

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
