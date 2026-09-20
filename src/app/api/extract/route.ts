import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { extractDocument, ExtractError, MAX_BYTES, READABLE_MIMES, type ReadableMime } from '@/lib/docExtract';

// Reads one file from the document inbox with Claude and stores the result on the inbox row.
// Login is required, the AI key never leaves the server, and nothing is saved as a real record here.

const BUCKET = 'studio5-documents';
const PER_HOUR = 60; // cost guard: at most this many readings per hour

const MIME_BY_EXT: Record<string, ReadableMime> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const mimeOf = (name: string, given: string | null): ReadableMime | null => {
  if (given && (READABLE_MIMES as string[]).includes(given)) return given as ReadableMime;
  return MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? null;
};

async function supabaseForUser() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll() { /* read-only here */ } },
  });
}

/** Lets the page know whether automatic reading is switched on. */
export async function GET() {
  const sb = await supabaseForUser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  return Response.json({ ai_enabled: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(request: Request) {
  const sb = await supabaseForUser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Please sign in again.' }, { status: 401 });

  let inboxId: string | undefined;
  try { inboxId = (await request.json())?.inbox_id; } catch { /* handled below */ }
  if (!inboxId) return Response.json({ error: 'No document was named.' }, { status: 400 });

  const { data: row, error: rowErr } = await sb.from('doc_inbox').select('*').eq('inbox_id', inboxId).single();
  if (rowErr || !row) return Response.json({ error: 'That document was not found.' }, { status: 404 });
  if (row.status === 'saved' || row.status === 'rejected') return Response.json({ error: 'That document is already dealt with.' }, { status: 409 });

  const fail = async (message: string, status = 200) => {
    await sb.from('doc_inbox').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('inbox_id', inboxId);
    return Response.json({ status: 'failed', error: message }, { status });
  };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from('doc_inbox').select('inbox_id', { count: 'exact', head: true }).in('status', ['ready', 'failed']).gte('updated_at', since);
  if ((count ?? 0) >= PER_HOUR) return fail('Too many documents were read in the last hour. Please wait a little and press "Read again".', 429);

  const mime = mimeOf(row.file_name, row.mime_type);
  if (!mime) return fail('Only PDF, PNG, JPG and WEBP files can be read automatically.');
  if ((row.size_bytes ?? 0) > MAX_BYTES) return fail('This file is larger than 10 MB. Please upload a smaller copy.');

  await sb.from('doc_inbox').update({ status: 'extracting', error: null, updated_at: new Date().toISOString() }).eq('inbox_id', inboxId);

  const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(row.file_path);
  if (dlErr || !blob) return fail('The uploaded file could not be opened. Please upload it again.');
  if (blob.size > MAX_BYTES) return fail('This file is larger than 10 MB. Please upload a smaller copy.');

  try {
    const extracted = await extractDocument(Buffer.from(await blob.arrayBuffer()).toString('base64'), mime, row.file_name);
    await sb.from('doc_inbox').update({ status: 'ready', doc_type: extracted.document_type, extracted, error: null, updated_at: new Date().toISOString() }).eq('inbox_id', inboxId);
    return Response.json({ status: 'ready', extracted });
  } catch (e) {
    return fail(e instanceof ExtractError ? e.message : 'Something went wrong while reading this document.');
  }
}
