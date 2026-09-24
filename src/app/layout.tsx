import type { Metadata } from 'next';
import './globals.css';
import { NavBar } from '@/components/NavBar';
import { AuthGate } from '@/components/AuthGate';

export const metadata: Metadata = {
  title: { default: 'Studio5 Project Tracker', template: '%s · Studio5 Project Tracker' },
  description: 'Studio5 Interiors — track every site: purchase orders, proforma invoices, tax invoices, money received and work progress.',
  applicationName: 'Studio5 Project Tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F3F5F8] font-sans text-[#1C1C1A] antialiased">
        <AuthGate>
          <NavBar />
          {children}
        </AuthGate>
      </body>
    </html>
  );
}
