'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Static hosting has no server to check the login, so the check happens in the browser.
// The database itself still refuses every request that is not signed in (row-level security).
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onLogin = pathname.replace(/\/$/, '') === '/login';
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const signedIn = !!data.session;
      if (!signedIn && !onLogin) router.replace('/login');
      else if (signedIn && onLogin) router.replace('/dashboard');
      else setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && !onLogin) router.replace('/login');
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [onLogin, router]);

  return ready ? <>{children}</> : null;
}
