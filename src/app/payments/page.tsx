'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import type { Client, Site, Payment, InvoiceSettlementRow, PaymentType, PaymentMode } from '@/lib/types';
import { formatINR, formatDate } from '@/lib/format';
import {
  PageHeader,
  ErrorBanner,
  EmptyState,
  Panel,
  DataTable,
  Td,
  FormShell,
  FieldInput,
  FieldSelect,
  FieldFile, buttonClass } from '@/lib/ui';
import { uploadDocument, discardDocument } from '@/lib/documents';

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: 'advance', label: 'Advance' },
  { value: 'invoice_settlement', label: 'Invoice Settlement' },
  { value: 'retention_release', label: 'Retention Release' },
  { value: 'other', label: 'Other' },
];
const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export default function PaymentsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unallocated, setUnallocated] = useState<Record<string, number>>({});
  const [openInvoices, setOpenInvoices] = useState<InvoiceSettlementRow[]>([]);

  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [allocatingPaymentId, setAllocatingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('client').select('*').order('display_name').then(({ data, error }) => {
      if (error) setError(friendlyError(error)); else setClients(data as Client[]);
    });
  }, []);

  useEffect(() => {
    if (!clientId) { setSites([]); setSiteId(''); return; }
    supabase.from('site').select('*').eq('client_id', clientId).order('site_name').then(({ data }) => setSites((data ?? []) as Site[]));
  }, [clientId]);

  useEffect(() => {
    if (!siteId) { setPayments([]); setOpenInvoices([]); return; }
    loadPayments();
    loadOpenInvoices();
  }, [siteId]);

  function loadPayments() {
    supabase.from('payment').select('*').eq('site_id', siteId).order('payment_date', { ascending: false }).then(async ({ data, error }) => {
      if (error) { setError(friendlyError(error)); return; }
      const pays = data as Payment[];
      setPayments(pays);
      if (pays.length > 0) {
        const { data: unallocData } = await supabase.from('v_unallocated_payments').select('*').in('payment_id', pays.map((p) => p.payment_id));
        const map: Record<string, number> = {};
        (unallocData as any[] ?? []).forEach((u) => { map[u.payment_id] = u.unallocated_amount; });
        setUnallocated(map);
      }
    });
  }

  function loadOpenInvoices() {
    supabase.from('v_invoice_settlement').select('*').eq('site_id', siteId).gt('remaining_balance', 0).then(({ data, error }) => {
      if (error) setError(friendlyError(error)); else setOpenInvoices(data as InvoiceSettlementRow[]);
    });
  }

  return (
    <div className="min-h-screen bg-[#F3F5F8]">
      <PageHeader title="Payments" subtitle="Record what actually arrived, then allocate it across whichever invoices it settles — one payment can cover several invoices at once." />
      {error && <ErrorBanner message={error} />}

      <div className="px-8 py-6">
        <div className="mb-6 flex gap-4">
          <FieldSelect label="Client" value={clientId} onChange={setClientId} options={clients.map((c) => ({ value: c.client_id, label: c.display_name }))} />
          <FieldSelect label="Site" value={siteId} onChange={setSiteId} options={sites.map((s) => ({ value: s.site_id, label: s.site_name }))} />
        </div>

        {!siteId ? (
          <EmptyState text="Pick a client and site to record or review payments." />
        ) : (
          <Panel
            title={`Payments (${payments.length})`}
            action={
              <button onClick={() => setShowNewPayment(true)} className={buttonClass}>
                + Record Payment
              </button>
            }
          >
            {showNewPayment && (
              <NewPaymentForm
                siteId={siteId}
                onCancel={() => setShowNewPayment(false)}
                onCreated={() => { setShowNewPayment(false); loadPayments(); loadOpenInvoices(); }}
              />
            )}
            <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-2.5 font-sans text-xs leading-relaxed text-slate-500">
              <b className="text-[#A13D2B]">Needs matching</b> = money received that has not been tied to an invoice yet. &nbsp;
              <b className="text-[#2F6E8E]">Advance in hand</b> = advance money waiting for the client&apos;s invoices; nothing to do until you raise them.
            </div>
            {payments.length === 0 ? (
              <EmptyState text="No payments recorded yet." />
            ) : (
              <DataTable columns={[{ label: 'Date' }, { label: 'Type' }, { label: 'Mode' }, { label: 'Amount', align: 'right' }, { label: 'Not yet matched to an invoice', align: 'right' }, { label: '' }]}>
                {payments.map((p) => {
                  const unalloc = unallocated[p.payment_id] ?? 0;
                  return (
                    <tr key={p.payment_id}>
                      <Td>{formatDate(p.payment_date)}</Td>
                      <Td>{p.payment_type.replace(/_/g, ' ')}</Td>
                      <Td>{p.payment_mode.replace(/_/g, ' ')}</Td>
                      <Td align="right" mono>{formatINR(p.amount_received)}</Td>
                      <Td align="right" mono>
                        {unalloc <= 0.005 ? (
                          <span className="text-slate-400">{formatINR(0)}</span>
                        ) : p.payment_type === 'advance' ? (
                          <span title="Advance money is kept until the client's invoices come. Nothing to do now." className="text-[#2F6E8E]">{formatINR(unalloc)}<span className="ml-1 font-sans text-[10px] font-semibold uppercase tracking-wider">advance in hand</span></span>
                        ) : (
                          <span title="Money received but not yet matched to an invoice" className="text-[#A13D2B]">{formatINR(unalloc)}<span className="ml-1 font-sans text-[10px] font-semibold uppercase tracking-wider">needs matching</span></span>
                        )}
                      </Td>
                      <Td>
                        <button
                          onClick={() => setAllocatingPaymentId(allocatingPaymentId === p.payment_id ? null : p.payment_id)}
                          className="rounded-md bg-[#1F3A52]/8 px-3 py-1 font-sans text-xs font-semibold text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white"
                        >
                          Match to invoice
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Panel>
        )}

        {allocatingPaymentId && (
          <AllocationDrawer
            payment={payments.find((p) => p.payment_id === allocatingPaymentId)!}
            unallocatedAmount={unallocated[allocatingPaymentId] ?? 0}
            openInvoices={openInvoices}
            onClose={() => setAllocatingPaymentId(null)}
            onAllocated={() => { loadPayments(); loadOpenInvoices(); }}
          />
        )}
      </div>
    </div>
  );
}

function NewPaymentForm({
  siteId,
  onCancel,
  onCreated,
}: {
  siteId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<PaymentType>('invoice_settlement');
  const [mode, setMode] = useState<PaymentMode>('bank_transfer');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [poId, setPoId] = useState('');
  const [pos, setPos] = useState<{ po_id: string; po_number: string }[]>([]);
  const [open, setOpen] = useState<InvoiceSettlementRow[]>([]);
  const [match, setMatch] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('purchase_order').select('po_id, po_number').eq('site_id', siteId).order('po_date').then(({ data }) => setPos((data ?? []) as { po_id: string; po_number: string }[]));
    supabase.from('v_invoice_settlement').select('*').eq('site_id', siteId).gt('remaining_balance', 0.5).order('invoice_number')
      .then(({ data }) => setOpen((data ?? []) as InvoiceSettlementRow[]));
  }, [siteId]);

  const total = Number(amount) || 0;
  const matched = Object.values(match).reduce((s, v) => s + (Number(v) || 0), 0);
  const left = total - matched;

  async function submit() {
    if (!date || !amount) { setErr('Please enter the date and the amount received.'); return; }
    if (left < -0.005) { setErr('You have matched more than the amount received. Please reduce the amounts matched to invoices.'); return; }
    setSubmitting(true);
    setErr(null);
    let documentId: string | null = null;
    try { documentId = await uploadDocument(file, 'payment_advice'); } catch (e) { setErr((e as Error).message); setSubmitting(false); return; }
    const allocations = Object.entries(match)
      .filter(([, v]) => Number(v) > 0)
      .map(([invoice_id, v]) => ({ invoice_id, amount: Number(v) }));
    // one all-or-nothing database call: the payment and every match are saved together, or none of them are
    const { error } = await supabase.rpc('record_payment', {
      p_site_id: siteId,
      p_po_id: poId || null,
      p_date: date,
      p_amount: Number(amount),
      p_type: type,
      p_mode: mode,
      p_reference: reference,
      p_remarks: remarks,
      p_document_id: documentId,
      p_allocations: allocations,
    });
    setSubmitting(false);
    if (error) { await discardDocument(documentId); setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput label="Payment Date" type="date" value={date} onChange={setDate} />
      <FieldInput label="Amount Received" type="number" value={amount} onChange={setAmount} />
      <FieldSelect label="Payment Type" value={type} onChange={(v) => setType(v as PaymentType)} options={PAYMENT_TYPES} />
      <FieldSelect label="Mode" value={mode} onChange={(v) => setMode(v as PaymentMode)} options={PAYMENT_MODES} />
      <FieldSelect label="Received against PO (optional)" value={poId} onChange={setPoId} options={pos.map((p) => ({ value: p.po_id, label: p.po_number }))} full />
      <FieldInput label="UTR / Reference (optional)" value={reference} onChange={setReference} />
      <FieldInput label="Remarks (optional)" value={remarks} onChange={setRemarks} placeholder="e.g. T-B,C,S1 (Inv. 022,024,025 & 027)" full />
      <FieldFile onChange={setFile} label="Payment advice (optional)" />

      {open.length > 0 && (
        <div className="col-span-2 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <div className="font-sans text-xs font-semibold text-slate-700">Which invoices did this money pay? (optional)</div>
            <div className="font-sans text-[11px] text-slate-400">You can match it now or later. It is saved together with the payment, so it never ends up half-done.</div>
          </div>
          <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto">
            {open.map((inv) => (
              <div key={inv.invoice_id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="font-sans text-sm text-slate-800">{inv.invoice_number}
                  <span className="ml-2 font-mono text-xs text-slate-400">still to pay {formatINR(inv.remaining_balance)}</span>
                </div>
                <input
                  type="number" min="0" step="0.01" placeholder="0"
                  value={match[inv.invoice_id] ?? ''}
                  onChange={(e) => setMatch({ ...match, [inv.invoice_id]: e.target.value })}
                  className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right font-mono text-sm outline-none focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15"
                />
              </div>
            ))}
          </div>
          <div className={`border-t border-slate-100 px-4 py-2 font-mono text-xs ${left < -0.005 ? 'text-[#A13D2B]' : 'text-slate-500'}`}>
            {left < -0.005
              ? `Matched ${formatINR(matched)} is MORE than received ${formatINR(total)}`
              : `Matched ${formatINR(matched)} · left unmatched ${formatINR(Math.max(left, 0))}`}
          </div>
        </div>
      )}
    </FormShell>
  );
}

function AllocationDrawer({
  payment,
  unallocatedAmount,
  openInvoices,
  onClose,
  onAllocated,
}: {
  payment: Payment;
  unallocatedAmount: number;
  openInvoices: InvoiceSettlementRow[];
  onClose: () => void;
  onAllocated: () => void;
}) {
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalEntered = Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0);
  const remaining = unallocatedAmount - totalEntered;

  async function submit() {
    setSubmitting(true);
    const rows = Object.entries(allocations)
      .filter(([, v]) => Number(v) > 0)
      .map(([invoice_id, v]) => ({
        payment_id: payment.payment_id,
        invoice_id,
        amount_allocated: Number(v),
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from('payment_allocation').insert(rows);
      if (error) { setSubmitting(false); setSaveError(friendlyError(error)); return; }
    }
    setSubmitting(false);
    onAllocated();
    onClose();
  }

  return (
    <div className="mt-6 border border-[#1F3A52]/30 bg-white">
      <div className="flex items-center justify-between border-b border-[#1C1C1A]/10 px-6 py-4">
        <div>
          <h3 className="font-sans text-sm font-medium">
            Allocating {formatINR(payment.amount_received)} from {formatDate(payment.payment_date)}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-[#1C1C1A]/50">
            Unallocated: {formatINR(unallocatedAmount)} · Remaining after this: {formatINR(remaining)}
          </p>
        </div>
        <button onClick={onClose} className="font-sans text-xs text-[#1C1C1A]/50">Close</button>
      </div>

      {openInvoices.length === 0 ? (
        <EmptyState text="No open invoices with a remaining balance at this site." />
      ) : (
        <DataTable columns={[{ label: 'Invoice' }, { label: 'Balance', align: 'right' }, { label: 'Allocate', align: 'right' }]}>
          {openInvoices.map((inv) => (
            <tr key={inv.invoice_id}>
              <Td>{inv.invoice_number}</Td>
              <Td align="right" mono>{formatINR(inv.remaining_balance)}</Td>
              <Td align="right">
                <input
                  type="number"
                  value={allocations[inv.invoice_id] ?? ''}
                  onChange={(e) => setAllocations({ ...allocations, [inv.invoice_id]: e.target.value })}
                  placeholder="0"
                  className="w-28 border border-[#1C1C1A]/15 px-2 py-1 text-right font-mono text-sm outline-none focus:border-[#1F3A52]"
                />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}

      <div className="flex items-center justify-between border-t border-[#1C1C1A]/10 px-6 py-4">
        {saveError && <span className="font-sans text-sm text-[#A13D2B]">{saveError}</span>}
        <span className={`font-mono text-xs ${remaining < 0 ? 'text-[#A13D2B]' : 'text-[#1C1C1A]/50'}`}>
          {remaining < 0 ? 'Allocation exceeds unallocated amount' : `${formatINR(remaining)} will remain unallocated`}
        </span>
        <button
          onClick={submit}
          disabled={submitting || totalEntered === 0 || remaining < 0}
          className="bg-[#1F3A52] px-4 py-2 font-sans text-xs font-medium text-white hover:bg-[#1F3A52]/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save Allocation'}
        </button>
      </div>
    </div>
  );
}
