'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
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
import { uploadDocument } from '@/lib/documents';

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

  useEffect(() => {
    if (!clientId) { setSites([]); setSiteId(''); return; }
    supabase.from('site').select('*').eq('client_id', clientId).order('site_name').then(({ data, error }) => {
      if (error) setError(friendlyError(error)); else setSites(data as Site[]);
    });
  }, [clientId]);

  useEffect(() => {
    if (!siteId) { setSubProjects([]); setInvoices([]); return; }
    supabase.from('sub_project').select('*').eq('site_id', siteId).order('name').then(({ data }) => setSubProjects((data ?? []) as SubProject[]));
    supabase.from('purchase_order').select('*').eq('site_id', siteId).then(({ data }) => setPos((data ?? []) as PurchaseOrder[]));
    supabase.from('proforma_invoice').select('*').eq('site_id', siteId).then(({ data }) => setPis((data ?? []) as ProformaInvoice[]));
    loadInvoices();
  }, [siteId, subProjectId]);

  function loadInvoices() {
    let q = supabase.from('tax_invoice').select('*').eq('site_id', siteId);
    q = subProjectId ? q.eq('sub_project_id', subProjectId) : q;
    q.order('invoice_date', { ascending: false }).then(async ({ data, error }) => {
      if (error) { setError(friendlyError(error)); return; }
      const invs = data as TaxInvoice[];
      setInvoices(invs);
      if (invs.length > 0) {
        const ids = invs.map((i) => i.invoice_id);
        const { data: settleData } = await supabase.from('v_invoice_settlement').select('*').in('invoice_id', ids);
        const map: Record<string, InvoiceSettlementRow> = {};
        (settleData as InvoiceSettlementRow[] ?? []).forEach((r) => { map[r.invoice_id] = r; });
        setSettlement(map);

        const { data: dedData } = await supabase.from('deduction').select('*').in('invoice_id', ids);
        const dmap: Record<string, Deduction[]> = {};
        (dedData as Deduction[] ?? []).forEach((d) => {
          dmap[d.invoice_id] = [...(dmap[d.invoice_id] ?? []), d];
        });
        setDeductionsByInvoice(dmap);
      }
    });
  }

  const selectedSite = sites.find((s) => s.site_id === siteId);

  return (
    <div className="min-h-screen bg-[#F3F5F8]">
      <PageHeader title="Tax Invoices" subtitle="Every invoice's settlement status is calculated automatically from payments allocated and deductions recorded — never set by hand." />
      {error && <ErrorBanner message={error} />}

      <div className="px-8 py-6">
        <div className="mb-6 flex gap-4">
          <FieldSelect label="Client" value={clientId} onChange={setClientId} options={clients.map((c) => ({ value: c.client_id, label: c.display_name }))} />
          <FieldSelect label="Site" value={siteId} onChange={setSiteId} options={sites.map((s) => ({ value: s.site_id, label: s.site_name }))} />
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
                            className="rounded-md bg-[#1F3A52]/8 px-3 py-1 font-sans text-xs font-semibold text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white"
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
                              existing={deductionsByInvoice[inv.invoice_id] ?? []}
                              onSaved={loadInvoices}
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

  const gross = (Number(taxableValue) || 0) + (Number(gstAmount) || 0);
  const [poLeft, setPoLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!poId) { setPoLeft(null); return; }
    supabase.from('v_po_summary').select('yet_to_invoice').eq('po_id', poId).maybeSingle()
      .then(({ data }) => setPoLeft(data ? Number(data.yet_to_invoice) : null));
  }, [poId]);
  const overPo = poLeft !== null && gross > poLeft + 0.5;

  async function submit() {
    if (!invoiceNumber.trim() || !invoiceDate || !taxableValue) return;
    setSubmitting(true);
    setErr(null);
    let documentId: string | null = null;
    try { documentId = await uploadDocument(file, 'invoice'); } catch (e) { setErr((e as Error).message); setSubmitting(false); return; }
    const { data: inv, error } = await supabase.from('tax_invoice').insert({
      document_id: documentId,
      site_id: siteId,
      sub_project_id: subProjectId,
      po_id: poId || null,
      pi_id: piId || null,
      invoice_number: invoiceNumber.trim(),
      invoice_date: invoiceDate,
      taxable_value: Number(taxableValue),
      gst_amount: Number(gstAmount) || 0,
      gross_invoice_value: gross,
      status: 'issued',
    }).select().single();

    if (!error && inv && piId) {
      const { error: piErr } = await supabase.from('proforma_invoice').update({ status: 'converted_to_invoice', converted_invoice_id: inv.invoice_id }).eq('pi_id', piId);
      if (piErr) { setSubmitting(false); setErr(`Invoice saved, but PI link failed: ${piErr.message}`); return; }
    }
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="e.g. S5I/24-25/022" />
      <FieldInput label="Invoice Date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
      <FieldInput label="Taxable Value" type="number" value={taxableValue} onChange={setTaxableValue} />
      <FieldInput label="GST Amount" type="number" value={gstAmount} onChange={setGstAmount} />
      <FieldSelect label="Linked PO (optional)" value={poId} onChange={setPoId} options={pos.map((p) => ({ value: p.po_id, label: p.po_number }))} />
      <FieldSelect label="Linked PI (optional)" value={piId} onChange={setPiId} options={pis.map((p) => ({ value: p.pi_id, label: p.pi_number }))} />
      <FieldFile onChange={setFile} />
      <div className="col-span-2 font-mono text-sm text-[#1C1C1A]/60">Invoice total (taxable + GST): {formatINR(gross)}</div>
      {poLeft !== null && (
        <div className={`col-span-2 font-sans text-xs ${overPo ? 'text-[#A13D2B]' : 'text-[#1C1C1A]/50'}`}>
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
  existing,
  onSaved,
}: {
  invoiceId: string;
  existing: Deduction[];
  onSaved: () => void;
}) {
  const [type, setType] = useState<DeductionType | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dedErr, setDedErr] = useState<string | null>(null);

  async function submit() {
    if (!type || !amount) { setDedErr('Please choose the type and enter the amount.'); return; }
    setSubmitting(true);
    setDedErr(null);
    const { error: dedError } = await supabase.from('deduction').insert({
      invoice_id: invoiceId,
      deduction_type: type,
      amount: Number(amount),
      category_note: note.trim() || null,
      status: 'pending',
    });
    setSubmitting(false);
    if (dedError) { setDedErr(friendlyError(dedError)); return; }
    setType(''); setAmount(''); setNote('');
    onSaved();
  }

  return (
    <div className="border-t border-b border-[#1C1C1A]/10 bg-[#1C1C1A]/[0.02] px-6 py-4">
      {existing.length > 0 && (
        <div className="mb-3 space-y-1">
          {existing.map((d) => (
            <div key={d.deduction_id} className="flex justify-between font-mono text-xs">
              <span>{d.deduction_type.replace(/_/g, ' ')}{d.category_note ? ` — ${d.category_note}` : ''}</span>
              <span>{formatINR(d.amount)} · {d.status}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-3 items-end">
        <FieldSelect label="Type" value={type} onChange={(v) => setType(v as DeductionType)} options={DEDUCTION_TYPES} />
        <FieldInput label="Amount" type="number" value={amount} onChange={setAmount} />
        <FieldInput label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. Kitchen Carcase" />
        <button onClick={submit} disabled={submitting} className="bg-[#1F3A52] px-4 py-2 font-sans text-xs font-medium text-white hover:bg-[#1F3A52]/90 disabled:opacity-50">
          {submitting ? 'Saving…' : 'Add Deduction'}
        </button>
      </div>
      {dedErr && <div className="mt-2 font-sans text-sm text-[#A13D2B]">{dedErr}</div>}
    </div>
  );
}
