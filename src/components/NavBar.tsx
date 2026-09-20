'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Building2, FileText, Receipt, Wallet, ShieldCheck, FileSpreadsheet, BookOpen, Landmark, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'All sites', icon: LayoutDashboard },
  { href: '/master-data', label: 'Clients & sites', icon: Building2 },
  { href: '/po-pi', label: 'POs & proformas', icon: FileText },
  { href: '/invoices', label: 'Tax invoices', icon: Receipt },
  { href: '/payments', label: 'Payments', icon: Wallet },
  { href: '/reports', label: 'Reports', icon: FileSpreadsheet },
  { href: '/data-health', label: 'Data health', icon: ShieldCheck },
  { href: '/guide', label: 'Guide', icon: BookOpen },
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
    <nav className="sticky top-0 z-20 flex items-center gap-2 bg-[#0F2233]/95 px-6 shadow-lg shadow-black/10 backdrop-blur print:hidden">
      <Link href="/dashboard" className="mr-4 flex items-center gap-3 whitespace-nowrap py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#E8C872] to-[#C9A24A] font-serif text-lg font-bold text-[#0F2233] shadow-md">5</span>
        <span className="leading-tight">
          <span className="block font-serif text-base font-semibold tracking-tight">Studio5</span>
          <span className="block font-sans text-[10px] uppercase tracking-[0.2em] text-white/50">Project Tracker</span>
        </span>
      </Link>

      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + '/');
          const badge = n.href === '/data-health' && fixCount ? fixCount : null;
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 font-sans text-[13px] transition-all ${
                active
                  ? 'bg-white/12 font-semibold text-white shadow-inner ring-1 ring-white/15'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              }`}
            >
              <Icon size={15} className={active ? 'text-[#E8C872]' : ''} />
              {n.label}
              {badge ? <span className="rounded-full bg-[#D9534F] px-1.5 py-px font-mono text-[10px] font-semibold text-white">{badge}</span> : null}
            </Link>
          );
        })}
      </div>

      <button
        onClick={signOut}
        className="ml-auto flex items-center gap-2 whitespace-nowrap rounded-lg border border-white/15 px-3 py-2 font-sans text-xs text-white/70 transition-colors hover:border-white/40 hover:bg-white/10 hover:text-white"
      >
        <LogOut size={14} /> Sign out
      </button>
    </nav>
  );
}
