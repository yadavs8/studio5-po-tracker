'use client';

import React from 'react';
import { formatCompact, formatINR } from '@/lib/format';

// Shared building blocks for every page. Quiet, light surfaces: white cards on
// a slate-50 page, slate text, one dark accent for primary actions.

// ---------------------------------------------------------------------------
// Layout
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
    <header className="border-b border-slate-200 bg-white px-6 py-6 lg:px-8 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-slate-100 text-slate-700 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:text-slate-700">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 lg:mx-8">
      {message}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="px-6 py-10 text-center text-sm text-slate-400">{text}</div>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Number tile: label, short amount, exact amount underneath
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
  void icon; // tiles are text-only now; the colour dot marks the kind of figure
  return (
    <div className="card min-w-0 px-5 py-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500" title={help}>
        <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 whitespace-nowrap font-mono text-2xl font-semibold tabular-nums text-slate-900">{formatCompact(amount)}</div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-xs tabular-nums text-slate-400" title="Exact amount">{formatINR(amount)}</div>
      {note && <div className="mt-1 truncate text-xs text-slate-400">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BTN = 'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${BTN} bg-slate-900 text-white hover:bg-slate-700 ${props.className ?? ''}`} />;
}
export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 ${props.className ?? ''}`} />;
}
export const buttonClass = `${BTN} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
// Headers are light now, so header actions use the normal button look.
export const buttonClassOnDark = buttonClass;

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function DataTable({ columns, children }: { columns: { label: string; align?: 'left' | 'right' }[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {columns.map((c, i) => (
              <th
                key={`${c.label}-${i}`}
                className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium text-slate-500 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&>tr:hover]:bg-slate-50">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-sm text-slate-700 ${align === 'right' ? 'text-right' : 'text-left'} ${mono ? 'whitespace-nowrap font-mono tabular-nums' : ''}`}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Status label
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<string, string> = {
  fully_settled: 'bg-emerald-50 text-emerald-700',
  released: 'bg-emerald-50 text-emerald-700',
  active: 'bg-emerald-50 text-emerald-700',
  approved: 'bg-emerald-50 text-emerald-700',
  converted_to_invoice: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-emerald-50 text-emerald-700',
  partially_settled: 'bg-amber-50 text-amber-700',
  pending: 'bg-amber-50 text-amber-700',
  revision_requested: 'bg-amber-50 text-amber-700',
  on_hold: 'bg-amber-50 text-amber-700',
  overdue: 'bg-red-50 text-red-700',
  disputed: 'bg-red-50 text-red-700',
  issued: 'bg-sky-50 text-sky-700',
  sent: 'bg-sky-50 text-sky-700',
  draft: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';

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
    <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-5 flex gap-2">
        <PrimaryButton onClick={onSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</PrimaryButton>
        <button onClick={onCancel} className={`${BTN} text-slate-500 hover:bg-slate-100 hover:text-slate-900`}>Cancel</button>
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
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
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
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
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
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-600">{label}</label>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="mt-1.5 block w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:border-slate-400"
      />
    </div>
  );
}
