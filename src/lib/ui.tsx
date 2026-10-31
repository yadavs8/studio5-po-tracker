'use client';

import React from 'react';
import { formatCompact, formatINR } from '@/lib/format';

// Shared building blocks for every page. Vibrant, modern surfaces:
// colorful metric tiles, elevated gradients, high-contrast badges and clear tables.

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
    <header className="border-b border-slate-200/80 bg-white/95 px-6 py-6 backdrop-blur-xs lg:px-8 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon && (
            <span className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50 border border-indigo-100 text-indigo-600 shadow-xs [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-indigo-600">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
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
    <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-700 shadow-xs lg:mx-8">
      {message}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="px-6 py-12 text-center text-sm font-medium text-slate-400">{text}</div>;
}

export function Panel({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
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

interface StatTheme {
  cardBg: string;
  borderColor: string;
  dotColor: string;
  pillBg: string;
  pillText: string;
}

function resolveStatTheme(color: string, label: string): StatTheme {
  const normColor = color.toLowerCase();
  const normLabel = label.toLowerCase();

  // 1. PO / Work order value (Blue / Indigo theme)
  if (normColor.includes('0f172a') || normLabel.includes('po') || normLabel.includes('work order')) {
    return {
      cardBg: 'bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/50',
      borderColor: 'border-blue-200/80 hover:border-blue-300',
      dotColor: 'bg-blue-600',
      pillBg: 'bg-blue-100/70',
      pillText: 'text-blue-900',
    };
  }

  // 2. Proforma Invoices (Cyan / Sky theme)
  if (normColor.includes('0284c7') || normLabel.includes('proforma') || normLabel.includes('pi')) {
    return {
      cardBg: 'bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/50',
      borderColor: 'border-sky-200/80 hover:border-sky-300',
      dotColor: 'bg-sky-500',
      pillBg: 'bg-sky-100/70',
      pillText: 'text-sky-900',
    };
  }

  // 3. Tax invoices billed (Violet / Purple theme)
  if (normColor.includes('7c3aed') || normLabel.includes('billed') || normLabel.includes('invoice')) {
    return {
      cardBg: 'bg-gradient-to-br from-purple-50/90 via-white to-violet-50/50',
      borderColor: 'border-purple-200/80 hover:border-purple-300',
      dotColor: 'bg-purple-600',
      pillBg: 'bg-purple-100/70',
      pillText: 'text-purple-900',
    };
  }

  // 4. Money received (Emerald / Green theme)
  if (normColor.includes('059669') || normLabel.includes('received') || normLabel.includes('paid')) {
    return {
      cardBg: 'bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50',
      borderColor: 'border-emerald-200/80 hover:border-emerald-300',
      dotColor: 'bg-emerald-600',
      pillBg: 'bg-emerald-100/70',
      pillText: 'text-emerald-900',
    };
  }

  // 5. Waiting for payment / Overdue (Rose / Amber theme)
  if (normColor.includes('dc2626') || normLabel.includes('waiting') || normLabel.includes('outstanding') || normLabel.includes('due')) {
    return {
      cardBg: 'bg-gradient-to-br from-rose-50/90 via-white to-amber-50/50',
      borderColor: 'border-rose-200/80 hover:border-rose-300',
      dotColor: 'bg-rose-500',
      pillBg: 'bg-rose-100/70',
      pillText: 'text-rose-900',
    };
  }

  // Fallback
  return {
    cardBg: 'bg-white',
    borderColor: 'border-slate-200 hover:border-slate-300',
    dotColor: 'bg-slate-700',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-700',
  };
}

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
  const theme = resolveStatTheme(color, label);

  return (
    <div
      className={`min-w-0 rounded-xl border p-4.5 transition-all duration-200 shadow-xs hover:shadow-md ${theme.cardBg} ${theme.borderColor}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold" title={help}>
        <div className="flex min-w-0 items-center gap-2 truncate">
          <span className={`h-2.5 w-2.5 flex-none rounded-full shadow-xs ${theme.dotColor}`} />
          <span className={`truncate ${theme.pillText}`}>{label}</span>
        </div>
        {icon && (
          <span className="flex-none text-slate-400 [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2.5 whitespace-nowrap font-mono text-2xl font-bold tabular-nums tracking-tight text-slate-900">
        {formatCompact(amount)}
      </div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-xs tabular-nums text-slate-500 font-medium" title="Exact amount">
        {formatINR(amount)}
      </div>
      {note && (
        <div className="mt-1.5 truncate text-[11px] font-medium text-slate-500">
          {note}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BTN = 'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]';

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BTN} bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white shadow-sm shadow-indigo-500/25 hover:from-blue-700 hover:to-indigo-800 ${props.className ?? ''}`}
    />
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BTN} border border-slate-200/90 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 ${props.className ?? ''}`}
    />
  );
}

export const buttonClass = `${BTN} border border-slate-200/90 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900`;
// Headers are light, so header actions use the normal button look.
export const buttonClassOnDark = buttonClass;

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function DataTable({ columns, children }: { columns: { label: string; align?: 'left' | 'right' }[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {columns.map((c, i) => (
              <th
                key={`${c.label}-${i}`}
                className={`whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&>tr:hover]:bg-blue-50/30 transition-colors">{children}</tbody>
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
  fully_settled: 'bg-emerald-100/80 text-emerald-800 border border-emerald-300/60',
  released: 'bg-emerald-100/80 text-emerald-800 border border-emerald-300/60',
  active: 'bg-emerald-100/80 text-emerald-800 border border-emerald-300/60',
  approved: 'bg-emerald-100/80 text-emerald-800 border border-emerald-300/60',
  converted_to_invoice: 'bg-emerald-100/80 text-emerald-800 border border-emerald-300/60',
  completed: 'bg-emerald-100/80 text-emerald-800 border border-emerald-300/60',
  partially_settled: 'bg-amber-100/80 text-amber-800 border border-amber-300/60',
  pending: 'bg-amber-100/80 text-amber-800 border border-amber-300/60',
  revision_requested: 'bg-amber-100/80 text-amber-800 border border-amber-300/60',
  on_hold: 'bg-amber-100/80 text-amber-800 border border-amber-300/60',
  overdue: 'bg-rose-100/80 text-rose-800 border border-rose-300/60',
  disputed: 'bg-rose-100/80 text-rose-800 border border-rose-300/60',
  issued: 'bg-sky-100/80 text-sky-800 border border-sky-300/60',
  sent: 'bg-sky-100/80 text-sky-800 border border-sky-300/60',
  draft: 'bg-slate-100 text-slate-700 border border-slate-300/60',
  cancelled: 'bg-slate-100 text-slate-700 border border-slate-300/60',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function FileBadge({ ext }: { ext?: string | null }) {
  if (!ext) return <span className="text-slate-300">—</span>;
  const upper = ext.toUpperCase();
  let color = 'bg-slate-100 text-slate-700 border-slate-200';
  if (upper === 'PDF') color = 'bg-rose-100/90 text-rose-700 border-rose-200';
  else if (upper === 'DOC' || upper === 'DOCX') color = 'bg-blue-100/90 text-blue-700 border-blue-200';
  else if (upper === 'XLS' || upper === 'XLSX') color = 'bg-emerald-100/90 text-emerald-700 border-emerald-200';
  else if (['PNG', 'JPG', 'JPEG', 'WEBP'].includes(upper)) color = 'bg-purple-100/90 text-purple-700 border-purple-200';

  return (
    <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${color}`}>
      {upper}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

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
