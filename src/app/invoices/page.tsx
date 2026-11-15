'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { check, invoiceInput, deductionInput } from '@/lib/validation';
import type { Client, Site, SubProject, PurchaseOrder, ProformaInvoice, TaxInvoice, Deduction, InvoiceSettlementRow, DeductionType } from '@/lib/types';
import { formatINR, formatDate } from '@/lib/format';
import {
  PageHeader,
  ErrorBanner,
  EmptyState,
  Panel,
  DataTable,
  Td,
  StatusBadge,
  FormShell,
  FieldInput,
  FieldSelect,
  FieldFile, buttonClass } from '@/lib/ui';
import { uploadDocument, discardDocument } from '@/lib/documents';

const DEDUCTION_TYPES: { value: DeductionType; label: string }[] = [
  { value: 'tds', label: 'Tax deducted by client (TDS)' },
  { value: 'gst_tds', label: 'GST tax deducted (GST-TDS)' },
  { value: 'retention', label: 'Held back for a set period (retention)' },
  { value: 'handover_hold', label: 'Held back until site handover' },
  { value: 'penalty', label: 'Penalty charged by client' },
  { value: 'discount', label: 'Discount given' },
  { value: 'other', label: 'Other' },
];

export default function InvoicesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [pis, setPis] = useState<ProformaInvoice[]>([]);
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [settlement, setSettlement] = useState<Record<string, InvoiceSettlementRow>>({});
  const [deductionsByInvoice, setDeductionsByInvoice] = useState<Record<string, Deduction[]>>({});

  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [subProjectId, setSubProjectId] = useState('');
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [deductionFormInvoiceId, setDeductionFormInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('client').select('*').order('display_name').then(({ data, error }) => {
      if (error) setError(friendlyError(error)); else setClients(data as Client[]);
    });
  }, []);

  // Choosing a client or site resets everything that depended on the old one, so nothing can be
  // saved against a site that is no longer selected.
  function chooseClient(id: string) {
    setClientId(id);
    setSites([]);
    chooseSite('');
  }
  function chooseSite(id: string) {
    setSiteId(id);
    setSubProjectId('');
    setSubProjects([]); setPos([]); setPis([]);
    setInvoices([]); setSettlement({}); setDeductionsByInvoice({});
    setShowNewInvoice(false); setDeductionFormInvoiceId(null);
  }

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    supabase.from('site').select('*').eq('client_id', clientId).order('site_name').then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(friendlyError(error)); else setSites(data as Site[]);
    });
    return () => { alive = false; };
  }, [clientId]);

  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    Promise.all([
      supabase.from('sub_project').select('*').eq('site_id', siteId).order('name'),
      supabase.from('purchase_order').select('*').eq('site_id', siteId).order('po_date'),
      supabase.from('proforma_invoice').select('*').eq('site_id', siteId).order('pi_date'),
    ]).then(([sp, po, pi]) => {
      if (!alive) return;
      const failed = [sp, po, pi].find((r) => r.error);
      if (failed?.error) { setError(friendlyError(failed.error)); return; }
      setSubProjects((sp.data ?? []) as SubProject[]);
      setPos((po.data ?? []) as PurchaseOrder[]);
      setPis((pi.data ?? []) as ProformaInvoice[]);
    });
    return () => { alive = false; };
  }, [siteId]);

  // Each load gets a number; a reply to an older load (an earlier site) is ignored.
  const loadSeq = useRef(0);
  async function loadInvoices(forSite = siteId, forSub = subProjectId) {
    const seq = ++loadSeq.current;
    if (!forSite) return;
    let q = supabase.from('tax_invoice').select('*').eq('site_id', forSite);
    q = forSub ? q.eq('sub_project_id', forSub) : q;
    const { data, error } = await q.order('invoice_date', { ascending: false });
    if (seq !== loadSeq.current) return;
    if (error) { setError(friendlyError(error)); return; }
    const invs = data as TaxInvoice[];
    const ids = invs.map((i) => i.invoice_id);
    const [settleRes, dedRes] = ids.length
      ? await Promise.all([
          supabase.from('v_invoice_settlement').select('*').in('invoice_id', ids),
          supabase.from('deduction').select('*').in('invoice_id', ids),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (seq !== loadSeq.current) return;
    if (settleRes.error || dedRes.error) { setError(friendlyError(settleRes.error ?? dedRes.error)); return; }
    const map: Record<string, InvoiceSettlementRow> = {};
    ((settleRes.data ?? []) as InvoiceSettlementRow[]).forEach((r) => { map[r.invoice_id] = r; });
    const dmap: Record<string, Deduction[]> = {};
    ((dedRes.data ?? []) as Deduction[]).forEach((d) => { dmap[d.invoice_id] = [...(dmap[d.invoice_id] ?? []), d]; });
    setInvoices(invs);
    setSettlement(map);
    setDeductionsByInvoice(dmap);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data for the chosen site is this effect's job
    loadInvoices(siteId, subProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, subProjectId]);

  const selectedSite = sites.find((s) => s.site_id === siteId);

  return (
    <div className="pb-12">
      <PageHeader title="Tax invoices" subtitle="Settlement status is worked out from payments and deductions." />
      {error && <ErrorBanner message={error} />}

      <div className="px-6 py-6 lg:px-8">
        <div className="card mb-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <FieldSelect label="Client" value={clientId} onChange={chooseClient} options={clients.map((c) => ({ value: c.client_id, label: c.display_name }))} />
          <FieldSelect label="Site" value={siteId} onChange={chooseSite} options={sites.map((s) => ({ value: s.site_id, label: s.site_name }))} />
          {selectedSite?.has_sub_projects && (
            <FieldSelect label="Sub-Project (optional)" value={subProjectId} onChange={setSubProjectId} options={subProjects.map((sp) => ({ value: sp.sub_project_id, label: sp.name }))} />
          )}
        </div>

        {!siteId ? (
          <EmptyState text="Pick a client and site to see or add invoices." />
        ) : (
          <Panel
            title={`Invoices (${invoices.length})`}
            action={
              <button onClick={() => setShowNewInvoice(true)} className={buttonClass}>
                + Add Invoice
              </button>
            }
          >
            {showNewInvoice && (
              <NewInvoiceForm
                siteId={siteId}
                subProjectId={subProjectId || null}
                pos={pos}
                pis={pis}
                onCancel={() => setShowNewInvoice(false)}
                onCreated={() => { setShowNewInvoice(false); loadInvoices(); }}
              />
            )}
            {invoices.length === 0 ? (
              <EmptyState text="No invoices recorded yet." />
            ) : (
              <DataTable columns={[{ label: 'Invoice No.' }, { label: 'Date' }, { label: 'Gross Value', align: 'right' }, { label: 'Settled', align: 'right' }, { label: 'Balance', align: 'right' }, { label: 'Status' }, { label: '' }]}>
                {invoices.map((inv) => {
                  const s = settlement[inv.invoice_id];
                  const dCount = deductionsByInvoice[inv.invoice_id]?.length ?? 0;
                  return (
                    <React.Fragment key={inv.invoice_id}>
                      <tr>
                        <Td>{inv.invoice_number}</Td>
                        <Td>{formatDate(inv.invoice_date)}</Td>
                        <Td align="right" mono>{formatINR(inv.gross_invoice_value)}</Td>
                        <Td align="right" mono>{formatINR(s?.total_settled ?? 0)}</Td>
                        <Td align="right" mono>{formatINR(s?.remaining_balance ?? inv.gross_invoice_value)}</Td>
                        <Td><StatusBadge status={s?.computed_status ?? inv.status} /></Td>
                        <Td>
                          <button
                            onClick={() => setDeductionFormInvoiceId(deductionFormInvoiceId === inv.invoice_id ? null : inv.invoice_id)}
                            className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                          >
                            {dCount > 0 ? `${dCount} deduction${dCount > 1 ? 's' : ''}` : '+ Deduction'}
                          </button>
                        </Td>
                      </tr>
                      {deductionFormInvoiceId === inv.invoice_id && (
                        <tr>
                          <td colSpan={7}>
                            <DeductionPanel
                              invoiceId={inv.invoice_id}
                              invoiceDate={inv.invoice_date}
                              existing={deductionsByInvoice[inv.invoice_id] ?? []}
                              onSaved={() => loadInvoices()}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </DataTable>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}

function NewInvoiceForm({
  siteId,
  subProjectId,
  pos,
  pis,
  onCancel,
  onCreated,
}: {
  siteId: string;
  subProjectId: string | null;
  pos: PurchaseOrder[];
  pis: ProformaInvoice[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [taxableValue, setTaxableValue] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [poId, setPoId] = useState('');
  const [piId, setPiId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // GST rule (decision 0004) and the shared checks: blank GST is refused here (there is no total to work it out from).
  const checked = check(invoiceInput, { invoice_number: invoiceNumber, invoice_date: invoiceDate, taxable_value: taxableValue, gst_amount: gstAmount, total: '' });
  const gross = checked.ok ? checked.data.gross_invoice_value : (Number(taxableValue) || 0) + (Number(gstAmount) || 0);
  // "Left to bill" for the chosen PO; kept with the PO it belongs to, so a stale figure never shows.
  const [poLeftFor, setPoLeftFor] = useState<{ poId: string; left: number | null }>({ poId: '', left: null });
  useEffect(() => {
    if (!poId) return;
    let alive = true;
    supabase.from('v_po_summary').select('yet_to_invoice').eq('po_id', poId).maybeSingle()
      .then(({ data, error }) => { if (alive && !error) setPoLeftFor({ poId, left: data ? Number(data.yet_to_invoice) : null }); });
    return () => { alive = false; };
  }, [poId]);
  const poLeft = poId && poLeftFor.poId === poId ? poLeftFor.left : null;
  const overPo = poLeft !== null && gross > poLeft + 0.5;

  async function submit() {
    if (!checked.ok) { setErr(checked.error); return; }
    const v = checked.data;
    setSubmitting(true);
    setErr(null);
    let documentId: string | null = null;
    try { documentId = await uploadDocument(file, 'invoice'); } catch (e) { setErr((e as Error).message); setSubmitting(false); return; }
    const { error } = await supabase.rpc('record_tax_invoice', {
      p_site_id: siteId,
      p_sub_project_id: subProjectId,
      p_po_id: poId || null,
      p_pi_id: piId || null,
      p_invoice_number: v.invoice_number,
      p_invoice_date: v.invoice_date,
      p_taxable: v.taxable_value,
      p_gst: v.gst_amount,
      p_gross: v.gross_invoice_value,
      p_document_id: documentId,
    });
    setSubmitting(false);
    if (error) { await discardDocument(documentId); setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="e.g. S5I/24-25/022" />
      <FieldInput label="Invoice Date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
      <FieldInput label="Taxable Value" type="number" value={taxableValue} onChange={setTaxableValue} />
      <FieldInput label="GST Amount (0 if none)" type="number" value={gstAmount} onChange={setGstAmount} />
      <FieldSelect label="Linked PO (optional)" value={poId} onChange={setPoId} options={pos.map((p) => ({ value: p.po_id, label: p.po_number }))} />
      <FieldSelect label="Linked PI (optional)" value={piId} onChange={setPiId} options={pis.map((p) => ({ value: p.pi_id, label: p.pi_number }))} />
      <FieldFile onChange={setFile} />
      <div className="col-span-2 font-mono text-sm text-slate-500">Invoice total (taxable + GST): {formatINR(gross)}</div>
      {poLeft !== null && (
        <div className={`col-span-2 font-sans text-xs ${overPo ? 'text-red-600' : 'text-slate-400'}`}>
          {overPo
            ? `Careful: this invoice is ${formatINR(gross - poLeft)} MORE than what is left to bill on this PO (${formatINR(poLeft)} left). Check the amount, or that it is the right PO.`
            : `${formatINR(poLeft)} is still left to bill on this PO; after this invoice ${formatINR(poLeft - gross)} will be left.`}
        </div>
      )}
    </FormShell>
  );
}

function DeductionPanel({
  invoiceId,
  invoiceDate,
  existing,
  onSaved,
}: {
  invoiceId: string;
  invoiceDate: string;
  existing: Deduction[];
  onSaved: () => void;
}) {
  const [type, setType] = useState<DeductionType | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dedErr, setDedErr] = useState<string | null>(null);

  async function submit() {
    const c = check(deductionInput, { deduction_type: type, amount });
    if (!c.ok) { setDedErr(c.error); return; }
    setSubmitting(true);
    setDedErr(null);
    const { error: dedError } = await supabase.from('deduction').insert({
      invoice_id: invoiceId,
      deduction_type: c.data.deduction_type,
      amount: c.data.amount,
      category_note: note.trim() || null,
      status: 'pending',
      // Dated like the invoice, so TDS lands in the invoice's financial year (decision 0007).
      deduction_date: invoiceDate,
    });
    setSubmitting(false);
    if (dedError) { setDedErr(friendlyError(dedError)); return; }
    setType(''); setAmount(''); setNote('');
    onSaved();
  }

  // Retention / handover holds: once the client pays the held money, mark it released so the
  // release payment can be matched to this invoice (decision 0005).
  const [releasing, setReleasing] = useState<string | null>(null);
  async function release(d: Deduction) {
    if (!window.confirm(`Mark ${formatINR(d.amount)} held back as released? Do this when the client has paid (or is paying) the held amount.`)) return;
    setReleasing(d.deduction_id);
    setDedErr(null);
    const { error: relError } = await supabase.from('deduction').update({ status: 'released' }).eq('deduction_id', d.deduction_id);
    setReleasing(null);
    if (relError) { setDedErr(friendlyError(relError)); return; }
    onSaved();
  }
  const isHold = (d: Deduction) => d.deduction_type === 'retention' || d.deduction_type === 'handover_hold';

  return (
    <div className="border-t border-b border-slate-100 bg-slate-50 px-6 py-4">
      {existing.length > 0 && (
        <div className="mb-3 space-y-1">
          {existing.map((d) => (
            <div key={d.deduction_id} className="flex justify-between font-mono text-xs">
              <span>{d.deduction_type.replace(/_/g, ' ')}{d.category_note ? ` — ${d.category_note}` : ''}</span>
              <span className="flex items-center gap-2">
                {formatINR(d.amount)} · {d.status}
                {isHold(d) && d.status === 'pending' && (
                  <button onClick={() => release(d)} disabled={releasing === d.deduction_id}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 font-sans text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                    {releasing === d.deduction_id ? 'Saving…' : 'Mark released'}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-3 items-end">
        <FieldSelect label="Type" value={type} onChange={(v) => setType(v as DeductionType)} options={DEDUCTION_TYPES} />
        <FieldInput label="Amount" type="number" value={amount} onChange={setAmount} />
        <FieldInput label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. Kitchen Carcase" />
        <button onClick={submit} disabled={submitting} className="bg-slate-900 px-4 py-2 font-sans text-xs font-medium text-white hover:bg-slate-900/90 disabled:opacity-50">
          {submitting ? 'Saving…' : 'Add Deduction'}
        </button>
      </div>
      {dedErr && <div className="mt-2 font-sans text-sm text-red-600">{dedErr}</div>}
    </div>
  );
}
