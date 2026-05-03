'use strict';

/**
 * patternEngine.js
 * Analyses diagnostic results to detect recurring patterns, anomalies,
 * and generates prioritised correction suggestions with confidence scores.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _collectIssues(voucherAnalysis, scenarioAnalysis) {
  const issues = [];

  if (voucherAnalysis) {
    Object.entries(voucherAnalysis).forEach(([sheet, data]) => {
      (data.vouchers || []).forEach(v =>
        v.issues.forEach(iss => issues.push({ ...iss, sheet, source: 'voucher' }))
      );
    });
  }

  if (scenarioAnalysis) {
    (scenarioAnalysis.findings || []).forEach(f =>
      f.issues.forEach(iss => issues.push({ ...iss, source: 'scenario' }))
    );
  }

  return issues;
}

function _collectEntries(voucherAnalysis) {
  const entries = [];
  if (!voucherAnalysis) return entries;
  Object.values(voucherAnalysis).forEach(data => {
    (data.vouchers || []).forEach(v =>
      (v.entries || []).forEach(e => entries.push(e))
    );
  });
  return entries;
}

function _freq(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const k = keyFn(item);
    if (!k) continue;
    map[k] = (map[k] || 0) + 1;
  }
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Account frequency ────────────────────────────────────────────────────────

function analyseAccountFrequency(entries) {
  const total = entries.length || 1;
  const usFreq = _freq(entries, e => e.usAccount || e.account);
  const frFreq = _freq(entries, e => e.frAccount);

  return {
    usGaap: usFreq.slice(0, 10).map(f => ({ ...f, pct: Math.round(f.count / total * 100) })),
    frGaap: frFreq.filter(f => f.key).slice(0, 10).map(f => ({ ...f, pct: Math.round(f.count / total * 100) })),
  };
}

// ─── Issue frequency ──────────────────────────────────────────────────────────

function analyseIssueFrequency(issues) {
  const byType = _freq(issues, i => i.type);
  const byAccount = _freq(issues, i => i.account || i.actualAccount || i.usAccount);
  const bySeverity = _freq(issues, i => i.severity);

  return {
    byType: byType.slice(0, 8),
    byAccount: byAccount.filter(f => f.key).slice(0, 8),
    bySeverity,
    total: issues.length,
  };
}

// ─── Anomaly detection ────────────────────────────────────────────────────────

function detectAnomalies(entries, issues) {
  const anomalies = [];

  // 1. Accounts used on unexpected sides
  const accountSides = {};
  for (const e of entries) {
    const acc = e.usAccount || e.account;
    if (!acc) continue;
    if (!accountSides[acc]) accountSides[acc] = { dr: 0, cr: 0 };
    if (e.debit  > 0) accountSides[acc].dr++;
    if (e.credit > 0) accountSides[acc].cr++;
  }

  for (const [acc, sides] of Object.entries(accountSides)) {
    const total = sides.dr + sides.cr;
    if (total < 3) continue;
    const drPct = sides.dr / total;
    // If account uses both sides almost equally — potential netting anomaly
    if (drPct > 0.3 && drPct < 0.7) {
      anomalies.push({
        type: 'ACCOUNT_BOTH_SIDES',
        account: acc,
        detail: `Account ${acc} appears on both DR (${sides.dr}×) and CR (${sides.cr}×) sides. Possible netting or misclassification.`,
        confidence: 0.6,
      });
    }
  }

  // 2. High-value single entries with no matching pair
  const voucherIssueCount = _freq(issues, i => i.voucherId);
  const hotVouchers = voucherIssueCount.filter(v => v.count >= 3);
  for (const v of hotVouchers) {
    anomalies.push({
      type: 'HIGH_ISSUE_VOUCHER',
      voucherId: v.key,
      issueCount: v.count,
      detail: `Voucher ${v.key} has ${v.count} issues — may indicate a systematic configuration problem.`,
      confidence: 0.75,
    });
  }

  // 3. Recurring same issue type per account
  const issuesByTypeAndAccount = {};
  for (const iss of issues) {
    const k = `${iss.type}::${iss.account || iss.actualAccount || iss.usAccount || '?'}`;
    issuesByTypeAndAccount[k] = (issuesByTypeAndAccount[k] || 0) + 1;
  }
  for (const [k, count] of Object.entries(issuesByTypeAndAccount)) {
    if (count < 2) continue;
    const [type, account] = k.split('::');
    anomalies.push({
      type: 'RECURRING_ISSUE',
      issueType: type,
      account,
      occurrences: count,
      detail: `Issue ${type} on account ${account} recurs ${count} times. Likely a systematic configuration error.`,
      confidence: Math.min(0.95, 0.5 + count * 0.1),
    });
  }

  return anomalies.sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

const ISSUE_REMEDIATION = {
  WRONG_ACCOUNT:           { action: 'Update the D365 posting profile to use the correct account. Generate a corrective journal.', priority: 1 },
  UNBALANCED_VOUCHER:      { action: 'Post a balancing corrective journal entry to bring the voucher into balance.', priority: 1 },
  PMA_NOT_POSTED:          { action: 'Post the missing French provision (PMA) in Project management → Journals.', priority: 1 },
  MISSING_ENTRY:           { action: 'Post the missing journal entry identified in the diagnostic output.', priority: 2 },
  CLASSIFICATION_MISMATCH: { action: 'Reclassify via a corrective journal: DR correct account / CR incorrect account.', priority: 2 },
  INCORRECT_FR_ACCOUNT:    { action: 'Update the posting profile in D365 to use the correct French PCG account.', priority: 2 },
  MISSING_MAPPING:         { action: 'Add the missing US↔FR↔BE mapping in Configuration → GAAP Mapping.', priority: 3 },
  CONFLICTING_MAPPING:     { action: 'Standardise the mapping table — ensure one US account maps to exactly one FR account.', priority: 2 },
  FX_IMBALANCE:            { action: 'Post an FX gain/loss corrective entry for the accounting-currency difference.', priority: 1 },
  FX_ROUNDING:             { action: 'Post a rounding adjustment entry (typically <€1) to a rounding account.', priority: 3 },
  RATE_OVERRIDE:           { action: 'Review the manual rate override. If incorrect, reverse and repost at the correct rate.', priority: 2 },
  ACCRUAL_REVERSAL_MISSING:{ action: 'Post the missing auto-reversal entries in the subsequent period.', priority: 1 },
  MISSING_REVERSAL_LINE:   { action: 'Add the missing reversal line to the existing reversal voucher.', priority: 2 },
  PL_NOT_NEUTRALIZED:      { action: 'Post a P&L neutralization journal to transfer the balance to the deferred account.', priority: 1 },
  WRONG_BS_ACCOUNT:        { action: 'Post a reclassification journal: DR correct BS account / CR incorrect BS account.', priority: 2 },
  INCORRECT_BE_ACCOUNT:    { action: 'Update the D365 posting profile to use the correct Belgian PCMN account.', priority: 3 },
};

function generateSuggestions(issueFrequency, accountFrequency, anomalies) {
  const suggestions = [];

  // From issue frequency
  for (const { key: type, count } of issueFrequency.byType) {
    const rem = ISSUE_REMEDIATION[type];
    if (!rem) continue;
    const confidence = Math.min(0.95, 0.5 + (count / (issueFrequency.total || 1)) + count * 0.05);
    suggestions.push({
      id: `sug_${type.toLowerCase()}`,
      type: 'SYSTEMATIC_FIX',
      issueType: type,
      occurrences: count,
      priority: rem.priority,
      confidence: Math.round(confidence * 100) / 100,
      action: rem.action,
      scope: count >= 3 ? 'batch' : 'single',
    });
  }

  // From anomalies
  for (const anomaly of anomalies) {
    if (anomaly.type === 'RECURRING_ISSUE') {
      const rem = ISSUE_REMEDIATION[anomaly.issueType];
      suggestions.push({
        id: `sug_anom_${anomaly.account}`,
        type: 'ANOMALY_FIX',
        issueType: anomaly.issueType,
        account: anomaly.account,
        occurrences: anomaly.occurrences,
        priority: 1,
        confidence: anomaly.confidence,
        action: rem?.action || `Investigate repeated ${anomaly.issueType} on account ${anomaly.account}.`,
        scope: 'batch',
      });
    }
  }

  return suggestions
    .sort((a, b) => a.priority - b.priority || b.confidence - a.confidence)
    .slice(0, 10);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point: analyses a diagnosticResult and returns patterns + suggestions.
 */
function analysePatterns(diagnosticResult) {
  const { voucherAnalysis, scenarioAnalysis } = diagnosticResult || {};

  const allIssues  = _collectIssues(voucherAnalysis, scenarioAnalysis);
  const allEntries = _collectEntries(voucherAnalysis);

  const accountFrequency = analyseAccountFrequency(allEntries);
  const issueFrequency   = analyseIssueFrequency(allIssues);
  const anomalies        = detectAnomalies(allEntries, allIssues);
  const suggestions      = generateSuggestions(issueFrequency, accountFrequency, anomalies);

  const topIssueType = issueFrequency.byType[0]?.key || null;
  const highConf     = suggestions.filter(s => s.confidence >= 0.8).length;

  return {
    accountFrequency,
    issueFrequency,
    anomalies,
    suggestions,
    summary: {
      totalIssues:     allIssues.length,
      totalEntries:    allEntries.length,
      totalPatterns:   suggestions.length,
      highConfidence:  highConf,
      topIssueType,
      topAccount:      issueFrequency.byAccount[0]?.key || null,
      anomalyCount:    anomalies.length,
    },
  };
}

module.exports = { analysePatterns, analyseAccountFrequency, analyseIssueFrequency, detectAnomalies };
