// The shape of what the reading service returns. The reading itself happens on the backend (/po-extract);
// the result is only ever a SUGGESTION that a person confirms on the "Add documents" screen.
export type Confidence = 'high' | 'medium' | 'low';

export interface Extracted {
  document_type: 'purchase_order' | 'proforma_invoice' | 'tax_invoice' | 'payment_advice' | 'other';
  document_type_confidence: Confidence;
  client_name: string | null;
  client_gstin: string | null;
  site_or_project: string | null;
  document_number: string | null;
  document_date: string | null;
  po_reference: string | null;
  pi_reference: string | null;
  scope_description: string | null;
  taxable_value: number | null;
  gst_type: 'igst' | 'cgst_sgst' | 'none' | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  total_amount: number | null;
  payment_amount: number | null;
  payment_date: string | null;
  payment_mode: 'bank_transfer' | 'cheque' | 'cash' | 'other' | null;
  utr_or_reference: string | null;
  tds_deducted: number | null;
  invoice_numbers_paid: string[];
  overall_confidence: Confidence;
  notes: string[];
}
