'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { documentDownloadUrl } from '@/lib/documents';
import { formatINR, formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, Panel, DataTable, Td, StatusBadge, EmptyState, buttonClass } from '@/lib/ui';
import { ArrowLeft, Download, ExternalLink, FileText } from 'lucide-react';

interface PoDetail {
  po_id: string;
  po_number: string;
  po_date: string;
  scope_description: string | null;
  taxable_value: number | null;
  gst_amount: number | null;
  total_value_with_gst: number;
  advance_pct: number | null;
  retention_pct: number | null;
  status: string;
  document_id: string | null;
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
}

interface LinkedPi {
  pi_id: string;
  pi_number: string;
  pi_date: string;
  amount: number;
  status: string;
  subject: string | null;
  document: {
    file_url: string;
  } | null;
}

function PoDetailPageInner() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const [po, setPo] = useState<PoDetail | null>(null);
  const [linkedPis, setLinkedPis] = useState<LinkedPi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No order ID specified.');
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      const [poRes, pisRes] = await Promise.all([
        supabase
          .from('purchase_order')
          .select(`
            po_id, po_number, po_date, scope_description, taxable_value, gst_amount, total_value_with_gst,
            advance_pct, retention_pct, status, document_id,
            site:site_id(site_id, site_name, client:client_id(display_name)),
            sub_project:sub_project_id(sub_project_id, name)
          `)
          .eq('po_id', id)
          .single(),
        supabase
          .from('proforma_invoice')
          .select('pi_id, pi_number, pi_date, amount, status, subject, document:document_id(file_url)')
          .eq('po_id', id)
          .order('pi_date', { ascending: false }),
      ]);

      if (poRes.error) {
        setError(poRes.error.message);
      } else {
        setPo(poRes.data as unknown as PoDetail);
      }

      if (!pisRes.error && pisRes.data) {
        setLinkedPis(pisRes.data as unknown as LinkedPi[]);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleDownload() {
    if (!po?.document_id) return;
    setDownloading(true);
    try {
      const url = await documentDownloadUrl(po.document_id);
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

  const clientName = po?.site?.client?.display_name;
  const siteName = po?.site?.site_name;
  const subtitle = clientName && siteName ? `${clientName} — ${siteName}` : siteName || clientName || '';

  return (
    <div className="pb-12">
      <PageHeader
        title={po?.po_number ?? 'Purchase order'}
        subtitle={subtitle}
        actions={
          po?.document_id ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/document/?id=${po.document_id}&title=${encodeURIComponent(po.po_number)}`}
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
          href="/pos"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={15} /> POs / WOs
        </Link>

        {loading ? (
          <div className="card space-y-4 p-6">
            <div className="skeleton h-6 w-1/3" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !po ? (
          <div className="card p-8 text-center text-sm text-slate-400">
            Purchase order not found.
          </div>
        ) : (
          <>
            <Panel title="Order Details">
              <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs font-medium text-slate-500">PO / WO Date</div>
                  <div className="mt-1 font-mono text-sm font-medium text-slate-900">{formatDate(po.po_date)}</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">Total Value (with GST)</div>
                  <div className="mt-1 font-mono text-base font-semibold text-slate-900">{formatINR(po.total_value_with_gst)}</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">Status</div>
                  <div className="mt-1">
                    <StatusBadge status={po.status} />
                  </div>
                </div>

                {po.taxable_value != null && (
                  <div>
                    <div className="text-xs font-medium text-slate-500">Taxable Value</div>
                    <div className="mt-1 font-mono text-sm text-slate-800">{formatINR(po.taxable_value)}</div>
                  </div>
                )}

                {po.gst_amount != null && (
                  <div>
                    <div className="text-xs font-medium text-slate-500">GST Amount</div>
                    <div className="mt-1 font-mono text-sm text-slate-800">{formatINR(po.gst_amount)}</div>
                  </div>
                )}

                {po.advance_pct != null && (
                  <div>
                    <div className="text-xs font-medium text-slate-500">Advance %</div>
                    <div className="mt-1 font-mono text-sm text-slate-800">{po.advance_pct}%</div>
                  </div>
                )}

                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="text-xs font-medium text-slate-500">Scope Description</div>
                  <div className="mt-1 text-sm text-slate-800">{po.scope_description || '—'}</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">Sub-project</div>
                  <div className="mt-1 text-sm text-slate-800">{po.sub_project?.name || '—'}</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">Site</div>
                  <div className="mt-1 text-sm">
                    {po.site ? (
                      <Link
                        href={`/site/?id=${po.site.site_id}`}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {po.site.site_name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="text-xs font-medium text-slate-500">Attached document</div>
                  <div className="mt-2 flex items-center gap-3">
                    {po.document_id ? (
                      <>
                        <Link
                          href={`/document/?id=${po.document_id}&title=${encodeURIComponent(po.po_number)}`}
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

            <Panel title={`Linked Proforma Invoices (${linkedPis.length})`}>
              {linkedPis.length === 0 ? (
                <EmptyState text="No proforma invoices linked to this PO/WO yet." />
              ) : (
                <DataTable
                  columns={[
                    { label: 'PI no.' },
                    { label: 'Date' },
                    { label: 'Subject' },
                    { label: 'Amount', align: 'right' },
                    { label: 'Status' },
                    { label: 'File' },
                  ]}
                >
                  {linkedPis.map((p) => {
                    const ext = p.document?.file_url ? p.document.file_url.split('.').pop()?.toUpperCase() : null;
                    return (
                      <tr
                        key={p.pi_id}
                        onClick={() => router.push(`/pi/?id=${p.pi_id}`)}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                      >
                        <Td mono>{p.pi_number}</Td>
                        <Td mono>{formatDate(p.pi_date)}</Td>
                        <Td>{p.subject || '—'}</Td>
                        <Td align="right" mono>{formatINR(p.amount)}</Td>
                        <Td><StatusBadge status={p.status} /></Td>
                        <Td>
                          {ext ? (
                            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium uppercase text-slate-700">
                              {ext}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </DataTable>
              )}
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

export default function PoDetailPage() {
  return (
    <Suspense fallback={null}>
      <PoDetailPageInner />
    </Suspense>
  );
}
