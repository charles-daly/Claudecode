'use strict';

const { getFxAccounts } = require('./currencyEngine');

// Below this absolute difference we treat the FX movement as rounding noise
const FX_ROUNDING = 0.005;

// ─── Single-line enrichment ────────────────────────────────────────────────────

/**
 * Enriches one journal entry with realized / unrealized FX data.
 *
 * Direction convention (matches standard FX revaluation accounting):
 *   DR line (asset/receivable): rate goes up  → gain   (worth more EUR to collect)
 *   CR line (liability/payable): rate goes up → loss   (costs more EUR to settle)
 *
 * @param {Object} line           — journal entry (debit|credit, transactionCurrency, exchangeRate)
 * @param {number} currentRate    — current or spot rate for line's currency (user-supplied or from line.spotRate)
 * @param {boolean} isSettled     — true = realized, false = unrealized
 * @param {string} accountingCurrency — e.g. 'EUR'
 * @returns {Object}
 */
function enrichLineWithFx(line, currentRate, isSettled, accountingCurrency) {
  const txCurrency = String(
    line.transactionCurrency || line.currency || accountingCurrency
  ).trim().toUpperCase();

  if (txCurrency === accountingCurrency) return { ...line, hasFxExposure: false };

  const dr     = parseFloat(line.debit)  || 0;
  const cr     = parseFloat(line.credit) || 0;
  const amount = dr || cr;
  if (amount === 0) return { ...line, hasFxExposure: false };

  const side        = dr > 0 ? 'debit' : 'credit';
  const origRate    = parseFloat(line.exchangeRate) || 1;
  // line.spotRate (sample data) takes priority; otherwise caller supplies currentRate
  const curRate     = parseFloat(line.spotRate) || currentRate || origRate;

  const origAcctg   = parseFloat((amount * origRate).toFixed(2));
  const curAcctg    = parseFloat((amount * curRate ).toFixed(2));
  const rawFxDiff   = parseFloat((curAcctg - origAcctg).toFixed(2));

  // Adjust for DR/CR perspective: positive econ = gain, negative econ = loss
  const econFxDiff  = side === 'debit' ? rawFxDiff : -rawFxDiff;
  const gainOrLoss  = Math.abs(econFxDiff) < FX_ROUNDING ? 'neutral'
                    : econFxDiff > 0 ? 'gain' : 'loss';

  // Build correcting journal entry suggestion
  const fxAcc  = getFxAccounts();
  const gainAcc = fxAcc.gain?.fr || '766';
  const lossAcc = fxAcc.loss?.fr || '666';
  const diffAbs = parseFloat(Math.abs(rawFxDiff).toFixed(2));
  const type    = isSettled ? 'realized' : 'unrealized';

  let journalSuggestion = null;
  if (diffAbs >= FX_ROUNDING) {
    const label = `${type === 'realized' ? 'Realized' : 'Unrealized'} FX ${gainOrLoss} on ${txCurrency}`;
    journalSuggestion = {
      description: label,
      accountingCurrency,
      amount: diffAbs,
      entries: gainOrLoss === 'gain'
        ? [
            { account: line.account, side: 'debit',  amount: diffAbs, note: 'Revalue: increase EUR carrying amount' },
            { account: gainAcc,      side: 'credit', amount: diffAbs, note: `${label} — account ${gainAcc}` },
          ]
        : [
            { account: lossAcc,      side: 'debit',  amount: diffAbs, note: `${label} — account ${lossAcc}` },
            { account: line.account, side: 'credit', amount: diffAbs, note: 'Revalue: increase EUR liability amount' },
          ],
    };
  }

  return {
    ...line,
    hasFxExposure:           true,
    originalAmount:          amount,
    originalCurrency:        txCurrency,
    originalExchangeRate:    origRate,
    originalAccountingAmount: origAcctg,
    currentExchangeRate:     curRate,
    currentAccountingAmount: curAcctg,
    fxDifference:            rawFxDiff,
    economicFxDiff:          econFxDiff,
    gainOrLoss,
    type,
    side,
    journalSuggestion,
  };
}

// ─── Per-voucher analysis ─────────────────────────────────────────────────────

/**
 * Analyses all lines in a voucher and aggregates FX gain/loss.
 *
 * @param {Object} voucher         — { voucherId, entries[] }
 * @param {Object} currentRates    — { USD: 0.95, GBP: 1.22, ... }
 * @param {boolean} isSettled
 * @param {string} accountingCurrency
 * @returns {Object}
 */
function analyseVoucherFx(voucher, currentRates, isSettled, accountingCurrency = 'EUR') {
  const enrichedLines = (voucher.entries || []).map(line => {
    const ccy        = String(line.transactionCurrency || line.currency || accountingCurrency).trim().toUpperCase();
    const rate       = currentRates[ccy] ?? parseFloat(line.exchangeRate) ?? 1;
    // Per-line isSettled (from sample data) takes priority over the voucher-level flag
    const lineSettled = typeof line.isSettled === 'boolean' ? line.isSettled : isSettled;
    return enrichLineWithFx(line, rate, lineSettled, accountingCurrency);
  });

  const fxLines = enrichedLines.filter(l => l.hasFxExposure);

  const gainLines  = fxLines.filter(l => l.gainOrLoss === 'gain');
  const lossLines  = fxLines.filter(l => l.gainOrLoss === 'loss');
  const totalGain  = parseFloat(gainLines.reduce((s, l) => s + l.economicFxDiff, 0).toFixed(2));
  const totalLoss  = parseFloat(lossLines.reduce((s, l) => s + l.economicFxDiff, 0).toFixed(2));
  const netFx      = parseFloat((totalGain + totalLoss).toFixed(2));

  return {
    voucherId:         voucher.voucherId,
    isSettled,
    accountingCurrency,
    enrichedLines,
    fxLines,
    currencies:        [...new Set(fxLines.map(l => l.originalCurrency))],
    totalGain,
    totalLoss,
    netFx,
    netType:           netFx >  FX_ROUNDING ? 'gain'
                     : netFx < -FX_ROUNDING ? 'loss' : 'neutral',
    hasFxExposure:     fxLines.length > 0,
  };
}

// ─── Sheet / report level ─────────────────────────────────────────────────────

/**
 * Runs FX gain/loss analysis across all sheets in voucherAnalysis.
 * Uses line.spotRate if present (sample/pre-loaded data), otherwise currentRates overrides.
 *
 * @param {Object} voucherAnalysis — diagnosticResult.voucherAnalysis
 * @param {Object} context         — { accountingCurrency }
 * @param {Object} overrides       — { currentRates: {}, settledVouchers: [] }
 * @returns {Object|null}
 */
function runFxGainLossAnalysis(voucherAnalysis, context = {}, overrides = {}) {
  if (!voucherAnalysis) return null;

  const accountingCurrency = (context.accountingCurrency || 'EUR').toUpperCase();
  const { currentRates = {}, settledVouchers = [] } = overrides;

  const sheetResults = {};
  let grandGain = 0;
  let grandLoss = 0;

  Object.entries(voucherAnalysis).forEach(([sheetName, sheetData]) => {
    const voucherFxMap = {};

    (sheetData.vouchers || []).forEach(vResult => {
      // Settled if explicitly in the override list; per-line isSettled handled inside analyseVoucherFx
      const isSettled = settledVouchers.includes(vResult.voucherId);

      const vFx = analyseVoucherFx(
        { voucherId: vResult.voucherId, entries: vResult.entries || [] },
        currentRates,
        isSettled,
        accountingCurrency
      );

      if (!vFx.hasFxExposure) return;
      voucherFxMap[vResult.voucherId] = vFx;
      grandGain += vFx.totalGain;
      grandLoss += vFx.totalLoss;
    });

    const sheetGain = parseFloat(Object.values(voucherFxMap).reduce((s, v) => s + v.totalGain, 0).toFixed(2));
    const sheetLoss = parseFloat(Object.values(voucherFxMap).reduce((s, v) => s + v.totalLoss, 0).toFixed(2));

    sheetResults[sheetName] = {
      voucherFxMap,
      sheetGain,
      sheetLoss,
      sheetNetFx:       parseFloat((sheetGain + sheetLoss).toFixed(2)),
      fxVoucherCount:   Object.keys(voucherFxMap).length,
    };
  });

  return {
    sheetResults,
    totalGain:        parseFloat(grandGain.toFixed(2)),
    totalLoss:        parseFloat(grandLoss.toFixed(2)),
    netFx:            parseFloat((grandGain + grandLoss).toFixed(2)),
    accountingCurrency,
  };
}

module.exports = { enrichLineWithFx, analyseVoucherFx, runFxGainLossAnalysis };
