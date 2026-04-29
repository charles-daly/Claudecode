'use strict';

/**
 * postingTraceEngine.js
 * Pure utility — no file I/O.
 * Builds a structured, human-readable posting trace from a voucher entry,
 * its scenario context, resolved account source, and GAAP mapping analysis.
 */

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function _formatAmount(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _padLabel(label, width) {
  return label.padEnd(width, ' ');
}

const LABEL_WIDTH = 18;
const ARROW       = ' → ';

function _line(label, value) {
  return `${_padLabel(label, LABEL_WIDTH)}${ARROW}${value}`;
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

/**
 * Builds a posting trace object for a single voucher entry.
 *
 * @param {Object} opts
 * @param {Object} opts.entry               Voucher line: { usAccount, frAccount, account, description, debit, credit, … }
 * @param {Object} opts.scenario            Scenario descriptor: { description, transactionType, … }
 * @param {Object} opts.context             Context: { module, gaap, … }
 * @param {Object|null} opts.sourceResolution  Result from accountSourceResolver
 * @param {Object|null} opts.mappingAnalysis   Result from gaapMappingEngine.analyseAccountMapping()
 * @returns {Object}
 */
function buildPostingTrace(opts) {
  const {
    entry             = {},
    scenario          = {},
    context           = {},
    sourceResolution  = null,
    mappingAnalysis   = null,
  } = opts || {};

  // ── Basic fields ──────────────────────────────────────────────────────────
  const businessEvent   = scenario.description    || '';
  const module          = context.module          || '';
  const transactionType = scenario.transactionType || '';

  // Account resolution: prefer explicit usAccount, fall back to account
  const usAccount   = entry.usAccount || entry.account || '';
  const frAccount   = entry.frAccount || '';
  const description = entry.description || '';

  // Determine posting type and amount
  const debitVal  = parseFloat(entry.debit)  || 0;
  const creditVal = parseFloat(entry.credit) || 0;
  let   postingType;
  let   amount;

  if (debitVal !== 0) {
    postingType = 'debit';
    amount      = debitVal;
  } else if (creditVal !== 0) {
    postingType = 'credit';
    amount      = creditVal;
  } else {
    postingType = 'debit';
    amount      = 0;
  }

  // ── Account source ────────────────────────────────────────────────────────
  const accountSource = sourceResolution
    ? {
        source:     sourceResolution.source     || '',
        field:      sourceResolution.field      || '',
        d365Path:   sourceResolution.d365Path   || '',
        confidence: sourceResolution.confidence || '',
      }
    : null;

  // ── GAAP mapping (legacy analyseAccountMapping path) ─────────────────────
  const gaapMapping = (mappingAnalysis && mappingAnalysis.mappingFound)
    ? mappingAnalysis
    : null;

  // ── Dual-GAAP inline analysis (from gaapAnalysis on the entry itself) ────
  const gaapAnalysis = entry.gaapAnalysis || null;

  // ── Trace text ────────────────────────────────────────────────────────────
  const lines = [];

  lines.push(_line('Business Event',   businessEvent));
  lines.push(_line('Module',           module ? module.toUpperCase() : ''));
  lines.push(_line('Transaction Type', transactionType));

  const drCr         = postingType === 'debit' ? 'DR' : 'CR';
  const formattedAmt = _formatAmount(amount);
  lines.push(_line('Posting Type', `${drCr} ${formattedAmt}`));

  if (accountSource) {
    const srcLine = `${accountSource.source} → "${accountSource.field}"  (${accountSource.confidence} confidence)`;
    lines.push(_line('Account Source', srcLine));
  } else {
    lines.push(_line('Account Source', 'Not resolved'));
  }

  // US account line
  lines.push(_line('US Account', usAccount || '—'));

  // ── Dual-GAAP trace: US → Mapping → FR ───────────────────────────────────
  if (gaapAnalysis) {
    const status = gaapAnalysis.mappingStatus || 'unknown';

    if (status === 'correct') {
      lines.push(_line(
        'GAAP Trace',
        `${gaapAnalysis.usAccount} (US) → [${gaapAnalysis.mappedType || 'mapped'}] → ${gaapAnalysis.frAccount} (FR)  ✓ Correct`
      ));
      if (gaapAnalysis.mappedDescription) {
        lines.push(_line('Mapping Desc.', gaapAnalysis.mappedDescription));
      }
    } else if (status === 'incorrect') {
      lines.push(_line(
        'GAAP Trace',
        `${gaapAnalysis.usAccount} (US) → [${gaapAnalysis.mappedType || 'mapped'}] → ${gaapAnalysis.frAccount} (FR)  ✗ Incorrect (expected: ${gaapAnalysis.expectedFrAccount})`
      ));
      if (gaapAnalysis.classificationMismatch) {
        lines.push(_line(
          'Classification',
          `${gaapAnalysis.frClassification} used — ${gaapAnalysis.expFrClassification} expected`
        ));
      }
    } else if (status === 'missing') {
      lines.push(_line(
        'GAAP Trace',
        `${gaapAnalysis.usAccount} (US) → [no mapping] → ${gaapAnalysis.frAccount || '?'} (FR)  ⚠ No mapping defined`
      ));
    } else if (status === 'missing_fr') {
      lines.push(_line('GAAP Trace', `${gaapAnalysis.usAccount} (US) → [?] → (FR missing)  ⚠`));
    } else if (status === 'missing_us') {
      lines.push(_line('GAAP Trace', `(US missing) → [?] → ${gaapAnalysis.frAccount || '?'} (FR)  ⚠`));
    }

    if (gaapAnalysis.rootCause) {
      lines.push(_line('Root Cause', gaapAnalysis.rootCause.replace(/_/g, ' ')));
    }
    if (gaapAnalysis.fix) {
      lines.push(_line('Recommended Fix', gaapAnalysis.fix));
    }
  } else if (frAccount) {
    lines.push(_line('GAAP Trace', `${usAccount} (US) → ${frAccount} (FR)`));
  } else if (gaapMapping) {
    const mappingLine =
      `${gaapMapping.usAccount} (US) ↔ ${gaapMapping.frAccount} (FR)  ${gaapMapping.description || ''}`.trim();
    lines.push(_line('GAAP Mapping', mappingLine));
    lines.push(_line('Mapping Status', (gaapMapping.mappingStatus || 'unknown').toUpperCase()));
  } else {
    lines.push(_line('GAAP Trace', usAccount ? `No GAAP mapping for account ${usAccount}` : 'No GAAP mapping'));
  }

  // Selected account
  const selectedLine = description ? `${usAccount}  (${description})` : usAccount;
  lines.push(_line('Selected Account', selectedLine));
  if (frAccount) {
    lines.push(_line('FR Account', frAccount));
  }

  // Currency / exchange rate
  if (entry.currency && entry.currency !== 'EUR') {
    const rateStr = entry.exchangeRate && entry.exchangeRate !== 1
      ? `  @ ${entry.exchangeRate}`
      : '';
    lines.push(_line('Currency', `${entry.currency}${rateStr}`));
  }

  const traceText = lines.join('\n');

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    businessEvent,
    module,
    transactionType,
    postingType,
    usAccount,
    frAccount,
    account: usAccount,
    description,
    amount,
    currency:     entry.currency     || 'EUR',
    exchangeRate: entry.exchangeRate || 1,
    accountSource,
    gaapMapping,
    gaapAnalysis,
    traceText,
  };
}

module.exports = { buildPostingTrace };
