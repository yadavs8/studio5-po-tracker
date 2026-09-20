'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, ArrowRight, Plus, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, Panel, PrimaryButton } from '@/lib/ui';
import { describe, type TodoItem } from '@/components/NotificationBar';

interface Task { task_id: string; sort: number; title: string; detail: string | null; link: string | null; done: boolean; done_at: string | null }

const GROUPS: { p: 1 | 2 | 3; title: string; hint: string; color: string }[] = [
  { p: 1, title: 'Fix now', hint: 'These make a number wrong or unclear.', color: '#C0392B' },
  { p: 2, title: 'Soon', hint: 'Nothing is wrong yet, but these need doing.', color: '#B8860B' },
  { p: 3, title: 'For your information', hint: 'Good to know, no rush.', color: '#3C6485' },
];

export default function TodoPage() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('v_todo').select('*').order('priority').order('item_count', { ascending: false }),
      supabase.from('app_task').select('*').order('done').order('sort').order('created_at'),
    ]);
    const bad = [a, b].find((r) => r.error);
    if (bad?.error) { setError(friendlyError(bad.error)); setLoading(false); return; }
    setItems((a.data ?? []) as TodoItem[]);
    setTasks((b.data ?? []) as Task[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(t: Task) {
    const { error } = await supabase.from('app_task').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('task_id', t.task_id);
    if (error) setError(friendlyError(error)); else load();
  }
  async function add() {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('app_task').insert({ title: newTitle.trim(), sort: 100 });
    if (error) { setError(friendlyError(error)); return; }
    setNewTitle(''); load();
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const dataItems = items.filter((i) => i.code !== 'setup_open');

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<ListChecks size={24} className="text-[#E8C872]" />}
        title="My to-do"
        subtitle="Everything that needs you, in one place. The first list is worked out live from your data and clears itself when you fix things. The checklist below is for steps only you can do outside the app."
      />
      {error && <ErrorBanner message={error} />}

      <div className="space-y-8 px-8 py-8">
        {loading ? <EmptyState text="Loading…" /> : (
          <>
            {dataItems.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-[#2F6B4F]/25 bg-[#2F6B4F]/5 px-6 py-5 font-sans text-sm text-[#2F6B4F]">
                <CheckCircle2 size={18} /> Your records are all in order. Nothing from the data needs your attention.
              </div>
            ) : GROUPS.map((g) => {
              const rows = dataItems.filter((i) => i.priority === g.p);
              if (!rows.length) return null;
              return (
                <Panel key={g.p} title={`${g.title} (${rows.length})`}>
                  <div className="border-b border-slate-100 px-6 py-2 font-sans text-xs" style={{ color: g.color }}>{g.hint}</div>
                  <ul className="divide-y divide-slate-100">
                    {rows.map((t) => (
                      <li key={t.code} className="flex items-center gap-4 px-6 py-3.5">
                        <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: g.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="font-sans text-sm font-medium text-slate-800">{describe(t)}</div>
                          {t.detail && <div className="font-sans text-xs text-slate-400">{t.detail}</div>}
                        </div>
                        <Link href={t.link} className="inline-flex flex-none items-center gap-1 rounded-lg bg-[#1F3A52] px-3 py-1.5 font-sans text-xs font-semibold text-white hover:bg-[#2A4D6B]">Open <ArrowRight size={13} /></Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })}

            <Panel title={`Setup and decisions for you (${open.length} open)`}>
              <div className="border-b border-slate-100 px-6 py-2 font-sans text-xs text-slate-500">Tick a step when it is done. Add your own reminders at the bottom.</div>
              {open.length === 0 && <EmptyState text="Every step is done. Well done." />}
              <ul className="divide-y divide-slate-100">
                {open.map((t) => <TaskRow key={t.task_id} t={t} onToggle={() => toggle(t)} />)}
              </ul>
              <div className="flex gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
                <input
                  value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="Add your own reminder…"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-sans text-sm outline-none focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15"
                />
                <PrimaryButton onClick={add} disabled={!newTitle.trim()}><Plus size={14} /> Add</PrimaryButton>
              </div>
              {done.length > 0 && (
                <div className="border-t border-slate-100">
                  <button onClick={() => setShowDone((s) => !s)} className="w-full px-6 py-2.5 text-left font-sans text-xs font-semibold text-slate-500 hover:bg-slate-50">
                    {showDone ? 'Hide' : 'Show'} {done.length} completed
                  </button>
                  {showDone && <ul className="divide-y divide-slate-100">{done.map((t) => <TaskRow key={t.task_id} t={t} onToggle={() => toggle(t)} />)}</ul>}
                </div>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function TaskRow({ t, onToggle }: { t: Task; onToggle: () => void }) {
  return (
    <li className="flex items-start gap-4 px-6 py-3.5">
      <input type="checkbox" checked={t.done} onChange={onToggle} className="mt-1 h-4 w-4 flex-none cursor-pointer" />
      <div className="min-w-0 flex-1">
        <div className={`font-sans text-sm font-medium ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.title}</div>
        {t.detail && !t.done && <div className="mt-0.5 font-sans text-xs leading-relaxed text-slate-500">{t.detail}</div>}
        {t.done && t.done_at && <div className="font-sans text-xs text-slate-400">Done {formatDate(t.done_at)}</div>}
      </div>
      {t.link && !t.done && <Link href={t.link} className="flex-none font-sans text-xs font-semibold text-[#1F3A52] underline">Go</Link>}
    </li>
  );
}
