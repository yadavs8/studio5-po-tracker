'use client';

import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, WalletCards, Building2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import {
  recordBankPaymentPayloadSchema,
  RecordBankPaymentPayload,
} from '@/lib/validations/billing';
import { cn } from '@/lib/utils';

// ── Key Fix: useForm uses the INPUT type (fields with .default() are optional)
// while the onSubmit prop accepts the OUTPUT type (all defaults resolved).
type PaymentFormValues = z.input<typeof recordBankPaymentPayloadSchema>;

export interface OutstandingInvoice {
  invoice_id: string;
  invoice_number: string;
  project_name: string;
  net_receivable: number;
  taxable_amount: number;
  retention_pct: number;
}

interface PaymentAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: { client_id: string; name: string }[];
  outstandingInvoices: OutstandingInvoice[];
  onSubmit: (data: RecordBankPaymentPayload) => Promise<void>;
}

const TODAY = new Date().toISOString().split('T')[0];

const DEFAULT_VALUES: PaymentFormValues = {
  client_id: '',
  payment_mode: 'RTGS_NEFT',
  reference_number: '',
  instrument_date: TODAY,
  clearance_date: TODAY,
  amount_received: 0,
  deposit_account: 'HDFC Bank – 0001',
  allocations: [],
};

const NUMERIC_ALLOC_FIELDS = [
  'allocated_bank_amount',
  'tds_194c_deducted',
  'gst_tds_deducted',
  'retention_deducted',
  'other_debit_adjustments',
] as const;

export function PaymentAllocationModal({
  isOpen,
  onClose,
  clients,
  outstandingInvoices,
  onSubmit,
}: PaymentAllocationModalProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>('');

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    // zodResolver infers from the schema's output type; we cast to avoid the
    // input/output mismatch — RHF only uses it for validation, not type checks.
    resolver: zodResolver(recordBankPaymentPayloadSchema) as any,
    defaultValues: DEFAULT_VALUES,
  });

  const { append, remove } = useFieldArray({ control, name: 'allocations' });

  const watchPaymentMode = watch('payment_mode') ?? 'RTGS_NEFT';
  const watchAmountReceived = Number(watch('amount_received')) || 0;
  const watchAllocations = watch('allocations') ?? [];

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      reset(DEFAULT_VALUES);
      setSelectedClientId('');
    }
  }, [isOpen, reset]);

  // shadcn/base-ui Select passes (value: string | null) — guard for null
  const handleClientChange = (clientId: string | null) => {
    if (!clientId) return;
    setSelectedClientId(clientId);
    setValue('client_id', clientId, { shouldValidate: true });
    setValue('allocations', []);
  };

  const handlePaymentModeChange = (val: string | null) => {
    if (!val) return;
    setValue('payment_mode', val as PaymentFormValues['payment_mode']);
  };

  // Toggle invoice in/out of allocations
  const handleInvoiceToggle = (invoice: OutstandingInvoice, checked: boolean) => {
    if (checked) {
      const tds = Number((invoice.taxable_amount * 0.02).toFixed(2));
      const retention = Number(
        (invoice.taxable_amount * (invoice.retention_pct / 100)).toFixed(2)
      );
      const currentBankAllocated = watchAllocations.reduce(
        (sum, a) => sum + (Number(a.allocated_bank_amount) || 0),
        0
      );
      const remainingBank = Math.max(0, watchAmountReceived - currentBankAllocated);
      const idealBankAmt = Math.max(0, invoice.net_receivable - tds - retention);
      const bankAmt = Number(Math.min(idealBankAmt, remainingBank).toFixed(2));

      append({
        invoice_id: invoice.invoice_id,
        allocated_bank_amount: bankAmt,
        tds_194c_deducted: tds,
        gst_tds_deducted: 0,
        retention_deducted: retention,
        other_debit_adjustments: 0,
        gross_settlement_applied: Number((bankAmt + tds + retention).toFixed(2)),
      });
    } else {
      const idx = watchAllocations.findIndex((a) => a.invoice_id === invoice.invoice_id);
      if (idx !== -1) remove(idx);
    }
  };

  // Live gross calculation
  const calcGross = (index: number): number => {
    const a = watchAllocations[index];
    if (!a) return 0;
    return Number(
      NUMERIC_ALLOC_FIELDS.reduce((sum, f) => sum + (Number(a[f]) || 0), 0).toFixed(2)
    );
  };

  // Sync gross_settlement_applied whenever any sibling field changes
  useEffect(() => {
    watchAllocations.forEach((_, i) => {
      const g = calcGross(i);
      if (watchAllocations[i]?.gross_settlement_applied !== g) {
        setValue(`allocations.${i}.gross_settlement_applied`, g);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchAllocations)]);

  // Tracker bar
  const totalBankAllocated = watchAllocations.reduce(
    (sum, a) => sum + (Number(a.allocated_bank_amount) || 0),
    0
  );
  const unallocatedBalance = Math.max(0, watchAmountReceived - totalBankAllocated);
  const isOverAllocated = totalBankAllocated > watchAmountReceived + 0.01;
  const isSubmitDisabled =
    isSubmitting ||
    isOverAllocated ||
    watchAllocations.length === 0 ||
    watchAmountReceived <= 0 ||
    !selectedClientId;

  const fmt = (n: number) =>
    '₹' +
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // handleSubmit gives us PaymentFormValues; cast to output type for the parent
  const onFormSubmit = async (data: PaymentFormValues) => {
    await onSubmit(data as unknown as RecordBankPaymentPayload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden bg-slate-50 border-slate-200">
        <DialogHeader className="p-4 bg-white border-b border-slate-200">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <WalletCards className="w-5 h-5 text-emerald-600" />
            Payment Entry &amp; Allocation
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col h-full max-h-[85vh]">
          <ScrollArea className="flex-grow p-4">

            {/* ── Receipt Details ──────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4 p-4 mb-6 bg-white border rounded-md border-slate-200 shadow-sm">
              {/* Payment Mode */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Payment Mode
                </Label>
                <Select value={watchPaymentMode} onValueChange={handlePaymentModeChange}>
                  <SelectTrigger className="font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RTGS_NEFT">RTGS / NEFT</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* UTR / Cheque Number */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {watchPaymentMode === 'CHEQUE' ? 'Cheque Number' : 'Bank UTR Number'}
                </Label>
                <Input
                  {...register('reference_number')}
                  placeholder="Enter reference…"
                  className="font-mono text-sm"
                />
                {errors.reference_number && (
                  <p className="text-xs text-red-500">{errors.reference_number.message}</p>
                )}
              </div>

              {/* Bank Amount */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Bank Amount (₹)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('amount_received', { valueAsNumber: true })}
                  className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-200"
                />
                {errors.amount_received && (
                  <p className="text-xs text-red-500">{errors.amount_received.message}</p>
                )}
              </div>

              {/* Status (derived) */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </Label>
                <div className="flex h-10 items-center px-3 text-sm font-medium border rounded-md bg-slate-100 text-slate-700">
                  {watchPaymentMode === 'CHEQUE' ? 'PENDING_CLEARANCE' : 'CLEARED'}
                </div>
              </div>

              {/* Instrument Date */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Instrument Date
                </Label>
                <Input type="date" {...register('instrument_date')} />
              </div>

              {/* Clearance Date */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Clearance Date
                </Label>
                <Input type="date" {...register('clearance_date')} />
              </div>
            </div>

            {/* ── Client Selection ──────────────────────────────── */}
            <div className="mb-4">
              <Label className="text-sm font-bold text-slate-700 mb-2 block">
                Select Client
              </Label>
              <Select onValueChange={handleClientChange} value={selectedClientId || undefined}>
                <SelectTrigger className="w-1/2 bg-white">
                  <SelectValue placeholder="— Select Client to view outstanding invoices —" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.client_id} value={c.client_id}>
                      <span className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Invoice Allocation Table ──────────────────────── */}
            {selectedClientId && outstandingInvoices.length > 0 && (
              <div className="bg-white border rounded-md border-slate-200 shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-100">
                    <TableRow>
                      <TableHead className="w-10 text-center">✓</TableHead>
                      <TableHead className="w-52 text-xs uppercase tracking-wider">
                        Invoice / Project
                      </TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider">Bank Amt</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider">TDS 2%</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider">GST-TDS</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider">Retention</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider">Other Ded.</TableHead>
                      <TableHead className="text-right text-xs uppercase tracking-wider font-bold text-slate-800 w-32">
                        Gross Set.
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstandingInvoices.map((invoice) => {
                      const allocIndex = watchAllocations.findIndex(
                        (a) => a.invoice_id === invoice.invoice_id
                      );
                      const isSelected = allocIndex !== -1;

                      return (
                        <TableRow
                          key={invoice.invoice_id}
                          className={isSelected ? 'bg-blue-50/40' : ''}
                        >
                          <TableCell className="text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleInvoiceToggle(invoice, checked === true)
                              }
                            />
                          </TableCell>

                          <TableCell>
                            <p className="font-semibold text-sm text-slate-800">
                              {invoice.invoice_number}
                            </p>
                            <p
                              className="text-xs text-slate-400 truncate w-44"
                              title={invoice.project_name}
                            >
                              {invoice.project_name}
                            </p>
                            <p className="text-[11px] font-mono mt-0.5 text-slate-400">
                              Bal: ₹{invoice.net_receivable.toLocaleString('en-IN')}
                            </p>
                          </TableCell>

                          {isSelected ? (
                            <>
                              {NUMERIC_ALLOC_FIELDS.map((field) => (
                                <TableCell key={field} className="p-1">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 text-right font-mono text-sm"
                                    {...register(
                                      `allocations.${allocIndex}.${field}` as any,
                                      { valueAsNumber: true }
                                    )}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="p-2 text-right font-mono font-bold text-slate-800 bg-slate-50 border-l border-slate-200">
                                {fmt(
                                  Number(
                                    watch(`allocations.${allocIndex}.gross_settlement_applied`)
                                  ) || 0
                                )}
                              </TableCell>
                            </>
                          ) : (
                            <TableCell
                              colSpan={6}
                              className="text-center text-slate-400 text-xs italic"
                            >
                              Select to allocate payment
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {errors.allocations && (
              <p className="text-sm text-red-500 mt-2 font-medium">
                {(errors.allocations as any).message}
              </p>
            )}
          </ScrollArea>

          {/* ── Balance Tracker Banner ───────────────────────────── */}
          <div className="bg-slate-800 text-white p-4 border-t border-slate-700 shrink-0">
            <div className="flex justify-between items-center">
              <div className="flex gap-8">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Bank Received</p>
                  <p className="font-mono text-xl font-semibold text-emerald-400">
                    {fmt(watchAmountReceived)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Bank Allocated</p>
                  <p className="font-mono text-xl font-semibold text-blue-400">
                    {fmt(totalBankAllocated)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Unallocated</p>
                  <p
                    className={cn(
                      'font-mono text-xl font-semibold',
                      isOverAllocated ? 'text-red-400' : 'text-slate-200'
                    )}
                  >
                    {fmt(unallocatedBalance)}
                  </p>
                </div>
                <div className="border-l border-slate-600 pl-8 ml-4">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                    Invoices Settled
                  </p>
                  <p className="font-mono text-xl font-semibold text-white">
                    {watchAllocations.length}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isOverAllocated && (
                  <p className="text-red-400 text-xs font-semibold">
                    ⚠ Allocated exceeds received amount
                  </p>
                )}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={onClose}
                  className="text-slate-300 hover:text-white hover:bg-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitDisabled}
                  className={cn(
                    'gap-2',
                    isSubmitDisabled
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                  )}
                >
                  <Check className="w-4 h-4" />
                  {isSubmitting ? 'Recording…' : 'Record Payment'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
