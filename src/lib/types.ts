export type ClientStatus = 'active' | 'inactive';
export type SiteStatus = 'draft' | 'active' | 'on_hold' | 'completed' | 'closed';
export type SubProjectStatus = 'active' | 'completed' | 'on_hold';
export type PoStatus = 'draft' | 'active' | 'completed';
export type PiStatus = 'draft' | 'sent' | 'revision_requested' | 'approved' | 'converted_to_invoice';
export type GstType = 'igst' | 'cgst_sgst';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_settled' | 'fully_settled' | 'disputed' | 'cancelled';
export type PaymentMode = 'bank_transfer' | 'cash' | 'cheque' | 'other';
export type PaymentType = 'advance' | 'invoice_settlement' | 'retention_release' | 'other';
export type DeductionType = 'tds' | 'gst_tds' | 'retention' | 'handover_hold' | 'penalty' | 'discount' | 'other';
export type DeductionStatus = 'pending' | 'released' | 'written_off';

export interface Client {
  client_id: string;
  legal_name: string;
  display_name: string;
  gstin: string | null;
  pan: string | null;
  billing_address: string | null;
  state: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  default_tds_pct: number | null;
  default_retention_pct: number | null;
  status: ClientStatus;
  created_at: string;
}

export interface Site {
  site_id: string;
  client_id: string;
  site_name: string;
  site_address: string | null;
  has_sub_projects: boolean;
  status: SiteStatus;
  created_at: string;
}

export interface SubProject {
  sub_project_id: string;
  site_id: string;
  name: string;
  scope_description: string | null;
  status: SubProjectStatus;
  created_at: string;
}

export interface PurchaseOrder {
  po_id: string;
  site_id: string;
  sub_project_id: string | null;
  po_number: string;
  po_date: string;
  scope_description: string | null;
  taxable_value: number | null;
  gst_amount: number | null;
  total_value_with_gst: number;
  advance_pct: number | null;
  retention_pct: number | null;
  status: PoStatus;
  created_at: string;
}

export interface ProformaInvoice {
  pi_id: string;
  site_id: string;
  sub_project_id: string | null;
  po_id: string | null;
  pi_number: string;
  pi_date: string;
  amount: number;
  submitted_date: string | null;
  remarks: string | null;
  status: PiStatus;
  converted_invoice_id: string | null;
  created_at: string;
}

export interface TaxInvoice {
  invoice_id: string;
  site_id: string;
  sub_project_id: string | null;
  po_id: string | null;
  pi_id: string | null;
  invoice_number: string;
  invoice_date: string;
  taxable_value: number;
  gst_type: GstType | null;
  gst_amount: number | null;
  gst_rate_pct: number | null;
  gross_invoice_value: number;
  due_date: string | null;
  status: InvoiceStatus;
  created_at: string;
}

export interface Payment {
  payment_id: string;
  site_id: string;
  payment_date: string;
  amount_received: number;
  payment_mode: PaymentMode;
  payment_type: PaymentType;
  utr_or_reference: string | null;
  remarks: string | null;
  created_at: string;
}

export interface PaymentAllocation {
  allocation_id: string;
  payment_id: string;
  invoice_id: string | null;
  sub_project_id: string | null;
  amount_allocated: number;
  allocation_date: string;
}

export interface Deduction {
  deduction_id: string;
  invoice_id: string;
  deduction_type: DeductionType;
  category_note: string | null;
  amount: number;
  deduction_date: string;
  status: DeductionStatus;
}

export interface SiteDashboardRow {
  site_id: string;
  site_name: string;
  client_name: string;
  current_contract_value: number;
  total_invoiced: number;
  total_collected: number;
  normal_outstanding: number;
  retention_outstanding: number;
  advance_balance: number;
  billing_progress_pct: number | null;
}

export interface InvoiceSettlementRow {
  invoice_id: string;
  site_id: string;
  sub_project_id: string | null;
  invoice_number: string;
  gross_invoice_value: number;
  total_payments_allocated: number;
  total_deducted: number;
  total_settled: number;
  remaining_balance: number;
  computed_status: string;
}
