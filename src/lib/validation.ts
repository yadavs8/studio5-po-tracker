// Shared checks for the PO / PI / invoice / payment / deduction forms (and Upload), so every
// form refuses the same bad input with the same plain message before anything is sent.
// The database has the final say (positive amounts, GST adds up, unique numbers…).
import { z } from 'zod';
import { isRealDate } from '@/lib/format';
import { resolveGst } from '@/lib/money';
import { REPORTING_START, REPORTING_START_LABEL } from '@/lib/period';

const number = (what: string) =>
  z.string().trim().min(1, `Please fill in ${what}.`)
    .refine((v) => /^-?\d+(\.\d+)?$/.test(v), `${what[0].toUpperCase()}${what.slice(1)} must be a plain number (no commas or ₹).`)
    .transform(Number);
const positive = (what: string, msg: string) => number(what).refine((v) => v > 0, msg);
const docNumber = (what: string) => z.string().trim().min(1, `Please fill in the ${what}.`).max(80, `The ${what} is too long.`);
const date = (what: string) =>
  z.string().trim().min(1, `Please fill in the ${what}.`)
    .refine(isRealDate, 'Please enter a real date.')
    .refine((d) => d >= REPORTING_START, `The portal only keeps records from ${REPORTING_START_LABEL} onwards — please check the date.`);
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null);

export const poInput = z.object({
  po_number: docNumber('PO number'),
  po_date: date('PO date'),
  total_value_with_gst: positive('the PO total', 'The PO total must be above zero.'),
});

export const piInput = z.object({
  pi_number: docNumber('PI number'),
  pi_date: date('PI date'),
  amount: positive('the PI amount', 'The PI amount must be above zero.'),
});

export const invoiceInput = z.object({
  invoice_number: docNumber('invoice number'),
  invoice_date: date('invoice date'),
  taxable_value: z.string(),
  gst_amount: z.string(),
  total: z.string(),
}).transform((v, ctx) => {
  const n = (s: string) => (s.trim() === '' ? null : /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const [t, g, tot] = [n(v.taxable_value), n(v.gst_amount), n(v.total)];
  if ([t, g, tot].some((x) => Number.isNaN(x))) {
    ctx.addIssue({ code: 'custom', message: 'Amounts must be plain numbers (no commas or ₹).' });
    return z.NEVER;
  }
  const r = resolveGst(t, g, tot);
  if (!r.ok) { ctx.addIssue({ code: 'custom', message: r.error }); return z.NEVER; }
  return { invoice_number: v.invoice_number, invoice_date: v.invoice_date, taxable_value: r.taxable, gst_amount: r.gst, gross_invoice_value: r.gross };
});

export const paymentInput = z.object({
  payment_date: date('payment date'),
  amount_received: positive('the amount received', 'The amount received must be above zero.'),
  utr_or_reference: optionalText(100),
});

export const deductionInput = z.object({
  deduction_type: z.enum(['tds', 'gst_tds', 'retention', 'handover_hold', 'penalty', 'discount', 'other'], { message: 'Please choose the type of deduction.' }),
  amount: positive('the amount', 'The amount must be above zero.'),
});

export type Checked<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a schema and returns the data, or the first problem as one plain sentence. */
export function check<S extends z.ZodType>(schema: S, input: unknown): Checked<z.output<S>> {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0]?.message ?? 'Please check the form.' };
}
