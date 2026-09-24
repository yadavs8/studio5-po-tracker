'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Building2, Layers, Clock, Wallet, ShieldCheck, ScrollText, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { formatDate } from '@/lib/format';
import { downloadWorkbook, num, today, type Cell, type Sheet } from '@/lib/exportXlsx';
import { PageHeader, ErrorBanner, PrimaryButton, FieldSelect } from '@/lib/ui';

interface SiteOpt { site_id: string; site_name: string; client: string; }

const HEAD = (title: string): Cell[][] => [['STUDIO5 INTERIORS PVT LTD'], [title], [`As on ${today()}`], []];
const sum = (rows: Cell[][], i: number) => rows.reduce((s, r) => s + num(r[i]), 0);

export default function ReportsPage() {
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [siteId, setSiteId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('site').select('site_id, site_name, client:client_id(display_name)').order('site_name').then(({ data, error }) => {
      if (error) { setError(friendlyError(error)); return; }
      setSites(((data ?? []) as unknown as { site_id: string; site_name: string; client: { display_name: string } | null }[])
        .map((s) => ({ site_id: s.site_id, site_name: s.site_name, client: s.client?.display_name ?? '' })));
    });
  }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(null); setDone(null);
    try { await fn(); setDone(key); } catch (e) { setError(friendlyError(e as Error)); }
    setBusy(null);
  }
  const must = <T,>(r: { data: T | null; error: { message: string; code?: string } | null }): T => {
    if (r.error) throw new Error(friendlyError(r.error));
    return (r.data ?? []) as T;
  };

  // ---- 1. All sites at a glance -----------------------------------------------------------
  const allSites = () => run('sites', async () => {
    const d = must(await supabase.from('v_site_dashboard').select('*').order('client_name')) as Record<string, unknown>[];
    const rows: Cell[][] = d.map((r, i) => [i + 1, String(r.client_name), String(r.site_name), num(r.current_contract_value), num(r.total_invoiced), num(r.total_collected),
      num(r.normal_outstanding), num(r.retention_outstanding), num(r.advance_balance),
      r.billing_progress_pct === null ? '' : num(r.billing_progress_pct), r.physical_progress_pct === null ? '' : num(r.physical_progress_pct)]);
    rows.push(['', 'TOTAL', '', sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6), sum(rows, 7), sum(rows, 8), '', '']);
    downloadWorkbook('Studio5 - All sites summary', [{ name: 'All sites', widths: [6, 28, 38, 18, 18, 18, 20, 20, 18, 14, 14],
      rows: [...HEAD('All sites at a glance'), ['S.N.', 'Client', 'Site', 'PO value (with GST)', 'Billed so far', 'Money received', 'Billed, waiting for payment', 'Held back until handover', 'Advance not yet used', 'Billed % of PO', 'Work done %'], ...rows] }]);
  });

  // ---- 2. PO-wise statement, all sites -----------------------------------------------------
  const poStatement = () => run('po', async () => {
    const [pos, st] = await Promise.all([supabase.from('v_po_summary').select('*').order('po_date'), supabase.from('site').select('site_id, site_name, client:client_id(display_name)')]);
    const po = must(pos) as Record<string, unknown>[];
    const siteMap = new Map(((must(st) as unknown as { site_id: string; site_name: string; client: { display_name: string } | null }[])).map((s) => [s.site_id, s]));
    const list = po.map((p) => ({ p, s: siteMap.get(String(p.site_id)) })).sort((a, b) => (a.s?.client?.display_name ?? '').localeCompare(b.s?.client?.display_name ?? '') || String(a.p.po_date).localeCompare(String(b.p.po_date)));
    const rows: Cell[][] = list.map(({ p, s }, i) => [i + 1, s?.client?.display_name ?? '', s?.site_name ?? '', String(p.scope_description ?? ''), String(p.po_number), formatDate(String(p.po_date)),
      num(p.po_value), num(p.invoiced), num(p.received_bank), num(p.tds_and_other_deductions), num(p.retention_pending), num(p.balance_against_po)]);
    rows.push(['', 'TOTAL', '', '', '', '', sum(rows, 6), sum(rows, 7), sum(rows, 8), sum(rows, 9), sum(rows, 10), sum(rows, 11)]);
    downloadWorkbook('Studio5 - PO-wise statement (all sites)', [{ name: 'PO statement', widths: [6, 26, 34, 34, 34, 13, 18, 16, 18, 18, 18, 20],
      rows: [...HEAD('Account statement - purchase order wise (all sites)'), ['S.N.', 'Client', 'Site', 'Particulars', 'PO No.', 'Dated', 'PO amount (with GST)', 'Billed so far', 'Payment received', 'Tax deducted by client', 'Held back until handover', 'Balance still to receive'], ...rows] }]);
  });

  // ---- 3. Tower / sub-project payment details (your DSS sheets) ------------------------------
  const towerSheets = () => run('tower', async () => {
    if (!siteId) throw new Error('Please choose a site first.');
    const site = sites.find((s) => s.site_id === siteId)!;
    const [inv, set, sub, ded] = await Promise.all([
      supabase.from('tax_invoice').select('invoice_id,sub_project_id,invoice_number,invoice_date,taxable_value,gst_amount,gross_invoice_value').eq('site_id', siteId).order('invoice_date'),
      supabase.from('v_invoice_settlement').select('invoice_id,total_payments_allocated,remaining_balance').eq('site_id', siteId),
      supabase.from('sub_project').select('sub_project_id,name').eq('site_id', siteId).order('name'),
      supabase.from('deduction').select('invoice_id,deduction_type,amount,status'),
    ]);
    const invs = must(inv) as Record<string, unknown>[];
    const settle = new Map((must(set) as Record<string, unknown>[]).map((r) => [String(r.invoice_id), r]));
    const subs = must(sub) as { sub_project_id: string; name: string }[];
    const ids = new Set(invs.map((i) => String(i.invoice_id)));
    const deds = (must(ded) as Record<string, unknown>[]).filter((d) => ids.has(String(d.invoice_id)));
    const isHold = (t: unknown) => t === 'retention' || t === 'handover_hold';
    const groups: { name: string; rows: Record<string, unknown>[] }[] = subs.map((s) => ({ name: s.name, rows: invs.filter((i) => i.sub_project_id === s.sub_project_id) }));
    const other = invs.filter((i) => !i.sub_project_id);
    if (other.length) groups.push({ name: 'Other (no tower)', rows: other });

    const HDR: Cell[] = ['S.N.', 'Invoice No.', 'Invoice date', 'Taxable value', 'GST / IGST', 'Invoice amount', 'Payment received', 'Tax deducted (TDS)', 'Held back until handover', 'Balance still to pay'];
    const sheets: Sheet[] = [];
    const summary: Cell[][] = [];
    groups.filter((g) => g.rows.length).forEach((g) => {
      const rows: Cell[][] = g.rows.map((i, n) => {
        const id = String(i.invoice_id), s = settle.get(id);
        const dd = deds.filter((d) => String(d.invoice_id) === id);
        const tds = dd.filter((d) => !isHold(d.deduction_type)).reduce((a, d) => a + num(d.amount), 0);
        const held = dd.filter((d) => isHold(d.deduction_type) && d.status === 'pending').reduce((a, d) => a + num(d.amount), 0);
        return [n + 1, String(i.invoice_number), formatDate(String(i.invoice_date)), num(i.taxable_value), num(i.gst_amount), num(i.gross_invoice_value), num(s?.total_payments_allocated), tds, held, num(s?.remaining_balance ?? i.gross_invoice_value)];
      });
      const tot: Cell[] = ['', 'TOTAL', '', sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6), sum(rows, 7), sum(rows, 8), sum(rows, 9)];
      sheets.push({ name: g.name, widths: [6, 22, 14, 16, 14, 16, 18, 18, 22, 20], rows: [...HEAD(`${site.client} - ${site.site_name} - ${g.name} payment details`), HDR, ...rows, tot] });
      summary.push([g.name, num(tot[5]), num(tot[6]), num(tot[7]), num(tot[8]), num(tot[9])]);
    });
    if (!sheets.length) throw new Error('This site has no tax invoices yet.');
    summary.push(['TOTAL', sum(summary, 1), sum(summary, 2), sum(summary, 3), sum(summary, 4), sum(summary, 5)]);
    sheets.unshift({ name: 'Summary', widths: [30, 18, 18, 18, 22, 20],
      rows: [...HEAD(`${site.client} - ${site.site_name} - summary by tower / package`), ['Tower / package', 'Tax invoices', 'Payments received', 'Tax deducted (TDS)', 'Held back until handover', 'Balance still to pay'], ...summary] });
    downloadWorkbook(`Studio5 - ${site.site_name} - tower payment details`, sheets);
  });

  // ---- 4. Money waiting to be paid, with age ------------------------------------------------
  const ageing = () => run('age', async () => {
    const [set, inv, st] = await Promise.all([
      supabase.from('v_invoice_settlement').select('invoice_id,site_id,invoice_number,gross_invoice_value,total_payments_allocated,total_deducted,remaining_balance').gt('remaining_balance', 0.5),
      supabase.from('tax_invoice').select('invoice_id,invoice_date'),
      supabase.from('site').select('site_id, site_name, client:client_id(display_name)'),
    ]);
    const dates = new Map((must(inv) as { invoice_id: string; invoice_date: string }[]).map((i) => [i.invoice_id, i.invoice_date]));
    const siteMap = new Map(((must(st) as unknown as { site_id: string; site_name: string; client: { display_name: string } | null }[])).map((s) => [s.site_id, s]));
    const now = Date.now();
    const list = (must(set) as Record<string, unknown>[]).map((r) => {
      const d = dates.get(String(r.invoice_id)) ?? '';
      const days = d ? Math.max(0, Math.floor((now - new Date(d).getTime()) / 86400000)) : 0;
      return { r, d, days, s: siteMap.get(String(r.site_id)) };
    }).sort((a, b) => b.days - a.days);
    const bucket = (n: number) => (n <= 30 ? '0-30 days' : n <= 60 ? '31-60 days' : n <= 90 ? '61-90 days' : 'Over 90 days');
    const rows: Cell[][] = list.map(({ r, d, days, s }, i) => [i + 1, s?.client?.display_name ?? '', s?.site_name ?? '', String(r.invoice_number), d ? formatDate(d) : '', days, bucket(days),
      num(r.gross_invoice_value), num(r.total_payments_allocated), num(r.total_deducted), num(r.remaining_balance)]);
    rows.push(['', 'TOTAL', '', '', '', '', '', sum(rows, 7), sum(rows, 8), sum(rows, 9), sum(rows, 10)]);
    const byBucket = ['0-30 days', '31-60 days', '61-90 days', 'Over 90 days'].map((b): Cell[] => [b, list.filter((x) => bucket(x.days) === b).reduce((a, x) => a + num(x.r.remaining_balance), 0)]);
    downloadWorkbook('Studio5 - Money waiting to be paid', [
      { name: 'By invoice', widths: [6, 26, 34, 22, 14, 10, 14, 16, 16, 16, 18],
        rows: [...HEAD('Invoices waiting for payment - oldest first'), ['S.N.', 'Client', 'Site', 'Invoice No.', 'Invoice date', 'Days old', 'Age', 'Invoice amount', 'Paid so far', 'Tax deducted / held', 'Still to pay'], ...rows] },
      { name: 'By age', widths: [20, 20], rows: [...HEAD('Waiting for payment - by age'), ['Age', 'Still to pay'], ...byBucket] },
    ]);
  });

  // ---- 5. Payments register ---------------------------------------------------------------
  const payments = () => run('pay', async () => {
    const [pay, al, po, st] = await Promise.all([
      supabase.from('payment').select('*').order('payment_date'),
      supabase.from('payment_allocation').select('payment_id,amount_allocated'),
      supabase.from('purchase_order').select('po_id,po_number'),
      supabase.from('site').select('site_id, site_name, client:client_id(display_name)'),
    ]);
    const used = new Map<string, number>();
    (must(al) as { payment_id: string; amount_allocated: number }[]).forEach((a) => used.set(a.payment_id, (used.get(a.payment_id) ?? 0) + num(a.amount_allocated)));
    const poNo = new Map((must(po) as { po_id: string; po_number: string }[]).map((p) => [p.po_id, p.po_number]));
    const siteMap = new Map(((must(st) as unknown as { site_id: string; site_name: string; client: { display_name: string } | null }[])).map((s) => [s.site_id, s]));
    const rows: Cell[][] = (must(pay) as Record<string, unknown>[]).map((p, i) => {
      const s = siteMap.get(String(p.site_id)); const u = used.get(String(p.payment_id)) ?? 0;
      return [i + 1, formatDate(String(p.payment_date)), s?.client?.display_name ?? '', s?.site_name ?? '', p.po_id ? poNo.get(String(p.po_id)) ?? '' : '', String(p.payment_type).replace(/_/g, ' '),
        String(p.payment_mode).replace(/_/g, ' '), String(p.utr_or_reference ?? ''), String(p.remarks ?? ''), num(p.amount_received), u, num(p.amount_received) - u];
    });
    rows.push(['', 'TOTAL', '', '', '', '', '', '', '', sum(rows, 9), sum(rows, 10), sum(rows, 11)]);
    downloadWorkbook('Studio5 - Payments register', [{ name: 'Payments', widths: [6, 13, 24, 32, 30, 18, 14, 20, 46, 18, 18, 18],
      rows: [...HEAD('Money received in bank - all payments'), ['S.N.', 'Date', 'Client', 'Site', 'For PO', 'Type', 'Mode', 'Reference', 'Note', 'Amount received', 'Used on invoices', 'Not yet matched'], ...rows] }]);
  });

  // ---- 6. Data health ---------------------------------------------------------------------
  const health = () => run('health', async () => {
    const d = must(await supabase.from('v_data_health').select('*')) as Record<string, unknown>[];
    const rows: Cell[][] = d.map((r, i) => [i + 1, r.severity === 'fix' ? 'Fix first' : 'Worth completing', String(r.site_name), String(r.area), String(r.message), String(r.detail), r.amount === null ? '' : num(r.amount), String(r.hint)]);
    downloadWorkbook('Studio5 - Data health', [{ name: 'Data health', widths: [6, 16, 30, 18, 52, 44, 16, 60],
      rows: [...HEAD('Records that are missing, unclear or wrong'), ['S.N.', 'Priority', 'Site', 'Area', 'Problem', 'Details', 'Amount', 'How to fix'], ...rows] }]);
  });

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<FileSpreadsheet size={24} className="text-[#E8C872]" />}
        title="Reports & Excel"
        subtitle="The sheets you used to make by hand, made in one click from the live data. Every figure comes from the POs, invoices, payments and deductions in the tracker, so it is always up to date."
      />
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-5 px-8 py-8 md:grid-cols-2 xl:grid-cols-3">
        <Card icon={<Building2 size={20} />} color="#1F3A52" title="All sites summary" done={done === 'sites'}
          text="One line per site: PO value, billed, received, waiting for payment, held back, and work progress. The sheet for the boss."
          action={<PrimaryButton onClick={allSites} disabled={!!busy}><Download size={14} /> {busy === 'sites' ? 'Preparing…' : 'Download Excel'}</PrimaryButton>} />

        <Card icon={<ScrollText size={20} />} color="#2F6E8E" title="PO-wise account statement (all sites)" done={done === 'po'}
          text="Every purchase order with its value, what is billed, received, tax deducted and the balance still to receive. Same layout as your Account Statement sheets."
          action={<PrimaryButton onClick={poStatement} disabled={!!busy}><Download size={14} /> {busy === 'po' ? 'Preparing…' : 'Download Excel'}</PrimaryButton>} />

        <Card icon={<Layers size={20} />} color="#B8860B" title="Tower / package payment details" done={done === 'tower'}
          text="Like your DSS 'Tower - B Payments Details' sheets: for a chosen site, each tower gets its own sheet (invoice, tax, payments, TDS, hold, balance) plus a summary sheet."
          action={
            <div className="flex w-full flex-col gap-3">
              <FieldSelect label="Site" value={siteId} onChange={setSiteId} options={sites.map((s) => ({ value: s.site_id, label: `${s.client} — ${s.site_name}` }))} />
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={towerSheets} disabled={!!busy || !siteId}><Download size={14} /> {busy === 'tower' ? 'Preparing…' : 'Download Excel'}</PrimaryButton>
                {siteId && <Link href={`/site/statement/?id=${siteId}`} className="inline-flex items-center rounded-lg border border-[#1F3A52]/30 px-4 py-2 font-sans text-xs font-semibold text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white">Open printable statement</Link>}
              </div>
            </div>
          } />

        <Card icon={<Clock size={20} />} color="#C0392B" title="Money waiting to be paid (with age)" done={done === 'age'}
          text="Every invoice the client still owes, oldest first, grouped as 0-30, 31-60, 61-90 and over 90 days. Use it to decide who to chase."
          action={<PrimaryButton onClick={ageing} disabled={!!busy}><Download size={14} /> {busy === 'age' ? 'Preparing…' : 'Download Excel'}</PrimaryButton>} />

        <Card icon={<Wallet size={20} />} color="#2F6B4F" title="Payments register" done={done === 'pay'}
          text="Every rupee received in the bank: date, client, site, which PO, how much is used on invoices and how much is not yet matched."
          action={<PrimaryButton onClick={payments} disabled={!!busy}><Download size={14} /> {busy === 'pay' ? 'Preparing…' : 'Download Excel'}</PrimaryButton>} />

        <Card icon={<ShieldCheck size={20} />} color="#6B7B8C" title="Data health checklist" done={done === 'health'}
          text="The list of missing files, unmatched payments and placeholder dates, with how to fix each. Share it with whoever enters the data."
          action={<PrimaryButton onClick={health} disabled={!!busy}><Download size={14} /> {busy === 'health' ? 'Preparing…' : 'Download Excel'}</PrimaryButton>} />
      </div>

      <p className="px-8 font-sans text-xs text-slate-400">Each download is a normal Excel file with real numbers, so you can add, filter and format it. For a single site&apos;s printable statement, open the site and press &quot;Account statement&quot;.</p>
    </div>
  );
}

function Card({ icon, color, title, text, action, done }: { icon: React.ReactNode; color: string; title: string; text: string; action: React.ReactNode; done?: boolean }) {
  return (
    <div className="card rise flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}>{icon}</span>
        <div>
          <h3 className="font-sans text-[15px] font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 font-sans text-sm leading-relaxed text-slate-500">{text}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-1 items-end">{action}</div>
      {done && <div className="mt-3 font-sans text-xs font-medium text-[#2F6B4F]">✓ Downloaded. Check your Downloads folder.</div>}
    </div>
  );
}
