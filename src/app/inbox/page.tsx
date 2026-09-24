'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, UploadCloud, Sparkles, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { formatINR, formatDate } from '@/lib/format';
import { DOCUMENT_BUCKET } from '@/lib/documents';
import { PageHeader, ErrorBanner, Panel, PrimaryButton, FieldInput, FieldSelect } from '@/lib/ui';
import {
  matchClient, matchSite, matchPo, checkDraft, suggestMatches, norm, num,
  type ClientLite, type SiteLite, type PoLite, type Draft, type DocKind,
} from '@/lib/inboxMatch';
import type { Extracted } from '@/lib/docExtract';

interface InboxRow {
  inbox_id: string; file_path: string; file_name: string; mime_type: string | null; size_bytes: number | null;
  status: 'uploaded' | 'extracting' | 'ready' | 'saved' | 'rejected' | 'failed';
  doc_type: string | null; extracted: Extracted | null; error: string | null;
  saved_record_type: string | null; saved_record_id: string | null; created_at: string;
}

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const KIND_LABEL: Record<DocKind, string> = {
  purchase_order: 'Purchase order (PO)', proforma_invoice: 'Proforma invoice (PI)', tax_invoice: 'Tax invoice', payment_advice: 'Payment received',
};
const DOC_TYPE_FOR_DB: Record<DocKind, 'po' | 'pi' | 'invoice' | 'payment_advice'> = {
  purchase_order: 'po', proforma_invoice: 'pi', tax_invoice: 'invoice', payment_advice: 'payment_advice',
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function InboxPage() {
  const [clients, setClients] = useState<(ClientLite)[]>([]);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [c, s, r] = await Promise.all([
      supabase.from('client').select('client_id, legal_name, display_name, gstin').order('display_name'),
      supabase.from('site').select('site_id, client_id, site_name').order('site_name'),
      supabase.from('doc_inbox').select('*').not('status', 'in', '(rejected)').order('created_at', { ascending: false }).limit(60),
    ]);
    const bad = [c, s, r].find((x) => x.error);
    if (bad?.error) { setError(friendlyError(bad.error)); return; }
    setClients((c.data ?? []) as ClientLite[]); setSites((s.data ?? []) as SiteLite[]); setRows((r.data ?? []) as InboxRow[]);
  }, []);

  useEffect(() => {
    load();
    setAiEnabled(false);
  }, [load]);

  async function read(_inboxId: string) {
    await load();
  }

  async function addFiles(files: File[]) {
    setError(null); setBusy(true);
    const queue: string[] = [];
    for (const f of files) {
      const type = f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
      if (!OK_TYPES.includes(type)) { setError(`"${f.name}" is not a PDF, PNG, JPG or WEBP file, so it was skipped.`); continue; }
      if (f.size > MAX_BYTES) { setError(`"${f.name}" is larger than 10 MB, so it was skipped. Please upload a smaller copy.`); continue; }
      const path = `inbox/${crypto.randomUUID()}_${f.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, f);
      if (up.error) { setError(`Could not upload "${f.name}": ${up.error.message}`); continue; }
      const ins = await supabase.from('doc_inbox').insert({ file_path: path, file_name: f.name, mime_type: type, size_bytes: f.size }).select('inbox_id').single();
      if (ins.error || !ins.data) { await supabase.storage.from(DOCUMENT_BUCKET).remove([path]); setError(friendlyError(ins.error)); continue; }
      queue.push(ins.data.inbox_id);
    }
    await load();
    for (const id of queue) await read(id);     // one at a time, so the list updates as each finishes
    setBusy(false);
  }

  const waiting = rows.filter((r) => r.status !== 'saved');
  const saved = rows.filter((r) => r.status === 'saved').slice(0, 8);

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<FilePlus2 size={24} className="text-[#E8C872]" />}
        title="Add documents"
        subtitle="Drop in your POs, proformas, tax invoices and payment advices. The app reads them, links each one to the right client, site and PO, and shows you what it found. You check it and press Confirm. Nothing is saved until you do."
      />
      {error && <ErrorBanner message={error} />}

      <div className="space-y-6 px-8 py-8">
        {aiEnabled === false && (
          <div className="flex items-start gap-3 rounded-xl border border-[#B8860B]/30 bg-[#B8860B]/5 px-5 py-4 font-sans text-sm text-[#7a5a05]">
            <AlertTriangle size={18} className="mt-0.5 flex-none" />
            <div><b>Automatic reading is switched off on this version.</b> You can still drop documents here and fill in the details yourself (the file stays attached).</div>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => fileInput.current?.click()}
          className={`card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-[#1F3A52] bg-[#1F3A52]/5' : 'border-slate-300 hover:border-[#1F3A52]/60'}`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1F3A52]/10 text-[#1F3A52]">{busy ? <Loader2 size={26} className="animate-spin" /> : <UploadCloud size={26} />}</span>
          <div className="font-serif text-lg font-semibold text-[#1F3A52]">{busy ? 'Reading your documents…' : 'Drop files here, or click to choose'}</div>
          <div className="font-sans text-xs text-slate-500">PDF, PNG, JPG or WEBP · up to 10 MB each · several at a time is fine</div>
          <input ref={fileInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) addFiles(f); }} />
        </div>

        {waiting.length > 0 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[#1F3A52]"><span className="h-5 w-1 rounded-full bg-[#E8C872]" /> Waiting for you ({waiting.length})</h2>
            {waiting.map((r) => (
              <InboxCard key={r.inbox_id} item={r} clients={clients} sites={sites} onChanged={load} onRead={() => read(r.inbox_id)} />
            ))}
          </div>
        )}

        {saved.length > 0 && (
          <Panel title="Recently added from documents">
            <ul className="divide-y divide-slate-100">
              {saved.map((r) => (
                <li key={r.inbox_id} className="flex items-center gap-3 px-6 py-3 font-sans text-sm">
                  <CheckCircle2 size={16} className="flex-none text-[#2F6B4F]" />
                  <span className="min-w-0 flex-1 truncate text-slate-700">{r.file_name}</span>
                  <span className="text-xs text-slate-400">saved as {r.saved_record_type?.replace(/_/g, ' ')} · {formatDate(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

interface SiteData {
  pos: (PoLite & { yet_to_invoice?: number })[]; pis: { pi_id: string; pi_number: string; po_id: string | null }[];
  poNumbers: string[]; piNumbers: string[]; invNumbers: string[];
  open: { invoice_id: string; invoice_number: string; remaining: number }[]; subs: { sub_project_id: string; name: string }[];
}
const EMPTY_SITE: SiteData = { pos: [], pis: [], poNumbers: [], piNumbers: [], invNumbers: [], open: [], subs: [] };

const KIND_FROM_TYPE: Record<string, DocKind> = { purchase_order: 'purchase_order', proforma_invoice: 'proforma_invoice', tax_invoice: 'tax_invoice', payment_advice: 'payment_advice' };

function InboxCard({ item, clients, sites, onChanged, onRead }: { item: InboxRow; clients: ClientLite[]; sites: SiteLite[]; onChanged: () => void; onRead: () => void }) {
  const ex = item.extracted;
  const initial = useMemo(() => {
    const kind = KIND_FROM_TYPE[ex?.document_type ?? ''] ?? 'purchase_order';
    const client = ex ? matchClient(clients, ex.client_name, ex.client_gstin) : null;
    const pool = client ? sites.filter((s) => s.client_id === client.client_id) : sites;
    const site = ex ? matchSite(pool, ex.site_or_project, ex.scope_description) ?? (pool.length === 1 && client ? pool[0] : null) : null;
    const taxSum = num(ex?.cgst_amount) + num(ex?.sgst_amount) + num(ex?.igst_amount);
    const derivedGst = !taxSum && ex?.taxable_value != null && ex?.total_amount != null ? ex.total_amount - ex.taxable_value : null;
    return {
      kind, clientId: client?.client_id ?? site?.client_id ?? '', siteId: site?.site_id ?? '',
      number: (kind === 'payment_advice' ? ex?.utr_or_reference ?? ex?.document_number : ex?.document_number) ?? '',
      date: (kind === 'payment_advice' ? ex?.payment_date ?? ex?.document_date : ex?.document_date) ?? '',
      taxable: ex?.taxable_value != null ? String(ex.taxable_value) : '',
      gst: taxSum ? String(Math.round(taxSum * 100) / 100) : derivedGst != null ? String(Math.round(derivedGst * 100) / 100) : '',
      total: ex?.total_amount != null ? String(ex.total_amount) : '',
      amount: ex?.payment_amount != null ? String(ex.payment_amount) : '',
      scope: ex?.scope_description ?? '', derivedGst: derivedGst != null,
    };
  }, [ex, clients, sites]);

  const [kind, setKind] = useState<DocKind>(initial.kind);
  const [clientId, setClientId] = useState(initial.clientId);
  const [siteId, setSiteId] = useState(initial.siteId);
  const [subId, setSubId] = useState('');
  const [number, setNumber] = useState(initial.number);
  const [date, setDate] = useState(initial.date);
  const [taxable, setTaxable] = useState(initial.taxable);
  const [gst, setGst] = useState(initial.gst);
  const [total, setTotal] = useState(initial.total);
  const [amount, setAmount] = useState(initial.amount);
  const [scope, setScope] = useState(initial.scope);
  const [poId, setPoId] = useState('');
  const [piId, setPiId] = useState('');
  const [payType, setPayType] = useState<'advance' | 'invoice_settlement'>('invoice_settlement');
  const [mode, setMode] = useState<string>(ex?.payment_mode ?? 'bank_transfer');
  const [remarks, setRemarks] = useState('');
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [addTds, setAddTds] = useState(true);
  const [sd, setSd] = useState<SiteData>(EMPTY_SITE);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seeded = useRef(false);

  // re-seed the form when the reading finishes (status changes from extracting to ready)
  useEffect(() => {
    if (item.status !== 'ready') return;
    seeded.current = false;
    setKind(initial.kind); setClientId(initial.clientId); setSiteId(initial.siteId); setNumber(initial.number); setDate(initial.date);
    setTaxable(initial.taxable); setGst(initial.gst); setTotal(initial.total); setAmount(initial.amount); setScope(initial.scope);
    setMode(ex?.payment_mode ?? 'bank_transfer');
  }, [item.status, item.inbox_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientSites = sites.filter((s) => !clientId || s.client_id === clientId);

  // everything we need to know about the chosen site
  useEffect(() => {
    if (!siteId) { setSd(EMPTY_SITE); return; }
    (async () => {
      const [po, pi, inv, open, sub, sum] = await Promise.all([
        supabase.from('purchase_order').select('po_id, site_id, po_number').eq('site_id', siteId),
        supabase.from('proforma_invoice').select('pi_id, pi_number, po_id, status').eq('site_id', siteId),
        supabase.from('tax_invoice').select('invoice_number').eq('site_id', siteId),
        supabase.from('v_invoice_settlement').select('invoice_id, invoice_number, remaining_balance').eq('site_id', siteId).gt('remaining_balance', 0.5),
        supabase.from('sub_project').select('sub_project_id, name').eq('site_id', siteId).order('name'),
        supabase.from('v_po_summary').select('po_id, yet_to_invoice').eq('site_id', siteId),
      ]);
      const left = new Map(((sum.data ?? []) as { po_id: string; yet_to_invoice: number }[]).map((x) => [x.po_id, Number(x.yet_to_invoice)]));
      const pos = ((po.data ?? []) as PoLite[]).map((p) => ({ ...p, yet_to_invoice: left.get(p.po_id) }));
      const pis = ((pi.data ?? []) as { pi_id: string; pi_number: string; po_id: string | null; status: string }[]);
      const data: SiteData = {
        pos, pis: pis.filter((p) => p.status !== 'converted_to_invoice'), poNumbers: pos.map((p) => p.po_number), piNumbers: pis.map((p) => p.pi_number),
        invNumbers: ((inv.data ?? []) as { invoice_number: string }[]).map((i) => i.invoice_number),
        open: ((open.data ?? []) as { invoice_id: string; invoice_number: string; remaining_balance: number }[]).map((o) => ({ invoice_id: o.invoice_id, invoice_number: o.invoice_number, remaining: Number(o.remaining_balance) })),
        subs: (sub.data ?? []) as SiteData['subs'],
      };
      setSd(data);
      if (!seeded.current && ex) {                       // link PO / PI / invoices the document names, once
        seeded.current = true;
        const po = matchPo(data.pos, ex.po_reference); if (po) setPoId(po.po_id);
        const p = data.pis.find((x) => norm(x.pi_number) === norm(ex.pi_reference) && norm(ex.pi_reference) !== '');
        if (p) { setPiId(p.pi_id); if (p.po_id) setPoId(p.po_id); }
        if (ex.document_type === 'payment_advice' && ex.payment_amount) {
          const sug = suggestMatches(ex.payment_amount, data.open, ex.invoice_numbers_paid);
          setMatches(Object.fromEntries(Object.entries(sug).map(([k, v]) => [k, String(v)])));
          setPayType(Object.keys(sug).length ? 'invoice_settlement' : 'advance');
        }
      }
    })();
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedTotal = Object.values(matches).reduce((s, v) => s + num(v), 0);
  const draft: Draft = { kind, siteId, number, date, taxable, gst, total: kind === 'tax_invoice' ? total || String(num(taxable) + num(gst)) : total, amount };
  const existing = kind === 'purchase_order' ? sd.poNumbers : kind === 'proforma_invoice' ? sd.piNumbers : kind === 'tax_invoice' ? sd.invNumbers : [];
  const poLeft = kind === 'tax_invoice' && poId ? sd.pos.find((p) => p.po_id === poId)?.yet_to_invoice ?? null : null;
  const { errors, warnings } = checkDraft(draft, { existingNumbers: existing, today: todayIso(), poLeftToBill: poLeft, matchedTotal });
  const notes = [...(ex?.notes ?? []), ...(initial.derivedGst && kind === 'tax_invoice' && ex ? ['GST was worked out as total minus taxable value because no tax lines were printed.'] : [])];

  const tdsToAdd = ex?.tds_deducted && kind === 'payment_advice' && Object.keys(matches).filter((k) => num(matches[k]) > 0).length === 1 ? ex.tds_deducted : 0;

  async function openFile() {
    const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(item.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  async function reject() {
    if (!confirm('Remove this document? The file will be deleted and nothing will be saved.')) return;
    await supabase.storage.from(DOCUMENT_BUCKET).remove([item.file_path]);
    await supabase.from('doc_inbox').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('inbox_id', item.inbox_id);
    onChanged();
  }

  async function save() {
    if (errors.length) return;
    setSaving(true); setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const doc = await supabase.from('document').insert({ file_url: item.file_path, document_type: DOC_TYPE_FOR_DB[kind], uploaded_by: u.user?.id ?? null }).select('document_id').single();
    if (doc.error || !doc.data) { setErr(friendlyError(doc.error)); setSaving(false); return; }
    const documentId = doc.data.document_id as string;
    const undo = async () => { await supabase.from('document').delete().eq('document_id', documentId); };

    let recordId: string | null = null;
    let problem: { message: string; code?: string } | null = null;
    if (kind === 'purchase_order') {
      const r = await supabase.from('purchase_order').insert({
        site_id: siteId, sub_project_id: subId || null, po_number: number.trim(), po_date: date, scope_description: scope.trim() || null,
        total_value_with_gst: num(total), status: 'active', document_id: documentId,
      }).select('po_id').single();
      problem = r.error; recordId = r.data?.po_id ?? null;
    } else if (kind === 'proforma_invoice') {
      const r = await supabase.from('proforma_invoice').insert({
        site_id: siteId, sub_project_id: subId || null, po_id: poId || null, pi_number: number.trim(), pi_date: date,
        amount: num(total), remarks: scope.trim() || null, status: 'draft', document_id: documentId,
      }).select('pi_id').single();
      problem = r.error; recordId = r.data?.pi_id ?? null;
    } else if (kind === 'tax_invoice') {
      const r = await supabase.rpc('record_tax_invoice', {
        p_site_id: siteId, p_sub_project_id: subId || null, p_po_id: poId || null, p_pi_id: piId || null, p_invoice_number: number.trim(),
        p_invoice_date: date, p_taxable: num(taxable), p_gst: num(gst), p_gross: num(draft.total), p_document_id: documentId,
      });
      problem = r.error; recordId = (r.data as string) ?? null;
    } else {
      const allocations = Object.entries(matches).filter(([, v]) => num(v) > 0).map(([invoice_id, v]) => ({ invoice_id, amount: num(v) }));
      const r = await supabase.rpc('record_payment', {
        p_site_id: siteId, p_po_id: poId || null, p_date: date, p_amount: num(amount), p_type: payType, p_mode: mode,
        p_reference: number, p_remarks: remarks, p_document_id: documentId, p_allocations: allocations,
      });
      problem = r.error; recordId = (r.data as string) ?? null;
      if (!problem && addTds && tdsToAdd > 0) {
        const inv = allocations[0].invoice_id;
        const t = await supabase.from('deduction').insert({ invoice_id: inv, deduction_type: 'tds', amount: tdsToAdd, category_note: 'From payment advice', deduction_date: date, status: 'pending' });
        if (t.error) setErr(`The payment was saved, but the tax deducted (${formatINR(tdsToAdd)}) could not be recorded: ${friendlyError(t.error)} Add it on the Tax invoices page.`);
      }
    }
    if (problem) { await undo(); setErr(friendlyError(problem)); setSaving(false); return; }
    await supabase.from('doc_inbox').update({ status: 'saved', doc_type: DOC_TYPE_FOR_DB[kind], saved_record_type: kind, saved_record_id: recordId, updated_at: new Date().toISOString() }).eq('inbox_id', item.inbox_id);
    setSaving(false);
    onChanged();
  }

  const conf = ex?.overall_confidence;
  const confColor = conf === 'high' ? '#2F6B4F' : conf === 'medium' ? '#B8860B' : '#C0392B';
  const reading = item.status === 'extracting' || item.status === 'uploaded';

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-3.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#1F3A52]/10 text-[#1F3A52]"><Sparkles size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-sans text-sm font-semibold text-slate-800">{item.file_name}</div>
          <div className="font-sans text-xs text-slate-400">{item.size_bytes ? `${Math.round(item.size_bytes / 1024)} KB · ` : ''}added {formatDate(item.created_at)}</div>
        </div>
        {reading && <span className="inline-flex items-center gap-1.5 font-sans text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Reading…</span>}
        {item.status === 'ready' && conf && <span className="rounded-full px-2.5 py-0.5 font-sans text-xs font-semibold" style={{ color: confColor, backgroundColor: `${confColor}14` }}>Read with {conf} confidence</span>}
        {item.status === 'failed' && <span className="rounded-full bg-[#C0392B]/10 px-2.5 py-0.5 font-sans text-xs font-semibold text-[#C0392B]">Could not read</span>}
        <button onClick={openFile} className="inline-flex items-center gap-1 rounded-md bg-[#1F3A52]/8 px-3 py-1.5 font-sans text-xs font-semibold text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white"><ExternalLink size={13} /> View file</button>
        <button onClick={reject} title="Remove" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#C0392B]"><X size={16} /></button>
      </div>

      {item.status === 'failed' && (
        <div className="flex flex-wrap items-center gap-3 border-b border-[#C0392B]/15 bg-[#C0392B]/5 px-6 py-3 font-sans text-sm text-[#C0392B]">
          <span className="flex-1">{item.error ?? 'This document could not be read.'} You can fill it in yourself below (the file stays attached).</span>
          <button onClick={onRead} className="inline-flex items-center gap-1 rounded-md border border-[#C0392B]/30 px-3 py-1 text-xs font-semibold hover:bg-[#C0392B] hover:text-white"><RefreshCw size={12} /> Read again</button>
        </div>
      )}

      {!reading && (
        <div className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <FieldSelect label="What is this?" value={kind} onChange={(v) => setKind(v as DocKind)} options={(Object.keys(KIND_LABEL) as DocKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            <FieldSelect label="Client" value={clientId} onChange={(v) => { setClientId(v); if (siteId && sites.find((s) => s.site_id === siteId)?.client_id !== v) setSiteId(''); }} options={clients.map((c) => ({ value: c.client_id, label: c.display_name }))} />
            <FieldSelect label="Site" value={siteId} onChange={(v) => { setSiteId(v); setPoId(''); setPiId(''); setSubId(''); setMatches({}); }} options={clientSites.map((s) => ({ value: s.site_id, label: s.site_name }))} />
            {sd.subs.length > 0 ? <FieldSelect label="Tower / package (optional)" value={subId} onChange={setSubId} options={sd.subs.map((s) => ({ value: s.sub_project_id, label: s.name }))} /> : <div />}

            <FieldInput label={kind === 'payment_advice' ? 'UTR / reference' : kind === 'purchase_order' ? 'PO number' : kind === 'proforma_invoice' ? 'PI number' : 'Invoice number'} value={number} onChange={setNumber} />
            <FieldInput label={kind === 'payment_advice' ? 'Date received' : 'Date'} type="date" value={date} onChange={setDate} />

            {kind === 'tax_invoice' && (<>
              <FieldInput label="Taxable value" type="number" value={taxable} onChange={setTaxable} />
              <FieldInput label="GST amount" type="number" value={gst} onChange={setGst} />
              <FieldInput label="Invoice total (with GST)" type="number" value={total} onChange={setTotal} />
            </>)}
            {(kind === 'purchase_order' || kind === 'proforma_invoice') && (
              <FieldInput label={kind === 'purchase_order' ? 'PO total (with GST)' : 'Amount'} type="number" value={total} onChange={setTotal} />
            )}
            {kind === 'payment_advice' && (<>
              <FieldInput label="Amount received" type="number" value={amount} onChange={setAmount} />
              <FieldSelect label="Type" value={payType} onChange={(v) => setPayType(v as 'advance' | 'invoice_settlement')} options={[{ value: 'invoice_settlement', label: 'Payment against invoice(s)' }, { value: 'advance', label: 'Advance (before invoices)' }]} />
              <FieldSelect label="Mode" value={mode} onChange={setMode} options={[{ value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }, { value: 'cash', label: 'Cash' }, { value: 'other', label: 'Other' }]} />
            </>)}

            {kind !== 'purchase_order' && (
              <FieldSelect label="Linked PO" value={poId} onChange={setPoId} options={sd.pos.map((p) => ({ value: p.po_id, label: p.po_number }))} />
            )}
            {kind === 'tax_invoice' && <FieldSelect label="Converts which proforma?" value={piId} onChange={setPiId} options={sd.pis.map((p) => ({ value: p.pi_id, label: p.pi_number }))} />}
            {(kind === 'purchase_order' || kind === 'proforma_invoice') && <FieldInput full label={kind === 'purchase_order' ? 'Scope of work' : 'Note'} value={scope} onChange={setScope} />}
            {kind === 'payment_advice' && <FieldInput full label="Note (optional)" value={remarks} onChange={setRemarks} />}
          </div>

          {kind === 'payment_advice' && sd.open.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2.5 font-sans text-xs font-semibold text-slate-700">Which invoices did this pay? {ex?.invoice_numbers_paid?.length ? `The document names: ${ex.invoice_numbers_paid.join(', ')}` : '(the document names none, so nothing is guessed)'}</div>
              <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                {sd.open.map((o) => (
                  <div key={o.invoice_id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="font-sans text-sm text-slate-800">{o.invoice_number} <span className="ml-2 font-mono text-xs text-slate-400">still to pay {formatINR(o.remaining)}</span></div>
                    <input type="number" min="0" step="0.01" placeholder="0" value={matches[o.invoice_id] ?? ''} onChange={(e) => setMatches({ ...matches, [o.invoice_id]: e.target.value })}
                      className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right font-mono text-sm outline-none focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15" />
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-4 py-2 font-mono text-xs text-slate-500">Matched {formatINR(matchedTotal)} · left unmatched {formatINR(Math.max(num(amount) - matchedTotal, 0))}</div>
            </div>
          )}
          {tdsToAdd > 0 && (
            <label className="mt-3 flex items-center gap-2 font-sans text-sm text-slate-700">
              <input type="checkbox" checked={addTds} onChange={(e) => setAddTds(e.target.checked)} />
              The advice says {formatINR(tdsToAdd)} tax (TDS) was deducted. Also record it against the matched invoice.
            </label>
          )}

          {(notes.length > 0 || warnings.length > 0 || errors.length > 0 || err) && (
            <div className="mt-4 space-y-1.5">
              {notes.map((n, i) => <Msg key={`n${i}`} tone="amber" text={`The reader noted: ${n}`} />)}
              {warnings.map((w, i) => <Msg key={`w${i}`} tone="amber" text={w} />)}
              {errors.map((e, i) => <Msg key={`e${i}`} tone="red" text={e} />)}
              {err && <Msg tone="red" text={err} />}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={save} disabled={saving || errors.length > 0}>{saving ? 'Saving…' : 'Confirm & save'}</PrimaryButton>
            <span className="font-sans text-xs text-slate-400">{errors.length ? 'Fix the red points above to save.' : 'Check the details against the file, then confirm.'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Msg({ tone, text }: { tone: 'amber' | 'red'; text: string }) {
  const c = tone === 'red' ? '#C0392B' : '#B8860B';
  return <div className="flex items-start gap-2 rounded-lg px-3 py-2 font-sans text-xs" style={{ color: c, backgroundColor: `${c}0F` }}><AlertTriangle size={13} className="mt-0.5 flex-none" />{text}</div>;
}
