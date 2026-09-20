'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { SiteDashboardRow } from '@/lib/types';
import { formatINR, formatCompact, formatPct, formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, DataTable, Td } from '@/lib/ui';

// Every figure below comes straight from v_site_dashboard, which is derived from
// tax_invoice, payment_allocation and deduction. Nothing is typed in or defaulted here.
export default function DashboardPage() {
  const [rows, setRows] = useState<SiteDashboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('v_site_dashboard')
      .select('*')
      .order('normal_outstanding', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows((data ?? []) as SiteDashboardRow[]);
        setLoading(false);
      });
  }, []);

  const totals = rows.reduce(
    (acc, r) => ({
      contract: acc.contract + Number(r.current_contract_value ?? 0),
      invoiced: acc.invoiced + Number(r.total_invoiced ?? 0),
      collected: acc.collected + Number(r.total_collected ?? 0),
      outstanding: acc.outstanding + Number(r.normal_outstanding ?? 0),
      retention: acc.retention + Number(r.retention_outstanding ?? 0),
      advance: acc.advance + Number(r.advance_balance ?? 0),
    }),
    { contract: 0, invoiced: 0, collected: 0, outstanding: 0, retention: 0, advance: 0 }
  );

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <PageHeader
        title="All sites at a glance"
        subtitle="Every number is calculated from the POs, invoices, payments and deductions you enter. Click a site to see each PO with its PIs, tax invoices and money received."
      />
      {error && <ErrorBanner message={error} />}

      <div className="px-8 py-6">
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryTile label="PO value (with GST)" note="only POs entered so far" amount={totals.contract} accent="#1F3A52" />
          <SummaryTile label="Billed so far" note="incl. invoices with no PO entered yet" amount={totals.invoiced} accent="#1F3A52" />
          <SummaryTile label="Money received in bank" amount={totals.collected} accent="#2F6B4F" />
          <SummaryTile label="Billed, waiting for payment" note="client owes this today" amount={totals.outstanding} accent="#A13D2B" />
          <SummaryTile label="Held back until handover" note="not overdue - kept separate" amount={totals.retention} accent="#B8860B" />
          <SummaryTile label="Advance not yet used" amount={totals.advance} accent="#6B7B8C" />
        </div>

        {loading ? (
          <EmptyState text="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState text="No sites yet — add clients and sites under Master Data first." />
        ) : (
          <div className="border border-[#1C1C1A]/10 bg-white">
            <DataTable
              columns={[
                { label: 'Client' },
                { label: 'Site' },
                { label: 'PO value', align: 'right' },
                { label: 'Billed', align: 'right' },
                { label: 'Received', align: 'right' },
                { label: 'Waiting for payment', align: 'right' },
                { label: 'Held till handover', align: 'right' },
                { label: 'Billed vs work done' },
              ]}
            >
              {rows.map((r) => (
                <tr key={r.site_id}>
                  <Td>{r.client_name}</Td>
                  <Td><Link href={`/sites/${r.site_id}`} className="font-medium text-[#1F3A52] underline decoration-[#1F3A52]/30 hover:decoration-[#1F3A52]">{r.site_name}</Link></Td>
                  <Td align="right" mono>{formatINR(r.current_contract_value)}</Td>
                  <Td align="right" mono>{formatINR(r.total_invoiced)}</Td>
                  <Td align="right" mono>{formatINR(r.total_collected)}</Td>
                  <Td align="right" mono>
                    <span style={{ color: r.normal_outstanding > 0 ? '#A13D2B' : undefined }}>
                      {formatINR(r.normal_outstanding)}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    <span style={{ color: r.retention_outstanding > 0 ? '#B8860B' : undefined }}>
                      {formatINR(r.retention_outstanding)}
                    </span>
                  </Td>
                  <Td>
                    <ProgressPair billing={r.billing_progress_pct} physical={r.physical_progress_pct} physicalDate={r.physical_progress_date} />
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, amount, accent, note }: { label: string; amount: number; accent: string; note?: string }) {
  return (
    <div className="min-w-0 border border-[#1C1C1A]/10 bg-white px-5 py-4 shadow-[0_1px_0_rgba(28,28,26,0.04)]" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[#1C1C1A]/50">{label}</div>
      <div className="mt-2 whitespace-nowrap font-mono text-2xl font-medium tabular-nums" style={{ color: accent }}>{formatCompact(amount)}</div>
      <div className="mt-1 whitespace-nowrap font-mono text-[11px] tabular-nums text-[#1C1C1A]/45" title="Exact amount">{formatINR(amount)}</div>
      <div className="mt-1 h-4 font-sans text-[11px] text-[#1C1C1A]/40">{note ?? ''}</div>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 font-sans text-[10px] uppercase tracking-wider text-[#1C1C1A]/45">{label}</span>
      <div className="h-1.5 w-32 bg-[#1C1C1A]/10">
        <div className="h-full" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className="w-14 text-right font-mono text-xs tabular-nums text-[#1C1C1A]/70">{formatPct(pct)}</span>
    </div>
  );
}

// Billing and physical progress are two different measures — shown side by side, never merged.
function ProgressPair({ billing, physical, physicalDate }: { billing: number | null; physical: number | null; physicalDate: string | null }) {
  return (
    <div className="space-y-1" title={physicalDate ? `Physical progress as of ${formatDate(physicalDate)}` : 'No physical progress logged'}>
      <Bar label="Billed" pct={billing} color="#1F3A52" />
      <Bar label="Work done" pct={physical} color="#B8860B" />
    </div>
  );
}
