'use client';

import { useMemo, useState } from 'react';
import { AgeingBucket, AgeingRow } from '@/lib/mock-data';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  rows: AgeingRow[];
}

type ActiveFilter = AgeingBucket | 'ALL';

const BUCKETS: { key: ActiveFilter; label: string; color: string }[] = [
  { key: 'ALL',     label: 'All Invoices',   color: 'text-slate-600' },
  { key: 'NOT_DUE', label: 'Not Due',         color: 'text-emerald-600' },
  { key: '1_30',    label: '1–30 Days',       color: 'text-amber-500' },
  { key: '31_60',   label: '31–60 Days',      color: 'text-orange-500' },
  { key: '61_90',   label: '61–90 Days',      color: 'text-red-500' },
  { key: '90_PLUS', label: '90+ Days',        color: 'text-red-700' },
];

function bucketBadge(bucket: AgeingBucket, isRetentionOnly: boolean, releaseDate: string | null) {
  const today = new Date();
  // If retention-only and release date is in the future → show "DLP Locked"
  if (isRetentionOnly && releaseDate && new Date(releaseDate) > today) {
    return (
      <Badge className="gap-1 bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] font-semibold">
        <Lock className="w-3 h-3" /> DLP Locked
      </Badge>
    );
  }
  switch (bucket) {
    case 'NOT_DUE':  return <Badge className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"><CheckCircle2 className="w-3 h-3"/>Not Due</Badge>;
    case '1_30':     return <Badge className="gap-1 bg-amber-50 text-amber-700 border-amber-200 text-[10px]"><Clock className="w-3 h-3"/>1–30 Days</Badge>;
    case '31_60':    return <Badge className="gap-1 bg-orange-50 text-orange-700 border-orange-200 text-[10px]"><AlertTriangle className="w-3 h-3"/>31–60 Days</Badge>;
    case '61_90':    return <Badge className="gap-1 bg-red-50 text-red-600 border-red-200 text-[10px]"><AlertTriangle className="w-3 h-3"/>61–90 Days</Badge>;
    case '90_PLUS':  return <Badge className="gap-1 bg-red-100 text-red-800 border-red-300 text-[10px] font-bold"><AlertTriangle className="w-3 h-3"/>90+ Days</Badge>;
  }
}

const fmt = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function ReceivablesAgeingTable({ rows }: Props) {
  const [activeBucket, setActiveBucket] = useState<ActiveFilter>('ALL');
  const [clientFilter, setClientFilter] = useState<string>('ALL');

  const today = new Date();

  // ── Derived filtering  ──────────────────────────────────────────
  // Business rule: retention-only rows are excluded from overdue buckets
  // UNLESS today > retention expected_release_date.
  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      // Retention exclusion logic from PROJECT_RULES.md
      const isRetentionOverdue =
        row.isRetentionOnly &&
        row.retentionExpectedReleaseDate &&
        new Date(row.retentionExpectedReleaseDate) > today;

      // If this is a DLP-locked retention row and bucket filter is overdue → hide it
      if (isRetentionOverdue && ['1_30', '31_60', '61_90', '90_PLUS'].includes(activeBucket)) return false;

      if (activeBucket !== 'ALL' && row.bucket !== activeBucket) return false;
      if (clientFilter !== 'ALL' && row.clientName !== clientFilter) return false;
      return true;
    });
  }, [rows, activeBucket, clientFilter, today]);

  // ── Bucket totals for the summary row ─────────────────────────
  const bucketTotals = useMemo(() => {
    const totals: Record<AgeingBucket, number> = {
      NOT_DUE: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_PLUS': 0,
    };
    rows.forEach((r) => {
      const isLocked =
        r.isRetentionOnly &&
        r.retentionExpectedReleaseDate &&
        new Date(r.retentionExpectedReleaseDate) > today;
      if (!isLocked) totals[r.bucket] += r.operationalOutstanding;
    });
    return totals;
  }, [rows]);

  const grandTotal = visibleRows.reduce((s, r) => s + r.operationalOutstanding, 0);
  const clients = ['ALL', ...Array.from(new Set(rows.map(r => r.clientName)))];

  return (
    <div className="space-y-4">
      {/* ── Bucket Summary Chips ─── */}
      <div className="grid grid-cols-5 gap-3">
        {BUCKETS.filter(b => b.key !== 'ALL').map(b => (
          <button
            key={b.key}
            onClick={() => setActiveBucket(activeBucket === b.key ? 'ALL' : b.key)}
            className={cn(
              'rounded-md border p-3 text-left transition-all hover:shadow-sm',
              activeBucket === b.key
                ? 'border-slate-400 bg-slate-100 ring-1 ring-slate-400'
                : 'border-slate-200 bg-white'
            )}
          >
            <p className={cn('text-[10px] font-semibold uppercase tracking-wider', b.color)}>{b.label}</p>
            <p className={cn('font-mono text-base font-bold mt-1', b.color)}>
              {fmt(bucketTotals[b.key as AgeingBucket] || 0)}
            </p>
          </button>
        ))}
      </div>

      {/* ── Client Quick-Filter Tabs ─── */}
      <Tabs value={clientFilter} onValueChange={setClientFilter}>
        <TabsList className="h-8 bg-slate-100">
          {clients.map(c => (
            <TabsTrigger key={c} value={c} className="text-xs px-3 py-1">
              {c === 'ALL' ? 'All Clients' : c}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ── Data Table ─── */}
      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="border-b border-slate-200">
              <TableHead className="text-xs w-48">Invoice No.</TableHead>
              <TableHead className="text-xs">Client / Site</TableHead>
              <TableHead className="text-xs">Invoice Date</TableHead>
              <TableHead className="text-xs">Due Date</TableHead>
              <TableHead className="text-xs text-right">Net Receivable</TableHead>
              <TableHead className="text-xs text-right">Outstanding</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-400 text-sm italic">
                  No invoices match the selected filter.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => {
                const isLocked =
                  row.isRetentionOnly &&
                  row.retentionExpectedReleaseDate &&
                  new Date(row.retentionExpectedReleaseDate) > today;
                const isOverdue = ['1_30', '31_60', '61_90', '90_PLUS'].includes(row.bucket) && !isLocked;

                return (
                  <TableRow
                    key={row.invoiceId}
                    className={cn(
                      'border-b border-slate-100 text-sm',
                      isLocked    && 'bg-indigo-50/30',
                      row.bucket === '90_PLUS' && !isLocked && 'bg-red-50/40',
                    )}
                  >
                    <TableCell className="font-mono text-xs text-slate-700">{row.invoiceNumber}</TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-800 text-xs">{row.clientName}</p>
                      <p className="text-slate-400 text-[11px]">{row.siteName}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{row.invoiceDate}</TableCell>
                    <TableCell className={cn('font-mono text-xs', isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500')}>
                      {row.dueDate}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-600">{fmt(row.netReceivable)}</TableCell>
                    <TableCell className={cn(
                      'text-right font-mono text-xs font-semibold',
                      isLocked ? 'text-indigo-700' : isOverdue ? 'text-red-700' : 'text-slate-800'
                    )}>
                      {fmt(row.operationalOutstanding)}
                    </TableCell>
                    <TableCell className="text-center">
                      {bucketBadge(row.bucket, row.isRetentionOnly, row.retentionExpectedReleaseDate)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Grand Total Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 text-white">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            {visibleRows.length} invoice{visibleRows.length !== 1 ? 's' : ''} · {activeBucket === 'ALL' ? 'All Buckets' : BUCKETS.find(b => b.key === activeBucket)?.label}
          </span>
          <span className="font-mono font-bold text-base text-emerald-300">{fmt(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
