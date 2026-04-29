'use strict';

// ─── French PCG Chart of Accounts (Plan Comptable Général) ────────────────────
const PCG_ACCOUNTS = {
  // Class 1 – Capital & long-term liabilities
  '101':   'Capital Social',
  '106':   'Réserves',
  '1062':  'Réserve de réévaluation',
  '107':   'Écarts de réévaluation',
  '1681':  'Dettes de location – IFRS 16',
  '1682':  'Dettes de location-financement',
  '16881': 'Part courante – Dette de location',
  '1688':  'Intérêts courus sur location',
  '15':    'Provisions',
  '1510':  'Réserve PMA (Provision PMA)',
  '181':   'Créance interentreprises (Due From)',
  '182':   'Avances interentreprises',
  '185':   'Dette interentreprises (Due To)',
  '186':   'Comptes courants interentreprises',

  // Class 2 – Fixed assets & accumulated depreciation
  '2051':  'Concessions, brevets, licences',
  '2152':  'Terrain (exploitation)',
  '2154':  'Matériel et outillage',
  '2157':  'Véhicules',
  '2182':  'Matériel industriel',
  '2315':  'Installations (générique)',
  '2318':  'Droit d\'usage – Terrain (IFRS 16)',
  '2319':  'Droit d\'usage – Bâtiment (IFRS 16)',
  '2321':  'Droit d\'usage – Autre (IFRS 16)',
  '2328':  'Droit d\'usage – Générique (IFRS 16)',
  '28154': 'Amort. cumulé – Matériel et outillage',
  '28182': 'Amort. cumulé – Matériel industriel',
  '2818':  'Amort. cumulé – Droit d\'usage',
  '2851':  'Amort. cumulé – Logiciels',

  // Class 3 – Stocks & WIP
  '311':   'Matières premières (stocks)',
  '315':   'Fournitures consommables',
  '321':   'Autres approvisionnements',
  '325':   'Emballages',
  '341':   'Produits en cours – marchandises',
  '345':   'Travaux en cours – services',
  '351':   'Produits intermédiaires (semi-finis)',
  '355':   'Produits finis',
  '371':   'Marchandises',
  '375':   'Produits résiduels / récupérés',
  '381':   'Marchandises en cours de route',
  '3411':  'Encours de production – biens',
  '3511':  'Produits semi-finis en cours',

  // Class 4 – Third parties
  '401':   'Fournisseurs (comptes généraux)',
  '404':   'Fournisseurs d\'immobilisations',
  '408':   'Fournisseurs – factures non parvenues (accrual)',
  '409':   'Fournisseurs – avances versées (acomptes)',
  '411':   'Clients',
  '4111':  'Clients – comptes généraux',
  '418':   'Clients – produits non encore facturés',
  '419':   'Clients – avances reçues',
  '421':   'Personnel – rémunérations dues',
  '422':   'Organismes sociaux',
  '4451':  'TVA déductible',
  '4457':  'TVA collectée',
  '486':   'Charges constatées d\'avance',
  '487':   'Produits constatés d\'avance',
  '512':   'Banques – comptes courants',

  // Class 6 – Charges (expenses)
  '601':   'Achats de matières premières',
  '602':   'Achats d\'autres approvisionnements',
  '604':   'Achats d\'études et de prestations',
  '605':   'Achats de matériel et travaux',
  '607':   'Achats de marchandises',
  '6037':  'Variation des stocks de marchandises (COGS)',
  '603':   'Variation des stocks – approvisionnements',
  '6061':  'Fournitures non stockables – consommables',
  '6091':  'Rabais et remises obtenus sur achats',
  '615':   'Entretien et réparations',
  '6154':  'Loyers de matériel (crédit-bail)',
  '6156':  'Entretien bâtiment',
  '6181':  'Loyers de crédit-bail (court terme / faible valeur)',
  '621':   'Personnel extérieur à l\'entreprise',
  '622':   'Rémunérations d\'intermédiaires',
  '625':   'Déplacements, missions, réceptions',
  '641':   'Salaires et appointements',
  '645':   'Charges de sécurité sociale',
  '646':   'Cotisations sociales patronales',
  '661':   'Charges d\'intérêts (générique)',
  '6615':  'Intérêts sur comptes courants',
  '6618':  'Intérêts sur dettes de location (IFRS 16)',
  '675':   'Valeur comptable des éléments cédés (perte)',
  '6811':  'Dotation amortissement – immob. corporelles',
  '6812':  'Dotation amortissement – immob. incorporelles',
  '68725': 'Dotation provisions PMA',
  '6872':  'Dotation provisions – immobilisations',
  '697':   'Pertes de valeur sur actifs circulants',

  // Class 7 – Products (revenue & gains)
  '701':   'Ventes de produits finis',
  '706':   'Prestations de services',
  '707':   'Ventes de marchandises',
  '708':   'Produits des activités annexes',
  '71':    'Production stockée (variation stocks produits)',
  '712':   'Variation des en-cours de production',
  '775':   'Produits de cession d\'immobilisations (gain)',
  '78725': 'Reprises provisions PMA',
};

// ─── US GAAP D365 Chart of Accounts (simplified) ─────────────────────────────
const US_ACCOUNTS = {
  '100000': 'Cash & Cash Equivalents',
  '110000': 'Accounts Receivable (Trade)',
  '120000': 'Accrued Revenue / Unbilled Receivables',
  '125000': 'Deferred Revenue — Current',
  '130100': 'WIP Inventory',
  '140000': 'Finished Goods Inventory',
  '141000': 'Raw Materials Inventory',
  '150100': 'Machinery & Equipment — Cost',
  '150200': 'Vehicles — Cost',
  '152000': 'ROU Asset — Finance Lease',
  '152100': 'ROU Asset — Operating Lease',
  '159000': 'Accumulated Depreciation — Fixed Assets',
  '159100': 'Accumulated Amortisation — Operating Lease ROU',
  '159200': 'Accumulated Depreciation — Finance Lease ROU',
  '180000': 'Intercompany Receivable (Due From)',
  '185000': 'Intercompany Payable (Due To)',
  '200000': 'Accounts Payable (Trade)',
  '200100': 'Accounts Payable — Fixed Assets',
  '205000': 'Accrued Liabilities / Uninvoiced Receipts',
  '206000': 'Vendor Prepayments',
  '210000': 'Finance Lease Liability — LT',
  '210100': 'Finance Lease Liability — Current',
  '211000': 'Operating Lease Liability — LT',
  '211100': 'Operating Lease Liability — Current',
  '215000': 'Interest Payable',
  '215100': 'Salaries & Wages Payable',
  '230000': 'Deferred Revenue — Long Term',
  '400100': 'Service Revenue',
  '400200': 'Product Sales Revenue',
  '400300': 'Other Revenue',
  '500100': 'Cost of Goods Sold',
  '510000': 'Depreciation Expense',
  '510100': 'Depreciation — Finance Lease ROU',
  '510200': 'Amortisation — Operating Lease ROU',
  '520000': 'Salaries & Wages Expense',
  '530000': 'Employee Benefits Expense',
  '540000': 'Travel & Entertainment Expense',
  '550000': 'Professional Services Expense',
  '600100': 'Finance Lease Interest Expense',
  '601000': 'Operating Lease Expense (straight-line)',
  '700000': 'Gain / Loss on Asset Disposal',
};

// ─── Root cause catalogue ──────────────────────────────────────────────────────
const ROOT_CAUSES = {
  WRONG_ACCOUNT: {
    code: 'RC-001',
    title: 'Incorrect Account Mapping',
    description: 'An account code does not match the expected account for this transaction type.',
    severity: 'high',
    possibleCauses: [
      'D365 posting profile misconfigured (Lease, FA, PMA, Procurement, or Sales)',
      'Account incorrectly mapped in module parameters',
      'Manual journal entry used a wrong account',
      'Chart of accounts migration error',
    ],
    fix: 'Review D365 posting profiles for the relevant module. Use the Source Intelligence panel to navigate to the exact configuration element.',
  },
  UNBALANCED_VOUCHER: {
    code: 'RC-002',
    title: 'Unbalanced Voucher',
    description: 'Total debits ≠ total credits for this voucher.',
    severity: 'critical',
    possibleCauses: [
      'Partial batch job completion (power failure / timeout)',
      'System error during posting',
      'Manual journal entry left incomplete',
      'Currency rounding difference not captured',
    ],
    fix: 'Run subledger reconciliation: General Ledger ▸ Periodic tasks ▸ Subledger journal accounting entries',
  },
  MISSING_ENTRY: {
    code: 'RC-003',
    title: 'Missing Expected Entry',
    description: 'An expected accounting entry was not generated by the system.',
    severity: 'high',
    possibleCauses: [
      'Batch job did not run (monthly depreciation / interest accrual / revenue recognition)',
      'Module not configured correctly',
      'Feature not enabled in module parameters',
      'PMA posting profile not configured',
    ],
    fix: 'Check Batch job history (System Administration ▸ Inquiries ▸ Batch Jobs). Verify module setup and rerun the periodic job.',
  },
  PMA_NOT_POSTED: {
    code: 'RC-004',
    title: 'PMA Entry Missing',
    description: 'PMA (Provision pour Mise en Amortissement) entry expected but not found.',
    severity: 'medium',
    possibleCauses: [
      'PMA not activated in French regulatory parameters',
      'PMA accounts not configured in the posting profile',
      'Asset not flagged for PMA treatment in setup',
    ],
    fix: 'Enable PMA: Fixed Assets ▸ Setup ▸ Fixed Asset Parameters ▸ French Regulatory Features. Map accounts 68725 (DR) and 1510 (CR).',
  },
  DUPLICATE_ENTRY: {
    code: 'RC-005',
    title: 'Possible Duplicate Voucher',
    description: 'This entry pattern matches a voucher already posted for the same period.',
    severity: 'high',
    possibleCauses: [
      'Batch job executed twice for the same period',
      'Manual journal duplicated an automatic system entry',
      'Import process posted the same file twice',
    ],
    fix: 'Reverse one of the duplicate vouchers. Review batch job execution history for double-runs.',
  },
  WRONG_AMOUNT: {
    code: 'RC-006',
    title: 'Unexpected Amount',
    description: 'The posted amount differs from the expected calculated value.',
    severity: 'medium',
    possibleCauses: [
      'Wrong lease term or interest rate in module setup',
      'Asset value entered incorrectly at acquisition',
      'Exchange rate applied incorrectly (multi-currency scenario)',
      'Manual override of system-calculated amount',
    ],
    fix: 'Recalculate expected amount manually. Review module setup parameters and exchange rate configuration.',
  },
};

// ─── Known misconfiguration patterns (account → expected) ─────────────────────
// These are cross-module common errors that the analyzer checks for.
const COMMON_ACCOUNT_ERRORS = {
  // Lease
  '661': {
    shouldBe: ['6618'],
    context:  'lease_interest',
    detail:   'Account 661 (general interest) used instead of 6618 (lease interest per IFRS 16). Update the Lease Posting Profile.',
  },
  '6615': {
    shouldBe: ['6618'],
    context:  'lease_interest',
    detail:   'Account 6615 (current account interest) used instead of 6618 (lease interest). Likely a wrong posting profile selection.',
  },
  '6181': {
    shouldBe: ['6618'],
    context:  'finance_lease_interest',
    detail:   'Operating lease expense (6181) posted for a finance lease interest accrual. Check lease classification in D365.',
  },
  // Fixed Assets / Procurement
  '401': {
    shouldBe: ['404'],
    context:  'asset_acquisition',
    detail:   'General supplier account (401) used instead of fixed asset supplier account (404). Update Fixed Asset Posting Profile.',
  },
  // Sales / Procurement
  '601': {
    shouldBe: ['607'],
    context:  'cogs',
    detail:   'Raw material purchase account (601) used for COGS — should reflect stock movement (607/6037). Check Item Group Posting.',
  },
  // PMA
  '419': {
    shouldBe: ['411'],
    context:  'customer_invoice',
    detail:   'Customer advance account (419) used instead of trade receivables (411). Check customer posting profile.',
  },
  // Procurement accrual
  '408_to_401': {
    shouldBe: ['401'],
    context:  'invoice_matched',
    detail:   'Accrual account (408) still open after invoice match — the matching process should have reversed 408 and credited 401.',
  },
};

function getAccountName(code, country = 'FR') {
  const map = country === 'FR' ? PCG_ACCOUNTS : US_ACCOUNTS;
  if (map[code]) return map[code];
  for (const [key, val] of Object.entries(map)) {
    if (code.startsWith(key)) return val;
  }
  return `Account ${code}`;
}

module.exports = {
  PCG_ACCOUNTS,
  US_ACCOUNTS,
  ROOT_CAUSES,
  COMMON_ACCOUNT_ERRORS,
  getAccountName,
};
