'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SiteDashboardRow } from '@/lib/types';
import { formatINR } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, StatTile, Panel, buttonClass } from '@/lib/ui';
import { loadPeriodFigures, REPORTING_START_LABEL, type PeriodFigures } from '@/lib/period';

const NONE: PeriodFigures = { poValue: 0, billed: 0, received: 0, paidOn: 0, tax: 0, held: 0, waiting: 0 };

interface SiteRow {
  id: string;
  site: string;
  client: string;
  po: number;
  pi: number;
  billed: number;
  received: number;
  waiting: number;
}

// One line per site that has anything from the portal's start date: POs,
// PIs, tax invoices or money received. Older records are not visible to
// signed-in users at all (migration_011), so every figure here is from then.
export default function DashboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [view, pis, period] = await Promise.all([
          supabase.from('v_site_dashboard').select('site_id, site_name, client_name, normal_outstanding'),
          supabase.from('proforma_invoice').select('site_id, amount, status'),
          loadPeriodFigures(),
        ]);
        if (view.error) throw new Error(view.error.message);
        if (pis.error) throw new Error(pis.error.message);
        const piBySite: Record<string, number> = {};
        ((pis.data ?? []) as { site_id: string; amount: number; status: string }[])
          .filter((p) => p.status !== 'converted_to_invoice')
          .forEach((p) => { piBySite[p.site_id] = (piBySite[p.site_id] ?? 0) + Number(p.amount); });
        const list = ((view.data ?? []) as Pick<SiteDashboardRow, 'site_id' | 'site_name' | 'client_name' | 'normal_outstanding'>[])
          .map((r): SiteRow => {
            const p = period[r.site_id] ?? NONE;
            return {
              id: r.site_id, site: r.site_name, client: r.client_name,
              po: p.poValue, pi: piBySite[r.site_id] ?? 0, billed: p.billed, received: p.received, waiting: Number(r.normal_outstanding ?? 0),
            };
          })
          .filter((r) => r.po || r.pi || r.billed || r.received)
          .sort((a, b) => b.po + b.pi + b.billed - (a.po + a.pi + a.billed));
        setRows(list);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
    })();
  }, []);

  const total = (k: keyof Omit<SiteRow, 'id' | 'site' | 'client'>) => rows.reduce((s, r) => s + r[k], 0);

  return (
    <div className="pb-12">
      <PageHeader
        title="Overview"
        subtitle={`All sites from ${REPORTING_START_LABEL}.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 hover:from-blue-700 hover:to-indigo-800 transition-all"
            >
              <UploadCloud size={15} /> Upload document
            </Link>
            <Link href="/reports" className={buttonClass}>
              <FileSpreadsheet size={15} /> Reports
            </Link>
          </div>
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="space-y-6 px-6 py-6 lg:px-8">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatTile label="PO / work order value" amount={total('po')} color="#0f172a" />
          <StatTile label="Proforma invoices" amount={total('pi')} color="#0284c7" note="not yet converted to tax invoices" />
          <StatTile label="Tax invoices billed" amount={total('billed')} color="#7c3aed" />
          <StatTile label="Money received" amount={total('received')} color="#059669" />
          <StatTile label="Waiting for payment" amount={total('waiting')} color="#dc2626" note="on tax invoices" />
        </div>

        <Panel title={`Sites (${rows.length})`}>
          {loading ? (
            <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState text={`Nothing recorded from ${REPORTING_START_LABEL} yet.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5 text-left">Site</th>
                    <th className="px-4 py-2.5 text-right">PO / WO value</th>
                    <th className="px-4 py-2.5 text-right">PIs</th>
                    <th className="px-4 py-2.5 text-right">Billed</th>
                    <th className="px-4 py-2.5 text-right">Received</th>
                    <th className="px-4 py-2.5 text-right">Waiting</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="group cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/site/?id=${r.id}`)}>
                      <td className="px-4 py-3">
                        <Link href={`/site/?id=${r.id}`} className="text-sm font-medium text-slate-900 group-hover:underline" onClick={(e) => e.stopPropagation()}>{r.site}</Link>
                        <div className="text-xs text-slate-500">{r.client}</div>
                      </td>
                      <Num v={r.po} /><Num v={r.pi} /><Num v={r.billed} /><Num v={r.received} />
                      <Num v={r.waiting} tone={r.waiting > 0.5 ? 'text-red-600' : undefined} />
                      <td className="pr-3 text-slate-300 group-hover:text-slate-500"><ChevronRight size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Num({ v, tone }: { v: number; tone?: string }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums ${v ? tone ?? 'text-slate-700' : 'text-slate-300'}`}>
      {v ? formatINR(v) : '—'}
    </td>
  );
}
