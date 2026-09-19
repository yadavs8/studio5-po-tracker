// ─────────────────────────────────────────────────────────────────────────────
//  Real business data — Studio 5 Interiors Pvt. Ltd.
//  Extracted from source files on 20-Sep-2026:
//
//  Lemon Tree Group Payments.pdf  → Group summary (Apr 25 – Mar 26)
//  Hosur Road.pdf                 → Keys Hotel Lemon Tree Hosur Road ledger
//  Kochi.pdf                      → Keys Hotel Kochi ledger
//  PGN1.pdf                       → Lemon Tree PGN-1 Gurugram ledger
//  Red Fox.pdf                    → Redfox Hotel East Delhi (Mayur Vihar) ledger
//  SOA Dehradun.xls               → Lemon Tree Dehradun SOA
//  DSS BUILDTECH PVT LTD Payment Details.xlsx → 5 towers
//  High Town Payment Details.xlsx → Silverglades / High Town Gurugram
//  Coronet Hotel Services Pvt Ltd 19.09.26.xlsx → Tarudhan Valley
//
//  All figures in INR. Source columns: Opening Balance, Credit, Debit, Closing Balance.
//  "Dr" = Debit (receivable / amount owed to Studio 5)
//  "Cr" = Credit (amount received / advance adjusted)
// ─────────────────────────────────────────────────────────────────────────────

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
  isRetentionOnly: boolean;
  retentionExpectedReleaseDate: string | null;
  bucket: AgeingBucket;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT GROUPS — 100% real figures from your files
// ─────────────────────────────────────────────────────────────────────────────
export const mockClientGroups: ClientGroup[] = [
  {
    // ── Lemon Tree Hotels Group
    // Source: Lemon Tree Group Payments.pdf (Group Summary Apr 25 – Mar 26)
    // Grand Total: Opening ₹69,47,644 Dr | Nett Transactions ₹57,45,780 Cr | Closing ₹12,01,865 Dr
    clientId: 'c-lemon',
    clientName: 'Lemon Tree Hotels Group',
    projects: [
      {
        // Source: SOA Dehradun.xls
        // PO 016: Corridor 4th Floor     ₹10,55,547  | Received ₹1,55,166  | Bal ₹9,00,381
        // PO 017: 49 Rooms              ₹80,57,271  | Received ₹11,84,418 | Bal ₹68,72,853
        // Grand Total PO: ₹91,12,818   | Received: ₹13,39,584             | Bal: ₹77,73,234
        projectId: 'p-lemon-deh',
        siteName: 'Lemon Tree Dehradun (Corridor + 49 Rooms)',
        siteState: 'UK',
        contractCeiling: 9112818,
        billed: 9112818,
        bankCollected: 1339584,
        deductionsTdsRetention: 0,
        operationalAR: 7773234,
        physicalCompletionPct: 30,
        billingCompletionPct: 100,
        status: 'ACTIVE',
      },
      {
        // Source: Hosur Road.pdf
        // Keys Hotel Lemon Tree, Hosur Road (Bengaluru)
        // Opening Balance Apr-25: ₹45,56,989 Dr
        // Total Debits (invoiced Apr25–Mar26): ₹65,27,660
        // Total Credits (received Apr25–Mar26): ₹22,87,401
        // Closing Balance Mar-26: ₹3,16,730 Dr
        // Nett movement from group summary: ₹42,40,259 Cr received against opening
        projectId: 'p-lemon-hos',
        siteName: 'Keys Hotel – Hosur Road, Bengaluru',
        siteState: 'KA',
        contractCeiling: 6527660,   // Total invoiced (debits Apr25–Mar26)
        billed: 6527660,
        bankCollected: 4556989 + 2287401 - 316730, // Opening + credits – closing = total collected ever
        deductionsTdsRetention: 0,
        operationalAR: 316730,      // Closing balance Mar-26
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'DLP',
      },
      {
        // Source: Kochi.pdf
        // Keys Hotel Kochi
        // Opening Balance Apr-25: ₹18,74,543 Dr
        // Total Debits: ₹83,80,534   Total Credits: ₹69,29,793
        // Closing Balance Mar-26: ₹4,23,802 Dr
        projectId: 'p-lemon-koc',
        siteName: 'Keys Hotel – Kochi',
        siteState: 'KL',
        contractCeiling: 8380534,
        billed: 8380534,
        bankCollected: 1874543 + 6929793 - 423802,
        deductionsTdsRetention: 0,
        operationalAR: 423802,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'DLP',
      },
      {
        // Source: PGN1.pdf
        // Lemon Tree Hotels Ltd – PGN-1, Gurugram
        // Opening Balance Apr-25: ₹5,16,112 Dr
        // Total Debits: ₹74,45,592   Total Credits: ₹70,73,605
        // Closing Balance Mar-26: ₹1,44,126 Dr
        projectId: 'p-lemon-pgn',
        siteName: 'Lemon Tree – PGN-1, Gurugram',
        siteState: 'HR',
        contractCeiling: 7445592,
        billed: 7445592,
        bankCollected: 516112 + 7073605 - 144126,
        deductionsTdsRetention: 0,
        operationalAR: 144126,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'DLP',
      },
      {
        // Source: Red Fox.pdf
        // Redfox Hotel East Delhi – Mayur Vihar
        // Opening Balance: ₹0
        // Total Debits: ₹78,84,499   Total Credits: ₹82,01,705 (overpaid / advance-in)
        // Closing Balance Mar-26: ₹3,17,206 Dr
        // Note: Credits > Debits → client paid in advance or advance adjusted
        projectId: 'p-lemon-rfx',
        siteName: 'Red Fox Hotel – Mayur Vihar, East Delhi',
        siteState: 'DL',
        contractCeiling: 7884499,
        billed: 7884499,
        bankCollected: 8201705,     // Credits received (includes advance)
        deductionsTdsRetention: 0,
        operationalAR: 317206,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'DLP',
      },
    ],
  },

  {
    // ── DSS Buildtech Pvt. Ltd. — 5 Towers
    // Source: DSS BUILDTECH PVT LTD Payment Details.xlsx → Sheet3 (master summary)
    // T-B:        Invoice ₹61,74,822 | Paid ₹54,24,282 | Bal ₹7,50,540
    // T-G:        Invoice ₹56,50,576 | Paid ₹54,78,223 | Bal ₹1,72,353
    // T-S1:       Invoice ₹42,71,794 | Paid ₹38,60,727 | Bal ₹4,11,067
    // T-C:        Invoice ₹13,94,760 | Paid ₹12,76,560 | Bal ₹1,18,200
    // Wardrobes:  Invoice ₹35,07,065 | Paid ₹30,17,477 | Bal ₹4,89,588
    // TDS:        Deducted ₹6,060
    // Grand Total Invoice: ₹2,09,99,017 | Total Paid: ₹1,90,63,329 | Bal: ₹19,35,688
    clientId: 'c-dss',
    clientName: 'DSS Buildtech Pvt. Ltd.',
    projects: [
      {
        projectId: 'p-dss-tb',
        siteName: 'Tower B – Modular Kitchen',
        siteState: 'CH',
        contractCeiling: 5638512,
        billed: 6174822,
        bankCollected: 5424282,
        deductionsTdsRetention: 0,
        operationalAR: 750540,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'COMPLETED',
      },
      {
        projectId: 'p-dss-tg',
        siteName: 'Tower G – Modular Kitchen',
        siteState: 'CH',
        contractCeiling: 5184330,
        billed: 5650576,
        bankCollected: 5478223,
        deductionsTdsRetention: 0,
        operationalAR: 172353,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'COMPLETED',
      },
      {
        projectId: 'p-dss-ts1',
        siteName: 'Tower S1 – Modular Kitchen',
        siteState: 'CH',
        contractCeiling: 4156035,
        billed: 4271794,
        bankCollected: 3860727,
        deductionsTdsRetention: 0,
        operationalAR: 411067,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'COMPLETED',
      },
      {
        projectId: 'p-dss-tc',
        siteName: 'Tower C – Modular Kitchen (10% Handover Pending)',
        siteState: 'CH',
        contractCeiling: 1394760,
        billed: 1394760,
        bankCollected: 1276560,
        deductionsTdsRetention: 0,
        operationalAR: 118200,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'COMPLETED',
      },
      {
        projectId: 'p-dss-ward',
        siteName: 'Wardrobes – Tower A, D, E & F',
        siteState: 'CH',
        contractCeiling: 3507065,
        billed: 3507065,
        bankCollected: 3017477,
        deductionsTdsRetention: 0,
        operationalAR: 489588,
        physicalCompletionPct: 100,
        billingCompletionPct: 100,
        status: 'COMPLETED',
      },
    ],
  },

  {
    // ── Silverglades Infrastructure Pvt. Ltd. (High Town, Gurugram)
    // Source: High Town Payment Details.xlsx
    // PO: STU/KITC/2025-26/103  dated 30.04.25  ₹1,11,57,240
    // Invoice S5I/26-27/DS/2 dated 27.04.26: ₹35,90,098
    // Advance received 16.05.25: ₹18,91,058 (20% of PO)
    // Advance recovered: ₹12,33,888
    // Payment received 30.05.26: ₹29,32,928
    // Balance: ₹69,90,424
    clientId: 'c-hightown',
    clientName: 'Silverglades Infra Pvt. Ltd. (High Town, Gurugram)',
    projects: [
      {
        projectId: 'p-htw-kit',
        siteName: 'High Town – Modular Kitchen & Vanities (Tower A)',
        siteState: 'HR',
        contractCeiling: 11157240,
        billed: 3590098,
        bankCollected: 4824886,     // Advance ₹18,91,058 + payment ₹29,32,928
        deductionsTdsRetention: 1233888, // Advance recovered
        operationalAR: 6990424,
        physicalCompletionPct: 15,
        billingCompletionPct: 32,
        status: 'ACTIVE',
      },
    ],
  },

  {
    // ── Coronet Hotel Services Pvt. Ltd. (Tarudhan Valley, Manesar)
    // Source: Coronet Hotel Services Pvt Ltd 19.09.26.xlsx
    // WO 007: Guest Room Corridor     ₹21,79,873  (85% done, 15% held by Dalmia Sir)
    // WO 008: Pool Deck Area          ₹7,19,626   (100% done)
    // PI S51/26-27/09/19: Restaurant Staircase Stone ₹6,81,804 (WIP)
    // Total: ₹35,81,303 | Cash Received: ₹15,00,000 | Balance: ₹20,81,303
    clientId: 'c-coronet',
    clientName: 'Coronet Hotel Services Pvt. Ltd. (Tarudhan Valley)',
    projects: [
      {
        projectId: 'p-cor-trud',
        siteName: 'Tarudhan Valley Resort – Renovation & Fit-Out',
        siteState: 'HR',
        contractCeiling: 3581303,
        billed: 3581303,
        bankCollected: 1500000,
        deductionsTdsRetention: 0,
        operationalAR: 2081303,
        physicalCompletionPct: 88,
        billingCompletionPct: 100,
        status: 'ACTIVE',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// KPI SUMMARY — aggregated totals from all real projects
// ─────────────────────────────────────────────────────────────────────────────
function sumField(field: keyof ProjectRow): number {
  return mockClientGroups
    .flatMap((c) => c.projects)
    .reduce((s, p) => s + (p[field] as number), 0);
}

export const mockKpi: KpiSummary = {
  totalContractValue:       sumField('contractCeiling'),
  netInvoicedValue:         sumField('billed'),
  totalCollected:           sumField('bankCollected'),
  operationalReceivables:   sumField('operationalAR'),
  retentionUnderDLP: 0,
  // High Town: advance ₹18,91,058 − recovered ₹12,33,888 = ₹6,57,170 still outstanding
  mobilizationAdvanceBalance: 657170,
};

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVABLES AGEING — real outstanding balances per ledger/SOA
// Ledger dates: FY 2025-26 (Apr-25 to Mar-26)
// Current date for bucket calc: 20-Sep-2026
// ─────────────────────────────────────────────────────────────────────────────
export const mockAgeingRows: AgeingRow[] = [
  // ── Lemon Tree Dehradun — both POs outstanding since Jul-26
  {
    invoiceId: 'inv-deh-016',
    invoiceNumber: 'PDCL/LTHDN/20260729/016 (Corridor)',
    clientName: 'Lemon Tree Hotels',
    siteName: 'Dehradun – 4th Floor Corridor',
    invoiceDate: '2026-07-29',
    dueDate: '2026-08-28',
    netReceivable: 1055547,
    operationalOutstanding: 900381,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '31_60',
  },
  {
    invoiceId: 'inv-deh-017',
    invoiceNumber: 'PDCL/LTHDN/20260729/017 (49 Rooms)',
    clientName: 'Lemon Tree Hotels',
    siteName: 'Dehradun – 49 Rooms',
    invoiceDate: '2026-07-30',
    dueDate: '2026-08-29',
    netReceivable: 8057271,
    operationalOutstanding: 6872853,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '31_60',
  },

  // ── Keys Hotel Hosur Road — closing balance ₹3,16,730 (FY25-26 closed)
  {
    invoiceId: 'inv-hos-bal',
    invoiceNumber: 'Hosur Road – Closing Balance (FY 25-26)',
    clientName: 'Lemon Tree Hotels',
    siteName: 'Keys Hotel – Hosur Road, Bengaluru',
    invoiceDate: '2026-03-31',
    dueDate: '2026-04-30',
    netReceivable: 316730,
    operationalOutstanding: 316730,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },

  // ── Keys Hotel Kochi — closing balance ₹4,23,802
  {
    invoiceId: 'inv-koc-bal',
    invoiceNumber: 'Kochi – Closing Balance (FY 25-26)',
    clientName: 'Lemon Tree Hotels',
    siteName: 'Keys Hotel – Kochi',
    invoiceDate: '2026-03-31',
    dueDate: '2026-04-30',
    netReceivable: 423802,
    operationalOutstanding: 423802,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },

  // ── PGN-1 Gurugram — closing balance ₹1,44,126
  {
    invoiceId: 'inv-pgn-bal',
    invoiceNumber: 'PGN-1 GGN – Closing Balance (FY 25-26)',
    clientName: 'Lemon Tree Hotels',
    siteName: 'Lemon Tree – PGN-1, Gurugram',
    invoiceDate: '2026-03-31',
    dueDate: '2026-04-30',
    netReceivable: 144126,
    operationalOutstanding: 144126,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },

  // ── Red Fox Mayur Vihar — closing balance ₹3,17,206
  {
    invoiceId: 'inv-rfx-bal',
    invoiceNumber: 'Red Fox Mayur Vihar – Closing Balance (FY 25-26)',
    clientName: 'Lemon Tree Hotels',
    siteName: 'Red Fox Hotel – Mayur Vihar, East Delhi',
    invoiceDate: '2026-03-31',
    dueDate: '2026-04-30',
    netReceivable: 317206,
    operationalOutstanding: 317206,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },

  // ── DSS Buildtech — balances per tower
  {
    invoiceId: 'inv-dss-tb',
    invoiceNumber: 'DSS Tower B – Outstanding Balance',
    clientName: 'DSS Buildtech Pvt. Ltd.',
    siteName: 'Tower B – Modular Kitchen',
    invoiceDate: '2024-10-01',
    dueDate: '2024-10-31',
    netReceivable: 750540,
    operationalOutstanding: 750540,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
  {
    invoiceId: 'inv-dss-tg',
    invoiceNumber: 'DSS Tower G – Outstanding Balance',
    clientName: 'DSS Buildtech Pvt. Ltd.',
    siteName: 'Tower G – Modular Kitchen',
    invoiceDate: '2025-04-01',
    dueDate: '2025-04-30',
    netReceivable: 172353,
    operationalOutstanding: 172353,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
  {
    invoiceId: 'inv-dss-ts1',
    invoiceNumber: 'DSS Tower S1 – Outstanding Balance',
    clientName: 'DSS Buildtech Pvt. Ltd.',
    siteName: 'Tower S1 – Modular Kitchen',
    invoiceDate: '2025-01-01',
    dueDate: '2025-01-31',
    netReceivable: 411067,
    operationalOutstanding: 411067,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
  {
    invoiceId: 'inv-dss-tc',
    invoiceNumber: 'S5I/24-25/024 – Tower C Handover 10%',
    clientName: 'DSS Buildtech Pvt. Ltd.',
    siteName: 'Tower C – 10% Handover Balance',
    invoiceDate: '2024-09-01',
    dueDate: '2024-09-30',
    netReceivable: 118200,
    operationalOutstanding: 118200,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
  {
    invoiceId: 'inv-dss-ward',
    invoiceNumber: 'S5I/25-26/003 – Wardrobes Balance',
    clientName: 'DSS Buildtech Pvt. Ltd.',
    siteName: 'Wardrobes – Tower A, D, E & F',
    invoiceDate: '2025-04-01',
    dueDate: '2025-04-30',
    netReceivable: 489588,
    operationalOutstanding: 489588,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },

  // ── High Town / Silverglades
  {
    invoiceId: 'inv-htw-001',
    invoiceNumber: 'S5I/26-27/DS/2 – High Town Kitchen',
    clientName: 'Silverglades Infra Pvt. Ltd.',
    siteName: 'High Town – Modular Kitchen & Vanities',
    invoiceDate: '2026-04-27',
    dueDate: '2026-05-27',
    netReceivable: 3590098,
    operationalOutstanding: 6990424,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },

  // ── Coronet Hotels — Tarudhan Valley
  {
    invoiceId: 'inv-cor-wo007',
    invoiceNumber: 'WO/CHSSPL/CH 2026/007 – Corridor',
    clientName: 'Coronet Hotel Services Pvt. Ltd.',
    siteName: 'Tarudhan Valley – Guest Room Corridor',
    invoiceDate: '2026-04-04',
    dueDate: '2026-05-04',
    netReceivable: 2179873,
    operationalOutstanding: 1381303,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
  {
    invoiceId: 'inv-cor-wo008',
    invoiceNumber: 'WO/CHSSPL/CH 2026/008 – Pool Deck',
    clientName: 'Coronet Hotel Services Pvt. Ltd.',
    siteName: 'Tarudhan Valley – Pool Deck (100% Complete)',
    invoiceDate: '2026-04-04',
    dueDate: '2026-05-04',
    netReceivable: 719626,
    operationalOutstanding: 700000,
    isRetentionOnly: false,
    retentionExpectedReleaseDate: null,
    bucket: '90_PLUS',
  },
];
