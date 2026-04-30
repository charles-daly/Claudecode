'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Account classification metadata (category labels) ───────────────────────
let _classData = null;
function _loadClassData() {
  if (_classData) return _classData;
  try {
    const p = path.join(__dirname, '../../data/accountClassification.json');
    _classData = JSON.parse(fs.readFileSync(p, 'utf-8')).accounts || {};
  } catch (_) {
    _classData = {};
  }
  return _classData;
}

function getAccountCategory(account) {
  const data = _loadClassData();
  return data[String(account)] || null;
}

// ─── Per-entry GAAP issue impact ──────────────────────────────────────────────

function calculateIssueImpact(entry, ga, sheetName) {
  const amount = (entry.debit || 0) || (entry.credit || 0);
  if (amount === 0 || !ga || ga.mappingStatus === 'correct') return null;

  const side = (entry.debit || 0) > 0 ? 'debit' : 'credit';
  let impactType, severity, plImpact = 0, bsImpact = 0, issueDescription;

  switch (ga.mappingStatus) {
    case 'incorrect':
      if (ga.classificationMismatch) {
        // Actual FR account has different class from expected FR → cross-type misstatement
        impactType = 'Financial Misstatement';
        severity   = 'High';
        plImpact   = amount;   // P&L is misstated by this amount
        bsImpact   = amount;   // BS is misstated by this amount
        issueDescription =
          `US ${ga.usAccount} (${ga.usClassification}) posted to FR ${ga.frAccount}` +
          ` (${ga.frClassification}) — expected ${ga.expectedFrAccount || '?'}` +
          ` (${ga.expFrClassification || '?'})`;
      } else {
        // Same-type wrong account → reclassification needed, no net P&L/BS misstatement
        impactType = 'Classification Issue';
        severity   = 'Medium';
        issueDescription =
          `FR ${ga.frAccount} used instead of expected ${ga.expectedFrAccount || '?'}` +
          ` — reclassification required within ${ga.frClassification}`;
      }
      break;

    case 'missing':
    case 'missing_fr':
      impactType = 'Missing Mapping';
      severity   = 'Medium';
      if (ga.usClassification === 'P&L') plImpact = amount;
      else if (ga.usClassification === 'BS') bsImpact = amount;
      issueDescription = `No FR mapping defined for US account ${ga.usAccount || '?'} — cross-GAAP traceability unavailable`;
      break;

    case 'conflicting':
      impactType = 'Classification Issue';
      severity   = 'Medium';
      issueDescription = `Conflicting FR mappings for US account ${ga.usAccount || '?'} — inconsistent cross-GAAP presentation`;
      break;

    default:
      return null;
  }

  const usCategory = getAccountCategory(ga.usAccount);
  const frCategory = getAccountCategory(ga.frAccount);

  return {
    voucherId:          entry.voucher         || '–',
    date:               entry.date            || '–',
    module:             entry.module          || 'Unknown',
    transactionType:    entry.transactionType || '–',
    sheetName,
    usAccount:          ga.usAccount          || '–',
    frAccount:          ga.frAccount          || '–',
    expectedFrAccount:  ga.expectedFrAccount  || '–',
    description:        entry.description     || '',
    amount,
    side,
    currency:           entry.currency        || 'EUR',
    exchangeRate:       entry.exchangeRate     || 1,
    impactType,
    severity,
    plImpact,
    bsImpact,
    fxImpact:           0,
    impactAmount:       impactType === 'Financial Misstatement' ? amount : amount,
    mappingStatus:      ga.mappingStatus,
    usClassification:   ga.usClassification   || '–',
    frClassification:   ga.frClassification   || '–',
    expFrClassification:ga.expFrClassification || '–',
    issueDescription,
    usCategory:         usCategory?.category  || null,
    frCategory:         frCategory?.category  || null,
    project:            entry.project         || null,
    category:           entry.category        || null,
  };
}

// ─── Per-entry FX impact ──────────────────────────────────────────────────────

function calculateFxImpact(entry, sheetName, baseCurrency = 'EUR') {
  const amount       = (entry.debit || 0) || (entry.credit || 0);
  const currency     = entry.currency     || baseCurrency;
  const exchangeRate = entry.exchangeRate || 1;

  if (!amount || currency === baseCurrency || Math.abs(exchangeRate - 1) < 0.0001) return null;

  const fxDiff = parseFloat((amount * Math.abs(1 - exchangeRate)).toFixed(2));
  if (fxDiff < 0.01) return null;

  const severity = fxDiff >= 5000 ? 'High' : fxDiff >= 500 ? 'Medium' : 'Low';

  return {
    voucherId:       entry.voucher         || '–',
    date:            entry.date            || '–',
    module:          entry.module          || 'Unknown',
    transactionType: entry.transactionType || '–',
    sheetName,
    usAccount:       entry.usAccount       || entry.account || '–',
    frAccount:       entry.frAccount       || '–',
    expectedFrAccount: '–',
    description:     entry.description    || '',
    amount,
    side:            (entry.debit || 0) > 0 ? 'debit' : 'credit',
    currency,
    exchangeRate,
    impactType:      'FX Difference',
    severity,
    plImpact:        0,
    bsImpact:        0,
    fxImpact:        fxDiff,
    impactAmount:    fxDiff,
    mappingStatus:   entry.gaapAnalysis?.mappingStatus || null,
    usClassification: entry.gaapAnalysis?.usClassification || '–',
    frClassification: entry.gaapAnalysis?.frClassification || '–',
    expFrClassification: '–',
    issueDescription: `${amount.toLocaleString()} ${currency} @ ${exchangeRate} → FX exposure ${fxDiff.toFixed(2)} ${baseCurrency}`,
    project:          entry.project  || null,
    category:         entry.category || null,
  };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function aggregateImpacts(impacts) {
  const byImpactType = {};
  const byModule     = {};
  const byAccount    = {};
  const totals = {
    totalFinancialMisstatement: 0,
    totalClassificationIssues:  0,
    totalFxDifference:          0,
    totalMissingMapping:        0,
    plImpact:                   0,
    bsImpact:                   0,
    fxImpact:                   0,
  };

  impacts.forEach(impact => {
    const amt = impact.impactAmount || 0;

    byImpactType[impact.impactType] = (byImpactType[impact.impactType] || 0) + amt;

    switch (impact.impactType) {
      case 'Financial Misstatement': totals.totalFinancialMisstatement += amt; break;
      case 'Classification Issue':   totals.totalClassificationIssues  += amt; break;
      case 'FX Difference':          totals.totalFxDifference          += amt; break;
      case 'Missing Mapping':        totals.totalMissingMapping        += amt; break;
    }
    totals.plImpact += Math.abs(impact.plImpact || 0);
    totals.bsImpact += Math.abs(impact.bsImpact || 0);
    totals.fxImpact += impact.fxImpact || 0;

    const mod = impact.module || 'Unknown';
    if (!byModule[mod]) byModule[mod] = { total: 0, count: 0, byType: {} };
    byModule[mod].total += amt;
    byModule[mod].count++;
    byModule[mod].byType[impact.impactType] =
      (byModule[mod].byType[impact.impactType] || 0) + amt;

    const acct = impact.usAccount || '–';
    if (!byAccount[acct]) byAccount[acct] = { total: 0, count: 0, impactTypes: new Set() };
    byAccount[acct].total += amt;
    byAccount[acct].count++;
    byAccount[acct].impactTypes.add(impact.impactType);
  });

  // Serialise Set → Array for JSON safety
  Object.values(byAccount).forEach(a => {
    a.impactTypes = [...a.impactTypes];
  });

  const topAccounts = Object.entries(byAccount)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([account, data]) => ({ account, ...data }));

  return { totals, byImpactType, byModule, byAccount, topAccounts };
}

// ─── Impact summary ───────────────────────────────────────────────────────────

function buildImpactSummary(aggregates, impacts) {
  const { totals } = aggregates;
  const highCount   = impacts.filter(i => i.severity === 'High').length;
  const mediumCount = impacts.filter(i => i.severity === 'Medium').length;
  const lowCount    = impacts.filter(i => i.severity === 'Low').length;

  const overallSeverity =
    highCount   > 0 ? 'High'   :
    mediumCount > 0 ? 'Medium' : 'Low';

  const grandTotal = parseFloat(
    (totals.totalFinancialMisstatement + totals.totalFxDifference + totals.totalMissingMapping).toFixed(2)
  );

  return {
    totalImpacts: impacts.length,
    highCount,
    mediumCount,
    lowCount,
    overallSeverity,
    totalFinancialMisstatement: parseFloat(totals.totalFinancialMisstatement.toFixed(2)),
    totalClassificationIssues:  parseFloat(totals.totalClassificationIssues.toFixed(2)),
    totalFxDifference:          parseFloat(totals.totalFxDifference.toFixed(2)),
    totalMissingMapping:        parseFloat(totals.totalMissingMapping.toFixed(2)),
    netPlImpact:                parseFloat(totals.plImpact.toFixed(2)),
    netBsImpact:                parseFloat(totals.bsImpact.toFixed(2)),
    netFxImpact:                parseFloat(totals.fxImpact.toFixed(2)),
    grandTotal,
  };
}

// ─── Main public API ──────────────────────────────────────────────────────────

function runFinancialImpact(diagnosticResult, context = {}) {
  if (!diagnosticResult?.voucherAnalysis) return null;

  const baseCurrency = context.baseCurrency || 'EUR';
  const impacts = [];

  Object.entries(diagnosticResult.voucherAnalysis).forEach(([sheetName, sheetData]) => {
    const gv = sheetData.gaapValidation;
    if (!gv?.isDualGaap) return;

    gv.entries.forEach(entry => {
      const ga = entry.gaapAnalysis;

      // GAAP issue impact (incorrect / missing / conflicting)
      if (ga && ga.mappingStatus && ga.mappingStatus !== 'correct') {
        const impact = calculateIssueImpact(entry, ga, sheetName);
        if (impact) impacts.push(impact);
      }

      // FX impact (applies to any entry with a non-base currency)
      const fxImpact = calculateFxImpact(entry, sheetName, baseCurrency);
      if (fxImpact) impacts.push(fxImpact);
    });
  });

  if (impacts.length === 0) return null;

  const aggregates = aggregateImpacts(impacts);
  const summary    = buildImpactSummary(aggregates, impacts);

  return { impacts, aggregates, summary };
}

module.exports = { runFinancialImpact, calculateIssueImpact, calculateFxImpact, aggregateImpacts };
