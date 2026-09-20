'use client';

import React from 'react';
import { formatCompact, formatINR } from '@/lib/format';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-[#12283B] via-[#1F3A52] to-[#2F6E8E] px-8 py-8 text-white print:hidden">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#E8C872]/10" />
      <div className="pointer-events-none absolute -bottom-28 right-40 h-64 w-64 rounded-full bg-white/[0.04]" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {icon && (
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              {icon}
            </span>
          )}
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-3xl font-sans text-sm leading-relaxed text-white/70">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mx-8 mt-4 flex items-start gap-3 rounded-lg border border-[#A13D2B]/25 bg-[#A13D2B]/5 px-4 py-3 font-sans text-sm text-[#A13D2B]">
      <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#A13D2B] text-xs font-bold text-white">!</span>
      {message}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-6 py-10 text-center font-sans text-sm leading-relaxed text-slate-400">
      {text}
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-3.5">
        <h2 className="flex items-center gap-2.5 font-sans text-sm font-semibold text-[#1F3A52]">
          <span className="h-4 w-1 rounded-full bg-[#E8C872]" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile (KPI card) — icon, short amount, exact amount underneath
// ---------------------------------------------------------------------------

export function StatTile({
  icon,
  label,
  amount,
  color,
  note,
  help,
}: {
  icon?: React.ReactNode;
  label: string;
  amount: number;
  color: string;
  note?: string;
  help?: string;
}) {
  return (
    <div className="card rise group relative min-w-0 overflow-hidden px-5 py-4 transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div className="flex items-start justify-between gap-2">
        <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500" title={help}>
          {label}
          {help ? <span className="ml-1 cursor-help text-slate-400">ⓘ</span> : null}
        </div>
        {icon && (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg" style={{ backgroundColor: `${color}14`, color }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 whitespace-nowrap font-mono text-2xl font-semibold tabular-nums" style={{ color }}>{formatCompact(amount)}</div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-[11px] tabular-nums text-slate-400" title="Exact amount">{formatINR(amount)}</div>
      <div className="mt-1.5 h-4 font-sans text-[11px] text-slate-400">{note ?? ''}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BTN = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-sans text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50';
export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${BTN} bg-[#1F3A52] text-white shadow-sm hover:-translate-y-px hover:bg-[#2A4D6B] hover:shadow-md ${props.className ?? ''}`} />;
}
export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${BTN} border border-[#1F3A52]/30 bg-white text-[#1F3A52] hover:border-[#1F3A52] hover:bg-[#1F3A52] hover:text-white ${props.className ?? ''}`} />;
}
export const buttonClass = `${BTN} border border-[#1F3A52]/30 bg-white text-[#1F3A52] hover:border-[#1F3A52] hover:bg-[#1F3A52] hover:text-white`;
export const buttonClassOnDark = `${BTN} border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white hover:text-[#1F3A52]`;

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function DataTable({ columns, children }: { columns: { label: string; align?: 'left' | 'right' }[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {columns.map((c) => (
              <th
                key={c.label}
                className={`whitespace-nowrap px-4 py-3 font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(even)]:bg-slate-50/50 [&>tr:hover]:bg-[#1F3A52]/[0.04] [&>tr]:transition-colors">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
  return (
    <td
      className={`border-b border-slate-100 px-4 py-3 font-sans text-sm text-slate-800 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${mono ? 'font-mono tabular-nums' : ''}`}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  fully_settled: '#2F6B4F',
  partially_settled: '#B8860B',
  issued: '#1F3A52',
  overdue: '#A13D2B',
  pending: '#B8860B',
  released: '#2F6B4F',
  active: '#2F6B4F',
  draft: '#6B7B8C',
  sent: '#1F3A52',
  approved: '#2F6B4F',
  revision_requested: '#B8860B',
  converted_to_invoice: '#2F6B4F',
  completed: '#2F6B4F',
  disputed: '#A13D2B',
  cancelled: '#6B7B8C',
  on_hold: '#B8860B',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#6B7B8C';
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-sans text-xs font-medium"
      style={{ color, backgroundColor: `${color}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form primitives
// ---------------------------------------------------------------------------

const INPUT =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15';

export function FormShell({
  onCancel,
  onSubmit,
  submitting,
  error,
  children,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-6 py-5">
      <div className="grid grid-cols-2 gap-4">{children}</div>
      {error && (
        <div className="mt-4 rounded-lg border border-[#A13D2B]/25 bg-[#A13D2B]/5 px-3 py-2 font-sans text-sm text-[#A13D2B]">{error}</div>
      )}
      <div className="mt-5 flex gap-2">
        <PrimaryButton onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </PrimaryButton>
        <button onClick={onCancel} className={`${BTN} text-slate-500 hover:bg-slate-100 hover:text-slate-800`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block font-sans text-xs font-semibold text-slate-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={INPUT} />
    </div>
  );
}

export function FieldSelect({
  label,
  value,
  onChange,
  options,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block font-sans text-xs font-semibold text-slate-600">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FieldFile({
  label = 'Document (optional)',
  onChange,
  full = true,
}: {
  label?: string;
  onChange: (f: File | null) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block font-sans text-xs font-semibold text-slate-600">{label}</label>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#1F3A52]/10 file:px-3 file:py-1 file:font-sans file:text-xs file:font-semibold file:text-[#1F3A52] hover:border-[#1F3A52]/50"
      />
    </div>
  );
}
