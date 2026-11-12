'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FolderOpen, UploadCloud } from 'lucide-react';
import { PageHeader, Panel } from '@/lib/ui';
import { DocumentList } from '@/components/DocumentList';

function DocumentsPageInner() {
  const site = useSearchParams().get('site') ?? '';
  return (
    <div className="pb-12">
      <PageHeader
        title="Documents"
        subtitle="Every document in one place: POs and work orders, proforma invoices, tax invoices, payment advices, challans and letters, filed by site."
        icon={<FolderOpen />}
        actions={
          <Link
            href={site ? `/upload/?site=${site}` : '/upload'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition-all hover:from-blue-700 hover:to-indigo-800"
          >
            <UploadCloud size={15} /> Upload document
          </Link>
        }
      />
      <div className="px-6 py-6 lg:px-8">
        <Panel title="All documents">
          <DocumentList initialSite={site} />
        </Panel>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-slate-400">Loading documents…</div>}>
      <DocumentsPageInner />
    </Suspense>
  );
}
