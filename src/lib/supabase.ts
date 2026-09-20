import { createBrowserClient } from '@supabase/ssr';

// Cookie-based browser client so proxy.ts can see the signed-in session.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
);
