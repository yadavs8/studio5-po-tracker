'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ClientGroup, ProjectRow } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface Props {
  clientGroups: ClientGroup[];
}

const fmt = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const pct = (n: number) => `${n.toFixed(1)}%`;

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="font-mono text-[11px] text-slate-500 w-10 text-right">{pct(value)}</span>
    </div>
  );
}

function statusBadge(status: ProjectRow['status']) {
  switch (status) {
    case 'ACTIVE':    return <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Active</Badge>;
    case 'DLP':       return <Badge className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">DLP</Badge>;
    case 'COMPLETED': return <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Completed</Badge>;
  }
}

// ── Client-level aggregate  ───────────────────────────────────────
function clientTotals(projects: ProjectRow[]) {
  return projects.reduce(
    (acc, p) => ({
      contractCeiling: acc.contractCeiling + p.contractCeiling,
      billed: acc.billed + p.billed,
      bankCollected: acc.bankCollected + p.bankCollected,
      deductionsTdsRetention: acc.deductionsTdsRetention + p.deductionsTdsRetention,
      operationalAR: acc.operationalAR + p.operationalAR,
    }),
    { contractCeiling: 0, billed: 0, bankCollected: 0, deductionsTdsRetention: 0, operationalAR: 0 }
  );
}

export function ClientProjectDrilldown({ clientGroups }: Props) {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set([clientGroups[0]?.clientId]) // First client expanded by default
  );

  const toggleClient = (id: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow className="border-b border-slate-200">
            <TableHead className="text-xs w-64 pl-3">Client / Site</TableHead>
            <TableHead className="text-xs text-right">Contract Ceiling</TableHead>
            <TableHead className="text-xs text-right">Billed</TableHead>
            <TableHead className="text-xs text-right">Bank Collected</TableHead>
            <TableHead className="text-xs text-right">TDS + Retention</TableHead>
            <TableHead className="text-xs text-right text-amber-700">Op. AR</TableHead>
            <TableHead className="text-xs w-36">Physical %</TableHead>
            <TableHead className="text-xs w-36">Billing %</TableHead>
            <TableHead className="text-xs text-center w-20">Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {clientGroups.map((client) => {
            const totals = clientTotals(client.projects);
            const isExpanded = expandedClients.has(client.clientId);
            const avgPhysical = client.projects.reduce((s, p) => s + p.physicalCompletionPct, 0) / client.projects.length;
            const avgBilling = (totals.billed / totals.contractCeiling) * 100;

            return [
              // ── Client Header Row ──────────────────────────────
              <TableRow
                key={`client-${client.clientId}`}
                className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => toggleClient(client.clientId)}
              >
                <TableCell className="pl-3 py-2.5">
                  <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                    {client.clientName}
                    <span className="text-slate-400 font-normal text-xs">({client.projects.length} sites)</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-slate-800">{fmt(totals.contractCeiling)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-slate-700">{fmt(totals.billed)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">{fmt(totals.bankCollected)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-slate-500">{fmt(totals.deductionsTdsRetention)}</TableCell>
                <TableCell className={cn('text-right font-mono text-sm font-bold', totals.operationalAR < 0 ? 'text-emerald-600' : 'text-amber-700')}>{fmt(totals.operationalAR)}</TableCell>
                <TableCell><ProgressBar value={avgPhysical} color="bg-blue-400" /></TableCell>
                <TableCell><ProgressBar value={avgBilling} color="bg-violet-400" /></TableCell>
                <TableCell />
              </TableRow>,

              // ── Project Rows (collapsible) ─────────────────────
              ...(isExpanded ? client.projects.map((project) => (
                <TableRow
                  key={project.projectId}
                  className="border-b border-slate-100 hover:bg-blue-50/20 transition-colors"
                >
                  <TableCell className="pl-10 py-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <TrendingUp className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <div>
                        <span className="font-medium">{project.siteName}</span>
                        <span className="ml-2 text-[10px] text-slate-400 font-mono">{project.siteState}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-600">{fmt(project.contractCeiling)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-600">{fmt(project.billed)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-emerald-600">{fmt(project.bankCollected)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-400">{fmt(project.deductionsTdsRetention)}</TableCell>
                  <TableCell className={cn('text-right font-mono text-xs font-semibold', project.operationalAR < 0 ? 'text-emerald-600' : 'text-amber-600')}>
                    {fmt(project.operationalAR)}
                  </TableCell>
                  <TableCell><ProgressBar value={project.physicalCompletionPct} color="bg-blue-400" /></TableCell>
                  <TableCell><ProgressBar value={project.billingCompletionPct} color="bg-violet-400" /></TableCell>
                  <TableCell className="text-center">{statusBadge(project.status)}</TableCell>
                </TableRow>
              )) : []),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}
