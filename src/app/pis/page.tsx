'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatINR, formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, DataTable, Td, StatusBadge, FileBadge, buttonClass } from '@/lib/ui';
import { Plus, Search } from 'lucide-react';

interface PiItem {
  pi_id: string;
  pi_number: string;
  pi_date: string;
  amount: number;
  status: string;
  subject: string | null;
  remarks: string | null;
  document_id: string | null;
  site: {
    site_id: string;
    site_name: string;
    client: {
      display_name: string;
    } | null;
  } | null;
  document: {
    file_url: string;
  } | null;
}

interface SiteOption {
  site_id: string;
  site_name: string;
}

function PisPageInner() {
  const router = useRouter();
  const [pis, setPis] = useState<PiItem[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const [piRes, siteRes] = await Promise.all([
        supabase
          .from('proforma_invoice')
          .select('pi_id, pi_number, pi_date, amount, status, subject, remarks, document_id, site:site_id(site_id, site_name, client:client_id(display_name)), document:document_id(file_url)')
          .order('pi_date', { ascending: false }),
        supabase
          .from('site')
          .select('site_id, site_name')
          .order('site_name'),
      ]);

      if (piRes.error) {
        setError(piRes.error.message);
      } else {
        setPis((piRes.data ?? []) as unknown as PiItem[]);
      }

      if (!siteRes.error && siteRes.data) {
        setSites(siteRes.data as SiteOption[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return pis.filter((p) => {
      if (siteFilter && p.site?.site_id !== siteFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const piNo = (p.pi_number ?? '').toLowerCase();
      const clientName = (p.site?.client?.display_name ?? '').toLowerCase();
      const siteName = (p.site?.site_name ?? '').toLowerCase();
      const subj = (p.subject ?? '').toLowerCase();
      return piNo.includes(q) || siteName.includes(q) || clientName.includes(q) || subj.includes(q);
    });
  }, [pis, siteFilter, search]);

  return (
    <div className="pb-12">
      <PageHeader
        title="Proforma invoices"
        subtitle="Browse and search all proforma invoices across sites."
        actions={
          <Link href="/po-pi" className={buttonClass}>
            <Plus size={15} /> Add PO / PI
          </Link>
        }
      />
      {error && <ErrorBanner message={error} />}

      <div className="px-6 py-6 lg:px-8">
        {/* Filters */}
        <div className="card mb-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600">Search</label>
            <div className="relative mt-1.5">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PI no., site, client, subject…"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Site filter</label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.site_id} value={s.site_id}>
                  {s.site_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-6">
              <div className="skeleton h-8" />
              <div className="skeleton h-8" />
              <div className="skeleton h-8" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState text={search || siteFilter ? 'No proforma invoices match your search.' : 'No proforma invoices found.'} />
          ) : (
            <DataTable
              columns={[
                { label: 'PI no.' },
                { label: 'Date' },
                { label: 'Client — Site' },
                { label: 'Subject' },
                { label: 'Amount', align: 'right' },
                { label: 'Status' },
                { label: 'File' },
              ]}
            >
              {filtered.map((p) => {
                const ext = p.document?.file_url ? p.document.file_url.split('.').pop()?.toUpperCase() : null;
                const clientName = p.site?.client?.display_name;
                const siteName = p.site?.site_name;
                const clientSite = clientName && siteName ? `${clientName} — ${siteName}` : siteName || clientName || '—';

                return (
                  <tr
                    key={p.pi_id}
                    onClick={() => router.push(`/pi/?id=${p.pi_id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <Td mono>{p.pi_number}</Td>
                    <Td mono>{formatDate(p.pi_date)}</Td>
                    <Td>{clientSite}</Td>
                    <Td>{p.subject ?? '—'}</Td>
                    <Td align="right" mono>{formatINR(p.amount)}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td>
                      <FileBadge ext={ext} />
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PisPage() {
  return (
    <Suspense fallback={null}>
      <PisPageInner />
    </Suspense>
  );
}
