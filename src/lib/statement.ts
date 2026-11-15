// Account-statement figures for one site, as pure functions so they can be unit-tested.
// Per-PO money comes from v_po_summary (migration_014), which already counts each
// payment once: under the PO whose invoice it paid, or (if unmatched) under its tagged PO.
import { inPeriod, type BroughtForward } from '@/lib/period';

export interface StatementPo {
  po_id: string; po_number: string; po_date: string; po_value: number; invoiced: number; received_bank: number;
  tds_and_other_deductions: number; retention_pending: number; balance_against_po: number;
}
export interface StatementInv { invoice_id: string; po_id: string | null; invoice_date: string; gross_invoice_value: number; status: string }
export interface StatementSettle { invoice_id: string; total_payments_allocated: number; total_deducted: number; remaining_balance: number }
export interface StatementDed { invoice_id: string; deduction_type: string; amount: number; status: string }
export interface StatementPay { payment_id: string; po_id: string | null; payment_date: string; amount_received: number }

export interface StatementInput<P extends StatementPo = StatementPo, I extends StatementInv = StatementInv, Y extends StatementPay = StatementPay> {
  pos: P[];
  invs: I[];
  settle: Record<string, StatementSettle>;
  deds: StatementDed[];
  pays: Y[];
  allocByPay: Record<string, number>;
  bf: BroughtForward | null;
}

const n = (v: unknown) => Number(v ?? 0);
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
const isHold = (d: StatementDed) => d.deduction_type === 'retention' || d.deduction_type === 'handover_hold';
/** Cancelled and draft tax invoices are not bills (migration_014 leaves them out of every total). */
export const countsAsBilled = (i: { status: string }) => i.status !== 'cancelled' && i.status !== 'draft';

export function statementFigures<P extends StatementPo, I extends StatementInv, Y extends StatementPay>(input: StatementInput<P, I, Y>) {
  const { settle, deds, allocByPay } = input;
  const pos = input.pos.filter((p) => inPeriod(p.po_date));
  const invs = input.invs.filter((i) => inPeriod(i.invoice_date) && countsAsBilled(i));
  const pays = input.pays.filter((p) => inPeriod(p.payment_date));

  // Invoices whose PO is not listed (no PO, or a PO dated before the start) are summed in one row.
  const visiblePo = new Set(pos.map((p) => p.po_id));
  const noPoInvs = invs.filter((i) => !i.po_id || !visiblePo.has(i.po_id));
  const noPoIds = new Set(noPoInvs.map((i) => i.invoice_id));
  const noPoDeds = deds.filter((d) => noPoIds.has(d.invoice_id));
  const noPo = {
    billed: sum(noPoInvs, (i) => n(i.gross_invoice_value)),
    paid: sum(noPoInvs, (i) => n(settle[i.invoice_id]?.total_payments_allocated)),
    tds: sum(noPoDeds.filter((d) => !isHold(d)), (d) => n(d.amount)),
    held: sum(noPoDeds.filter((d) => isHold(d) && d.status === 'pending'), (d) => n(d.amount)),
    left: sum(noPoInvs, (i) => n(settle[i.invoice_id]?.remaining_balance ?? i.gross_invoice_value)),
  };

  // Money in the bank that is neither matched to an invoice nor tagged to a listed PO.
  const unassigned = sum(
    pays.filter((p) => !p.po_id || !visiblePo.has(p.po_id)),
    (p) => Math.max(n(p.amount_received) - n(allocByPay[p.payment_id]), 0),
  );

  const b = input.bf ?? { billed: 0, received: 0, tax: 0, held: 0, receivedSince: 0, balance: 0 };
  const hasBf = Math.abs(b.billed) + Math.abs(b.received) + Math.abs(b.tax) > 0.5;
  const totals = {
    po: sum(pos, (p) => n(p.po_value)),
    billed: sum(pos, (p) => n(p.invoiced)) + noPo.billed + b.billed,
    received: sum(pos, (p) => n(p.received_bank)) + noPo.paid + unassigned + b.received + b.receivedSince,
    tds: sum(pos, (p) => n(p.tds_and_other_deductions)) + noPo.tds + b.tax,
    held: sum(pos, (p) => n(p.retention_pending)) + noPo.held + b.held,
    // Kept apart on purpose (decision 0009): a PO balance includes work not yet billed,
    // an invoice balance is only what is billed and unpaid.
    balanceOnPos: sum(pos, (p) => n(p.balance_against_po)),
    balanceNoPo: noPo.left,
    balanceBroughtForward: b.balance,
  };
  return {
    pos, invs, pays, noPoInvs, noPo, unassigned, bf: b, hasBf, totals,
    /** Everything received in the period plus brought forward: the received total must equal this. */
    bankReceived: sum(pays, (p) => n(p.amount_received)) + b.received + b.receivedSince,
  };
}
