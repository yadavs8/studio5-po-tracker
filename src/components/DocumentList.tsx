'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Pencil, ExternalLink, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { inPeriod } from '@/lib/period';
import { friendlyError } from '@/lib/plain';
import {
  listDocuments,
  fileDocument,
  linkedRecordHref,
  fileExt,
  fileNameFromPath,
  DOC_TYPES,
  DOC_TYPE_LABEL,
  type DocumentRow,
  type UploadDocType,
} from '@/lib/documents';
import { DataTable, Td, EmptyState, ErrorBanner, FileBadge, FormShell, FieldInput, FieldSelect } from '@/lib/ui';

const TYPE_STYLE: Record<UploadDocType, string> = {
  po: 'bg-blue-100/80 text-blue-800 border-blue-300/60',
  pi: 'bg-sky-100/80 text-sky-800 border-sky-300/60',
  invoice: 'bg-purple-100/80 text-purple-800 border-purple-300/60',
  payment_advice: 'bg-emerald-100/80 text-emerald-800 border-emerald-300/60',
  challan: 'bg-amber-100/80 text-amber-800 border-amber-300/60',
  tds_certificate: 'bg-rose-100/80 text-rose-800 border-rose-300/60',
  correspondence: 'bg-slate-100 text-slate-700 border-slate-300/60',
  other: 'bg-slate-100 text-slate-700 border-slate-300/60',
};

const SHORT_LABEL: Record<UploadDocType, string> = {
  po: 'PO / WO',
  pi: 'Proforma',
  invoice: 'Tax invoice',
  payment_advice: 'Payment advice',
  challan: 'Challan',
  tds_certificate: 'TDS certificate',
  correspondence: 'Letter',
  other: 'Other',
};

const NO_SITE = '__none__';

interface SiteOpt {
  site_id: string;
  label: string;
}

/**
 * Every filed document, newest first, with filters by kind, site and free text.
 * With `siteId` it shows one site's documents only (used on the Site page).
 */
export function DocumentList({ siteId, initialSite = '' }: { siteId?: string; initialSite?: string }) {
  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [type, setType] = useState<UploadDocType | ''>('');
  const [siteFilter, setSiteFilter] = useState(initialSite);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [sites, setSites] = useState<SiteOpt[]>([]);

  useEffect(() => {
    let alive = true;
    listDocuments(siteId)
      .then((rows) => alive && setDocs(rows))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [siteId, reloadKey]);

  useEffect(() => {
    supabase
      .from('site')
      .select('site_id, site_name, client:client_id(display_name)')
      .order('site_name')
      .then(({ data }) =>
        setSites(
          ((data ?? []) as unknown as { site_id: string; site_name: string; client: { display_name: string } | null }[]).map((s) => ({
            site_id: s.site_id,
            label: `${s.client?.display_name ?? 'Client'} — ${s.site_name}`,
          }))
        )
      );
  }, []);

  // The portal starts on its reporting date; papers dated earlier stay hidden like their records.
  const visible = useMemo(() => (docs ?? []).filter((d) => !d.doc_date || inPeriod(d.doc_date)), [docs]);

  const bySite = useMemo(
    () => (siteId || !siteFilter ? visible : visible.filter((d) => (siteFilter === NO_SITE ? !d.site_id : d.site_id === siteFilter))),
    [visible, siteId, siteFilter]
  );

  const counts = useMemo(() => {
    const c: Partial<Record<UploadDocType, number>> = {};
    bySite.forEach((d) => (c[d.document_type] = (c[d.document_type] ?? 0) + 1));
    return c;
  }, [bySite]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bySite.filter((d) => {
      if (type && d.document_type !== type) return false;
      if (!q) return true;
      return [d.doc_number, d.file_name, d.notes, d.po?.po_number, d.site?.site_name, d.site?.client?.display_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [bySite, type, query]);

  const unfiled = visible.filter((d) => !d.site_id).length;

  const columns = [
    { label: 'Kind' },
    { label: 'Number / title' },
    { label: 'Date' },
    ...(siteId ? [] : [{ label: 'Site' }]),
    { label: 'Work order' },
    { label: 'File' },
    { label: '' },
  ];

  return (
    <div>
      {error && <ErrorBanner message={error} />}

      <div className="space-y-3 border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={type === ''} onClick={() => setType('')}>
            All <span className="text-slate-400">{bySite.length}</span>
          </Chip>
          {DOC_TYPES.filter((t) => counts[t]).map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(type === t ? '' : t)}>
              {SHORT_LABEL[t]} <span className="text-slate-400">{counts[t]}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search documents</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by number, file name, notes, PO or site"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          {!siteId && (
            <label className="min-w-[220px]">
              <span className="sr-only">Site</span>
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">All sites</option>
                {unfiled > 0 && <option value={NO_SITE}>Not filed to a site ({unfiled})</option>}
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {editing && (
        <FilingForm
          doc={editing}
          sites={sites}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {docs === null && !error ? (
        <div className="space-y-2 px-5 py-5">
          <div className="skeleton h-8" />
          <div className="skeleton h-8" />
          <div className="skeleton h-8" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState text={visible.length ? 'No documents match these filters.' : 'No documents filed yet. Use Upload document to add one.'} />
      ) : (
        <DataTable columns={columns}>
          {shown.map((d) => {
            const name = d.file_name || fileNameFromPath(d.file_url);
            const title = d.doc_number || name;
            const recordHref = linkedRecordHref(d);
            return (
              <tr key={d.document_id}>
                <Td>
                  <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${TYPE_STYLE[d.document_type] ?? TYPE_STYLE.other}`}>
                    {SHORT_LABEL[d.document_type] ?? d.document_type}
                  </span>
                </Td>
                <Td>
                  <div className="font-mono text-sm font-semibold text-slate-900">{title}</div>
                  {d.notes && <div className="max-w-xs truncate text-xs text-slate-500">{d.notes}</div>}
                </Td>
                <Td mono>{formatDate(d.doc_date)}</Td>
                {!siteId && (
                  <Td>
                    {d.site ? (
                      <Link href={`/site/?id=${d.site_id}`} className="text-sm text-slate-700 hover:underline">
                        {d.site.site_name}
                        <span className="block text-xs text-slate-400">{d.site.client?.display_name}</span>
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700">Not filed</span>
                    )}
                  </Td>
                )}
                <Td mono>{d.po?.po_number ?? <span className="text-slate-300">—</span>}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <FileBadge ext={fileExt(name)} />
                    <span className="max-w-[180px] truncate text-xs text-slate-500" title={name}>
                      {name}
                    </span>
                  </div>
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap text-xs font-medium">
                    <Link href={`/document/?id=${d.document_id}&title=${encodeURIComponent(title)}`} className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                      <ExternalLink size={13} /> View
                    </Link>
                    {recordHref && (
                      <Link href={recordHref} className="inline-flex items-center gap-1 text-slate-600 hover:underline">
                        Record <ArrowRight size={13} />
                      </Link>
                    )}
                    {!d.linked_type && (
                      <button onClick={() => setEditing(d)} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900">
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Re-files a document that is not tied to a PO / PI / invoice / payment (challans, letters, etc.).
 * Those tied to a record follow the record, so they are edited there.
 */
function FilingForm({ doc, sites, onCancel, onSaved }: { doc: DocumentRow; sites: SiteOpt[]; onCancel: () => void; onSaved: () => void }) {
  const [siteId, setSiteId] = useState(doc.site_id ?? '');
  const [poId, setPoId] = useState(doc.po_id ?? '');
  const [number, setNumber] = useState(doc.doc_number ?? '');
  const [date, setDate] = useState(doc.doc_date ?? '');
  const [notes, setNotes] = useState(doc.notes ?? '');
  const [poList, setPoList] = useState<{ siteId: string; pos: { po_id: string; po_number: string }[] }>({ siteId: '', pos: [] });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    supabase
      .from('purchase_order')
      .select('po_id, po_number')
      .eq('site_id', siteId)
      .order('po_date', { ascending: false })
      .then(({ data }) => setPoList({ siteId, pos: (data ?? []) as { po_id: string; po_number: string }[] }));
  }, [siteId]);
  const pos = poList.siteId === siteId ? poList.pos : [];

  async function save() {
    if (!siteId) {
      setErr('Please choose the site this document belongs to.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await fileDocument(doc.document_id, { siteId, poId: poId || null, docNumber: number, docDate: date || null, notes });
      onSaved();
    } catch (e) {
      setErr(friendlyError(e as { message: string }));
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="bg-indigo-50/60 px-5 pt-4 text-xs font-semibold text-indigo-900">
        Edit filing: {DOC_TYPE_LABEL[doc.document_type]} {doc.doc_number || doc.file_name || ''}
      </div>
      <FormShell onCancel={onCancel} onSubmit={save} submitting={saving} error={err}>
        <FieldSelect
          label="Client — Site"
          value={siteId}
          onChange={(v) => {
            setSiteId(v);
            setPoId('');
          }}
          options={sites.map((s) => ({ value: s.site_id, label: s.label }))}
        />
        <FieldSelect
          label="Work order / PO (optional)"
          value={poId}
          onChange={setPoId}
          options={pos.map((p) => ({ value: p.po_id, label: `PO/WO ${p.po_number}` }))}
        />
        <FieldInput label="Number / title" value={number} onChange={setNumber} />
        <FieldInput label="Date" type="date" value={date} onChange={setDate} />
        <FieldInput label="Notes" value={notes} onChange={setNotes} full />
      </FormShell>
    </div>
  );
}
