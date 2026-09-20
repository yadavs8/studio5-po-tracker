'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Send, RefreshCw, CheckCircle2, AlertTriangle, Clock, Inbox, ChevronDown, ChevronRight, Settings2, Terminal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/plain';
import { formatINR, formatDate } from '@/lib/format';
import { PageHeader, ErrorBanner, EmptyState, Panel, DataTable, Td, PrimaryButton, GhostButton, StatusBadge } from '@/lib/ui';
import { voucherLines, VOUCHER_PLAIN, type QueueRow, type Settings, type InvoiceDetail, type PaymentDetail } from '@/lib/tally';

interface SettingRow { key: string; value: string; label: string; hint: string | null }
interface SiteRow { site_id: string; site_name: string; tally_ledger_name: string | null; client: { legal_name: string; display_name: string } | null }

const isBaseline = (r: QueueRow) => (r.error_message ?? '').startsWith('Baseline');

export default function TallyPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [q, st, si] = await Promise.all([
      supabase.from('v_tally_queue').select('*').order('voucher_date', { ascending: false }),
      supabase.from('tally_setting').select('*').order('key'),
      supabase.from('site').select('site_id, site_name, tally_ledger_name, client:client_id(legal_name, display_name)').order('site_name'),
    ]);
    const bad = [q, st, si].find((r) => r.error);
    if (bad?.error) { setError(friendlyError(bad.error)); setLoading(false); return; }
    setRows((q.data ?? []) as QueueRow[]);
    setSettings((st.data ?? []) as SettingRow[]);
    setSites((si.data ?? []) as unknown as SiteRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const ready = rows.filter((r) => r.status === 'not_queued');
  const pending = rows.filter((r) => r.status === 'pending');
  const failed = rows.filter((r) => r.status === 'failed');
  const sent = rows.filter((r) => r.status === 'pushed' && !isBaseline(r));
  const baseline = rows.filter((r) => r.status === 'pushed' && isBaseline(r));
  const settingsMap: Settings = useMemo(() => Object.fromEntries(settings.map((s) => [s.key, s.value])), [settings]);
  const key = (r: QueueRow) => `${r.record_type}:${r.record_id}`;

  async function sendSelected() {
    const chosen = ready.filter((r) => selected.has(key(r)));
    if (!chosen.length) return;
    setBusy(true); setError(null); setNote(null);
    const { error } = await supabase.from('tally_sync_log').insert(
      chosen.map((r) => ({ record_type: r.record_type, record_id: r.record_id, tally_voucher_type: r.voucher_type, sync_status: 'pending' }))
    );
    setBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    setNote(`${chosen.length} entr${chosen.length === 1 ? 'y is' : 'ies are'} now waiting for the Tally agent on your PC. Open Tally and start the agent — the status below will change to "sent" once Tally accepts them.`);
    setSelected(new Set());
    load();
  }
  async function retry(r: QueueRow) {
    if (!r.sync_id) return;
    const { error } = await supabase.from('tally_sync_log').update({ sync_status: 'pending', error_message: null }).eq('sync_id', r.sync_id);
    if (error) setError(friendlyError(error)); else load();
  }
  async function cancel(r: QueueRow) {
    if (!r.sync_id) return;
    const { error } = await supabase.from('tally_sync_log').delete().eq('sync_id', r.sync_id).eq('sync_status', 'pending');
    if (error) setError(friendlyError(error)); else load();
  }
  const toggle = (r: QueueRow) => setSelected((s) => { const n = new Set(s); n.has(key(r)) ? n.delete(key(r)) : n.add(key(r)); return n; });
  const allSelected = ready.length > 0 && ready.every((r) => selected.has(key(r)));

  const companyMissing = !(settingsMap.company ?? '').trim();

  return (
    <div className="min-h-screen bg-[#F3F5F8] pb-12">
      <PageHeader
        icon={<Landmark size={24} className="text-[#E8C872]" />}
        title="Send to Tally"
        subtitle="New tax invoices, receipts and tax-deducted entries are sent one way, from this tracker into Tally Prime. Nothing is ever read back or changed in Tally, and nothing is sent until you press the button."
      />
      {error && <ErrorBanner message={error} />}
      {note && <div className="mx-8 mt-4 rounded-lg border border-[#2F6B4F]/25 bg-[#2F6B4F]/5 px-4 py-3 font-sans text-sm text-[#2F6B4F]">{note}</div>}

      <div className="space-y-8 px-8 py-8">
        {/* status tiles */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile icon={<Inbox size={18} />} label="New — ready to send" n={ready.length} color="#1F3A52" note="not in Tally yet" />
          <Tile icon={<Clock size={18} />} label="Waiting for the agent" n={pending.length} color="#B8860B" note="sent from here, Tally not yet updated" />
          <Tile icon={<CheckCircle2 size={18} />} label="Sent to Tally" n={sent.length} color="#2F6B4F" note={`+ ${baseline.length} older entries already in Tally`} />
          <Tile icon={<AlertTriangle size={18} />} label="Needs attention" n={failed.length} color="#C0392B" note="Tally refused, see message" />
        </div>

        {companyMissing && (
          <div className="flex items-start gap-3 rounded-xl border border-[#B8860B]/30 bg-[#B8860B]/5 px-5 py-4 font-sans text-sm text-[#7a5a05]">
            <AlertTriangle size={18} className="mt-0.5 flex-none" />
            <div><b>Set up first.</b> Enter your Tally company name and check the ledger names in the &quot;Tally setup&quot; section below. The agent will refuse to post anything until the company name is filled in, so it can never write into the wrong company.</div>
          </div>
        )}

        {/* ready to send */}
        <Panel
          title={`New entries ready to send (${ready.length})`}
          action={
            <PrimaryButton onClick={sendSelected} disabled={busy || selected.size === 0}>
              <Send size={14} /> {busy ? 'Sending…' : `Send ${selected.size || ''} to Tally`.replace('  ', ' ')}
            </PrimaryButton>
          }
        >
          {loading ? <EmptyState text="Loading…" /> : ready.length === 0 ? (
            <EmptyState text="Nothing new to send. Every invoice, payment and TDS entry so far is already in Tally. New ones you enter will appear here." />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-6 py-2 font-sans text-xs text-slate-500">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(ready.map(key)))} />
                  Select all
                </label>
                <span>Tick what you have checked, then press Send. Use &quot;Preview&quot; to see exactly what Tally will receive.</span>
              </div>
              <div className="divide-y divide-slate-100">
                {ready.map((r) => <ReadyRow key={key(r)} r={r} checked={selected.has(key(r))} onToggle={() => toggle(r)} settings={settingsMap} />)}
              </div>
            </>
          )}
        </Panel>

        {/* activity */}
        {(pending.length > 0 || failed.length > 0 || sent.length > 0) && (
          <Panel title="Sending activity" action={<GhostButton onClick={load}><RefreshCw size={13} /> Refresh</GhostButton>}>
            <DataTable columns={[{ label: 'Status' }, { label: 'What' }, { label: 'Date' }, { label: 'Reference' }, { label: 'Tally ledger' }, { label: 'Amount', align: 'right' }, { label: 'Message' }, { label: '' }]}>
              {[...failed, ...pending, ...sent.slice(0, 30)].map((r) => (
                <tr key={key(r)}>
                  <Td><StatusBadge status={r.status === 'pushed' ? 'completed' : r.status === 'failed' ? 'disputed' : 'pending'} /><span className="sr-only">{r.status}</span></Td>
                  <Td>{VOUCHER_PLAIN[r.voucher_type]}</Td>
                  <Td mono>{formatDate(r.voucher_date)}</Td>
                  <Td>{r.reference}</Td>
                  <Td>{r.party_ledger}</Td>
                  <Td align="right" mono>{formatINR(r.amount)}</Td>
                  <Td>{r.status === 'failed' ? <span className="text-[#A13D2B]">{r.error_message}</span> : r.status === 'pushed' ? `Accepted ${r.pushed_at ? formatDate(r.pushed_at) : ''}` : 'Waiting for the agent'}</Td>
                  <Td>
                    {r.status === 'failed' && <button onClick={() => retry(r)} className="rounded-md bg-[#1F3A52]/8 px-3 py-1 font-sans text-xs font-semibold text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white">Try again</button>}
                    {r.status === 'pending' && <button onClick={() => cancel(r)} className="rounded-md bg-slate-100 px-3 py-1 font-sans text-xs font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>}
                  </Td>
                </tr>
              ))}
            </DataTable>
          </Panel>
        )}

        <Setup settings={settings} sites={sites} onSaved={load} onError={setError} />
        <AgentHelp />
      </div>
    </div>
  );
}

function Tile({ icon, label, n, color, note }: { icon: React.ReactNode; label: string; n: number; color: string; note: string }) {
  return (
    <div className="card rise relative overflow-hidden px-5 py-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div className="flex items-start justify-between">
        <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}14`, color }}>{icon}</span>
      </div>
      <div className="mt-2 font-mono text-3xl font-semibold tabular-nums" style={{ color }}>{n}</div>
      <div className="mt-1 font-sans text-[11px] text-slate-400">{note}</div>
    </div>
  );
}

function ReadyRow({ r, checked, onToggle, settings }: { r: QueueRow; checked: boolean; onToggle: () => void; settings: Settings }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ReturnType<typeof voucherLines> | null>(null);

  async function preview() {
    if (open) { setOpen(false); return; }
    let detail: InvoiceDetail | PaymentDetail | undefined;
    if (r.record_type === 'invoice') {
      const { data } = await supabase.from('tax_invoice').select('taxable_value,gst_amount,gst_type,gross_invoice_value').eq('invoice_id', r.record_id).single();
      detail = data as InvoiceDetail;
    } else if (r.record_type === 'payment') {
      const { data } = await supabase.from('payment').select('amount_received,payment_mode').eq('payment_id', r.record_id).single();
      detail = data as PaymentDetail;
    }
    setLines(voucherLines(r, settings, detail));
    setOpen(true);
  }

  const dr = lines?.filter((l) => l.side === 'Dr').reduce((s, l) => s + l.amount, 0) ?? 0;
  const cr = lines?.filter((l) => l.side === 'Cr').reduce((s, l) => s + l.amount, 0) ?? 0;

  return (
    <div className="px-6 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4" />
        <div className="min-w-[220px] flex-1">
          <div className="font-sans text-sm font-semibold text-slate-800">{VOUCHER_PLAIN[r.voucher_type]}</div>
          <div className="font-sans text-xs text-slate-500">{r.reference} · {r.site_name} · {formatDate(r.voucher_date)}</div>
        </div>
        <div className="font-sans text-xs text-slate-500">Party ledger in Tally: <b className="text-slate-700">{r.party_ledger}</b></div>
        <div className="font-mono text-sm font-semibold tabular-nums text-slate-800">{formatINR(r.amount)}</div>
        <button onClick={preview} className="flex items-center gap-1 rounded-md bg-[#1F3A52]/8 px-3 py-1 font-sans text-xs font-semibold text-[#1F3A52] hover:bg-[#1F3A52] hover:text-white">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Preview
        </button>
      </div>
      {open && lines && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
          <table className="w-full font-sans text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2">Ledger in Tally</th><th className="px-4 py-2">Side</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-800">{l.ledger}</td>
                  <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${l.side === 'Dr' ? 'bg-[#1F3A52]/10 text-[#1F3A52]' : 'bg-[#2F6B4F]/10 text-[#2F6B4F]'}`}>{l.side === 'Dr' ? 'Debit' : 'Credit'}</span></td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatINR(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={`px-4 py-2 font-sans text-xs ${Math.abs(dr - cr) < 0.005 ? 'text-[#2F6B4F]' : 'font-semibold text-[#A13D2B]'}`}>
            {Math.abs(dr - cr) < 0.005 ? '✓ Debit and credit are equal, so Tally will accept the voucher.' : `Debit ${formatINR(dr)} and credit ${formatINR(cr)} differ — check the invoice amounts before sending.`}
          </div>
        </div>
      )}
    </div>
  );
}

function Setup({ settings, sites, onSaved, onError }: { settings: SettingRow[]; sites: SiteRow[]; onSaved: () => void; onError: (m: string) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [siteVals, setSiteVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setVals(Object.fromEntries(settings.map((s) => [s.key, s.value]))); }, [settings]);
  useEffect(() => { setSiteVals(Object.fromEntries(sites.map((s) => [s.site_id, s.tally_ledger_name ?? '']))); }, [sites]);

  async function save() {
    setSaving(true);
    for (const s of settings) {
      if ((vals[s.key] ?? '') !== s.value) {
        const { error } = await supabase.from('tally_setting').update({ value: (vals[s.key] ?? '').trim() }).eq('key', s.key);
        if (error) { onError(friendlyError(error)); setSaving(false); return; }
      }
    }
    for (const s of sites) {
      const v = (siteVals[s.site_id] ?? '').trim();
      if (v !== (s.tally_ledger_name ?? '')) {
        const { error } = await supabase.from('site').update({ tally_ledger_name: v || null }).eq('site_id', s.site_id);
        if (error) { onError(friendlyError(error)); setSaving(false); return; }
      }
    }
    setSaving(false);
    onSaved();
  }

  const inp = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-sans text-sm outline-none focus:border-[#1F3A52] focus:ring-2 focus:ring-[#1F3A52]/15';
  return (
    <Panel title="Tally setup — names must match Tally exactly" action={<PrimaryButton onClick={save} disabled={saving}><Settings2 size={14} /> {saving ? 'Saving…' : 'Save setup'}</PrimaryButton>}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-6 py-5 md:grid-cols-2">
        {settings.map((s) => (
          <div key={s.key}>
            <label className="block font-sans text-xs font-semibold text-slate-600">{s.label}</label>
            <input className={inp} value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
            {s.hint && <p className="mt-1 font-sans text-[11px] text-slate-400">{s.hint}</p>}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-6 py-4">
        <div className="font-sans text-sm font-semibold text-slate-700">Customer (party) ledger for each site</div>
        <p className="mt-1 font-sans text-xs text-slate-500">Leave blank to use the client&apos;s full legal name. Fill it in when the ledger in Tally is named differently (for example one ledger per hotel). The agent never creates ledgers: if one is missing it stops and tells you which to create.</p>
        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          {sites.map((s) => (
            <div key={s.site_id}>
              <label className="block font-sans text-xs font-semibold text-slate-600">{s.client?.display_name} — {s.site_name}</label>
              <input className={inp} value={siteVals[s.site_id] ?? ''} placeholder={s.client?.legal_name ?? ''} onChange={(e) => setSiteVals({ ...siteVals, [s.site_id]: e.target.value })} />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function AgentHelp() {
  return (
    <Panel title="How the sending works (one-time setup on the PC where Tally runs)">
      <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2">
        <ol className="list-decimal space-y-2 pl-5 font-sans text-sm leading-relaxed text-slate-600">
          <li>Tally Prime is on your PC and this tracker is on the internet, so a small <b>agent</b> on your PC carries entries across. Tally is never opened to the internet.</li>
          <li>In Tally: <b>F1 (Help) → Settings → Connectivity → Client/Server configuration</b>, and turn on the HTTP-XML server (port 9000).</li>
          <li>Try it first in a <b>test company</b> in Tally, not your real books.</li>
          <li>Press <b>Send</b> above. Entries wait here as &quot;Waiting for the agent&quot;.</li>
          <li>Run the agent on the PC. It posts each entry, then marks it <b>Sent</b> here, or shows exactly why Tally refused it.</li>
        </ol>
        <div className="rounded-lg bg-[#0F2233] p-4 font-mono text-xs leading-relaxed text-slate-200">
          <div className="mb-2 flex items-center gap-2 font-sans text-[11px] uppercase tracking-wider text-slate-400"><Terminal size={13} /> Full steps are in the repo</div>
          <div>tally-agent/README.md</div>
          <div className="mt-3 text-slate-400"># first run is a safe rehearsal:</div>
          <div>npm start</div>
          <div className="text-slate-400"># prints what it WOULD post, changes nothing</div>
          <div className="mt-2">npm run live</div>
          <div className="text-slate-400"># really posts to Tally</div>
        </div>
      </div>
    </Panel>
  );
}
