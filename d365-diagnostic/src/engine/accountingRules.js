'use strict';

// ─── French PCG Chart of Accounts (Plan Comptable Général) ────────────────────
const PCG_ACCOUNTS = {
  // Class 1 – Capital & long-term liabilities
  '1681':  'Lease Liability – IFRS 16',
  '1682':  'Finance Lease Liability',
  '16881': 'Current Portion – Lease Liability',
  '1688':  'Interest Payable on Leases',
  '15':    'Provisions',
  '1510':  'PMA Reserve (Provision PMA)',

  // Class 2 – Fixed assets & accumulated depreciation
  '2051':  'Concessions, Patents, Licences',
  '2152':  'Land',
  '2154':  'Equipment & Tooling',
  '2157':  'Vehicles',
  '2182':  'Machinery',
  '2315':  'Installations (generic)',
  '2318':  'ROU Asset – Land (IFRS 16)',
  '2319':  'ROU Asset – Buildings (IFRS 16)',
  '2321':  'ROU Asset – Other (IFRS 16)',
  '2328':  'ROU Asset – Generic (IFRS 16)',
  '28154': 'Accumulated Depreciation – Equipment',
  '28182': 'Accumulated Depreciation – Machinery',
  '2818':  'Accumulated Depreciation – ROU Asset',
  '2851':  'Accumulated Amortisation – Software',

  // Class 4 – Third parties
  '401':   'Trade Payables (General Suppliers)',
  '404':   'Suppliers of Fixed Assets',
  '411':   'Trade Receivables',
  '512':   'Bank – Current Account',

  // Class 6 – Charges (expenses)
  '6154':  'Equipment Rental Expense',
  '6156':  'Building Maintenance',
  '6181':  'Operating Lease Expense (short-term / low-value)',
  '661':   'Interest Expense (general)',
  '6615':  'Interest on Current Accounts',
  '6618':  'Interest on Lease Liabilities (IFRS 16)',
  '675':   'Disposal Loss',
  '6811':  'Depreciation – Tangible Assets',
  '6812':  'Depreciation – Intangible Assets',
  '68725': 'PMA Provision Charge',
  '6872':  'Provision Charges – Fixed Assets',

  // Class 7 – Products (revenue & gains)
  '775':   'Asset Disposal Gain',
  '78725': 'PMA Provision Write-back',
};

// ─── US GAAP D365 Chart of Accounts (simplified) ─────────────────────────────
const US_ACCOUNTS = {
  '100000': 'Cash & Cash Equivalents',
  '110000': 'Accounts Receivable',
  '150100': 'Machinery & Equipment – Cost',
  '150200': 'Vehicles – Cost',
  '152000': 'ROU Asset – Finance Lease',
  '152100': 'ROU Asset – Operating Lease',
  '159000': 'Accumulated Depreciation – Fixed Assets',
  '159100': 'Accumulated Amortisation – Operating Lease ROU',
  '159200': 'Accumulated Depreciation – Finance Lease ROU',
  '200100': 'Accounts Payable – Fixed Assets',
  '210000': 'Finance Lease Liability – LT',
  '210100': 'Finance Lease Liability – Current',
  '211000': 'Operating Lease Liability – LT',
  '211100': 'Operating Lease Liability – Current',
  '215000': 'Interest Payable',
  '510000': 'Depreciation Expense',
  '510100': 'Depreciation – Finance Lease ROU',
  '510200': 'Amortisation – Operating Lease ROU',
  '600100': 'Finance Lease Interest Expense',
  '601000': 'Operating Lease Expense (straight-line)',
  '700000': 'Gain / Loss on Asset Disposal',
};

// ─── Transaction rules: expected account patterns per context ──────────────────
const TRANSACTION_RULES = {
  lease: {
    french_gaap: {
      recognition: {
        label: 'Lease Initial Recognition',
        entries: [
          { side: 'debit',  accounts: ['2318','2319','2321','2328','231'], label: 'ROU Asset' },
          { side: 'credit', accounts: ['1681','1682'],                     label: 'Lease Liability' },
        ],
      },
      depreciation: {
        label: 'Monthly ROU Depreciation',
        entries: [
          { side: 'debit',  accounts: ['6811','6812'],                      label: 'Depreciation Charge' },
          { side: 'credit', accounts: ['2818','28154','28182'],             label: 'Accumulated Depreciation' },
        ],
        pmaEntries: [
          { side: 'debit',  accounts: ['68725','6872'],                     label: 'PMA Provision Charge' },
          { side: 'credit', accounts: ['1510','15'],                        label: 'PMA Reserve' },
        ],
      },
      interest_accrual: {
        label: 'Lease Interest Accrual',
        entries: [
          { side: 'debit',  accounts: ['6618'],                            label: 'Lease Interest Expense' },
          { side: 'credit', accounts: ['1688','16881'],                    label: 'Interest Payable' },
        ],
      },
      payment: {
        label: 'Lease Payment',
        entries: [
          { side: 'debit',  accounts: ['1681','1682','16881'],             label: 'Lease Liability Reduction' },
          { side: 'credit', accounts: ['512'],                             label: 'Bank' },
        ],
      },
    },
    us_gaap: {
      recognition_finance: {
        label: 'Finance Lease Initial Recognition',
        entries: [
          { side: 'debit',  accounts: ['152000'],          label: 'ROU Asset – Finance Lease' },
          { side: 'credit', accounts: ['210000','210100'], label: 'Finance Lease Liability' },
        ],
      },
      recognition_operating: {
        label: 'Operating Lease Initial Recognition',
        entries: [
          { side: 'debit',  accounts: ['152100'],          label: 'ROU Asset – Operating Lease' },
          { side: 'credit', accounts: ['211000','211100'], label: 'Operating Lease Liability' },
        ],
      },
      depreciation_finance: {
        label: 'Finance Lease Depreciation',
        entries: [
          { side: 'debit',  accounts: ['510100'], label: 'Depreciation – Finance Lease' },
          { side: 'credit', accounts: ['159200'], label: 'Accumulated Depreciation – Finance Lease ROU' },
        ],
      },
      amortisation_operating: {
        label: 'Operating Lease ROU Amortisation',
        entries: [
          { side: 'debit',  accounts: ['510200'], label: 'Amortisation – Operating Lease ROU' },
          { side: 'credit', accounts: ['159100'], label: 'Accumulated Amortisation – Operating Lease ROU' },
        ],
      },
      interest_finance: {
        label: 'Finance Lease Interest',
        entries: [
          { side: 'debit',  accounts: ['600100'], label: 'Finance Lease Interest Expense' },
          { side: 'credit', accounts: ['215000'], label: 'Interest Payable' },
        ],
      },
      lease_expense_operating: {
        label: 'Operating Lease Expense (straight-line)',
        entries: [
          { side: 'debit',  accounts: ['601000'],                         label: 'Operating Lease Expense' },
          { side: 'credit', accounts: ['211000','211100','100000'],       label: 'Lease Liability or Cash' },
        ],
      },
    },
  },
  fixed_assets: {
    french_gaap: {
      acquisition: {
        label: 'Fixed Asset Acquisition',
        entries: [
          { side: 'debit',  accounts: ['2154','2157','2182','2051','2152','215','21'], label: 'Fixed Asset' },
          { side: 'credit', accounts: ['404'],                                         label: 'Supplier of Fixed Assets' },
        ],
      },
      depreciation: {
        label: 'Asset Depreciation',
        entries: [
          { side: 'debit',  accounts: ['6811','6812'],            label: 'Depreciation Expense' },
          { side: 'credit', accounts: ['28154','28182','2818','2851'], label: 'Accumulated Depreciation' },
        ],
      },
      disposal: {
        label: 'Asset Disposal',
        entries: [
          { side: 'debit',  accounts: ['28154','28182','2851','28'], label: 'Accumulated Depreciation (reversal)' },
          { side: 'credit', accounts: ['2154','2157','2182','2051'], label: 'Fixed Asset Cost (removal)' },
        ],
      },
    },
    us_gaap: {
      acquisition: {
        label: 'Fixed Asset Acquisition',
        entries: [
          { side: 'debit',  accounts: ['150100','150200'],  label: 'Fixed Asset – Cost' },
          { side: 'credit', accounts: ['200100'],            label: 'AP – Fixed Assets' },
        ],
      },
      depreciation: {
        label: 'Asset Depreciation',
        entries: [
          { side: 'debit',  accounts: ['510000'], label: 'Depreciation Expense' },
          { side: 'credit', accounts: ['159000'], label: 'Accumulated Depreciation' },
        ],
      },
    },
  },
};

// ─── Root cause catalogue ──────────────────────────────────────────────────────
const ROOT_CAUSES = {
  WRONG_ACCOUNT: {
    code: 'RC-001',
    title: 'Incorrect Account Mapping',
    description: 'An account code does not match the expected account for this transaction type.',
    severity: 'high',
    possibleCauses: [
      'D365 Lease/Asset posting profile misconfigured',
      'Account incorrectly mapped in module parameters',
      'Manual journal entry used a wrong account',
      'Chart of accounts migration error',
    ],
    fix: 'Review D365 posting profiles: Lease ▸ Setup ▸ Lease Posting Profiles  OR  Fixed Assets ▸ Setup ▸ Fixed Asset Posting Profiles',
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
      'Batch job did not run (monthly depreciation / interest accrual)',
      'Lease or Asset not configured correctly in the module',
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
    fix: 'Recalculate expected amount manually. Review lease/asset setup parameters and exchange rate configuration.',
  },
};

// ─── Known misconfiguration patterns (account → expected) ─────────────────────
const COMMON_ACCOUNT_ERRORS = {
  '661': {
    shouldBe: ['6618'],
    context: 'lease_interest',
    detail: 'Account 661 (general interest) used instead of 6618 (lease interest per IFRS 16). Update the Lease Posting Profile.',
  },
  '6615': {
    shouldBe: ['6618'],
    context: 'lease_interest',
    detail: 'Account 6615 (current account interest) used instead of 6618 (lease interest). Likely a wrong posting profile selection.',
  },
  '401': {
    shouldBe: ['404'],
    context: 'asset_acquisition',
    detail: 'General supplier account (401) used instead of fixed asset supplier account (404). Update Fixed Asset Posting Profile.',
  },
  '6181': {
    shouldBe: ['6618'],
    context: 'finance_lease_interest',
    detail: 'Operating lease expense account (6181) posted for a finance lease interest accrual. Check lease classification in D365.',
  },
};

function getAccountName(code, country = 'FR') {
  const map = country === 'FR' ? PCG_ACCOUNTS : US_ACCOUNTS;
  // Try exact, then prefix match
  if (map[code]) return map[code];
  for (const [key, val] of Object.entries(map)) {
    if (code.startsWith(key)) return val;
  }
  return `Account ${code}`;
}

module.exports = {
  PCG_ACCOUNTS,
  US_ACCOUNTS,
  TRANSACTION_RULES,
  ROOT_CAUSES,
  COMMON_ACCOUNT_ERRORS,
  getAccountName,
};
