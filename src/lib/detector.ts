import { supabase } from '@/lib/supabase';
import type { UploadDocType } from '@/lib/documents';

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
  confidence: 'high' | 'medium' | 'low';
  existingRecord: {
    id: string;
    table: 'proforma_invoice' | 'purchase_order' | 'tax_invoice';
    number: string;
    date: string;
    amount: number;
    document_id: string | null;
  } | null;
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
 * identifies type, client/site, document number, date, amount,
 * and checks Supabase for existing revisions.
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
  let docType: UploadDocType = 'other' as unknown as UploadDocType;
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
  } else if (/\b(?:challan|delivery|handover)\b/i.test(cleanName)) {
    docType = 'other' as unknown as UploadDocType;
    docTypeName = 'Delivery Challan / Handover';
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
    if (dateMatch[1] && dateMatch[1].includes('-')) {
      date = dateMatch[1].replace(/_/g, '-');
    } else if (dateMatch[2] && dateMatch[3]) {
      // DD-MM-YYYY -> YYYY-MM-DD
      date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }
  }
  if (!date) {
    date = new Date().toISOString().split('T')[0];
  }

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

  // 7. Check Supabase for existing record / revision
  let existingRecord: DetectedDocument['existingRecord'] = null;

  if (docNumber) {
    if (docType === 'pi') {
      const { data } = await supabase
        .from('proforma_invoice')
        .select('pi_id, pi_number, pi_date, amount, document_id')
        .eq('pi_number', docNumber)
        .maybeSingle();
      if (data) {
        existingRecord = {
          id: data.pi_id,
          table: 'proforma_invoice',
          number: data.pi_number,
          date: data.pi_date,
          amount: Number(data.amount),
          document_id: data.document_id,
        };
      }
    } else if (docType === 'po') {
      const { data } = await supabase
        .from('purchase_order')
        .select('po_id, po_number, po_date, total_value_with_gst, document_id')
        .eq('po_number', docNumber)
        .maybeSingle();
      if (data) {
        existingRecord = {
          id: data.po_id,
          table: 'purchase_order',
          number: data.po_number,
          date: data.po_date,
          amount: Number(data.total_value_with_gst),
          document_id: data.document_id,
        };
      }
    } else if (docType === 'invoice') {
      const { data } = await supabase
        .from('tax_invoice')
        .select('invoice_id, invoice_number, invoice_date, gross_invoice_value, document_id')
        .eq('invoice_number', docNumber)
        .maybeSingle();
      if (data) {
        existingRecord = {
          id: data.invoice_id,
          table: 'tax_invoice',
          number: data.invoice_number,
          date: data.invoice_date,
          amount: Number(data.gross_invoice_value),
          document_id: data.document_id,
        };
      }
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
    confidence,
    existingRecord,
  };
}
