'use strict';

const { ROOT_CAUSES, COMMON_ACCOUNT_ERRORS, getAccountName } = require('./accountingRules');
const { analyseVoucher } = require('./voucherAnalyzer');

/**
 * Master diagnostic runner.
 * Accepts { context, scenarios, voucherData } and returns a full findings report.
 */
function runDiagnostic({ context, scenarios = [], voucherData = null }) {
  const results = {
    context,
    timestamp: new Date().toISOString(),
    scenarioAnalysis:  null,
    voucherAnalysis:   null,
    summary:           null,
  };

  if (scenarios && scenarios.length > 0) {
    results.scenarioAnalysis = analyseScenarios(scenarios, context);
  }

  if (voucherData && typeof voucherData === 'object') {
    results.voucherAnalysis = analyseVoucherData(voucherData, context);
  }

  results.summary = buildSummary(results);
  return results;
}

// ─── Scenario analysis ────────────────────────────────────────────────────────
function analyseScenarios(scenarios, context) {
  const findings = scenarios.map((s, i) => analyseScenario(s, context, i));
  return {
    total:    findings.length,
    issues:   findings.filter(f => f.issues.length > 0).length,
    clean:    findings.filter(f => f.issues.length === 0).length,
    findings,
  };
}

function analyseScenario(scenario, context, idx) {
  const {
    description = `Scenario ${idx + 1}`,
    transactionType,
    expectedEntries = [],
    actualEntries   = [],
  } = scenario;

  const issues = [];
  const countryCode = context.country === 'FR' ? 'FR' : 'US';

  // Balance check on actual entries
  const totalDR = actualEntries.reduce((s, e) => s + (e.debit  || 0), 0);
  const totalCR = actualEntries.reduce((s, e) => s + (e.credit || 0), 0);

  if (actualEntries.length > 0 && Math.abs(totalDR - totalCR) > 0.01) {
    issues.push({
      type: 'UNBALANCED_VOUCHER',
      severity: 'critical',
      ...ROOT_CAUSES.UNBALANCED_VOUCHER,
      detail: `Imbalance: ${Math.abs(totalDR - totalCR).toFixed(2)}`,
    });
  }

  // Compare expected vs actual
  expectedEntries.forEach(exp => {
    const exactMatch = actualEntries.find(a =>
      a.account === exp.account &&
      Math.abs((a.debit  || 0) - (exp.debit  || 0)) < 0.01 &&
      Math.abs((a.credit || 0) - (exp.credit || 0)) < 0.01
    );

    if (exactMatch) return; // OK

    // Same amount, wrong account?
    const wrongAccountMatch = actualEntries.find(a =>
      a.account !== exp.account &&
      Math.abs((a.debit  || 0) - (exp.debit  || 0)) < 0.01 &&
      Math.abs((a.credit || 0) - (exp.credit || 0)) < 0.01
    );

    if (wrongAccountMatch) {
      issues.push({
        type:     'WRONG_ACCOUNT',
        severity: 'high',
        ...ROOT_CAUSES.WRONG_ACCOUNT,
        detail: `Account ${wrongAccountMatch.account} ("${getAccountName(wrongAccountMatch.account, countryCode)}") used.  Expected: ${exp.account} ("${getAccountName(exp.account, countryCode)}")`,
        actualAccount:   wrongAccountMatch.account,
        expectedAccount: exp.account,
      });
    } else {
      const side = (exp.debit || 0) > 0 ? 'DR' : 'CR';
      const amt  = (exp.debit || 0) || (exp.credit || 0);
      issues.push({
        type:     'MISSING_ENTRY',
        severity: 'high',
        ...ROOT_CAUSES.MISSING_ENTRY,
        detail: `Expected ${side} ${amt.toFixed(2)} on ${exp.account} ("${getAccountName(exp.account, countryCode)}")`,
        expectedAccount: exp.account,
      });
    }
  });

  // Extra actual entries vs expected (known error patterns)
  actualEntries.forEach(actual => {
    const isExpected = expectedEntries.some(e => e.account === actual.account);
    if (!isExpected) {
      const pattern = COMMON_ACCOUNT_ERRORS[actual.account];
      if (pattern) {
        issues.push({
          type:     'WRONG_ACCOUNT',
          severity: 'high',
          ...ROOT_CAUSES.WRONG_ACCOUNT,
          detail: pattern.detail,
          actualAccount:    actual.account,
          expectedAccounts: pattern.shouldBe,
        });
      }
    }
  });

  // PMA check
  if (context.pma && context.gaap === 'french_gaap' && transactionType === 'depreciation') {
    const hasPMA = actualEntries.some(e =>
      e.account.startsWith('687') || e.account.startsWith('1510') || e.account.startsWith('15')
    );
    if (!hasPMA) {
      issues.push({
        type:     'PMA_NOT_POSTED',
        severity: 'medium',
        ...ROOT_CAUSES.PMA_NOT_POSTED,
        detail: 'PMA is active but no provision entry found in this scenario.',
      });
    }
  }

  const status =
    issues.length === 0                                    ? 'clean'    :
    issues.some(i => i.severity === 'critical')            ? 'critical' :
    issues.some(i => i.severity === 'high')                ? 'error'    : 'warning';

  return {
    id: idx + 1,
    description,
    transactionType,
    expectedEntries,
    actualEntries,
    issues,
    d365Drivers: buildD365Drivers(issues, context, transactionType),
    status,
  };
}

// ─── Voucher data analysis ────────────────────────────────────────────────────
function analyseVoucherData(voucherData, context) {
  const sheetResults = {};

  Object.entries(voucherData).forEach(([sheetName, sheetData]) => {
    const voucherResults = Object.values(sheetData.vouchers)
      .map(v => analyseVoucher(v, context));

    sheetResults[sheetName] = {
      totalVouchers:    voucherResults.length,
      cleanVouchers:    voucherResults.filter(v => v.status === 'clean').length,
      issueVouchers:    voucherResults.filter(v => v.status !== 'clean').length,
      criticalVouchers: voucherResults.filter(v => v.severity === 'critical').length,
      vouchers:         voucherResults,
      issueCategories:  categoriseIssues(voucherResults),
      stats:            sheetData.stats,
    };
  });

  return sheetResults;
}

function categoriseIssues(voucherResults) {
  const cats = {};
  voucherResults.forEach(v =>
    v.issues.forEach(issue => {
      if (!cats[issue.type]) cats[issue.type] = { count: 0, vouchers: [] };
      cats[issue.type].count++;
      cats[issue.type].vouchers.push(v.voucherId);
    })
  );
  return cats;
}

// ─── D365 driver suggestions ──────────────────────────────────────────────────
function buildD365Drivers(issues, context, transactionType) {
  const seen = new Set();
  const drivers = [];

  const add = (d) => { if (!seen.has(d.driver)) { seen.add(d.driver); drivers.push(d); } };

  issues.forEach(issue => {
    switch (issue.type) {
      case 'WRONG_ACCOUNT':
        if (context.module === 'lease') {
          add({ driver: 'Lease Posting Profile',
                path:   'Lease ▸ Setup ▸ Lease Posting Profiles',
                action: `Update "${transactionType || 'transaction'}" account mapping`,
                priority: 'high' });
        } else {
          add({ driver: 'Fixed Asset Posting Profile',
                path:   'Fixed Assets ▸ Setup ▸ Fixed Asset Posting Profiles',
                action: `Update "${transactionType || 'transaction'}" account mapping`,
                priority: 'high' });
        }
        break;
      case 'MISSING_ENTRY':
        add({ driver: 'Batch Job Scheduler',
              path:   'System Administration ▸ Inquiries ▸ Batch Jobs',
              action: 'Verify periodic batch jobs completed successfully',
              priority: 'medium' });
        break;
      case 'UNBALANCED_VOUCHER':
        add({ driver: 'Subledger Reconciliation',
              path:   'General Ledger ▸ Periodic Tasks ▸ Subledger Journal Accounting Entries',
              action: 'Run reconciliation to identify and fix imbalance',
              priority: 'critical' });
        break;
      case 'PMA_NOT_POSTED':
        add({ driver: 'French Regulatory Parameters',
              path:   'Fixed Assets ▸ Setup ▸ Fixed Asset Parameters ▸ French Regulatory',
              action: 'Enable PMA and configure posting accounts',
              priority: 'medium' });
        break;
    }
  });

  return drivers.sort((a, b) =>
    ['critical','high','medium','low'].indexOf(a.priority) -
    ['critical','high','medium','low'].indexOf(b.priority)
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────
function buildSummary(results) {
  const summary = {
    totalIssues:    0,
    criticalCount:  0,
    errorCount:     0,
    warningCount:   0,
    issuesByType:   {},
    overallStatus:  'clean',
  };

  const collect = (issues) => {
    issues.forEach(issue => {
      summary.totalIssues++;
      if      (issue.severity === 'critical') summary.criticalCount++;
      else if (issue.severity === 'high')     summary.errorCount++;
      else                                    summary.warningCount++;
      summary.issuesByType[issue.type] = (summary.issuesByType[issue.type] || 0) + 1;
    });
  };

  if (results.scenarioAnalysis) {
    results.scenarioAnalysis.findings.forEach(f => collect(f.issues));
  }

  if (results.voucherAnalysis) {
    Object.values(results.voucherAnalysis).forEach(sheet =>
      sheet.vouchers.forEach(v => collect(v.issues))
    );
  }

  summary.overallStatus =
    summary.criticalCount > 0 ? 'critical' :
    summary.errorCount    > 0 ? 'error'    :
    summary.warningCount  > 0 ? 'warning'  : 'clean';

  summary.topRootCauses = Object.entries(summary.issuesByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count, title: ROOT_CAUSES[type]?.title || type }));

  return summary;
}

module.exports = { runDiagnostic };
