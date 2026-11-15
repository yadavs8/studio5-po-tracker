import { createBrowserClient } from '@supabase/ssr';

// The app is served from yadavs8.github.io/studio5-po-tracker/. Every other GitHub Pages site of the
// same account shares that origin, so the login cookie is limited to this app's path and lifetime
// (decision 0008). A custom domain would isolate it completely.
const APP_PATH = '/studio5-po-tracker';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
  {
    cookieOptions: {
      path: APP_PATH,
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
      secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
    },
  },
);
