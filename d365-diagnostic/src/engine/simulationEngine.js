'use strict';

/**
 * simulationEngine.js
 * "What-if" simulation: applies modifications to parsed data and re-runs the
 * full diagnostic engine, then returns a before/after comparison.
 *
 * Modifications supported:
 *   accountSubs:     { wrongAccount: correctAccount }          — direct account swap
 *   mappingOverrides:{ usAccount: { frAccount, beAccount } }   — GAAP mapping overrides
 *   rateOverrides:   { currency: rate }                        — FX rate overrides
 *   contextOverrides:{ module, gaap, pma, ... }                — context changes
 */

const { runDiagnostic } = require('./diagnosticEngine');

// ─── Deep copy ───────────────────────────────────────────────────────────────

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── Apply modifications to a deep copy of parsedData ────────────────────────

function _applyAccountSubs(data, subs) {
  if (!subs || Object.keys(subs).length === 0) return;
  for (const sheet of Object.values(data)) {
    (sheet.entries || []).forEach(e => {
      const acc = e.usAccount || e.account;
      if (acc && subs[acc]) {
        const replacement = subs[acc];
        e.usAccount = replacement;
        e.account   = replacement;
      }
    });
  }
}

function _applyMappingOverrides(data, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return;
  for (const sheet of Object.values(data)) {
    (sheet.entries || []).forEach(e => {
      const us = e.usAccount || e.account;
      if (!us) return;
      const ov = overrides[us];
      if (!ov) return;
      if (ov.frAccount !== undefined) e.frAccount = ov.frAccount;
      if (ov.beAccount !== undefined) e.beAccount = ov.beAccount;
    });
  }
}

function _applyRateOverrides(data, rateOverrides) {
  if (!rateOverrides || Object.keys(rateOverrides).length === 0) return;
  for (const sheet of Object.values(data)) {
    (sheet.entries || []).forEach(e => {
      const ccy = (e.transactionCurrency || e.currency || '').toUpperCase();
      if (ccy && rateOverrides[ccy] !== undefined) {
        e.exchangeRate = rateOverrides[ccy];
      }
    });
  }
}

// ─── Result comparison ────────────────────────────────────────────────────────

function _collectIssueTypes(result) {
  const counts = {};
  const addIssues = (list) => {
    (list || []).forEach(iss => {
      counts[iss.type] = (counts[iss.type] || 0) + 1;
    });
  };

  if (result.voucherAnalysis) {
    Object.values(result.voucherAnalysis).forEach(data =>
      (data.vouchers || []).forEach(v => addIssues(v.issues))
    );
  }
  if (result.scenarioAnalysis) {
    (result.scenarioAnalysis.findings || []).forEach(f => addIssues(f.issues));
  }
  return counts;
}

function compareResults(before, after) {
  const bSummary = before.summary || {};
  const aSummary = after.summary  || {};

  const bIssueCounts = _collectIssueTypes(before);
  const aIssueCounts = _collectIssueTypes(after);

  const allTypes = new Set([...Object.keys(bIssueCounts), ...Object.keys(aIssueCounts)]);
  const issueChanges = [];

  for (const type of allTypes) {
    const bCount = bIssueCounts[type] || 0;
    const aCount = aIssueCounts[type] || 0;
    const delta  = aCount - bCount;
    if (delta !== 0) {
      issueChanges.push({ type, before: bCount, after: aCount, delta, improved: delta < 0 });
    }
  }

  const totalDelta      = (aSummary.totalIssues    || 0) - (bSummary.totalIssues    || 0);
  const criticalDelta   = (aSummary.criticalCount  || 0) - (bSummary.criticalCount  || 0);
  const fxImpactBefore  = before.financialImpact?.summary?.grandTotal || 0;
  const fxImpactAfter   = after.financialImpact?.summary?.grandTotal  || 0;

  return {
    totalIssuesDelta:   totalDelta,
    criticalDelta,
    issueChanges:       issueChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    financialImpactDelta: fxImpactAfter - fxImpactBefore,
    statusChange:       { before: bSummary.overallStatus, after: aSummary.overallStatus },
    improved:           totalDelta < 0,
    resolved:           issueChanges.filter(c => c.improved).length,
    introduced:         issueChanges.filter(c => !c.improved && c.after > 0).length,
  };
}

// ─── Voucher entry comparison (for before/after journal view) ────────────────

function compareVoucherEntries(beforeData, afterData) {
  if (!beforeData || !afterData) return [];

  const comparisons = [];

  for (const [sheet, beforeSheet] of Object.entries(beforeData)) {
    const afterSheet = afterData[sheet];
    if (!afterSheet) continue;

    const bEntries = beforeSheet.entries || [];
    const aEntries = afterSheet.entries  || [];

    for (let i = 0; i < Math.max(bEntries.length, aEntries.length); i++) {
      const b = bEntries[i];
      const a = aEntries[i];
      if (!b && !a) continue;

      const changed =
        (b?.usAccount !== a?.usAccount) ||
        (b?.frAccount !== a?.frAccount) ||
        (b?.beAccount !== a?.beAccount) ||
        (b?.exchangeRate !== a?.exchangeRate);

      if (changed) {
        comparisons.push({
          sheet,
          voucher: b?.voucher || a?.voucher,
          row: i + 1,
          before: b ? { account: b.usAccount || b.account, frAccount: b.frAccount, beAccount: b.beAccount, rate: b.exchangeRate } : null,
          after:  a ? { account: a.usAccount || a.account, frAccount: a.frAccount, beAccount: a.beAccount, rate: a.exchangeRate } : null,
          changeType: !b ? 'added' : !a ? 'removed' : 'modified',
        });
      }
    }
  }

  return comparisons;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Runs a what-if simulation: applies modifications to a copy of parsedData,
 * re-runs the diagnostic engine, and returns a before/after comparison.
 *
 * @param {Object} parsedData       Original parsed Excel data (not mutated)
 * @param {Object} context          Diagnostic context
 * @param {Object} modifications    { accountSubs, mappingOverrides, rateOverrides, contextOverrides }
 * @returns {{ before, after, diff, entryChanges, modifications }}
 */
function runSimulation(parsedData, context, modifications) {
  if (!parsedData || Object.keys(parsedData).length === 0) {
    return { success: false, error: 'No voucher data loaded. Please upload an Excel file first.' };
  }

  const modifiedData = _deepCopy(parsedData);

  if (modifications.accountSubs)      _applyAccountSubs(modifiedData, modifications.accountSubs);
  if (modifications.mappingOverrides)  _applyMappingOverrides(modifiedData, modifications.mappingOverrides);
  if (modifications.rateOverrides)     _applyRateOverrides(modifiedData, modifications.rateOverrides);

  const modifiedContext = { ...context, ...(modifications.contextOverrides || {}) };

  let before, after;
  try {
    before = runDiagnostic({ context,          scenarios: [], voucherData: parsedData });
    after  = runDiagnostic({ context: modifiedContext, scenarios: [], voucherData: modifiedData });
  } catch (err) {
    return { success: false, error: err.message };
  }

  const diff         = compareResults(before, after);
  const entryChanges = compareVoucherEntries(parsedData, modifiedData);

  return {
    success: true,
    before,
    after,
    diff,
    entryChanges,
    modifications,
    modificationCount: (
      Object.keys(modifications.accountSubs      || {}).length +
      Object.keys(modifications.mappingOverrides || {}).length +
      Object.keys(modifications.rateOverrides    || {}).length
    ),
  };
}

module.exports = { runSimulation, compareResults, compareVoucherEntries };
