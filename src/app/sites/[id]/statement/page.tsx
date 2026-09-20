'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { formatINR, formatDate } from '@/lib/format';
import { ErrorBanner, EmptyState } from '@/lib/ui';

interface Po { po_id: string; po_number: string; po_date: string; scope_description: string | null; po_value: number; invoiced: number; received_bank: number; tds_and_other_deductions: number; retention_pending: number; balance_against_po: number; }
interface Inv { invoice_id: string; po_id: string | null; sub_project_id: string | null; invoice_number: string; invoice_date: string; taxable_value: number; gst_amount: number | null; gross_invoice_value: number; }
interface Settle { invoice_id: string; total_payments_allocated: number; total_deducted: number; remaining_balance: number; }
interface Pay { payment_id: string; po_id: string | null; payment_date: string; amount_received: number; payment_type: string; utr_or_reference: string | null; remarks: string | null; }
interface Alloc { payment_id: string; amount_allocated: number; }
interface Sub { sub_project_id: string; name: string; }
interface Ded { invoice_id: string; deduction_type: string; amount: number; status: string; }

const n = (v: unknown) => Number(v ?? 0);
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);

export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  const [siteName, setSiteName] = useState('');
  const [client, setClient] = useState('');
  const [pos, setPos] = useState<Po[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [settle, setSettle] = useState<Record<string, Settle>>({});
  const [pays, setPays] = useState<Pay[]>([]);
  const [allocByPay, setAllocByPay] = useState<Record<string, number>>({});
  const [subs, setSubs] = useState<Sub[]>([]);
  const [deds, setDeds] = useState<Ded[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const q = await Promise.all([
        supabase.from('site').select('site_name, client:client_id(display_name)').eq('site_id', id).single(),
        supabase.from('v_po_summary').select('*').eq('site_id', id).order('po_date'),
        supabase.from('tax_invoice').select('invoice_id,po_id,sub_project_id,invoice_number,invoice_date,taxable_value,gst_amount,gross_invoice_value').eq('site_id', id).order('invoice_date'),
        supabase.from('v_invoice_settlement').select('invoice_id,total_payments_allocated,total_deducted,remaining_balance').eq('site_id', id),
        supabase.from('payment').select('payment_id,po_id,payment_date,amount_received,payment_type,utr_or_reference,remarks').eq('site_id', id).order('payment_date'),
        supabase.from('sub_project').select('sub_project_id,name').eq('site_id', id),
      ]);
      const failed = q.find((r) => r.error);
      if (failed?.error) { setError(failed.error.message); setLoading(false); return; }
      const s = q[0].data as unknown as { site_name: string; client: { display_name: string } | null };
      setSiteName(s.site_name); setClient(s.client?.display_name ?? '');
      setPos((q[1].data ?? []) as Po[]);
      const invRows = (q[2].data ?? []) as Inv[];
      setInvs(invRows);
      if (invRows.length) {
        const { data: d } = await supabase.from('deduction').select('invoice_id,deduction_type,amount,status').in('invoice_id', invRows.map((i) => i.invoice_id));
        setDeds((d ?? []) as Ded[]);
      }
      setSettle(Object.fromEntries(((q[3].data ?? []) as Settle[]).map((r) => [r.invoice_id, r])));
      const payRows = (q[4].data ?? []) as Pay[];
      setPays(payRows);
      setSubs((q[5].data ?? []) as Sub[]);
      if (payRows.length) {
        const { data: a } = await supabase.from('payment_allocation').select('payment_id,amount_allocated').in('payment_id', payRows.map((p) => p.payment_id));
        const m: Record<string, number> = {};
        ((a ?? []) as Alloc[]).forEach((x) => { m[x.payment_id] = (m[x.payment_id] ?? 0) + n(x.amount_allocated); });
        setAllocByPay(m);
      }
      setLoading(false);
    })();
  }, [id]);

  const poNo = (poId: string | null) => pos.find((p) => p.po_id === poId)?.po_number ?? '—';

  // ---- Table 1: PO-wise account statement -----------------------------------
  const noPoInvs = invs.filter((i) => !i.po_id);
  const isHold = (d: Ded) => d.deduction_type === 'retention' || d.deduction_type === 'handover_hold';
  const noPoIds = new Set(noPoInvs.map((i) => i.invoice_id));
  const noPoDeds = deds.filter((d) => noPoIds.has(d.invoice_id));
  const noPo = {
    billed: sum(noPoInvs, (i) => n(i.gross_invoice_value)),
    paid: sum(noPoInvs, (i) => n(settle[i.invoice_id]?.total_payments_allocated)),
    tds: sum(noPoDeds.filter((d) => !isHold(d)), (d) => n(d.amount)),
    held: sum(noPoDeds.filter((d) => isHold(d) && d.status === 'pending'), (d) => n(d.amount)),
    left: sum(noPoInvs, (i) => n(settle[i.invoice_id]?.remaining_balance ?? i.gross_invoice_value)),
  };
  const totals = {
    po: sum(pos, (p) => n(p.po_value)),
    billed: sum(pos, (p) => n(p.invoiced)) + noPo.billed,
    received: sum(pos, (p) => n(p.received_bank)) + noPo.paid,
    tds: sum(pos, (p) => n(p.tds_and_other_deductions)) + noPo.tds,
    held: sum(pos, (p) => n(p.retention_pending)) + noPo.held,
    balance: sum(pos, (p) => n(p.balance_against_po)) + noPo.left,
  };

  // ---- Table 2: tax invoices, grouped by sub-project (tower) or PO -----------
  const groupKey = (i: Inv) => (i.sub_project_id ? `sp:${i.sub_project_id}` : i.po_id ? `po:${i.po_id}` : 'none');
  const groupName = (k: string) =>
    k.startsWith('sp:') ? subs.find((s) => s.sub_project_id === k.slice(3))?.name ?? 'Sub-project'
      : k.startsWith('po:') ? `PO ${poNo(k.slice(3))}` : 'Not linked to a PO or sub-project';
  const groups = Array.from(new Set(invs.map(groupKey))).map((k) => ({ k, name: groupName(k), rows: invs.filter((i) => groupKey(i) === k) }));

  // ---- Table 3: receipts -----------------------------------------------------
  const receiptRows = pays.map((p) => ({ p, used: n(allocByPay[p.payment_id]), unmatched: n(p.amount_received) - n(allocByPay[p.payment_id]) }));

  function exportExcel() {
    const asOn = new Date().toLocaleDateString('en-IN');
    const head = ['STUDIO5 INTERIORS PVT LTD', `${client} - ${siteName}`, `Account statement as on ${asOn}`, ''];
    const s1: (string | number)[][] = [
      ...head.map((h) => [h]),
      ['S.N.', 'Particulars', 'PO No.', 'Dated', 'PO amount (with GST)', 'Billed so far', 'Payment received', 'Tax deducted by client', 'Held back until handover', 'Balance still to receive'],
      ...pos.map((p, i) => [i + 1, p.scope_description ?? '', p.po_number, formatDate(p.po_date), n(p.po_value), n(p.invoiced), n(p.received_bank), n(p.tds_and_other_deductions), n(p.retention_pending), n(p.balance_against_po)]),
      ...(noPoInvs.length ? [['', 'Invoices not linked to a PO', '', '', '', noPo.billed, noPo.paid, noPo.tds, noPo.held, noPo.left]] : []),
      ['', 'TOTAL', '', '', totals.po, totals.billed, totals.received, totals.tds, totals.held, totals.balance],
    ];
    const s2: (string | number)[][] = [...head.slice(0, 3).map((h) => [h]), ['Tax invoice details'], [],
      ['Group', 'Invoice No.', 'Invoice date', 'Taxable value', 'GST', 'Invoice total', 'Paid so far', 'Tax deducted / held', 'Still to pay']];
    groups.forEach((g) => {
      g.rows.forEach((i) => { const st = settle[i.invoice_id]; s2.push([g.name, i.invoice_number, formatDate(i.invoice_date), n(i.taxable_value), n(i.gst_amount), n(i.gross_invoice_value), n(st?.total_payments_allocated), n(st?.total_deducted), n(st?.remaining_balance ?? i.gross_invoice_value)]); });
      s2.push([`${g.name} - total`, '', '', sum(g.rows, (i) => n(i.taxable_value)), sum(g.rows, (i) => n(i.gst_amount)), sum(g.rows, (i) => n(i.gross_invoice_value)),
        sum(g.rows, (i) => n(settle[i.invoice_id]?.total_payments_allocated)), sum(g.rows, (i) => n(settle[i.invoice_id]?.total_deducted)),
        sum(g.rows, (i) => n(settle[i.invoice_id]?.remaining_balance ?? i.gross_invoice_value))]);
    });
    const s3: (string | number)[][] = [...head.slice(0, 3).map((h) => [h]), ['Money received in bank'], [],
      ['Date', 'Reference / note', 'Type', 'For PO', 'Amount received', 'Used on invoices', 'Not yet matched'],
      ...receiptRows.map(({ p, used, unmatched }) => [formatDate(p.payment_date), [p.utr_or_reference, p.remarks].filter(Boolean).join(' - '), p.payment_type.replace(/_/g, ' '), poNo(p.po_id), n(p.amount_received), used, unmatched]),
      ['TOTAL', '', '', '', sum(receiptRows, (r) => n(r.p.amount_received)), sum(receiptRows, (r) => r.used), sum(receiptRows, (r) => r.unmatched)]];

    const wb = XLSX.utils.book_new();
    [['Account statement', s1, [6, 34, 34, 13, 20, 16, 18, 20, 22, 22]], ['Tax invoices', s2, [30, 20, 14, 16, 14, 16, 16, 18, 16]], ['Money received', s3, [14, 50, 18, 30, 18, 18, 18]]]
      .forEach(([name, rows, w]) => {
        const ws = XLSX.utils.aoa_to_sheet(rows as (string | number)[][]);
        ws['!cols'] = (w as number[]).map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, name as string);
      });
    XLSX.writeFile(wb, `Studio5 - ${siteName} - account statement.xlsx`);
  }

  const asOn = formatDate(new Date().toISOString());

  return (
    <div className="min-h-screen bg-white px-8 py-6 print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/sites/${id}`} className="font-sans text-xs text-[#1F3A52] underline">← Back to site</Link>
        <div className="flex gap-2">
          <button onClick={exportExcel} disabled={loading} className="bg-[#1F3A52] px-4 py-2 font-sans text-xs font-medium text-white hover:bg-[#1F3A52]/90 disabled:opacity-50">Download Excel</button>
          <button onClick={() => window.print()} disabled={loading} className="border border-[#1F3A52] px-4 py-2 font-sans text-xs font-medium text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white disabled:opacity-50">Print / Save as PDF</button>
        </div>
      </div>
      {error && <ErrorBanner message={error} />}
      {loading ? <EmptyState text="Preparing statement…" /> : (
        <div className="mx-auto max-w-[1200px] font-sans text-[#1C1C1A]">
          <div className="text-center">
            <div className="font-serif text-xl font-semibold">ACCOUNT STATEMENT</div>
            <div className="mt-1 text-sm font-semibold">STUDIO5 INTERIORS PVT LTD</div>
            <div className="text-sm">{client.toUpperCase()} — {siteName.toUpperCase()}</div>
            <div className="mt-1 font-mono text-xs text-[#1C1C1A]/60">As on {asOn}</div>
          </div>

          <H>1. Purchase orders — what was agreed, received and what is left</H>
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-[#1F3A52] text-white">
              {['S.N.', 'Particulars', 'PO No.', 'Dated', 'PO amount (with GST)', 'Billed so far', 'Payment received', 'Tax deducted by client', 'Held back until handover', 'Balance still to receive'].map((h, i) => (
                <th key={h} className={`border border-[#1F3A52] px-2 py-2 text-[11px] font-semibold ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>))}
            </tr></thead>
            <tbody>
              {pos.map((p, i) => (
                <tr key={p.po_id}>
                  <C>{i + 1}</C><C>{p.scope_description ?? ''}</C><C>{p.po_number}</C><C mono>{formatDate(p.po_date)}</C>
                  <C r>{formatINR(p.po_value)}</C><C r>{formatINR(p.invoiced)}</C><C r>{formatINR(p.received_bank)}</C>
                  <C r>{formatINR(p.tds_and_other_deductions)}</C><C r>{formatINR(p.retention_pending)}</C><C r bold>{formatINR(p.balance_against_po)}</C>
                </tr>
              ))}
              {noPoInvs.length > 0 && (
                <tr className="bg-[#B8860B]/5">
                  <C> </C><C>Invoices not linked to a PO ({noPoInvs.length})</C><C> </C><C> </C><C r> </C>
                  <C r>{formatINR(noPo.billed)}</C><C r>{formatINR(noPo.paid)}</C><C r>{formatINR(noPo.tds)}</C><C r>{formatINR(noPo.held)}</C><C r bold>{formatINR(noPo.left)}</C>
                </tr>
              )}
              <tr className="bg-[#FFF200]/50 font-semibold">
                <C> </C><C bold>TOTAL</C><C> </C><C> </C><C r bold>{formatINR(totals.po)}</C><C r bold>{formatINR(totals.billed)}</C>
                <C r bold>{formatINR(totals.received)}</C><C r bold>{formatINR(totals.tds)}</C><C r bold>{formatINR(totals.held)}</C><C r bold>{formatINR(totals.balance)}</C>
              </tr>
            </tbody>
          </table>
          {noPoInvs.length > 0 && <p className="mt-1 text-[11px] text-[#1C1C1A]/60">For invoices that are not linked to a PO there is nothing to measure against, so the last column is simply what the client still owes on those invoices (held-back amounts are shown in their own column, not counted as owed).</p>}

          <H>2. Tax invoices raised</H>
          {invs.length === 0 ? <p className="text-sm text-[#1C1C1A]/50">No tax invoices raised yet.</p> : (
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-[#1F3A52] text-white">
                {['Invoice No.', 'Date', 'Taxable value', 'GST', 'Invoice total', 'Paid so far', 'Tax deducted / held', 'Still to pay'].map((h, i) => (
                  <th key={h} className={`border border-[#1F3A52] px-2 py-2 text-[11px] font-semibold ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>))}
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.k} g={g} settle={settle} />
                ))}
              </tbody>
            </table>
          )}

          <H>3. Money received in bank</H>
          {pays.length === 0 ? <p className="text-sm text-[#1C1C1A]/50">No money received yet.</p> : (
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-[#1F3A52] text-white">
                {['Date', 'Reference / note', 'Type', 'For PO', 'Amount received', 'Used on invoices', 'Not yet matched'].map((h, i) => (
                  <th key={h} className={`border border-[#1F3A52] px-2 py-2 text-[11px] font-semibold ${i >= 4 ? 'text-right' : 'text-left'}`}>{h}</th>))}
              </tr></thead>
              <tbody>
                {receiptRows.map(({ p, used, unmatched }) => (
                  <tr key={p.payment_id}>
                    <C mono>{formatDate(p.payment_date)}</C><C>{[p.utr_or_reference, p.remarks].filter(Boolean).join(' — ')}</C>
                    <C>{p.payment_type.replace(/_/g, ' ')}</C><C>{poNo(p.po_id)}</C>
                    <C r>{formatINR(p.amount_received)}</C><C r>{formatINR(used)}</C><C r>{formatINR(unmatched)}</C>
                  </tr>
                ))}
                <tr className="bg-[#FFF200]/50 font-semibold">
                  <C bold>TOTAL</C><C> </C><C> </C><C> </C>
                  <C r bold>{formatINR(sum(receiptRows, (r) => n(r.p.amount_received)))}</C><C r bold>{formatINR(sum(receiptRows, (r) => r.used))}</C><C r bold>{formatINR(sum(receiptRows, (r) => r.unmatched))}</C>
                </tr>
              </tbody>
            </table>
          )}

          <div className="mt-8 border-t border-[#1C1C1A]/20 pt-3 text-[11px] leading-relaxed text-[#1C1C1A]/70">
            <b>How to read this statement.</b> <i>Balance still to receive</i> = PO amount − payment received − tax deducted by the client. It includes work not yet billed and any amount the client is holding back until handover.
            <i> Tax deducted</i> is TDS the client deposits with the tax department for us (we get credit for it). <i>Held back</i> is kept by the client until the site is handed over and is not overdue.
            <i> Not yet matched</i> is money received that has not yet been assigned to an invoice. Every figure is calculated from the recorded POs, invoices, payments and deductions.
          </div>
        </div>
      )}
    </div>
  );
}

function GroupRows({ g, settle }: { g: { k: string; name: string; rows: Inv[] }; settle: Record<string, Settle> }) {
  return (
    <>
      <tr className="bg-[#1F3A52]/10"><td colSpan={8} className="border border-[#1C1C1A]/20 px-2 py-1.5 text-xs font-semibold">{g.name}</td></tr>
      {g.rows.map((i) => {
        const st = settle[i.invoice_id];
        return (
          <tr key={i.invoice_id}>
            <C>{i.invoice_number}</C><C mono>{formatDate(i.invoice_date)}</C><C r>{formatINR(i.taxable_value)}</C><C r>{i.gst_amount === null ? '—' : formatINR(i.gst_amount)}</C>
            <C r>{formatINR(i.gross_invoice_value)}</C><C r>{formatINR(st?.total_payments_allocated ?? 0)}</C><C r>{formatINR(st?.total_deducted ?? 0)}</C>
            <C r bold>{formatINR(st?.remaining_balance ?? i.gross_invoice_value)}</C>
          </tr>
        );
      })}
      <tr className="font-semibold">
        <C bold>Total — {g.name}</C><C> </C>
        <C r bold>{formatINR(sum(g.rows, (i) => n(i.taxable_value)))}</C><C r bold>{formatINR(sum(g.rows, (i) => n(i.gst_amount)))}</C>
        <C r bold>{formatINR(sum(g.rows, (i) => n(i.gross_invoice_value)))}</C>
        <C r bold>{formatINR(sum(g.rows, (i) => n(settle[i.invoice_id]?.total_payments_allocated)))}</C>
        <C r bold>{formatINR(sum(g.rows, (i) => n(settle[i.invoice_id]?.total_deducted)))}</C>
        <C r bold>{formatINR(sum(g.rows, (i) => n(settle[i.invoice_id]?.remaining_balance ?? i.gross_invoice_value)))}</C>
      </tr>
    </>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-8 font-serif text-base font-semibold text-[#1F3A52]">{children}</h2>;
}
function C({ children, r, mono, bold }: { children: React.ReactNode; r?: boolean; mono?: boolean; bold?: boolean }) {
  return <td className={`border border-[#1C1C1A]/20 px-2 py-1.5 ${r ? 'text-right font-mono tabular-nums' : ''} ${mono ? 'font-mono' : ''} ${bold ? 'font-semibold' : ''}`}>{children}</td>;
}
