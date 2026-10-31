import type { Metadata } from 'next';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { AuthGate } from '@/components/AuthGate';

export const metadata: Metadata = {
  title: { default: 'Studio5 Project Tracker', template: '%s · Studio5 Project Tracker' },
  description: 'Studio5 Interiors — every site: purchase orders, proforma invoices, tax invoices and money received.',
  applicationName: 'Studio5 Project Tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 font-sans text-slate-900 antialiased">
        <AuthGate>
          <NavBar />
          <main className="lg:pl-60 print:pl-0">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
