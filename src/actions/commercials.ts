'use server';

import { createClient } from '@/lib/supabase/server';

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

export async function calculateProjectFinancials(projectId: string): Promise<ProjectFinancials> {
  const supabase = await createClient();

  // 1. Fetch all POs (Original + Amendments) for the project
  const { data: posData, error: posError } = await supabase
    .from('contracts_and_pos')
    .select('total_po_value')
    .eq('project_id', projectId);

  if (posError) throw new Error(`Failed to fetch POs: ${posError.message}`);
  const pos: Array<{ total_po_value: number }> = (posData ?? []) as any;

  // 2. Fetch all Invoices
  const { data: invoicesData, error: invoiceError } = await supabase
    .from('tax_invoices')
    .select('invoice_id, document_type, gross_total')
    .eq('project_id', projectId);

  if (invoiceError) throw new Error(`Failed to fetch invoices: ${invoiceError.message}`);
  const invoices: Array<{ invoice_id: string; document_type: string; gross_total: number }> =
    (invoicesData ?? []) as any;

  const invoiceIds = invoices.map((i) => i.invoice_id);

  let allocations: Array<{ gross_settlement_applied: number }> = [];
  let retentions: Array<{ withheld_amount: number; status: string }> = [];

  if (invoiceIds.length > 0) {
    const { data: allocData, error: allocError } = await supabase
      .from('payment_allocations')
      .select('gross_settlement_applied')
      .in('invoice_id', invoiceIds);
    if (allocError) throw new Error(`Failed to fetch allocations: ${allocError.message}`);
    allocations = (allocData ?? []) as any;

    const { data: retData, error: retError } = await supabase
      .from('retention_ledger')
      .select('withheld_amount, status')
      .eq('project_id', projectId);
    if (retError) throw new Error(`Failed to fetch retentions: ${retError.message}`);
    retentions = (retData ?? []) as any;
  }

  // ── Five-Tier Financial Mathematics ─────────────────────────────

  // Tier 1: Contract Value = Original PO + Approved Variations/Amendments
  const totalContractValue = pos.reduce((sum, po) => sum + Number(po.total_po_value), 0);

  // Tier 2: Invoiced Value = Tax Invoices − Credit Notes + Debit Notes
  let netInvoicedValue = 0;
  for (const inv of invoices) {
    const val = Number(inv.gross_total);
    if (inv.document_type === 'INVOICE' || inv.document_type === 'DEBIT_NOTE') {
      netInvoicedValue += val;
    } else if (inv.document_type === 'CREDIT_NOTE') {
      netInvoicedValue -= val;
    }
  }

  // Tier 3: Settlement Value (gross_settlement_applied covers Bank + TDS + GST-TDS + Retention + Adjustments)
  const totalSettled = allocations.reduce(
    (sum, alloc) => sum + Number(alloc.gross_settlement_applied),
    0
  );

  // Tier 5: Operational Outstanding = Invoiced − Settled
  const operationalOutstanding = netInvoicedValue - totalSettled;

  // Retention Balance (withheld but not released)
  const retentionBalance = retentions
    .filter((r) => r.status !== 'RELEASED')
    .reduce((sum, r) => sum + Number(r.withheld_amount), 0);

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
