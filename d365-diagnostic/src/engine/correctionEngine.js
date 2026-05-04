'use strict';

/**
 * correctionEngine.js
 * For each diagnostic issue, determines the correction type (GL_ONLY,
 * PROJECT_SUBLEDGER, HYBRID, CONFIG_ONLY) and generates:
 *   - A corrective GL journal (DR/CR pairs)
 *   - A D365 subledger action (for project/PMA issues)
 *   - A business impact explanation
 *
 * Does NOT modify data on disk. Returns correction objects for review/export.
 */

// ─── D365 navigation paths ────────────────────────────────────────────────────
const D365_PATHS = {
  GL_JOURNAL:      'General ledger > Journal entries > General journals',
  AP_JOURNAL:      'Accounts payable > Invoices > Invoice journal',
  AR_JOURNAL:      'Accounts receivable > Invoices > Free text invoices',
  PMA_JOURNAL:     'Project management > Journals > Hour / Expense / Fee journal',
  FA_JOURNAL:      'Fixed assets > Journals > Fixed assets journal',
  POSTING_PROFILE: 'Accounts payable/receivable > Setup > Posting profiles',
  GAAP_MAPPING:    'D365 Diagnostic → Configuration → GAAP Mapping',
  FX_REVALUATION:  'General ledger > Periodic tasks > Foreign currency revaluation',
  ACCRUAL:         'General ledger > Journal entries > Periodic journals',
};

// ─── Classification rules ─────────────────────────────────────────────────────

const PMA_ISSUE_TYPES    = new Set(['PMA_NOT_POSTED', 'PL_NOT_NEUTRALIZED']);
const CONFIG_ISSUE_TYPES = new Set(['MISSING_MAPPING', 'CONFLICTING_MAPPING', 'INCORRECT_FR_ACCOUNT', 'INCORRECT_BE_ACCOUNT']);
const GL_ISSUE_TYPES     = new Set([
  'WRONG_ACCOUNT', 'UNBALANCED_VOUCHER', 'MISSING_ENTRY',
  'CLASSIFICATION_MISMATCH', 'FX_IMBALANCE', 'FX_ROUNDING',
  'RATE_OVERRIDE', 'ACCRUAL_REVERSAL_MISSING', 'MISSING_REVERSAL_LINE', 'WRONG_BS_ACCOUNT',
]);

function classifyCorrection(issue, context) {
  const type = issue.type;
  if (CONFIG_ISSUE_TYPES.has(type)) return 'CONFIG_ONLY';
  if (PMA_ISSUE_TYPES.has(type)) {
    return context?.module === 'pma' ? 'HYBRID' : 'GL_ONLY';
  }
  if (GL_ISSUE_TYPES.has(type)) return 'GL_ONLY';
  return 'GL_ONLY';
}

// ─── GL Journal generation ────────────────────────────────────────────────────

const SUSPENSE_ACCOUNT      = '471000';   // General suspense / clearing
const FX_GAIN_LOSS_ACCOUNT  = '668000';   // FX gain/loss
const ROUNDING_ACCOUNT      = '658000';   // Rounding differences
const DEFERRED_REVENUE_ACCT = '487000';   // Deferred income (PMA neutralisation)

function _round(n) { return Math.round((n || 0) * 100) / 100; }

function generateGLJournal(issue, context) {
  const ccy = context?.accountingCurrency || 'EUR';
  const amt = _round(issue.amount || issue.impactAmount || 0);
  if (amt === 0 && issue.type !== 'UNBALANCED_VOUCHER') return null;

  switch (issue.type) {

    case 'WRONG_ACCOUNT':
    case 'WRONG_BS_ACCOUNT':
    case 'CLASSIFICATION_MISMATCH': {
      const wrong   = issue.actualAccount || issue.account || '?';
      const correct = issue.expectedAccount || issue.expectedFrAccount || '?';
      const side    = issue.side || 'DR';
      return {
        description: `Reclassification — move ${wrong} → ${correct}`,
        d365Path: D365_PATHS.GL_JOURNAL,
        lines: [
          { side: side === 'DR' ? 'DR' : 'CR', account: correct, amount: amt, currency: ccy, description: `Correct posting — ${issue.type}` },
          { side: side === 'DR' ? 'CR' : 'DR', account: wrong,   amount: amt, currency: ccy, description: `Reverse incorrect posting` },
        ],
        isBalanced: true,
      };
    }

    case 'INCORRECT_FR_ACCOUNT': {
      const wrong   = issue.frAccount || '?';
      const correct = issue.expectedFrAccount || '?';
      return {
        description: `Correct French PCG account ${wrong} → ${correct}`,
        d365Path: D365_PATHS.GL_JOURNAL,
        lines: [
          { side: 'DR', account: correct, amount: amt, currency: ccy, description: `Correct FR account — ${issue.usAccount}` },
          { side: 'CR', account: wrong,   amount: amt, currency: ccy, description: `Reverse wrong FR account` },
        ],
        isBalanced: true,
      };
    }

    case 'UNBALANCED_VOUCHER': {
      const imbalance = _round(issue.imbalance || issue.amount || 0);
      const isDebitShort = imbalance > 0; // positive imbalance = more DR than CR needed
      return {
        description: `Balance voucher ${issue.voucherId} — corrective entry ${Math.abs(imbalance).toFixed(2)} ${ccy}`,
        d365Path: D365_PATHS.GL_JOURNAL,
        lines: [
          { side: isDebitShort ? 'CR' : 'DR', account: SUSPENSE_ACCOUNT, amount: Math.abs(imbalance), currency: ccy, description: `Balancing entry — suspense` },
        ],
        isBalanced: true,
        note: `Review the suspense account ${SUSPENSE_ACCOUNT} and reclassify to the correct account once identified.`,
      };
    }

    case 'MISSING_ENTRY': {
      return {
        description: `Post missing journal entry — ${issue.detail || 'see issue detail'}`,
        d365Path: D365_PATHS.GL_JOURNAL,
        lines: [
          { side: 'DR', account: issue.expectedAccount || SUSPENSE_ACCOUNT, amount: amt, currency: ccy, description: `Missing entry — DR side` },
          { side: 'CR', account: SUSPENSE_ACCOUNT, amount: amt, currency: ccy, description: `Missing entry — CR side (verify account)` },
        ],
        isBalanced: true,
        note: 'Verify the correct accounts before posting. This is a suggested journal based on available data.',
      };
    }

    case 'FX_IMBALANCE': {
      const imbalance = _round(issue.fxImbalance || issue.amount || 0);
      return {
        description: `FX imbalance correction — ${Math.abs(imbalance).toFixed(2)} ${ccy}`,
        d365Path: D365_PATHS.FX_REVALUATION,
        lines: [
          { side: imbalance > 0 ? 'CR' : 'DR', account: FX_GAIN_LOSS_ACCOUNT, amount: Math.abs(imbalance), currency: ccy, description: `FX ${imbalance > 0 ? 'gain' : 'loss'} adjustment` },
          { side: imbalance > 0 ? 'DR' : 'CR', account: SUSPENSE_ACCOUNT,      amount: Math.abs(imbalance), currency: ccy, description: `FX clearing` },
        ],
        isBalanced: true,
        note: `Consider running the D365 Foreign Currency Revaluation job instead of a manual journal. Path: ${D365_PATHS.FX_REVALUATION}.`,
      };
    }

    case 'FX_ROUNDING': {
      const rounding = _round(issue.roundingAmount || issue.amount || 0);
      return {
        description: `FX rounding adjustment — ${Math.abs(rounding).toFixed(4)} ${ccy}`,
        d365Path: D365_PATHS.GL_JOURNAL,
        lines: [
          { side: rounding > 0 ? 'DR' : 'CR', account: ROUNDING_ACCOUNT, amount: Math.abs(rounding), currency: ccy, description: 'Rounding difference' },
          { side: rounding > 0 ? 'CR' : 'DR', account: SUSPENSE_ACCOUNT, amount: Math.abs(rounding), currency: ccy, description: 'Rounding clearing' },
        ],
        isBalanced: true,
      };
    }

    case 'ACCRUAL_REVERSAL_MISSING':
    case 'MISSING_REVERSAL_LINE': {
      return {
        description: `Post missing accrual reversal for voucher ${issue.voucherId}`,
        d365Path: D365_PATHS.ACCRUAL,
        lines: [
          { side: 'DR', account: issue.bsAccount || SUSPENSE_ACCOUNT, amount: amt, currency: ccy, description: `Reverse accrual BS side` },
          { side: 'CR', account: issue.plAccount  || SUSPENSE_ACCOUNT, amount: amt, currency: ccy, description: `Reverse accrual P&L side` },
        ],
        isBalanced: true,
        note: `Use D365 Periodic journals (Path: ${D365_PATHS.ACCRUAL}) to post the reversal in the correct period.`,
      };
    }

    case 'PMA_NOT_POSTED':
    case 'PL_NOT_NEUTRALIZED': {
      return {
        description: `Post PMA / P&L neutralisation entry`,
        d365Path: D365_PATHS.GL_JOURNAL,
        lines: [
          { side: 'DR', account: issue.plAccount  || SUSPENSE_ACCOUNT,      amount: amt, currency: ccy, description: 'PMA neutralisation — P&L debit' },
          { side: 'CR', account: DEFERRED_REVENUE_ACCT, amount: amt, currency: ccy, description: 'PMA neutralisation — deferred revenue' },
        ],
        isBalanced: true,
        note: 'Verify the PMA provision amount against the project revenue schedule before posting.',
      };
    }

    default:
      return null;
  }
}

// ─── Subledger action generation ──────────────────────────────────────────────

function generateSubledgerAction(issue, context) {
  if (!['PMA_NOT_POSTED', 'PL_NOT_NEUTRALIZED', 'MISSING_ENTRY'].includes(issue.type)) return null;
  if (context?.module !== 'pma' && issue.type !== 'PMA_NOT_POSTED') return null;

  const ccy = context?.accountingCurrency || 'EUR';
  const amt = _round(issue.amount || 0);

  return {
    type:            issue.type === 'PMA_NOT_POSTED' ? 'PMA_PROVISION' : 'ADJUSTMENT',
    projectId:       issue.projectId || context?.projectId || '(see voucher)',
    transactionType: issue.type === 'PMA_NOT_POSTED' ? 'Provision for Losses' : 'Cost Adjustment',
    category:        issue.type === 'PMA_NOT_POSTED' ? 'WIP Adjustment' : 'P&L Neutralisation',
    amount:          amt,
    currency:        ccy,
    description:     issue.detail || `Post ${issue.type} adjustment`,
    d365Path:        D365_PATHS.PMA_JOURNAL,
    glImpact: {
      note:    'The D365 posting profile will automatically generate the GL entries below when this subledger transaction is posted.',
      entries: generateGLJournal(issue, context)?.lines || [],
    },
  };
}

// ─── Config action generation ─────────────────────────────────────────────────

function generateConfigAction(issue) {
  switch (issue.type) {
    case 'MISSING_MAPPING':
      return {
        type:    'ADD_MAPPING',
        action:  `Add a mapping for US account ${issue.usAccount || issue.account || '?'} in GAAP Mapping.`,
        d365Path: D365_PATHS.GAAP_MAPPING,
        fields:  { usAccount: issue.usAccount || issue.account, frAccount: '(required)', beAccount: '(optional)', type: '(required)' },
      };
    case 'CONFLICTING_MAPPING':
      return {
        type:    'FIX_MAPPING',
        action:  `Standardise the mapping for US account ${issue.usAccount || '?'}: ensure only one French PCG account is mapped.`,
        d365Path: D365_PATHS.GAAP_MAPPING,
        currentMappings: issue.frAccounts || [],
      };
    case 'INCORRECT_FR_ACCOUNT':
      return {
        type:    'UPDATE_MAPPING',
        action:  `Update posting profile so that US account ${issue.usAccount} maps to FR account ${issue.expectedFrAccount} instead of ${issue.frAccount}.`,
        d365Path: D365_PATHS.POSTING_PROFILE,
        current: issue.frAccount,
        correct: issue.expectedFrAccount,
      };
    case 'INCORRECT_BE_ACCOUNT':
      return {
        type:    'UPDATE_MAPPING',
        action:  `Update posting profile so that US account ${issue.usAccount} maps to BE account ${issue.expectedBeAccount} instead of ${issue.beAccount}.`,
        d365Path: D365_PATHS.POSTING_PROFILE,
        current: issue.beAccount,
        correct: issue.expectedBeAccount,
      };
    default:
      return null;
  }
}

// ─── Business impact ──────────────────────────────────────────────────────────

const IMPACT_TEMPLATES = {
  WRONG_ACCOUNT:            (iss) => `Incorrect account ${iss.actualAccount || iss.account} was used. The correct account ${iss.expectedAccount || '(see fix)'} must be used to ensure accurate P&L or BS classification. If uncorrected, financial statements will be misstated by approximately ${_fmt(iss.amount)}.`,
  UNBALANCED_VOUCHER:       (iss) => `Voucher ${iss.voucherId} is out of balance by ${_fmt(iss.amount)}. An unbalanced voucher causes the Trial Balance to be incorrect and must be resolved before period close.`,
  PMA_NOT_POSTED:           (iss) => `The French PMA provision has not been posted for this project transaction. This understates the provision for losses on the project and misrepresents WIP on the balance sheet. Impact: ${_fmt(iss.amount)}.`,
  MISSING_ENTRY:            (iss) => `A required journal entry is absent. The financial statements are incomplete for the period, potentially understating a liability or overstating revenue by ${_fmt(iss.amount)}.`,
  CLASSIFICATION_MISMATCH:  (iss) => `Account ${iss.frAccount} (${iss.frClassification}) was used where ${iss.expectedFrAccount} (${iss.expFrClassification}) is required. This misclassifies the entry between P&L and Balance Sheet, distorting both statements.`,
  INCORRECT_FR_ACCOUNT:     (iss) => `Wrong French PCG account ${iss.frAccount} used. The correct account ${iss.expectedFrAccount} should be posted. This causes GAAP reconciliation differences in French statutory reporting.`,
  MISSING_MAPPING:          (iss) => `Account ${iss.usAccount || iss.account} has no GAAP mapping. Cross-GAAP traceability is unavailable for ${_fmt(iss.amount)}, which may affect IFRS or local GAAP reconciliation.`,
  CONFLICTING_MAPPING:      (iss) => `US account ${iss.usAccount} maps to multiple French accounts (${(iss.frAccounts || []).join(', ')}). This creates inconsistent GAAP reconciliation and may cause audit findings.`,
  FX_IMBALANCE:             (iss) => `A currency imbalance of ${_fmt(iss.amount)} exists in the accounting currency (${iss.accountingCurrency || 'EUR'}). This overstates or understates the FX gain/loss and distorts the P&L.`,
  FX_ROUNDING:              (iss) => `A minor rounding difference of ${_fmt(iss.amount)} exists. While individually immaterial, accumulated rounding differences can affect period-close reconciliations.`,
  RATE_OVERRIDE:            (iss) => `Exchange rate was manually overridden. If the override was incorrect, the transaction is recorded at the wrong rate, causing FX gain/loss misstatement of approximately ${_fmt(iss.amount)}.`,
  ACCRUAL_REVERSAL_MISSING: (iss) => `The auto-reversal for accrual voucher ${iss.voucherId} was not posted. The accrued amount (${_fmt(iss.amount)}) remains permanently in the P&L instead of reversing in the following period, overstating costs.`,
  MISSING_REVERSAL_LINE:    (iss) => `A reversal entry line is missing from voucher ${iss.voucherId}. The partial reversal leaves a residual balance that will carry forward incorrectly into subsequent periods.`,
  PL_NOT_NEUTRALIZED:       (iss) => `The P&L has not been neutralised for this project period-end entry. Under French GAAP (and D365 PMA), the P&L impact should be deferred to match revenue recognition. The income statement is overstated by ${_fmt(iss.amount)}.`,
  WRONG_BS_ACCOUNT:         (iss) => `Wrong balance sheet account used. The asset or liability classification is incorrect, which will misstate the balance sheet structure and may fail GAAP compliance checks.`,
  INCORRECT_BE_ACCOUNT:     (iss) => `Belgian PCMN account ${iss.beAccount} should be ${iss.expectedBeAccount}. This affects Belgian statutory reporting and PCMN reconciliation accuracy.`,
};

function _fmt(amount) {
  if (!amount) return '(amount unknown)';
  return `€${Math.abs(amount).toLocaleString('en', { maximumFractionDigits: 2 })}`;
}

function generateBusinessImpact(issue, correctionType) {
  const tpl = IMPACT_TEMPLATES[issue.type];
  const description = tpl ? tpl(issue) : `Issue of type ${issue.type} requires correction.`;

  const wipImpact       = ['PMA_NOT_POSTED', 'PL_NOT_NEUTRALIZED', 'MISSING_ENTRY'].includes(issue.type);
  const revenueImpact   = ['WRONG_ACCOUNT', 'CLASSIFICATION_MISMATCH', 'PMA_NOT_POSTED'].includes(issue.type);
  const profitImpact    = ['WRONG_ACCOUNT', 'CLASSIFICATION_MISMATCH', 'FX_IMBALANCE', 'PMA_NOT_POSTED', 'ACCRUAL_REVERSAL_MISSING', 'MISSING_ENTRY'].includes(issue.type);

  return {
    description,
    wipImpact:        wipImpact     ? `WIP balance may be misstated by ${_fmt(issue.amount)} on project ${issue.projectId || '(see voucher)'}.` : null,
    revenueImpact:    revenueImpact ? `Revenue recognition timing or amount may be incorrect for this transaction.` : null,
    profitImpact:     profitImpact  ? `Project / entity profitability is impacted — estimated effect: ${_fmt(issue.amount)}.` : null,
    requiresPeriodClose: ['ACCRUAL_REVERSAL_MISSING', 'MISSING_REVERSAL_LINE', 'PMA_NOT_POSTED'].includes(issue.type),
    priority: issue.severity === 'critical' ? 'Immediate' : issue.severity === 'high' ? 'Before period close' : 'Routine',
  };
}

// ─── Confidence score ─────────────────────────────────────────────────────────

function calculateConfidence(issue) {
  if (issue.expectedAccount && issue.actualAccount) return 0.95;
  if (issue.expectedFrAccount && issue.frAccount)   return 0.90;
  if (['FX_IMBALANCE', 'UNBALANCED_VOUCHER'].includes(issue.type)) return 0.95;
  if (['MISSING_MAPPING', 'CONFLICTING_MAPPING'].includes(issue.type)) return 1.0;
  if (issue.fix)                                    return 0.80;
  return 0.65;
}

// ─── Main: suggest fix for one issue ─────────────────────────────────────────

function suggestFix(issue, context) {
  // Pre-validate — return partial result on blockers, never throw
  const validation = preValidate(issue, context);
  if (!validation.valid) {
    return {
      issueType:       issue?.type || 'UNKNOWN',
      severity:        issue?.severity || 'unknown',
      voucherId:       issue?.voucherId || null,
      correctionType:  'UNKNOWN',
      glJournal:       null,
      subledger:       null,
      configAction:    null,
      businessImpact:  null,
      confidence:      0,
      canAutoGenerate: false,
      existingFix:     issue?.fix || null,
      validationError: validation.blockers,
      validationWarnings: validation.warnings,
      partial: true,
    };
  }

  let correctionType, glJournal, subledger, configAction, businessImpact, confidence;
  try { correctionType = classifyCorrection(issue, context); } catch { correctionType = 'GL_ONLY'; }
  try { glJournal      = correctionType !== 'PROJECT_SUBLEDGER' ? generateGLJournal(issue, context) : null; } catch { glJournal = null; }
  try { subledger      = correctionType !== 'GL_ONLY' ? generateSubledgerAction(issue, context) : null; } catch { subledger = null; }
  try { configAction   = correctionType === 'CONFIG_ONLY' ? generateConfigAction(issue) : null; } catch { configAction = null; }
  try { businessImpact = generateBusinessImpact(issue, correctionType); } catch { businessImpact = { description: 'Impact analysis unavailable.', priority: 'Routine' }; }
  try { confidence     = calculateConfidence(issue); } catch { confidence = 0.5; }

  return {
    issueType:      issue.type,
    severity:       issue.severity,
    voucherId:      issue.voucherId || null,
    correctionType,
    glJournal,
    subledger,
    configAction,
    businessImpact,
    confidence,
    canAutoGenerate: Boolean(glJournal || configAction),
    existingFix:    issue.fix || null,
    validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    partial: false,
  };
}

// ─── Bulk: suggest fixes for all issues in a diagnostic result ───────────────

function suggestFixesForResult(diagnosticResult, context) {
  if (!diagnosticResult) {
    return { fixes: [], groups: [], summary: { total: 0, glOnly: 0, subledger: 0, hybrid: 0, configOnly: 0, highConf: 0 }, error: 'No diagnostic result provided' };
  }

  const issues = [];
  try {
    if (diagnosticResult.voucherAnalysis) {
      Object.entries(diagnosticResult.voucherAnalysis).forEach(([sheet, data]) => {
        (data.vouchers || []).forEach(v =>
          (v.issues || []).forEach(iss => issues.push({ ...iss, sheet }))
        );
      });
    }
    if (diagnosticResult.scenarioAnalysis) {
      (diagnosticResult.scenarioAnalysis.findings || []).forEach(f =>
        (f.issues || []).forEach(iss => issues.push({ ...iss, scenarioId: f.id }))
      );
    }
  } catch (e) {
    return { fixes: [], groups: [], summary: { total: 0, glOnly: 0, subledger: 0, hybrid: 0, configOnly: 0, highConf: 0 }, error: `Failed to collect issues: ${e.message}` };
  }

  const fixes = issues.map(iss => { try { return suggestFix(iss, context); } catch { return null; } }).filter(Boolean);

  const groups = {};
  fixes.forEach((fix, i) => {
    const key = `${fix.issueType}::${issues[i]?.account || issues[i]?.usAccount || ''}`;
    if (!groups[key]) groups[key] = { key, issueType: fix.issueType, count: 0, fixes: [] };
    groups[key].count++;
    groups[key].fixes.push(fix);
  });

  return {
    fixes,
    groups: Object.values(groups).sort((a, b) => b.count - a.count),
    summary: {
      total:       fixes.length,
      glOnly:      fixes.filter(f => f.correctionType === 'GL_ONLY').length,
      subledger:   fixes.filter(f => f.correctionType === 'PROJECT_SUBLEDGER').length,
      hybrid:      fixes.filter(f => f.correctionType === 'HYBRID').length,
      configOnly:  fixes.filter(f => f.correctionType === 'CONFIG_ONLY').length,
      highConf:    fixes.filter(f => f.confidence >= 0.85).length,
      partial:     fixes.filter(f => f.partial).length,
    },
  };
}

// ─── Pre-validation ───────────────────────────────────────────────────────────

/**
 * Validates an issue object before attempting to generate a correction.
 * Returns { valid, blockers, warnings } — never throws.
 */
function preValidate(issue, context) {
  if (!issue || typeof issue !== 'object') {
    return {
      valid: false,
      blockers: [{ field: 'issue', message: 'No issue object provided', fix: 'Pass a valid issue from the diagnostic result' }],
      warnings: [],
    };
  }

  const blockers = [];
  const warnings = [];

  // Account check
  const account = issue.usAccount || issue.account;
  if (!account && !['UNBALANCED_VOUCHER', 'MISSING_ENTRY'].includes(issue.type)) {
    blockers.push({
      field: 'account',
      message: 'Issue has no account reference',
      fix: 'Verify the diagnostic engine returned the correct issue structure',
    });
  }

  // Amount check
  if (issue.amount !== undefined && issue.amount !== null) {
    if (typeof issue.amount === 'number' && isNaN(issue.amount)) {
      blockers.push({ field: 'amount', message: 'Amount is NaN — cannot generate a journal', fix: 'Check source entry for numeric debit/credit values' });
    } else if (typeof issue.amount === 'number' && issue.amount < 0) {
      warnings.push({ field: 'amount', message: `Amount is negative (${issue.amount}) — journal signs will be reversed automatically` });
    }
  }

  // Type check
  if (!issue.type) {
    blockers.push({ field: 'type', message: 'Issue has no type field', fix: 'Run the diagnostic again — issue.type must be set' });
  }

  // Currency check
  if (context?.accountingCurrency) {
    const ccy = String(context.accountingCurrency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(ccy)) {
      warnings.push({ field: 'currency', message: `Accounting currency '${ccy}' is not a standard 3-letter ISO code`, fix: 'Set accountingCurrency to e.g. EUR, USD, GBP' });
    }
  }

  return { valid: blockers.length === 0, blockers, warnings };
}

module.exports = {
  preValidate, classifyCorrection, suggestFix, suggestFixesForResult,
  generateGLJournal, generateSubledgerAction, generateConfigAction, generateBusinessImpact,
};
