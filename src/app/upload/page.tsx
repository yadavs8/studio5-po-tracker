'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { formatINR } from '@/lib/format';
import { friendlyError } from '@/lib/plain';
import { confirmBeforeStart } from '@/lib/period';
import {
  uploadDocument,
  discardDocument,
  UploadDocType,
  DOC_TYPES,
  DOC_TYPE_LABEL,
  MAX_UPLOAD_BYTES,
} from '@/lib/documents';
import { detectDocument, fromExtracted, findExistingRecord, SiteMeta, DetectedDocument, ExistingRecord } from '@/lib/detector';
import { readDocument, readableType, closeInboxItem } from '@/lib/extractApi';
import { PageHeader, ErrorBanner, Panel, PrimaryButton, GhostButton, FieldInput, FieldSelect } from '@/lib/ui';
import {
  UploadCloud,
  FileCheck2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Link2,
  Loader2,
  FolderOpen,
} from 'lucide-react';

type AiState = 'idle' | 'reading' | 'done' | 'failed' | 'skipped';
type FieldKey = 'docType' | 'site' | 'docNumber' | 'docDate' | 'amount' | 'taxable' | 'gst' | 'subject' | 'linkedPo';

/** Kinds of document that become a PO / PI / tax invoice record as well as a filed document. */
const RECORD_TYPES: UploadDocType[] = ['po', 'pi', 'invoice'];

interface SitePoOpt {
  po_id: string;
  po_number: string;
}

interface SitePiOpt {
  pi_id: string;
  pi_number: string;
  amount: number;
  subject: string | null;
  po_id: string | null;
  status: string;
}

interface SiteRow {
  site_id: string;
  site_name: string;
  client_id: string;
  client: { display_name: string } | null;
}

interface SuccessInfo {
  documentId: string;
  title: string;
  typeLabel: string;
  siteId: string;
  siteName: string;
  recordUrl: string | null;
  isUpdate: boolean;
  linkedCount: number;
  warning: string | null;
}

/** "1,45,000.50", "₹ 145000" → 145000.5; empty or invalid → NaN. */
const toNum = (s: string) => {
  const t = s.replace(/[₹,\s]/g, '');
  return t === '' ? NaN : Number(t);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

function UploadPageInner() {
  // Opened from a site page: that site is kept unless the person changes it.
  const presetSite = useSearchParams().get('site') ?? '';
  const [sites, setSites] = useState<SiteMeta[]>([]);
  const [activeSiteIds, setActiveSiteIds] = useState<Set<string>>(new Set());
  const [showAllSites, setShowAllSites] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detected, setDetected] = useState<DetectedDocument | null>(null);

  // Automatic reading on the backend (Claude). The quick file-name guess fills the form at once;
  // when the AI reading comes back it replaces every field the person has not already changed.
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const readToken = useRef(0);
  const inboxIdRef = useRef<string | null>(null);
  const touched = useRef<Set<FieldKey>>(new Set());
  const markTouched = (key: FieldKey) => {
    touched.current.add(key);
  };

  // Form
  const [docType, setDocType] = useState<UploadDocType>('pi');
  const [siteId, setSiteId] = useState(presetSite);
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState('');
  const [amount, setAmount] = useState('');
  const [taxable, setTaxable] = useState('');
  const [gst, setGst] = useState('');
  const [subject, setSubject] = useState('');

  // Linking. linkedPoId === null means the person has not picked one, so the PO number the AI read is used.
  const [linkedPoId, setLinkedPoId] = useState<string | null>(null);
  const [poReference, setPoReference] = useState<string | null>(null);
  const [selectedPiIds, setSelectedPiIds] = useState<string[]>([]);
  const [invoicePiId, setInvoicePiId] = useState('');
  const [siteLists, setSiteLists] = useState<{ siteId: string; pos: SitePoOpt[]; pis: SitePiOpt[] }>({ siteId: '', pos: [], pis: [] });

  // A PO / PI / tax invoice with the same number on the same site, which this upload can replace.
  const [existingLookup, setExistingLookup] = useState<{ key: string; rec: ExistingRecord | null }>({ key: '', rec: null });
  const [overrideChoice, setOverrideChoice] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  // The reading finishes long after it starts, so it reads the form's latest type and site from here.
  const current = useRef<{ docType: UploadDocType; siteId: string }>({ docType: 'pi', siteId: '' });
  useEffect(() => {
    current.current = { docType, siteId };
  }, [docType, siteId]);

  // Sites, and which of them already have anything recorded
  useEffect(() => {
    (async () => {
      const [siteRes, poRes, piRes, invRes] = await Promise.all([
        supabase.from('site').select('site_id, site_name, client_id, client:client_id(display_name)').order('site_name'),
        supabase.from('purchase_order').select('site_id'),
        supabase.from('proforma_invoice').select('site_id'),
        supabase.from('tax_invoice').select('site_id'),
      ]);
      if (siteRes.error) {
        setError(friendlyError(siteRes.error));
        return;
      }
      setSites(
        ((siteRes.data ?? []) as unknown as SiteRow[]).map((s) => ({
          site_id: s.site_id,
          site_name: s.site_name,
          client_id: s.client_id,
          client_name: s.client?.display_name ?? 'Client',
        }))
      );
      const active = new Set<string>();
      for (const res of [poRes, piRes, invRes]) {
        ((res.data ?? []) as { site_id: string | null }[]).forEach((r) => r.site_id && active.add(r.site_id));
      }
      setActiveSiteIds(active);
    })();
  }, []);

  // The chosen site's POs and PIs, for linking
  useEffect(() => {
    if (!siteId) return;
    let alive = true;
    Promise.all([
      supabase.from('purchase_order').select('po_id, po_number').eq('site_id', siteId).order('po_date', { ascending: false }),
      supabase
        .from('proforma_invoice')
        .select('pi_id, pi_number, amount, subject, po_id, status')
        .eq('site_id', siteId)
        .order('pi_date', { ascending: false }),
    ]).then(([poRes, piRes]) => {
      if (alive) setSiteLists({ siteId, pos: (poRes.data ?? []) as SitePoOpt[], pis: (piRes.data ?? []) as SitePiOpt[] });
    });
    return () => {
      alive = false;
    };
  }, [siteId]);
  const sitePos = siteLists.siteId === siteId ? siteLists.pos : [];
  const sitePis = siteLists.siteId === siteId ? siteLists.pis : [];

  // Look for a record with this number on this site (after typing stops for a moment)
  const isRecordType = RECORD_TYPES.includes(docType);
  const lookupKey = isRecordType && siteId && docNumber.trim() ? `${docType}|${siteId}|${docNumber.trim()}` : '';
  useEffect(() => {
    if (!lookupKey) return;
    const [type, site, num] = lookupKey.split('|');
    const timer = setTimeout(async () => {
      const rec = await findExistingRecord(type as UploadDocType, num, site);
      setExistingLookup({ key: lookupKey, rec });
    }, 350);
    return () => clearTimeout(timer);
  }, [lookupKey]);
  const existing = lookupKey && existingLookup.key === lookupKey ? existingLookup.rec : null;
  const isOverride = !!existing && (overrideChoice ?? true);

  // PO link: what the person picked, else the PO whose number the AI read off the document
  const autoPoId =
    poReference && sitePos.find((p) => p.po_number.trim().toLowerCase() === poReference.toLowerCase())?.po_id;
  const poId = linkedPoId ?? autoPoId ?? '';

  function chooseSite(id: string) {
    setSiteId(id);
    setLinkedPoId(null);
    setSelectedPiIds([]);
    setInvoicePiId('');
  }

  /** Drops the inbox copy of a document that was not (or not yet) saved, and ignores any reading still running. */
  function abandonReading() {
    readToken.current++;
    if (inboxIdRef.current) closeInboxItem(inboxIdRef.current, { saved: false });
    inboxIdRef.current = null;
    setAiState('idle');
    setAiMessage(null);
    setAiNotes([]);
  }

  function fillForm(d: DetectedDocument, onlyUntouched: boolean) {
    // A fresh file refills everything except a site the person already chose (or came from).
    const t = onlyUntouched ? touched.current : new Set<FieldKey>([...touched.current].filter((k) => k === 'site'));
    if (!t.has('docType')) setDocType(d.docType);
    if (!t.has('site') && d.siteId) chooseSite(d.siteId);
    if (!t.has('docNumber') && (d.docNumber || !onlyUntouched)) setDocNumber(d.docNumber);
    if (!t.has('docDate') && (d.date || !onlyUntouched)) setDocDate(d.date);
    if (!t.has('amount') && (d.amount != null || !onlyUntouched)) setAmount(d.amount != null ? String(d.amount) : '');
    if (!t.has('subject') && (d.subjectOrScope || !onlyUntouched)) setSubject(d.subjectOrScope);
    const tax = d.taxable ?? (d.amount != null && d.gst != null ? round2(d.amount - d.gst) : null);
    if (!t.has('taxable') && (tax != null || !onlyUntouched)) setTaxable(tax != null ? String(tax) : '');
    if (!t.has('gst') && (d.gst != null || !onlyUntouched)) setGst(d.gst != null ? String(d.gst) : '');
    if (d.poReference) setPoReference(d.poReference);
  }

  /** Has the backend read the file with Claude, then fills every field the person has not changed yet. */
  async function startReading(selectedFile: File) {
    const token = ++readToken.current;
    if (!readableType(selectedFile)) {
      setAiState('skipped');
      setAiMessage(
        'Automatic reading works for PDF, Word (.docx) and image files only, so please check the details below by hand. (An old .doc file can be saved as .docx in Word.)'
      );
      return;
    }
    setAiState('reading');
    setAiMessage(null);
    setAiNotes([]);
    try {
      const { inboxId, extracted } = await readDocument(selectedFile);
      if (token !== readToken.current) {
        closeInboxItem(inboxId, { saved: false }); // a different file was chosen meanwhile
        return;
      }
      inboxIdRef.current = inboxId;
      const read = fromExtracted(extracted, sites);
      fillForm(read, true);
      setDetected(read);

      const notes = [...(extracted.notes ?? [])];
      if (!read.siteId && (extracted.site_or_project || extracted.client_name)) {
        notes.unshift(
          `Could not match "${[extracted.client_name, extracted.site_or_project].filter(Boolean).join(' — ')}" to a site. Please pick the site.`
        );
      }
      setAiNotes(notes);
      setAiState('done');
    } catch (err) {
      if (token !== readToken.current) return;
      const inboxId = (err as { inboxId?: string }).inboxId;
      if (inboxId) closeInboxItem(inboxId, { saved: false });
      setAiState('failed');
      setAiMessage((err as Error).message);
    }
  }

  // When a file is selected: quick guess from the file name at once, then the full AI reading
  async function handleFileSelect(selectedFile: File | null) {
    abandonReading();
    touched.current = new Set<FieldKey>(presetSite && siteId === presetSite ? ['site'] : []);
    setOverrideChoice(null);
    setPoReference(null);
    setFile(selectedFile);
    setSuccess(null);
    setError(null);
    if (!selectedFile) {
      setDetected(null);
      return;
    }
    if (selectedFile.size > MAX_UPLOAD_BYTES) {
      setError('This file is larger than 25 MB. Please upload a smaller copy.');
      setFile(null);
      return;
    }

    setAnalyzing(true);
    try {
      const quick = await detectDocument(selectedFile, sites);
      setDetected(quick);
      fillForm(quick, false);
    } catch (err) {
      setError(`Could not look at the file: ${(err as Error).message}`);
    }
    setAnalyzing(false);
    startReading(selectedFile);
  }

  const filteredSites = showAllSites ? sites : sites.filter((s) => activeSiteIds.has(s.site_id) || s.site_id === siteId);
  const taxableNum = toNum(taxable);
  const gstNum = toNum(gst);
  const invoiceTotal = round2((Number.isNaN(taxableNum) ? 0 : taxableNum) + (Number.isNaN(gstNum) ? 0 : gstNum));
  const openPis = sitePis.filter((p) => p.status !== 'converted_to_invoice');
  const unlinkedPis = sitePis.filter((p) => !p.po_id);

  /** Checks the form; returns a message for the first problem, or null. */
  function problem(): string | null {
    if (!file) return 'Please choose a file to upload.';
    if (!siteId) return 'Please choose the site this document belongs to.';
    if (isRecordType) {
      if (!docNumber.trim()) return 'Please fill in the document number.';
      if (!docDate) return 'Please fill in the document date.';
      if (docType === 'invoice') {
        if (!(taxableNum > 0)) return 'Please fill in the taxable value (amount before GST).';
        if (gst.trim() && !(gstNum >= 0)) return 'The GST amount is not a valid number.';
      } else if (!(toNum(amount) > 0)) {
        return 'Please fill in the total amount (with GST). It must be above zero.';
      }
    }
    return null;
  }

  async function handleSubmit() {
    const p = problem();
    if (p) {
      setError(p);
      return;
    }
    if (docDate && !confirmBeforeStart(docDate, DOC_TYPE_LABEL[docType].toLowerCase())) return;

    setSubmitting(true);
    setError(null);
    const site = sites.find((s) => s.site_id === siteId);
    const filing = { siteId, poId: poId || null, docNumber, docDate: docDate || null, notes: subject };
    let newDocId: string | null = null;

    try {
      newDocId = await uploadDocument(file, docType, filing);
      if (!newDocId) throw new Error('The file could not be uploaded.');

      let recordId: string | null = null;
      let recordUrl: string | null = null;
      let linkedCount = 0;
      let warning: string | null = null;
      const total = toNum(amount);

      if (docType === 'pi') {
        if (existing && isOverride) {
          const patch: Record<string, unknown> = { document_id: newDocId, amount: total, pi_date: docDate };
          if (subject.trim()) patch.subject = subject.trim();
          if (poId) patch.po_id = poId;
          const { error: e } = await supabase.from('proforma_invoice').update(patch).eq('pi_id', existing.id);
          if (e) throw e;
          recordId = existing.id;
        } else {
          const { data, error: e } = await supabase
            .from('proforma_invoice')
            .insert({
              site_id: siteId,
              po_id: poId || null,
              pi_number: docNumber.trim(),
              pi_date: docDate,
              amount: total,
              status: 'sent',
              subject: subject.trim() || null,
              document_id: newDocId,
            })
            .select('pi_id')
            .single();
          if (e) throw e;
          recordId = data.pi_id;
        }
        recordUrl = `/pi/?id=${recordId}`;
      } else if (docType === 'po') {
        if (existing && isOverride) {
          const patch: Record<string, unknown> = { document_id: newDocId, total_value_with_gst: total, po_date: docDate };
          if (subject.trim()) patch.scope_description = subject.trim();
          const { error: e } = await supabase.from('purchase_order').update(patch).eq('po_id', existing.id);
          if (e) throw e;
          recordId = existing.id;
        } else {
          const { data, error: e } = await supabase
            .from('purchase_order')
            .insert({
              site_id: siteId,
              po_number: docNumber.trim(),
              po_date: docDate,
              total_value_with_gst: total,
              status: 'active',
              scope_description: subject.trim() || null,
              document_id: newDocId,
            })
            .select('po_id')
            .single();
          if (e) throw e;
          recordId = data.po_id;
        }
        recordUrl = `/po/?id=${recordId}`;
        if (selectedPiIds.length > 0) {
          const { error: e } = await supabase.from('proforma_invoice').update({ po_id: recordId }).in('pi_id', selectedPiIds);
          if (e) warning = `The work order was saved, but the proforma invoices could not be linked: ${friendlyError(e)}`;
          else linkedCount = selectedPiIds.length;
        }
      } else if (docType === 'invoice') {
        const g = Number.isNaN(gstNum) ? 0 : round2(gstNum);
        if (existing && isOverride) {
          const patch: Record<string, unknown> = {
            document_id: newDocId,
            invoice_date: docDate,
            taxable_value: round2(taxableNum),
            gst_amount: g,
            gross_invoice_value: invoiceTotal,
          };
          if (poId) patch.po_id = poId;
          const { error: e } = await supabase.from('tax_invoice').update(patch).eq('invoice_id', existing.id);
          if (e) throw e;
          recordId = existing.id;
        } else {
          // Same all-or-nothing save the Invoices page uses (also marks the PI as converted).
          const { data, error: e } = await supabase.rpc('record_tax_invoice', {
            p_site_id: siteId,
            p_sub_project_id: null,
            p_po_id: poId || null,
            p_pi_id: invoicePiId || null,
            p_invoice_number: docNumber.trim(),
            p_invoice_date: docDate,
            p_taxable: round2(taxableNum),
            p_gst: g,
            p_gross: invoiceTotal,
            p_document_id: newDocId,
          });
          if (e) throw e;
          recordId = data as string;
        }
        recordUrl = `/site/?id=${siteId}`;
      }

      // Replacing: the record now points at the new file, so the old one can go.
      if (existing && isOverride && isRecordType && existing.document_id) {
        await discardDocument(existing.document_id).catch(() => undefined);
      }

      setActiveSiteIds((prev) => new Set(prev).add(siteId));
      setSuccess({
        documentId: newDocId,
        title: docNumber.trim() || file!.name,
        typeLabel: DOC_TYPE_LABEL[docType],
        siteId,
        siteName: site ? `${site.client_name} — ${site.site_name}` : 'Site',
        recordUrl,
        isUpdate: !!(existing && isOverride),
        linkedCount,
        warning,
      });

      // The document keeps its own copy of the file, so the inbox copy used for reading can go.
      readToken.current++;
      if (inboxIdRef.current) {
        closeInboxItem(inboxIdRef.current, { saved: true, recordType: docType, recordId: recordId ?? newDocId });
        inboxIdRef.current = null;
      }
      setAiState('idle');
      setFile(null);
      setDetected(null);
    } catch (err) {
      // Nothing was saved, so do not leave the uploaded file behind.
      if (newDocId) await discardDocument(newDocId).catch(() => undefined);
      setError(friendlyError(err as { message: string; code?: string }));
    }
    setSubmitting(false);
  }

  function handleReset() {
    abandonReading();
    touched.current = new Set();
    setOverrideChoice(null);
    setPoReference(null);
    setFile(null);
    setDetected(null);
    setSuccess(null);
    setError(null);
    setDocNumber('');
    setDocDate('');
    setAmount('');
    setTaxable('');
    setGst('');
    setSubject('');
    setLinkedPoId(null);
    setSelectedPiIds([]);
    setInvoicePiId('');
  }

  function togglePi(piId: string) {
    setSelectedPiIds((prev) => (prev.includes(piId) ? prev.filter((id) => id !== piId) : [...prev, piId]));
  }

  const numberLabel = isRecordType ? 'Document number' : 'Document number / title (optional)';
  const subjectLabel =
    docType === 'po' ? 'Scope of work' : docType === 'pi' ? 'Subject (what the PI is for)' : 'Notes (optional)';

  return (
    <div className="pb-16">
      <PageHeader
        title="Upload document"
        subtitle="Drop any document: PO / work order, proforma invoice, tax invoice, challan, payment advice or anything else. The app reads it, files it under the right site and records it in the right place."
        icon={<UploadCloud />}
      />

      {error && <ErrorBanner message={error} />}

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-6 lg:px-8">
        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <FileCheck2 size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900">{success.isUpdate ? 'Document replaced' : 'Document filed'}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{success.title}</span> is filed under{' '}
                  <span className="font-semibold text-slate-900">{success.siteName}</span> as a {success.typeLabel.toLowerCase()}.
                </p>
                {success.linkedCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-emerald-800">
                    {success.linkedCount} proforma invoice{success.linkedCount > 1 ? 's' : ''} linked to this work order.
                  </p>
                )}
                {success.warning && <p className="mt-1 text-xs font-semibold text-amber-800">{success.warning}</p>}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    href={`/document/?id=${success.documentId}&title=${encodeURIComponent(success.title)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
                  >
                    <ExternalLink size={14} /> Open document
                  </Link>
                  {success.recordUrl && (
                    <Link
                      href={success.recordUrl}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                    >
                      Open record <ArrowRight size={14} />
                    </Link>
                  )}
                  <Link
                    href={`/documents/?site=${success.siteId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                  >
                    <FolderOpen size={14} /> All documents for this site
                  </Link>
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <RefreshCw size={13} /> Upload another
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!success && (
          <div className="card p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
              }}
              className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/50 via-white to-slate-50/50 px-6 py-10 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50/80"
            >
              <input
                type="file"
                aria-label="Choose a document to upload"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.doc,.docx"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100/80 text-indigo-600 shadow-sm">
                <UploadCloud size={28} />
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">{file ? file.name : 'Choose a document or drop it here'}</h3>
              <p className="mt-1 text-xs text-slate-500">PDF, images, Word or Excel, up to 25 MB</p>
              {file && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-xs font-semibold text-indigo-800">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}
            </div>

            {analyzing && (
              <div className="mt-4 flex animate-pulse items-center justify-center gap-2 text-sm font-medium text-indigo-600">
                <Sparkles size={16} /> Looking at the file…
              </div>
            )}

            {file && aiState === 'reading' && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
                <Loader2 size={16} className="mt-0.5 flex-none animate-spin text-indigo-600" />
                <div>
                  <p className="font-semibold">Reading the document with AI…</p>
                  <p className="mt-0.5 text-xs text-indigo-800/80">
                    Usually 10–30 seconds (up to a minute if the reading service was asleep). The form below already has a quick
                    guess; anything you change yourself is kept.
                  </p>
                </div>
              </div>
            )}

            {file && aiState === 'done' && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
                <p className="flex items-center gap-2 font-semibold">
                  <Sparkles size={15} className="text-emerald-600" /> Read by AI — please check the details below before saving.
                </p>
                {aiNotes.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs text-emerald-900/90">
                    {aiNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {file && (aiState === 'failed' || aiState === 'skipped') && aiMessage && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                <AlertTriangle size={16} className="mt-0.5 flex-none text-amber-700" />
                <div className="flex-1">
                  <p className="font-semibold">{aiState === 'failed' ? 'Could not read this automatically' : 'Not read automatically'}</p>
                  <p className="mt-0.5 text-xs text-amber-900/90">{aiMessage}</p>
                  {aiState === 'failed' && (
                    <button
                      type="button"
                      onClick={() => startReading(file)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:underline"
                    >
                      <RefreshCw size={12} /> Read again
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {file && !success && (
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Where it goes</span>
                {detected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                    <Sparkles size={12} /> {aiState === 'done' ? 'Read by AI' : 'Quick guess from file'} ({detected.confidence} confidence)
                  </span>
                )}
              </div>
            }
          >
            <div className="space-y-5 p-6">
              {existing && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="mt-0.5 flex-none text-amber-700" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-950">
                        This site already has {DOC_TYPE_LABEL[docType].toLowerCase()} {existing.number}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        Dated {existing.date} · {formatINR(existing.amount)}
                      </p>
                      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-950">
                        <input
                          type="checkbox"
                          checked={isOverride}
                          onChange={(e) => setOverrideChoice(e.target.checked)}
                          className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                        />
                        Replace it with this copy (updates its date and amount and swaps the attached file)
                      </label>
                      {!isOverride && (
                        <p className="mt-1.5 text-xs text-amber-800">
                          This will be saved as a separate record with the same number. Untick only if it really is a different
                          document.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldSelect
                  label="Kind of document"
                  value={docType}
                  onChange={(v) => {
                    markTouched('docType');
                    setDocType((v || 'other') as UploadDocType);
                  }}
                  options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))}
                />

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="upload-site" className="block text-xs font-medium text-slate-600">
                      Client — Site
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAllSites(!showAllSites)}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      {showAllSites ? 'Show active sites only' : 'Show all sites'}
                    </button>
                  </div>
                  <select
                    id="upload-site"
                    value={siteId}
                    onChange={(e) => {
                      markTouched('site');
                      chooseSite(e.target.value);
                    }}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select site…</option>
                    {filteredSites.map((s) => (
                      <option key={s.site_id} value={s.site_id}>
                        {s.client_name} — {s.site_name} {!activeSiteIds.has(s.site_id) ? '(new site)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <FieldInput
                  label={numberLabel}
                  value={docNumber}
                  onChange={(v) => {
                    markTouched('docNumber');
                    setDocNumber(v);
                  }}
                  placeholder={docType === 'challan' ? 'e.g. DC-118' : 'e.g. S5/PI/2026/042 or WO-CHSSPL-007'}
                />

                <FieldInput
                  label={isRecordType ? 'Document date' : 'Document date (optional)'}
                  type="date"
                  value={docDate}
                  onChange={(v) => {
                    markTouched('docDate');
                    setDocDate(v);
                  }}
                />

                {(docType === 'po' || docType === 'pi') && (
                  <FieldInput
                    label="Total amount (with GST)"
                    value={amount}
                    onChange={(v) => {
                      markTouched('amount');
                      setAmount(v);
                    }}
                    placeholder="e.g. 145000"
                  />
                )}

                {docType === 'invoice' && (
                  <>
                    <FieldInput
                      label="Taxable value (before GST)"
                      value={taxable}
                      onChange={(v) => {
                        markTouched('taxable');
                        setTaxable(v);
                      }}
                      placeholder="e.g. 100000"
                    />
                    <FieldInput
                      label="GST amount"
                      value={gst}
                      onChange={(v) => {
                        markTouched('gst');
                        setGst(v);
                      }}
                      placeholder="e.g. 18000"
                    />
                    <div className="flex items-end pb-2 text-sm text-slate-600">
                      Invoice total: <span className="ml-1.5 font-mono font-semibold text-slate-900">{formatINR(invoiceTotal)}</span>
                    </div>
                  </>
                )}

                <FieldInput
                  label={subjectLabel}
                  value={subject}
                  onChange={(v) => {
                    markTouched('subject');
                    setSubject(v);
                  }}
                  placeholder={docType === 'challan' ? 'e.g. 40 boxes of tiles delivered to Tower B' : 'e.g. Tile work on Lily Pond'}
                  full={docType !== 'po' && docType !== 'pi'}
                />

                {docType !== 'po' && sitePos.length > 0 && (
                  <FieldSelect
                    label="Work order / PO it belongs to (optional)"
                    value={poId}
                    onChange={(v) => {
                      markTouched('linkedPo');
                      setLinkedPoId(v);
                    }}
                    options={sitePos.map((p) => ({ value: p.po_id, label: `PO/WO ${p.po_number}` }))}
                  />
                )}

                {docType === 'invoice' && !(existing && isOverride) && openPis.length > 0 && (
                  <FieldSelect
                    label="Raised against proforma invoice (optional)"
                    value={invoicePiId}
                    onChange={setInvoicePiId}
                    options={openPis.map((p) => ({ value: p.pi_id, label: `PI ${p.pi_number} · ${formatINR(p.amount)}` }))}
                  />
                )}
              </div>

              {docType === 'po' && unlinkedPis.length > 0 && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Link2 size={15} className="text-indigo-600" />
                    <span>Link proforma invoices to this work order (optional)</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Tick the PIs on this site that this work order covers.</p>
                  <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {unlinkedPis.map((p) => (
                      <label
                        key={p.pi_id}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                          selectedPiIds.includes(p.pi_id)
                            ? 'border-indigo-300 bg-white font-medium text-indigo-950 shadow-2xs'
                            : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedPiIds.includes(p.pi_id)}
                            onChange={() => togglePi(p.pi_id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-mono font-semibold">{p.pi_number}</span>
                          {p.subject && <span className="max-w-xs truncate text-slate-500">· {p.subject}</span>}
                        </div>
                        <span className="font-mono font-bold text-slate-900">{formatINR(p.amount)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {!isRecordType && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  This is filed under the site{poId ? ' and work order' : ''} and appears in its documents list. It does not change
                  any amounts.{docType === 'payment_advice' ? ' To record the money received, use the Payments page.' : ''}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <GhostButton onClick={handleReset} disabled={submitting}>
                  Cancel
                </GhostButton>
                <PrimaryButton onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Saving…' : isOverride ? 'Replace and save' : 'Save and file'}
                </PrimaryButton>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-slate-400">Loading upload tool…</div>}>
      <UploadPageInner />
    </Suspense>
  );
}
