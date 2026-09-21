'use server';

import { createClient } from '@/lib/supabase/server';
import { computeProjectFinancials } from '@/domain/financials';
import type {
  AllocationValueRow,
  InvoiceValueRow,
  PoValueRow,
  ProjectFinancials,
  RetentionValueRow,
} from '@/domain/financials';
import { DataFetchError } from '@/domain/errors';

export type { ProjectFinancials };

export async function calculateProjectFinancials(projectId: string): Promise<ProjectFinancials> {
  const supabase = await createClient();

  // 1. Fetch all POs (Original + Amendments) for the project
  const { data: posData, error: posError } = await supabase
    .from('contracts_and_pos')
    .select('total_po_value')
    .eq('project_id', projectId);

  if (posError) throw new DataFetchError('purchase orders', posError);
  const pos = (posData ?? []) as PoValueRow[];

  // 2. Fetch all Invoices
  const { data: invoicesData, error: invoiceError } = await supabase
    .from('tax_invoices')
    .select('invoice_id, document_type, gross_total')
    .eq('project_id', projectId);

  if (invoiceError) throw new DataFetchError('invoices', invoiceError);
  const invoices = (invoicesData ?? []) as InvoiceValueRow[];

  const invoiceIds = invoices.map((i) => i.invoice_id);

  let allocations: AllocationValueRow[] = [];
  let retentions: RetentionValueRow[] = [];

  if (invoiceIds.length > 0) {
    const { data: allocData, error: allocError } = await supabase
      .from('payment_allocations')
      .select('gross_settlement_applied')
      .in('invoice_id', invoiceIds);
    if (allocError) throw new DataFetchError('payment allocations', allocError);
    allocations = (allocData ?? []) as AllocationValueRow[];

    const { data: retData, error: retError } = await supabase
      .from('retention_ledger')
      .select('withheld_amount, status')
      .eq('project_id', projectId);
    if (retError) throw new DataFetchError('retention ledger', retError);
    retentions = (retData ?? []) as RetentionValueRow[];
  }

  return computeProjectFinancials(pos, invoices, allocations, retentions);
}
