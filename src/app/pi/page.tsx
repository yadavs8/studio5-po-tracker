'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { documentDownloadUrl } from '@/lib/documents';
import { formatINR, formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, Panel, StatusBadge, buttonClass } from '@/lib/ui';
import { ArrowLeft, Download, ExternalLink, FileText } from 'lucide-react';

interface PiDetail {
  pi_id: string;
  pi_number: string;
  pi_date: string;
  amount: number;
  status: string;
  subject: string | null;
  remarks: string | null;
  document_id: string | null;
  po_id: string | null;
  site: {
    site_id: string;
    site_name: string;
    client: {
      display_name: string;
    } | null;
  } | null;
  sub_project: {
    sub_project_id: string;
    name: string;
  } | null;
  po: {
    po_id: string;
    po_number: string;
  } | null;
}

function PiDetailPageInner() {
  const id = useSearchParams().get('id') ?? '';
  const [pi, setPi] = useState<PiDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No proforma invoice ID specified.');
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from('proforma_invoice')
        .select(`
          pi_id, pi_number, pi_date, amount, status, subject, remarks, document_id, po_id,
          site:site_id(site_id, site_name, client:client_id(display_name)),
          sub_project:sub_project_id(sub_project_id, name),
          po:po_id(po_id, po_number)
        `)
        .eq('pi_id', id)
        .single();

      if (qErr) {
        setError(qErr.message);
      } else {
        setPi(data as unknown as PiDetail);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDownload() {
    if (!pi?.document_id) return;
    setDownloading(true);
    try {
      const url = await documentDownloadUrl(pi.document_id);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  }

  const clientName = pi?.site?.client?.display_name;
  const siteName = pi?.site?.site_name;
  const subtitle = clientName && siteName ? `${clientName} — ${siteName}` : siteName || clientName || '';

  return (
    <div className="pb-12">
      <PageHeader
        title={pi?.pi_number ?? 'Proforma invoice'}
        subtitle={subtitle}
        actions={
          pi?.document_id ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/document/?id=${pi.document_id}&title=${encodeURIComponent(pi.pi_number)}`}
                className={buttonClass}
              >
                <ExternalLink size={15} /> Open document
              </Link>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className={buttonClass}
              >
                <Download size={15} /> {downloading ? 'Downloading…' : 'Download'}
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400">No file attached</span>
          )
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="space-y-6 px-6 py-6 lg:px-8">
        <Link
          href="/pis"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={15} /> Proforma invoices
        </Link>

        {loading ? (
          <div className="card space-y-4 p-6">
            <div className="skeleton h-6 w-1/3" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !pi ? (
          <div className="card p-8 text-center text-sm text-slate-400">
            Proforma invoice not found.
          </div>
        ) : (
          <Panel title="Details">
            <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Date</div>
                <div className="mt-1 font-mono text-sm font-medium text-slate-900">{formatDate(pi.pi_date)}</div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Amount</div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-900">{formatINR(pi.amount)}</div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Status</div>
                <div className="mt-1">
                  <StatusBadge status={pi.status} />
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <div className="text-xs font-medium text-slate-500">Subject</div>
                <div className="mt-1 text-sm text-slate-800">{pi.subject || '—'}</div>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <div className="text-xs font-medium text-slate-500">Work status / Remarks</div>
                <div className="mt-1 text-sm text-slate-800">{pi.remarks || '—'}</div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Linked PO / WO</div>
                <div className="mt-1 text-sm">
                  {pi.po ? (
                    <Link
                      href={`/po/?id=${pi.po.po_id}`}
                      className="font-mono font-medium text-sky-700 hover:underline"
                    >
                      {pi.po.po_number}
                    </Link>
                  ) : (
                    <span className="text-slate-400">None linked</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Sub-project</div>
                <div className="mt-1 text-sm text-slate-800">{pi.sub_project?.name || '—'}</div>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500">Site</div>
                <div className="mt-1 text-sm">
                  {pi.site ? (
                    <Link
                      href={`/site/?id=${pi.site.site_id}`}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {pi.site.site_name}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <div className="text-xs font-medium text-slate-500">Attached document</div>
                <div className="mt-2 flex items-center gap-3">
                  {pi.document_id ? (
                    <>
                      <Link
                        href={`/document/?id=${pi.document_id}&title=${encodeURIComponent(pi.pi_number)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <FileText size={14} className="text-slate-500" /> View document
                      </Link>
                      <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Download size={14} className="text-slate-500" /> {downloading ? 'Downloading…' : 'Download'}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">No file attached</span>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function PiDetailPage() {
  return (
    <Suspense fallback={null}>
      <PiDetailPageInner />
    </Suspense>
  );
}
