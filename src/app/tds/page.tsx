'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Receipt, FileWarning, FileCheck2, Download, Percent } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { formatINR, formatDate } from '@/lib/format';
import { downloadWorkbook, num, today, type Cell } from '@/lib/exportXlsx';
import { PageHeader, ErrorBanner, EmptyState, Panel, DataTable, Td, StatTile, StatusBadge, PrimaryButton, FieldSelect } from '@/lib/ui';

interface Row {
  deduction_id: string; deduction_type: 'tds' | 'gst_tds'; tax_kind: string;
  client_id: string; client_name: string; site_name: string;
  invoice_number: string; invoice_date: string; taxable_value: number;
  deduction_date: string; amount: number; rate_pct: number | null; fy_start: number;
  certificate_reference: string | null; certificate_received_on: string | null; credit_claimed_on: string | null;
  credit_state: 'awaiting_certificate' | 'certificate_received' | 'claimed';
}
interface Draft { ref: string; cert: string; claimed: string }

const fyLabel = (y: number) => `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const STATE_LABEL: Record<Row['credit_state'], string> = { awaiting_certificate: 'Certificate awaited', certificate_received: 'Certificate received', claimed: 'Credit claimed' };
const STATE_STATUS: Record<Row['credit_state'], string> = { awaiting_certificate: 'pending', certificate_received: 'sent', claimed: 'completed' };

export default function TdsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [fy, setFy] = useState('');
  const [kind, setKind] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('v_tds_credit').select('*').order('deduction_date', { ascending: false });
    if (error) { setError(friendlyError(error)); setLoading(false); return; }
    const list = (data ?? []) as Row[];
    setRows(list);
    setDrafts(Object.fromEntries(list.map((r) => [r.deduction_id, { ref: r.certificate_reference ?? '', cert: r.certificate_received_on ?? '', claimed: r.credit_claimed_on ?? '' }])));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.fy_start))).sort((a, b) => b - a), [rows]);
  const shown = rows.filter((r) => (!fy || String(r.fy_start) === fy) && (!kind || r.deduction_type === kind));
  const sum = (f: (r: Row) => boolean) => shown.filter(f).reduce((s, r) => s + num(r.amount), 0);

  const total = sum(() => true);
  const awaiting = sum((r) => r.credit_state === 'awaiting_certificate');
  const received = sum((r) => r.credit_state === 'certificate_received');
  const claimed = sum((r) => r.credit_state === 'claimed');

  // summary: client x FY x kind
  const summary = useMemo(() => {
    const m = new Map<string, { client: string; fy: number; kind: string; total: number; awaiting: number; received: number; claimed: number }>();
    shown.forEach((r) => {
      const k = `${r.client_id}|${r.fy_start}|${r.deduction_type}`;
      const e = m.get(k) ?? { client: r.client_name, fy: r.fy_start, kind: r.tax_kind, total: 0, awaiting: 0, received: 0, claimed: 0 };
      e.total += num(r.amount);
      if (r.credit_state === 'awaiting_certificate') e.awaiting += num(r.amount);
      else if (r.credit_state === 'certificate_received') e.received += num(r.amount);
      else e.claimed += num(r.amount);
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => b.fy - a.fy || a.client.localeCompare(b.client));
  }, [shown]);

  const dirty = (r: Row) => {
    const d = drafts[r.deduction_id];
    return d && (d.ref !== (r.certificate_reference ?? '') || d.cert !== (r.certificate_received_on ?? '') || d.claimed !== (r.credit_claimed_on ?? ''));
  };
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  async function save(r: Row) {
    const d = drafts[r.deduction_id];
    setRowError((e) => ({ ...e, [r.deduction_id]: '' }));
    if (d.claimed && !d.cert) { setRowError((e) => ({ ...e, [r.deduction_id]: 'Record the date the certificate was received before marking the credit as claimed.' })); return; }
    if (d.cert && d.cert < r.deduction_date.slice(0, 10)) { setRowError((e) => ({ ...e, [r.deduction_id]: 'The certificate date cannot be before the tax was deducted.' })); return; }
    setSaving(r.deduction_id);
    const { error } = await supabase.from('deduction').update({
      certificate_reference: d.ref.trim() || null,
      certificate_received_on: d.cert || null,
      credit_claimed_on: d.claimed || null,
    }).eq('deduction_id', r.deduction_id);
    setSaving(null);
    if (error) { setRowError((e) => ({ ...e, [r.deduction_id]: friendlyError(error) })); return; }
    load();
  }

  function exportExcel() {
    const head: Cell[][] = [['STUDIO5 INTERIORS PVT LTD'], ['Tax deducted by clients (TDS credits)'], [`As on ${today()}`], []];
    const detail: Cell[][] = shown.map((r, i) => [i + 1, fyLabel(r.fy_start), r.tax_kind, r.client_name, r.site_name, r.invoice_number, formatDate(r.invoice_date), num(r.taxable_value),
      r.rate_pct === null ? '' : num(r.rate_pct), num(r.amount), r.certificate_reference ?? '', r.certificate_received_on ? formatDate(r.certificate_received_on) : '',
      r.credit_claimed_on ? formatDate(r.credit_claimed_on) : '', STATE_LABEL[r.credit_state]]);
    detail.push(['', '', '', '', '', '', '', '', '', detail.reduce((s, r) => s + num(r[9]), 0), '', '', '', '']);
    const sm: Cell[][] = summary.map((s) => [fyLabel(s.fy), s.kind, s.client, s.total, s.awaiting, s.received, s.claimed]);
    downloadWorkbook('Studio5 - TDS credits', [
      { name: 'Summary', widths: [12, 30, 30, 16, 20, 20, 16], rows: [...head, ['Financial year', 'Type', 'Client', 'Tax deducted', 'Certificate awaited', 'Certificate received', 'Credit claimed'], ...sm] },
      { name: 'Detail', widths: [6, 12, 28, 26, 32, 20, 13, 16, 8, 16, 22, 16, 16, 20],
        rows: [...head, ['S.N.', 'Financial year', 'Type', 'Client', 'Site', 'Invoice', 'Invoice date', 'Taxable value', 'Rate %', 'Tax deducted', 'Certificate no.', 'Certificate received', 'Credit claimed', 'Status'], ...detail] },
    ]);
  }

  const inp = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-sans text-xs outline-none focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15';

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<Percent size={24} className="text-[#E8C872]" />}
        title="Tax credits (TDS)"
        subtitle="When a client pays you they deduct a small tax (TDS) and deposit it with the tax department for you. You never receive that money in the bank, but you get a tax credit for it. This page tracks every credit until it is claimed."
        actions={<PrimaryButton onClick={exportExcel} disabled={loading || rows.length === 0} className="!bg-white/10 !text-white ring-1 ring-white/30 hover:!bg-white hover:!text-[#1F3A52]"><Download size={14} /> Excel for your CA</PrimaryButton>}
      />
      {error && <ErrorBanner message={error} />}

      <div className="space-y-8 px-8 py-8">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatTile icon={<Receipt size={18} />} label="Tax deducted by clients" amount={total} color="#6B7B8C" note="all of it is a tax credit, not cash" />
          <StatTile icon={<FileWarning size={18} />} label="Certificate awaited" amount={awaiting} color="#B8860B" note="ask the client for the certificate" />
          <StatTile icon={<FileCheck2 size={18} />} label="Certificate received" amount={received} color="#2F6E8E" note="check it shows in Form 26AS, then claim" />
          <StatTile icon={<BadgeCheck size={18} />} label="Credit claimed" amount={claimed} color="#2F6B4F" note="done" />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48"><FieldSelect label="Financial year" value={fy} onChange={setFy} options={years.map((y) => ({ value: String(y), label: fyLabel(y) }))} /></div>
          <div className="w-64"><FieldSelect label="Type of tax" value={kind} onChange={setKind} options={[{ value: 'tds', label: 'Income-tax TDS (Form 26AS)' }, { value: 'gst_tds', label: 'GST-TDS (GST portal)' }]} /></div>
          {(fy || kind) && <button onClick={() => { setFy(''); setKind(''); }} className="pb-2 font-sans text-xs text-[#1F3A52] underline">Clear filters</button>}
        </div>

        {loading ? <EmptyState text="Loading…" /> : rows.length === 0 ? (
          <EmptyState text="No tax deducted has been recorded yet. Add it on the Tax invoices page (Deductions) when a client deducts TDS." />
        ) : (
          <>
            <Panel title="Summary by client and year">
              <DataTable columns={[{ label: 'Year' }, { label: 'Type' }, { label: 'Client' }, { label: 'Tax deducted', align: 'right' }, { label: 'Certificate awaited', align: 'right' }, { label: 'Certificate received', align: 'right' }, { label: 'Credit claimed', align: 'right' }]}>
                {summary.map((s, i) => (
                  <tr key={i}>
                    <Td>{fyLabel(s.fy)}</Td><Td>{s.kind}</Td><Td>{s.client}</Td>
                    <Td align="right" mono>{formatINR(s.total)}</Td>
                    <Td align="right" mono><span style={{ color: s.awaiting > 0 ? '#B8860B' : undefined }}>{formatINR(s.awaiting)}</span></Td>
                    <Td align="right" mono>{formatINR(s.received)}</Td>
                    <Td align="right" mono><span style={{ color: s.claimed > 0 ? '#2F6B4F' : undefined }}>{formatINR(s.claimed)}</span></Td>
                  </tr>
                ))}
              </DataTable>
            </Panel>

            <Panel title={`Every tax deduction (${shown.length})`}>
              <DataTable columns={[{ label: 'Deducted on' }, { label: 'Client / site' }, { label: 'Invoice' }, { label: 'Rate', align: 'right' }, { label: 'Tax deducted', align: 'right' },
                { label: 'Certificate no.' }, { label: 'Certificate received' }, { label: 'Credit claimed' }, { label: 'Status' }, { label: '' }]}>
                {shown.map((r) => {
                  const d = drafts[r.deduction_id] ?? { ref: '', cert: '', claimed: '' };
                  const oddRate = r.rate_pct !== null && ![1, 2].includes(Math.round(Number(r.rate_pct) * 100) / 100);
                  return (
                    <tr key={r.deduction_id}>
                      <Td mono>{formatDate(r.deduction_date)}</Td>
                      <Td><div className="font-medium text-slate-800">{r.client_name}</div><div className="text-xs text-slate-400">{r.site_name}</div></Td>
                      <Td>{r.invoice_number}<div className="font-mono text-xs text-slate-400">{formatINR(r.taxable_value)} taxable</div></Td>
                      <Td align="right" mono><span title={oddRate ? 'Unusual rate — please check with your CA' : ''} style={{ color: oddRate ? '#B8860B' : undefined }}>{r.rate_pct === null ? '—' : `${r.rate_pct}%`}{oddRate ? ' ⚠' : ''}</span></Td>
                      <Td align="right" mono>{formatINR(r.amount)}</Td>
                      <Td><input className={inp} value={d.ref} onChange={(e) => setDraft(r.deduction_id, { ref: e.target.value })} placeholder="certificate no." /></Td>
                      <Td><input type="date" className={inp} value={d.cert} onChange={(e) => setDraft(r.deduction_id, { cert: e.target.value })} /></Td>
                      <Td><input type="date" className={inp} value={d.claimed} onChange={(e) => setDraft(r.deduction_id, { claimed: e.target.value })} /></Td>
                      <Td><StatusBadge status={STATE_STATUS[r.credit_state]} /><div className="mt-1 text-[11px] text-slate-400">{STATE_LABEL[r.credit_state]}</div></Td>
                      <Td>
                        {dirty(r) && <button onClick={() => save(r)} disabled={saving === r.deduction_id} className="rounded-md bg-[#1F3A52] px-3 py-1 font-sans text-xs font-semibold text-white hover:bg-[#2A4D6B] disabled:opacity-50">{saving === r.deduction_id ? 'Saving…' : 'Save'}</button>}
                        {rowError[r.deduction_id] && <div className="mt-1 max-w-[200px] text-xs text-[#A13D2B]">{rowError[r.deduction_id]}</div>}
                      </Td>
                    </tr>
                  );
                })}
              </DataTable>
            </Panel>
            <p className="font-sans text-xs text-slate-400">The &quot;deducted on&quot; date for entries loaded from your old sheets is the invoice date, because the sheets did not record when the tax was deducted. Correct it in the invoice&apos;s deductions if you know the real date. Rates shown are worked out from the amounts (tax ÷ taxable value); please confirm the applicable rates with your CA.</p>
          </>
        )}
      </div>
    </div>
  );
}
