'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
} from '@/lib/ui';

const DEDUCTION_TYPES: { value: DeductionType; label: string }[] = [
  { value: 'tds', label: 'TDS' },
  { value: 'gst_tds', label: 'GST-TDS' },
  { value: 'retention', label: 'Retention' },
  { value: 'handover_hold', label: 'Handover Hold' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'discount', label: 'Discount' },
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
      if (error) setError(error.message); else setClients(data as Client[]);
    });
  }, []);

  useEffect(() => {
    if (!clientId) { setSites([]); setSiteId(''); return; }
    supabase.from('site').select('*').eq('client_id', clientId).order('site_name').then(({ data, error }) => {
      if (error) setError(error.message); else setSites(data as Site[]);
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
      if (error) { setError(error.message); return; }
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
    <div className="min-h-screen bg-[#FAFAF8]">
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
              <button onClick={() => setShowNewInvoice(true)} className="border border-[#1F3A52] px-3 py-1.5 font-sans text-xs font-medium text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white">
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
                            className="font-sans text-xs text-[#1F3A52] underline"
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
  const [submitting, setSubmitting] = useState(false);

  const gross = (Number(taxableValue) || 0) + (Number(gstAmount) || 0);

  async function submit() {
    if (!invoiceNumber.trim() || !invoiceDate || !taxableValue) return;
    setSubmitting(true);
    const { data: inv, error } = await supabase.from('tax_invoice').insert({
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
      await supabase.from('proforma_invoice').update({ status: 'converted_to_invoice', converted_invoice_id: inv.invoice_id }).eq('pi_id', piId);
    }
    setSubmitting(false);
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting}>
      <FieldInput label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="e.g. S5I/24-25/022" />
      <FieldInput label="Invoice Date" type="date" value={invoiceDate} onChange={setInvoiceDate} />
      <FieldInput label="Taxable Value" type="number" value={taxableValue} onChange={setTaxableValue} />
      <FieldInput label="GST Amount" type="number" value={gstAmount} onChange={setGstAmount} />
      <FieldSelect label="Linked PO (optional)" value={poId} onChange={setPoId} options={pos.map((p) => ({ value: p.po_id, label: p.po_number }))} />
      <FieldSelect label="Linked PI (optional)" value={piId} onChange={setPiId} options={pis.map((p) => ({ value: p.pi_id, label: p.pi_number }))} />
      <div className="col-span-2 font-mono text-sm text-[#1C1C1A]/60">Gross value: {formatINR(gross)}</div>
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

  async function submit() {
    if (!type || !amount) return;
    setSubmitting(true);
    await supabase.from('deduction').insert({
      invoice_id: invoiceId,
      deduction_type: type,
      amount: Number(amount),
      category_note: note.trim() || null,
      status: 'pending',
    });
    setSubmitting(false);
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
    </div>
  );
}
