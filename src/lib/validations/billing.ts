import { z } from 'zod';

export const paymentModeSchema = z.enum(['RTGS_NEFT', 'CHEQUE', 'CASH', 'UPI']);

export const paymentAllocationSchema = z.object({
  invoice_id: z.string().uuid(),
  allocated_bank_amount: z.number().min(0),
  tds_194c_deducted: z.number().min(0).default(0),
  gst_tds_deducted: z.number().min(0).default(0),
  retention_deducted: z.number().min(0).default(0),
  other_debit_adjustments: z.number().min(0).default(0),
  gross_settlement_applied: z.number().min(0),
}).refine(
  (data) => {
    const sum =
      data.allocated_bank_amount +
      data.tds_194c_deducted +
      data.gst_tds_deducted +
      data.retention_deducted +
      data.other_debit_adjustments;
    return Math.abs(data.gross_settlement_applied - sum) < 0.01;
  },
  {
    message:
      'gross_settlement_applied must equal the sum of allocated bank amount, TDS, GST-TDS, retention, and other debit adjustments.',
    path: ['gross_settlement_applied'],
  }
);

// NOTE: payment_mode has NO .default() here so the inferred type stays
// "RTGS_NEFT" | "CHEQUE" | "CASH" | "UPI" (not | undefined).
// The component provides the default value via useForm's defaultValues.
export const recordBankPaymentPayloadSchema = z.object({
  client_id: z.string().uuid(),
  payment_mode: paymentModeSchema,
  reference_number: z.string().min(1, 'Reference number is required'),
  instrument_date: z.string().optional(),
  clearance_date: z.string().optional(),
  amount_received: z.number().positive('Amount received must be positive'),
  deposit_account: z.string().optional(),
  allocations: z
    .array(paymentAllocationSchema)
    .min(1, 'At least one allocation is required'),
}).refine(
  (data) => {
    const totalAllocatedBank = data.allocations.reduce(
      (sum, alloc) => sum + alloc.allocated_bank_amount,
      0
    );
    return totalAllocatedBank <= data.amount_received + 0.01;
  },
  {
    message:
      'Total allocated bank amount across all invoices cannot exceed the actual amount received.',
    path: ['allocations'],
  }
);

export type PaymentAllocationInput = z.infer<typeof paymentAllocationSchema>;
export type RecordBankPaymentPayload = z.infer<typeof recordBankPaymentPayloadSchema>;
