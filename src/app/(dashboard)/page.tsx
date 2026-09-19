import { Suspense } from 'react';
import {
  FileText, Landmark, TrendingUp, AlertCircle,
  ShieldCheck, Wallet, ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ClientProjectDrilldown } from '@/components/dashboard/ClientProjectDrilldown';
import { ReceivablesAgeingTable } from '@/components/dashboard/ReceivablesAgeingTable';
import {
  mockKpi, mockClientGroups, mockAgeingRows, KpiSummary,
} from '@/lib/mock-data';

// ── Helper: formatted Indian currency ────────────────────────────
function inr(n: number, compact = false): string {
  if (compact) {
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  }
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

// ── KPI Card definition ───────────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  accent: string;           // Tailwind colour classes
  badgeLabel?: string;
  badgeClass?: string;
  sub?: string;
}

function KpiCard({ title, value, icon: Icon, accent, badgeLabel, badgeClass, sub }: KpiCardProps) {
  return (
    <Card className="relative overflow-hidden border-slate-200 shadow-sm">
      <div className={`absolute inset-0 w-1 ${accent}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 pl-5 pr-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </CardTitle>
        <div className={`flex h-8 w-8 items-center justify-center rounded-md ${accent} bg-opacity-10`}>
          <Icon className={`h-4 w-4 ${accent.replace('bg-', 'text-')}`} />
        </div>
      </CardHeader>
      <CardContent className="pl-5 pr-4 pb-4">
        <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">
          {inr(value, true)}
        </p>
        <p className="font-mono text-[11px] text-slate-400 mt-0.5">{inr(value)}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
        {badgeLabel && (
          <Badge className={`mt-2 text-[10px] ${badgeClass}`}>{badgeLabel}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ── Async data-fetching stub (replace body with Supabase calls) ──
async function getDashboardData(): Promise<{
  kpi: KpiSummary;
  clientGroups: typeof mockClientGroups;
  ageingRows: typeof mockAgeingRows;
}> {
  // In production: call calculateProjectFinancials + Supabase queries here.
  // For now, return mock data for local preview.
  return {
    kpi: mockKpi,
    clientGroups: mockClientGroups,
    ageingRows: mockAgeingRows,
  };
}

export const metadata = { title: 'Executive Dashboard — Studio 5 Interiors' };

// ── Page ─────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const { kpi, clientGroups, ageingRows } = await getDashboardData();

  const collectionEfficiencyPct =
    kpi.netInvoicedValue > 0
      ? ((kpi.totalCollected / kpi.netInvoicedValue) * 100).toFixed(1)
      : '0.0';

  return (
    <main className="min-h-screen bg-slate-50">
      {/* ── Page Header ───────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Executive Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Studio 5 Interiors · Commercial Overview · FY 2026–27
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
              Live Data
            </Badge>
            <span className="text-xs text-slate-400 font-mono">
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-8 max-w-[1600px] mx-auto">

        {/* ── KPI Grid ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">
            Financial Snapshot
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              title="Active Contract Value"
              value={kpi.totalContractValue}
              icon={FileText}
              accent="bg-blue-500"
              sub="PO + All Amendments"
            />
            <KpiCard
              title="Net Invoiced Amount"
              value={kpi.netInvoicedValue}
              icon={TrendingUp}
              accent="bg-violet-500"
              sub="Invoices − CNs + DNs"
            />
            <KpiCard
              title="Bank Remittances"
              value={kpi.totalCollected}
              icon={Landmark}
              accent="bg-emerald-500"
              sub={`Collection ${collectionEfficiencyPct}% of billed`}
            />
            <KpiCard
              title="Operational Receivables"
              value={kpi.operationalReceivables}
              icon={AlertCircle}
              accent="bg-amber-500"
              sub="Excl. withheld retention"
            />
            <KpiCard
              title="Retention Under DLP"
              value={kpi.retentionUnderDLP}
              icon={ShieldCheck}
              accent="bg-indigo-500"
              badgeLabel="Not Overdue"
              badgeClass="bg-indigo-50 text-indigo-700 border-indigo-200"
              sub="Release linked to Handover + DLP"
            />
            <KpiCard
              title="Mobilization Advance Bal."
              value={kpi.mobilizationAdvanceBalance}
              icon={Wallet}
              accent="bg-rose-500"
              sub="Unadjusted advance balance"
            />
          </div>
        </section>

        <Separator className="bg-slate-200" />

        {/* ── Client / Site Breakdown ───────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
              Client &amp; Site Breakdown
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> Click client row to expand sites
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[11px] text-slate-500">Physical %</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1.5 rounded-full bg-violet-400" />
              <span className="text-[11px] text-slate-500">Billing %</span>
            </div>
          </div>

          <Suspense fallback={<div className="h-40 flex items-center justify-center text-slate-400 text-sm">Loading breakdown…</div>}>
            <ClientProjectDrilldown clientGroups={clientGroups} />
          </Suspense>
        </section>

        <Separator className="bg-slate-200" />

        {/* ── Receivables Ageing ────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
                Receivables Ageing
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Withheld retention excluded from overdue buckets unless past DLP release date
              </p>
            </div>
          </div>

          <Suspense fallback={<div className="h-40 flex items-center justify-center text-slate-400 text-sm">Loading ageing…</div>}>
            <ReceivablesAgeingTable rows={ageingRows} />
          </Suspense>
        </section>

      </div>
    </main>
  );
}
