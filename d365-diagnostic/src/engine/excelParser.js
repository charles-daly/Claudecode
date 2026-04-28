'use strict';

const XLSX = require('xlsx');

/**
 * Parse an Excel file containing D365 journal entries.
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
      stats: calcStats(entries),
    };
  });

  return results;
}

// ─── Column auto-detection ────────────────────────────────────────────────────
function detectColumns(sampleRow) {
  const find = (...candidates) => {
    for (const c of candidates) {
      const match = Object.keys(sampleRow).find(k =>
        k.toLowerCase().replace(/[\s_-]/g, '').includes(c.toLowerCase())
      );
      if (match) return match;
    }
    return null;
  };

  return {
    voucher:     find('voucher','bon','piece','pièce','document','docnum','doc'),
    date:        find('date','postingdate','postdate','valuedate'),
    account:     find('account','compte','mainaccount','ledgeraccount','gl','glaccount'),
    description: find('description','text','libelle','libellé','narration','memo','name'),
    debit:       find('debit','débit','dr','amountdr','debitamount'),
    credit:      find('credit','crédit','cr','amountcr','creditamount'),
    currency:    find('currency','devise','cur','currencycode'),
    module:      find('module','source','origin','journaltype'),
    amount:      find('amount','montant','amt','transactionamount'),
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

  const account = String(getField(row, colMap.account)).replace(/\s/g, '').trim();

  return {
    voucher:     String(getField(row, colMap.voucher)).trim(),
    date:        normaliseDate(getField(row, colMap.date)),
    account,
    description: String(getField(row, colMap.description)).trim(),
    debit:       Math.round(debit  * 100) / 100,
    credit:      Math.round(credit * 100) / 100,
    currency:    String(getField(row, colMap.currency) || 'EUR').toUpperCase().trim(),
    module:      String(getField(row, colMap.module)   || 'Unknown').trim(),
  };
}

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/[, ]/g, ''));
  return isNaN(n) ? 0 : n;
}

function normaliseDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(raw);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch {}
  }
  const s = String(raw).trim();
  // DD/MM/YYYY  or  DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s; // fall through (YYYY-MM-DD already, or unknown)
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
    v.debitAccounts  = [...new Set(v.entries.filter(e => e.debit  > 0).map(e => e.account))];
    v.creditAccounts = [...new Set(v.entries.filter(e => e.credit > 0).map(e => e.account))];
  }

  return vouchers;
}

function calcStats(entries) {
  const totalDebit  = entries.reduce((s, e) => s + e.debit,  0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  return {
    totalEntries:   entries.length,
    totalDebit:     Math.round(totalDebit  * 100) / 100,
    totalCredit:    Math.round(totalCredit * 100) / 100,
    uniqueVouchers: new Set(entries.map(e => e.voucher)).size,
    uniqueAccounts: new Set(entries.map(e => e.account)).size,
    isBalanced:     Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

// ─── Generate sample Excel ────────────────────────────────────────────────────
function generateSampleExcel(outputPath) {
  const rows = [
    // ── Voucher 1: CORRECT lease initial recognition ─────────────────────────
    { Voucher:'LR-2024-001', Date:'2024-01-01', Account:'2319', Description:'ROU Asset – Office Building (IFRS 16)',        Debit:120000,  Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LR-2024-001', Date:'2024-01-01', Account:'1681', Description:'Lease Liability – Office Building',            Debit:0,       Credit:120000,  Currency:'EUR', Module:'Lease' },

    // ── Voucher 2: ERROR – wrong interest account (661 instead of 6618) ──────
    { Voucher:'LA-2024-002', Date:'2024-01-31', Account:'661',  Description:'Lease Interest Jan [WRONG ACCOUNT – use 6618]',Debit:800,     Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LA-2024-002', Date:'2024-01-31', Account:'1688', Description:'Interest Payable – Lease',                     Debit:0,       Credit:800,     Currency:'EUR', Module:'Lease' },

    // ── Voucher 3: CORRECT depreciation ───────────────────────────────────────
    { Voucher:'LD-2024-003', Date:'2024-01-31', Account:'6811', Description:'ROU Depreciation – Jan',                       Debit:2000,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LD-2024-003', Date:'2024-01-31', Account:'2818', Description:'Accumulated Depreciation – ROU',               Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },

    // ── Voucher 4: ERROR – unbalanced voucher ─────────────────────────────────
    { Voucher:'LP-2024-004', Date:'2024-01-31', Account:'1681', Description:'Lease Payment – Principal',                    Debit:1200,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-004', Date:'2024-01-31', Account:'512',  Description:'Bank [UNBALANCED – missing interest DR]',      Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },

    // ── Voucher 5: ERROR – FA acquired on wrong supplier account ─────────────
    { Voucher:'FA-2024-005', Date:'2024-02-01', Account:'2154', Description:'Equipment – CNC Machine',                      Debit:50000,   Credit:0,       Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'FA-2024-005', Date:'2024-02-01', Account:'401',  Description:'Supplier Payable [WRONG – should be 404]',     Debit:0,       Credit:50000,   Currency:'EUR', Module:'FixedAssets' },

    // ── Voucher 6: CORRECT FA depreciation ───────────────────────────────────
    { Voucher:'FD-2024-006', Date:'2024-02-28', Account:'6811', Description:'Equipment Depreciation – Feb',                 Debit:833.33,  Credit:0,       Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'FD-2024-006', Date:'2024-02-28', Account:'28154',Description:'Accumulated Depreciation – Equipment',         Debit:0,       Credit:833.33,  Currency:'EUR', Module:'FixedAssets' },

    // ── Voucher 7: ERROR – duplicate depreciation same period ─────────────────
    { Voucher:'FD-2024-007', Date:'2024-02-28', Account:'6811', Description:'Equipment Depreciation Feb [DUPLICATE]',       Debit:833.33,  Credit:0,       Currency:'EUR', Module:'FixedAssets' },
    { Voucher:'FD-2024-007', Date:'2024-02-28', Account:'28154',Description:'Accumulated Depreciation [DUPLICATE]',         Debit:0,       Credit:833.33,  Currency:'EUR', Module:'FixedAssets' },

    // ── Voucher 8: CORRECT lease payment ─────────────────────────────────────
    { Voucher:'LP-2024-009', Date:'2024-02-28', Account:'1681', Description:'Lease Liability – Principal Repayment',        Debit:1200,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-009', Date:'2024-02-28', Account:'1688', Description:'Interest Payable – Settlement',                Debit:800,     Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LP-2024-009', Date:'2024-02-28', Account:'512',  Description:'Bank – Lease Payment',                         Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },

    // ── Voucher 9: PMA missing (depreciation without PMA entry) ──────────────
    { Voucher:'LD-2024-010', Date:'2024-02-28', Account:'6811', Description:'ROU Depreciation Feb [PMA ENTRY MISSING]',     Debit:2000,    Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LD-2024-010', Date:'2024-02-28', Account:'2818', Description:'Accumulated Depreciation – ROU',               Debit:0,       Credit:2000,    Currency:'EUR', Module:'Lease' },

    // ── Voucher 10: CORRECT lease interest (correct account) ─────────────────
    { Voucher:'LA-2024-011', Date:'2024-02-28', Account:'6618', Description:'Lease Interest – Feb (correct)',               Debit:780,     Credit:0,       Currency:'EUR', Module:'Lease' },
    { Voucher:'LA-2024-011', Date:'2024-02-28', Account:'1688', Description:'Interest Payable – Lease',                     Debit:0,       Credit:780,     Currency:'EUR', Module:'Lease' },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [18,12,10,55,12,12,8,14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Journal Entries');
  XLSX.writeFile(wb, outputPath);
  return rows;
}

module.exports = { parseExcelFile, generateSampleExcel, groupByVoucher };
