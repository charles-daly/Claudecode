'use strict';

/**
 * financialStatementEngine.js
 * Generates P&L and Balance Sheet statements from journal entry data
 * across three GAAPs: US GAAP, French PCG, and Belgian PCMN.
 *
 * Sign convention (standard accounting):
 *   - Assets:   normal debit balance  → netAmount = debit - credit (positive)
 *   - Revenue:  normal credit balance → displayed as positive (negate netAmount)
 *   - Expenses: normal debit balance  → displayed as positive
 *   - Liabilities/Equity: credit balance → displayed as positive (negate)
 */

const { getAllMappings } = require('./gaapMappingEngine');

// ─── Account type → statement line classification ─────────────────────────────

const TYPE_TO_PNL = {
  Revenue:                  { section: 'Revenue',                          sign: -1 },
  COGS:                     { section: 'Cost of Goods Sold',               sign:  1 },
  Cost:                     { section: 'Operating Expenses',               sign:  1 },
  Expense:                  { section: 'Operating Expenses',               sign:  1 },
  Depreciation:             { section: 'Depreciation & Amortisation',      sign:  1 },
  Interest:                 { section: 'Finance Costs',                    sign:  1 },
};

const TYPE_TO_BS = {
  Asset:                    { section: 'Non-Current Assets',               sign:  1 },
  Receivable:               { section: 'Current Assets — Receivables',     sign:  1 },
  Inventory:                { section: 'Current Assets — Inventory',       sign:  1 },
  'Accumulated Depreciation':{ section: 'Non-Current Assets — Contra',    sign: -1 },
  Payable:                  { section: 'Current Liabilities — Payables',   sign: -1 },
  Accrual:                  { section: 'Current Liabilities — Accruals',   sign: -1 },
  Liability:                { section: 'Non-Current Liabilities',          sign: -1 },
  Equity:                   { section: 'Equity',                           sign: -1 },
};

const PNL_SECTIONS  = ['Revenue', 'Cost of Goods Sold', 'Operating Expenses', 'Depreciation & Amortisation', 'Finance Costs'];
const BS_SECTIONS   = [
  'Current Assets — Receivables',
  'Current Assets — Inventory',
  'Non-Current Assets',
  'Non-Current Assets — Contra',
  'Current Liabilities — Payables',
  'Current Liabilities — Accruals',
  'Non-Current Liabilities',
  'Equity',
];

// ─── Account number fallback classification ───────────────────────────────────

function _classifyFrByRange(acc) {
  const first = parseInt(String(acc || '').charAt(0), 10);
  if (first === 6) return { statement: 'P&L', section: 'Operating Expenses', sign: 1 };
  if (first === 7) return { statement: 'P&L', section: 'Revenue',            sign: -1 };
  if (first >= 1 && first <= 3) return { statement: 'BS', section: 'Non-Current Assets', sign: 1 };
  if (first === 4) return { statement: 'BS', section: 'Current Assets — Receivables', sign: 1 };
  if (first === 5) return { statement: 'BS', section: 'Current Assets — Receivables', sign: 1 };
  return null;
}

function _classifyUsByRange(acc) {
  const n = parseInt(String(acc || '').replace(/\s/g, ''), 10);
  if (isNaN(n)) return null;
  if (n >= 100000 && n <= 199999) return { statement: 'BS', section: 'Current Assets — Receivables', sign: 1 };
  if (n >= 150000 && n <= 199999) return { statement: 'BS', section: 'Non-Current Assets', sign: 1 };
  if (n >= 200000 && n <= 299999) return { statement: 'BS', section: 'Current Liabilities — Payables', sign: -1 };
  if (n >= 300000 && n <= 399999) return { statement: 'BS', section: 'Equity', sign: -1 };
  if (n >= 400000 && n <= 499999) return { statement: 'P&L', section: 'Revenue', sign: -1 };
  if (n >= 500000 && n <= 699999) return { statement: 'P&L', section: 'Operating Expenses', sign: 1 };
  if (n >= 600000 && n <= 699999) return { statement: 'P&L', section: 'Finance Costs', sign: 1 };
  return null;
}

// ─── Main classification ──────────────────────────────────────────────────────

function _classifyEntry(entry, gaap, mappings) {
  const usAccount = entry.usAccount || entry.account || '';
  const mapping   = mappings.find(m => m.usAccount === usAccount) || null;

  let account, classInfo;

  if (gaap === 'us_gaap') {
    account   = usAccount;
    const plCls = mapping ? TYPE_TO_PNL[mapping.type] : null;
    const bsCls = mapping ? TYPE_TO_BS[mapping.type]  : null;
    classInfo = plCls
      ? { statement: 'P&L', ...plCls }
      : bsCls
        ? { statement: 'BS', ...bsCls }
        : _classifyUsByRange(account);
  } else if (gaap === 'french_gaap') {
    account   = entry.frAccount || '';
    const plCls = mapping ? TYPE_TO_PNL[mapping.type] : null;
    const bsCls = mapping ? TYPE_TO_BS[mapping.type]  : null;
    classInfo = plCls
      ? { statement: 'P&L', ...plCls }
      : bsCls
        ? { statement: 'BS', ...bsCls }
        : _classifyFrByRange(account);
  } else if (gaap === 'belgium_gaap') {
    account   = entry.beAccount || '';
    const plCls = mapping ? TYPE_TO_PNL[mapping.type] : null;
    const bsCls = mapping ? TYPE_TO_BS[mapping.type]  : null;
    classInfo = plCls
      ? { statement: 'P&L', ...plCls }
      : bsCls
        ? { statement: 'BS', ...bsCls }
        : _classifyFrByRange(account); // BE PCMN same class structure as FR PCG
  }

  if (!account || !classInfo) return null;

  return {
    account,
    description: mapping?.description || entry.description || '',
    statement:   classInfo.statement,
    section:     classInfo.section,
    sign:        classInfo.sign,   // +1 = debit balance normal, -1 = credit balance normal
    netAmount:   (entry.debit || 0) - (entry.credit || 0),
    currency:    entry.currency || 'EUR',
  };
}

// ─── Statement assembly ───────────────────────────────────────────────────────

function _buildSectionMap(items, sectionOrder) {
  const sections = {};
  for (const s of sectionOrder) {
    sections[s] = { section: s, accounts: {}, total: 0 };
  }

  for (const item of items) {
    if (!sections[item.section]) {
      sections[item.section] = { section: item.section, accounts: {}, total: 0 };
    }
    const s = sections[item.section];
    if (!s.accounts[item.account]) {
      s.accounts[item.account] = { account: item.account, description: item.description, balance: 0 };
    }
    // Apply sign: positive sign means net debit is positive value; negative sign flips
    const displayAmt = item.netAmount * item.sign;
    s.accounts[item.account].balance += displayAmt;
    s.total += displayAmt;
  }

  return Object.values(sections).map(s => ({
    ...s,
    accounts: Object.values(s.accounts).filter(a => Math.abs(a.balance) > 0.01),
  }));
}

function _buildPnL(items) {
  const pnlItems = items.filter(i => i.statement === 'P&L');
  const sections = _buildSectionMap(pnlItems, PNL_SECTIONS);

  const revenue    = sections.find(s => s.section === 'Revenue')?.total || 0;
  const cogs       = sections.find(s => s.section === 'Cost of Goods Sold')?.total || 0;
  const grossProfit = revenue - cogs;

  const opEx       = (sections.find(s => s.section === 'Operating Expenses')?.total || 0)
                   + (sections.find(s => s.section === 'Depreciation & Amortisation')?.total || 0);
  const ebit       = grossProfit - opEx;
  const finCosts   = sections.find(s => s.section === 'Finance Costs')?.total || 0;
  const ebt        = ebit - finCosts;

  return { sections, revenue, cogs, grossProfit, opEx, ebit, finCosts, ebt, netIncome: ebt };
}

function _buildBS(items) {
  const bsItems = items.filter(i => i.statement === 'BS');
  const sections = _buildSectionMap(bsItems, BS_SECTIONS);

  const currentAssets   = (sections.find(s => s.section === 'Current Assets — Receivables')?.total || 0)
                        + (sections.find(s => s.section === 'Current Assets — Inventory')?.total || 0);
  const fixedAssets     = (sections.find(s => s.section === 'Non-Current Assets')?.total || 0)
                        + (sections.find(s => s.section === 'Non-Current Assets — Contra')?.total || 0);
  const totalAssets     = currentAssets + fixedAssets;

  const currentLiab     = (sections.find(s => s.section === 'Current Liabilities — Payables')?.total || 0)
                        + (sections.find(s => s.section === 'Current Liabilities — Accruals')?.total || 0);
  const longTermLiab    = sections.find(s => s.section === 'Non-Current Liabilities')?.total || 0;
  const equity          = sections.find(s => s.section === 'Equity')?.total || 0;
  const totalLiabEquity = currentLiab + longTermLiab + equity;

  return { sections, currentAssets, fixedAssets, totalAssets, currentLiab, longTermLiab, equity, totalLiabEquity };
}

// ─── GAAP comparison ─────────────────────────────────────────────────────────

function compareGaapStatements(stmtUS, stmtFR, stmtBE) {
  const diffs = [];

  const pick = (stmt) => ({
    revenue:    stmt?.pnl?.revenue     || 0,
    cogs:       stmt?.pnl?.cogs        || 0,
    grossProfit:stmt?.pnl?.grossProfit || 0,
    opEx:       stmt?.pnl?.opEx        || 0,
    ebit:       stmt?.pnl?.ebit        || 0,
    netIncome:  stmt?.pnl?.netIncome   || 0,
    totalAssets:stmt?.bs?.totalAssets  || 0,
    totalLiab:  (stmt?.bs?.currentLiab || 0) + (stmt?.bs?.longTermLiab || 0),
    equity:     stmt?.bs?.equity       || 0,
  });

  const us = pick(stmtUS);
  const fr = pick(stmtFR);
  const be = pick(stmtBE);

  const lines = ['revenue', 'cogs', 'grossProfit', 'opEx', 'ebit', 'netIncome', 'totalAssets', 'totalLiab', 'equity'];

  for (const line of lines) {
    const diffFR = fr[line] - us[line];
    const diffBE = be[line] - us[line];
    if (Math.abs(diffFR) > 0.01 || Math.abs(diffBE) > 0.01) {
      diffs.push({
        line,
        us: us[line], fr: fr[line], be: be[line],
        diffUSvsFR: diffFR, diffUSvsBE: diffBE,
        driver: _explainDiff(line, diffFR, diffBE),
      });
    }
  }

  return { diffs, hasGaapDifferences: diffs.length > 0 };
}

function _explainDiff(line, diffFR, diffBE) {
  if (Math.abs(diffFR) < 0.01 && Math.abs(diffBE) < 0.01) return null;
  const frDir = diffFR > 0 ? 'higher' : 'lower';
  const beDir = diffBE > 0 ? 'higher' : 'lower';
  if (line === 'revenue')     return `French PCG ${frDir} by ${Math.abs(diffFR).toFixed(0)} due to different revenue account classification.`;
  if (line === 'grossProfit') return `Gross profit difference driven by COGS classification divergence between GAAPs.`;
  if (line === 'netIncome')   return `Net income varies by ${Math.abs(diffFR).toFixed(0)} (FR) / ${Math.abs(diffBE).toFixed(0)} (BE) vs US GAAP. Review account mappings.`;
  if (line === 'totalAssets') return `Asset values differ — verify that BS account mappings correctly reflect asset classifications under each GAAP.`;
  return `${line} is ${frDir} under French GAAP and ${beDir} under Belgian PCMN vs US GAAP.`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Builds P&L and Balance Sheet for a given GAAP from parsed sheet data.
 *
 * @param {Object} voucherData  { sheetName: { entries, vouchers, stats }, ... }
 * @param {string} gaap         'us_gaap' | 'french_gaap' | 'belgium_gaap'
 * @returns {{ pnl, bs, gaap }}
 */
function buildStatements(voucherData, gaap) {
  let mappings = [];
  try { mappings = getAllMappings(); } catch (_) {}

  const allEntries = [];
  if (voucherData) {
    Object.values(voucherData).forEach(sheet => {
      (sheet.entries || []).forEach(e => allEntries.push(e));
    });
  }

  const classified = allEntries
    .map(e => _classifyEntry(e, gaap, mappings))
    .filter(Boolean);

  return {
    gaap,
    entryCount: allEntries.length,
    classifiedCount: classified.length,
    pnl: _buildPnL(classified),
    bs:  _buildBS(classified),
  };
}

/**
 * Builds statements for all three GAAPs and computes GAAP comparison.
 */
function buildAllStatements(voucherData) {
  const us = buildStatements(voucherData, 'us_gaap');
  const fr = buildStatements(voucherData, 'french_gaap');
  const be = buildStatements(voucherData, 'belgium_gaap');
  const comparison = compareGaapStatements(us, fr, be);
  return { us, fr, be, comparison };
}

module.exports = { buildStatements, buildAllStatements, compareGaapStatements };
