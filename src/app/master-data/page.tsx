'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, Site, SubProject } from '@/lib/types';
import { ProgressPanel } from '@/components/ProgressPanel';

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

  useEffect(() => {
    loadClients();
  }, []);

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
    const { data, error } = await supabase
      .from('client')
      .select('*')
      .order('display_name');
    if (error) setError(error.message);
    else setClients(data as Client[]);
    setLoading(false);
  }

  async function loadSites(clientId: string) {
    const { data, error } = await supabase
      .from('site')
      .select('*')
      .eq('client_id', clientId)
      .order('site_name');
    if (error) setError(error.message);
    else setSites(data as Site[]);
  }

  async function loadSubProjects(siteId: string) {
    const { data, error } = await supabase
      .from('sub_project')
      .select('*')
      .eq('site_id', siteId)
      .order('name');
    if (error) setError(error.message);
    else setSubProjects(data as SubProject[]);
  }

  const selectedClient = clients.find((c) => c.client_id === selectedClientId) ?? null;
  const selectedSite = sites.find((s) => s.site_id === selectedSiteId) ?? null;

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1C1C1A]">
      <header className="border-b border-[#1C1C1A]/10 px-8 py-6">
        <h1 className="font-serif text-2xl tracking-tight">Master Data</h1>
        <p className="mt-1 font-sans text-sm text-[#1C1C1A]/60">
          Client → Site → Sub-Project. Everything else in the system attaches here.
        </p>
      </header>

      {error && (
        <div className="mx-8 mt-4 border border-[#A13D2B]/30 bg-[#A13D2B]/5 px-4 py-3 font-sans text-sm text-[#A13D2B]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 divide-x divide-[#1C1C1A]/10">
        {/* CLIENTS COLUMN */}
        <Column
          title="Clients"
          count={clients.length}
          onAdd={() => setShowNewClient(true)}
        >
          {loading ? (
            <EmptyState text="Loading…" />
          ) : clients.length === 0 ? (
            <EmptyState text="No clients yet. Add the first one." />
          ) : (
            clients.map((c) => (
              <RowItem
                key={c.client_id}
                label={c.display_name}
                sublabel={c.legal_name}
                selected={c.client_id === selectedClientId}
                onClick={() => setSelectedClientId(c.client_id)}
              />
            ))
          )}
          {showNewClient && (
            <NewClientForm
              onCancel={() => setShowNewClient(false)}
              onCreated={() => {
                setShowNewClient(false);
                loadClients();
              }}
            />
          )}
        </Column>

        {/* SITES COLUMN */}
        <Column
          title={selectedClient ? `Sites — ${selectedClient.display_name}` : 'Sites'}
          count={sites.length}
          onAdd={selectedClientId ? () => setShowNewSite(true) : undefined}
        >
          {!selectedClientId ? (
            <EmptyState text="Select a client to see its sites." />
          ) : sites.length === 0 ? (
            <EmptyState text="No sites yet for this client." />
          ) : (
            sites.map((s) => (
              <RowItem
                key={s.site_id}
                label={s.site_name}
                sublabel={s.has_sub_projects ? 'Has sub-projects' : s.status}
                selected={s.site_id === selectedSiteId}
                onClick={() => setSelectedSiteId(s.site_id)}
              />
            ))
          )}
          {showNewSite && selectedClientId && (
            <NewSiteForm
              clientId={selectedClientId}
              onCancel={() => setShowNewSite(false)}
              onCreated={() => {
                setShowNewSite(false);
                loadSites(selectedClientId);
              }}
            />
          )}
        </Column>

        {/* SUB-PROJECTS COLUMN */}
        <Column
          title={selectedSite ? `Sub-Projects — ${selectedSite.site_name}` : 'Sub-Projects'}
          count={subProjects.length}
          onAdd={selectedSiteId ? () => setShowNewSubProject(true) : undefined}
        >
          {!selectedSiteId ? (
            <EmptyState text="Select a site. Skip this column entirely if the site has no towers/work-packages." />
          ) : subProjects.length === 0 ? (
            <EmptyState text="No sub-projects yet. Only add these if the site has distinct towers or work packages, like The Melia's Tower B/C/G/S1." />
          ) : (
            subProjects.map((sp) => (
              <RowItem
                key={sp.sub_project_id}
                label={sp.name}
                sublabel={sp.scope_description ?? sp.status}
                onClick={() => {}}
              />
            ))
          )}
          {showNewSubProject && selectedSiteId && (
            <NewSubProjectForm
              siteId={selectedSiteId}
              onCancel={() => setShowNewSubProject(false)}
              onCreated={() => {
                setShowNewSubProject(false);
                loadSubProjects(selectedSiteId);
                // mark parent site as having sub-projects
                supabase
                  .from('site')
                  .update({ has_sub_projects: true })
                  .eq('site_id', selectedSiteId)
                  .then(() => loadSites(selectedClientId!));
              }}
            />
          )}
        </Column>
      </div>

      {selectedSite && (
        <div className="border-t border-[#1C1C1A]/10">
          <ProgressPanel siteId={selectedSite.site_id} siteName={selectedSite.site_name} subProjects={subProjects} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function Column({
  title,
  count,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-89px)] flex-col">
      <div className="flex items-center justify-between border-b border-[#1C1C1A]/10 px-6 py-4">
        <div>
          <h2 className="font-sans text-sm font-medium text-[#1C1C1A]/70">{title}</h2>
          <span className="font-mono text-xs text-[#1C1C1A]/40">{count} total</span>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="border border-[#1F3A52] px-3 py-1.5 font-sans text-xs font-medium text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white transition-colors"
          >
            + Add
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function RowItem({
  label,
  sublabel,
  selected,
  onClick,
}: {
  label: string;
  sublabel?: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-[#1C1C1A]/5 px-6 py-3 text-left transition-colors ${
        selected ? 'bg-[#1F3A52]/8' : 'hover:bg-[#1C1C1A]/[0.03]'
      }`}
    >
      <div className="font-sans text-sm text-[#1C1C1A]">{label}</div>
      {sublabel && (
        <div className="mt-0.5 font-mono text-xs text-[#1C1C1A]/45">{sublabel}</div>
      )}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-6 py-8 font-sans text-sm leading-relaxed text-[#1C1C1A]/40">
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function FormShell({
  onCancel,
  onSubmit,
  submitting,
  children,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#1C1C1A]/10 bg-[#1C1C1A]/[0.02] px-6 py-4">
      <div className="space-y-3">{children}</div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="bg-[#1F3A52] px-4 py-2 font-sans text-xs font-medium text-white hover:bg-[#1F3A52]/90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 font-sans text-xs font-medium text-[#1C1C1A]/60 hover:text-[#1C1C1A]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block font-sans text-xs font-medium text-[#1C1C1A]/60">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-[#1C1C1A]/15 bg-white px-3 py-2 font-sans text-sm outline-none focus:border-[#1F3A52]"
      />
    </div>
  );
}

function NewClientForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!displayName.trim() || !legalName.trim()) return;
    setSubmitting(true);
    await supabase.from('client').insert({
      display_name: displayName.trim(),
      legal_name: legalName.trim(),
      gstin: gstin.trim() || null,
      status: 'active',
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting}>
      <FieldInput label="Display name" value={displayName} onChange={setDisplayName} placeholder="e.g. Lemon Tree" />
      <FieldInput label="Legal name" value={legalName} onChange={setLegalName} placeholder="e.g. Lemon Tree Hotels Limited" />
      <FieldInput label="GSTIN (optional)" value={gstin} onChange={setGstin} />
    </FormShell>
  );
}

function NewSiteForm({
  clientId,
  onCancel,
  onCreated,
}: {
  clientId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [siteName, setSiteName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!siteName.trim()) return;
    setSubmitting(true);
    await supabase.from('site').insert({
      client_id: clientId,
      site_name: siteName.trim(),
      site_address: address.trim() || null,
      has_sub_projects: false,
      status: 'active',
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting}>
      <FieldInput label="Site name" value={siteName} onChange={setSiteName} placeholder="e.g. Keys Hotel Kochi" />
      <FieldInput label="Address (optional)" value={address} onChange={setAddress} />
    </FormShell>
  );
}

function NewSubProjectForm({
  siteId,
  onCancel,
  onCreated,
}: {
  siteId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    await supabase.from('sub_project').insert({
      site_id: siteId,
      name: name.trim(),
      scope_description: scope.trim() || null,
      status: 'active',
    });
    setSubmitting(false);
    onCreated();
  }

  return (
    <FormShell onCancel={onCancel} onSubmit={submit} submitting={submitting}>
      <FieldInput label="Name" value={name} onChange={setName} placeholder="e.g. Tower B" />
      <FieldInput label="Scope (optional)" value={scope} onChange={setScope} placeholder="e.g. Kitchen Carcase + Vanities" />
    </FormShell>
  );
}
