'use strict';

const { ROOT_CAUSES, COMMON_ACCOUNT_ERRORS, getAccountName } = require('./accountingRules');
const { analyseVoucher } = require('./voucherAnalyzer');
const { resolveAccountSource, resolveAccountPair } = require('./accountSourceResolver');
const { moduleLoader } = require('./moduleLoader');
const { analyseAccrualScenario } = require('./accrualEngine');
const { validateDualGaap } = require('./gaapValidationEngine');

/**
 * Master diagnostic runner.
 * Accepts { context, scenarios, voucherData } and returns a full findings report
 * enriched with Universal Accounting Model fields per issue.
 */
function runDiagnostic({ context, scenarios = [], voucherData = null }) {
  const mod = moduleLoader.loadModule(context.module || 'lease');

  const results = {
    context,
    module:    mod.metadata,
    timestamp: new Date().toISOString(),
    scenarioAnalysis: null,
    voucherAnalysis:  null,
    summary:          null,
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
    total:  findings.length,
    issues: findings.filter(f => f.issues.length > 0).length,
    clean:  findings.filter(f => f.issues.length === 0).length,
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

  const issues      = [];
  const countryCode = context.country === 'FR' ? 'FR' : 'US';

  // ── Balance check ──────────────────────────────────────────────────────────
  const totalDR = actualEntries.reduce((s, e) => s + (e.debit  || 0), 0);
  const totalCR = actualEntries.reduce((s, e) => s + (e.credit || 0), 0);
  if (actualEntries.length > 0 && Math.abs(totalDR - totalCR) > 0.01) {
    issues.push({
      type: 'UNBALANCED_VOUCHER', severity: 'critical', ...ROOT_CAUSES.UNBALANCED_VOUCHER,
      detail: `Imbalance: ${Math.abs(totalDR - totalCR).toFixed(2)}`,
      actualSource: null, expectedSource: null, sourceComparison: null,
      universalModel: uam(context, transactionType, null, null, null, null),
    });
  }

  // ── Normalise transaction type key ────────────────────────────────────────
  const txResolved = moduleLoader.resolveTransactionType(context.module, transactionType);
  const txKey      = txResolved?.key || transactionType;

  // ── Expected vs actual comparison ─────────────────────────────────────────
  expectedEntries.forEach(exp => {
    const exactMatch = actualEntries.find(a =>
      a.account === exp.account &&
      Math.abs((a.debit  || 0) - (exp.debit  || 0)) < 0.01 &&
      Math.abs((a.credit || 0) - (exp.credit || 0)) < 0.01
    );
    if (exactMatch) return;

    const wrongAccountMatch = actualEntries.find(a =>
      a.account !== exp.account &&
      Math.abs((a.debit  || 0) - (exp.debit  || 0)) < 0.01 &&
      Math.abs((a.credit || 0) - (exp.credit || 0)) < 0.01
    );

    if (wrongAccountMatch) {
      const side = (exp.debit || 0) > 0 ? 'debit' : 'credit';
      const pair = resolveAccountPair({
        module: context.module, transactionType: txKey, side,
        actualAccount: wrongAccountMatch.account, expectedAccount: exp.account, context,
      });
      issues.push({
        type: 'WRONG_ACCOUNT', severity: 'high', ...ROOT_CAUSES.WRONG_ACCOUNT,
        detail: `Account ${wrongAccountMatch.account} ("${getAccountName(wrongAccountMatch.account, countryCode)}") used. Expected: ${exp.account} ("${getAccountName(exp.account, countryCode)}")`,
        fix: pair.comparison?.actionRequired || ROOT_CAUSES.WRONG_ACCOUNT.fix,
        actualAccount: wrongAccountMatch.account, expectedAccount: exp.account,
        actualSource: pair.actual, expectedSource: pair.expected, sourceComparison: pair.comparison,
        universalModel: uam(context, txKey, side, pair.actual?.source, pair.actual?.field, wrongAccountMatch.account),
      });
    } else {
      const side   = (exp.debit || 0) > 0 ? 'debit' : 'credit';
      const amt    = (exp.debit || 0) || (exp.credit || 0);
      const expSrc = resolveAccountSource({ module: context.module, transactionType: txKey, side, account: exp.account, context });
      issues.push({
        type: 'MISSING_ENTRY', severity: 'high', ...ROOT_CAUSES.MISSING_ENTRY,
        detail: `Expected ${side.toUpperCase()} ${amt.toFixed(2)} on ${exp.account} ("${getAccountName(exp.account, countryCode)}")`,
        expectedAccount: exp.account, actualSource: null, expectedSource: expSrc,
        sourceComparison: { sameSource: false, severity: 'missing',
          explanation:    `Expected entry from ${expSrc.source} → "${expSrc.field}" was not posted.`,
          actionRequired: `Verify the D365 posting process ran correctly: ${expSrc.d365Path}`,
        },
        universalModel: uam(context, txKey, side, expSrc.source, expSrc.field, exp.account),
      });
    }
  });

  // ── Extra actual entries — known error patterns ────────────────────────────
  actualEntries.forEach(actual => {
    const isExpected = expectedEntries.some(e => e.account === actual.account);
    if (isExpected) return;
    const mod       = moduleLoader.loadModule(context.module);
    const txDef     = txKey ? mod.transactions[txKey] : null;
    const pattern   = txDef?.knownErrors?.[actual.account] || COMMON_ACCOUNT_ERRORS[actual.account];
    if (!pattern) return;

    const side = (actual.debit || 0) > 0 ? 'debit' : 'credit';
    const pair = resolveAccountPair({
      module: context.module, transactionType: txKey, side,
      actualAccount: actual.account, expectedAccount: pattern.shouldBe[0], context,
    });
    issues.push({
      type: 'WRONG_ACCOUNT', severity: 'high', ...ROOT_CAUSES.WRONG_ACCOUNT,
      detail: pattern.detail,
      fix: pair.comparison?.actionRequired || ROOT_CAUSES.WRONG_ACCOUNT.fix,
      actualAccount: actual.account, expectedAccounts: pattern.shouldBe,
      actualSource: pair.actual, expectedSource: pair.expected, sourceComparison: pair.comparison,
      universalModel: uam(context, txKey, side, pair.actual?.source, pair.actual?.field, actual.account),
    });
  });

  // ── PMA check ─────────────────────────────────────────────────────────────
  if (context.pma && context.gaap === 'french_gaap' && txKey === 'Depreciation') {
    const hasPMA = actualEntries.some(e =>
      e.account.startsWith('687') || e.account.startsWith('1510') || e.account.startsWith('15')
    );
    if (!hasPMA) {
      const expSrc = resolveAccountSource({
        module: context.module, transactionType: 'Depreciation', side: 'debit', account: '68725', context,
      });
      issues.push({
        type: 'PMA_NOT_POSTED', severity: 'medium', ...ROOT_CAUSES.PMA_NOT_POSTED,
        detail: 'PMA is active but no provision entry found in this scenario.',
        actualSource: null, expectedSource: expSrc,
        sourceComparison: { sameSource: false, severity: 'missing',
          explanation:    `PMA entry missing. Expected from ${expSrc.source} → "${expSrc.field}".`,
          actionRequired: `Configure PMA in: ${expSrc.d365Path}`,
        },
        universalModel: uam(context, 'Depreciation', 'debit', expSrc.source, expSrc.field, '68725'),
      });
    }
  }

  // ── Accrual / Auto-Reversal check (Project Group) ─────────────────────────
  let accrualAnalysis = null;
  if (context.projectGroup?.accrualEnabled) {
    accrualAnalysis = analyseAccrualScenario(scenario, context);
    accrualAnalysis.issues.forEach(ai => issues.push(ai));
  }

  const status =
    issues.length === 0                         ? 'clean'    :
    issues.some(i => i.severity === 'critical') ? 'critical' :
    issues.some(i => i.severity === 'high')     ? 'error'    : 'warning';

  return {
    id: idx + 1, description, transactionType: txKey,
    expectedEntries, actualEntries, issues,
    d365Drivers: buildD365Drivers(issues, context, txKey),
    accrualAnalysis,
    status,
  };
}

// ─── Voucher data analysis ────────────────────────────────────────────────────
function analyseVoucherData(voucherData, context) {
  const sheetResults = {};

  Object.entries(voucherData).forEach(([sheetName, sheetData]) => {
    // Run dual-GAAP validation on every sheet (no-op for single-account sheets)
    const gaapValidation = sheetData.gaapValidation || validateDualGaap(sheetData, context);

    // Use the enriched vouchers from gaapValidation when available so that
    // the voucherAnalyzer sees gaapAnalysis on each entry
    const voucherMap = gaapValidation.isDualGaap
      ? gaapValidation.vouchers
      : sheetData.vouchers;

    const voucherResults = Object.values(voucherMap).map(v => analyseVoucher(v, context));

    // Promote GAAP-level issues as diagnostic issues on each voucher result
    if (gaapValidation.isDualGaap) {
      gaapValidation.reconciliations.forEach(recon => {
        const vResult = voucherResults.find(v => v.voucherId === recon.voucherId);
        if (!vResult) return;
        recon.issues.forEach(ri => {
          vResult.issues.push({
            type:     ri.type,
            severity: ri.severity,
            code:     ri.type === 'CLASSIFICATION_MISMATCH' ? ROOT_CAUSES.GAAP_MAPPING_MISMATCH?.code : ROOT_CAUSES.GAAP_MAPPING_MISSING?.code,
            title:    ri.type === 'CLASSIFICATION_MISMATCH' ? 'GAAP Classification Mismatch'
                    : ri.type === 'INCORRECT_FR_ACCOUNT'    ? 'Incorrect French Account'
                    : ri.type === 'MISSING_MAPPING'         ? 'Missing GAAP Mapping'
                    : ri.type,
            detail:   ri.issue || '',
            fix:      ri.fix   || '',
            gaapRootCause: ri.rootCause,
            usAccount: ri.usAccount,
            frAccount: ri.frAccount,
            expectedFrAccount: ri.expectedFrAccount,
            actualSource:     null,
            expectedSource:   null,
            sourceComparison: null,
            universalModel:   uam(context, vResult.detectedType, null, null, null, ri.usAccount),
          });
        });
        // Promote consistency issues that touch this voucher
        gaapValidation.consistencyIssues
          .filter(ci => ci.affectedVouchers?.includes(recon.voucherId) || ci.voucherId === recon.voucherId)
          .forEach(ci => {
            const already = vResult.issues.some(i => i.type === ci.type && i.usAccount === ci.usAccount);
            if (!already) {
              vResult.issues.push({
                type:     ci.type,
                severity: ci.severity,
                title:    ci.type === 'CONFLICTING_MAPPING' ? 'Conflicting US↔FR Mapping' : 'Inconsistent Voucher Mapping',
                detail:   ci.issue || '',
                fix:      ci.fix   || '',
                usAccount: ci.usAccount,
                frAccounts: ci.frAccounts,
                actualSource:     null,
                expectedSource:   null,
                sourceComparison: null,
                universalModel:   uam(context, null, null, null, null, ci.usAccount),
              });
            }
          });

        // Update voucher severity / status to reflect GAAP issues
        if (vResult.issues.some(i => i.severity === 'critical')) vResult.severity = 'critical';
        else if (vResult.issues.some(i => i.severity === 'high') && vResult.severity !== 'critical') vResult.severity = 'high';
        if (vResult.issues.length > 0) vResult.status = 'issues';
      });
    }

    sheetResults[sheetName] = {
      totalVouchers:    voucherResults.length,
      cleanVouchers:    voucherResults.filter(v => v.status === 'clean').length,
      issueVouchers:    voucherResults.filter(v => v.status !== 'clean').length,
      criticalVouchers: voucherResults.filter(v => v.severity === 'critical').length,
      vouchers:         voucherResults,
      issueCategories:  categoriseIssues(voucherResults),
      stats:            sheetData.stats,
      gaapValidation,
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

// ─── Universal Accounting Model shorthand ────────────────────────────────────
function uam(context, transactionType, postingType, accountSource, configElement, mainAccount) {
  return {
    module: context.module, transactionType: transactionType || null,
    postingType: postingType || null, accountSource: accountSource || null,
    configElement: configElement || null, mainAccount: mainAccount || null,
  };
}

// ─── D365 driver suggestions ──────────────────────────────────────────────────
function buildD365Drivers(issues, context, transactionType) {
  const seen = new Set();
  const drivers = [];
  const add = (d) => { if (!seen.has(d.driver)) { seen.add(d.driver); drivers.push(d); } };

  const mod      = moduleLoader.loadModule(context.module);
  const modLabel = mod.metadata.label;

  issues.forEach(issue => {
    if (issue.type === 'WRONG_ACCOUNT' && issue.actualSource) {
      add({ driver: issue.actualSource.source,
            path: issue.expectedSource?.d365Path || issue.actualSource.d365Path,
            action: issue.sourceComparison?.actionRequired || `Update account mapping for: ${transactionType}`,
            priority: 'high' });
      return;
    }
    switch (issue.type) {
      case 'WRONG_ACCOUNT':
        add({ driver: `${modLabel} Posting Profile`,
              path: `${modLabel} ▸ Setup ▸ Posting Profiles`,
              action: `Update "${transactionType || 'transaction'}" account mapping`, priority: 'high' });
        break;
      case 'MISSING_ENTRY':
        add({ driver: 'Batch Job Scheduler',
              path: 'System Administration ▸ Inquiries ▸ Batch Jobs',
              action: 'Verify periodic batch jobs completed successfully', priority: 'medium' });
        break;
      case 'UNBALANCED_VOUCHER':
        add({ driver: 'Subledger Reconciliation',
              path: 'General Ledger ▸ Periodic Tasks ▸ Subledger Journal Accounting Entries',
              action: 'Run reconciliation to identify and fix imbalance', priority: 'critical' });
        break;
      case 'PMA_NOT_POSTED':
        add({ driver: 'FrenchRegulatoryParameters',
              path: issue.expectedSource?.d365Path || 'Fixed Assets ▸ Setup ▸ Fixed Asset Parameters ▸ French Regulatory',
              action: 'Enable PMA and configure posting accounts', priority: 'medium' });
        break;
      case 'ACCRUAL_REVERSAL_MISSING':
        add({ driver: 'ProjectGroup',
              path: issue.rootCause?.d365Path || 'Project Management and Accounting ▸ Setup ▸ Project Groups',
              action: issue.rootCause?.action || 'Configure Reversal principle in Project Group Estimates tab and verify Accruals batch job.',
              priority: 'critical' });
        break;
      case 'MISSING_REVERSAL_LINE':
      case 'WRONG_BS_ACCOUNT':
        add({ driver: issue.rootCause?.driver || 'ProjectPostingProfile',
              path: issue.rootCause?.d365Path || 'Project Management and Accounting ▸ Setup ▸ Posting ▸ Posting',
              action: issue.rootCause?.action || 'Update accrual BS account in Project Posting Profile.',
              priority: 'high' });
        break;
      case 'PL_NOT_NEUTRALIZED':
        add({ driver: 'ProjectGroup',
              path: issue.rootCause?.d365Path || 'Project Management and Accounting ▸ Setup ▸ Project Groups',
              action: issue.rootCause?.action || 'Verify reversal principle and re-run the Accruals batch job for affected periods.',
              priority: 'high' });
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
    totalIssues: 0, criticalCount: 0, errorCount: 0, warningCount: 0,
    issuesByType: {}, overallStatus: 'clean', sourceBreakdown: {}, moduleBreakdown: {},
    dualGaap: null,
  };

  const collect = (issues, modName) => {
    issues.forEach(issue => {
      summary.totalIssues++;
      if      (issue.severity === 'critical') summary.criticalCount++;
      else if (issue.severity === 'high')     summary.errorCount++;
      else                                    summary.warningCount++;
      summary.issuesByType[issue.type] = (summary.issuesByType[issue.type] || 0) + 1;
      if (issue.actualSource?.source) {
        const src = issue.actualSource.source;
        summary.sourceBreakdown[src] = (summary.sourceBreakdown[src] || 0) + 1;
      }
      const mn = issue.universalModel?.module || modName || 'unknown';
      summary.moduleBreakdown[mn] = (summary.moduleBreakdown[mn] || 0) + 1;
    });
  };

  if (results.scenarioAnalysis) {
    results.scenarioAnalysis.findings.forEach(f => collect(f.issues, results.context?.module));
  }
  if (results.voucherAnalysis) {
    Object.values(results.voucherAnalysis).forEach(sheet =>
      sheet.vouchers.forEach(v => collect(v.issues, v.module))
    );
  }

  summary.overallStatus =
    summary.criticalCount > 0 ? 'critical' :
    summary.errorCount    > 0 ? 'error'    :
    summary.warningCount  > 0 ? 'warning'  : 'clean';

  summary.topRootCauses = Object.entries(summary.issuesByType)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([type, count]) => ({ type, count, title: ROOT_CAUSES[type]?.title || type }));

  summary.topSources = Object.entries(summary.sourceBreakdown)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  // ── Aggregate dual-GAAP summary across all sheets ─────────────────────────
  if (results.voucherAnalysis) {
    const dg = { isDualGaap: false, totalEntries: 0, correct: 0, incorrect: 0, missing: 0, conflicting: 0, consistencyErrors: 0 };
    Object.values(results.voucherAnalysis).forEach(sheet => {
      const gv = sheet.gaapValidation;
      if (!gv?.isDualGaap) return;
      dg.isDualGaap       = true;
      dg.totalEntries     += gv.gaapSummary.totalEntries;
      dg.correct          += gv.gaapSummary.correct;
      dg.incorrect        += gv.gaapSummary.incorrect;
      dg.missing          += gv.gaapSummary.missing;
      dg.conflicting      += gv.gaapSummary.conflicting;
      dg.consistencyErrors+= gv.gaapSummary.consistencyErrors;
    });
    if (dg.isDualGaap) {
      dg.coveragePct  = dg.totalEntries > 0 ? Math.round((dg.correct / dg.totalEntries) * 100) : 0;
      dg.overallStatus =
        dg.conflicting > 0 || dg.incorrect > 0 ? 'error'   :
        dg.missing     > 0                      ? 'warning' : 'clean';
      summary.dualGaap = dg;
    }
  }

  return summary;
}

module.exports = { runDiagnostic };
