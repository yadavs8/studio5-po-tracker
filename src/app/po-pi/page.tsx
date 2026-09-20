'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import type { Client, Site, SubProject, PurchaseOrder, ProformaInvoice } from '@/lib/types';
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

export default function PoPiPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [pis, setPis] = useState<ProformaInvoice[]>([]);

  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [subProjectId, setSubProjectId] = useState('');

  const [showNewPo, setShowNewPo] = useState(false);
  const [showNewPi, setShowNewPi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('client').select('*').order('display_name').then(({ data, error }) => {
      if (error) setError(friendlyError(error));
      else setClients(data as Client[]);
    });
  }, []);

  useEffect(() => {
    if (!clientId) { setSites([]); setSiteId(''); return; }
    supabase.from('site').select('*').eq('client_id', clientId).order('site_name').then(({ data, error }) => {
      if (error) setError(friendlyError(error));
      else setSites(data as Site[]);
    });
  }, [clientId]);

  useEffect(() => {
    if (!siteId) { setSubProjects([]); setSubProjectId(''); setPos([]); setPis([]); return; }
    loadSubProjects();
    loadPos();
    loadPis();
  }, [siteId]);

  useEffect(() => {
    if (siteId) { loadPos(); loadPis(); }
  }, [subProjectId]);

  function loadSubProjects() {
    supabase.from('sub_project').select('*').eq('site_id', siteId).order('name').then(({ data, error }) => {
      if (error) setError(friendlyError(error));
      else setSubProjects(data as SubProject[]);
    });
  }

  function loadPos() {
    let q = supabase.from('purchase_order').select('*').eq('site_id', siteId);
    q = subProjectId ? q.eq('sub_project_id', subProjectId) : q;
    q.order('po_date', { ascending: false }).then(({ data, error }) => {
      if (error) setError(friendlyError(error));
      else setPos(data as PurchaseOrder[]);
    });
  }

  function loadPis() {
    let q = supabase.from('proforma_invoice').select('*').eq('site_id', siteId);
    q = subProjectId ? q.eq('sub_project_id', subProjectId) : q;
    q.order('pi_date', { ascending: false }).then(({ data, error }) => {
      if (error) setError(friendlyError(error));
      else setPis(data as ProformaInvoice[]);
    });
  }

  const selectedSite = sites.find((s) => s.site_id === siteId);

  return (
    <div className="min-h-screen bg-[#F3F5F8]">
      <PageHeader title="Purchase Orders & Proforma Invoices" subtitle="The commercial commitment (PO) and the commercial proposal (PI) — tracked separately, linked when a PI becomes billable." />
      {error && <ErrorBanner message={error} />}

      <div className="px-8 py-6">
        {/* SELECTOR ROW */}
        <div className="mb-6 flex gap-4">
          <FieldSelect
            label="Client"
            value={clientId}
            onChange={setClientId}
            options={clients.map((c) => ({ value: c.client_id, label: c.display_name }))}
          />
          <FieldSelect
            label="Site"
            value={siteId}
            onChange={setSiteId}
            options={sites.map((s) => ({ value: s.site_id, label: s.site_name }))}
          />
          {selectedSite?.has_sub_projects && (
            <FieldSelect
              label="Sub-Project (optional)"
              value={subProjectId}
              onChange={setSubProjectId}
              options={subProjects.map((sp) => ({ value: sp.sub_project_id, label: sp.name }))}
            />
          )}
        </div>

        {!siteId ? (
          <EmptyState text="Pick a client and site above to see or add its POs and PIs." />
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* PURCHASE ORDERS */}
            <Panel
              title={`Purchase Orders (${pos.length})`}
              action={
                <button onClick={() => setShowNewPo(true)} className={buttonClass}>
                  + Add PO
                </button>
              }
            >
              {showNewPo && (
                <NewPoForm
                  siteId={siteId}
                  subProjectId={subProjectId || null}
                  onCancel={() => setShowNewPo(false)}
                  onCreated={() => { setShowNewPo(false); loadPos(); }}
                />
              )}
              {pos.length === 0 ? (
                <EmptyState text="No POs recorded yet." />
              ) : (
                <DataTable columns={[{ label: 'PO No.' }, { label: 'Date' }, { label: 'Value', align: 'right' }, { label: 'Status' }]}>
                  {pos.map((po) => (
                    <tr key={po.po_id}>
                      <Td>{po.po_number}</Td>
                      <Td>{formatDate(po.po_date)}</Td>
                      <Td align="right" mono>{formatINR(po.total_value_with_gst)}</Td>
                      <Td><StatusBadge status={po.status} /></Td>
                    </tr>
                  ))}
                </DataTable>
              )}
              {pos.length > 0 && (
                <div className="border-t border-[#1C1C1A]/10 px-4 py-2.5 text-right font-mono text-sm font-medium">
                  Total: {formatINR(pos.reduce((s, p) => s + Number(p.total_value_with_gst), 0))}
                </div>
              )}
            </Panel>

            {/* PROFORMA INVOICES */}
            <Panel
              title={`Proforma Invoices (${pis.length})`}
              action={
                <button onClick={() => setShowNewPi(true)} className={buttonClass}>
                  + Add PI
                </button>
              }
            >
              {showNewPi && (
                <NewPiForm
                  siteId={siteId}
                  subProjectId={subProjectId || null}
                  pos={pos}
                  onCancel={() => setShowNewPi(false)}
                  onCreated={() => { setShowNewPi(false); loadPis(); }}
                />
              )}
              {pis.length === 0 ? (
                <EmptyState text="No PIs recorded yet." />
              ) : (
                <DataTable columns={[{ label: 'PI No.' }, { label: 'Date' }, { label: 'Amount', align: 'right' }, { label: 'Status' }]}>
                  {pis.map((pi) => (
                    <tr key={pi.pi_id}>
                      <Td>{pi.pi_number}</Td>
                      <Td>{formatDate(pi.pi_date)}</Td>
                      <Td align="right" mono>{formatINR(pi.amount)}</Td>
                      <Td><StatusBadge status={pi.status} /></Td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function NewPoForm({
  siteId,
  subProjectId,
  onCancel,
  onCreated,
}: {
  siteId: string;
  subProjectId: string | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [scope, setScope] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!poNumber.trim() || !poDate || !totalValue) return;
    setSubmitting(true);
    setErr(null);
    let documentId: string | null = null;
    try { documentId = await uploadDocument(file, 'po'); } catch (e) { setErr((e as Error).message); setSubmitting(false); return; }
    const { error } = await supabase.from('purchase_order').insert({
      document_id: documentId,
      site_id: siteId,
      sub_project_id: subProjectId,
      po_number: poNumber.trim(),
      po_date: poDate,
      scope_description: scope.trim() || null,
      total_value_with_gst: Number(totalValue),
      status: 'active',
    });
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput label="PO Number" value={poNumber} onChange={setPoNumber} placeholder="e.g. PDCL/LTHDN/2026/016" />
      <FieldInput label="PO Date" type="date" value={poDate} onChange={setPoDate} />
      <FieldInput label="Scope" value={scope} onChange={setScope} placeholder="e.g. Corridor 4th Floor" full />
      <FieldInput label="Total value (with GST)" type="number" value={totalValue} onChange={setTotalValue} />
      <FieldFile onChange={setFile} />
    </FormShell>
  );
}

function NewPiForm({
  siteId,
  subProjectId,
  pos,
  onCancel,
  onCreated,
}: {
  siteId: string;
  subProjectId: string | null;
  pos: PurchaseOrder[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [piNumber, setPiNumber] = useState('');
  const [piDate, setPiDate] = useState('');
  const [amount, setAmount] = useState('');
  const [poId, setPoId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!piNumber.trim() || !piDate || !amount) return;
    setSubmitting(true);
    setErr(null);
    let documentId: string | null = null;
    try { documentId = await uploadDocument(file, 'pi'); } catch (e) { setErr((e as Error).message); setSubmitting(false); return; }
    const { error } = await supabase.from('proforma_invoice').insert({
      document_id: documentId,
      site_id: siteId,
      sub_project_id: subProjectId,
      po_id: poId || null,
      pi_number: piNumber.trim(),
      pi_date: piDate,
      amount: Number(amount),
      remarks: remarks.trim() || null,
      status: 'draft',
    });
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput label="PI Number" value={piNumber} onChange={setPiNumber} placeholder="e.g. S5I/25-26/02/06" />
      <FieldInput label="PI Date" type="date" value={piDate} onChange={setPiDate} />
      <FieldInput label="Amount" type="number" value={amount} onChange={setAmount} />
      <FieldSelect label="Linked PO (optional)" value={poId} onChange={setPoId} options={pos.map((p) => ({ value: p.po_id, label: p.po_number }))} />
      <FieldInput label="Remarks" value={remarks} onChange={setRemarks} placeholder="e.g. Tower B Installation of Kitchen" full />
      <FieldFile onChange={setFile} />
    </FormShell>
  );
}
