'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Reference rates (fallback — actual rates always come from import data) ───
let _refRates    = null;
let _fxAccounts  = null;

function _loadRefs() {
  if (_refRates) return;
  try {
    const parsed  = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/currencyRates.json'), 'utf-8'));
    _refRates     = parsed.rates      || {};
    _fxAccounts   = parsed.fxAccounts || {};
  } catch (_) {
    _refRates   = {};
    _fxAccounts = {};
  }
}

function getReferenceRate(currency, base = 'EUR') {
  _loadRefs();
  if (currency === base) return 1;
  return _refRates[currency] || null;
}

function getFxAccounts() {
  _loadRefs();
  return _fxAccounts;
}

// ─── Threshold below which an accounting imbalance is treated as rounding ─────
const ROUNDING_THRESHOLD = 0.10;

// ─── Line enrichment ──────────────────────────────────────────────────────────

/**
 * Enriches one journal line with accountingAmount and conversion metadata.
 * Reads `entry.currency` (or `entry.transactionCurrency`) and `entry.exchangeRate`.
 */
function enrichLine(entry, accountingCurrency) {
  const txCurrency = String(
    entry.transactionCurrency || entry.currency || accountingCurrency
  ).trim().toUpperCase();

  const rate         = parseFloat(entry.exchangeRate) || 1;
  const isConversion = txCurrency !== accountingCurrency;
  const rawDebit     = parseFloat(entry.debit)  || 0;
  const rawCredit    = parseFloat(entry.credit) || 0;
  const amount       = rawDebit || rawCredit;
  const side         = rawDebit > 0 ? 'debit' : 'credit';

  const accountingAmount = isConversion
    ? parseFloat((amount * rate).toFixed(2))
    : amount;

  return {
    ...entry,
    transactionCurrency: txCurrency,
    exchangeRate:        rate,
    accountingAmount,
    accountingDebit:     side === 'debit'  ? accountingAmount : 0,
    accountingCredit:    side === 'credit' ? accountingAmount : 0,
    isConversion,
    conversionNote: isConversion
      ? `${amount.toLocaleString()} ${txCurrency} × ${rate} = ${accountingAmount.toFixed(2)} ${accountingCurrency}`
      : null,
  };
}

// ─── Rate-override detection ──────────────────────────────────────────────────

/**
 * Flags cases where the same foreign currency is used at two or more different
 * rates within a single voucher (indicates a manual rate override).
 */
function detectRateOverrides(enrichedLines, accountingCurrency) {
  const overrides = [];
  const byCurrency = {};

  enrichedLines.forEach(line => {
    const c = line.transactionCurrency;
    if (c === accountingCurrency) return;
    if (!byCurrency[c]) byCurrency[c] = [];
    byCurrency[c].push(line);
  });

  Object.entries(byCurrency).forEach(([currency, lines]) => {
    const rates = [...new Set(lines.map(l => l.exchangeRate))];
    if (rates.length < 2) return;

    const dominantRate  = rates[0];
    const overrideLines = lines.filter(l => l.exchangeRate !== dominantRate);
    const refRate       = getReferenceRate(currency, accountingCurrency);
    const refNote       = refRate ? ` (reference rate: ${refRate})` : '';

    overrides.push({
      currency,
      rates,
      dominantRate,
      overrideLineCount: overrideLines.length,
      type:     'RATE_OVERRIDE',
      severity: 'medium',
      issue: `Manual exchange rate override detected for ${currency}: ` +
             `${rates.map(r => r).join(' vs ')} used on different lines${refNote}.`,
      fix: `Verify the intentionality of the rate override. If this is a settlement entry at a ` +
           `different rate from the original invoice, post the resulting ${accountingCurrency} ` +
           `difference to ${getFxAccounts().gain?.fr || '766'} (FX gain) or ` +
           `${getFxAccounts().loss?.fr || '666'} (FX loss). Otherwise, align all ` +
           `${currency} lines to the same rate.`,
    });
  });

  return overrides;
}

// ─── FX difference analysis ───────────────────────────────────────────────────

/**
 * Classifies an accounting imbalance as rounding, FX imbalance, or missing posting.
 */
function analyseFxDifference(totalDrAcct, totalCrAcct, isMultiCurrency, accountingCurrency) {
  const raw  = totalDrAcct - totalCrAcct;
  const diff = parseFloat(Math.abs(raw).toFixed(2));
  if (diff < 0.005) return null;

  const fxAcc = getFxAccounts();
  let type, severity, rootCause, fix;

  if (diff <= ROUNDING_THRESHOLD) {
    type      = 'FX_ROUNDING';
    severity  = 'low';
    rootCause = `Rounding difference of ${diff.toFixed(2)} ${accountingCurrency} from multi-currency conversion — amounts ≤ ${ROUNDING_THRESHOLD} ${accountingCurrency} are normal in multi-currency accounting.`;
    fix       = `Post the rounding difference (${diff.toFixed(2)} ${accountingCurrency}) to the FX rounding account ${fxAcc.rounding?.fr || '6568'} / ${fxAcc.rounding?.us || '799000'}.`;
  } else if (isMultiCurrency) {
    type      = 'FX_IMBALANCE';
    severity  = 'high';
    rootCause = `Accounting currency imbalance of ${diff.toFixed(2)} ${accountingCurrency} caused by mixed ` +
                `exchange rates or mixed transaction currencies. The voucher balances in transaction ` +
                `currency but not in ${accountingCurrency}.`;
    const gainAcc = fxAcc.gain?.fr || '766';
    const lossAcc = fxAcc.loss?.fr || '666';
    fix = raw > 0
      ? `DR side exceeds CR by ${diff.toFixed(2)} ${accountingCurrency}. Post: ` +
        `CR ${gainAcc} (FX gain) ${diff.toFixed(2)} ${accountingCurrency}, or adjust exchange rates.`
      : `CR side exceeds DR by ${diff.toFixed(2)} ${accountingCurrency}. Post: ` +
        `DR ${lossAcc} (FX loss) ${diff.toFixed(2)} ${accountingCurrency}, or adjust exchange rates.`;
  } else {
    type      = 'MISSING_FX_POSTING';
    severity  = 'high';
    rootCause = `Accounting imbalance of ${diff.toFixed(2)} ${accountingCurrency} — the FX gain/loss entry was not posted.`;
    fix       = `Investigate the missing FX posting. Add the balancing entry: ` +
                (raw > 0
                  ? `CR ${fxAcc.gain?.fr || '766'} ${diff.toFixed(2)} ${accountingCurrency}`
                  : `DR ${fxAcc.loss?.fr || '666'} ${diff.toFixed(2)} ${accountingCurrency}`);
  }

  return {
    detected:     true,
    amount:       diff,
    rawAmount:    parseFloat(raw.toFixed(2)),
    direction:    raw > 0 ? 'DR_EXCESS' : 'CR_EXCESS',
    type, severity, rootCause, fix,
  };
}

// ─── Per-currency transaction balance check ───────────────────────────────────

function buildCurrencyGroups(enrichedLines) {
  const groups = {};
  enrichedLines.forEach(line => {
    const c = line.transactionCurrency;
    if (!groups[c]) {
      groups[c] = { txDr: 0, txCr: 0, acctDr: 0, acctCr: 0, lines: [], rates: new Set() };
    }
    groups[c].txDr   += parseFloat(line.debit)   || 0;
    groups[c].txCr   += parseFloat(line.credit)  || 0;
    groups[c].acctDr += line.accountingDebit;
    groups[c].acctCr += line.accountingCredit;
    groups[c].lines.push(line);
    groups[c].rates.add(line.exchangeRate);
  });

  const result = {};
  Object.entries(groups).forEach(([currency, g]) => {
    const txDiff = parseFloat((g.txDr - g.txCr).toFixed(2));
    result[currency] = {
      currency,
      txDebit:      parseFloat(g.txDr.toFixed(2)),
      txCredit:     parseFloat(g.txCr.toFixed(2)),
      txBalanced:   Math.abs(txDiff) < 0.005,
      txDifference: txDiff,
      acctDebit:    parseFloat(g.acctDr.toFixed(2)),
      acctCredit:   parseFloat(g.acctCr.toFixed(2)),
      lineCount:    g.lines.length,
      ratesUsed:    [...g.rates],
    };
  });
  return result;
}

// ─── Main per-voucher analysis ────────────────────────────────────────────────

/**
 * Analyses multi-currency aspects of a single voucher.
 *
 * @param {Object} voucher          — raw voucher with `entries` array
 * @param {string} accountingCurrency — e.g. 'EUR'
 * @returns {Object}
 */
function analyseVoucherCurrency(voucher, accountingCurrency = 'EUR') {
  const rawEntries = voucher.entries || [];

  // ── 1. Enrich lines ────────────────────────────────────────────────────────
  const enriched = rawEntries.map(e => enrichLine(e, accountingCurrency));

  // ── 2. Accounting totals ───────────────────────────────────────────────────
  const totalDrAcct = enriched.reduce((s, e) => s + e.accountingDebit,  0);
  const totalCrAcct = enriched.reduce((s, e) => s + e.accountingCredit, 0);
  const acctDiff    = Math.abs(totalDrAcct - totalCrAcct);
  const acctBalanced= acctDiff < 0.005;

  // ── 3. Currency profile ────────────────────────────────────────────────────
  const currencyGroups   = buildCurrencyGroups(enriched);
  const currencies       = Object.keys(currencyGroups);
  const foreignCurrencies= currencies.filter(c => c !== accountingCurrency);
  const isMultiCurrency  = foreignCurrencies.length > 0 || currencies.length > 1;

  // ── 4. Rate overrides ─────────────────────────────────────────────────────
  const rateOverrides = detectRateOverrides(enriched, accountingCurrency);

  // ── 5. FX difference ──────────────────────────────────────────────────────
  const fxDifference = (!acctBalanced)
    ? analyseFxDifference(totalDrAcct, totalCrAcct, isMultiCurrency, accountingCurrency)
    : null;

  // ── 6. Build issues ────────────────────────────────────────────────────────
  const issues = [];

  if (fxDifference) {
    issues.push({
      type:      fxDifference.type,
      severity:  fxDifference.severity,
      title: fxDifference.type === 'FX_ROUNDING'
        ? 'FX Rounding Difference'
        : fxDifference.type === 'FX_IMBALANCE'
        ? 'Accounting Currency Imbalance (FX)'
        : 'Missing FX Gain/Loss Posting',
      detail: `Accounting balance: DR ${totalDrAcct.toFixed(2)} ≠ CR ${totalCrAcct.toFixed(2)}` +
              ` (diff: ${acctDiff.toFixed(2)} ${accountingCurrency})`,
      rootCause: fxDifference.rootCause,
      fix:       fxDifference.fix,
    });
  }

  rateOverrides.forEach(ro => {
    issues.push({
      type:     'RATE_OVERRIDE',
      severity: ro.severity,
      title:    `Manual Exchange Rate Override — ${ro.currency}`,
      detail:   ro.issue,
      fix:      ro.fix,
    });
  });

  const status =
    issues.some(i => i.severity === 'high')   ? 'error'   :
    issues.some(i => i.severity === 'medium') ? 'warning' : 'clean';

  return {
    voucherId:          voucher.voucherId,
    accountingCurrency,
    currencies,
    foreignCurrencies,
    isMultiCurrency,
    enrichedLines:      enriched,
    accountingBalance: {
      totalDrAccounting: parseFloat(totalDrAcct.toFixed(2)),
      totalCrAccounting: parseFloat(totalCrAcct.toFixed(2)),
      balanced:          acctBalanced,
      difference:        parseFloat(acctDiff.toFixed(2)),
    },
    currencyGroups,
    fxDifference:       fxDifference || { detected: false },
    rateOverrides,
    issues,
    status,
  };
}

// ─── Sheet-level summary ──────────────────────────────────────────────────────

function buildSheetCurrencySummary(allAnalyses, accountingCurrency) {
  const all      = Object.values(allAnalyses);
  const multi    = all.filter(v => v.isMultiCurrency);
  const fxIssue  = all.filter(v => v.fxDifference?.detected);
  const override = all.filter(v => v.rateOverrides.length > 0);
  const allCcys  = [...new Set(all.flatMap(v => v.currencies))];

  return {
    totalVouchers:          all.length,
    multiCurrencyVouchers:  multi.length,
    fxIssueVouchers:        fxIssue.length,
    rateOverrideVouchers:   override.length,
    totalFxExposure:        parseFloat(
      fxIssue.reduce((s, v) => s + (v.fxDifference?.amount || 0), 0).toFixed(2)
    ),
    currenciesUsed:         allCcys,
    foreignCurrenciesUsed:  allCcys.filter(c => c !== accountingCurrency),
  };
}

// ─── Main public API ──────────────────────────────────────────────────────────

/**
 * Runs currency analysis over all sheets in voucherData.
 * Only stores analyses for vouchers that are multi-currency or have issues.
 *
 * @param {Object} voucherData   — { sheetName: { vouchers, entries, stats } }
 * @param {Object} context       — { accountingCurrency: 'EUR', … }
 * @returns {Object}             — { sheetName: { accountingCurrency, voucherCurrencyMap, summary } }
 */
function runCurrencyAnalysis(voucherData, context = {}) {
  const accountingCurrency = (context.accountingCurrency || 'EUR').toUpperCase();
  const sheetResults = {};

  Object.entries(voucherData).forEach(([sheetName, sheetData]) => {
    const voucherMap = sheetData.vouchers || {};
    const allAnalyses = {};

    Object.values(voucherMap).forEach(voucher => {
      allAnalyses[voucher.voucherId] = analyseVoucherCurrency(voucher, accountingCurrency);
    });

    // Only persist analyses that have multi-currency content or issues
    const voucherCurrencyMap = {};
    Object.entries(allAnalyses).forEach(([id, analysis]) => {
      if (analysis.isMultiCurrency || analysis.issues.length > 0) {
        voucherCurrencyMap[id] = analysis;
      }
    });

    sheetResults[sheetName] = {
      accountingCurrency,
      voucherCurrencyMap,
      summary: buildSheetCurrencySummary(allAnalyses, accountingCurrency),
    };
  });

  return sheetResults;
}

module.exports = {
  runCurrencyAnalysis,
  analyseVoucherCurrency,
  enrichLine,
  getReferenceRate,
  getFxAccounts,
};
