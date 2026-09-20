'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PageHeader, FormShell, FieldInput } from '@/lib/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    router.replace('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <PageHeader title="Studio5 Project Tracker" subtitle="Sign in to see every site: purchase orders, proforma invoices, tax invoices, money received and work progress." />
      <div className="max-w-md px-8 py-6">
        <div className="border border-[#1C1C1A]/10 bg-white">
          <FormShell onCancel={() => { setEmail(''); setPassword(''); }} onSubmit={submit} submitting={submitting} error={error}>
            <FieldInput label="Email" type="email" value={email} onChange={setEmail} full />
            <FieldInput label="Password" type="password" value={password} onChange={setPassword} full />
          </FormShell>
        </div>
      </div>
    </div>
  );
}
