// Plain-English wording used across the app, so nobody needs accounting knowledge.
// One place to change a label and it changes everywhere.

export const WORDS = {
  poValue: 'PO value (with GST)',
  billed: 'Billed so far',
  received: 'Money received in bank',
  stillToReceive: 'Still to receive on the PO',
  billedUnpaid: 'Billed, waiting for client to pay',
  notBilled: 'Not billed yet',
  held: 'Held back until handover',
  taxDeducted: 'Tax deducted by client',
  advanceLeft: 'Advance received, not yet used',
} as const;

// Short "what does this mean" text shown when hovering the (?) marks and on the Guide page.
export const HELP = {
  poValue: 'The total the client agreed to pay in their purchase order, including GST.',
  billed: 'Total of all tax invoices you have raised against this PO.',
  received: 'Actual money that has reached your bank (advances and payments).',
  stillToReceive: 'PO value minus money received minus tax deducted. Everything still to come, whether billed or not.',
  billedUnpaid: 'Tax invoices you have raised that the client has not paid yet. This is the money they owe you right now.',
  notBilled: 'Work agreed in the PO that you have not invoiced yet.',
  held: 'A part (often 10%) the client keeps until the site is handed over. It is not overdue, and it is shown separately.',
  taxDeducted: 'TDS: the client pays this small % to the tax department on your behalf. You do not receive it in the bank, but you get tax credit for it.',
  advanceLeft: 'Advance money received before invoices. It gets adjusted against future invoices.',
} as const;

/** Turn database/technical errors into a sentence a non-technical person understands. */
export function friendlyError(e: { message: string; code?: string } | null | undefined): string {
  if (!e) return '';
  const m = e.message ?? '';
  if (e.code === '23505' || /duplicate key/i.test(m)) {
    return 'That number is already used for this site. Please check it is not a duplicate entry.';
  }
  if (e.code === '23514' || /violates check constraint/i.test(m)) {
    if (/gst_adds_up/i.test(m)) return 'Taxable value + GST must equal the invoice total. Please recheck the three amounts.';
    return 'One of the amounts is not valid. Amounts must be above zero.';
  }
  if (e.code === '23503') return 'This is linked to something that no longer exists. Refresh the page and try again.';
  if (e.code === '23502') return 'A required field is empty. Please fill in every field marked required.';
  if (e.code === '42501' || /row-level security/i.test(m)) return 'You are not signed in, or your session expired. Please sign in again.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Could not reach the server. Check your internet connection and try again.';
  // Our own database rules already speak plain English, e.g. "This is more than the invoice still needs…"
  return m;
}
