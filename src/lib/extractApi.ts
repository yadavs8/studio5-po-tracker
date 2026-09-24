import { supabase } from '@/lib/supabase';

// The reading service lives on the same Render backend as the bill app.
const BACKEND = process.env.NEXT_PUBLIC_EXTRACT_URL || 'https://studio5-bill-backened.onrender.com';

export async function extractApi(method: 'GET' | 'POST', body?: { inbox_id: string }): Promise<{ ai_enabled?: boolean; status?: string; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  const r = await fetch(`${BACKEND}/po-extract`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
