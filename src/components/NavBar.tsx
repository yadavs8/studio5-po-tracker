'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Building2, FileText, Receipt, Wallet, FileSpreadsheet, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { href: '/master-data', label: 'Clients & sites', icon: Building2 },
  { href: '/po-pi', label: 'POs & PIs', icon: FileText },
  { href: '/invoices', label: 'Tax invoices', icon: Receipt },
  { href: '/payments', label: 'Payments', icon: Wallet },
  { href: '/reports', label: 'Reports', icon: FileSpreadsheet },
];

// Sidebar on wide screens, a scrollable top bar on phones. The site and
// statement pages count as "Overview" since they are opened from it.
export function NavBar() {
  const pathname = usePathname().replace(/(.)\/$/, '$1');
  const router = useRouter();
  if (pathname === '/login') return null;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/') || (href === '/dashboard' && pathname.startsWith('/site'));

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  const items = NAV.map((n) => {
    const Icon = n.icon;
    const active = isActive(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
          active ? 'bg-slate-900 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
        {n.label}
      </Link>
    );
  });

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex print:hidden">
        <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">S5</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-slate-900">Studio5</span>
            <span className="block text-xs text-slate-500">Project tracker</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1">{items}</nav>
        <button
          onClick={signOut}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut size={16} strokeWidth={1.8} /> Sign out
        </button>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur lg:hidden print:hidden">
        <div className="flex items-center gap-3 px-4 pt-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">S5</span>
          <span className="text-sm font-semibold text-slate-900">Studio5</span>
          <button onClick={signOut} className="ml-auto text-slate-500 hover:text-slate-900" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2">{items}</nav>
      </header>
    </>
  );
}
