'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="border-b border-[#1C1C1A]/10 bg-white px-8 py-7">
      <div className="flex items-stretch gap-4">
        <div className="w-1 bg-[#1F3A52]" />
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#1C1C1A]">{title}</h1>
          <p className="mt-1.5 max-w-3xl font-sans text-sm leading-relaxed text-[#1C1C1A]/60">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mx-8 mt-4 border border-[#A13D2B]/30 bg-[#A13D2B]/5 px-4 py-3 font-sans text-sm text-[#A13D2B]">
      {message}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-6 py-8 font-sans text-sm leading-relaxed text-[#1C1C1A]/40">
      {text}
    </div>
  );
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-[#1C1C1A]/10 bg-white shadow-[0_1px_0_rgba(28,28,26,0.04)]">
      <div className="flex items-center justify-between border-b border-[#1C1C1A]/10 px-6 py-3.5">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-[#1F3A52]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function DataTable({ columns, children }: { columns: { label: string; align?: 'left' | 'right' }[]; children: React.ReactNode }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b-2 border-[#1F3A52]/20 bg-[#1F3A52]/[0.04]">
          {columns.map((c) => (
            <th
              key={c.label}
              className={`px-4 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#1F3A52]/70 ${
                c.align === 'right' ? 'text-right' : 'text-left'
              }`}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr:hover]:bg-[#1F3A52]/[0.03]">{children}</tbody>
    </table>
  );
}

export function Td({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
  return (
    <td
      className={`border-b border-[#1C1C1A]/5 px-4 py-2.5 font-sans text-sm text-[#1C1C1A] ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${mono ? 'font-mono tabular-nums' : ''}`}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  fully_settled: '#1F3A52',
  partially_settled: '#B8860B',
  issued: '#1C1C1A',
  overdue: '#A13D2B',
  pending: '#B8860B',
  released: '#1F3A52',
  active: '#1F3A52',
  draft: '#1C1C1A',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#1C1C1A';
  return (
    <span
      className="inline-block border px-2 py-0.5 font-sans text-xs"
      style={{ borderColor: `${color}40`, color, backgroundColor: `${color}0D` }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form primitives
// ---------------------------------------------------------------------------

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
    <div className="border-b border-[#1C1C1A]/10 bg-[#1C1C1A]/[0.02] px-6 py-4">
      <div className="grid grid-cols-2 gap-3">{children}</div>
      {error && <div className="mt-3 font-sans text-sm text-[#A13D2B]">{error}</div>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="bg-[#1F3A52] px-4 py-2 font-sans text-xs font-medium text-white hover:bg-[#1F3A52]/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 font-sans text-xs font-medium text-[#1C1C1A]/60 hover:text-[#1C1C1A]"
        >
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
      <label className="block font-sans text-xs font-medium text-[#1C1C1A]/60">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-[#1C1C1A]/15 bg-white px-3 py-2 font-sans text-sm outline-none focus:border-[#1F3A52]"
      />
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
      <label className="block font-sans text-xs font-medium text-[#1C1C1A]/60">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-[#1C1C1A]/15 bg-white px-3 py-2 font-sans text-sm outline-none focus:border-[#1F3A52]"
      >
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
      <label className="block font-sans text-xs font-medium text-[#1C1C1A]/60">{label}</label>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full border border-[#1C1C1A]/15 bg-white px-3 py-1.5 font-sans text-sm file:mr-3 file:border-0 file:bg-[#1F3A52]/10 file:px-3 file:py-1 file:font-sans file:text-xs file:text-[#1F3A52]"
      />
    </div>
  );
}
