// Run: npm test   (no Tally or internet needed)
import assert from 'node:assert/strict';
import { linesFor, voucherXml, parseImportResult, r2 } from './voucher.js';

const S = { company: 'TEST CO', sales_ledger: 'Sales - Interior Fit-Out', igst_ledger: 'IGST', cgst_ledger: 'CGST', sgst_ledger: 'SGST', tds_ledger: 'TDS Receivable', bank_ledger: 'Bank Account', cash_ledger: 'Cash' };

const sum = (L, dr) => r2(L.filter((l) => l.dr === dr).reduce((a, l) => a + l.amount, 0));

// minimal well-formedness check: every opening tag has a matching closing tag, in order
function wellFormed(xml) {
  const stack = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (!close) stack.push(name);
    else assert.equal(stack.pop(), name, `mismatched tag </${name}>`);
  }
  assert.equal(stack.length, 0, 'unclosed tags: ' + stack.join(','));
}

// 1. Real DSS invoice (S5I/24-25/025): IGST invoice
{
  const rec = { type: 'invoice', site: 'The Melia, Sohna Road', party: 'DSS Buildtech Pvt Ltd',
    invoice: { invoice_number: 'S5I/24-25/025', invoice_date: '2024-10-18', taxable_value: 974675, gst_amount: 175441.5, gross_invoice_value: 1150116.5, gst_type: 'igst' } };
  const L = linesFor(rec, S);
  assert.equal(sum(L, true), 1150116.5); assert.equal(sum(L, false), 1150116.5);
  assert.deepEqual(L.map((l) => l.ledger), ['DSS Buildtech Pvt Ltd', 'Sales - Interior Fit-Out', 'IGST']);
  const xml = voucherXml(rec, S, L); wellFormed(xml);
  assert.match(xml, /<DATE>20241018<\/DATE>/); assert.match(xml, /<VOUCHERNUMBER>S5I\/24-25\/025<\/VOUCHERNUMBER>/);
  assert.match(xml, /<LEDGERNAME>DSS Buildtech Pvt Ltd<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>\s*<AMOUNT>-1150116.50<\/AMOUNT>/); // debit = Yes, negative
  assert.match(xml, /<LEDGERNAME>IGST<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>175441.50<\/AMOUNT>/);   // credit = No, positive
  assert.match(xml, /SVCURRENTCOMPANY>TEST CO</);
}
// 2. Same-state invoice splits GST into CGST + SGST, odd paisa handled
{
  const rec = { type: 'invoice', site: 'X', party: 'P', invoice: { invoice_number: 'A/1', invoice_date: '2026-01-05', taxable_value: 100, gst_amount: 18.01, gross_invoice_value: 118.01, gst_type: 'cgst_sgst' } };
  const L = linesFor(rec, S);
  assert.equal(sum(L, true), sum(L, false)); assert.equal(L.length, 4); wellFormed(voucherXml(rec, S, L));
}
// 3. Receipt: bank debit, party credit (the spec had these signs the wrong way round)
{
  const rec = { type: 'payment', site: 'The Melia, Sohna Road', party: 'DSS Buildtech Pvt Ltd', payment: { amount_received: 2966144, payment_mode: 'bank_transfer', payment_date: '2024-10-29', utr_or_reference: 'DSS-P07', remarks: 'T-B,C,S1 (Inv 022,024,025 & 027)' } };
  const L = linesFor(rec, S);
  assert.deepEqual(L.map((l) => [l.ledger, l.dr]), [['Bank Account', true], ['DSS Buildtech Pvt Ltd', false]]);
  const xml = voucherXml(rec, S, L); wellFormed(xml);
  assert.match(xml, /Bank Account<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-2966144.00</);
  assert.match(xml, /<AMOUNT>2966144.00<\/AMOUNT>/);
  assert.ok(!xml.includes('<VOUCHERNUMBER>'), 'receipt has no number so Tally auto-numbers it');
}
// 4. Cash receipt goes to the Cash ledger
{
  const rec = { type: 'payment', site: 'S', party: 'Coronet Hotel Services Pvt Ltd', payment: { amount_received: 1500000, payment_mode: 'cash', payment_date: '2026-09-19', utr_or_reference: null, remarks: 'cash' } };
  assert.equal(linesFor(rec, S)[0].ledger, 'Cash');
}
// 5. TDS journal: TDS receivable debit, party credit
{
  const rec = { type: 'deduction', site: 'S', party: 'DSS Buildtech Pvt Ltd', invoiceNumber: 'S5I/007/23-24', deduction: { amount: 3344, deduction_date: '2023-12-19' } };
  const L = linesFor(rec, S);
  assert.deepEqual(L.map((l) => [l.ledger, l.dr, l.amount]), [['TDS Receivable', true, 3344], ['DSS Buildtech Pvt Ltd', false, 3344]]);
  wellFormed(voucherXml(rec, S, L));
}
// 6. Names with & < > " are escaped so the XML stays valid
{
  const rec = { type: 'payment', site: 'A & B <Site>', party: 'Ram & Sons "Pvt" Ltd', payment: { amount_received: 10, payment_mode: 'bank_transfer', payment_date: '2026-02-01', utr_or_reference: 'U1', remarks: 'a<b' } };
  const xml = voucherXml(rec, S, linesFor(rec, S)); wellFormed(xml);
  assert.match(xml, /Ram &amp; Sons &quot;Pvt&quot; Ltd/);
}
// 7. Reading Tally's answer
{
  assert.equal(parseImportResult('<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><ERRORS>0</ERRORS></RESPONSE>').ok, true);
  const bad = parseImportResult('<RESPONSE><CREATED>0</CREATED><ERRORS>1</ERRORS><LINEERROR>Ledger &quot;X&quot; does not exist!</LINEERROR></RESPONSE>');
  assert.equal(bad.ok, false); assert.match(bad.message, /Ledger "X" does not exist/);
}
console.log('All Tally voucher tests passed (7 groups).');
