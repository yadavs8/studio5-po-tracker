'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { documentInfo, documentUrl, documentDownloadUrl } from '@/lib/documents';
import { PageHeader, ErrorBanner, PrimaryButton, buttonClass } from '@/lib/ui';
import { friendlyError, isUuid } from '@/lib/plain';
import { ArrowLeft, Download, ExternalLink, FileQuestion } from 'lucide-react';

function DocumentPageInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const title = searchParams.get('title') ?? 'Document';

  const [info, setInfo] = useState<{ path: string; fileName: string; ext: string } | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const validId = isUuid(id);
  useEffect(() => {
    if (!validId) return; // handled in render: no request for a bad link

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [docInfo, url] = await Promise.all([
          documentInfo(id),
          documentUrl(id),
        ]);

        if (!docInfo || !url) {
          setError('Document could not be found or loaded.');
        } else {
          setInfo(docInfo);
          setSignedUrl(url);
        }
      } catch (err) {
        setError(friendlyError(err as Error));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, validId]);

  async function handleOpenNewTab() {
    if (!id) return;
    try {
      const freshUrl = await documentUrl(id);
      if (freshUrl) window.open(freshUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(`Could not open the file: ${friendlyError(err as Error)}`);
    }
  }

  async function handleDownload() {
    if (!id) return;
    setDownloading(true);
    try {
      const freshUrl = await documentDownloadUrl(id);
      if (freshUrl) {
        const a = document.createElement('a');
        a.href = freshUrl;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      setError(`Could not download the file: ${friendlyError(err as Error)}`);
    } finally {
      setDownloading(false);
    }
  }

  const isImage = info ? ['png', 'jpg', 'jpeg', 'webp'].includes(info.ext) : false;
  const isPdf = info?.ext === 'pdf';

  const shownError = !validId ? 'This link is not valid: it does not point at a document. Please open it again from the documents list.' : error;

  return (
    <div className="pb-12">
      <PageHeader
        title={title}
        subtitle={info?.fileName}
        actions={
          info ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenNewTab}
                className={buttonClass}
              >
                <ExternalLink size={15} /> Open in new tab
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className={buttonClass}
              >
                <Download size={15} /> {downloading ? 'Downloading…' : 'Download'}
              </button>
            </div>
          ) : undefined
        }
      />
      {shownError && <ErrorBanner message={shownError} />}

      <div className="space-y-4 px-6 py-6 lg:px-8">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {validId && loading ? (
          <div className="card space-y-4 p-8">
            <div className="skeleton h-8 w-1/4" />
            <div className="skeleton h-[calc(100vh-240px)] w-full" />
          </div>
        ) : !info || !signedUrl ? (
          <div className="card p-12 text-center text-sm text-slate-400">
            Unable to display document.
          </div>
        ) : isPdf ? (
          <div className="card overflow-hidden">
            <iframe
              src={signedUrl}
              title={title}
              className="h-[calc(100vh-140px)] w-full border-0 bg-white"
            />
          </div>
        ) : isImage ? (
          <div className="card flex items-center justify-center p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL in a static export: next/image cannot optimise it */}
            <img
              src={signedUrl}
              alt={title}
              className="max-h-[calc(100vh-180px)] max-w-full rounded-lg border border-slate-200 object-contain shadow-sm"
            />
          </div>
        ) : (
          <div className="card mx-auto max-w-xl p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <FileQuestion size={24} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-900">
              This file type can&apos;t be previewed in the browser
            </h3>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {info.fileName}
            </p>
            <div className="mt-6 flex justify-center">
              <PrimaryButton onClick={handleDownload} disabled={downloading}>
                <Download size={16} /> {downloading ? 'Downloading…' : 'Download file'}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocumentPage() {
  return (
    <Suspense fallback={null}>
      <DocumentPageInner />
    </Suspense>
  );
}
