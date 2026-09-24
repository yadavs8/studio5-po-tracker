'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatINR } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, Panel, DataTable, Td } from '@/lib/ui';

interface Issue {
  severity: 'fix' | 'check';
  code: string;
  site_id: string;
  site_name: string;
  area: string;
  message: string;
  detail: string;
  hint: string;
  amount: number | null;
  item_count: number;
}

export default function DataHealthPage() {
  const [rows, setRows] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('v_data_health').select('*').then(({ data, error }) => {
      if (error) setError(error.message); else setRows((data ?? []) as Issue[]);
      setLoading(false);
    });
  }, []);

  const fix = rows.filter((r) => r.severity === 'fix');
  const check = rows.filter((r) => r.severity === 'check');

  return (
    <div className="min-h-screen bg-[#F3F5F8]">
      <PageHeader
        title="Data health"
        subtitle="A live checklist of anything missing, unclear or wrong in your records. When this list is empty, every number in the app can be trusted. It updates by itself as you fix things."
      />
      {error && <ErrorBanner message={error} />}
      <div className="space-y-6 px-8 py-6">
        {loading ? <EmptyState text="Checking…" /> : rows.length === 0 ? (
          <div className="border border-[#2F6B4F]/30 bg-[#2F6B4F]/5 px-6 py-6 font-sans text-sm text-[#2F6B4F]">
            All clear. Nothing is missing or unclear in your records.
          </div>
        ) : (
          <>
            <Group title={`Fix these first (${fix.length})`} tone="#A13D2B" rows={fix}
              intro="These make a number wrong or unclear. Fixing them makes the figures exact." />
            <Group title={`Worth completing (${check.length})`} tone="#B8860B" rows={check}
              intro="Nothing is wrong, but the record is incomplete (for example a file was never attached)." />
          </>
        )}
      </div>
    </div>
  );
}

function Group({ title, tone, rows, intro }: { title: string; tone: string; rows: Issue[]; intro: string }) {
  if (rows.length === 0) return null;
  return (
    <Panel title={title}>
      <div className="border-b border-[#1C1C1A]/10 px-6 py-2 font-sans text-xs" style={{ color: tone }}>{intro}</div>
      <DataTable columns={[{ label: 'Site' }, { label: 'What is the problem' }, { label: 'Details' }, { label: 'Amount', align: 'right' }, { label: 'How to fix it' }]}>
        {rows.map((r, i) => (
          <tr key={`${r.code}-${r.site_id}-${i}`}>
            <Td><Link href={`/site/?id=${r.site_id}`} className="text-[#1F3A52] underline">{r.site_name}</Link></Td>
            <Td>{r.message}</Td>
            <Td>{r.detail}</Td>
            <Td align="right" mono>{r.amount === null ? '' : formatINR(Number(r.amount))}</Td>
            <Td>{r.hint}</Td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}
