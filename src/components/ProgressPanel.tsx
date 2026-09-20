'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { formatDate, formatPct } from '@/lib/format';
import type { SubProject } from '@/lib/types';
import { Panel, DataTable, Td, EmptyState, FormShell, FieldInput, FieldSelect } from '@/lib/ui';

interface ProgressRow {
  progress_id: string;
  sub_project_id: string | null;
  progress_pct: number;
  note: string | null;
  reported_date: string;
}

/**
 * Physical (site-work) progress log. This is deliberately separate from billing
 * progress, which is calculated from invoices — the two are never blended.
 */
export function ProgressPanel({
  siteId,
  siteName,
  subProjects,
}: {
  siteId: string;
  siteName: string;
  subProjects: SubProject[];
}) {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('physical_progress_log')
      .select('progress_id, sub_project_id, progress_pct, note, reported_date')
      .eq('site_id', siteId)
      .order('reported_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) setError(friendlyError(error));
    else setRows((data ?? []) as ProgressRow[]);
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string | null) =>
    id ? subProjects.find((s) => s.sub_project_id === id)?.name ?? 'Sub-project' : 'Whole site';

  return (
    <div className="px-8 py-6">
      <Panel
        title={`Physical Progress — ${siteName}`}
        action={
          <button onClick={() => setShow(true)} className="border border-[#1F3A52] px-3 py-1.5 font-sans text-xs font-medium text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white">
            + Log Progress
          </button>
        }
      >
        {show && (
          <ProgressForm
            siteId={siteId}
            subProjects={subProjects}
            onCancel={() => setShow(false)}
            onSaved={() => { setShow(false); load(); }}
          />
        )}
        {error && <div className="px-6 py-3 font-sans text-sm text-[#A13D2B]">{error}</div>}
        {rows.length === 0 ? (
          <EmptyState text="No physical progress logged yet. This is site-work completion, separate from billing progress." />
        ) : (
          <DataTable columns={[{ label: 'Date' }, { label: 'Applies to' }, { label: 'Progress', align: 'right' }, { label: 'Note' }]}>
            {rows.map((r) => (
              <tr key={r.progress_id}>
                <Td mono>{formatDate(r.reported_date)}</Td>
                <Td>{nameOf(r.sub_project_id)}</Td>
                <Td align="right" mono>{formatPct(Number(r.progress_pct))}</Td>
                <Td>{r.note ?? ''}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

function ProgressForm({
  siteId,
  subProjects,
  onCancel,
  onSaved,
}: {
  siteId: string;
  subProjects: SubProject[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [subId, setSubId] = useState('');
  const [pct, setPct] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const n = Number(pct);
    if (pct === '' || Number.isNaN(n) || n < 0 || n > 100) { setErr('Progress must be between 0 and 100.'); return; }
    setSubmitting(true);
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('physical_progress_log').insert({
      site_id: siteId,
      sub_project_id: subId || null,
      progress_pct: n,
      reported_date: date,
      note: note.trim() || null,
      reported_by: u.user?.id ?? null,
    });
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onSaved();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldSelect
        label="Applies to (blank = whole site)"
        value={subId}
        onChange={setSubId}
        options={subProjects.map((s) => ({ value: s.sub_project_id, label: s.name }))}
      />
      <FieldInput label="Physical progress %" type="number" value={pct} onChange={setPct} placeholder="0 – 100" />
      <FieldInput label="Reported date" type="date" value={date} onChange={setDate} />
      <FieldInput label="Note (optional)" value={note} onChange={setNote} />
    </FormShell>
  );
}
