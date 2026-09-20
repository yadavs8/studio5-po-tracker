import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Studio5 — Project & Receivables',
  description: 'Studio5 Interiors internal project, billing and receivables system',
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/master-data', label: 'Master Data' },
  { href: '/po-pi', label: 'PO & PI' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/payments', label: 'Payments' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#FAFAF8] font-sans text-[#1C1C1A] antialiased">
        <nav className="flex items-center gap-1 border-b border-[#1C1C1A]/10 bg-[#1F3A52] px-8 py-3">
          <Link href="/dashboard" className="mr-6 font-serif text-lg font-medium tracking-tight text-white hover:opacity-90">Studio5</Link>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-1.5 font-sans text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-sm transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {children}
      </body>
    </html>
  );
}
