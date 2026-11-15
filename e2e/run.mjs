// Browser tests against the LOCAL test Supabase (run `npm run test:db` first — it loads the fixtures).
//   npm run test:e2e            → smoke (every route, desktop + phone) and flows
// Starts `next dev` on port 3100 pointed at the local stack, then drives Chromium with Playwright.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import { smoke } from './smoke.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const env = Object.fromEntries(
  execSync('npx -y supabase@3.1.0 --workdir test/supabase status -o env', { encoding: 'utf8' })
    .split('\n').map((l) => l.match(/^([A-Z_]+)="(.*)"$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
if (!/^http:\/\/127\.0\.0\.1:/.test(env.API_URL ?? '')) throw new Error('Local Supabase is not running (npx supabase --workdir test/supabase start).');

export const OWNER = { id: '00000000-0000-0000-0000-0000000000a1', email: 'owner@test.local', password: 'Test-Pass-123' };
export const OUTSIDER = { id: '00000000-0000-0000-0000-0000000000b2', email: 'outsider@test.local', password: 'Test-Pass-123' };

// Give the fixture users a password (the SQL fixtures create them without one).
for (const u of [OWNER, OUTSIDER]) {
  const r = await fetch(`${env.API_URL}/auth/v1/admin/users/${u.id}`, {
    method: 'PUT',
    headers: { apikey: env.SECRET_KEY, Authorization: `Bearer ${env.SECRET_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ password: u.password, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`could not set password for ${u.email}: ${r.status} ${await r.text()}`);
}

const PORT = 3100;
const BASE = `http://localhost:${PORT}/studio5-po-tracker`;
const dev = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: env.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.PUBLISHABLE_KEY, NEXT_PUBLIC_EXTRACT_URL: 'http://127.0.0.1:9' },
  stdio: 'ignore', detached: true,
});
const stop = () => { try { process.kill(-dev.pid); } catch { /* already gone */ } };
process.on('exit', stop);

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try { up = (await fetch(`${BASE}/login/`)).ok; } catch { /* not yet */ }
  if (!up) await sleep(1000);
}
if (!up) { stop(); throw new Error('next dev did not start'); }

const browser = await chromium.launch();
const failures = [];
const ctx = { browser, BASE, OWNER, OUTSIDER, env, fail: (m) => failures.push(m) };
try {
  await smoke(ctx);
  const flows = await import('./flows.mjs').catch(() => null);
  if (flows) await flows.flows(ctx);
} finally {
  await browser.close();
  stop();
}
if (failures.length) { console.error(`\n${failures.length} e2e failure(s):\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('e2e: all checks passed');
