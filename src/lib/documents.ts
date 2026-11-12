import { supabase } from '@/lib/supabase';

/** Matches the database's document_type list (challan added in migration_012). */
export type UploadDocType =
  | 'po'
  | 'pi'
  | 'invoice'
  | 'payment_advice'
  | 'challan'
  | 'tds_certificate'
  | 'correspondence'
  | 'other';

export const DOCUMENT_BUCKET = 'studio5-documents';
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Plain names for each kind of document, in the order they are shown. */
export const DOC_TYPE_LABEL: Record<UploadDocType, string> = {
  po: 'Purchase order / Work order',
  pi: 'Proforma invoice',
  invoice: 'Tax invoice',
  payment_advice: 'Payment advice / Receipt',
  challan: 'Delivery challan',
  tds_certificate: 'TDS certificate',
  correspondence: 'Letter / Correspondence',
  other: 'Other document',
};
export const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as UploadDocType[];

/** Where a document is filed. Records (PO / PI / invoice / payment) fill this in themselves via the database. */
export interface DocumentFiling {
  siteId?: string | null;
  poId?: string | null;
  docNumber?: string | null;
  docDate?: string | null;
  notes?: string | null;
}

/** A row of the documents list, with its site, PO and the record it belongs to. */
export interface DocumentRow {
  document_id: string;
  document_type: UploadDocType;
  doc_number: string | null;
  doc_date: string | null;
  file_name: string | null;
  file_url: string;
  notes: string | null;
  uploaded_at: string;
  site_id: string | null;
  po_id: string | null;
  linked_type: 'purchase_order' | 'proforma_invoice' | 'tax_invoice' | 'payment' | null;
  linked_id: string | null;
  site: { site_name: string; client: { display_name: string } | null } | null;
  po: { po_number: string } | null;
}

const cleanName = (name: string) => name.replace(/[^\w.\-]+/g, '_');
const UUID_PREFIX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_/;

/** The original file name of a stored path, without the folder and the random prefix. */
export const fileNameFromPath = (path: string) => (path.split('/').pop() ?? path).replace(UUID_PREFIX, '');
export const fileExt = (name: string | null | undefined) =>
  name && name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : '';

/**
 * Uploads one file to Storage and records it in `document`, filed under a site when one is given.
 * Returns the new document_id to store on the parent row, or null if no file.
 * Throws with a readable message on failure.
 */
export async function uploadDocument(
  file: File | null,
  documentType: UploadDocType,
  filing: DocumentFiling = {}
): Promise<string | null> {
  if (!file) return null;
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('This file is larger than 25 MB. Please upload a smaller copy.');
  const path = `${documentType}/${crypto.randomUUID()}_${cleanName(file.name)}`;

  const { error: upErr } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('document')
    .insert({
      file_url: path,
      file_name: file.name,
      document_type: documentType,
      uploaded_by: userData.user?.id ?? null,
      site_id: filing.siteId || null,
      po_id: filing.poId || null,
      doc_number: filing.docNumber?.trim() || null,
      doc_date: filing.docDate || null,
      notes: filing.notes?.trim() || null,
    })
    .select('document_id')
    .single();
  if (error) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    throw new Error(`Could not record document: ${error.message}`);
  }
  return data.document_id as string;
}

/** Short-lived signed link for opening a stored document. */
export async function documentUrl(documentId: string): Promise<string | null> {
  const { data: doc } = await supabase.from('document').select('file_url').eq('document_id', documentId).single();
  if (!doc) return null;
  const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(doc.file_url, 300);
  return data?.signedUrl ?? null;
}

/**
 * Returns metadata about a stored document: its storage path, original fileName
 * and lower-case extension.
 */
export async function documentInfo(documentId: string): Promise<{ path: string; fileName: string; ext: string } | null> {
  const { data: doc } = await supabase.from('document').select('file_url, file_name').eq('document_id', documentId).single();
  if (!doc?.file_url) return null;
  const fileName = (doc.file_name as string | null) || fileNameFromPath(doc.file_url);
  return { path: doc.file_url, fileName, ext: fileExt(fileName) };
}

/**
 * Creates a short-lived signed download URL using the clean file name,
 * prompting the browser to save the file with its original name.
 */
export async function documentDownloadUrl(documentId: string): Promise<string | null> {
  const info = await documentInfo(documentId);
  if (!info) return null;
  const { data } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(info.path, 300, { download: info.fileName });
  return data?.signedUrl ?? null;
}

/** Undo an upload when the record it belongs to could not be saved, so no orphan files are left behind. */
export async function discardDocument(documentId: string | null): Promise<void> {
  if (!documentId) return;
  const { data: doc } = await supabase.from('document').select('file_url').eq('document_id', documentId).maybeSingle();
  const { error } = await supabase.from('document').delete().eq('document_id', documentId);
  // Only remove the file once nothing points at the row any more, so a record never loses its file.
  if (!error && doc) await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.file_url]);
}

/** Lists documents, newest first: one site's, or every site's when siteId is left out. */
export async function listDocuments(siteId?: string): Promise<DocumentRow[]> {
  let q = supabase
    .from('document')
    .select(
      'document_id, document_type, doc_number, doc_date, file_name, file_url, notes, uploaded_at, site_id, po_id, linked_type, linked_id, ' +
        'site:site_id(site_name, client:client_id(display_name)), po:po_id(po_number)'
    )
    .not('file_url', 'like', 'inbox/%')
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('uploaded_at', { ascending: false })
    .limit(2000);
  if (siteId) q = q.eq('site_id', siteId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DocumentRow[];
}

/** Moves a document to a site / PO (for papers that are not tied to a PO, PI, invoice or payment). */
export async function fileDocument(documentId: string, filing: DocumentFiling): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (filing.siteId !== undefined) patch.site_id = filing.siteId || null;
  if (filing.poId !== undefined) patch.po_id = filing.poId || null;
  if (filing.docNumber !== undefined) patch.doc_number = filing.docNumber?.trim() || null;
  if (filing.docDate !== undefined) patch.doc_date = filing.docDate || null;
  if (filing.notes !== undefined) patch.notes = filing.notes?.trim() || null;
  const { error } = await supabase.from('document').update(patch).eq('document_id', documentId);
  if (error) throw new Error(error.message);
}

/** Where to open the record a document belongs to, if it has one. */
export function linkedRecordHref(d: Pick<DocumentRow, 'linked_type' | 'linked_id' | 'site_id'>): string | null {
  if (!d.linked_id) return null;
  switch (d.linked_type) {
    case 'purchase_order': return `/po/?id=${d.linked_id}`;
    case 'proforma_invoice': return `/pi/?id=${d.linked_id}`;
    case 'tax_invoice': return d.site_id ? `/site/?id=${d.site_id}` : '/invoices';
    case 'payment': return d.site_id ? `/site/?id=${d.site_id}` : '/payments';
    default: return null;
  }
}
