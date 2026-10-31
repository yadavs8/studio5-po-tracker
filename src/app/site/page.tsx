'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { uploadDocument } from '@/lib/documents';
import { updateWithAudit } from '@/lib/audit';
import { friendlyError } from '@/lib/plain';
import { formatINR, formatDate } from '@/lib/format';
import { FileSpreadsheet, ArrowLeft, Pencil, UploadCloud } from 'lucide-react';
import { PageHeader, ErrorBanner, EmptyState, Panel, DataTable, Td, StatusBadge, StatTile, buttonClass, FormShell, FieldInput, FieldSelect, FieldFile } from '@/lib/ui';
import { WORDS, HELP } from '@/lib/plain';
import type { SiteDashboardRow } from '@/lib/types';
import { confirmBeforeStart, REPORTING_START_LABEL } from '@/lib/period';

interface PoRow {
  po_id: string; po_number: string; po_date: string; scope_description: string | null; sub_project_id: string | null;
  document_id: string | null; po_value: number; pi_count: number; pi_total: number; invoice_count: number;
  invoiced: number; received_bank: number; tds_and_other_deductions: number; retention_pending: number;
  yet_to_invoice: number; invoice_outstanding: number; balance_against_po: number;
}
interface PiRow { pi_id: string; po_id: string | null; pi_number: string; pi_date: string; amount: number; status: string; subject: string | null; remarks: string | null; document_id: string | null; }
interface InvRow { invoice_id: string; po_id: string | null; invoice_number: string; invoice_date: string; gross_invoice_value: number; document_id: string | null; sub_project_id: string | null; }
interface SettleRow { invoice_id: string; total_payments_allocated: number; total_deducted: number; remaining_balance: number; computed_status: string; }
interface PayRow { payment_id: string; po_id: string | null; payment_date: string; amount_received: number; payment_type: string; payment_mode: string; utr_or_reference: string | null; remarks: string | null; document_id: string | null; }
interface AllocRow { payment_id: string; invoice_id: string | null; amount_allocated: number; }

function SitePageInner() {
  const id = useSearchParams().get('id') ?? '';
  const [site, setSite] = useState<{ site_name: string; client: string } | null>(null);
  const [dash, setDash] = useState<SiteDashboardRow | null>(null);
  const [pos, setPos] = useState<PoRow[]>([]);
  const [pis, setPis] = useState<PiRow[]>([]);
  const [invs, setInvs] = useState<InvRow[]>([]);
  const [settle, setSettle] = useState<Record<string, SettleRow>>({});
  const [pays, setPays] = useState<PayRow[]>([]);
  const [allocs, setAllocs] = useState<AllocRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ kind: EditKind; id: string } | null>(null);

  useEffect(() => { load(); }, [id]);

  function load() {
    (async () => {
      const q = await Promise.all([
        supabase.from('site').select('site_name, client:client_id(display_name)').eq('site_id', id).single(),
        supabase.from('v_site_dashboard').select('*').eq('site_id', id).maybeSingle(),
        supabase.from('v_po_summary').select('*').eq('site_id', id).order('po_date'),
        supabase.from('proforma_invoice').select('*').eq('site_id', id).order('pi_date'),
        supabase.from('tax_invoice').select('invoice_id,po_id,invoice_number,invoice_date,gross_invoice_value,document_id,sub_project_id').eq('site_id', id).order('invoice_date'),
        supabase.from('v_invoice_settlement').select('*').eq('site_id', id),
        supabase.from('payment').select('*').eq('site_id', id).order('payment_date'),
      ]);
      const failed = q.find((r) => r.error);
      if (failed?.error) { setError(failed.error.message); setLoading(false); return; }
      const s = q[0].data as unknown as { site_name: string; client: { display_name: string } | null };
      setSite({ site_name: s.site_name, client: s.client?.display_name ?? '' });
      setDash((q[1].data as SiteDashboardRow) ?? null);
      setPos((q[2].data ?? []) as PoRow[]);
      setPis((q[3].data ?? []) as PiRow[]);
      setInvs((q[4].data ?? []) as InvRow[]);
      setSettle(Object.fromEntries(((q[5].data ?? []) as SettleRow[]).map((r) => [r.invoice_id, r])));
      const payRows = (q[6].data ?? []) as PayRow[];
      setPays(payRows);
      if (payRows.length) {
        const { data: a, error: ae } = await supabase.from('payment_allocation').select('payment_id,invoice_id,amount_allocated').in('payment_id', payRows.map((p) => p.payment_id));
        if (ae) setError(ae.message); else setAllocs((a ?? []) as AllocRow[]);
      }
      setLoading(false);
    })();
  }

  const invPo = useMemo(() => Object.fromEntries(invs.map((i) => [i.invoice_id, i.po_id])), [invs]);

  // Signed-in users only ever see records from the reporting start (RLS), so
  // everything loaded is listed.
  const vPis = pis, vInvs = invs, vPays = pays, vPos = pos;

  const totalReceived = vPays.reduce((s, p) => s + Number(p.amount_received), 0);
  const totalBilled = vInvs.reduce((s, i) => s + Number(i.gross_invoice_value), 0);
  const sumPo = (k: keyof PoRow) => vPos.reduce((s, p) => s + Number(p[k] ?? 0), 0);

  // receipts belonging to a PO: tagged to it, or allocated to one of its invoices
  function receiptsFor(poId: string | null) {
    return vPays
      .map((p) => {
        const toPo = allocs.filter((a) => a.payment_id === p.payment_id && invPo[a.invoice_id ?? ''] === poId && a.invoice_id);
        const applied = toPo.reduce((s, a) => s + Number(a.amount_allocated), 0);
        const belongs = poId === null
          ? p.po_id === null && !allocs.some((a) => a.payment_id === p.payment_id && a.invoice_id && invPo[a.invoice_id])
          : p.po_id === poId || applied > 0;
        return { p, applied, belongs };
      })
      .filter((r) => r.belongs);
  }

  const hasActivity = vPos.length > 0 || vPis.length > 0 || vInvs.length > 0 || vPays.length > 0;

  return (
    <div className="pb-12">
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/upload"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 hover:from-blue-700 hover:to-indigo-800 transition-all"
            >
              <UploadCloud size={15} /> Upload document
            </Link>
            {hasActivity && (
              <Link href={`/site/statement/?id=${id}`} className={buttonClass}>
                <FileSpreadsheet size={15} /> Account statement
              </Link>
            )}
          </div>
        }
        title={site?.site_name ?? 'Site'}
        subtitle={site?.client ?? ''}
      />
      {error && <ErrorBanner message={error} />}
      <div className="space-y-6 px-6 py-6 lg:px-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Overview</Link>

        {loading ? <PageSkeleton /> : (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatTile label={WORDS.poValue} help={HELP.poValue} amount={sumPo('po_value')} color="#0f172a" />
              <StatTile label={WORDS.billed} help={HELP.billed} amount={totalBilled} color="#7c3aed" />
              <StatTile label={WORDS.received} help={HELP.received} amount={totalReceived} color="#059669" />
              <StatTile label="Waiting for payment" help={HELP.billedUnpaid} amount={dash?.normal_outstanding ?? 0} color="#dc2626" note="on tax invoices" />
            </div>

            {/* ONE BLOCK PER PO */}
            {vPos.length === 0 && !vPis.length && !vInvs.length && !vPays.length && <EmptyState text={`Nothing recorded for this site from ${REPORTING_START_LABEL} yet.`} />}
            {vPos.map((po) => (
              <Panel
                key={po.po_id}
                title={
                  <span>
                    PO <Link href={`/po/?id=${po.po_id}`} className="font-mono text-sky-700 hover:underline">{po.po_number}</Link>
                    {po.scope_description ? ' — ' + po.scope_description : ''}  ·  {formatDate(po.po_date)}
                  </span>
                }
                action={
                  <div className="flex items-center gap-3">
                    <DocLink id={po.document_id} label="PO document" title={po.po_number} />
                    <EditButton onClick={() => setEditing({ kind: 'po', id: po.po_id })} />
                  </div>
                }
              >
                <PoSummary po={po} />
                <Detail
                  pis={vPis.filter((p) => p.po_id === po.po_id)}
                  invs={vInvs.filter((i) => i.po_id === po.po_id)}
                  settle={settle}
                  receipts={receiptsFor(po.po_id)}
                  onEdit={(kind, id) => setEditing({ kind, id })}
                />
              </Panel>
            ))}

            {/* NOT LINKED TO A PO */}
            {(() => {
              const uPis = vPis.filter((p) => !p.po_id);
              const uInvs = vInvs.filter((i) => !i.po_id);
              const uRec = receiptsFor(null);
              if (!uPis.length && !uInvs.length && !uRec.length) return null;
              return (
                <Panel title={vPos.length ? 'Not linked to a PO' : 'Records'}>
                  <Detail pis={uPis} invs={uInvs} settle={settle} receipts={uRec} onEdit={(kind, id) => setEditing({ kind, id })} />
                </Panel>
              );
            })()}
          </>
        )}
      </div>

      {editing && (
        <EditDrawer
          kind={editing.kind}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

type EditKind = 'po' | 'pi' | 'invoice' | 'payment';

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
      <Pencil size={12} /> Edit
    </button>
  );
}

function Detail({ pis, invs, settle, receipts, onEdit }: {
  pis: PiRow[]; invs: InvRow[]; settle: Record<string, SettleRow>;
  receipts: { p: PayRow; applied: number }[];
  onEdit?: (kind: EditKind, id: string) => void;
}) {
  return (
    <div className="divide-y divide-slate-100">
      <Section title={`Proforma invoices - quotes sent for approval (${pis.length})`}>
        {pis.length === 0 ? <Empty t="No PI recorded." /> : (
          <DataTable columns={[{ label: 'PI no.' }, { label: 'Subject' }, { label: 'Date' }, { label: 'Amount', align: 'right' }, { label: 'Status' }, { label: 'Work status / note' }, { label: 'Doc' }, { label: '' }]}>
            {pis.map((p) => (
              <tr key={p.pi_id}>
                <Td mono><Link href={`/pi/?id=${p.pi_id}`} className="text-sky-700 hover:underline">{p.pi_number}</Link></Td><Td>{p.subject ?? ''}</Td><Td mono>{formatDate(p.pi_date)}</Td><Td align="right" mono>{formatINR(p.amount)}</Td>
                <Td><StatusBadge status={p.status} /></Td><Td>{p.remarks ?? ''}</Td><Td><DocLink id={p.document_id} title={p.pi_number} /></Td>
                <Td>{onEdit && <EditButton onClick={() => onEdit('pi', p.pi_id)} />}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      <Section title={`Tax invoices raised (${invs.length})`}>
        {invs.length === 0 ? <Empty t="No tax invoice raised yet." /> : (
          <DataTable columns={[{ label: 'Invoice no.' }, { label: 'Date' }, { label: 'Amount', align: 'right' }, { label: 'Paid so far', align: 'right' }, { label: 'Tax deducted / held', align: 'right' }, { label: 'Still to pay', align: 'right' }, { label: 'Status' }, { label: 'Doc' }, { label: '' }]}>
            {invs.map((i) => {
              const s = settle[i.invoice_id];
              return (
                <tr key={i.invoice_id}>
                  <Td mono>{i.invoice_number}</Td><Td mono>{formatDate(i.invoice_date)}</Td><Td align="right" mono>{formatINR(i.gross_invoice_value)}</Td>
                  <Td align="right" mono>{formatINR(s?.total_payments_allocated ?? 0)}</Td>
                  <Td align="right" mono>{formatINR(s?.total_deducted ?? 0)}</Td>
                  <Td align="right" mono><span style={{ color: (s?.remaining_balance ?? 0) > 0 ? '#dc2626' : undefined }}>{formatINR(s?.remaining_balance ?? i.gross_invoice_value)}</span></Td>
                  <Td><StatusBadge status={s?.computed_status ?? 'issued'} /></Td><Td><DocLink id={i.document_id} title={i.invoice_number} /></Td>
                  <Td>{onEdit && <EditButton onClick={() => onEdit('invoice', i.invoice_id)} />}</Td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Section>
      <Section title={`Money received in bank (${receipts.length})`}>
        {receipts.length === 0 ? <Empty t="No receipt recorded." /> : (
          <DataTable columns={[{ label: 'Date' }, { label: 'Type' }, { label: 'Ref / note' }, { label: 'Amount received', align: 'right' }, { label: 'Used on invoices here', align: 'right' }, { label: 'Doc' }, { label: '' }]}>
            {receipts.map(({ p, applied }) => (
              <tr key={p.payment_id}>
                <Td mono>{formatDate(p.payment_date)}</Td><Td>{p.payment_type.replace(/_/g, ' ')}</Td>
                <Td>{[p.utr_or_reference, p.remarks].filter(Boolean).join(' — ')}</Td>
                <Td align="right" mono>{formatINR(p.amount_received)}</Td><Td align="right" mono>{formatINR(applied)}</Td><Td><DocLink id={p.document_id} title={p.utr_or_reference || 'Payment'} /></Td>
                <Td>{onEdit && <EditButton onClick={() => onEdit('payment', p.payment_id)} />}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-slate-50 px-5 py-2 text-xs font-medium text-slate-500">{title}</div>
      {children}
    </div>
  );
}
function Empty({ t }: { t: string }) { return <div className="px-5 py-3 text-sm text-slate-400">{t}</div>; }

function DocLink({ id, label = 'View', title }: { id: string | null; label?: string; title?: string }) {
  if (!id) return <span className="whitespace-nowrap text-xs text-slate-300">no file</span>;
  return (
    <Link
      href={`/document/?id=${id}&title=${encodeURIComponent(title || label || 'Document')}`}
      className="text-xs font-medium text-sky-700 hover:underline"
    >
      {label}
    </Link>
  );
}

// One line of figures per PO: what was agreed, billed, received, and left.
function PoSummary({ po }: { po: PoRow }) {
  const figs: [string, number, string?][] = [
    [WORDS.poValue, Number(po.po_value)],
    [WORDS.billed, Number(po.invoiced)],
    [WORDS.received, Number(po.received_bank)],
    ["Still to receive", Number(po.balance_against_po), Number(po.balance_against_po) > 0.5 ? "text-red-600" : undefined],
  ];
  return (
    <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
      {figs.map(([label, v, tone]) => (
        <div key={label} className="bg-white px-5 py-3">
          <div className="text-xs text-slate-500">{label}</div>
          <div className={`mt-0.5 font-mono text-sm font-medium tabular-nums ${tone ?? "text-slate-900"}`}>{formatINR(v)}</div>
        </div>
      ))}
    </div>
  );
}
function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0,1,2,3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="skeleton h-40" />
      <div className="skeleton h-72" />
    </div>
  );
}
// ---------------------------------------------------------------------------
// Edit drawer — fix a mistake on an existing PO / PI / invoice / payment,
// optionally attach or replace its file. Every change is logged to audit_log.
// ---------------------------------------------------------------------------

const EDIT_CONFIG: Record<EditKind, { table: string; idField: string; docType: 'po' | 'pi' | 'invoice' | 'payment_advice'; label: string }> = {
  po: { table: 'purchase_order', idField: 'po_id', docType: 'po', label: 'Purchase Order' },
  pi: { table: 'proforma_invoice', idField: 'pi_id', docType: 'pi', label: 'Proforma Invoice' },
  invoice: { table: 'tax_invoice', idField: 'invoice_id', docType: 'invoice', label: 'Tax Invoice' },
  payment: { table: 'payment', idField: 'payment_id', docType: 'payment_advice', label: 'Payment' },
};

function EditDrawer({ kind, id, onClose, onSaved }: { kind: EditKind; id: string; onClose: () => void; onSaved: () => void }) {
  const cfg = EDIT_CONFIG[kind];
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from(cfg.table).select('*').eq(cfg.idField, id).single().then(({ data, error }) => {
      if (error) { setLoadError(friendlyError(error)); return; }
      setRow(data);
      const f: Record<string, string> = {};
      Object.entries(data).forEach(([k, v]) => { f[k] = v == null ? '' : String(v); });
      setForm(f);
    });
  }, [kind, id]);

  const set = (k: string) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  async function submit() {
    if (!row) return;
    const dateKey = ['po_date', 'pi_date', 'invoice_date', 'payment_date'].find((k) => k in form);
    if (dateKey && form[dateKey] !== String(row[dateKey] ?? '') && !confirmBeforeStart(form[dateKey], cfg.label.toLowerCase())) return;
    setSubmitting(true);
    setSaveError(null);
    let newDocId: string | null = null;
    try {
      if (file) newDocId = await uploadDocument(file, cfg.docType);
    } catch (e) {
      setSaveError((e as Error).message);
      setSubmitting(false);
      return;
    }

    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(form)) {
      if (key === cfg.idField || key === 'created_at' || key === 'document_id') continue;
      const original = row[key];
      const raw = form[key];
      if (original == null && raw === '') continue;
      const value = typeof original === 'number' ? (raw === '' ? null : Number(raw)) : (raw === '' ? null : raw);
      if (String(original ?? '') !== String(value ?? '')) patch[key] = value;
    }
    const oldDocId = row.document_id as string | null;
    if (newDocId) patch.document_id = newDocId;

    const { error } = await updateWithAudit(cfg.table, cfg.idField, id, patch);
    setSubmitting(false);
    if (error) { setSaveError(friendlyError(error)); return; }
    if (newDocId && oldDocId) {
      const { discardDocument } = await import('@/lib/documents');
      await discardDocument(oldDocId);
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10 backdrop" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-sans text-sm font-semibold text-slate-900">Edit {cfg.label}</h3>
          <button onClick={onClose} className="font-sans text-xs text-slate-400 hover:text-slate-700">Close</button>
        </div>
        {loadError && <ErrorBanner message={loadError} />}
        {!row ? (
          <div className="space-y-3 px-6 py-6"><div className="skeleton h-9" /><div className="skeleton h-9" /><div className="skeleton h-9" /></div>
        ) : (
          <FormShell onCancel={onClose} onSubmit={submit} submitting={submitting} error={saveError}>
            {kind === 'po' && (
              <>
                <FieldInput label="PO Number" value={form.po_number ?? ''} onChange={set('po_number')} />
                <FieldInput label="PO Date" type="date" value={form.po_date ?? ''} onChange={set('po_date')} />
                <FieldInput label="Scope Description" value={form.scope_description ?? ''} onChange={set('scope_description')} full />
                <FieldInput label="Taxable Value" type="number" value={form.taxable_value ?? ''} onChange={set('taxable_value')} />
                <FieldInput label="GST Amount" type="number" value={form.gst_amount ?? ''} onChange={set('gst_amount')} />
                <FieldInput label="Total Value (with GST)" type="number" value={form.total_value_with_gst ?? ''} onChange={set('total_value_with_gst')} />
                <FieldInput label="Advance %" type="number" value={form.advance_pct ?? ''} onChange={set('advance_pct')} />
                <FieldInput label="Retention %" type="number" value={form.retention_pct ?? ''} onChange={set('retention_pct')} />
                <FieldSelect label="Status" value={form.status ?? ''} onChange={set('status')} options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }]} />
              </>
            )}
            {kind === 'pi' && (
              <>
                <FieldInput label="PI Number" value={form.pi_number ?? ''} onChange={set('pi_number')} />
                <FieldInput label="PI Date" type="date" value={form.pi_date ?? ''} onChange={set('pi_date')} />
                <FieldInput label="Amount" type="number" value={form.amount ?? ''} onChange={set('amount')} />
                <FieldInput label="Submitted Date" type="date" value={form.submitted_date ?? ''} onChange={set('submitted_date')} />
                <FieldSelect label="Status" value={form.status ?? ''} onChange={set('status')} options={[
                  { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'revision_requested', label: 'Revision Requested' },
                  { value: 'approved', label: 'Approved' }, { value: 'converted_to_invoice', label: 'Converted to Invoice' },
                ]} />
                <FieldInput label="Subject" value={form.subject ?? ''} onChange={set('subject')} full />
                <FieldInput label="Work status / remarks" value={form.remarks ?? ''} onChange={set('remarks')} full />
              </>
            )}
            {kind === 'invoice' && (
              <>
                <FieldInput label="Invoice Number" value={form.invoice_number ?? ''} onChange={set('invoice_number')} />
                <FieldInput label="Invoice Date" type="date" value={form.invoice_date ?? ''} onChange={set('invoice_date')} />
                <FieldInput label="Taxable Value" type="number" value={form.taxable_value ?? ''} onChange={set('taxable_value')} />
                <FieldInput label="GST Amount" type="number" value={form.gst_amount ?? ''} onChange={set('gst_amount')} />
                <FieldInput label="Gross Invoice Value" type="number" value={form.gross_invoice_value ?? ''} onChange={set('gross_invoice_value')} />
                <FieldInput label="Due Date" type="date" value={form.due_date ?? ''} onChange={set('due_date')} />
                <FieldSelect label="Status" value={form.status ?? ''} onChange={set('status')} options={[
                  { value: 'draft', label: 'Draft' }, { value: 'issued', label: 'Issued' }, { value: 'partially_settled', label: 'Partially Settled' },
                  { value: 'fully_settled', label: 'Fully Settled' }, { value: 'disputed', label: 'Disputed' }, { value: 'cancelled', label: 'Cancelled' },
                ]} />
                <p className="col-span-2 font-sans text-xs text-red-600">Note: taxable value + GST must still equal the gross value (within a few paise), or the save will be rejected.</p>
              </>
            )}
            {kind === 'payment' && (
              <>
                <FieldInput label="Payment Date" type="date" value={form.payment_date ?? ''} onChange={set('payment_date')} />
                <FieldInput label="Amount Received" type="number" value={form.amount_received ?? ''} onChange={set('amount_received')} />
                <FieldSelect label="Mode" value={form.payment_mode ?? ''} onChange={set('payment_mode')} options={[
                  { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'other', label: 'Other' },
                ]} />
                <FieldSelect label="Type" value={form.payment_type ?? ''} onChange={set('payment_type')} options={[
                  { value: 'advance', label: 'Advance' }, { value: 'invoice_settlement', label: 'Invoice Settlement' }, { value: 'retention_release', label: 'Retention Release' }, { value: 'other', label: 'Other' },
                ]} />
                <FieldInput label="UTR / Reference" value={form.utr_or_reference ?? ''} onChange={set('utr_or_reference')} />
                <FieldInput label="Remarks" value={form.remarks ?? ''} onChange={set('remarks')} full />
              </>
            )}

            <div className="col-span-2 flex items-center justify-between gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
              <span className="font-sans text-xs text-slate-500">
                {row.document_id ? 'A file is already attached. Choosing a new one replaces it.' : 'No file attached yet.'}
              </span>
            </div>
            <FieldFile label={row.document_id ? 'Replace file (optional)' : 'Attach file (optional)'} onChange={setFile} />
          </FormShell>
        )}
      </div>
    </div>
  );
}

export default function SitePage() {
  return <Suspense fallback={null}><SitePageInner /></Suspense>;
}
