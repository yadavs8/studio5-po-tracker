import { supabase } from '@/lib/supabase';

export type UploadDocType = 'po' | 'pi' | 'invoice' | 'payment_advice';

export const DOCUMENT_BUCKET = 'studio5-documents';

/**
 * Uploads one file to Storage and records it in `document`.
 * Returns the new document_id to store on the parent row, or null if no file.
 * Throws with a readable message on failure.
 */
export async function uploadDocument(file: File | null, documentType: UploadDocType): Promise<string | null> {
  if (!file) return null;
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${documentType}/${crypto.randomUUID()}_${safeName}`;

  const { error: upErr } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('document')
    .insert({ file_url: path, document_type: documentType, uploaded_by: userData.user?.id ?? null })
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
 * (with the leading uuid prefix stripped), and lower-case extension.
 */
export async function documentInfo(documentId: string): Promise<{ path: string; fileName: string; ext: string } | null> {
  const { data: doc } = await supabase.from('document').select('file_url').eq('document_id', documentId).single();
  if (!doc?.file_url) return null;
  const path = doc.file_url;
  const rawName = path.split('/').pop() ?? path;
  // Strip leading UUID prefix e.g. "64dc3873-a818-468c-af90-ede4d49b9fef_"
  const fileName = rawName.replace(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_/, '');
  const ext = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : '';
  return { path, fileName, ext };
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
  if (doc) await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.file_url]);
  await supabase.from('document').delete().eq('document_id', documentId);
}
