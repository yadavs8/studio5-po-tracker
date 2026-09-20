'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'All sites' },
  { href: '/master-data', label: 'Clients & sites' },
  { href: '/po-pi', label: 'POs & proformas' },
  { href: '/invoices', label: 'Tax invoices' },
  { href: '/payments', label: 'Payments' },
  { href: '/data-health', label: 'Data health' },
  { href: '/guide', label: 'Guide' },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [fixCount, setFixCount] = useState<number | null>(null);

  useEffect(() => {
    if (pathname === '/login') return;
    supabase.from('v_data_health').select('code', { count: 'exact', head: true }).eq('severity', 'fix')
      .then(({ count }) => setFixCount(count ?? 0));
  }, [pathname]);

  if (pathname === '/login') return null;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-10 flex print:hidden items-center bg-[#1F3A52] px-8 shadow-[0_1px_0_rgba(0,0,0,0.2)]">
      <Link href="/dashboard" className="mr-8 flex items-baseline gap-2 whitespace-nowrap py-4 text-white">
        <span className="font-serif text-xl font-semibold tracking-tight">Studio<span className="text-[#E8C872]">5</span></span>
        <span className="font-sans text-xs uppercase tracking-[0.18em] text-white/60">Project Tracker</span>
      </Link>
      <div className="flex items-stretch self-stretch overflow-x-auto">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + '/');
          const badge = n.href === '/data-health' && fixCount ? fixCount : null;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 font-sans text-sm transition-colors ${
                active
                  ? 'border-[#E8C872] font-medium text-white'
                  : 'border-transparent text-white/65 hover:bg-white/5 hover:text-white'
              }`}
            >
              {n.label}
              {badge ? <span className="bg-[#A13D2B] px-1.5 font-mono text-[10px] text-white">{badge}</span> : null}
            </Link>
          );
        })}
      </div>
      <button
        onClick={signOut}
        className="ml-auto border border-white/25 px-3 py-1.5 font-sans text-xs text-white/75 transition-colors hover:border-white/60 hover:text-white"
      >
        Sign out
      </button>
    </nav>
  );
}
