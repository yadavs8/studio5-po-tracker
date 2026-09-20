'use client';

import { useEffect, useState } from 'react';
import { Building2, MapPin, Layers, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import type { Client, Site, SubProject } from '@/lib/types';
import { ProgressPanel } from '@/components/ProgressPanel';
import { PageHeader, ErrorBanner, EmptyState, FormShell, FieldInput } from '@/lib/ui';

export default function MasterDataPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewSite, setShowNewSite] = useState(false);
  const [showNewSubProject, setShowNewSubProject] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadClients(); }, []);

  useEffect(() => {
    if (selectedClientId) loadSites(selectedClientId);
    else setSites([]);
    setSelectedSiteId(null);
  }, [selectedClientId]);

  useEffect(() => {
    if (selectedSiteId) loadSubProjects(selectedSiteId);
    else setSubProjects([]);
  }, [selectedSiteId]);

  async function loadClients() {
    setLoading(true);
    const { data, error } = await supabase.from('client').select('*').order('display_name');
    if (error) setError(friendlyError(error)); else setClients(data as Client[]);
    setLoading(false);
  }
  async function loadSites(clientId: string) {
    const { data, error } = await supabase.from('site').select('*').eq('client_id', clientId).order('site_name');
    if (error) setError(friendlyError(error)); else setSites(data as Site[]);
  }
  async function loadSubProjects(siteId: string) {
    const { data, error } = await supabase.from('sub_project').select('*').eq('site_id', siteId).order('name');
    if (error) setError(friendlyError(error)); else setSubProjects(data as SubProject[]);
  }

  const selectedClient = clients.find((c) => c.client_id === selectedClientId) ?? null;
  const selectedSite = sites.find((s) => s.site_id === selectedSiteId) ?? null;

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<Building2 size={24} className="text-[#E8C872]" />}
        title="Clients & sites"
        subtitle="Set these up first: a client, its sites, and (only if a site has towers or work packages) its sub-projects. Everything else attaches here."
      />
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-5 px-8 py-8 lg:grid-cols-3">
        <Column icon={<Building2 size={16} />} title="Clients" count={clients.length} onAdd={() => setShowNewClient(true)}>
          {showNewClient && (
            <NewClientForm onCancel={() => setShowNewClient(false)} onCreated={() => { setShowNewClient(false); loadClients(); }} />
          )}
          {loading ? <EmptyState text="Loading…" /> : clients.length === 0 ? (
            <EmptyState text="No clients yet. Add the first one." />
          ) : clients.map((c) => (
            <RowItem key={c.client_id} label={c.display_name} sublabel={c.legal_name}
              selected={c.client_id === selectedClientId} onClick={() => setSelectedClientId(c.client_id)} />
          ))}
        </Column>

        <Column icon={<MapPin size={16} />} title={selectedClient ? `Sites — ${selectedClient.display_name}` : 'Sites'} count={sites.length}
          onAdd={selectedClientId ? () => setShowNewSite(true) : undefined}>
          {showNewSite && selectedClientId && (
            <NewSiteForm clientId={selectedClientId} onCancel={() => setShowNewSite(false)}
              onCreated={() => { setShowNewSite(false); loadSites(selectedClientId); }} />
          )}
          {!selectedClientId ? <EmptyState text="Select a client to see its sites." /> : sites.length === 0 ? (
            <EmptyState text="No sites yet for this client." />
          ) : sites.map((s) => (
            <RowItem key={s.site_id} label={s.site_name} sublabel={s.has_sub_projects ? 'Has sub-projects (towers / packages)' : s.status}
              selected={s.site_id === selectedSiteId} onClick={() => setSelectedSiteId(s.site_id)} />
          ))}
        </Column>

        <Column icon={<Layers size={16} />} title={selectedSite ? `Sub-projects — ${selectedSite.site_name}` : 'Sub-projects'} count={subProjects.length}
          onAdd={selectedSiteId ? () => setShowNewSubProject(true) : undefined}>
          {showNewSubProject && selectedSiteId && (
            <NewSubProjectForm siteId={selectedSiteId} onCancel={() => setShowNewSubProject(false)}
              onCreated={() => {
                setShowNewSubProject(false);
                loadSubProjects(selectedSiteId);
                supabase.from('site').update({ has_sub_projects: true }).eq('site_id', selectedSiteId)
                  .then(() => loadSites(selectedClientId!));
              }} />
          )}
          {!selectedSiteId ? <EmptyState text="Select a site. Skip this column if the site has no towers or work packages." /> : subProjects.length === 0 ? (
            <EmptyState text="No sub-projects yet. Only add these if the site has distinct towers or work packages, like The Melia's Tower B / C / G / S1." />
          ) : subProjects.map((sp) => (
            <RowItem key={sp.sub_project_id} label={sp.name} sublabel={sp.scope_description ?? sp.status} onClick={() => {}} />
          ))}
        </Column>
      </div>

      {selectedSite && (
        <ProgressPanel siteId={selectedSite.site_id} siteName={selectedSite.site_name} subProjects={subProjects} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Column({ icon, title, count, onAdd, children }: { icon: React.ReactNode; title: string; count: number; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div className="card flex min-h-[420px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#1F3A52]/10 text-[#1F3A52]">{icon}</span>
          <div className="min-w-0">
            <h2 className="truncate font-sans text-sm font-semibold text-[#1F3A52]">{title}</h2>
            <span className="font-mono text-[11px] text-slate-400">{count} total</span>
          </div>
        </div>
        {onAdd && (
          <button onClick={onAdd} className="inline-flex flex-none items-center gap-1 rounded-lg bg-[#1F3A52] px-3 py-1.5 font-sans text-xs font-semibold text-white shadow-sm transition hover:bg-[#2A4D6B]">
            <Plus size={13} /> Add
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function RowItem({ label, sublabel, selected, onClick }: { label: string; sublabel?: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-slate-100 px-5 py-3.5 text-left transition-colors ${
        selected ? 'border-l-4 border-l-[#E8C872] bg-[#1F3A52]/[0.06]' : 'border-l-4 border-l-transparent hover:bg-slate-50'
      }`}
    >
      <div className="font-sans text-sm font-medium text-slate-800">{label}</div>
      {sublabel && <div className="mt-0.5 font-sans text-xs text-slate-400">{sublabel}</div>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Forms (each one shows a clear message if the save fails)
// ---------------------------------------------------------------------------

function NewClientForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!displayName.trim() || !legalName.trim()) { setErr('Please fill in both the short name and the full legal name.'); return; }
    setSubmitting(true); setErr(null);
    const { error } = await supabase.from('client').insert({
      display_name: displayName.trim(), legal_name: legalName.trim(), gstin: gstin.trim() || null, status: 'active',
    });
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput full label="Short name" value={displayName} onChange={setDisplayName} placeholder="e.g. Lemon Tree" />
      <FieldInput full label="Full legal name (as in Tally)" value={legalName} onChange={setLegalName} placeholder="e.g. Lemon Tree Hotels Limited" />
      <FieldInput full label="GSTIN (optional)" value={gstin} onChange={setGstin} />
    </FormShell>
  );
}

function NewSiteForm({ clientId, onCancel, onCreated }: { clientId: string; onCancel: () => void; onCreated: () => void }) {
  const [siteName, setSiteName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!siteName.trim()) { setErr('Please enter the site name.'); return; }
    setSubmitting(true); setErr(null);
    const { error } = await supabase.from('site').insert({
      client_id: clientId, site_name: siteName.trim(), site_address: address.trim() || null, has_sub_projects: false, status: 'active',
    });
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput full label="Site name" value={siteName} onChange={setSiteName} placeholder="e.g. Keys Hotel Kochi" />
      <FieldInput full label="Address (optional)" value={address} onChange={setAddress} />
    </FormShell>
  );
}

function NewSubProjectForm({ siteId, onCancel, onCreated }: { siteId: string; onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr('Please enter the tower or package name.'); return; }
    setSubmitting(true); setErr(null);
    const { error } = await supabase.from('sub_project').insert({
      site_id: siteId, name: name.trim(), scope_description: scope.trim() || null, status: 'active',
    });
    setSubmitting(false);
    if (error) { setErr(friendlyError(error)); return; }
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting} error={err}>
      <FieldInput full label="Name" value={name} onChange={setName} placeholder="e.g. Tower B" />
      <FieldInput full label="Scope (optional)" value={scope} onChange={setScope} placeholder="e.g. Kitchen Carcase + Vanities" />
    </FormShell>
  );
}
