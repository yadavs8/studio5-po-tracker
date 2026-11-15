// Money helpers. Amounts are worked out in whole paise so floating-point noise
// (0.1 + 0.2 = 0.30000000000000004) can never reach a saved figure.

export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => paise / 100;

export type GstResult =
  | { ok: true; taxable: number; gst: number; gross: number }
  | { ok: false; error: string };

/**
 * The GST entry rule (decision 0004), used by every invoice form and the Upload page:
 * - GST may be 0, but never silently blank.
 * - GST blank + total known → GST = total − taxable.
 * - GST and total both blank → refuse.
 * - Parts that do not add up to the total (more than ₹1 apart) → refuse.
 */
export function resolveGst(taxable: number | null, gst: number | null, total: number | null): GstResult {
  if (taxable === null || !Number.isFinite(taxable) || taxable <= 0) {
    return { ok: false, error: 'Enter the taxable value (the amount before GST).' };
  }
  const t = toPaise(taxable);
  if (gst !== null && Number.isFinite(gst)) {
    if (gst < 0) return { ok: false, error: 'GST cannot be negative.' };
    const g = toPaise(gst);
    if (total !== null && Number.isFinite(total) && Math.abs(toPaise(total) - (t + g)) > 100) {
      return { ok: false, error: `Taxable value + GST comes to ${fromPaise(t + g).toFixed(2)}, but the invoice total is ${total.toFixed(2)}. Please recheck the three amounts.` };
    }
    return { ok: true, taxable: fromPaise(t), gst: fromPaise(g), gross: fromPaise(t + g) };
  }
  if (total !== null && Number.isFinite(total)) {
    const g = toPaise(total) - t;
    if (g < 0) return { ok: false, error: 'The invoice total is smaller than the taxable value. Please recheck the amounts.' };
    return { ok: true, taxable: fromPaise(t), gst: fromPaise(g), gross: fromPaise(t + g) };
  }
  return { ok: false, error: 'Enter the GST amount (0 if none).' };
}
