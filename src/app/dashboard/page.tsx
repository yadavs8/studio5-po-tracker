'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, FileText, Receipt, Wallet, Clock, ShieldCheck, PiggyBank, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SiteDashboardRow } from '@/lib/types';
import { formatINR, formatCompact, formatPct, formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, DataTable, Td, StatTile, Panel, buttonClassOnDark } from '@/lib/ui';
import { loadBroughtForward, loadPeriodFigures, REPORTING_START_LABEL, type BroughtForward, type PeriodFigures } from '@/lib/period';

const C = { received: '#2F6B4F', tax: '#6B7B8C', held: '#B8860B', waiting: '#C0392B', navy: '#1F3A52', gold: '#E8C872' };

const NO_PERIOD: PeriodFigures = { poValue: 0, billed: 0, received: 0, paidOn: 0, tax: 0, held: 0, waiting: 0 };
const NO_BF: BroughtForward = { billed: 0, received: 0, tax: 0, held: 0, receivedSince: 0, balance: 0 };

// Billing figures (PO value, billed, received, the money bar) cover the
// reporting period from REPORTING_START; what was owed before it is one
// brought-forward figure. "Waiting", "held" and "advance" are today's
// balances from v_site_dashboard, so old money still owed is never dropped.
export default function DashboardPage() {
  const [rows, setRows] = useState<SiteDashboardRow[]>([]);
  const [period, setPeriod] = useState<Record<string, PeriodFigures>>({});
  const [bfs, setBfs] = useState<Record<string, BroughtForward>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [view, p, b] = await Promise.all([
          supabase.from('v_site_dashboard').select('*').order('normal_outstanding', { ascending: false }),
          loadPeriodFigures(),
          loadBroughtForward(),
        ]);
        if (view.error) throw new Error(view.error.message);
        setRows((view.data ?? []) as SiteDashboardRow[]);
        setPeriod(p);
        setBfs(b);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
    })();
  }, []);

  const pf = (id: string) => period[id] ?? NO_PERIOD;
  const bfOf = (id: string) => bfs[id] ?? NO_BF;
  const totals = rows.reduce(
    (acc, r) => {
      const p = pf(r.site_id);
      return {
        contract: acc.contract + p.poValue,
        invoiced: acc.invoiced + p.billed,
        collected: acc.collected + p.received,
        broughtForward: acc.broughtForward + bfOf(r.site_id).balance,
        outstanding: acc.outstanding + Number(r.normal_outstanding ?? 0),
        retention: acc.retention + Number(r.retention_outstanding ?? 0),
        advance: acc.advance + Number(r.advance_balance ?? 0),
        paidOn: acc.paidOn + p.paidOn, tax: acc.tax + p.tax, held: acc.held + p.held, waiting: acc.waiting + p.waiting,
      };
    },
    { contract: 0, invoiced: 0, collected: 0, broughtForward: 0, outstanding: 0, retention: 0, advance: 0, paidOn: 0, tax: 0, held: 0, waiting: 0 }
  );
  const since = `since ${REPORTING_START_LABEL}`;

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<LayoutDashboard size={24} className="text-[#E8C872]" />}
        title="All sites at a glance"
        subtitle="Every number is calculated from the POs, invoices, payments and deductions you enter. Click a site to see each PO with its proformas, tax invoices and money received."
        actions={<Link href="/reports" className={buttonClassOnDark}><FileSpreadsheet size={14} /> Reports &amp; Excel</Link>}
      />
      {error && <ErrorBanner message={error} />}

      <div className="space-y-8 px-8 py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
          <StatTile icon={<Clock size={18} />} label="Brought forward" note={`owed from before ${REPORTING_START_LABEL}`} amount={totals.broughtForward} color={C.navy} />
          <StatTile icon={<FileText size={18} />} label="PO value (with GST)" note={`POs ${since}`} amount={totals.contract} color="#1F3A52" />
          <StatTile icon={<Receipt size={18} />} label="Billed" note={since} amount={totals.invoiced} color="#2F6E8E" />
          <StatTile icon={<Wallet size={18} />} label="Money received in bank" note={since} amount={totals.collected} color={C.received} />
          <StatTile icon={<Clock size={18} />} label="Billed, waiting for payment" note="client owes this today (incl. brought forward)" amount={totals.outstanding} color={C.waiting} />
          <StatTile icon={<ShieldCheck size={18} />} label="Held back until handover" note="not overdue — kept separate" amount={totals.retention} color={C.held} />
          <StatTile icon={<PiggyBank size={18} />} label="Advance not yet used" amount={totals.advance} color={C.tax} />
        </div>

        {loading ? (
          <EmptyState text="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState text="No sites yet — add clients and sites under Clients & sites first." />
        ) : (
          <>
            <Panel title={`Where the money billed ${since} stands (all sites)`}>
              <div className="px-6 py-5">
                <MoneyBar
                  total={totals.invoiced}
                  segments={[
                    { label: 'Paid', v: totals.paidOn, c: C.received },
                    { label: 'Tax deducted by clients', v: totals.tax, c: C.tax },
                    { label: 'Held back until handover', v: totals.held, c: C.held },
                    { label: 'Waiting for payment', v: totals.waiting, c: C.waiting },
                  ]}
                  big
                />
              </div>
            </Panel>

            <section>
              <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-[#1F3A52]">
                <span className="h-5 w-1 rounded-full bg-[#E8C872]" /> Your sites
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((r, i) => <SiteCard key={r.site_id} r={r} p={pf(r.site_id)} bf={bfOf(r.site_id).balance} delay={i * 40} />)}
              </div>
            </section>

            <Panel title="All sites in detail">
              <DataTable
                columns={[
                  { label: 'Client' }, { label: 'Site' },
                  { label: 'Brought forward', align: 'right' },
                  { label: `PO value ${since}`, align: 'right' }, { label: `Billed ${since}`, align: 'right' }, { label: `Received ${since}`, align: 'right' },
                  { label: 'Waiting for payment today', align: 'right' }, { label: 'Held till handover', align: 'right' },
                  { label: 'Billed vs work done' },
                ]}
              >
                {rows.map((r) => (
                  <tr key={r.site_id}>
                    <Td>{r.client_name}</Td>
                    <Td><Link href={`/site/?id=${r.site_id}`} className="font-medium text-[#1F3A52] hover:underline">{r.site_name}</Link></Td>
                    <Td align="right" mono>{formatINR(bfOf(r.site_id).balance)}</Td>
                    <Td align="right" mono>{formatINR(pf(r.site_id).poValue)}</Td>
                    <Td align="right" mono>{formatINR(pf(r.site_id).billed)}</Td>
                    <Td align="right" mono>{formatINR(pf(r.site_id).received)}</Td>
                    <Td align="right" mono><span style={{ color: r.normal_outstanding > 0 ? C.waiting : undefined }}>{formatINR(r.normal_outstanding)}</span></Td>
                    <Td align="right" mono><span style={{ color: r.retention_outstanding > 0 ? C.held : undefined }}>{formatINR(r.retention_outstanding)}</span></Td>
                    <Td><ProgressPair billing={r.billing_progress_pct} physical={r.physical_progress_pct} physicalDate={r.physical_progress_date} /></Td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MoneyBar({ total, segments, big }: { total: number; segments: { label: string; v: number; c: string }[]; big?: boolean }) {
  const pct = (v: number) => (total > 0 ? Math.max(0, (v / total) * 100) : 0);
  return (
    <div>
      <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 ${big ? 'h-5' : 'h-2.5'}`}>
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${pct(s.v)}%`, backgroundColor: s.c }} title={`${s.label}: ${formatINR(s.v)}`} className="transition-all" />
        ))}
      </div>
      <div className={`flex flex-wrap gap-x-6 gap-y-2 ${big ? 'mt-4' : 'mt-2'}`}>
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 font-sans text-xs text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.c }} />
            <span>{s.label}</span>
            <span className="font-mono font-semibold text-slate-800">{formatCompact(s.v)}</span>
            <span className="font-mono text-slate-400">{total > 0 ? `${Math.round(pct(s.v))}%` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The bar shows the period's billing; "Waiting" and "Held back" are today's
// totals, so a site that only has brought-forward money owed still says so.
function SiteCard({ r, p, bf, delay }: { r: SiteDashboardRow; p: PeriodFigures; bf: number; delay: number }) {
  const inv = p.billed, out = Number(r.normal_outstanding), held = Number(r.retention_outstanding);
  const hasBilling = inv > 0;
  const status =
    out > 0.5 ? { t: 'Client owes money', c: C.waiting }
    : held > 0.5 ? { t: 'Only held-back left', c: C.held }
    : Number(r.advance_balance) > 0.5 ? { t: 'Advance received', c: C.navy }
    : hasBilling ? { t: 'All paid', c: C.received } : { t: 'Not billed yet', c: C.tax };
  return (
    <Link href={`/site/?id=${r.site_id}`} style={{ animationDelay: `${delay}ms` }} className="card rise group block p-5 transition-all hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-400">{r.client_name}</div>
          <div className="mt-0.5 font-serif text-lg font-semibold leading-snug text-[#1F3A52]">{r.site_name}</div>
        </div>
        <ArrowRight size={18} className="mt-1 flex-none text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-[#1F3A52]" />
      </div>

      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium" style={{ color: status.c, backgroundColor: `${status.c}14` }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.c }} />{status.t}
      </span>

      <div className="mt-4">
        {hasBilling ? (
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title={`Billed since ${REPORTING_START_LABEL}`}>
            <div style={{ width: `${(p.paidOn / inv) * 100}%`, backgroundColor: C.received }} />
            <div style={{ width: `${(p.tax / inv) * 100}%`, backgroundColor: C.tax }} />
            <div style={{ width: `${(p.held / inv) * 100}%`, backgroundColor: C.held }} />
            <div style={{ width: `${(p.waiting / inv) * 100}%`, backgroundColor: C.waiting }} />
          </div>
        ) : (
          <div className="h-2.5 w-full rounded-full bg-slate-100" />
        )}
      </div>

      {Math.abs(bf) > 0.5 && (
        <div className="mt-3 font-sans text-xs text-slate-500">Brought forward: <span className="font-mono font-semibold text-slate-700">{formatCompact(bf)}</span></div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Mini label="Received" v={p.received} c={C.received} />
        <Mini label="Waiting" v={out} c={C.waiting} />
        <Mini label="Held back" v={held} c={C.held} />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <ProgressPair billing={r.billing_progress_pct} physical={r.physical_progress_pct} physicalDate={r.physical_progress_date} />
      </div>
    </Link>
  );
}

function Mini({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div>
      <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums" style={{ color: v > 0.5 ? c : '#94A3B8' }}>{formatCompact(v)}</div>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 text-right font-mono text-xs tabular-nums text-slate-600">{formatPct(pct)}</span>
    </div>
  );
}

// Billing and physical progress are two different measures — shown side by side, never merged.
function ProgressPair({ billing, physical, physicalDate }: { billing: number | null; physical: number | null; physicalDate: string | null }) {
  return (
    <div className="min-w-[220px] space-y-1.5" title={physicalDate ? `Work progress as of ${formatDate(physicalDate)}` : 'No work progress logged'}>
      <Bar label="Billed" pct={billing} color="#2F6E8E" />
      <Bar label="Work done" pct={physical} color="#B8860B" />
    </div>
  );
}
