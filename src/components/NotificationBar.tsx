'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ChevronDown, ChevronUp, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCompact } from '@/lib/format';

export interface TodoItem {
  priority: 1 | 2 | 3;
  code: string;
  title: string;
  detail: string | null;
  item_count: number;
  amount: number | null;
  link: string;
}

const P = {
  1: { label: 'Fix now', dot: '#C0392B', bg: 'from-[#8E2A1E] to-[#B5382A]' },
  2: { label: 'Soon', dot: '#D4A017', bg: 'from-[#8A6410] to-[#B8860B]' },
  3: { label: 'For your information', dot: '#6B9AC4', bg: 'from-[#2B4A63] to-[#3C6485]' },
} as const;

export const describe = (t: TodoItem) =>
  `${t.item_count > 1 && t.code !== 'setup_open' ? `${t.item_count} × ` : ''}${t.title}${t.amount && Number(t.amount) > 0 ? ` · ${formatCompact(Number(t.amount))}` : ''}`;

/** Slim bar under the menu on every page. Built live from the data (v_todo) so it can never go out of date. */
export function NotificationBar() {
  const pathname = usePathname().replace(/(.)\/$/, '$1');
  const [items, setItems] = useState<TodoItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('v_todo_all').select('*').order('priority').order('item_count', { ascending: false });
    if (!error) setItems((data ?? []) as TodoItem[]);
  }, []);

  useEffect(() => { load(); }, [load, pathname]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const headline = (items ?? []).filter((i) => i.priority <= 2);
  const rotating = headline.length > 0 ? headline : items ?? [];
  useEffect(() => {
    if (open || hover || rotating.length < 2) return;
    const t = setInterval(() => setIdx((i) => i + 1), 5000);
    return () => clearInterval(t);
  }, [open, hover, rotating.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey); window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [open]);

  if (items === null) return null;

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-gradient-to-r from-[#1F5A3F] to-[#2F6B4F] px-6 py-1.5 font-sans text-xs text-white">
        <CheckCircle2 size={14} /> All caught up. Nothing needs your attention right now.
      </div>
    );
  }

  const urgent = items.filter((i) => i.priority === 1);
  const top = urgent.length ? 1 : items.some((i) => i.priority === 2) ? 2 : 3;
  const current = rotating[idx % rotating.length];
  const totalCount = items.length;

  return (
    <div ref={box} className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`flex items-center gap-3 bg-gradient-to-r ${P[top].bg} px-6 py-1.5 text-white shadow-md`}>
        <span className="relative flex flex-none items-center">
          <Bell size={15} />
          <span className="absolute -right-2 -top-2 rounded-full bg-white px-1 font-mono text-[9px] font-bold leading-tight text-slate-800">{totalCount}</span>
        </span>
        <div className="min-w-0 flex-1 truncate font-sans text-xs sm:text-[13px]">
          <b className="mr-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{P[current.priority].label}</b>
          <Link href={current.link} className="hover:underline">{describe(current)}</Link>
        </div>
        <span className="hidden flex-none font-sans text-[11px] text-white/70 md:inline">
          {urgent.length > 0 ? `${urgent.length} to fix now · ` : ''}{totalCount} in total
        </span>
        <button onClick={() => setOpen((o) => !o)} className="flex flex-none items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 font-sans text-xs font-semibold hover:bg-white/25">
          {open ? <>Hide <ChevronUp size={13} /></> : <>See all <ChevronDown size={13} /></>}
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-b border-slate-200 bg-white shadow-2xl">
          <div className="mx-auto max-w-5xl px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-[#1F3A52]">Needs your attention</h3>
              <Link href="/todo" onClick={() => setOpen(false)} className="font-sans text-xs font-semibold text-[#1F3A52] underline">Open the full to-do list</Link>
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {items.map((t) => (
                <li key={t.code + t.title}>
                  <Link href={t.link} onClick={() => setOpen(false)} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: P[t.priority].dot }} title={P[t.priority].label} />
                    <div className="min-w-0 flex-1">
                      <div className="font-sans text-sm font-medium text-slate-800">{describe(t)}</div>
                      {t.detail && <div className="truncate font-sans text-xs text-slate-400">{t.detail}</div>}
                    </div>
                    <span className="hidden flex-none rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider sm:inline" style={{ color: P[t.priority].dot, backgroundColor: `${P[t.priority].dot}18` }}>{P[t.priority].label}</span>
                    <ArrowRight size={15} className="flex-none text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#1F3A52]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
