// Studio5 -> Tally Prime sync agent.
// Runs on the PC where Tally is open. One-way: it reads entries the tracker has queued and posts them to Tally.
// It never reads accounting data back out of Tally (except the list of ledger NAMES, to check they exist),
// never creates ledgers, and refuses to run live without a company name.
//
//   npm start      -> REHEARSAL: prints exactly what it would post, changes nothing anywhere.
//   npm run live   -> posts to Tally and marks each entry sent / failed in the tracker.
//
// Keep the voucher lines in step with src/lib/tally.ts in the app.

import { createClient } from '@supabase/supabase-js';

const env = process.env;
const LIVE = env.LIVE === '1';
const TALLY_URL = env.TALLY_URL || 'http://localhost:9000';
const POLL = Number(env.POLL_SECONDS || 0); // 0 = run once and exit

for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AGENT_EMAIL', 'AGENT_PASSWORD']) {
  if (!env[k]) { console.error(`Missing ${k}. Copy env.example.txt to .env and fill it in (see README.md).`); process.exit(1); }
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });

import { r2, esc, unesc, ymd, linesFor, voucherXml, parseImportResult } from './voucher.js';

const log = (...a) => console.log(new Date().toLocaleTimeString('en-IN'), ...a);

// ------------------------------------------------------------------ Tally I/O
async function tally(xml) {
  const res = await fetch(TALLY_URL, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body: xml });
  return res.text();
}
async function tallyLedgerNames(company) {
  const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>S5Ledgers</ID></HEADER>
<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>
<TDL><TDLMESSAGE><COLLECTION NAME="S5Ledgers" ISMODIFY="No"><TYPE>Ledger</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  const out = await tally(xml);
  const names = new Set();
  for (const m of out.matchAll(/<LEDGER[^>]*\sNAME="([^"]+)"/g)) names.add(unesc(m[1]).toLowerCase());
  for (const m of out.matchAll(/<NAME[^>]*>([^<]+)<\/NAME>/g)) names.add(unesc(m[1]).trim().toLowerCase());
  return names;
}
// ------------------------------------------------------------------ loading what to send
async function loadRecord(row) {
  const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data; };
  const siteInfo = async (siteId) => {
    const s = await one(sb.from('site').select('site_name, tally_ledger_name, client:client_id(legal_name)').eq('site_id', siteId).single());
    return { site: s.site_name, party: (s.tally_ledger_name || '').trim() || s.client.legal_name };
  };
  if (row.record_type === 'invoice') {
    const invoice = await one(sb.from('tax_invoice').select('*').eq('invoice_id', row.record_id).single());
    return { type: 'invoice', invoice, ...(await siteInfo(invoice.site_id)) };
  }
  if (row.record_type === 'payment') {
    const payment = await one(sb.from('payment').select('*').eq('payment_id', row.record_id).single());
    return { type: 'payment', payment, ...(await siteInfo(payment.site_id)) };
  }
  const deduction = await one(sb.from('deduction').select('*').eq('deduction_id', row.record_id).single());
  const inv = await one(sb.from('tax_invoice').select('invoice_number, site_id').eq('invoice_id', deduction.invoice_id).single());
  return { type: 'deduction', deduction, invoiceNumber: inv.invoice_number, ...(await siteInfo(inv.site_id)) };
}

async function markSent(row) {
  await sb.from('tally_sync_log').update({ sync_status: 'pushed', pushed_at: new Date().toISOString(), error_message: null }).eq('sync_id', row.sync_id);
}
async function markFailed(row, msg) {
  await sb.from('tally_sync_log').update({ sync_status: 'failed', error_message: String(msg).slice(0, 500) }).eq('sync_id', row.sync_id);
}

// ------------------------------------------------------------------ one pass
async function runOnce() {
  const { data: setRows, error: se } = await sb.from('tally_setting').select('key,value');
  if (se) throw new Error(se.message);
  const s = Object.fromEntries(setRows.map((r) => [r.key, (r.value || '').trim()]));

  const { data: pending, error: pe } = await sb.from('tally_sync_log').select('*').eq('sync_status', 'pending').order('created_at');
  if (pe) throw new Error(pe.message);
  if (!pending.length) { log('Nothing waiting to be sent.'); return; }
  log(`${pending.length} entr${pending.length === 1 ? 'y' : 'ies'} waiting. Mode: ${LIVE ? 'LIVE (posting to Tally)' : 'REHEARSAL (nothing will be posted)'}`);

  let known = null;
  if (LIVE) {
    if (!s.company) throw new Error('The Tally company name is empty. Set it on the tracker\'s Tally page first. Refusing to post.');
    known = await tallyLedgerNames(s.company).catch(() => new Set());
    if (known.size === 0) throw new Error(`Could not read ledgers from Tally company "${s.company}". Is Tally open with that company loaded, and the HTTP-XML server on (port 9000)?`);
    log(`Connected to Tally company "${s.company}" (${known.size} ledgers).`);
  }

  for (const row of pending) {
    try {
      const rec = await loadRecord(row);
      const lines = linesFor(rec, s);
      const dr = r2(lines.filter((l) => l.dr).reduce((a, l) => a + l.amount, 0)), cr = r2(lines.filter((l) => !l.dr).reduce((a, l) => a + l.amount, 0));
      const label = `${row.tally_voucher_type} ${rec.invoice?.invoice_number || rec.payment?.utr_or_reference || rec.invoiceNumber || ''} (${rec.site})`;
      if (dr !== cr) { const m = `Debit ${dr} and credit ${cr} do not match - not sent.`; log('SKIP', label, m); if (LIVE) await markFailed(row, m); continue; }
      const xml = voucherXml(rec, s, lines);

      if (!LIVE) {
        log('WOULD POST', label);
        lines.forEach((l) => console.log(`     ${l.dr ? 'Dr' : 'Cr'}  ${l.ledger.padEnd(46)} ${l.amount.toFixed(2)}`));
        continue;
      }
      const missing = [...new Set(lines.map((l) => l.ledger))].filter((n) => !known.has(n.toLowerCase()));
      if (missing.length) { const m = `Ledger "${missing.join('", "')}" not found in Tally. Create it in Tally (or fix the name on the Tally page), then press Try again.`; log('FAILED', label, m); await markFailed(row, m); continue; }
      const result = parseImportResult(await tally(xml));
      if (result.ok) { await markSent(row); log('SENT', label); } else { await markFailed(row, result.message); log('FAILED', label, result.message); }
    } catch (e) {
      log('ERROR', row.record_type, row.record_id, e.message);
      if (LIVE) await markFailed(row, e.message);
    }
  }
}

// ------------------------------------------------------------------ main
const { error: authErr } = await sb.auth.signInWithPassword({ email: env.AGENT_EMAIL, password: env.AGENT_PASSWORD });
if (authErr) { console.error('Could not sign in to the tracker:', authErr.message); process.exit(1); }
log(`Studio5 Tally agent started. ${LIVE ? 'LIVE mode.' : 'REHEARSAL mode (safe: nothing is posted).'}`);

do {
  try { await runOnce(); } catch (e) { log('Problem:', e.message); if (!POLL) process.exitCode = 1; }
  if (POLL) await new Promise((r) => setTimeout(r, POLL * 1000));
} while (POLL);
