/**
 * scripts/onyx_document_indexer.js
 * Read-only audit report for Studio 5 Interiors.
 * Scans C:\Users\dell\Desktop\Studio5_Organized_Documents, counts client documents by folder
 * and type, and prints how many records Supabase holds. It does not save or link anything.
 * Credentials come from .env.local; never hardcode them here.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Document repository root
const DOCS_ROOT = 'C:\\Users\\dell\\Desktop\\Studio5_Organized_Documents';

function readEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function getSupabaseClient() {
  const env = { ...readEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  return createClient(url, key);
}

const CLIENT_SITE_MAP = {
  'Tarudhan_Valley': 'Tarudhan Valley Resort',
  'Samhi_Hotel': 'Hyatt Place Gurgaon',
  'Lemon_Tree': 'Lemon Tree Hotel',
  'DSS_Buildtech_The_Melia': 'The Melia (DSS Buildtech)',
  'Other_Clients': 'Other Sites'
};

function classifyDocumentType(filePath) {
  const norm = filePath.toLowerCase().replace(/\\/g, '/');
  if (norm.includes('vendor_purchase_invoices')) return 'vendor_purchase_invoice';
  if (norm.includes('proforma') || norm.includes('/pi') || norm.includes('_pi_')) return 'proforma_invoice';
  if (norm.includes('work_order') || norm.includes('/wo') || norm.includes('purchase_order') || norm.includes('/po')) return 'purchase_order';
  if (norm.includes('tax_invoice') || norm.includes('/invoice') || norm.includes('/invoices')) return 'tax_invoice';
  if (norm.includes('challan') || norm.includes('handover')) return 'delivery_challan';
  if (norm.includes('statement') || norm.includes('soa')) return 'statement_of_account';
  return 'general_document';
}

function scanRepository(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_Discarded_Trial_PIs' && !entry.name.startsWith('.')) {
        results = results.concat(scanRepository(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.png', '.jpg', '.jpeg'].includes(ext)) {
        const stats = fs.statSync(fullPath);
        results.push({
          fullPath,
          fileName: entry.name,
          extension: ext.replace('.', ''),
          sizeBytes: stats.size,
          lastModified: stats.mtime.toISOString(),
          docType: classifyDocumentType(fullPath)
        });
      }
    }
  }
  return results;
}

async function indexAndReconcile() {
  console.log('======================================================================');
  console.log('📁 DOCUMENT AUDIT — STUDIO 5');
  console.log('======================================================================');
  console.log(`Scanning document repository: ${DOCS_ROOT}`);

  const localDocs = scanRepository(DOCS_ROOT);
  console.log(`Found ${localDocs.length} documents on local disk across client folders.\n`);

  console.log('Connecting to Supabase to fetch database inventory...');
  try {
    const sb = getSupabaseClient();
    const [posRes, pisRes, invsRes] = await Promise.all([
      sb.from('purchase_order').select('po_id'),
      sb.from('proforma_invoice').select('pi_id'),
      sb.from('tax_invoice').select('invoice_id')
    ]);

    const failed = [posRes, pisRes, invsRes].find((res) => res.error);
    if (failed) throw new Error(failed.error.message);

    const pos = posRes.data || [];
    const pis = pisRes.data || [];
    const invs = invsRes.data || [];

    console.log(`Database Records: ${pos.length} POs, ${pis.length} PIs, ${invs.length} Tax Invoices.\n`);

    console.log('--- Client Folder Summary ---');
    for (const [folder, siteName] of Object.entries(CLIENT_SITE_MAP)) {
      const folderPath = path.join(DOCS_ROOT, folder);
      const docsInFolder = localDocs.filter(d => d.fullPath.startsWith(folderPath));
      console.log(`• ${siteName} (${folder}): ${docsInFolder.length} files`);
    }

    console.log('\n--- Document Type Breakdown ---');
    const typeCounts = {};
    for (const d of localDocs) {
      typeCounts[d.docType] = (typeCounts[d.docType] || 0) + 1;
    }
    for (const [t, count] of Object.entries(typeCounts)) {
      console.log(`  - ${t}: ${count} document(s)`);
    }

    console.log('\n======================================================================');
    console.log('✓ Audit completed. Nothing was saved or linked.');
    console.log('======================================================================');
  } catch (err) {
    console.error('Reconciliation error:', err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  indexAndReconcile().catch(console.error);
}

module.exports = { scanRepository, classifyDocumentType, indexAndReconcile };
