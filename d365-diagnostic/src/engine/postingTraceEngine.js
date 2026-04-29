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

/**
 * Formats a numeric amount with thousands separators and 2 decimal places.
 * @param {number|string} value
 * @returns {string}
 */
function _formatAmount(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Left-pads a label string so that all labels align to a fixed column width.
 * @param {string} label
 * @param {number} width
 * @returns {string}
 */
function _padLabel(label, width) {
  return label.padEnd(width, ' ');
}

// Column width for all labels (longest is "Transaction Type" = 16 chars + " → " = 19)
const LABEL_WIDTH = 16;
const ARROW       = ' → '; // ' → '

/**
 * Builds one line of the trace text.
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
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
 * @param {Object} opts.entry               Voucher line: { account, description, debit, credit, ... }
 * @param {Object} opts.scenario            Scenario descriptor: { description, transactionType, ... }
 * @param {Object} opts.context             Context: { module, gaap, ... }
 * @param {Object|null} opts.sourceResolution  Result from accountSourceResolver:
 *                                          { source, field, d365Path, confidence } or null
 * @param {Object|null} opts.mappingAnalysis   Result from gaapMappingEngine.analyseAccountMapping() or null
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
  const businessEvent   = scenario.description   || '';
  const module          = context.module         || '';
  const transactionType = scenario.transactionType || '';
  const account         = entry.account          || '';
  const description     = entry.description      || '';

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

  // ── GAAP mapping ──────────────────────────────────────────────────────────
  const gaapMapping = (mappingAnalysis && mappingAnalysis.mappingFound)
    ? mappingAnalysis
    : null;

  // ── Trace text ────────────────────────────────────────────────────────────
  const lines = [];

  // Business Event
  lines.push(_line('Business Event', businessEvent));

  // Module
  lines.push(_line('Module', module ? module.toUpperCase() : ''));

  // Transaction Type
  lines.push(_line('Transaction Type', transactionType));

  // Posting Type — DR/CR + formatted amount
  const drCr         = postingType === 'debit' ? 'DR' : 'CR';
  const formattedAmt = _formatAmount(amount);
  lines.push(_line('Posting Type', `${drCr} ${formattedAmt}`));

  // Account Source
  if (accountSource) {
    const srcLine = `${accountSource.source} → "${accountSource.field}"  (${accountSource.confidence} confidence)`;
    lines.push(_line('Account Source', srcLine));
  } else {
    lines.push(_line('Account Source', 'Not resolved'));
  }

  // Selected Account
  const selectedLine = description
    ? `${account}  (${description})`
    : account;
  lines.push(_line('Selected Account', selectedLine));

  // GAAP Mapping lines
  if (gaapMapping) {
    const mappingLine =
      `${gaapMapping.usAccount} (US) ↔ ${gaapMapping.frAccount} (FR)  ${gaapMapping.description || ''}`.trim();
    lines.push(_line('GAAP Mapping', mappingLine));

    const statusLabel = (gaapMapping.mappingStatus || 'unknown').toUpperCase();
    lines.push(_line('Mapping Status', statusLabel));
  } else {
    // No mapping found — show informational line
    const noMapMsg = account
      ? `No mapping found for account ${account}`
      : 'No mapping found';
    lines.push(_line('GAAP Mapping', noMapMsg));
  }

  const traceText = lines.join('\n');

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    businessEvent,
    module,
    transactionType,
    postingType,
    account,
    description,
    amount,
    accountSource,
    gaapMapping,
    traceText,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildPostingTrace,
};
