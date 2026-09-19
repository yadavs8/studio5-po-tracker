// ─────────────────────────────────────────────────────────────────
//  Mock data — Studio 5 Interiors Portal
//  Used as a fallback when Supabase is unavailable (local preview).
// ─────────────────────────────────────────────────────────────────

export interface KpiSummary {
  totalContractValue: number;
  netInvoicedValue: number;
  totalCollected: number;
  operationalReceivables: number;
  retentionUnderDLP: number;
  mobilizationAdvanceBalance: number;
}

export interface ProjectRow {
  projectId: string;
  siteName: string;
  siteState: string;
  contractCeiling: number;
  billed: number;
  bankCollected: number;
  deductionsTdsRetention: number;
  operationalAR: number;
  physicalCompletionPct: number;
  billingCompletionPct: number;
  status: 'ACTIVE' | 'COMPLETED' | 'DLP';
}

export interface ClientGroup {
  clientId: string;
  clientName: string;
  projects: ProjectRow[];
}

export type AgeingBucket = 'NOT_DUE' | '1_30' | '31_60' | '61_90' | '90_PLUS';

export interface AgeingRow {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  siteName: string;
  invoiceDate: string;
  dueDate: string;
  netReceivable: number;
  operationalOutstanding: number;
  isRetentionOnly: boolean;           // true → exclude from overdue
  retentionExpectedReleaseDate: string | null;
  bucket: AgeingBucket;
}

// ── KPI ──────────────────────────────────────────────────────────
export const mockKpi: KpiSummary = {
  totalContractValue: 87_450_000,
  netInvoicedValue: 61_215_000,
  totalCollected: 47_830_000,
  operationalReceivables: 10_235_000,
  retentionUnderDLP: 3_150_000,
  mobilizationAdvanceBalance: 2_650_000,
};

// ── Client → Projects ─────────────────────────────────────────────
export const mockClientGroups: ClientGroup[] = [
  {
    clientId: 'c-lemon',
    clientName: 'Lemon Tree Hotels Ltd.',
    projects: [
      {
        projectId: 'p-lemon-deh', siteName: 'Dehradun', siteState: 'UK',
        contractCeiling: 12_500_000, billed: 9_800_000, bankCollected: 7_200_000,
        deductionsTdsRetention: 980_000, operationalAR: 1_620_000,
        physicalCompletionPct: 95, billingCompletionPct: 78.4, status: 'ACTIVE',
      },
      {
        projectId: 'p-lemon-hos', siteName: 'Hosur Road, Bengaluru', siteState: 'KA',
        contractCeiling: 18_000_000, billed: 11_200_000, bankCollected: 9_500_000,
        deductionsTdsRetention: 1_200_000, operationalAR: 500_000,
        physicalCompletionPct: 70, billingCompletionPct: 62.2, status: 'ACTIVE',
      },
      {
        projectId: 'p-lemon-koc', siteName: 'Kochi', siteState: 'KL',
        contractCeiling: 9_750_000, billed: 9_750_000, bankCollected: 8_920_000,
        deductionsTdsRetention: 975_000, operationalAR: -145_000,
        physicalCompletionPct: 100, billingCompletionPct: 100, status: 'DLP',
      },
      {
        projectId: 'p-lemon-pgn', siteName: 'PGN-1, Gurgaon', siteState: 'HR',
        contractCeiling: 7_200_000, billed: 4_100_000, bankCollected: 3_200_000,
        deductionsTdsRetention: 410_000, operationalAR: 490_000,
        physicalCompletionPct: 55, billingCompletionPct: 56.9, status: 'ACTIVE',
      },
      {
        projectId: 'p-lemon-rfx', siteName: 'Red Fox, Delhi', siteState: 'DL',
        contractCeiling: 6_500_000, billed: 5_850_000, bankCollected: 5_200_000,
        deductionsTdsRetention: 585_000, operationalAR: 65_000,
        physicalCompletionPct: 98, billingCompletionPct: 90, status: 'ACTIVE',
      },
    ],
  },
  {
    clientId: 'c-prestige',
    clientName: 'Prestige Group',
    projects: [
      {
        projectId: 'p-pres-blr', siteName: 'Prestige Tech Cloud, Bengaluru', siteState: 'KA',
        contractCeiling: 22_500_000, billed: 14_315_000, bankCollected: 10_210_000,
        deductionsTdsRetention: 1_500_000, operationalAR: 2_605_000,
        physicalCompletionPct: 65, billingCompletionPct: 63.6, status: 'ACTIVE',
      },
      {
        projectId: 'p-pres-hyd', siteName: 'Prestige Cyber Nexus, Hyderabad', siteState: 'TS',
        contractCeiling: 11_000_000, billed: 7_200_000, bankCollected: 3_600_000,
        deductionsTdsRetention: 720_000, operationalAR: 2_880_000,
        physicalCompletionPct: 45, billingCompletionPct: 65.5, status: 'ACTIVE',
      },
    ],
  },
];

// ── Receivables Ageing ─────────────────────────────────────────────
const today = new Date();
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const daysFromNow = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

export const mockAgeingRows: AgeingRow[] = [
  {
    invoiceId: 'inv-1', invoiceNumber: 'S5/LTH/DEH/2026/039',
    clientName: 'Lemon Tree Hotels Ltd.', siteName: 'Dehradun',
    invoiceDate: daysAgo(5), dueDate: daysFromNow(25),
    netReceivable: 820_000, operationalOutstanding: 820_000,
    isRetentionOnly: false, retentionExpectedReleaseDate: null,
    bucket: 'NOT_DUE',
  },
  {
    invoiceId: 'inv-2', invoiceNumber: 'S5/LTH/HOS/2026/017',
    clientName: 'Lemon Tree Hotels Ltd.', siteName: 'Hosur Road, Bengaluru',
    invoiceDate: daysAgo(22), dueDate: daysAgo(8),
    netReceivable: 500_000, operationalOutstanding: 500_000,
    isRetentionOnly: false, retentionExpectedReleaseDate: null,
    bucket: '1_30',
  },
  {
    invoiceId: 'inv-3', invoiceNumber: 'S5/LTH/PGN/2026/011',
    clientName: 'Lemon Tree Hotels Ltd.', siteName: 'PGN-1, Gurgaon',
    invoiceDate: daysAgo(68), dueDate: daysAgo(38),
    netReceivable: 490_000, operationalOutstanding: 490_000,
    isRetentionOnly: false, retentionExpectedReleaseDate: null,
    bucket: '31_60',
  },
  {
    invoiceId: 'inv-4', invoiceNumber: 'S5/LTH/RFX/2026/009',
    clientName: 'Lemon Tree Hotels Ltd.', siteName: 'Red Fox, Delhi',
    invoiceDate: daysAgo(90), dueDate: daysAgo(65),
    netReceivable: 65_000, operationalOutstanding: 65_000,
    isRetentionOnly: false, retentionExpectedReleaseDate: null,
    bucket: '61_90',
  },
  {
    invoiceId: 'inv-5', invoiceNumber: 'S5/PRG/BLR/2026/023',
    clientName: 'Prestige Group', siteName: 'Prestige Tech Cloud, Bengaluru',
    invoiceDate: daysAgo(130), dueDate: daysAgo(100),
    netReceivable: 2_605_000, operationalOutstanding: 2_605_000,
    isRetentionOnly: false, retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
  {
    invoiceId: 'inv-6', invoiceNumber: 'S5/LTH/KOC/RETENTION/001',
    clientName: 'Lemon Tree Hotels Ltd.', siteName: 'Kochi',
    invoiceDate: daysAgo(210), dueDate: daysAgo(180),
    netReceivable: 975_000, operationalOutstanding: 975_000,
    isRetentionOnly: true, retentionExpectedReleaseDate: daysFromNow(90), // Not yet overdue
    bucket: 'NOT_DUE',  // excluded from overdue because release date is future
  },
  {
    invoiceId: 'inv-7', invoiceNumber: 'S5/PRG/HYD/2026/008',
    clientName: 'Prestige Group', siteName: 'Prestige Cyber Nexus, Hyderabad',
    invoiceDate: daysAgo(100), dueDate: daysAgo(70),
    netReceivable: 2_880_000, operationalOutstanding: 2_880_000,
    isRetentionOnly: false, retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
];
