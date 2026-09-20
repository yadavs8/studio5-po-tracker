// Pure voucher-building helpers (no network). Tested by test-voucher.js. Keep in step with src/lib/tally.ts in the app.

export const r2 = (n) => Math.round(Number(n) * 100) / 100;
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const ymd = (d) => String(d).slice(0, 10).replace(/-/g, '');

// ------------------------------------------------------------------ voucher building
export function linesFor(rec, s) {
  if (rec.type === 'invoice') {
    const i = rec.invoice;
    const gross = r2(i.gross_invoice_value), gst = r2(i.gst_amount ?? 0), taxable = r2(i.taxable_value);
    const L = [{ ledger: rec.party, dr: true, amount: gross, party: true }, { ledger: s.sales_ledger, dr: false, amount: taxable }];
    if (gst > 0) {
      if (i.gst_type === 'cgst_sgst') { const h = r2(gst / 2); L.push({ ledger: s.cgst_ledger, dr: false, amount: h }, { ledger: s.sgst_ledger, dr: false, amount: r2(gst - h) }); }
      else L.push({ ledger: s.igst_ledger, dr: false, amount: gst });
    }
    return L;
  }
  if (rec.type === 'payment') {
    const p = rec.payment, amt = r2(p.amount_received);
    return [{ ledger: p.payment_mode === 'cash' ? s.cash_ledger : s.bank_ledger, dr: true, amount: amt }, { ledger: rec.party, dr: false, amount: amt, party: true }];
  }
  const amt = r2(rec.deduction.amount); // TDS journal
  return [{ ledger: s.tds_ledger, dr: true, amount: amt }, { ledger: rec.party, dr: false, amount: amt, party: true }];
}

export function voucherXml(rec, s, lines) {
  const vt = rec.type === 'invoice' ? 'Sales' : rec.type === 'payment' ? 'Receipt' : 'Journal';
  const date = ymd(rec.type === 'invoice' ? rec.invoice.invoice_date : rec.type === 'payment' ? rec.payment.payment_date : rec.deduction.deduction_date);
  const number = rec.type === 'invoice' ? rec.invoice.invoice_number : '';
  const narr = rec.type === 'invoice' ? `Studio5: ${rec.site} - Invoice ${number}`
    : rec.type === 'payment' ? `Studio5: ${rec.site} - ${[rec.payment.utr_or_reference, rec.payment.remarks].filter(Boolean).join(' - ')}`
    : `Studio5: ${rec.site} - TDS deducted on invoice ${rec.invoiceNumber}`;
  const entries = lines.map((l) => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(l.ledger)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${l.dr ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>${l.party ? '\n        <ISPARTYLEDGER>Yes</ISPARTYLEDGER>' : ''}
        <AMOUNT>${(l.dr ? -l.amount : l.amount).toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`).join('');
  return `<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY><IMPORTDATA>
  <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(s.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
  <REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
   <VOUCHER VCHTYPE="${vt}" ACTION="Create" OBJVIEW="Accounting Voucher View">
    <DATE>${date}</DATE>
    <VOUCHERTYPENAME>${vt}</VOUCHERTYPENAME>${number ? `\n    <VOUCHERNUMBER>${esc(number)}</VOUCHERNUMBER>` : ''}
    <PARTYLEDGERNAME>${esc(rec.party)}</PARTYLEDGERNAME>
    <NARRATION>${esc(narr)}</NARRATION>${entries}
   </VOUCHER>
  </TALLYMESSAGE></REQUESTDATA>
 </IMPORTDATA></BODY>
</ENVELOPE>`;
}


export function parseImportResult(out) {
  const num = (tag) => { const m = out.match(new RegExp(`<${tag}>(\\d+)</${tag}>`)); return m ? Number(m[1]) : 0; };
  const created = num('CREATED'), errors = num('ERRORS'), altered = num('ALTERED');
  const lineErr = [...out.matchAll(/<LINEERROR>([^<]*)<\/LINEERROR>/g)].map((m) => unesc(m[1])).join(' | ');
  return { ok: (created > 0 || altered > 0) && errors === 0, message: lineErr || (errors ? 'Tally rejected the voucher.' : created === 0 ? 'Tally did not create the voucher.' : '') };
}
