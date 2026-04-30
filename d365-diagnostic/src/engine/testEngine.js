'use strict';

const { validateLine, validateVoucher, validateDiagnosticInput } = require('./validationEngine');
const { enrichLineWithFx, analyseVoucherFx, runFxGainLossAnalysis } = require('./fxGainLossEngine');
const { analyseVoucherCurrency } = require('./currencyEngine');
const logger = require('./logger');

// ─── Test data generator ──────────────────────────────────────────────────────

function generateTestData() {
  return {
    basic: {
      balanced: {
        voucherId: 'TEST-BASIC-001',
        entries: [
          { account: '6811', debit: 1000, credit: 0, currency: 'EUR', exchangeRate: 1, description: 'Depreciation' },
          { account: '28154', debit: 0, credit: 1000, currency: 'EUR', exchangeRate: 1, description: 'Accumulated Depreciation' },
        ],
      },
      unbalanced: {
        voucherId: 'TEST-BASIC-002',
        entries: [
          { account: '6811', debit: 1000, credit: 0, currency: 'EUR', exchangeRate: 1, description: 'Depreciation' },
          { account: '28154', debit: 0, credit: 900, currency: 'EUR', exchangeRate: 1, description: 'Accumulated Depreciation' },
        ],
      },
      zeroAmount: {
        voucherId: 'TEST-BASIC-003',
        entries: [
          { account: '6811', debit: 0, credit: 0, currency: 'EUR', exchangeRate: 1, description: 'Zero line' },
          { account: '28154', debit: 0, credit: 0, currency: 'EUR', exchangeRate: 1, description: 'Zero line' },
        ],
      },
      bothSides: {
        voucherId: 'TEST-BASIC-004',
        entries: [
          { account: '6811', debit: 500, credit: 500, currency: 'EUR', exchangeRate: 1, description: 'Both sides set' },
        ],
      },
      missingAccount: {
        voucherId: 'TEST-BASIC-005',
        entries: [
          { account: '', debit: 1000, credit: 0, currency: 'EUR', exchangeRate: 1, description: 'Missing account' },
          { account: '28154', debit: 0, credit: 1000, currency: 'EUR', exchangeRate: 1, description: 'OK' },
        ],
      },
    },

    currency: {
      singleCcy: {
        voucherId: 'TEST-CCY-001',
        entries: [
          { account: '411', debit: 5000, credit: 0, transactionCurrency: 'EUR', exchangeRate: 1 },
          { account: '701', debit: 0, credit: 5000, transactionCurrency: 'EUR', exchangeRate: 1 },
        ],
      },
      multiCcy: {
        voucherId: 'TEST-CCY-002',
        entries: [
          { account: '411', debit: 10000, credit: 0, transactionCurrency: 'USD', exchangeRate: 0.92 },
          { account: '701', debit: 0, credit: 9200, transactionCurrency: 'EUR', exchangeRate: 1 },
        ],
      },
      missingRate: {
        voucherId: 'TEST-CCY-003',
        entries: [
          { account: '411', debit: 5000, credit: 0, transactionCurrency: 'USD', exchangeRate: 1 },
          { account: '701', debit: 0, credit: 5000, transactionCurrency: 'USD', exchangeRate: 1 },
        ],
      },
      invalidCcy: {
        voucherId: 'TEST-CCY-004',
        entries: [
          { account: '411', debit: 5000, credit: 0, currency: 'XYZ', exchangeRate: 1.5 },
          { account: '701', debit: 0, credit: 5000, currency: 'XYZ', exchangeRate: 1.5 },
        ],
      },
    },

    fx: {
      realizedGain: {
        voucherId: 'TEST-FX-001',
        entries: [
          {
            account: '411', debit: 50000, credit: 0,
            transactionCurrency: 'USD', exchangeRate: 0.90,
            spotRate: 0.95, isSettled: true,
          },
          {
            account: '512', debit: 0, credit: 50000,
            transactionCurrency: 'USD', exchangeRate: 0.90,
            spotRate: 0.95, isSettled: true,
          },
        ],
      },
      unrealizedLoss: {
        voucherId: 'TEST-FX-002',
        entries: [
          {
            account: '401', debit: 0, credit: 30000,
            transactionCurrency: 'GBP', exchangeRate: 1.17,
            spotRate: 1.22, isSettled: false,
          },
          {
            account: '411', debit: 30000, credit: 0,
            transactionCurrency: 'GBP', exchangeRate: 1.17,
            spotRate: 1.22, isSettled: false,
          },
        ],
      },
      neutral: {
        voucherId: 'TEST-FX-003',
        entries: [
          {
            account: '411', debit: 1000, credit: 0,
            transactionCurrency: 'USD', exchangeRate: 1.00,
            spotRate: 1.00, isSettled: false,
          },
          {
            account: '701', debit: 0, credit: 1000,
            transactionCurrency: 'USD', exchangeRate: 1.00,
            spotRate: 1.00, isSettled: false,
          },
        ],
      },
    },
  };
}

// ─── Individual test runners ──────────────────────────────────────────────────

function _pass(name, detail) { return { name, status: 'PASS', detail }; }
function _fail(name, expected, got, detail) { return { name, status: 'FAIL', expected, got, detail }; }
function _skip(name, reason) { return { name, status: 'SKIP', reason }; }

function runValidationTests(data) {
  const results = [];

  // Balanced voucher → no errors
  const b1 = validateVoucher(data.basic.balanced, 'EUR');
  results.push(
    b1.valid
      ? _pass('Balanced voucher passes validation', `${b1.totalDebit} DR = ${b1.totalCredit} CR`)
      : _fail('Balanced voucher passes validation', 'valid=true', 'valid=false', JSON.stringify(b1.errors))
  );

  // Unbalanced voucher → errors
  const b2 = validateVoucher(data.basic.unbalanced, 'EUR');
  const hasBalanceErr = b2.errors.some(e => e.field === 'balance');
  results.push(
    hasBalanceErr
      ? _pass('Unbalanced voucher triggers error', `imbalance=${b2.imbalance}`)
      : _fail('Unbalanced voucher triggers error', 'balance error', 'no balance error', JSON.stringify(b2.errors))
  );

  // Zero amount → warning, not error
  const b3 = validateVoucher(data.basic.zeroAmount, 'EUR');
  const hasZeroWarn = b3.warnings.some(w => w.field === 'amount');
  results.push(
    hasZeroWarn
      ? _pass('Zero-amount line triggers warning only', '')
      : _fail('Zero-amount line triggers warning only', 'amount warning', 'no warning', JSON.stringify(b3.warnings))
  );

  // Both sides set on one line → error
  const b4 = validateVoucher(data.basic.bothSides, 'EUR');
  const hasBothErr = b4.errors.some(e => e.field === 'amount');
  results.push(
    hasBothErr
      ? _pass('Both-sided line triggers error', '')
      : _fail('Both-sided line triggers error', 'amount error', 'no error', JSON.stringify(b4.errors))
  );

  // Missing account → error
  const b5 = validateVoucher(data.basic.missingAccount, 'EUR');
  const hasAcctErr = b5.errors.some(e => e.field === 'account');
  results.push(
    hasAcctErr
      ? _pass('Missing account triggers error', '')
      : _fail('Missing account triggers error', 'account error', 'no error', JSON.stringify(b5.errors))
  );

  // Foreign currency with rate = 1 → warning
  const c3 = validateVoucher(data.currency.missingRate, 'EUR');
  const hasRateWarn = c3.warnings.some(w => w.field === 'exchangeRate');
  results.push(
    hasRateWarn
      ? _pass('Foreign currency with rate=1 triggers warning', '')
      : _fail('Foreign currency with rate=1 triggers warning', 'exchangeRate warning', 'no warning', JSON.stringify(c3.warnings))
  );

  // Unknown currency → warning
  const c4 = validateVoucher(data.currency.invalidCcy, 'EUR');
  const hasCcyWarn = c4.warnings.some(w => w.field === 'currency');
  results.push(
    hasCcyWarn
      ? _pass('Unknown currency code triggers warning', '')
      : _fail('Unknown currency code triggers warning', 'currency warning', 'no warning', JSON.stringify(c4.warnings))
  );

  return results;
}

function runFxTests(data) {
  const results = [];

  // Realized gain: DR line, rate goes up (0.90 → 0.95)
  const gainLine = data.fx.realizedGain.entries[0];
  const enriched = enrichLineWithFx(gainLine, gainLine.spotRate, gainLine.isSettled, 'EUR');
  results.push(
    enriched.gainOrLoss === 'gain' && enriched.type === 'realized'
      ? _pass('DR line + rate increase = realized gain', `econFxDiff=${enriched.economicFxDiff}`)
      : _fail('DR line + rate increase = realized gain', 'gainOrLoss=gain, type=realized', `${enriched.gainOrLoss}, ${enriched.type}`, JSON.stringify({ econFxDiff: enriched.economicFxDiff }))
  );

  // Gain amount: 50000 * (0.95 - 0.90) = 2500
  const expectedGain = parseFloat((50000 * (0.95 - 0.90)).toFixed(2));
  results.push(
    Math.abs(enriched.economicFxDiff - expectedGain) < 0.01
      ? _pass('Gain amount calculation correct', `expected=${expectedGain}, got=${enriched.economicFxDiff}`)
      : _fail('Gain amount calculation correct', `economicFxDiff=${expectedGain}`, `economicFxDiff=${enriched.economicFxDiff}`, '')
  );

  // Unrealized loss: CR line, rate goes up (1.17 → 1.22)
  const lossLine = data.fx.unrealizedLoss.entries[0];
  const enrichedLoss = enrichLineWithFx(lossLine, lossLine.spotRate, lossLine.isSettled, 'EUR');
  results.push(
    enrichedLoss.gainOrLoss === 'loss' && enrichedLoss.type === 'unrealized'
      ? _pass('CR line + rate increase = unrealized loss', `econFxDiff=${enrichedLoss.economicFxDiff}`)
      : _fail('CR line + rate increase = unrealized loss', 'gainOrLoss=loss, type=unrealized', `${enrichedLoss.gainOrLoss}, ${enrichedLoss.type}`, '')
  );

  // Neutral: rate unchanged
  const neutralLine = data.fx.neutral.entries[0];
  const enrichedNeutral = enrichLineWithFx(neutralLine, neutralLine.spotRate, false, 'EUR');
  results.push(
    enrichedNeutral.gainOrLoss === 'neutral'
      ? _pass('Unchanged rate = neutral FX', '')
      : _fail('Unchanged rate = neutral FX', 'gainOrLoss=neutral', enrichedNeutral.gainOrLoss, '')
  );

  // Journal suggestion exists for gain
  results.push(
    enriched.journalSuggestion !== null && enriched.journalSuggestion.entries.length === 2
      ? _pass('Gain journal suggestion generated with 2 entries', '')
      : _fail('Gain journal suggestion generated', '2-entry suggestion', JSON.stringify(enriched.journalSuggestion), '')
  );

  // Same-currency line → no FX exposure
  const sameCcyLine = { account: '411', debit: 1000, credit: 0, transactionCurrency: 'EUR', exchangeRate: 1 };
  const noFx = enrichLineWithFx(sameCcyLine, 1, false, 'EUR');
  results.push(
    noFx.hasFxExposure === false
      ? _pass('Same-currency line has no FX exposure', '')
      : _fail('Same-currency line has no FX exposure', 'hasFxExposure=false', noFx.hasFxExposure, '')
  );

  return results;
}

function runCurrencyTests(data) {
  const results = [];

  // Single-currency voucher: isMultiCurrency = false
  const s1 = analyseVoucherCurrency(data.currency.singleCcy, 'EUR');
  results.push(
    s1.isMultiCurrency === false
      ? _pass('Single-currency voucher: isMultiCurrency = false', '')
      : _fail('Single-currency voucher: isMultiCurrency = false', false, s1.isMultiCurrency, '')
  );

  // Multi-currency voucher: isMultiCurrency = true
  const m1 = analyseVoucherCurrency(data.currency.multiCcy, 'EUR');
  results.push(
    m1.isMultiCurrency === true
      ? _pass('Multi-currency voucher: isMultiCurrency = true', '')
      : _fail('Multi-currency voucher: isMultiCurrency = true', true, m1.isMultiCurrency, '')
  );

  return results;
}

// ─── Full test suite ──────────────────────────────────────────────────────────

function runAllTests() {
  logger.info('TestEngine', 'Starting full test suite');
  const startTime = Date.now();

  const data     = generateTestData();
  const allTests = [
    ...runValidationTests(data),
    ...runFxTests(data),
    ...runCurrencyTests(data),
  ];

  const pass = allTests.filter(t => t.status === 'PASS').length;
  const fail = allTests.filter(t => t.status === 'FAIL').length;
  const skip = allTests.filter(t => t.status === 'SKIP').length;
  const duration = Date.now() - startTime;

  const overallStatus = fail > 0 ? 'FAIL' : 'PASS';
  logger.info('TestEngine', `Tests complete: ${pass} passed, ${fail} failed, ${skip} skipped (${duration}ms)`);

  return {
    overallStatus,
    pass,
    fail,
    skip,
    total: allTests.length,
    durationMs: duration,
    tests: allTests,
    failedTests: allTests.filter(t => t.status === 'FAIL'),
  };
}

module.exports = { runAllTests, generateTestData };
