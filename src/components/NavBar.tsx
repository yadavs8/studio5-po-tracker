'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, Building2, FileText, FileCheck, Receipt, Wallet, FileSpreadsheet, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid, iconColor: 'text-blue-500' },
  { href: '/master-data', label: 'Clients & sites', icon: Building2, iconColor: 'text-amber-500' },
  { href: '/pis', label: 'Proforma invoices', icon: FileText, iconColor: 'text-sky-500' },
  { href: '/pos', label: 'POs / WOs', icon: FileCheck, iconColor: 'text-indigo-500' },
  { href: '/invoices', label: 'Tax invoices', icon: Receipt, iconColor: 'text-purple-500' },
  { href: '/payments', label: 'Payments', icon: Wallet, iconColor: 'text-emerald-500' },
  { href: '/reports', label: 'Reports', icon: FileSpreadsheet, iconColor: 'text-rose-500' },
];

// Sidebar on wide screens, a scrollable top bar on phones. The site and
// statement pages count as "Overview" since they are opened from it.
export function NavBar() {
  const pathname = usePathname().replace(/(.)\/$/, '$1');
  const router = useRouter();
  if (pathname === '/login') return null;

  const isActive = (href: string) =>
    pathname === href ||
    pathname.startsWith(href + '/') ||
    (href === '/dashboard' && pathname.startsWith('/site')) ||
    (href === '/pis' && (pathname === '/pi' || pathname.startsWith('/pi/'))) ||
    (href === '/pos' && (pathname === '/po' || pathname.startsWith('/po/')));

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
        className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm transition-all duration-150 ${
          active
            ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 font-semibold text-white shadow-md shadow-indigo-500/20'
            : 'text-slate-600 hover:bg-slate-100/90 hover:text-slate-900'
        }`}
      >
        <Icon
          size={17}
          strokeWidth={active ? 2.3 : 1.9}
          className={active ? 'text-white' : n.iconColor}
        />
        <span>{n.label}</span>
      </Link>
    );
  });

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/90 bg-white/95 backdrop-blur-xs px-4 py-5 lg:flex print:hidden">
        <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-sm font-bold text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/30">
            S5
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold text-slate-900">Studio5</span>
            <span className="block text-xs font-medium text-slate-500">Project tracker</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1">{items}</nav>
        <button
          onClick={signOut}
          className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <LogOut size={16} strokeWidth={1.8} className="text-slate-400" /> Sign out
        </button>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs lg:hidden print:hidden">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-xs font-bold text-white shadow-sm shadow-indigo-500/25">
            S5
          </span>
          <span className="text-sm font-bold text-slate-900">Studio5</span>
          <button
            onClick={signOut}
            className="ml-auto text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 pt-1">{items}</nav>
      </header>
    </>
  );
}
