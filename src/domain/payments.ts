import { InvariantViolationError } from './errors';

/**
 * Guard for a bank payment payload, run after Zod validation and before the
 * `record_bank_payment_transaction` RPC. Zod checks each allocation's shape
 * and that total allocated bank amount doesn't exceed the amount received,
 * but it doesn't check for a duplicate invoice_id across allocations - the
 * RPC has no such check either (each allocation is a separate INSERT), so a
 * duplicate would silently double-settle one invoice. This is the "last
 * line of defense" guard for that case: it should never trigger from the UI,
 * so it fails fast rather than letting corrupted data reach the database.
 */
export function guardUniqueAllocationInvoices(
  allocations: ReadonlyArray<{ invoice_id: string }>
): void {
  const seen = new Set<string>();
  for (const alloc of allocations) {
    if (seen.has(alloc.invoice_id)) {
      throw new InvariantViolationError(
        `Invoice ${alloc.invoice_id} appears more than once in the same payment's allocations`
      );
    }
    seen.add(alloc.invoice_id);
  }
}
