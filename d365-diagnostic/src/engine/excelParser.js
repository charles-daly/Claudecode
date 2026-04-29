'use strict';

const XLSX = require('xlsx');

/**
 * Parse an Excel file containing D365 journal entries.
 * Supports both single-account (legacy) and dual-GAAP (US_Account + FR_Account) formats.
 * Returns an object keyed by sheet name, each with {entries, vouchers, stats}.
 */
function parseExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const results = {};

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) return;

    const colMap = detectColumns(rows[0]);
    const entries = rows
      .filter(row => String(getField(row, colMap.voucher)).trim())
      .map(row => normaliseEntry(row, colMap));

    if (entries.length === 0) return;

    results[sheetName] = {
      entries,
      vouchers: groupByVoucher(entries),
      stats:    calcStats(entries),
    };
  });

  return results;
}

// ─── Column auto-detection ────────────────────────────────────────────────────
function detectColumns(sampleRow) {
  const find = (...candidates) => {
    for (const c of candidates) {
      const match = Object.keys(sampleRow).find(k =>
        k.toLowerCase().replace(/[\s_\-\.]/g, '').includes(c.toLowerCase().replace(/[\s_\-\.]/g, ''))
      );
      if (match) return match;
    }
    return null;
  };

  return {
    // Core
    voucher:          find('voucher','bon','piece','pièce','document','docnum','doc'),
    date:             find('date','postingdate','postdate','valuedate'),
    // Dual-GAAP accounts (checked before single-account fallback)
    us_account:       find('us_account','usaccount','usgaap','us account','us gl','usgl'),
    fr_account:       find('fr_account','fraccount','frgaap','fr account','pcg account','frpcg','french account','frenchaccount'),
    // Single-account fallback
    account:          find('account','compte','mainaccount','ledgeraccount','gl','glaccount'),
    // Entry data
    description:      find('description','text','libelle','libellé','narration','memo','name'),
    debit:            find('debit','débit','dr','amountdr','debitamount'),
    credit:           find('credit','crédit','cr','amountcr','creditamount'),
    amount:           find('amount','montant','amt','transactionamount'),
    currency:         find('currency','devise','cur','currencycode'),
    exchangerate:     find('exchangerate','exchange_rate','exrate','fxrate','rate','tauxchange'),
    // Context
    transactiontype:  find('transactiontype','transaction_type','txtype','txn type','txntype','type'),
    module:           find('module','source','origin','journaltype'),
    project:          find('project','projectid','project_id','projid','proj'),
    category:         find('category','categoryid','category_id','catid'),
  };
}

function getField(row, key) {
  if (!key) return '';
  return row[key] ?? '';
}

// ─── Entry normalisation ──────────────────────────────────────────────────────
function normaliseEntry(row, colMap) {
  let debit  = parseNum(getField(row, colMap.debit));
  let credit = parseNum(getField(row, colMap.credit));

  // Single signed amount column
  if (!debit && !credit && colMap.amount) {
    const amt = parseNum(getField(row, colMap.amount));
    if (amt >= 0) debit = amt; else credit = Math.abs(amt);
  }

  // Dual-GAAP: US_Account + FR_Account columns take precedence
  const usRaw = String(getField(row, colMap.us_account) || '').replace(/\s/g, '').trim();
  const frRaw = String(getField(row, colMap.fr_account) || '').replace(/\s/g, '').trim();
  // Fallback: legacy single account column
  const legacyAccount = String(getField(row, colMap.account) || '').replace(/\s/g, '').trim();

  // `account` field is the US account for backwards-compatibility (diagnostic engine uses it)
  const usAccount = usRaw || legacyAccount;
  const frAccount = frRaw;

  const exchangeRate = parseNum(getField(row, colMap.exchangerate));

  return {
    voucher:          String(getField(row, colMap.voucher)).trim(),
    date:             normaliseDate(getField(row, colMap.date)),
    // Dual-GAAP
    usAccount,
    frAccount,
    // Legacy compat
    account:          usAccount,
    description:      String(getField(row, colMap.description)).trim(),
    debit:            Math.round(debit  * 100) / 100,
    credit:           Math.round(credit * 100) / 100,
    currency:         String(getField(row, colMap.currency)       || 'EUR').toUpperCase().trim(),
    exchangeRate:     exchangeRate > 0 ? Math.round(exchangeRate * 10000) / 10000 : 1,
    transactionType:  String(getField(row, colMap.transactiontype) || '').trim(),
    module:           String(getField(row, colMap.module)          || 'Unknown').trim(),
    project:          String(getField(row, colMap.project)         || '').trim(),
    category:         String(getField(row, colMap.category)        || '').trim(),
  };
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[, ]/g, ''));
  return isNaN(n) ? 0 : n;
}

function normaliseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch {}
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s;
}

// ─── Group entries by voucher ID ──────────────────────────────────────────────
function groupByVoucher(entries) {
  const vouchers = {};

  for (const entry of entries) {
    if (!vouchers[entry.voucher]) {
      vouchers[entry.voucher] = {
        voucherId:    entry.voucher,
        date:         entry.date,
        entries:      [],
        totalDebit:   0,
        totalCredit:  0,
        currency:     entry.currency,
      };
    }
    const v = vouchers[entry.voucher];
    v.entries.push(entry);
    v.totalDebit  += entry.debit;
    v.totalCredit += entry.credit;
  }

  for (const v of Object.values(vouchers)) {
    v.totalDebit  = Math.round(v.totalDebit  * 100) / 100;
    v.totalCredit = Math.round(v.totalCredit * 100) / 100;
    v.imbalance   = Math.round(Math.abs(v.totalDebit - v.totalCredit) * 100) / 100;
    v.isBalanced  = v.imbalance < 0.01;
    v.debitAccounts  = [...new Set(v.entries.filter(e => e.debit  > 0).map(e => e.usAccount || e.account))];
    v.creditAccounts = [...new Set(v.entries.filter(e => e.credit > 0).map(e => e.usAccount || e.account))];
  }

  return vouchers;
}

function calcStats(entries) {
  const totalDebit  = entries.reduce((s, e) => s + e.debit,  0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const isDualGaap  = entries.some(e => e.frAccount && e.frAccount !== '');
  return {
    totalEntries:   entries.length,
    totalDebit:     Math.round(totalDebit  * 100) / 100,
    totalCredit:    Math.round(totalCredit * 100) / 100,
    uniqueVouchers: new Set(entries.map(e => e.voucher)).size,
    uniqueAccounts: new Set(entries.map(e => e.usAccount || e.account)).size,
    isBalanced:     Math.abs(totalDebit - totalCredit) < 0.01,
    isDualGaap,
  };
}

// ─── Generate sample Excel (single-account + dual-GAAP sheets) ───────────────
function generateSampleExcel(outputPath) {
  // ── Sheet 1: Classic single-account entries (unchanged) ──────────────────
  const classicRows = [
    { Voucher:'LR-2024-001', Date:'2024-01-01', Account:'2319', Description:'ROU Asset – Office Building (IFRS 16)',         Debit:120000,  Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LR-2024-001', Date:'2024-01-01', Account:'1681', Description:'Lease Liability – Office Building',             Debit:0,       Credit:120000,  Currency:'EUR', Module:'Lease' },
    { Voucher:'LA-2024-002', Date:'2024-01-31', Account:'661',  Description:'Lease Interest Jan [WRONG ACCOUNT – use 6618]', Debit:800,     Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LA-2024-002', Date:'2024-01-31', Account:'1688', Description:'Interest Payable – Lease',                      Debit:0,       Credit:800,     Currency:'EUR', Module:'Lease' },
    { Voucher:'LD-2024-003', Date:'2024-01-31', Account:'6811', Description:'ROU Depreciation – Jan',                        Debit:2000,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LD-2024-003', Date:'2024-01-31', Account:'2818', Description:'Accumulated Depreciation – ROU',                Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-004', Date:'2024-01-31', Account:'1681', Description:'Lease Payment – Principal',                     Debit:1200,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-004', Date:'2024-01-31', Account:'512',  Description:'Bank [UNBALANCED – missing interest DR]',       Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },
    { Voucher:'FA-2024-005', Date:'2024-02-01', Account:'2154', Description:'Equipment – CNC Machine',                       Debit:50000,   Credit:0,       Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'FA-2024-005', Date:'2024-02-01', Account:'401',  Description:'Supplier Payable [WRONG – should be 404]',      Debit:0,       Credit:50000,   Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'FD-2024-006', Date:'2024-02-28', Account:'6811', Description:'Equipment Depreciation – Feb',                  Debit:833.33,  Credit:0,       Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'FD-2024-006', Date:'2024-02-28', Account:'28154',Description:'Accumulated Depreciation – Equipment',          Debit:0,       Credit:833.33,  Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'LP-2024-009', Date:'2024-02-28', Account:'1681', Description:'Lease Liability – Principal Repayment',         Debit:1200,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-009', Date:'2024-02-28', Account:'1688', Description:'Interest Payable – Settlement',                 Debit:800,     Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-009', Date:'2024-02-28', Account:'512',  Description:'Bank – Lease Payment',                          Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },
    { Voucher:'LA-2024-011', Date:'2024-02-28', Account:'6618', Description:'Lease Interest – Feb (correct)',                Debit:780,     Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LA-2024-011', Date:'2024-02-28', Account:'1688', Description:'Interest Payable – Lease',                     Debit:0,       Credit:780,     Currency:'EUR', Module:'Lease' },
  ];

  // ── Sheet 2: Dual-GAAP entries ────────────────────────────────────────────
  // Scenario A: CORRECT mappings — US 110000↔FR 411 (receivable), US 400200↔FR 701 (revenue)
  // Scenario B: INCORRECT FR account — US 500100 should map to FR 607, but 401 used (wrong)
  // Scenario C: CONFLICTING mapping — US 200000 appears with both FR 401 and FR 408 in same voucher
  // Scenario D: MISSING mapping — US 999000 has no mapping in the table
  const dualRows = [
    // ── DG-001: CORRECT — Sales invoice, US GAAP ↔ French PCG ───────────────
    {
      Voucher:'DG-2024-001', Date:'2024-03-01', TransactionType:'Invoice',
      US_Account:'110000', FR_Account:'411', Description:'Trade Receivable – Customer A',
      Debit:30000, Credit:0, Currency:'USD', ExchangeRate:0.92, Module:'Sales',
    },
    {
      Voucher:'DG-2024-001', Date:'2024-03-01', TransactionType:'Invoice',
      US_Account:'400200', FR_Account:'701', Description:'Product Sales Revenue',
      Debit:0, Credit:30000, Currency:'USD', ExchangeRate:0.92, Module:'Sales',
    },

    // ── DG-002: INCORRECT FR account — COGS entry uses AP account instead ───
    {
      Voucher:'DG-2024-002', Date:'2024-03-15', TransactionType:'COGS',
      US_Account:'500100', FR_Account:'401', Description:'Cost of Goods Sold [WRONG – FR should be 607]',
      Debit:18000, Credit:0, Currency:'USD', ExchangeRate:0.92, Module:'Sales',
    },
    {
      Voucher:'DG-2024-002', Date:'2024-03-15', TransactionType:'COGS',
      US_Account:'110000', FR_Account:'411', Description:'Trade Receivable – clearing',
      Debit:0, Credit:18000, Currency:'USD', ExchangeRate:0.92, Module:'Sales',
    },

    // ── DG-003: CONFLICTING — US 200000 paired with two different FR accounts
    {
      Voucher:'DG-2024-003', Date:'2024-03-20', TransactionType:'Invoice',
      US_Account:'200000', FR_Account:'401', Description:'Trade Payable – Supplier X',
      Debit:0, Credit:45000, Currency:'EUR', ExchangeRate:1, Module:'Procurement',
    },
    {
      Voucher:'DG-2024-003', Date:'2024-03-20', TransactionType:'Invoice',
      US_Account:'200000', FR_Account:'408', Description:'Accrued Invoice – Supplier X [CONFLICT: same US acct, different FR]',
      Debit:45000, Credit:0, Currency:'EUR', ExchangeRate:1, Module:'Procurement',
    },

    // ── DG-004: MISSING mapping — custom account not in mapping table ────────
    {
      Voucher:'DG-2024-004', Date:'2024-03-25', TransactionType:'Manual',
      US_Account:'999000', FR_Account:'699', Description:'Custom Clearing Account [NO MAPPING DEFINED]',
      Debit:5000, Credit:0, Currency:'EUR', ExchangeRate:1, Module:'GeneralLedger',
    },
    {
      Voucher:'DG-2024-004', Date:'2024-03-25', TransactionType:'Manual',
      US_Account:'110000', FR_Account:'411', Description:'Trade Receivable – offset',
      Debit:0, Credit:5000, Currency:'EUR', ExchangeRate:1, Module:'GeneralLedger',
    },

    // ── DG-005: CORRECT — PMA expense, US GAAP ↔ French PCG ─────────────────
    {
      Voucher:'DG-2024-005', Date:'2024-03-31', TransactionType:'Expense',
      US_Account:'52000', FR_Account:'641', Description:'Salaries & Wages – March',
      Debit:75000, Credit:0, Currency:'EUR', ExchangeRate:1, Module:'PMA', Project:'PROJ-001', Category:'Labor',
    },
    {
      Voucher:'DG-2024-005', Date:'2024-03-31', TransactionType:'Expense',
      US_Account:'215000', FR_Account:'421', Description:'Personnel Payable – March',
      Debit:0, Credit:75000, Currency:'EUR', ExchangeRate:1, Module:'PMA', Project:'PROJ-001', Category:'Labor',
    },

    // ── DG-006: INCORRECT — Classification mismatch, expense posted as BS ────
    {
      Voucher:'DG-2024-006', Date:'2024-03-31', TransactionType:'Depreciation',
      US_Account:'510000', FR_Account:'2818', Description:'Depreciation Expense [WRONG: FR 2818 is BS not P&L — should be 6811]',
      Debit:2500, Credit:0, Currency:'EUR', ExchangeRate:1, Module:'FixedAssets',
    },
    {
      Voucher:'DG-2024-006', Date:'2024-03-31', TransactionType:'Depreciation',
      US_Account:'159000', FR_Account:'2818', Description:'Accumulated Depreciation',
      Debit:0, Credit:2500, Currency:'EUR', ExchangeRate:1, Module:'FixedAssets',
    },
  ];

  const wb = XLSX.utils.book_new();

  // Sheet 1 — classic
  const ws1 = XLSX.utils.json_to_sheet(classicRows);
  ws1['!cols'] = [18,12,10,55,12,12,8,14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Journal Entries');

  // Sheet 2 — dual-GAAP
  const ws2 = XLSX.utils.json_to_sheet(dualRows);
  ws2['!cols'] = [18,12,18,12,10,55,12,12,8,12,14,12,12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Dual GAAP Entries');

  XLSX.writeFile(wb, outputPath);
  return { classicRows, dualRows };
}

module.exports = { parseExcelFile, generateSampleExcel, groupByVoucher, calcStats };
