'use strict';

const { getAccountName } = require('./accountingRules');

// ── Account classification (French PCG) ────────────────────────────────────────
// P&L: class 6 (expenses) and class 7 (revenues)
// BS:  classes 1–5
const PL_PREFIXES = ['6', '7'];
const BS_PREFIXES = ['1', '2', '3', '4', '5'];

function classifyAccount(account) {
  const a = String(account || '').trim();
  if (PL_PREFIXES.some(p => a.startsWith(p))) return 'PL';
  if (BS_PREFIXES.some(p => a.startsWith(p))) return 'BS';
  return 'UNKNOWN';
}

function getAccountRole(account) {
  const a = String(account || '').trim();
  if (a.startsWith('6')) return { type: 'PL', label: 'Expense account (class 6)' };
  if (a.startsWith('7')) return { type: 'PL', label: 'Revenue account (class 7)' };
  if (a.startsWith('1')) return { type: 'BS', label: 'Equity / long-term liabilities (class 1)' };
  if (a.startsWith('2')) return { type: 'BS', label: 'Fixed assets (class 2)' };
  if (a.startsWith('3')) return { type: 'BS', label: 'Inventory / WIP (class 3)' };
  if (a.startsWith('4')) return { type: 'BS', label: 'Receivables / payables (class 4)' };
  if (a.startsWith('5')) return { type: 'BS', label: 'Cash / financial instruments (class 5)' };
  return { type: 'UNKNOWN', label: 'Unclassified account' };
}

// ── Detect auto-reverse pairs ──────────────────────────────────────────────────
// A pair = two lines: same account, same amount, opposite DR/CR.
// Forward entry appears first; reversal entry appears second (by index order).
function detectAutoReversePattern(entries) {
  const enriched = entries.map((e, idx) => ({
    ...e,
    idx,
    debit:       parseFloat(e.debit)  || 0,
    credit:      parseFloat(e.credit) || 0,
    accountRole: getAccountRole(e.account),
  }));

  const pairs   = [];
  const usedIdx = new Set();

  enriched.forEach((fwd, i) => {
    if (usedIdx.has(i)) return;
    const mirrorIdx = enriched.findIndex((rev, j) => {
      if (j <= i || usedIdx.has(j)) return false;
      return rev.account === fwd.account &&
             Math.abs(fwd.debit  - rev.credit) < 0.01 &&
             Math.abs(fwd.credit - rev.debit)  < 0.01 &&
             (fwd.debit > 0 || fwd.credit > 0);
    });

    if (mirrorIdx !== -1) {
      usedIdx.add(i);
      usedIdx.add(mirrorIdx);
      pairs.push({
        account:     fwd.account,
        amount:      fwd.debit || fwd.credit,
        forward:     enriched[i],
        reversal:    enriched[mirrorIdx],
        accountRole: fwd.accountRole,
      });
    }
  });

  return {
    pairs,
    unmatched: enriched.filter((_, i) => !usedIdx.has(i)),
  };
}

// ── Classify pairs by P&L vs BS role ──────────────────────────────────────────
function classifyAccrualPairs(pairs) {
  return {
    plPairs: pairs.filter(p => p.accountRole.type === 'PL'),
    bsPairs: pairs.filter(p => p.accountRole.type === 'BS'),
  };
}

// ── Net P&L and BS effect from unmatched (orphaned) entries ───────────────────
function buildImpactAnalysis(pairs, unmatched) {
  let plNet = 0;
  let bsNet = 0;
  const orphanedPL = [];
  const orphanedBS = [];

  unmatched.forEach(e => {
    const net = (e.debit || 0) - (e.credit || 0);
    if (e.accountRole.type === 'PL') { plNet += net; orphanedPL.push(e); }
    else if (e.accountRole.type === 'BS') { bsNet += net; orphanedBS.push(e); }
  });

  return {
    matchedPairs:  pairs.length,
    plNet,
    bsNet,
    orphanedPL,
    orphanedBS,
    plOverstated:   plNet >  0.01,
    plUnderstated:  plNet < -0.01,
    bsIncorrect:    Math.abs(bsNet) > 0.01,
    timingMismatch: orphanedPL.length > 0 || orphanedBS.length > 0,
  };
}

// ── Main accrual scenario analyser ────────────────────────────────────────────
function analyseAccrualScenario(scenario, context) {
  const projectGroup    = context.projectGroup || {};
  const countryCode     = context.country === 'FR' ? 'FR' : 'US';
  const actualEntries   = (scenario.actualEntries   || []).map(normalise);
  const expectedEntries = (scenario.expectedEntries || []).map(normalise);

  const { pairs, unmatched } = detectAutoReversePattern(actualEntries);
  const { plPairs, bsPairs } = classifyAccrualPairs(pairs);
  const impact              = buildImpactAnalysis(pairs, unmatched);

  const issues = [];

  // ── Issue 1: auto-reversal entirely absent ─────────────────────────────────
  if (projectGroup.autoReverse && pairs.length === 0 && actualEntries.length > 0) {
    issues.push({
      type:     'ACCRUAL_REVERSAL_MISSING',
      severity: 'critical',
      title:    'Auto-reversal not detected',
      detail:   'Project Group has autoReverse enabled but no mirrored entry pairs were found in this voucher. The accrual batch job may not have run, or the reversal principle is not configured.',
      rootCause: {
        driver:   'Project Group',
        element:  'Reversal principle',
        d365Path: 'Project Management and Accounting ▸ Setup ▸ Project Groups ▸ [Group] ▸ Estimates tab ▸ Reversal principle',
        action:   'Set "Reversal principle" to "As per transaction date" or "As per period start date" and verify the Accruals batch job has run for this period.',
      },
      impact:   'P&L is permanently impacted — costs or revenues remain recognized without the planned reversal. The balance sheet accrual account remains open indefinitely, causing sub-ledger reconciliation failures.',
      universalModel: uam(context, scenario.transactionType, 'debit', 'ProjectGroup', 'Reversal principle', null),
    });
  }

  // ── Issue 2: unmatched entries (missing individual reversal lines) ─────────
  unmatched.forEach(entry => {
    if (!projectGroup.autoReverse) return;
    const side = entry.debit > 0 ? 'DR' : 'CR';
    const amt  = entry.debit  || entry.credit;
    const oppSide = side === 'DR' ? 'CR' : 'DR';
    issues.push({
      type:     'MISSING_REVERSAL_LINE',
      severity: 'high',
      title:    'Reversal line missing for accrual entry',
      detail:   `Entry ${side} ${amt.toFixed(2)} on account ${entry.account} ("${getAccountName(entry.account, countryCode)}") has no matching reversal. Expected a mirrored ${oppSide} ${amt.toFixed(2)} on the same account.`,
      account:  entry.account,
      amount:   amt,
      rootCause: {
        driver:   entry.accountRole.type === 'BS' ? 'ProjectPostingProfile' : 'ProjectGroup',
        element:  entry.accountRole.type === 'BS'
          ? 'Accrued cost / Accrued revenue BS account'
          : 'Reversal principle',
        d365Path: 'Project Management and Accounting ▸ Setup ▸ Posting ▸ Posting (Project Posting Profile) ▸ Accrued revenue / Accrued cost',
        action:   `Verify the ${entry.accountRole.type === 'BS' ? 'BS account mapping for ' + entry.account : 'reversal principle'} and confirm the auto-reversal batch job completed for this period.`,
      },
      impact: entry.accountRole.type === 'PL'
        ? `P&L account ${entry.account} is not neutralized — period expense/revenue of ${amt.toFixed(2)} is permanently recognized instead of being reversed.`
        : `Balance sheet account ${entry.account} carries an open accrual balance of ${amt.toFixed(2)} — sub-ledger reconciliation will fail and the balance sheet is misstated.`,
      universalModel: uam(context, scenario.transactionType, side === 'DR' ? 'debit' : 'credit', 'ProjectPostingProfile', 'AccruedCostBSAccount', entry.account),
    });
  });

  // ── Issue 3: wrong BS account ──────────────────────────────────────────────
  // For each BS pair detected, compare against the expected BS entry at the same amount.
  bsPairs.forEach(pair => {
    const expectedBSEntry = expectedEntries.find(e =>
      classifyAccount(e.account) === 'BS' &&
      e.account !== pair.account &&
      (Math.abs(e.debit  - pair.amount) < 0.01 ||
       Math.abs(e.credit - pair.amount) < 0.01)
    );
    if (!expectedBSEntry) return;

    issues.push({
      type:            'WRONG_BS_ACCOUNT',
      severity:        'high',
      title:           'Wrong balance sheet account used for accrual reversal',
      detail:          `BS account ${pair.account} ("${getAccountName(pair.account, countryCode)}") used. Expected: ${expectedBSEntry.account} ("${getAccountName(expectedBSEntry.account, countryCode)}").`,
      actualAccount:   pair.account,
      expectedAccount: expectedBSEntry.account,
      rootCause: {
        driver:   'ProjectPostingProfile',
        element:  'Accrued revenue-sales value / Accrued cost account',
        d365Path: 'Project Management and Accounting ▸ Setup ▸ Posting ▸ Posting ▸ Accrued revenue-sales value / Accrued cost',
        action:   `Change the BS account from ${pair.account} to ${expectedBSEntry.account} in the Project Posting Profile for this project category.`,
        trace:    `Project Group → Accrual Enabled\nProject Posting Profile → BS Account = ${pair.account}\nExpected: ${expectedBSEntry.account}`,
      },
      impact: `Balance sheet carries the accrual on ${pair.account} instead of ${expectedBSEntry.account}. P&L is correctly neutralized (reversal amount matches) but the BS presentation is incorrect — this causes sub-ledger reconciliation failures and misclassified balance sheet positions.`,
      universalModel: uam(context, scenario.transactionType, 'credit', 'ProjectPostingProfile', 'AccruedCostBSAccount', pair.account),
    });
  });

  // ── Issue 4: P&L not neutralized (only when reversal exists but is incomplete) ──
  // Suppress when reversal is entirely absent — ACCRUAL_REVERSAL_MISSING already covers it.
  const hasFullAbsence = issues.some(i => i.type === 'ACCRUAL_REVERSAL_MISSING');
  if (impact.plOverstated && !hasFullAbsence) {
    issues.push({
      type:     'PL_NOT_NEUTRALIZED',
      severity: 'high',
      title:    'P&L not neutralized — period over-recognition',
      detail:   `Net P&L impact of +${impact.plNet.toFixed(2)} remains after reversal. Expected: 0.00. The reversal has only partially offset the accrual.`,
      rootCause: {
        driver:   'ProjectGroup',
        element:  'Accrual / Reversal principle',
        d365Path: 'Project Management and Accounting ▸ Setup ▸ Project Groups ▸ Estimates tab',
        action:   'Verify the reversal principle and re-run the Accruals batch job. Ensure no manual overrides have modified the reversal amount.',
      },
      impact: `P&L overstated by ${impact.plNet.toFixed(2)}. Period profitability is distorted — costs or revenues are over-recognized relative to the project stage of completion.`,
      universalModel: uam(context, scenario.transactionType, 'debit', 'ProjectGroup', 'accrualEnabled', null),
    });
  }
  if (impact.plUnderstated && !hasFullAbsence) {
    issues.push({
      type:     'PL_NOT_NEUTRALIZED',
      severity: 'high',
      title:    'P&L not neutralized — period under-recognition',
      detail:   `Net P&L impact of ${impact.plNet.toFixed(2)} remains after reversal. Expected: 0.00.`,
      rootCause: {
        driver:   'ProjectGroup',
        element:  'Accrual / Reversal principle',
        d365Path: 'Project Management and Accounting ▸ Setup ▸ Project Groups ▸ Estimates tab',
        action:   'Verify the reversal principle configuration and ensure the accrual batch job completed correctly for all entries in this period.',
      },
      impact: `P&L understated by ${Math.abs(impact.plNet).toFixed(2)}. Period profitability is understated, leading to incorrect cost or revenue recognition.`,
      universalModel: uam(context, scenario.transactionType, 'credit', 'ProjectGroup', 'accrualEnabled', null),
    });
  }

  const status =
    issues.length === 0                         ? 'clean'    :
    issues.some(i => i.severity === 'critical') ? 'critical' :
    issues.some(i => i.severity === 'high')     ? 'error'    : 'warning';

  return {
    accrualDetected: pairs.length > 0,
    pairCount:       pairs.length,
    plPairs,
    bsPairs,
    unmatched,
    impact,
    issues,
    status,
    remediation: buildRemediation(issues),
  };
}

function buildRemediation(issues) {
  if (issues.length === 0) return null;
  return {
    primaryPath: 'Project Management and Accounting ▸ Setup ▸ Project Groups',
    steps: issues.map((issue, i) => ({
      step:     i + 1,
      title:    issue.title,
      config:   issue.rootCause?.element,
      d365Path: issue.rootCause?.d365Path,
      action:   issue.rootCause?.action,
    })),
  };
}

function normalise(e) {
  return { ...e, debit: parseFloat(e.debit) || 0, credit: parseFloat(e.credit) || 0 };
}

function uam(context, transactionType, postingType, accountSource, configElement, mainAccount) {
  return {
    module:          context.module,
    transactionType: transactionType || null,
    postingType:     postingType     || null,
    accountSource:   accountSource   || null,
    configElement:   configElement   || null,
    mainAccount:     mainAccount     || null,
  };
}

module.exports = { classifyAccount, getAccountRole, detectAutoReversePattern, analyseAccrualScenario };
