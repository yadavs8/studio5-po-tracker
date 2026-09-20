'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { documentUrl } from '@/lib/documents';
import { formatINR, formatCompact, formatDate, formatPct } from '@/lib/format';
import { FileText, Receipt, Wallet, Hourglass, Clock, ShieldCheck, FileSpreadsheet, ArrowLeft, Building2 } from 'lucide-react';
import { PageHeader, ErrorBanner, EmptyState, Panel, DataTable, Td, StatusBadge, StatTile, buttonClass, buttonClassOnDark } from '@/lib/ui';
import { WORDS, HELP } from '@/lib/plain';
import type { SiteDashboardRow } from '@/lib/types';

interface PoRow {
  po_id: string; po_number: string; po_date: string; scope_description: string | null; sub_project_id: string | null;
  document_id: string | null; po_value: number; pi_count: number; pi_total: number; invoice_count: number;
  invoiced: number; received_bank: number; tds_and_other_deductions: number; retention_pending: number;
  yet_to_invoice: number; invoice_outstanding: number; balance_against_po: number;
}
interface PiRow { pi_id: string; po_id: string | null; pi_number: string; pi_date: string; amount: number; status: string; remarks: string | null; document_id: string | null; }
interface InvRow { invoice_id: string; po_id: string | null; invoice_number: string; invoice_date: string; gross_invoice_value: number; document_id: string | null; sub_project_id: string | null; }
interface SettleRow { invoice_id: string; total_payments_allocated: number; total_deducted: number; remaining_balance: number; computed_status: string; }
interface PayRow { payment_id: string; po_id: string | null; payment_date: string; amount_received: number; payment_type: string; payment_mode: string; utr_or_reference: string | null; remarks: string | null; document_id: string | null; }
interface AllocRow { payment_id: string; invoice_id: string | null; amount_allocated: number; }
interface ProgRow { progress_id: string; sub_project_id: string | null; progress_pct: number; reported_date: string; note: string | null; }
interface SubRow { sub_project_id: string; name: string; }

export default function SitePage() {
  const { id } = useParams<{ id: string }>();
  const [site, setSite] = useState<{ site_name: string; client: string } | null>(null);
  const [dash, setDash] = useState<SiteDashboardRow | null>(null);
  const [pos, setPos] = useState<PoRow[]>([]);
  const [pis, setPis] = useState<PiRow[]>([]);
  const [invs, setInvs] = useState<InvRow[]>([]);
  const [settle, setSettle] = useState<Record<string, SettleRow>>({});
  const [pays, setPays] = useState<PayRow[]>([]);
  const [allocs, setAllocs] = useState<AllocRow[]>([]);
  const [prog, setProg] = useState<ProgRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const q = await Promise.all([
        supabase.from('site').select('site_name, client:client_id(display_name)').eq('site_id', id).single(),
        supabase.from('v_site_dashboard').select('*').eq('site_id', id).maybeSingle(),
        supabase.from('v_po_summary').select('*').eq('site_id', id).order('po_date'),
        supabase.from('proforma_invoice').select('*').eq('site_id', id).order('pi_date'),
        supabase.from('tax_invoice').select('invoice_id,po_id,invoice_number,invoice_date,gross_invoice_value,document_id,sub_project_id').eq('site_id', id).order('invoice_date'),
        supabase.from('v_invoice_settlement').select('*').eq('site_id', id),
        supabase.from('payment').select('*').eq('site_id', id).order('payment_date'),
        supabase.from('physical_progress_log').select('*').eq('site_id', id).order('reported_date', { ascending: false }),
        supabase.from('sub_project').select('sub_project_id,name').eq('site_id', id),
      ]);
      const failed = q.find((r) => r.error);
      if (failed?.error) { setError(failed.error.message); setLoading(false); return; }
      const s = q[0].data as unknown as { site_name: string; client: { display_name: string } | null };
      setSite({ site_name: s.site_name, client: s.client?.display_name ?? '' });
      setDash((q[1].data as SiteDashboardRow) ?? null);
      setPos((q[2].data ?? []) as PoRow[]);
      setPis((q[3].data ?? []) as PiRow[]);
      setInvs((q[4].data ?? []) as InvRow[]);
      setSettle(Object.fromEntries(((q[5].data ?? []) as SettleRow[]).map((r) => [r.invoice_id, r])));
      const payRows = (q[6].data ?? []) as PayRow[];
      setPays(payRows);
      setProg((q[7].data ?? []) as ProgRow[]);
      setSubs((q[8].data ?? []) as SubRow[]);
      if (payRows.length) {
        const { data: a, error: ae } = await supabase.from('payment_allocation').select('payment_id,invoice_id,amount_allocated').in('payment_id', payRows.map((p) => p.payment_id));
        if (ae) setError(ae.message); else setAllocs((a ?? []) as AllocRow[]);
      }
      setLoading(false);
    })();
  }, [id]);

  const invPo = useMemo(() => Object.fromEntries(invs.map((i) => [i.invoice_id, i.po_id])), [invs]);
  const totalReceived = pays.reduce((s, p) => s + Number(p.amount_received), 0);
  const sumPo = (k: keyof PoRow) => pos.reduce((s, p) => s + Number(p[k] ?? 0), 0);

  // receipts belonging to a PO: tagged to it, or allocated to one of its invoices
  function receiptsFor(poId: string | null) {
    return pays
      .map((p) => {
        const toPo = allocs.filter((a) => a.payment_id === p.payment_id && invPo[a.invoice_id ?? ''] === poId && a.invoice_id);
        const applied = toPo.reduce((s, a) => s + Number(a.amount_allocated), 0);
        const belongs = poId === null
          ? p.po_id === null && !allocs.some((a) => a.payment_id === p.payment_id && a.invoice_id && invPo[a.invoice_id])
          : p.po_id === poId || applied > 0;
        return { p, applied, belongs };
      })
      .filter((r) => r.belongs);
  }

  const siteProgress = dash?.physical_progress_pct ?? null;

  return (
    <div className="min-h-screen bg-[#F3F5F8]">
      <PageHeader
        icon={<Building2 size={24} className="text-[#E8C872]" />}
        actions={<Link href={`/sites/${id}/statement`} className={buttonClassOnDark}><FileSpreadsheet size={14} /> Account statement (print / Excel)</Link>}
        title={site?.site_name ?? 'Site'}
        subtitle={site ? `${site.client} — every PO for this site, with its proforma invoices, tax invoices, money received and what is left.` : ''}
      />
      {error && <ErrorBanner message={error} />}
      <div className="px-8 py-6 space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 font-sans text-xs font-medium text-[#1F3A52] hover:underline"><ArrowLeft size={14} /> All sites</Link>

        {loading ? <EmptyState text="Loading…" /> : (
          <>
            {/* SITE TOTALS */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              <StatTile icon={<FileText size={18} />} label={WORDS.poValue} help={HELP.poValue} amount={sumPo('po_value')} color="#1F3A52" />
              <StatTile icon={<Receipt size={18} />} label={WORDS.billed} help={HELP.billed} amount={dash?.total_invoiced ?? 0} color="#1F3A52" />
              <StatTile icon={<Wallet size={18} />} label={WORDS.received} help={HELP.received} amount={totalReceived} color="#2F6B4F" />
              <StatTile icon={<Hourglass size={18} />} label={WORDS.stillToReceive} help={HELP.stillToReceive} amount={sumPo('balance_against_po')} color="#A13D2B" note="whether billed yet or not" />
              <StatTile icon={<Clock size={18} />} label={WORDS.billedUnpaid} help={HELP.billedUnpaid} amount={dash?.normal_outstanding ?? 0} color="#A13D2B" note="the client owes this today" />
              <StatTile icon={<ShieldCheck size={18} />} label={WORDS.held} help={HELP.held} amount={dash?.retention_outstanding ?? 0} color="#B8860B" note="not overdue - kept separate" />
            </div>

            {/* WORK PROGRESS */}
            <Panel title="How far along is the work?">
              <div className="grid grid-cols-1 gap-6 px-6 py-4 md:grid-cols-2">
                <div>
                  <Bar label="Work done on site" pct={siteProgress} color="#B8860B" />
                  <div className="h-2" />
                  <Bar label="Billed so far (of the PO)" pct={dash?.billing_progress_pct ?? null} color="#1F3A52" />
                  <p className="mt-2 font-sans text-xs text-[#1C1C1A]/50">Two different things: how much work is finished, and how much has been billed. If work is far ahead of billing, you may be able to raise another invoice.</p>
                </div>
                <div className="font-sans text-sm">
                  {prog.length === 0 ? <span className="text-[#1C1C1A]/40">No physical progress logged. Add it under Master Data → select the site.</span> : (
                    <table className="w-full"><tbody>
                      {prog.slice(0, 6).map((r) => (
                        <tr key={r.progress_id}>
                          <td className="py-1 font-mono text-xs text-[#1C1C1A]/60">{formatDate(r.reported_date)}</td>
                          <td className="px-3">{r.sub_project_id ? subs.find((s) => s.sub_project_id === r.sub_project_id)?.name : 'Whole site'}</td>
                          <td className="text-right font-mono">{formatPct(Number(r.progress_pct))}</td>
                          <td className="pl-3 text-[#1C1C1A]/50">{r.note ?? ''}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  )}
                </div>
              </div>
            </Panel>

            {/* ONE BLOCK PER PO */}
            {pos.length === 0 && <EmptyState text="No purchase orders recorded for this site yet. Add one under PO & PI." />}
            {pos.map((po) => (
              <Panel
                key={po.po_id}
                title={`PO ${po.po_number}${po.scope_description ? ' — ' + po.scope_description : ''}  ·  ${formatDate(po.po_date)}`}
                action={<DocLink id={po.document_id} label="PO document" />}
              >
                <PoSummary po={po} />
                <Detail
                  pis={pis.filter((p) => p.po_id === po.po_id)}
                  invs={invs.filter((i) => i.po_id === po.po_id)}
                  settle={settle}
                  receipts={receiptsFor(po.po_id)}
                />
              </Panel>
            ))}

            {/* NOT LINKED TO A PO */}
            {(() => {
              const uPis = pis.filter((p) => !p.po_id);
              const uInvs = invs.filter((i) => !i.po_id);
              const uRec = receiptsFor(null);
              if (!uPis.length && !uInvs.length && !uRec.length) return null;
              return (
                <Panel title="Not linked to a PO">
                  <div className="border-b border-[#1C1C1A]/10 px-6 py-2 font-sans text-xs text-[#1C1C1A]/50">
                    These have no PO recorded (for example Lemon Tree ledger entries, or invoices whose PO has not been entered). Link them by adding the PO under PO &amp; PI.
                  </div>
                  <Detail pis={uPis} invs={uInvs} settle={settle} receipts={uRec} />
                </Panel>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ pis, invs, settle, receipts }: {
  pis: PiRow[]; invs: InvRow[]; settle: Record<string, SettleRow>;
  receipts: { p: PayRow; applied: number }[];
}) {
  return (
    <div className="divide-y divide-[#1C1C1A]/10">
      <Section title={`Proforma invoices - quotes sent for approval (${pis.length})`}>
        {pis.length === 0 ? <Empty t="No PI recorded." /> : (
          <DataTable columns={[{ label: 'PI no.' }, { label: 'Date' }, { label: 'Amount', align: 'right' }, { label: 'Status' }, { label: 'Note' }, { label: 'Doc' }]}>
            {pis.map((p) => (
              <tr key={p.pi_id}>
                <Td>{p.pi_number}</Td><Td mono>{formatDate(p.pi_date)}</Td><Td align="right" mono>{formatINR(p.amount)}</Td>
                <Td><StatusBadge status={p.status} /></Td><Td>{p.remarks ?? ''}</Td><Td><DocLink id={p.document_id} /></Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      <Section title={`Tax invoices raised (${invs.length})`}>
        {invs.length === 0 ? <Empty t="No tax invoice raised yet." /> : (
          <DataTable columns={[{ label: 'Invoice no.' }, { label: 'Date' }, { label: 'Amount', align: 'right' }, { label: 'Paid so far', align: 'right' }, { label: 'Tax deducted / held', align: 'right' }, { label: 'Still to pay', align: 'right' }, { label: 'Status' }, { label: 'Doc' }]}>
            {invs.map((i) => {
              const s = settle[i.invoice_id];
              return (
                <tr key={i.invoice_id}>
                  <Td>{i.invoice_number}</Td><Td mono>{formatDate(i.invoice_date)}</Td><Td align="right" mono>{formatINR(i.gross_invoice_value)}</Td>
                  <Td align="right" mono>{formatINR(s?.total_payments_allocated ?? 0)}</Td>
                  <Td align="right" mono>{formatINR(s?.total_deducted ?? 0)}</Td>
                  <Td align="right" mono><span style={{ color: (s?.remaining_balance ?? 0) > 0 ? '#A13D2B' : undefined }}>{formatINR(s?.remaining_balance ?? i.gross_invoice_value)}</span></Td>
                  <Td><StatusBadge status={s?.computed_status ?? 'issued'} /></Td><Td><DocLink id={i.document_id} /></Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Section>
      <Section title={`Money received in bank (${receipts.length})`}>
        {receipts.length === 0 ? <Empty t="No receipt recorded." /> : (
          <DataTable columns={[{ label: 'Date' }, { label: 'Type' }, { label: 'Ref / note' }, { label: 'Amount received', align: 'right' }, { label: 'Used on invoices here', align: 'right' }, { label: 'Doc' }]}>
            {receipts.map(({ p, applied }) => (
              <tr key={p.payment_id}>
                <Td mono>{formatDate(p.payment_date)}</Td><Td>{p.payment_type.replace(/_/g, ' ')}</Td>
                <Td>{[p.utr_or_reference, p.remarks].filter(Boolean).join(' — ')}</Td>
                <Td align="right" mono>{formatINR(p.amount_received)}</Td><Td align="right" mono>{formatINR(applied)}</Td><Td><DocLink id={p.document_id} /></Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-[#1C1C1A]/[0.02] px-6 py-2 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#1C1C1A]/50">{title}</div>
      {children}
    </div>
  );
}
function Empty({ t }: { t: string }) { return <div className="px-6 py-3 font-sans text-sm text-[#1C1C1A]/40">{t}</div>; }

function Cell({ label, v, color, strong }: { label: string; v: string; color?: string; strong?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[#1C1C1A]/45">{label}</div>
      <div className={`mt-1 font-mono text-sm tabular-nums ${strong ? 'font-semibold' : ''}`} style={{ color: color ?? '#1C1C1A' }}>{v}</div>
    </div>
  );
}
function Bar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex justify-between font-sans text-xs text-[#1C1C1A]/60"><span>{label}</span><span className="font-mono">{formatPct(pct)}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} /></div>
    </div>
  );
}
function DocLink({ id, label = 'View' }: { id: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  if (!id) return <span className="font-sans text-xs text-[#1C1C1A]/30">no file</span>;
  return (
    <button
      disabled={busy}
      onClick={async () => { setBusy(true); const u = await documentUrl(id); setBusy(false); if (u) window.open(u, '_blank'); }}
      className="font-sans text-xs text-[#1F3A52] underline disabled:opacity-50"
    >
      {busy ? 'Opening…' : label}
    </button>
  );
}

function PoSummary({ po }: { po: PoRow }) {
  const rcv = Number(po.received_bank), tds = Number(po.tds_and_other_deductions), val = Number(po.po_value);
  const still = Number(po.balance_against_po), billedUnpaid = Number(po.invoice_outstanding), held = Number(po.retention_pending);
  const notBilled = still - billedUnpaid - held; // after adjusting any advance already in hand
  const pct = (n: number) => (val > 0 ? Math.max(0, Math.min(100, (n / val) * 100)) : 0);
  const paidPct = val > 0 ? Math.round((rcv / val) * 100) : 0;

  const parts: string[] = [];
  if (notBilled > 0.5) parts.push(`${formatINR(notBilled)} is work not billed yet`);
  if (billedUnpaid > 0.5) parts.push(`${formatINR(billedUnpaid)} is billed and waiting for the client to pay`);
  if (held > 0.5) parts.push(`${formatINR(held)} is held back by the client until handover`);

  let status: { text: string; color: string };
  if (still <= 0.5) status = { text: 'Fully paid', color: '#2F6B4F' };
  else if (billedUnpaid > 0.5) status = { text: 'Client owes you for billed work', color: '#A13D2B' };
  else if (held > 0.5 && notBilled <= 0.5) status = { text: 'Only the held-back amount is left', color: '#B8860B' };
  else status = { text: 'More billing still to come', color: '#1F3A52' };

  return (
    <div className="border-b border-[#1C1C1A]/10 px-6 py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-block border px-2 py-0.5 font-sans text-xs font-medium" style={{ color: status.color, borderColor: `${status.color}55`, backgroundColor: `${status.color}0D` }}>
          {status.text}
        </span>
        <span className="font-mono text-xs text-[#1C1C1A]/50">{po.invoice_count} tax invoice(s) · {po.pi_count} proforma(s)</span>
      </div>

      <div className="flex h-4 w-full overflow-hidden bg-[#1C1C1A]/10" role="img" aria-label="How the PO value is split">
        <div style={{ width: `${pct(rcv)}%`, backgroundColor: '#2F6B4F' }} title={`Received ${formatINR(rcv)}`} />
        <div style={{ width: `${pct(tds)}%`, backgroundColor: '#6B7B8C' }} title={`Tax deducted ${formatINR(tds)}`} />
        <div style={{ width: `${pct(held)}%`, backgroundColor: '#B8860B' }} title={`Held back ${formatINR(held)}`} />
        <div style={{ width: `${pct(billedUnpaid)}%`, backgroundColor: '#A13D2B' }} title={`Billed, waiting ${formatINR(billedUnpaid)}`} />
        <div style={{ width: `${pct(Math.max(notBilled, 0))}%`, backgroundColor: '#C9D3DC' }} title={`Not billed yet ${formatINR(notBilled)}`} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-sans text-xs text-[#1C1C1A]/70">
        <Key c="#2F6B4F" t={`${WORDS.received}: ${formatINR(rcv)}`} />
        <Key c="#6B7B8C" t={`${WORDS.taxDeducted}: ${formatINR(tds)}`} />
        <Key c="#B8860B" t={`${WORDS.held}: ${formatINR(held)}`} />
        <Key c="#A13D2B" t={`${WORDS.billedUnpaid}: ${formatINR(billedUnpaid)}`} />
        <Key c="#C9D3DC" t={`${WORDS.notBilled}: ${formatINR(Math.max(notBilled, 0))}`} />
      </div>

      <p className="mt-4 font-sans text-sm leading-relaxed text-[#1C1C1A]">
        Of the <b className="font-mono">{formatINR(val)}</b> PO, <b className="font-mono">{formatINR(rcv)}</b> ({paidPct}%) has reached your bank
        {tds > 0.5 ? <> and <b className="font-mono">{formatINR(tds)}</b> was deducted as tax by the client</> : null}.
        {still > 0.5
          ? <> <b className="font-mono">{formatINR(still)}</b> is still to come{parts.length ? ': ' + parts.join('; ') : ''}.</>
          : <> Nothing is left to receive.</>}
      </p>
    </div>
  );
}
function Key({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: c }} />{t}</span>;
}
