'use strict';

/**
 * gaapValidationEngine.js
 * Dual-GAAP validation and reconciliation engine.
 *
 * Pipeline:
 *   1. Per-entry basic validation (missing accounts, invalid amounts)
 *   2. Per-entry mapping validation (correct / incorrect / missing)
 *   3. Global consistency checks (conflicting US→FR across the file)
 *   4. Per-voucher GAAP reconciliation (structural US vs FR comparison)
 *
 * All lookups are against the live accountMappings.json via gaapMappingEngine.
 * No file I/O beyond that.
 */

const { getAllMappings } = require('./gaapMappingEngine');

// ─── Account classification helpers ──────────────────────────────────────────

// French PCG: classes 6/7 = P&L; classes 1-5 = BS; class 8 = off-balance
function classifyFrAccount(acc) {
  const s = String(acc || '').replace(/\s/g, '');
  if (!s) return 'unknown';
  const first = parseInt(s.charAt(0), 10);
  if (first === 6 || first === 7) return 'P&L';
  if (first >= 1 && first <= 5)   return 'BS';
  if (first === 8)                 return 'Off-balance';
  return 'unknown';
}

// US GAAP: simplified numeric ranges
//   1xxx–3xxx = Assets/Liabilities/Equity (BS)
//   4xxx–8xxx = Revenue/Expenses (P&L)
function classifyUsAccount(acc) {
  const n = parseInt(String(acc || '').replace(/\s/g, ''), 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 100000 && n <= 399999) return 'BS';   // Assets / Liabilities / Equity
  if (n >= 400000 && n <= 899999) return 'P&L';  // Revenue / COGS / Expenses
  // Short codes (<= 9999)
  if (n >= 1000 && n <= 3999)     return 'BS';
  if (n >= 4000 && n <= 8999)     return 'P&L';
  return 'unknown';
}

// ─── Single-entry analysis ────────────────────────────────────────────────────

/**
 * Analyses one entry against the mapping table.
 *
 * Returns the entry with a `gaapAnalysis` property added:
 *   {
 *     mappingStatus: 'correct'|'incorrect'|'missing'|'missing_us'|'missing_fr',
 *     mappingFound:  boolean,
 *     usAccount, frAccount, expectedFrAccount,
 *     mappedType, mappedDescription, mappedModule,
 *     frClassification, usClassification,
 *     gaapMismatch, classificationMismatch,
 *     rootCause: null|'MAPPING_ISSUE'|'CONFIG_ISSUE'|'MANUAL_OVERRIDE',
 *     issue:  null|string,
 *     fix:    null|string,
 *   }
 */
function _analyseEntry(entry, mappings) {
  const usAccount = String(entry.usAccount || entry.account || '').trim();
  const frAccount = String(entry.frAccount || '').trim();

  // ── 1. Basic presence ──────────────────────────────────────────────────────
  if (!usAccount) {
    return {
      ...entry,
      gaapAnalysis: {
        mappingStatus: 'missing_us',
        mappingFound:  false,
        usAccount, frAccount,
        expectedFrAccount: null,
        frClassification:  frAccount ? classifyFrAccount(frAccount) : 'unknown',
        usClassification:  'unknown',
        gaapMismatch:      false,
        classificationMismatch: false,
        rootCause: 'CONFIG_ISSUE',
        issue: 'US GAAP account is missing for this entry.',
        fix:   'Populate the US_Account column with the appropriate US GAAP account number.',
      },
    };
  }

  if (!frAccount) {
    return {
      ...entry,
      gaapAnalysis: {
        mappingStatus: 'missing_fr',
        mappingFound:  false,
        usAccount, frAccount,
        expectedFrAccount: null,
        frClassification:  'unknown',
        usClassification:  classifyUsAccount(usAccount),
        gaapMismatch:      false,
        classificationMismatch: false,
        rootCause: 'CONFIG_ISSUE',
        issue: 'French PCG account is missing for this entry.',
        fix:   'Populate the FR_Account column with the appropriate French PCG account number.',
      },
    };
  }

  // ── 2. Lookup by US account ────────────────────────────────────────────────
  const mapping = mappings.find(m => m.usAccount === usAccount) || null;

  const frClass  = classifyFrAccount(frAccount);
  const usClass  = classifyUsAccount(usAccount);

  if (!mapping) {
    // No mapping entry exists for this US account at all
    return {
      ...entry,
      gaapAnalysis: {
        mappingStatus:     'missing',
        mappingFound:      false,
        usAccount, frAccount,
        expectedFrAccount: null,
        mappedType:        null,
        mappedDescription: null,
        mappedModule:      null,
        frClassification:  frClass,
        usClassification:  usClass,
        gaapMismatch:      false,
        classificationMismatch: false,
        rootCause: 'MAPPING_ISSUE',
        issue: `No mapping is defined for US account ${usAccount}. Cross-GAAP traceability is unavailable.`,
        fix:   `Add a US↔FR mapping for account ${usAccount} in Configuration → GAAP Mapping.`,
      },
    };
  }

  // ── 3. Compare provided FR account against mapped FR account ──────────────
  const expectedFrAccount   = mapping.frAccount;
  const frMatches           = frAccount === expectedFrAccount;
  const expFrClass          = classifyFrAccount(expectedFrAccount);
  const classificationMatch = frClass === expFrClass;

  if (frMatches) {
    return {
      ...entry,
      gaapAnalysis: {
        mappingStatus:          'correct',
        mappingFound:           true,
        usAccount, frAccount,
        expectedFrAccount,
        mappedType:             mapping.type        || null,
        mappedDescription:      mapping.description || null,
        mappedModule:           mapping.module      || null,
        frClassification:       frClass,
        expFrClassification:    expFrClass,
        usClassification:       usClass,
        gaapMismatch:           false,
        classificationMismatch: false,
        rootCause:              null,
        issue:                  null,
        fix:                    null,
      },
    };
  }

  // FR account is present but wrong
  const isCrossGaap = classifyUsAccount(usAccount) !== frClass;
  const rootCause   = !classificationMatch  ? 'MAPPING_ISSUE'
                    : isCrossGaap           ? 'MAPPING_ISSUE'
                    :                         'CONFIG_ISSUE';

  const issueDetail = !classificationMatch
    ? `French account ${frAccount} (${frClass}) does not match expected ${expectedFrAccount} (${expFrClass}) for US account ${usAccount}. Classification mismatch: ${frClass} provided vs ${expFrClass} expected.`
    : `French account ${frAccount} does not match expected ${expectedFrAccount} (${mapping.description || mapping.type}) for US account ${usAccount}.`;

  const fixDetail = !classificationMatch
    ? `Replace ${frAccount} with ${expectedFrAccount}. The correct French account is a ${expFrClass} account — using a ${frClass} account here will misclassify the entry.`
    : `Update the posting profile to use ${expectedFrAccount} instead of ${frAccount}. Verify the GAAP Mapping table is current.`;

  return {
    ...entry,
    gaapAnalysis: {
      mappingStatus:          'incorrect',
      mappingFound:           true,
      usAccount, frAccount,
      expectedFrAccount,
      mappedType:             mapping.type        || null,
      mappedDescription:      mapping.description || null,
      mappedModule:           mapping.module      || null,
      frClassification:       frClass,
      expFrClassification:    expFrClass,
      usClassification:       usClass,
      gaapMismatch:           true,
      classificationMismatch: !classificationMatch,
      rootCause,
      issue: issueDetail,
      fix:   fixDetail,
    },
  };
}

// ─── Global consistency checks ────────────────────────────────────────────────

/**
 * Detects US accounts that map to more than one FR account across the dataset
 * and flags per-voucher inconsistencies.
 *
 * @param {Array} entries  enriched entries (already have gaapAnalysis)
 * @returns {Array}        consistency issues
 */
function _consistencyChecks(entries) {
  const issues = [];

  // Map: usAccount → Set<frAccount>
  const globalUsToFr = {};
  for (const e of entries) {
    const us = e.usAccount || e.account || '';
    const fr = e.frAccount || '';
    if (!us || !fr) continue;
    if (!globalUsToFr[us]) globalUsToFr[us] = new Set();
    globalUsToFr[us].add(fr);
  }

  // Global conflicts
  for (const [us, frSet] of Object.entries(globalUsToFr)) {
    if (frSet.size < 2) continue;
    const affectedVouchers = [...new Set(
      entries
        .filter(e => (e.usAccount || e.account) === us)
        .map(e => e.voucher)
    )];
    issues.push({
      type:     'CONFLICTING_MAPPING',
      severity: 'high',
      scope:    'global',
      usAccount: us,
      frAccounts: [...frSet],
      affectedVouchers,
      issue: `US account ${us} is mapped to ${frSet.size} different French accounts across this import: ${[...frSet].join(', ')}. Only one French account should correspond to a given US account.`,
      fix:   `Standardise all entries for US account ${us} to use a single French account. Check the GAAP Mapping table to determine the correct counterpart.`,
    });
  }

  // Per-voucher conflicts (subset of global, but useful for voucher-level report)
  const byVoucher = {};
  for (const e of entries) {
    if (!byVoucher[e.voucher]) byVoucher[e.voucher] = [];
    byVoucher[e.voucher].push(e);
  }

  for (const [voucherId, vEntries] of Object.entries(byVoucher)) {
    const vUsToFr = {};
    for (const e of vEntries) {
      const us = e.usAccount || e.account || '';
      const fr = e.frAccount || '';
      if (!us || !fr) continue;
      if (!vUsToFr[us]) vUsToFr[us] = new Set();
      vUsToFr[us].add(fr);
    }
    for (const [us, frSet] of Object.entries(vUsToFr)) {
      if (frSet.size < 2) continue;
      // Only add if not already in global list for same US account
      const alreadyGlobal = issues.some(
        i => i.type === 'CONFLICTING_MAPPING' && i.usAccount === us && i.scope === 'global'
      );
      if (!alreadyGlobal) {
        issues.push({
          type:     'INCONSISTENT_VOUCHER_MAPPING',
          severity: 'high',
          scope:    'voucher',
          voucherId,
          usAccount: us,
          frAccounts: [...frSet],
          issue: `Within voucher ${voucherId}, US account ${us} appears with multiple French accounts: ${[...frSet].join(', ')}.`,
          fix:   `Review all lines in voucher ${voucherId} for US account ${us} and align them to a single French account.`,
        });
      }
    }
  }

  return issues;
}

// ─── Per-voucher GAAP reconciliation ─────────────────────────────────────────

/**
 * Compares US-side and FR-side structure for a single voucher.
 * Identifies misclassified accounts, incorrect FR accounts, and missing entries.
 *
 * @param {Object} voucher  voucher object with enriched `entries`
 * @returns {Object}        reconciliation result
 */
function _reconcileVoucher(voucher) {
  const entries = voucher.entries || [];
  const issues  = [];

  for (const entry of entries) {
    const ga = entry.gaapAnalysis;
    if (!ga) continue;

    switch (ga.mappingStatus) {
      case 'incorrect': {
        const issueType = ga.classificationMismatch
          ? 'CLASSIFICATION_MISMATCH'
          : 'INCORRECT_FR_ACCOUNT';
        issues.push({
          type:              issueType,
          severity:          ga.classificationMismatch ? 'high' : 'medium',
          voucherId:         voucher.voucherId,
          usAccount:         ga.usAccount,
          frAccount:         ga.frAccount,
          expectedFrAccount: ga.expectedFrAccount,
          description:       entry.description || '',
          amount:            (entry.debit || 0) || (entry.credit || 0),
          side:              entry.debit > 0 ? 'DR' : 'CR',
          issue:             ga.issue,
          fix:               ga.fix,
          rootCause:         ga.rootCause,
          frClassification:  ga.frClassification,
          expFrClassification: ga.expFrClassification,
        });
        break;
      }

      case 'missing':
      case 'missing_fr':
      case 'missing_us': {
        issues.push({
          type:      'MISSING_MAPPING',
          severity:  'low',
          voucherId: voucher.voucherId,
          usAccount: ga.usAccount,
          frAccount: ga.frAccount,
          expectedFrAccount: null,
          description: entry.description || '',
          amount:      (entry.debit || 0) || (entry.credit || 0),
          side:        entry.debit > 0 ? 'DR' : 'CR',
          issue:       ga.issue,
          fix:         ga.fix,
          rootCause:   'MAPPING_ISSUE',
        });
        break;
      }

      default:
        break;
    }
  }

  // Count by status
  const correct    = entries.filter(e => e.gaapAnalysis?.mappingStatus === 'correct').length;
  const incorrect  = entries.filter(e => e.gaapAnalysis?.mappingStatus === 'incorrect').length;
  const missing    = entries.filter(e =>
    ['missing','missing_fr','missing_us'].includes(e.gaapAnalysis?.mappingStatus)
  ).length;

  // Account classifications
  const usPl = entries.filter(e => e.gaapAnalysis?.usClassification === 'P&L').length;
  const usBs = entries.filter(e => e.gaapAnalysis?.usClassification === 'BS').length;
  const frPl = entries.filter(e => e.gaapAnalysis?.frClassification === 'P&L').length;
  const frBs = entries.filter(e => e.gaapAnalysis?.frClassification === 'BS').length;

  const mappingCoverage = entries.length > 0
    ? Math.round((correct / entries.length) * 100)
    : 0;

  const status =
    issues.some(i => i.severity === 'critical') ? 'critical' :
    issues.some(i => i.severity === 'high')     ? 'error'    :
    issues.some(i => i.severity === 'medium')   ? 'warning'  :
    issues.length > 0                           ? 'warning'  : 'clean';

  return {
    voucherId: voucher.voucherId,
    date:      voucher.date   || null,
    totalEntries: entries.length,
    correctMappings:   correct,
    incorrectMappings: incorrect,
    missingMappings:   missing,
    mappingCoverage,
    usPl, usBs, frPl, frBs,
    issues,
    status,
    hasClassificationMismatch: issues.some(i => i.type === 'CLASSIFICATION_MISMATCH'),
    hasIncorrectAccounts:      issues.some(i => i.type === 'INCORRECT_FR_ACCOUNT'),
    hasMissingMappings:        issues.some(i => i.type === 'MISSING_MAPPING'),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs the full dual-GAAP validation pipeline on one sheet's data.
 *
 * @param {Object} sheetData  { entries, vouchers, stats } from excelParser
 * @param {Object} context    diagnostic context (gaap, module, …) — optional
 * @returns {Object}
 *   {
 *     isDualGaap,          // boolean — true if FR account columns were present
 *     entries,             // enriched entries (with gaapAnalysis per entry)
 *     vouchers,            // keyed by voucherId, entries enriched
 *     stats,
 *     reconciliations,     // Array — one reconciliation object per voucher
 *     consistencyIssues,   // Array — global/per-voucher mapping conflicts
 *     gaapSummary: {
 *       totalEntries, correct, incorrect, missing, conflicting,
 *       consistencyErrors, overallStatus,
 *       coveragePct,
 *     },
 *   }
 */
function validateDualGaap(sheetData, context = {}) {
  // Check whether any entry actually has an frAccount column
  const rawEntries = sheetData.entries || [];
  const isDualGaap = rawEntries.some(e => e.frAccount && String(e.frAccount).trim() !== '');

  let mappings = [];
  try {
    mappings = getAllMappings();
  } catch (_) {
    // Mapping file unavailable — treat all as 'missing'
  }

  // ── Step 1: enrich each entry (skip analysis for non-dual-GAAP sheets) ───
  const enrichedEntries = isDualGaap
    ? rawEntries.map(e => _analyseEntry(e, mappings))
    : rawEntries.map(e => ({ ...e, gaapAnalysis: null }));

  // ── Step 2: consistency checks across the whole dataset ───────────────────
  const consistencyIssues = _consistencyChecks(enrichedEntries);

  // ── Step 3: rebuild voucher groups with enriched entries ──────────────────
  const enrichedVouchers = {};
  for (const entry of enrichedEntries) {
    const vid = entry.voucher;
    if (!enrichedVouchers[vid]) {
      const orig = (sheetData.vouchers || {})[vid] || {};
      enrichedVouchers[vid] = {
        ...orig,
        voucherId:   vid,
        date:        orig.date        || entry.date  || null,
        totalDebit:  orig.totalDebit  || 0,
        totalCredit: orig.totalCredit || 0,
        isBalanced:  orig.isBalanced  != null ? orig.isBalanced : true,
        entries:     [],
      };
    }
    enrichedVouchers[vid].entries.push(entry);
  }

  // ── Step 4: reconcile each voucher ────────────────────────────────────────
  const reconciliations = Object.values(enrichedVouchers).map(v => _reconcileVoucher(v));

  // ── Step 5: summary ───────────────────────────────────────────────────────
  const correct    = enrichedEntries.filter(e => e.gaapAnalysis?.mappingStatus === 'correct').length;
  const incorrect  = enrichedEntries.filter(e => e.gaapAnalysis?.mappingStatus === 'incorrect').length;
  const missing    = enrichedEntries.filter(e =>
    ['missing','missing_fr','missing_us'].includes(e.gaapAnalysis?.mappingStatus)
  ).length;
  const conflicting = consistencyIssues.filter(i => i.type === 'CONFLICTING_MAPPING').length;
  const total       = enrichedEntries.length;
  const coveragePct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const overallStatus =
    conflicting > 0 || incorrect > 0 ? 'error'   :
    missing     > 0                  ? 'warning' : 'clean';

  return {
    isDualGaap,
    entries:           enrichedEntries,
    vouchers:          enrichedVouchers,
    stats:             sheetData.stats || {},
    reconciliations,
    consistencyIssues,
    gaapSummary: {
      totalEntries:     total,
      correct,
      incorrect,
      missing,
      conflicting,
      consistencyErrors: consistencyIssues.length,
      overallStatus,
      coveragePct,
    },
  };
}

/**
 * Convenience: validate a single entry against the live mapping table.
 * Useful for on-the-fly lookup (e.g., in the scenario builder).
 */
function validateEntry(usAccount, frAccount) {
  let mappings = [];
  try { mappings = getAllMappings(); } catch (_) {}
  const synthetic = { voucher: '__single__', usAccount, frAccount, account: usAccount, debit: 0, credit: 0 };
  return _analyseEntry(synthetic, mappings).gaapAnalysis;
}

module.exports = { validateDualGaap, validateEntry };
