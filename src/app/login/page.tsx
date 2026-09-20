'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Receipt, Wallet, HardHat } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const POINTS = [
  { icon: FileText, t: 'Every PO in one place', d: 'Purchase orders, proformas and tax invoices linked together.' },
  { icon: Wallet, t: 'See what is paid and what is left', d: 'Money received, tax deducted, held back and still to come.' },
  { icon: Receipt, t: 'Excel and print in one click', d: 'Account statements exactly like your sheets.' },
  { icon: HardHat, t: 'Work progress beside billing', d: 'Know when work is ahead of what has been billed.' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) { setError(error.message === 'Invalid login credentials' ? 'That email or password is not right. Please try again.' : error.message); return; }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0F2233] via-[#1F3A52] to-[#2F6E8E] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#E8C872]/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#E8C872] to-[#C9A24A] font-serif text-2xl font-bold text-[#0F2233] shadow-lg">5</span>
          <div className="leading-tight">
            <div className="font-serif text-xl font-semibold">Studio5</div>
            <div className="font-sans text-[10px] uppercase tracking-[0.25em] text-white/50">Interiors</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight">
            Every site.<br />Every PO.<br /><span className="text-[#E8C872]">One clear picture.</span>
          </h1>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.t} className="flex items-start gap-4">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15"><p.icon size={18} className="text-[#E8C872]" /></span>
                <div>
                  <div className="font-sans text-sm font-semibold">{p.t}</div>
                  <div className="font-sans text-sm text-white/60">{p.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative font-sans text-xs text-white/40">Studio5 Interiors Pvt Ltd · Project Tracker</div>
      </div>

      {/* form */}
      <div className="flex items-center justify-center bg-[#F3F5F8] px-6 py-12">
        <form onSubmit={submit} className="card rise w-full max-w-md p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E8C872] to-[#C9A24A] font-serif text-xl font-bold text-[#0F2233]">5</span>
            <span className="font-serif text-lg font-semibold text-[#1F3A52]">Studio5 Project Tracker</span>
          </div>
          <h2 className="font-serif text-2xl font-semibold text-[#1F3A52]">Welcome back</h2>
          <p className="mt-1 font-sans text-sm text-slate-500">Sign in to see your sites, POs and payments.</p>

          <label className="mt-6 block font-sans text-xs font-semibold text-slate-600">Email</label>
          <input
            type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-sans text-sm outline-none transition focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15"
          />
          <label className="mt-4 block font-sans text-xs font-semibold text-slate-600">Password</label>
          <input
            type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-sans text-sm outline-none transition focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15"
          />

          {error && <div className="mt-4 rounded-lg border border-[#A13D2B]/25 bg-[#A13D2B]/5 px-3 py-2 font-sans text-sm text-[#A13D2B]">{error}</div>}

          <button
            type="submit" disabled={submitting}
            className="mt-6 w-full rounded-lg bg-[#1F3A52] py-3 font-sans text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-px hover:bg-[#2A4D6B] hover:shadow-lg disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
