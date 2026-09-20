import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Add documents' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
