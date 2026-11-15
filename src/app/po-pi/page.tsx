'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { confirmBeforeStart } from '@/lib/period';
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
import { uploadDocument, discardDocument } from '@/lib/documents';

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

  // Choosing a client / site / sub-project resets what depended on the old choice, so a new PO or PI
  // can never be saved against a site or sub-project that is no longer selected.
  function chooseClient(id: string) {
    setClientId(id);
    setSites([]);
    chooseSite('');
  }
  function chooseSite(id: string) {
    setSiteId(id);
    setSubProjectId('');
    setSubProjects([]); setPos([]); setPis([]);
    setShowNewPo(false); setShowNewPi(false);
  }

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    supabase.from('site').select('*').eq('client_id', clientId).order('site_name').then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(friendlyError(error));
      else setSites(data as Site[]);
    });
    return () => { alive = false; };
  }, [clientId]);

  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    supabase.from('sub_project').select('*').eq('site_id', siteId).order('name').then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(friendlyError(error));
      else setSubProjects(data as SubProject[]);
    });
    return () => { alive = false; };
  }, [siteId]);

  // A reply that belongs to an earlier site / sub-project is ignored.
  const loadSeq = useRef(0);
  async function loadLists(forSite = siteId, forSub = subProjectId) {
    const seq = ++loadSeq.current;
    if (!forSite) return;
    let pq = supabase.from('purchase_order').select('*').eq('site_id', forSite);
    let iq = supabase.from('proforma_invoice').select('*').eq('site_id', forSite);
    if (forSub) { pq = pq.eq('sub_project_id', forSub); iq = iq.eq('sub_project_id', forSub); }
    const [po, pi] = await Promise.all([pq.order('po_date', { ascending: false }), iq.order('pi_date', { ascending: false })]);
    if (seq !== loadSeq.current) return;
    if (po.error || pi.error) { setError(friendlyError(po.error ?? pi.error)); return; }
    setPos(po.data as PurchaseOrder[]);
    setPis(pi.data as ProformaInvoice[]);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the chosen site's lists is this effect's job
    loadLists(siteId, subProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, subProjectId]);

  const selectedSite = sites.find((s) => s.site_id === siteId);

  return (
    <div className="pb-12">
      <PageHeader title="POs & PIs" subtitle="Purchase orders and proforma invoices for a site." />
      {error && <ErrorBanner message={error} />}

      <div className="px-6 py-6 lg:px-8">
        {/* SELECTOR ROW */}
        <div className="card mb-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <FieldSelect
            label="Client"
            value={clientId}
            onChange={chooseClient}
            options={clients.map((c) => ({ value: c.client_id, label: c.display_name }))}
          />
          <FieldSelect
            label="Site"
            value={siteId}
            onChange={chooseSite}
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                  onCreated={() => { setShowNewPo(false); loadLists(); }}
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
                <div className="border-t border-slate-100 px-4 py-2.5 text-right font-mono text-sm font-medium">
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
                  onCreated={() => { setShowNewPi(false); loadLists(); }}
                />
              )}
              {pis.length === 0 ? (
                <EmptyState text="No PIs recorded yet." />
              ) : (
                <DataTable columns={[{ label: 'PI No.' }, { label: 'Subject' }, { label: 'Date' }, { label: 'Amount', align: 'right' }, { label: 'Status' }]}>
                  {pis.map((pi) => (
                    <tr key={pi.pi_id}>
                      <Td>{pi.pi_number}</Td>
                      <Td>{pi.subject ?? ''}</Td>
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
    if (!confirmBeforeStart(poDate, 'PO')) return;
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
    // The record was not saved, so the file uploaded for it must not linger unfiled.
    if (error) { await discardDocument(documentId).catch(() => undefined); setErr(friendlyError(error)); return; }
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
  const [subject, setSubject] = useState('');
  const [remarks, setRemarks] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!piNumber.trim() || !piDate || !amount) return;
    if (!confirmBeforeStart(piDate, 'PI')) return;
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
      subject: subject.trim() || null,
      remarks: remarks.trim() || null,
      status: 'draft',
    });
    setSubmitting(false);
    // The record was not saved, so the file uploaded for it must not linger unfiled.
    if (error) { await discardDocument(documentId).catch(() => undefined); setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput label="PI Number" value={piNumber} onChange={setPiNumber} placeholder="e.g. S5I/25-26/02/06" />
      <FieldInput label="PI Date" type="date" value={piDate} onChange={setPiDate} />
      <FieldInput label="Amount" type="number" value={amount} onChange={setAmount} />
      <FieldSelect label="Linked PO (optional)" value={poId} onChange={setPoId} options={pos.map((p) => ({ value: p.po_id, label: p.po_number }))} />
      <FieldInput label="Subject" value={subject} onChange={setSubject} placeholder="e.g. Tower B Installation of Kitchen" full />
      <FieldInput label="Work status / remarks" value={remarks} onChange={setRemarks} placeholder="e.g. 85% Work Done, rest on hold" full />
      <FieldFile onChange={setFile} />
    </FormShell>
  );
}
