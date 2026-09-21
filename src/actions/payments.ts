'use server';

import { createClient } from '@/lib/supabase/server';
import {
  recordBankPaymentPayloadSchema,
  RecordBankPaymentPayload,
} from '@/lib/validations/billing';
import { guardUniqueAllocationInvoices } from '@/domain/payments';
import { DomainError } from '@/domain/errors';

export interface PaymentActionResponse {
  success: boolean;
  receiptId?: string;
  error?: string;
}

/**
 * Records a bank payment and processes all its allocations in a single database transaction.
 * Uses the `record_bank_payment_transaction` Postgres RPC to guarantee ACID compliance.
 */
export async function recordBankPaymentWithAllocations(
  payload: RecordBankPaymentPayload
): Promise<PaymentActionResponse> {
  // 1. Validate with Zod
  const validation = recordBankPaymentPayloadSchema.safeParse(payload);

  if (!validation.success) {
    const messages = validation.error.flatten().fieldErrors;
    return {
      success: false,
      error: `Validation failed: ${JSON.stringify(messages)}`,
    };
  }

  const data = validation.data;

  // 2. Guard against a duplicate invoice_id across allocations - Zod can't
  // catch this (it validates each allocation independently) and the RPC
  // would silently double-settle the invoice if it slipped through.
  try {
    guardUniqueAllocationInvoices(data.allocations);
  } catch (err) {
    if (err instanceof DomainError) {
      return { success: false, error: err.message };
    }
    throw err;
  }

  const supabase = await createClient();

  // 3. Execute the Postgres RPC (ACID transaction in PL/pgSQL)
  // `supabase.rpc` is typed as generic; we cast args to `any` to bypass
  // the stub type until `supabase gen types` is run against the live DB.
  const { data: receiptId, error } = await (supabase as any).rpc(
    'record_bank_payment_transaction',
    {
      p_client_id: data.client_id,
      p_payment_mode: data.payment_mode,
      p_reference_number: data.reference_number,
      p_instrument_date:
        data.instrument_date ?? new Date().toISOString().split('T')[0],
      p_clearance_date:
        data.clearance_date ?? new Date().toISOString().split('T')[0],
      p_amount_received: data.amount_received,
      p_deposit_account: data.deposit_account ?? null,
      p_allocations: JSON.stringify(data.allocations),
    }
  );

  if (error) {
    console.error('Payment Transaction Error:', error);
    return {
      success: false,
      error: `Database transaction failed: ${error.message}`,
    };
  }

  return {
    success: true,
    receiptId: receiptId as string,
  };
}
