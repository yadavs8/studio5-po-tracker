import { supabase } from '@/lib/supabase';
import type { UploadDocType } from '@/lib/documents';
import type { Extracted } from '@/lib/extractApi';

export interface SiteMeta {
  site_id: string;
  site_name: string;
  client_id: string;
  client_name: string;
}

export interface DetectedDocument {
  docType: UploadDocType;
  docTypeName: string;
  siteId: string | null;
  clientId: string | null;
  siteName: string | null;
  clientName: string | null;
  docNumber: string;
  date: string;
  amount: number | null;
  subjectOrScope: string;
  /** Only known after the AI reading: value before GST and the GST on it (tax invoices). */
  taxable: number | null;
  gst: number | null;
  /** The client's PO / work order number quoted on the document, if the AI read one. */
  poReference: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExistingRecord {
  id: string;
  table: 'proforma_invoice' | 'purchase_order' | 'tax_invoice';
  number: string;
  date: string;
  amount: number;
  taxable: number | null;
  gst: number | null;
  document_id: string | null;
}

/**
 * Extracts readable ASCII/UTF-8 character sequences from raw file bytes.
 */
export async function extractTextPreview(file: File, maxBytes = 120000): Promise<string> {
  try {
    const buffer = await file.slice(0, maxBytes).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let result = '';
    let word = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
        word += String.fromCharCode(b);
      } else {
        if (word.length >= 2) {
          result += word + ' ';
        }
        word = '';
      }
    }
    return result;
  } catch {
    return '';
  }
}

/**
 * Smart document detector: Inspects file name and extracted text,
 * identifies type, client/site, document number, date and amount.
 * A quick guess only; the AI reading (fromExtracted) replaces it when it comes back.
 */
export async function detectDocument(
  file: File,
  knownSites: SiteMeta[]
): Promise<DetectedDocument> {
  const fileName = file.name;
  const fileText = await extractTextPreview(file);
  const combined = `${fileName} ${fileText}`;
  const cleanName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9\-\/]+/g, ' ');

  // 1. Detect Document Type
  let docType: UploadDocType = 'other';
  let docTypeName = 'General Document';

  if (/\b(?:pi|proforma|performa)\b/i.test(cleanName) || /\b(?:proforma\s*invoice)\b/i.test(fileText)) {
    docType = 'pi';
    docTypeName = 'Proforma Invoice (PI)';
  } else if (
    /\b(?:po|wo|purchase\s*order|work\s*order)\b/i.test(cleanName) ||
    /\b(?:purchase\s*order|work\s*order)\b/i.test(fileText)
  ) {
    docType = 'po';
    docTypeName = 'Purchase Order / Work Order';
  } else if (
    /\b(?:tax\s*invoice|invoice|s5i)\b/i.test(cleanName) ||
    /\b(?:tax\s*invoice)\b/i.test(fileText)
  ) {
    docType = 'invoice';
    docTypeName = 'Tax Invoice';
  } else if (
    /\b(?:payment|advice|receipt|neft|rtgs|utr)\b/i.test(cleanName) ||
    /\b(?:payment\s*advice|payment\s*receipt)\b/i.test(fileText)
  ) {
    docType = 'payment_advice';
    docTypeName = 'Payment Advice / Receipt';
  } else if (/\b(?:challan|dc|delivery)\b/i.test(cleanName) || /\bdelivery\s*challan\b/i.test(fileText)) {
    docType = 'challan';
    docTypeName = 'Delivery Challan';
  } else if (/\b(?:tds|16a)\b/i.test(cleanName)) {
    docType = 'tds_certificate';
    docTypeName = 'TDS Certificate';
  }

  // 2. Match Client and Site
  let matchedSite: SiteMeta | null = null;
  let bestScore = 0;

  for (const s of knownSites) {
    let score = 0;
    const sName = s.site_name.toLowerCase();
    const cName = s.client_name.toLowerCase();

    // Check specific keywords
    const keywords = [
      ...sName.split(/[\s,\-]+/).filter((w) => w.length > 3),
      ...cName.split(/[\s,\-]+/).filter((w) => w.length > 3),
    ];

    for (const kw of keywords) {
      if (cleanName.toLowerCase().includes(kw)) score += 5;
      if (fileText.toLowerCase().includes(kw)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      matchedSite = s;
    }
  }

  // 3. Extract Document Number
  let docNumber = '';
  const woMatch = combined.match(/\b(WO-[A-Z0-9\-]+|PO-[A-Z0-9\-]+)\b/i);
  const s5Match = combined.match(/\b(S5\/?(?:PI|I)?[\w\-/]+)\b/i);
  const piNumMatch = combined.match(/\b(?:PI)[_\-\s]?(\d{2}-\d{2}-\d{2,4}|\d{3,5})\b/i);
  const invNumMatch = combined.match(/\b(?:INV|TI)[_\-\s]?([A-Z0-9\-\/]+)\b/i);

  if (woMatch) {
    docNumber = woMatch[1];
  } else if (s5Match) {
    docNumber = s5Match[1];
  } else if (piNumMatch) {
    docNumber = `S5/PI/${piNumMatch[1]}`;
  } else if (invNumMatch) {
    docNumber = invNumMatch[1];
  }

  // 4. Extract Date
  let date = '';
  const dateMatch =
    combined.match(/\b(\d{4}[-_]\d{2}[-_]\d{2})\b/) ||
    combined.match(/\b(\d{2})[-/.](\d{2})[-/.](\d{4})\b/);

  if (dateMatch) {
    if (dateMatch[1] && dateMatch[1].length === 10) {
      date = dateMatch[1].replace(/_/g, '-');
    } else if (dateMatch[2] && dateMatch[3]) {
      // DD-MM-YYYY -> YYYY-MM-DD
      date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';

  // 5. Extract Amount
  let amount: number | null = null;
  const amtMatch = combined.match(/(?:Total|Amount|Value|INR|Rs\.?|₹)[\s:]*([0-9,]+(?:\.[0-9]{2})?)/i);
  if (amtMatch) {
    const rawNum = amtMatch[1].replace(/,/g, '');
    const parsed = parseFloat(rawNum);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // 6. Extract Subject / Scope
  let subjectOrScope = '';
  const scopeMatch = combined.match(/(?:Scope|Subject|Description|Work)[\s:]+([^\r\n.;]+)/i);
  if (scopeMatch) {
    subjectOrScope = scopeMatch[1].trim();
  } else {
    // derive clean summary from filename if possible
    const cleanTokens = cleanName.split(/\s+/).filter((t) => t.length > 2 && !/^(pi|po|wo|tax|invoice|s5)$/i.test(t));
    if (cleanTokens.length > 1) {
      subjectOrScope = cleanTokens.slice(1, 6).join(' ');
    }
  }

  const confidence: 'high' | 'medium' | 'low' =
    matchedSite && docNumber ? 'high' : matchedSite || docNumber ? 'medium' : 'low';

  return {
    docType,
    docTypeName,
    siteId: matchedSite?.site_id ?? null,
    clientId: matchedSite?.client_id ?? null,
    siteName: matchedSite?.site_name ?? null,
    clientName: matchedSite?.client_name ?? null,
    docNumber,
    date,
    amount,
    subjectOrScope,
    taxable: null,
    gst: null,
    poReference: null,
    confidence,
  };
}

/** Looks up a PI / PO / tax invoice with this number on this site, so a new copy can replace the old one. */
export async function findExistingRecord(
  docType: UploadDocType,
  docNumber: string,
  siteId: string
): Promise<ExistingRecord | null> {
  const num = docNumber.trim();
  if (!num || !siteId) return null;
  if (docType === 'pi') {
    const { data } = await supabase
      .from('proforma_invoice')
      .select('pi_id, pi_number, pi_date, amount, document_id')
      .eq('site_id', siteId)
      .eq('pi_number', num)
      .limit(1)
      .maybeSingle();
    return data
      ? { id: data.pi_id, table: 'proforma_invoice', number: data.pi_number, date: data.pi_date, amount: Number(data.amount), taxable: null, gst: null, document_id: data.document_id }
      : null;
  }
  if (docType === 'po') {
    const { data } = await supabase
      .from('purchase_order')
      .select('po_id, po_number, po_date, total_value_with_gst, document_id')
      .eq('site_id', siteId)
      .eq('po_number', num)
      .limit(1)
      .maybeSingle();
    return data
      ? { id: data.po_id, table: 'purchase_order', number: data.po_number, date: data.po_date, amount: Number(data.total_value_with_gst), taxable: null, gst: null, document_id: data.document_id }
      : null;
  }
  if (docType === 'invoice') {
    const { data } = await supabase
      .from('tax_invoice')
      .select('invoice_id, invoice_number, invoice_date, taxable_value, gst_amount, gross_invoice_value, document_id')
      .eq('site_id', siteId)
      .eq('invoice_number', num)
      .maybeSingle();
    return data
      ? {
          id: data.invoice_id,
          table: 'tax_invoice',
          number: data.invoice_number,
          date: data.invoice_date,
          amount: Number(data.gross_invoice_value),
          taxable: data.taxable_value == null ? null : Number(data.taxable_value),
          gst: data.gst_amount == null ? null : Number(data.gst_amount),
          document_id: data.document_id,
        }
      : null;
  }
  return null;
}

const DOC_TYPE_FROM_AI: Record<Extracted['document_type'], { docType: UploadDocType; name: string }> = {
  purchase_order: { docType: 'po', name: 'Purchase Order / Work Order' },
  proforma_invoice: { docType: 'pi', name: 'Proforma Invoice (PI)' },
  tax_invoice: { docType: 'invoice', name: 'Tax Invoice' },
  payment_advice: { docType: 'payment_advice', name: 'Payment Advice / Receipt' },
  other: { docType: 'other', name: 'General Document' },
};

/** Picks the site whose site / client name words best match what the AI read off the document. */
function matchSiteFromRead(ex: Extracted, knownSites: SiteMeta[]): SiteMeta | null {
  const siteText = (ex.site_or_project ?? '').toLowerCase();
  const clientText = (ex.client_name ?? '').toLowerCase();
  if (!siteText && !clientText) return null;
  let best: SiteMeta | null = null;
  let bestScore = 0;
  for (const s of knownSites) {
    let score = 0;
    for (const w of s.site_name.toLowerCase().split(/[\s,\-]+/).filter((w) => w.length > 3)) {
      if (siteText.includes(w)) score += 5;
      else if (clientText.includes(w)) score += 1;
    }
    for (const w of s.client_name.toLowerCase().split(/[\s,\-]+/).filter((w) => w.length > 3)) {
      if (clientText.includes(w)) score += 3;
      else if (siteText.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

/** Turns what the backend read into the same shape the quick file-name guess produces. */
export function fromExtracted(ex: Extracted, knownSites: SiteMeta[]): DetectedDocument {
  const kind = DOC_TYPE_FROM_AI[ex.document_type] ?? DOC_TYPE_FROM_AI.other;
  const site = matchSiteFromRead(ex, knownSites);
  const docNumber = (ex.document_number ?? '').trim();
  const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const date = isDate(ex.document_date) ? ex.document_date! : isDate(ex.payment_date) ? ex.payment_date! : '';
  const amount = ex.total_amount ?? ex.payment_amount ?? null;
  const gstParts = [ex.igst_amount, ex.cgst_amount, ex.sgst_amount].filter((v): v is number => typeof v === 'number');
  const gst = ex.gst_type === 'none' ? 0 : gstParts.length ? gstParts.reduce((a, b) => a + b, 0) : null;
  return {
    docType: kind.docType,
    docTypeName: kind.name,
    siteId: site?.site_id ?? null,
    clientId: site?.client_id ?? null,
    siteName: site?.site_name ?? null,
    clientName: site?.client_name ?? null,
    docNumber,
    date,
    amount,
    subjectOrScope: (ex.scope_description ?? '').trim(),
    taxable: ex.taxable_value ?? null,
    gst,
    poReference: ex.po_reference?.trim() || null,
    confidence: ex.overall_confidence,
  };
}
