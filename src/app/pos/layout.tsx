import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'POs & WOs' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
