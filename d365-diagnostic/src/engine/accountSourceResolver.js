'use strict';

/**
 * Account Source Resolver
 * ──────────────────────────────────────────────────────────────────────────────
 * Deterministic, rule-based engine that answers:
 *   "Which D365 configuration element is the origin of this journal-line account?"
 *
 * Resolution algorithm:
 *   1. Load priority list from accountSourceRules[module][transactionType][side]
 *   2. For each source in the list (in order):
 *        a. Check conditional requirements (country / GAAP)  → SKIP_CONDITIONAL if failed
 *        b. Match account against canonical prefixes          → MATCH (High) if found
 *        c. Match account against broad prefixes              → MATCH (Medium) if found
 *        d. Otherwise                                         → SKIP
 *   3. Return first MATCH with full trace; fall back to LedgerMapping if nothing matches.
 */

const fs   = require('fs');
const path = require('path');

// ─── Lazy-loaded rule tables ──────────────────────────────────────────────────
let _rules = null;
let _defs  = null;

function getRules() {
  if (!_rules) {
    const p = resolveDataPath('accountSourceRules.json');
    _rules = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return _rules;
}

function getDefs() {
  if (!_defs) {
    const p = resolveDataPath('accountSourceDefinitions.json');
    _defs = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  return _defs;
}

function resolveDataPath(filename) {
  const isDev = process.env.NODE_ENV !== 'production';
  const base  = isDev
    ? path.join(__dirname, '..', '..', 'data')
    : path.join(process.resourcesPath, 'data');
  return path.join(base, filename);
}

// ════════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the D365 source for a single journal-line account.
 *
 * @param {object} params
 * @param {string} params.module           - 'lease' | 'fixed_assets'
 * @param {string} params.transactionType  - 'depreciation' | 'interest_accrual' | …
 * @param {string} params.side             - 'debit' | 'credit'
 * @param {string} params.account          - Account code (e.g. '6618', '661', '401')
 * @param {object} params.context          - Full diagnostic context { country, gaap, pma, … }
 *
 * @returns {SourceResult} Full resolution with trace array
 */
function resolveAccountSource({ module, transactionType, side, account, context }) {
  const rules        = getRules();
  const defs         = getDefs();
  const countryCode  = context?.country === 'FR' ? 'FR' : 'US';
  const trace        = [];

  // Get priority list for this (module, transactionType, side)
  const ruleSet    = rules[module]?.[transactionType] || rules['unknown']?.['unknown'];
  const priorityList = ruleSet?.[side] || [];

  for (const sourceName of priorityList) {
    const def = defs[sourceName];
    if (!def) continue;

    // ── Conditional check (country / GAAP requirements) ────────────────────
    const cond = checkConditional(sourceName, def, context);
    if (!cond.pass) {
      trace.push({
        source:    sourceName,
        result:    'SKIP_CONDITIONAL',
        reason:    cond.reason,
        d365Path:  def.d365Path,
      });
      continue;
    }

    // ── Account prefix matching (canonical → broad) ─────────────────────────
    const match = matchAccountToSource(account, def, countryCode);

    if (match.matched) {
      trace.push({
        source:   sourceName,
        result:   'MATCH',
        field:    match.field,
        reason:   match.reason,
        d365Path: def.d365Path,
      });
      return buildResult(sourceName, def, match, trace);
    } else {
      trace.push({
        source:   sourceName,
        result:   'SKIP',
        reason:   match.reason,
        d365Path: def.d365Path,
      });
    }
  }

  // ── Fallback: LedgerMapping ───────────────────────────────────────────────
  const fallbackDef = defs['LedgerMapping'];
  trace.push({
    source:   'LedgerMapping',
    result:   'MATCH',
    field:    'Main Account (Direct GL)',
    reason:   'Fallback — no specific posting profile source matched. Account may derive from a manual journal or free-text entry.',
    d365Path: fallbackDef?.d365Path,
  });

  return buildResult('LedgerMapping', fallbackDef, {
    field:      'Main Account (Direct GL)',
    confidence: 'Low',
    reason:     'No posting profile source matched; account is a direct GL reference.',
  }, trace);
}

/**
 * Resolve both the ACTUAL and EXPECTED account sources and compare them.
 * Used to produce precise root-cause explanations when accounts differ.
 *
 * @param {object} params
 * @param {string} params.module
 * @param {string} params.transactionType
 * @param {string} params.side
 * @param {string} params.actualAccount      - Account that was posted
 * @param {string} params.expectedAccount    - Representative expected account (first canonical prefix)
 * @param {object} params.context
 *
 * @returns {{ actual: SourceResult, expected: SourceResult, comparison: Comparison }}
 */
function resolveAccountPair({ module, transactionType, side, actualAccount, expectedAccount, context }) {
  const actual   = resolveAccountSource({ module, transactionType, side, account: actualAccount,  context });
  const expected = resolveAccountSource({ module, transactionType, side, account: expectedAccount, context });
  const comparison = compareSourceResults(actual, expected, actualAccount, expectedAccount);
  return { actual, expected, comparison };
}

/**
 * Resolve every entry in a voucher and return a source map keyed by entry index.
 *
 * @param {object}   voucher    - Voucher object from excelParser
 * @param {string}   transactionType
 * @param {object}   context
 * @returns {Array<{entryIndex, account, side, source: SourceResult}>}
 */
function resolveVoucherSources(voucher, transactionType, context) {
  return voucher.entries.map((entry, idx) => ({
    entryIndex: idx,
    account:    entry.account,
    side:       entry.debit > 0 ? 'debit' : 'credit',
    source:     resolveAccountSource({
      module:          context.module,
      transactionType: transactionType || 'unknown',
      side:            entry.debit > 0 ? 'debit' : 'credit',
      account:         entry.account,
      context,
    }),
  }));
}

// ════════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════════════════

function checkConditional(sourceName, def, context) {
  if (!def.conditionalOn) return { pass: true };

  for (const [key, required] of Object.entries(def.conditionalOn)) {
    const actual = context?.[key];
    if (actual !== required) {
      return {
        pass:   false,
        reason: `${sourceName} requires ${key}="${required}" (current: "${actual}"). Source skipped.`,
      };
    }
  }
  return { pass: true };
}

function matchAccountToSource(account, def, countryCode) {
  for (const [fieldName, fieldDef] of Object.entries(def.fields || {})) {
    // ── Canonical (High confidence) ──────────────────────────────────────────
    const canonicalPrefixes = getCountryPrefixes(fieldDef.canonicalPrefixes, countryCode);
    for (const prefix of canonicalPrefixes) {
      if (prefix && account.startsWith(prefix)) {
        return {
          matched:    true,
          field:      fieldName,
          confidence: 'High',
          reason:     `Account ${account} matches canonical prefix "${prefix}" in field "${fieldName}"`,
        };
      }
    }

    // ── Broad (Medium confidence) ─────────────────────────────────────────────
    const broadPrefixes = getCountryPrefixes(fieldDef.accountPrefixes, countryCode);
    for (const prefix of broadPrefixes) {
      if (prefix && account.startsWith(prefix)) {
        // Avoid double-counting: skip if this prefix was already in canonical
        if (canonicalPrefixes.includes(prefix)) continue;
        return {
          matched:    true,
          field:      fieldName,
          confidence: 'Medium',
          reason:     `Account ${account} matches broad prefix "${prefix}" in field "${fieldName}" — may indicate a misconfigured account value in this field`,
        };
      }
    }
  }

  return {
    matched: false,
    reason:  `Account ${account} did not match any field in this source definition`,
  };
}

function getCountryPrefixes(prefixMap, countryCode) {
  if (!prefixMap) return [];
  const specific = prefixMap[countryCode] || [];
  const wildcard = prefixMap['*']        || [];
  return [...specific, ...wildcard].filter(Boolean);
}

function buildResult(sourceName, def, match, trace) {
  return {
    source:      sourceName,
    field:       match.field,
    confidence:  match.confidence,
    d365Path:    def?.d365Path  || 'N/A',
    description: def?.description || '',
    matchReason: match.reason,
    trace,
  };
}

// ── Source comparison ─────────────────────────────────────────────────────────
function compareSourceResults(actual, expected, actualAccount, expectedAccount) {
  if (!actual || !expected) return null;

  const sameSource = actual.source === expected.source;
  const sameField  = actual.field  === expected.field;

  if (sameSource && sameField) {
    return {
      sameSource:     true,
      sameField:      true,
      severity:       'config_value',
      explanation:    `Both accounts derive from the same source: ${actual.source} → "${actual.field}". ` +
                      `The field is configured with account ${actualAccount} but should use ${expectedAccount}.`,
      actionRequired: `Open ${actual.d365Path}. ` +
                      `Update the "${actual.field}" field from ${actualAccount} to ${expectedAccount}.`,
    };
  }

  if (sameSource && !sameField) {
    return {
      sameSource:     true,
      sameField:      false,
      severity:       'config_field',
      explanation:    `Both accounts derive from ${actual.source}, but from different fields. ` +
                      `Actual: "${actual.field}" (${actualAccount}). Expected: "${expected.field}" (${expectedAccount}).`,
      actionRequired: `Review both "${actual.field}" and "${expected.field}" fields in ${actual.d365Path}.`,
    };
  }

  // Different sources — most severe case
  return {
    sameSource:     false,
    sameField:      false,
    severity:       'wrong_source',
    explanation:    `Source mismatch. Account ${actualAccount} derives from ${actual.source} ` +
                    `("${actual.field}", confidence: ${actual.confidence}). ` +
                    `Expected account ${expectedAccount} should derive from ${expected.source} ` +
                    `("${expected.field}"). This indicates the transaction used the wrong D365 posting workflow.`,
    actionRequired: `1. Verify ${expected.d365Path} is configured with ${expectedAccount}. ` +
                    `2. Check ${actual.d365Path} — account ${actualAccount} belongs here, not in this transaction type. ` +
                    `3. Confirm the transaction followed the correct D365 module workflow (not a manual GL journal).`,
  };
}

// ── Confidence label helpers ──────────────────────────────────────────────────
function confidenceLabel(confidence) {
  const map = { High: '● High', Medium: '◐ Medium', Low: '○ Low' };
  return map[confidence] || confidence;
}

function traceToText(trace) {
  return trace.map(t => {
    if (t.result === 'MATCH')           return `✓ ${t.source} → MATCH  [${t.field}]`;
    if (t.result === 'SKIP_CONDITIONAL') return `⊘ ${t.source} → SKIPPED (conditional not met)`;
    return `✗ ${t.source} → SKIPPED`;
  });
}

module.exports = {
  resolveAccountSource,
  resolveAccountPair,
  resolveVoucherSources,
  compareSourceResults,
  confidenceLabel,
  traceToText,
};
