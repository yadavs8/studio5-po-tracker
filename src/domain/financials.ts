import { InvariantViolationError } from './errors';

/**
 * Pure implementation of the five-tier financial model from PROJECT_RULES.md.
 * No Supabase, no I/O - just arithmetic over already-fetched rows. Keeping it
 * here (separate from the action that fetches the rows) means this, the most
 * important and most fragile logic in the app, can be unit tested without a
 * database and is guarded against corrupted input.
 */
export interface ProjectFinancials {
  totalContractValue: number;
  netInvoicedValue: number;
  totalSettled: number;
  operationalOutstanding: number;
  retentionBalance: number;
  unbilledPOBalance: number;
  billingProgressPct: number;
  collectionProgressPct: number;
}

export interface PoValueRow {
  total_po_value: number;
}

export interface InvoiceValueRow {
  invoice_id: string;
  document_type: string;
  gross_total: number;
}

export interface AllocationValueRow {
  gross_settlement_applied: number;
}

export interface RetentionValueRow {
  withheld_amount: number;
  status: string;
}

export function computeProjectFinancials(
  pos: PoValueRow[],
  invoices: InvoiceValueRow[],
  allocations: AllocationValueRow[],
  retentions: RetentionValueRow[]
): ProjectFinancials {
  // Tier 1: Contract Value = Original PO + Approved Variations/Amendments
  const totalContractValue = sumGuarded(pos, (po) => po.total_po_value, 'total_po_value');

  // Tier 2: Invoiced Value = Tax Invoices − Credit Notes + Debit Notes
  let netInvoicedValue = 0;
  for (const inv of invoices) {
    const val = guardFiniteNumber(inv.gross_total, `gross_total on invoice ${inv.invoice_id}`);
    if (inv.document_type === 'INVOICE' || inv.document_type === 'DEBIT_NOTE') {
      netInvoicedValue += val;
    } else if (inv.document_type === 'CREDIT_NOTE') {
      netInvoicedValue -= val;
    }
  }

  // Tier 3: Settlement Value (gross_settlement_applied covers Bank + TDS + GST-TDS + Retention + Adjustments)
  const totalSettled = sumGuarded(
    allocations,
    (alloc) => alloc.gross_settlement_applied,
    'gross_settlement_applied'
  );

  // Tier 5: Operational Outstanding = Invoiced − Settled
  const operationalOutstanding = netInvoicedValue - totalSettled;

  // Retention Balance (withheld but not released)
  const retentionBalance = sumGuarded(
    retentions.filter((r) => r.status !== 'RELEASED'),
    (r) => r.withheld_amount,
    'withheld_amount'
  );

  // Unbilled PO Balance
  const unbilledPOBalance = Math.max(0, totalContractValue - netInvoicedValue);

  // Progress percentages
  const billingProgressPct =
    totalContractValue > 0 ? (netInvoicedValue / totalContractValue) * 100 : 0;
  const collectionProgressPct =
    netInvoicedValue > 0 ? (totalSettled / netInvoicedValue) * 100 : 0;

  return {
    totalContractValue,
    netInvoicedValue,
    totalSettled,
    operationalOutstanding,
    retentionBalance,
    unbilledPOBalance,
    billingProgressPct,
    collectionProgressPct,
  };
}

function sumGuarded<T>(rows: T[], getValue: (row: T) => unknown, fieldName: string): number {
  return rows.reduce((sum, row) => sum + guardFiniteNumber(getValue(row), fieldName), 0);
}

/**
 * Fails fast when a value crossing into the domain boundary isn't a finite
 * number, instead of letting `Number(x)` silently produce a NaN that would
 * poison every downstream total.
 */
function guardFiniteNumber(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new InvariantViolationError(
      `Expected a finite number for "${fieldName}" but got ${JSON.stringify(value)}`
    );
  }
  return n;
}
