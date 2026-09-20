import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Tax invoices' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
