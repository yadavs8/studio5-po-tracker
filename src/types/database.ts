export type PaymentMode = 'RTGS_NEFT' | 'CHEQUE' | 'CASH' | 'UPI';
export type DocumentType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type RetentionStatus = 'WITHHELD' | 'DUE_FOR_RELEASE' | 'RELEASED';

export interface Client {
  client_id: string;
  name: string;
  legal_entity: string;
  pan: string | null;
  gstin: string | null;
  billing_address: string | null;
  default_tds_rate: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  project_id: string;
  client_id: string;
  project_code: string;
  site_name: string;
  site_state_code: string | null;
  project_manager: string | null;
  dlp_months: number;
  handover_date: string | null;
  physical_progress_pct: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ContractAndPO {
  po_id: string;
  project_id: string;
  po_number: string;
  po_date: string;
  is_amendment: boolean;
  parent_po_id: string | null;
  base_taxable_value: number;
  gst_rate: number;
  total_po_value: number;
  advance_pct: number;
  retention_pct: number;
  created_at: string;
  updated_at: string;
}

export interface TaxInvoice {
  invoice_id: string;
  project_id: string;
  po_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  place_of_supply: string | null;
  document_type: DocumentType;
  parent_invoice_id: string | null;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gross_total: number;
  advance_adjusted: number;
  net_receivable: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentReceipt {
  receipt_id: string;
  client_id: string;
  payment_mode: PaymentMode;
  reference_number: string | null;
  instrument_date: string | null;
  clearance_date: string | null;
  amount_received: number;
  deposit_account: string | null;
  unallocated_balance: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  allocation_id: string;
  receipt_id: string;
  invoice_id: string;
  allocated_bank_amount: number;
  tds_194c_deducted: number;
  gst_tds_deducted: number;
  retention_deducted: number;
  other_debit_adjustments: number;
  gross_settlement_applied: number;
  created_at: string;
  updated_at: string;
}

export interface RetentionLedger {
  retention_id: string;
  project_id: string;
  invoice_id: string;
  allocation_id: string;
  withheld_amount: number;
  expected_release_date: string | null;
  actual_released_date: string | null;
  status: RetentionStatus;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  log_id: string;
  entity_name: string;
  entity_id: string;
  action: string;
  changed_by: string | null;
  old_values: any;
  new_values: any;
  timestamp: string;
}

export interface Database {
  public: {
    Tables: {
      clients: { Row: Client; Insert: Partial<Client>; Update: Partial<Client> };
      projects: { Row: Project; Insert: Partial<Project>; Update: Partial<Project> };
      contracts_and_pos: { Row: ContractAndPO; Insert: Partial<ContractAndPO>; Update: Partial<ContractAndPO> };
      tax_invoices: { Row: TaxInvoice; Insert: Partial<TaxInvoice>; Update: Partial<TaxInvoice> };
      payment_receipts: { Row: PaymentReceipt; Insert: Partial<PaymentReceipt>; Update: Partial<PaymentReceipt> };
      payment_allocations: { Row: PaymentAllocation; Insert: Partial<PaymentAllocation>; Update: Partial<PaymentAllocation> };
      retention_ledger: { Row: RetentionLedger; Insert: Partial<RetentionLedger>; Update: Partial<RetentionLedger> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> };
    };
  };
}
