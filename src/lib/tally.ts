// What each record becomes in Tally. Keep in step with tally-agent/agent.js (which builds the real XML).
// Tally convention: a Debit line is "Dr", a Credit line is "Cr". Every voucher must balance (Dr total = Cr total).

export type TallyRecordType = 'invoice' | 'payment' | 'deduction';
export type TallyStatus = 'not_queued' | 'pending' | 'pushed' | 'failed';

export interface QueueRow {
  record_type: TallyRecordType;
  record_id: string;
  voucher_type: 'Sales' | 'Receipt' | 'Journal';
  voucher_date: string;
  reference: string;
  site_id: string;
  site_name: string;
  party_ledger: string;
  amount: number;
  sync_id: string | null;
  status: TallyStatus;
  error_message: string | null;
  pushed_at: string | null;
}

export type Settings = Record<string, string>;
export interface VoucherLine { ledger: string; side: 'Dr' | 'Cr'; amount: number }

export interface InvoiceDetail { taxable_value: number; gst_amount: number | null; gst_type: 'igst' | 'cgst_sgst' | null; gross_invoice_value: number }
export interface PaymentDetail { amount_received: number; payment_mode: string }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function voucherLines(row: QueueRow, s: Settings, d?: InvoiceDetail | PaymentDetail): VoucherLine[] {
  if (row.record_type === 'invoice') {
    const inv = d as InvoiceDetail | undefined;
    const gross = r2(inv?.gross_invoice_value ?? row.amount);
    const gst = r2(inv?.gst_amount ?? 0);
    const taxable = r2(inv ? inv.taxable_value : gross - gst);
    const lines: VoucherLine[] = [
      { ledger: row.party_ledger, side: 'Dr', amount: gross },
      { ledger: s.sales_ledger, side: 'Cr', amount: taxable },
    ];
    if (gst > 0) {
      if (inv?.gst_type === 'cgst_sgst') {
        const half = r2(gst / 2);
        lines.push({ ledger: s.cgst_ledger, side: 'Cr', amount: half }, { ledger: s.sgst_ledger, side: 'Cr', amount: r2(gst - half) });
      } else {
        lines.push({ ledger: s.igst_ledger, side: 'Cr', amount: gst });
      }
    }
    return lines;
  }
  if (row.record_type === 'payment') {
    const p = d as PaymentDetail | undefined;
    const amt = r2(p?.amount_received ?? row.amount);
    const cash = p?.payment_mode === 'cash';
    return [
      { ledger: cash ? s.cash_ledger : s.bank_ledger, side: 'Dr', amount: amt },
      { ledger: row.party_ledger, side: 'Cr', amount: amt },
    ];
  }
  const amt = r2(row.amount);
  return [
    { ledger: s.tds_ledger, side: 'Dr', amount: amt },
    { ledger: row.party_ledger, side: 'Cr', amount: amt },
  ];
}

export const VOUCHER_PLAIN: Record<string, string> = {
  Sales: 'Sales voucher (a tax invoice)',
  Receipt: 'Receipt voucher (money received)',
  Journal: 'Journal voucher (tax deducted by client)',
};
