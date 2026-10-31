'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatINR } from '@/lib/format';
import { uploadDocument, replaceDocument, UploadDocType } from '@/lib/documents';
import { detectDocument, SiteMeta, DetectedDocument } from '@/lib/detector';
import {
  PageHeader,
  ErrorBanner,
  Panel,
  PrimaryButton,
  GhostButton,
  FieldInput,
  FieldSelect,
  buttonClass,
} from '@/lib/ui';
import {
  UploadCloud,
  FileCheck2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Link2,
} from 'lucide-react';

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
}

function UploadPageInner() {
  const router = useRouter();

  const [sites, setSites] = useState<SiteMeta[]>([]);
  const [activeSiteIds, setActiveSiteIds] = useState<Set<string>>(new Set());
  const [showAllSites, setShowAllSites] = useState(false);
  const [loadingSites, setLoadingSites] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detected, setDetected] = useState<DetectedDocument | null>(null);

  // Form editable states
  const [docType, setDocType] = useState<UploadDocType>('pi');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState('');
  const [amount, setAmount] = useState('');
  const [subjectOrScope, setSubjectOrScope] = useState('');
  const [isOverride, setIsOverride] = useState(true);

  // Cross-linking: PO to PIs and PI to PO/WO
  const [sitePos, setSitePos] = useState<SitePoOpt[]>([]);
  const [sitePis, setSitePis] = useState<SitePiOpt[]>([]);
  const [linkedPoId, setLinkedPoId] = useState('');
  const [selectedPiIds, setSelectedPiIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    documentId: string;
    title: string;
    detailsUrl: string;
    siteName: string;
    isUpdate: boolean;
    linkedCount?: number;
  } | null>(null);

  // Load clients and sites, plus determine active sites
  useEffect(() => {
    async function loadData() {
      setLoadingSites(true);
      try {
        const [siteRes, poRes, piRes, invRes] = await Promise.all([
          supabase.from('site').select('site_id, site_name, client_id, client:client_id(display_name)').order('site_name'),
          supabase.from('purchase_order').select('site_id'),
          supabase.from('proforma_invoice').select('site_id'),
          supabase.from('tax_invoice').select('site_id'),
        ]);

        const allSites: SiteMeta[] = (siteRes.data ?? []).map((s: any) => ({
          site_id: s.site_id,
          site_name: s.site_name,
          client_id: s.client_id,
          client_name: s.client?.display_name ?? 'Client',
        }));
        setSites(allSites);

        const active = new Set<string>();
        (poRes.data ?? []).forEach((p: any) => p.site_id && active.add(p.site_id));
        (piRes.data ?? []).forEach((p: any) => p.site_id && active.add(p.site_id));
        (invRes.data ?? []).forEach((i: any) => i.site_id && active.add(i.site_id));
        setActiveSiteIds(active);
      } catch (err) {
        setError((err as Error).message);
      }
      setLoadingSites(false);
    }
    loadData();
  }, []);

  // When selectedSiteId changes, load existing POs and PIs for cross-linking
  useEffect(() => {
    if (!selectedSiteId) {
      setSitePos([]);
      setSitePis([]);
      setLinkedPoId('');
      setSelectedPiIds([]);
      return;
    }

    Promise.all([
      supabase.from('purchase_order').select('po_id, po_number').eq('site_id', selectedSiteId).order('po_date', { ascending: false }),
      supabase.from('proforma_invoice').select('pi_id, pi_number, amount, subject, po_id').eq('site_id', selectedSiteId).order('pi_date', { ascending: false }),
    ]).then(([poRes, piRes]) => {
      setSitePos((poRes.data ?? []) as SitePoOpt[]);
      const pis = (piRes.data ?? []) as SitePiOpt[];
      setSitePis(pis);
      // Pre-select unlinked PIs when uploading a new Work Order
      setSelectedPiIds(pis.filter((p) => !p.po_id).map((p) => p.pi_id));
    });
  }, [selectedSiteId]);

  // When a file is selected, run smart auto-detection
  async function handleFileSelect(selectedFile: File | null) {
    setFile(selectedFile);
    setSuccessInfo(null);
    setError(null);
    if (!selectedFile) {
      setDetected(null);
      return;
    }

    setAnalyzing(true);
    try {
      const result = await detectDocument(selectedFile, sites);
      setDetected(result);

      // Pre-fill fields
      setDocType(result.docType);
      if (result.siteId) {
        setSelectedSiteId(result.siteId);
      }
      setDocNumber(result.docNumber);
      setDocDate(result.date);
      setAmount(result.amount ? String(result.amount) : '');
      setSubjectOrScope(result.subjectOrScope);
      setIsOverride(!!result.existingRecord);
    } catch (err) {
      setError(`Auto-analysis error: ${(err as Error).message}`);
    }
    setAnalyzing(false);
  }

  // Sites list to show in dropdown: active only, unless user requests all
  const filteredSites = showAllSites
    ? sites
    : sites.filter((s) => activeSiteIds.has(s.site_id) || s.site_id === selectedSiteId);

  // Submit and route document
  async function handleSubmit() {
    if (!file) {
      setError('Please choose a file to upload.');
      return;
    }
    if (!selectedSiteId) {
      setError('Please select the site this document belongs to.');
      return;
    }
    if (!docNumber.trim()) {
      setError('Please provide a document number.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const siteMeta = sites.find((s) => s.site_id === selectedSiteId);
      const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0;
      let newDocId: string;
      let detailsUrl = '';
      let isUpdate = false;
      let linkedCount = 0;

      if (docType === 'pi') {
        // PROFORMA INVOICE
        if (detected?.existingRecord && isOverride) {
          // Replace existing PI
          newDocId = await replaceDocument(detected.existingRecord.document_id, file, 'pi');
          const { error: updErr } = await supabase
            .from('proforma_invoice')
            .update({
              document_id: newDocId,
              amount: parsedAmount || detected.existingRecord.amount,
              pi_date: docDate || detected.existingRecord.date,
              subject: subjectOrScope || null,
              po_id: linkedPoId || null,
            })
            .eq('pi_id', detected.existingRecord.id);
          if (updErr) throw new Error(updErr.message);
          detailsUrl = `/pi/?id=${detected.existingRecord.id}`;
          isUpdate = true;
        } else {
          // Create new PI
          newDocId = (await uploadDocument(file, 'pi'))!;
          const { data: newPi, error: insErr } = await supabase
            .from('proforma_invoice')
            .insert({
              site_id: selectedSiteId,
              po_id: linkedPoId || null,
              pi_number: docNumber.trim(),
              pi_date: docDate,
              amount: parsedAmount,
              status: 'issued',
              subject: subjectOrScope || null,
              document_id: newDocId,
            })
            .select('pi_id')
            .single();
          if (insErr) throw new Error(insErr.message);
          detailsUrl = `/pi/?id=${newPi.pi_id}`;
        }
      } else if (docType === 'po') {
        // PURCHASE ORDER / WORK ORDER
        let targetPoId: string;
        if (detected?.existingRecord && isOverride) {
          // Replace existing PO / WO
          newDocId = await replaceDocument(detected.existingRecord.document_id, file, 'po');
          const { error: updErr } = await supabase
            .from('purchase_order')
            .update({
              document_id: newDocId,
              total_value_with_gst: parsedAmount || detected.existingRecord.amount,
              po_date: docDate || detected.existingRecord.date,
              scope_description: subjectOrScope || null,
            })
            .eq('po_id', detected.existingRecord.id);
          if (updErr) throw new Error(updErr.message);
          targetPoId = detected.existingRecord.id;
          detailsUrl = `/po/?id=${detected.existingRecord.id}`;
          isUpdate = true;
        } else {
          // Create new PO / WO
          newDocId = (await uploadDocument(file, 'po'))!;
          const { data: newPo, error: insErr } = await supabase
            .from('purchase_order')
            .insert({
              site_id: selectedSiteId,
              po_number: docNumber.trim(),
              po_date: docDate,
              total_value_with_gst: parsedAmount,
              status: 'released',
              scope_description: subjectOrScope || null,
              document_id: newDocId,
            })
            .select('po_id')
            .single();
          if (insErr) throw new Error(insErr.message);
          targetPoId = newPo.po_id;
          detailsUrl = `/po/?id=${newPo.po_id}`;
        }

        // Link selected Proforma Invoices (PIs) to this Work Order
        if (targetPoId && selectedPiIds.length > 0) {
          const { error: linkErr } = await supabase
            .from('proforma_invoice')
            .update({ po_id: targetPoId })
            .in('pi_id', selectedPiIds);
          if (!linkErr) {
            linkedCount = selectedPiIds.length;
          }
        }
      } else if (docType === 'invoice') {
        // TAX INVOICE
        if (detected?.existingRecord && isOverride) {
          newDocId = await replaceDocument(detected.existingRecord.document_id, file, 'invoice');
          const { error: updErr } = await supabase
            .from('tax_invoice')
            .update({
              document_id: newDocId,
              gross_invoice_value: parsedAmount || detected.existingRecord.amount,
              invoice_date: docDate || detected.existingRecord.date,
            })
            .eq('invoice_id', detected.existingRecord.id);
          if (updErr) throw new Error(updErr.message);
          detailsUrl = `/invoices`;
          isUpdate = true;
        } else {
          newDocId = (await uploadDocument(file, 'invoice'))!;
          const { error: insErr } = await supabase.from('tax_invoice').insert({
            site_id: selectedSiteId,
            invoice_number: docNumber.trim(),
            invoice_date: docDate,
            gross_invoice_value: parsedAmount,
            status: 'issued',
            document_id: newDocId,
          });
          if (insErr) throw new Error(insErr.message);
          detailsUrl = `/invoices`;
        }
      } else {
        // GENERAL / CHALLAN / PAYMENT ADVICE
        newDocId = (await uploadDocument(file, docType))!;
        detailsUrl = `/document/?id=${newDocId}&title=${encodeURIComponent(docNumber)}`;
      }

      // Mark this site as active in local state
      setActiveSiteIds((prev) => new Set(prev).add(selectedSiteId));

      setSuccessInfo({
        documentId: newDocId,
        title: docNumber,
        detailsUrl,
        siteName: siteMeta ? `${siteMeta.client_name} — ${siteMeta.site_name}` : 'Site',
        isUpdate,
        linkedCount,
      });

      // Clear file
      setFile(null);
      setDetected(null);
    } catch (err) {
      setError(`Upload & routing failed: ${(err as Error).message}`);
    }
    setSubmitting(false);
  }

  function handleReset() {
    setFile(null);
    setDetected(null);
    setSuccessInfo(null);
    setError(null);
    setDocNumber('');
    setDocDate('');
    setAmount('');
    setSubjectOrScope('');
    setLinkedPoId('');
    setSelectedPiIds([]);
  }

  function togglePiSelection(piId: string) {
    setSelectedPiIds((prev) =>
      prev.includes(piId) ? prev.filter((id) => id !== piId) : [...prev, piId]
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="Upload & Route Document"
        subtitle="Single point of document upload. Drop any PI, PO / Work Order, Tax Invoice, or Challan — the application auto-detects its destination and updates records."
        icon={<UploadCloud />}
      />

      {error && <ErrorBanner message={error} />}

      <div className="mx-auto max-w-4xl px-6 py-6 lg:px-8 space-y-6">
        {/* SUCCESS CARD */}
        {successInfo && (
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <FileCheck2 size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900">
                  {successInfo.isUpdate ? 'Document Updated & Overridden' : 'Document Successfully Routed!'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{successInfo.title}</span> has been saved and linked to{' '}
                  <span className="font-semibold text-slate-900">{successInfo.siteName}</span>.
                </p>
                {successInfo.linkedCount && successInfo.linkedCount > 0 ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-800">
                    🔗 {successInfo.linkedCount} Proforma Invoice{successInfo.linkedCount > 1 ? 's' : ''} linked to this Work Order!
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    href={`/document/?id=${successInfo.documentId}&title=${encodeURIComponent(successInfo.title)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
                  >
                    <ExternalLink size={14} /> Open in Document Viewer
                  </Link>
                  {successInfo.detailsUrl && (
                    <Link
                      href={successInfo.detailsUrl}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
                    >
                      View Details Page <ArrowRight size={14} />
                    </Link>
                  )}
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <RefreshCw size={13} /> Upload Another
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* DRAG AND DROP ZONE */}
        {!successInfo && (
          <div className="card p-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
              }}
              className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-200 bg-gradient-to-b from-indigo-50/50 via-white to-slate-50/50 px-6 py-10 text-center transition-all hover:border-indigo-400 hover:bg-indigo-50/80 cursor-pointer"
            >
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
                onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100/80 text-indigo-600 shadow-sm">
                <UploadCloud size={28} />
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                {file ? file.name : 'Choose a document or drop it here'}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                PDF, Word (.docx), Excel (.xlsx), or images up to 25 MB
              </p>
              {file && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-xs font-semibold text-indigo-800">
                  Selected: {(file.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}
            </div>

            {analyzing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-indigo-600 animate-pulse">
                <Sparkles size={16} /> Analyzing document content & detecting destination…
              </div>
            )}
          </div>
        )}

        {/* DETECTED DETAILS & REVIEW FORM */}
        {file && !successInfo && (
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Destination & Document Details</span>
                {detected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                    <Sparkles size={12} /> Auto-detected ({detected.confidence} confidence)
                  </span>
                )}
              </div>
            }
          >
            <div className="p-6 space-y-5">
              {/* REVISION / OVERRIDE WARNING IF RECORD EXISTS */}
              {detected?.existingRecord && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="mt-0.5 flex-none text-amber-700" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-950">
                        Existing {detected.existingRecord.table.replace(/_/g, ' ').toUpperCase()} found in system:
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        No. <span className="font-mono font-bold">{detected.existingRecord.number}</span> | Date:{' '}
                        {detected.existingRecord.date} | Amount: {formatINR(detected.existingRecord.amount)}
                      </p>
                      <label className="mt-3 flex items-center gap-2 cursor-pointer font-medium text-xs text-amber-950">
                        <input
                          type="checkbox"
                          checked={isOverride}
                          onChange={(e) => setIsOverride(e.target.checked)}
                          className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                        />
                        Replace / Overwrite previous version (deletes old draft file from storage and updates SOA)
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldSelect
                  label="Document Category"
                  value={docType}
                  onChange={(v) => setDocType(v as UploadDocType)}
                  options={[
                    { value: 'pi', label: 'Proforma Invoice (PI)' },
                    { value: 'po', label: 'Purchase Order / Work Order (PO/WO)' },
                    { value: 'invoice', label: 'Tax Invoice' },
                    { value: 'other', label: 'Delivery Challan / Handover' },
                    { value: 'payment_advice', label: 'Payment Advice / Receipt' },
                  ]}
                />

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-600">Client — Site</label>
                    <button
                      type="button"
                      onClick={() => setShowAllSites(!showAllSites)}
                      className="text-[11px] font-medium text-indigo-600 hover:underline"
                    >
                      {showAllSites ? 'Show active sites only' : 'Show all sites'}
                    </button>
                  </div>
                  <select
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="">Select site…</option>
                    {filteredSites.map((s) => (
                      <option key={s.site_id} value={s.site_id}>
                        {s.client_name} — {s.site_name} {!activeSiteIds.has(s.site_id) ? '(New site)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <FieldInput
                  label="Document Number"
                  value={docNumber}
                  onChange={setDocNumber}
                  placeholder="e.g. S5/PI/2026/042 or WO-CHSSPL-007"
                />

                <FieldInput
                  label="Document Date"
                  type="date"
                  value={docDate}
                  onChange={setDocDate}
                />

                <FieldInput
                  label="Total Value / Amount (INR with GST)"
                  value={amount}
                  onChange={setAmount}
                  placeholder="e.g. 145000"
                />

                <FieldInput
                  label="Scope of Work / Subject / Remarks"
                  value={subjectOrScope}
                  onChange={setSubjectOrScope}
                  placeholder="e.g. Tile Work on Lily Pond"
                />

                {/* If PI: allow linking to existing Work Order */}
                {docType === 'pi' && sitePos.length > 0 && (
                  <div className="sm:col-span-2">
                    <FieldSelect
                      label="Link to Work Order / PO (optional)"
                      value={linkedPoId}
                      onChange={setLinkedPoId}
                      options={sitePos.map((p) => ({ value: p.po_id, label: `PO/WO ${p.po_number}` }))}
                    />
                  </div>
                )}
              </div>

              {/* If PO/WO: allow linking to existing PIs on that site */}
              {docType === 'po' && sitePis.length > 0 && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <Link2 size={15} className="text-indigo-600" />
                    <span>Link Proforma Invoices (PIs) to this Work Order</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Select any PIs on this site covered by this Work Order to update their status and link them automatically:
                  </p>
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {sitePis.map((p) => (
                      <label
                        key={p.pi_id}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors ${
                          selectedPiIds.includes(p.pi_id)
                            ? 'border-indigo-300 bg-white font-medium text-indigo-950 shadow-2xs'
                            : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedPiIds.includes(p.pi_id)}
                            onChange={() => togglePiSelection(p.pi_id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-mono font-semibold">{p.pi_number}</span>
                          {p.subject && <span className="text-slate-500 truncate max-w-xs">· {p.subject}</span>}
                        </div>
                        <span className="font-mono font-bold text-slate-900">{formatINR(p.amount)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <GhostButton onClick={handleReset} disabled={submitting}>
                  Cancel
                </GhostButton>
                <PrimaryButton onClick={handleSubmit} disabled={submitting}>
                  {submitting
                    ? 'Routing Document…'
                    : isOverride && detected?.existingRecord
                    ? 'Confirm & Override'
                    : 'Confirm & Save Document'}
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
