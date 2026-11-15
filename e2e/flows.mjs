// Main flows, signed in against the local test Supabase (fixtures from supabase/seed_test.sql).
// Uses the empty fixture site "Test Hotels - Goa" so the expected figures are exact.
import { signIn } from './smoke.mjs';

const GOA = '51111111-0000-0000-0000-000000000002';
const PUNE = '51111111-0000-0000-0000-000000000001';

async function pickSite(page) {
  await page.getByLabel('Client').selectOption({ label: 'Test Hotels' });
  await page.getByLabel('Site').selectOption({ label: 'Test Hotels - Goa' });
}
const settle = (page) => page.waitForLoadState('networkidle').catch(() => {});

export async function flows({ browser, BASE, OWNER, OUTSIDER, fail }) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`flows page error: ${e.message}`));
  const step = async (name, fn) => {
    try { await fn(); console.log(`ok   flow: ${name}`); }
    catch (e) { fail(`flow "${name}": ${e.message.split('\n')[0]}`); }
  };
  await signIn(page, BASE, OWNER);

  await step('add a PO and a PI', async () => {
    await page.goto(`${BASE}/po-pi/`); await pickSite(page); await settle(page);
    await page.getByRole('button', { name: '+ Add PO' }).click();
    await page.getByLabel('PO Number').fill('E2E-PO-1');
    await page.getByLabel('PO Date').fill('2026-10-01');
    await page.getByLabel('Total value (with GST)').fill('118000');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('E2E-PO-1').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: '+ Add PI' }).click();
    await page.getByLabel('PI Number').fill('E2E-PI-1');
    await page.getByLabel('PI Date').fill('2026-10-02');
    await page.getByLabel('Amount', { exact: true }).fill('59000');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('E2E-PI-1').first().waitFor({ timeout: 10000 });
  });

  await step('a duplicate PO number on the same site is refused with a plain message', async () => {
    await page.getByRole('button', { name: '+ Add PO' }).click();
    await page.getByLabel('PO Number').fill(' e2e-po-1 ');
    await page.getByLabel('PO Date').fill('2026-10-03');
    await page.getByLabel('Total value (with GST)').fill('1000');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('already used for this site').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  await step('raise a tax invoice against the PO', async () => {
    await page.goto(`${BASE}/invoices/`); await pickSite(page); await settle(page);
    await page.getByRole('button', { name: '+ Add Invoice' }).click();
    await page.getByLabel('Invoice Number').fill('E2E-INV-1');
    await page.getByLabel('Invoice Date').fill('2026-10-05');
    await page.getByLabel('Taxable Value').fill('100000');
    await page.getByLabel('GST Amount').fill('18000');
    await page.getByLabel('Linked PO (optional)').selectOption({ label: 'E2E-PO-1' });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('E2E-INV-1').first().waitFor({ timeout: 10000 });
  });

  await step('record a payment and match it to the invoice', async () => {
    await page.goto(`${BASE}/payments/`); await pickSite(page); await settle(page);
    await page.getByRole('button', { name: '+ Record Payment' }).click();
    await page.getByLabel('Payment Date').fill('2026-10-10');
    await page.getByLabel('Amount Received').fill('50000');
    await page.getByLabel('UTR / Reference (optional)').fill('E2E-UTR-1');
    await page.getByLabel('Amount of this payment for invoice E2E-INV-1').fill('50000');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Payments (1)').waitFor({ timeout: 10000 });
  });

  await step('the site page adds it up: ₹1,18,000 billed, ₹50,000 received, ₹68,000 waiting', async () => {
    await page.goto(`${BASE}/site/?id=${GOA}`); await settle(page);
    const text = await page.innerText('main');
    for (const want of ['₹1,18,000.00', '₹50,000.00', '₹68,000.00']) {
      if (!text.includes(want)) throw new Error(`site page is missing ${want}`);
    }
  });

  await step('the account statement received total equals the bank', async () => {
    await page.goto(`${BASE}/site/statement/?id=${PUNE}`); await settle(page);
    const text = await page.innerText('main');
    // Pune fixtures: ₹1,00,000 received (tagged PO-X, matched to INV-1 on PO-Y) — must not show ₹2,00,000.
    if (text.includes('₹2,00,000.00')) throw new Error('statement double-counts the cross-PO payment');
    if (/INV-2\b/.test(text)) throw new Error('statement lists the cancelled invoice INV-2');
  });

  await step('a bad link shows a plain message, not a database error', async () => {
    await page.goto(`${BASE}/site/?id=not-a-uuid`); await settle(page);
    const text = await page.innerText('main');
    if (/invalid input syntax|coerce/i.test(text)) throw new Error('raw database error shown');
    if (!/link is not valid/i.test(text)) throw new Error('no plain "link is not valid" message');
  });
  await ctx.close();

  // Another app's account on the shared project: signed in, but sees no Studio5 data at all.
  const octx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const opage = await octx.newPage();
  await step('an account that is not Studio5 staff sees nothing', async () => {
    await signIn(opage, BASE, OUTSIDER);
    await opage.goto(`${BASE}/site/?id=${PUNE}`); await settle(opage);
    const text = await opage.innerText('main');
    if (/Test Hotels|PO-X|INV-1/.test(text)) throw new Error('outsider can see Studio5 data');
  });
  await octx.close();
}
