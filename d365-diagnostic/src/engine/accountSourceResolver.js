'use strict';

/**
 * Account Source Resolver  (module-aware rewrite)
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministically identifies which D365 configuration element is the origin
 * of any journal-line account, now driven entirely by the per-module plugin packs
 * loaded via moduleLoader.
 *
 * Resolution algorithm (unchanged):
 *   1. Load priority list from module rules[transactionType][side]
 *   2. For each source in the list (in priority order):
 *        a. Check conditional requirements (country / GAAP)  → SKIP_CONDITIONAL
 *        b. Match account against canonical prefixes          → MATCH (High)
 *        c. Match account against broad prefixes              → MATCH (Medium)
 *        d. Otherwise                                         → SKIP
 *   3. Return first MATCH with full trace; fall back to LedgerMapping.
 *
 * Universal Accounting Model output per resolution:
 *   { module, transactionType, postingType, accountSource,
 *     configElement, mainAccount, confidence, d365Path, trace }
 */

const { moduleLoader } = require('./moduleLoader');

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the D365 source for a single journal-line account.
 *
 * @param {object} params
 * @param {string} params.module           - 'lease' | 'fixed_assets' | 'pma' | …
 * @param {string} params.transactionType  - key from module's transactions.json
 * @param {string} params.side             - 'debit' | 'credit'
 * @param {string} params.account          - Account code (e.g. '6618', '401')
 * @param {object} params.context          - Full diagnostic context { country, gaap, pma, … }
 * @returns {SourceResult}
 */
function resolveAccountSource({ module, transactionType, side, account, context }) {
  const mod         = moduleLoader.loadModule(module || 'lease');
  const defs        = mod.sources;
  const countryCode = context?.country === 'FR' ? 'FR' : 'US';
  const trace       = [];

  // Build priority list: rules[transactionType][side], fall back to Manual/empty
  const ruleSet      = mod.rules[transactionType] || mod.rules['Manual'] || {};
  const priorityList = ruleSet[side] || [];

  for (const sourceName of priorityList) {
    const def = defs[sourceName];
    if (!def) continue;

    // ── Conditional check ────────────────────────────────────────────────────
    const cond = checkConditional(sourceName, def, context);
    if (!cond.pass) {
      trace.push({ source: sourceName, result: 'SKIP_CONDITIONAL', reason: cond.reason, d365Path: def.d365Path });
      continue;
    }

    // ── Prefix match (canonical → broad) ─────────────────────────────────────
    const match = matchAccountToSource(account, def, countryCode);
    if (match.matched) {
      trace.push({ source: sourceName, result: 'MATCH', field: match.field, reason: match.reason, d365Path: def.d365Path });
      return buildResult(sourceName, def, match, trace, { module, transactionType, side, account });
    }
    trace.push({ source: sourceName, result: 'SKIP', reason: match.reason, d365Path: def.d365Path });
  }

  // ── Fallback: LedgerMapping ───────────────────────────────────────────────
  const fallbackDef   = defs['LedgerMapping'];
  const fallbackField = 'Main Account (Direct GL)';
  trace.push({
    source:   'LedgerMapping',
    result:   'MATCH',
    field:    fallbackField,
    reason:   'Fallback — no specific posting profile source matched.',
    d365Path: fallbackDef?.d365Path,
  });
  return buildResult('LedgerMapping', fallbackDef, {
    field:      fallbackField,
    confidence: 'Low',
    reason:     'No posting profile source matched; account is a direct GL reference.',
  }, trace, { module, transactionType, side, account });
}

/**
 * Resolve both the ACTUAL and EXPECTED account sources and compare them.
 */
function resolveAccountPair({ module, transactionType, side, actualAccount, expectedAccount, context }) {
  const actual   = resolveAccountSource({ module, transactionType, side, account: actualAccount,  context });
  const expected = resolveAccountSource({ module, transactionType, side, account: expectedAccount, context });
  return { actual, expected, comparison: compareSourceResults(actual, expected, actualAccount, expectedAccount) };
}

/**
 * Resolve every entry in a voucher and return a source map keyed by entry index.
 */
function resolveVoucherSources(voucher, transactionType, context) {
  return voucher.entries.map((entry, idx) => ({
    entryIndex: idx,
    account:    entry.account,
    side:       entry.debit > 0 ? 'debit' : 'credit',
    source:     resolveAccountSource({
      module:          context.module,
      transactionType: transactionType || 'Manual',
      side:            entry.debit > 0 ? 'debit' : 'credit',
      account:         entry.account,
      context,
    }),
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════════════

function checkConditional(sourceName, def, context) {
  if (!def.conditionalOn) return { pass: true };
  for (const [key, required] of Object.entries(def.conditionalOn)) {
    if (context?.[key] !== required) {
      return {
        pass:   false,
        reason: `${sourceName} requires ${key}="${required}" (current: "${context?.[key]}"). Source skipped.`,
      };
    }
  }
  return { pass: true };
}

function matchAccountToSource(account, def, countryCode) {
  for (const [fieldName, fieldDef] of Object.entries(def.fields || {})) {
    const canonicalPrefixes = getCountryPrefixes(fieldDef.canonicalPrefixes, countryCode);
    for (const prefix of canonicalPrefixes) {
      if (prefix && account.startsWith(prefix)) {
        return { matched: true, field: fieldName, confidence: 'High',
                 reason: `Account ${account} matches canonical prefix "${prefix}" in field "${fieldName}"` };
      }
    }
    const broadPrefixes = getCountryPrefixes(fieldDef.accountPrefixes, countryCode);
    for (const prefix of broadPrefixes) {
      if (prefix && account.startsWith(prefix) && !canonicalPrefixes.includes(prefix)) {
        return { matched: true, field: fieldName, confidence: 'Medium',
                 reason: `Account ${account} matches broad prefix "${prefix}" in field "${fieldName}" — may indicate a misconfigured account value` };
      }
    }
  }
  return { matched: false, reason: `Account ${account} did not match any field in this source definition` };
}

function getCountryPrefixes(prefixMap, countryCode) {
  if (!prefixMap) return [];
  return [...(prefixMap[countryCode] || []), ...(prefixMap['*'] || [])].filter(Boolean);
}

function buildResult(sourceName, def, match, trace, modelCtx = {}) {
  return {
    // Universal Accounting Model fields
    module:          modelCtx.module          || null,
    transactionType: modelCtx.transactionType || null,
    postingType:     modelCtx.side            || null,
    accountSource:   sourceName,
    configElement:   match.field              || null,
    mainAccount:     modelCtx.account         || null,
    // Resolution detail
    source:      sourceName,
    field:       match.field,
    confidence:  match.confidence,
    d365Path:    def?.d365Path   || 'N/A',
    description: def?.description || '',
    matchReason: match.reason,
    trace,
  };
}

function compareSourceResults(actual, expected, actualAccount, expectedAccount) {
  if (!actual || !expected) return null;
  const sameSource = actual.source === expected.source;
  const sameField  = actual.field  === expected.field;

  if (sameSource && sameField) {
    return {
      sameSource: true, sameField: true, severity: 'config_value',
      explanation:    `Both accounts derive from ${actual.source} → "${actual.field}". ` +
                      `The field is configured with ${actualAccount} but should use ${expectedAccount}.`,
      actionRequired: `Open ${actual.d365Path}. Update "${actual.field}" from ${actualAccount} to ${expectedAccount}.`,
    };
  }
  if (sameSource && !sameField) {
    return {
      sameSource: true, sameField: false, severity: 'config_field',
      explanation:    `Both accounts derive from ${actual.source} but from different fields. ` +
                      `Actual: "${actual.field}" (${actualAccount}). Expected: "${expected.field}" (${expectedAccount}).`,
      actionRequired: `Review both "${actual.field}" and "${expected.field}" in ${actual.d365Path}.`,
    };
  }
  return {
    sameSource: false, sameField: false, severity: 'wrong_source',
    explanation:    `Source mismatch. ${actualAccount} derives from ${actual.source} ` +
                    `("${actual.field}", confidence: ${actual.confidence}). ` +
                    `Expected ${expectedAccount} should derive from ${expected.source} ("${expected.field}"). ` +
                    `This indicates the transaction used the wrong D365 posting workflow.`,
    actionRequired: `1. Verify ${expected.d365Path} is configured with ${expectedAccount}. ` +
                    `2. Check ${actual.d365Path} — ${actualAccount} belongs here, not in this transaction type. ` +
                    `3. Confirm the transaction followed the correct D365 module workflow.`,
  };
}

function confidenceLabel(confidence) {
  return { High: '● High', Medium: '◐ Medium', Low: '○ Low' }[confidence] || confidence;
}

function traceToText(trace) {
  return trace.map(t => {
    if (t.result === 'MATCH')            return `✓ ${t.source} → MATCH  [${t.field}]`;
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
