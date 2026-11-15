// Proforma invoice status rules shared by every page.
import type { PiStatus } from './types';

/** Plain words for each PI status (account statement, lists). */
export const PI_STATUS_LABEL: Record<PiStatus, string> = {
  draft: 'Draft',
  sent: 'Sent to client',
  revision_requested: 'Client asked for changes',
  approved: 'Approved by client',
  converted_to_invoice: 'Tax invoice raised',
  cancelled: 'Cancelled',
};

/** A PI still waiting for an order or a tax invoice: not converted, not cancelled (migration_017). */
export const isOpenPi = (status: string | null | undefined) => status !== 'converted_to_invoice' && status !== 'cancelled';
