'use strict';

const logger = require('./logger');

const ROUNDING        = 0.005;
const VALID_CURRENCIES = new Set([
  'EUR','USD','GBP','CHF','JPY','CAD','AUD','SEK','NOK','DKK',
  'PLN','CZK','HUF','RON','BGN','HRK','TRY','CNY','INR','BRL',
  'ZAR','MXN','SGD','HKD','KRW','IDR','MYR','PHP','THB','NZD',
]);

// ─── Line-level validation ────────────────────────────────────────────────────

function validateLine(line, lineIndex, accountingCurrency = 'EUR') {
  const errors   = [];
  const warnings = [];
  const idx      = lineIndex + 1;

  const account  = String(line.usAccount || line.account || '').trim();
  if (!account) errors.push({ field: 'account', message: `Line ${idx}: Account number is missing.` });

  const dr = parseFloat(line.debit);
  const cr = parseFloat(line.credit);

  if (isNaN(dr) || dr < 0) {
    errors.push({ field: 'debit', message: `Line ${idx}: Debit must be a non-negative number (got "${line.debit}").` });
  }
  if (isNaN(cr) || cr < 0) {
    errors.push({ field: 'credit', message: `Line ${idx}: Credit must be a non-negative number (got "${line.credit}").` });
  }
  const drSafe = isNaN(dr) ? 0 : dr;
  const crSafe = isNaN(cr) ? 0 : cr;

  if (drSafe === 0 && crSafe === 0) {
    warnings.push({ field: 'amount', message: `Line ${idx}: Both debit and credit are zero — this line has no financial impact.` });
  }
  if (drSafe > 0 && crSafe > 0) {
    errors.push({ field: 'amount', message: `Line ${idx}: A line cannot have both a debit and credit amount.` });
  }

  const currency = String(line.transactionCurrency || line.currency || accountingCurrency).toUpperCase().trim();
  if (!VALID_CURRENCIES.has(currency)) {
    warnings.push({ field: 'currency', message: `Line ${idx}: Currency "${currency}" is not a recognised ISO code.` });
  }

  const rate = parseFloat(line.exchangeRate);
  if (!isNaN(rate) && rate <= 0) {
    errors.push({ field: 'exchangeRate', message: `Line ${idx}: Exchange rate must be positive (got ${rate}).` });
  }
  if (!isNaN(rate) && currency !== accountingCurrency && Math.abs(rate - 1) < 0.0001) {
    warnings.push({ field: 'exchangeRate', message: `Line ${idx}: Exchange rate is 1.0 for foreign currency ${currency} — rate may be missing.` });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Voucher-level validation ─────────────────────────────────────────────────

function validateVoucher(voucher, accountingCurrency = 'EUR') {
  const errors   = [];
  const warnings = [];
  const vid      = voucher.voucherId || voucher.id || '?';

  if (!voucher.voucherId) {
    errors.push({ field: 'voucherId', message: 'Voucher ID is missing.' });
  }

  const entries = voucher.entries || [];
  if (entries.length === 0) {
    errors.push({ field: 'entries', message: `Voucher ${vid}: Has no entries.` });
    return { valid: false, errors, warnings, isMultiCurrency: false, totalDebit: 0, totalCredit: 0, imbalance: 0 };
  }

  // Per-line validation
  entries.forEach((line, idx) => {
    const r = validateLine(line, idx, accountingCurrency);
    errors.push(   ...r.errors.map(e   => ({ ...e,   lineIndex: idx, voucherId: vid })));
    warnings.push(...r.warnings.map(w => ({ ...w, lineIndex: idx, voucherId: vid })));
  });

  // Transaction-currency balance
  let totalDr = 0, totalCr = 0;
  for (const e of entries) {
    totalDr += parseFloat(e.debit)  || 0;
    totalCr += parseFloat(e.credit) || 0;
  }
  const imbalance = Math.abs(totalDr - totalCr);
  if (imbalance > ROUNDING) {
    errors.push({
      field:     'balance',
      voucherId: vid,
      message:   `Voucher ${vid}: Unbalanced by ${imbalance.toFixed(2)} (DR ${totalDr.toFixed(2)} ≠ CR ${totalCr.toFixed(2)}).`,
    });
  }

  // Multi-currency accounting balance
  const isMultiCurrency = entries.some(e => {
    const ccy = String(e.transactionCurrency || e.currency || accountingCurrency).toUpperCase();
    return ccy !== accountingCurrency;
  });

  if (isMultiCurrency) {
    let drAcctg = 0, crAcctg = 0;
    for (const e of entries) {
      const rate = parseFloat(e.exchangeRate) || 1;
      drAcctg += (parseFloat(e.debit)  || 0) * rate;
      crAcctg += (parseFloat(e.credit) || 0) * rate;
    }
    const acctgImbalance = Math.abs(drAcctg - crAcctg);
    if (acctgImbalance > ROUNDING) {
      warnings.push({
        field:     'accountingBalance',
        voucherId: vid,
        message:   `Voucher ${vid}: Multi-currency voucher has accounting-currency imbalance of ${acctgImbalance.toFixed(2)} ${accountingCurrency} — may need FX posting.`,
      });
    }
  }

  logger.debug('Validation', `Voucher ${vid}: ${errors.length} errors, ${warnings.length} warnings`, { isMultiCurrency });

  return {
    valid:           errors.length === 0,
    errors,
    warnings,
    isMultiCurrency,
    totalDebit:      Math.round(totalDr * 100) / 100,
    totalCredit:     Math.round(totalCr * 100) / 100,
    imbalance:       Math.round(imbalance * 100) / 100,
  };
}

// ─── Sheet-level validation ───────────────────────────────────────────────────

function validateSheet(sheetData, sheetName, accountingCurrency = 'EUR') {
  const voucherResults = {};
  const errors         = [];
  const warnings       = [];

  for (const [vid, voucher] of Object.entries(sheetData.vouchers || {})) {
    const vr = validateVoucher(voucher, accountingCurrency);
    voucherResults[vid] = vr;
    if (!vr.valid) errors.push(...vr.errors.map(e => ({ ...e, sheetName })));
    warnings.push(...vr.warnings.map(w => ({ ...w, sheetName })));
  }

  const valid = errors.length === 0;
  if (!valid) logger.warn('Validation', `Sheet "${sheetName}": ${errors.length} validation error(s)`, { errors });

  return { valid, voucherResults, errors, warnings };
}

// ─── Full-input validation ────────────────────────────────────────────────────

function validateDiagnosticInput(parsedData, context = {}) {
  const accountingCurrency = (context.accountingCurrency || 'EUR').toUpperCase();
  const sheetResults = {};
  let totalErrors = 0, totalWarnings = 0;

  for (const [sheetName, sheetData] of Object.entries(parsedData || {})) {
    const sr = validateSheet(sheetData, sheetName, accountingCurrency);
    sheetResults[sheetName] = sr;
    totalErrors   += sr.errors.length;
    totalWarnings += sr.warnings.length;
  }

  if (totalErrors > 0) {
    logger.warn('Validation', `Input validation: ${totalErrors} error(s), ${totalWarnings} warning(s)`, { accountingCurrency });
  }

  return {
    valid: totalErrors === 0,
    sheetResults,
    totalErrors,
    totalWarnings,
    accountingCurrency,
  };
}

module.exports = { validateLine, validateVoucher, validateSheet, validateDiagnosticInput };
