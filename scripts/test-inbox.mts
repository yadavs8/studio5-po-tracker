import assert from 'node:assert/strict';
import { matchClient, matchSite, matchPo, checkDraft, suggestMatches, similarity, norm, type Draft } from '../src/lib/inboxMatch.ts';

// Real client / site names from the tracker
const clients = [
  { client_id: 'c1', legal_name: 'Lemon Tree Hotels Limited (Group)', display_name: 'Lemon Tree Group', gstin: null },
  { client_id: 'c2', legal_name: 'DSS Buildtech Pvt Ltd', display_name: 'DSS Buildtech', gstin: '06AABCD1234E1Z5' },
  { client_id: 'c3', legal_name: 'Silverglades Infrastructure Pvt Ltd (SIPL)', display_name: 'Silverglades Infra', gstin: null },
  { client_id: 'c4', legal_name: 'Coronet Hotel Services Pvt Ltd', display_name: 'Coronet Hotel Services', gstin: null },
  { client_id: 'c5', legal_name: 'PDCL (Lemon Tree Hotel Dehradun)', display_name: 'PDCL - Lemon Tree Dehradun', gstin: null },
];
// clients: names as printed on real documents
assert.equal(matchClient(clients, 'DSS BUILDTECH PRIVATE LIMITED', null)?.client_id, 'c2');
assert.equal(matchClient(clients, 'Silverglades Infrastructure Pvt. Ltd.', null)?.client_id, 'c3');
assert.equal(matchClient(clients, 'Coronet Hotel Services Private Limited', null)?.client_id, 'c4');
assert.equal(matchClient(clients, 'Totally Unknown Traders', null), null, 'no wild guess');
assert.equal(matchClient(clients, 'something else', '06 AABCD1234E1Z5')?.client_id, 'c2', 'GSTIN beats the name');

const sites = [
  { site_id: 's1', client_id: 'c1', site_name: 'Keys Hotel - Hosur Road, Bengaluru' },
  { site_id: 's2', client_id: 'c1', site_name: 'Keys Hotel - Kochi' },
  { site_id: 's3', client_id: 'c1', site_name: 'Lemon Tree Hotels - PGN-1 Gurgaon' },
];
assert.equal(matchSite(sites, 'Keys Hotel Hosur Road Bangalore', null)?.site_id, 's1');
assert.equal(matchSite(sites, 'Keys Hotel, Kochi', null)?.site_id, 's2');
assert.equal(matchSite(sites, 'Sector 29 Gurgaon PGN-1 hotel', null)?.site_id, 's3');
assert.equal(matchSite(sites, 'Random Mall', null), null);

// PO references
const pos = [{ po_id: 'p1', site_id: 's1', po_number: 'PDCL/LTHDN/20260729/016' }, { po_id: 'p2', site_id: 's1', po_number: 'STU/KITC/2025-26/103' }];
assert.equal(matchPo(pos, 'pdcl/lthdn/20260729/016')?.po_id, 'p1');
assert.equal(matchPo(pos, 'STU KITC 2025-26 103')?.po_id, 'p2');
assert.equal(matchPo(pos, 'X1'), null);
assert.ok(similarity('a b', '') === 0);

// checks
const today = '2026-09-20';
const inv: Draft = { kind: 'tax_invoice', siteId: 's1', number: 'S5I/26-27/DS/7', date: '2026-09-01', taxable: '100000', gst: '18000', total: '118000', amount: '' };
assert.deepEqual(checkDraft(inv, { existingNumbers: [], today }), { errors: [], warnings: [] });
assert.match(checkDraft({ ...inv, total: '118500' }, { existingNumbers: [], today }).errors[0], /does not equal the invoice total/);
assert.match(checkDraft(inv, { existingNumbers: ['s5i/26-27/ds/7'], today }).errors[0], /already recorded/, 'duplicate number, any spacing / case');
assert.match(checkDraft({ ...inv, date: '2026-12-31' }, { existingNumbers: [], today }).warnings[0], /future/);
assert.match(checkDraft(inv, { existingNumbers: [], today, poLeftToBill: 50000 }).warnings[0], /more than what is left to bill/);
assert.match(checkDraft({ ...inv, siteId: '' }, { existingNumbers: [], today }).errors[0], /Choose the site/);
assert.ok(checkDraft({ ...inv, date: '' }, { existingNumbers: [], today }).errors.some((e) => /date/.test(e)));
const po: Draft = { kind: 'purchase_order', siteId: 's1', number: 'PO-1', date: '2026-07-29', taxable: '', gst: '', total: '1055546.88', amount: '' };
assert.deepEqual(checkDraft(po, { existingNumbers: [], today }).errors, []);
assert.ok(checkDraft({ ...po, total: '0' }, { existingNumbers: [], today }).errors.length === 1);
const pay: Draft = { kind: 'payment_advice', siteId: 's1', number: '', date: '2026-09-10', taxable: '', gst: '', total: '', amount: '500000' };
assert.deepEqual(checkDraft(pay, { existingNumbers: [], today, matchedTotal: 500000 }).errors, []);
assert.match(checkDraft(pay, { existingNumbers: [], today, matchedTotal: 500001 }).errors[0], /more than the amount received/);

// payment -> invoices: only the ones named, never more than each needs, nothing guessed
const open = [{ invoice_id: 'i1', invoice_number: 'S5I/24-25/022', remaining: 300000 }, { invoice_id: 'i2', invoice_number: 'S5I/24-25/024', remaining: 400000 }, { invoice_id: 'i3', invoice_number: 'S5I/24-25/025', remaining: 100000 }];
assert.deepEqual(suggestMatches(500000, open, ['s5i/24-25/022', 'S5I/24-25/024']), { i1: 300000, i2: 200000 });
assert.deepEqual(suggestMatches(1_000_000, open, ['S5I/24-25/025']), { i3: 100000 }, 'cannot exceed what the invoice needs');
assert.deepEqual(suggestMatches(500000, open, []), {}, 'no invoice named -> no guess');
assert.equal(norm('S5I/24-25/022'), 's5i2425022');
console.log('Matching and checking: all checks passed');
