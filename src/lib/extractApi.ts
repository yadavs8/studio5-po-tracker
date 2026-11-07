import { supabase } from '@/lib/supabase';
import { DOCUMENT_BUCKET } from '@/lib/documents';

// Automatic document reading lives on the same Render backend as the bill app (POST /po-extract).
// The page puts the file in the inbox/ folder, adds a doc_inbox row, and the backend reads that file
// with Claude as the signed-in user. What comes back is only a SUGGESTION that fills the form;
// nothing is saved as a real record until the person presses Confirm.
const BACKEND = process.env.NEXT_PUBLIC_EXTRACT_URL || 'https://studio5-bill-backened.onrender.com';

export const READABLE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const MAX_READ_BYTES = 10 * 1024 * 1024;

export type Confidence = 'high' | 'medium' | 'low';

/** Exactly what the backend returns (its JSON schema lives in poExtract.js on the backend). */
export interface Extracted {
  document_type: 'purchase_order' | 'proforma_invoice' | 'tax_invoice' | 'payment_advice' | 'other';
  document_type_confidence: Confidence;
  client_name: string | null;
  client_gstin: string | null;
  site_or_project: string | null;
  document_number: string | null;
  document_date: string | null;
  po_reference: string | null;
  pi_reference: string | null;
  scope_description: string | null;
  taxable_value: number | null;
  gst_type: 'igst' | 'cgst_sgst' | 'none' | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  total_amount: number | null;
  payment_amount: number | null;
  payment_date: string | null;
  payment_mode: 'bank_transfer' | 'cheque' | 'cash' | 'other' | null;
  utr_or_reference: string | null;
  tds_deducted: number | null;
  invoice_numbers_paid: string[];
  overall_confidence: Confidence;
  notes: string[];
}

/** The MIME type the backend can read, or null when this file has to be filled in by hand. */
export function readableType(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.type && Object.values(READABLE_TYPES).includes(file.type)) return file.type;
  return READABLE_TYPES[ext] ?? null;
}

async function call(method: 'GET' | 'POST', body?: { inbox_id: string }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  let r: Response;
  try {
    r = await fetch(`${BACKEND}/po-extract`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('The reading service could not be reached. Check the internet connection and try again.');
  }
  const j = (await r.json().catch(() => ({}))) as { ai_enabled?: boolean; status?: string; error?: string; extracted?: Extracted };
  return { ok: r.ok, ...j };
}

/** Whether the backend has its AI key switched on. */
export async function aiReadingEnabled(): Promise<boolean> {
  try {
    const j = await call('GET');
    return !!j.ai_enabled;
  } catch {
    return false;
  }
}

/**
 * Uploads the file to the inbox and has the backend read it.
 * Resolves with the inbox row id and what was read; throws with a readable message if it could not be read
 * (the inbox row id is attached to the error as `inboxId` so the caller can still clean it up).
 */
export async function readDocument(file: File): Promise<{ inboxId: string; extracted: Extracted }> {
  const mime = readableType(file);
  if (!mime) throw new Error('Automatic reading works for PDF, PNG, JPG and WEBP files only.');
  if (file.size > MAX_READ_BYTES) throw new Error('This file is larger than 10 MB, so it cannot be read automatically.');

  const path = `inbox/${crypto.randomUUID()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
  const up = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file);
  if (up.error) throw new Error(`Could not upload the file for reading: ${up.error.message}`);

  const ins = await supabase
    .from('doc_inbox')
    .insert({ file_path: path, file_name: file.name, mime_type: mime, size_bytes: file.size })
    .select('inbox_id')
    .single();
  if (ins.error || !ins.data) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    throw new Error(`Could not queue the file for reading: ${ins.error?.message ?? 'unknown error'}`);
  }
  const inboxId = ins.data.inbox_id as string;

  try {
    const j = await call('POST', { inbox_id: inboxId });
    if (j.status === 'ready' && j.extracted) return { inboxId, extracted: j.extracted };
    throw new Error(j.error || 'The document could not be read. Please fill in the details by hand.');
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { inboxId });
  }
}

/**
 * Removes the inbox copy once the document has been saved (it is stored again under its own folder)
 * or abandoned, and marks the inbox row so it is not left looking unfinished.
 */
export async function closeInboxItem(
  inboxId: string,
  outcome: { saved: true; recordType: string; recordId: string | null } | { saved: false }
): Promise<void> {
  try {
    const { data } = await supabase.from('doc_inbox').select('file_path').eq('inbox_id', inboxId).maybeSingle();
    if (data?.file_path) await supabase.storage.from(DOCUMENT_BUCKET).remove([data.file_path]);
    await supabase
      .from('doc_inbox')
      .update(
        outcome.saved
          ? { status: 'saved', saved_record_type: outcome.recordType, saved_record_id: outcome.recordId, updated_at: new Date().toISOString() }
          : { status: 'rejected', updated_at: new Date().toISOString() }
      )
      .eq('inbox_id', inboxId);
  } catch {
    /* tidying up only; never block the person on it */
  }
}
