'use strict';

const {
  ROOT_CAUSES,
  COMMON_ACCOUNT_ERRORS,
  TRANSACTION_RULES,
  getAccountName,
} = require('./accountingRules');

/**
 * Analyse a single grouped voucher object and return a findings record.
 */
function analyseVoucher(voucher, context) {
  const issues = [];
  const { module, gaap, pma, country } = context;
  const gaapKey = gaap === 'dual_gaap' ? 'french_gaap' : gaap;
  const countryCode = country === 'FR' ? 'FR' : 'US';

  // 1 ── Balance check
  if (!voucher.isBalanced) {
    issues.push({
      type: 'UNBALANCED_VOUCHER',
      severity: 'critical',
      code: ROOT_CAUSES.UNBALANCED_VOUCHER.code,
      title: ROOT_CAUSES.UNBALANCED_VOUCHER.title,
      detail: `Imbalance of ${voucher.imbalance.toFixed(2)}. DR = ${voucher.totalDebit.toFixed(2)},  CR = ${voucher.totalCredit.toFixed(2)}`,
      fix: ROOT_CAUSES.UNBALANCED_VOUCHER.fix,
    });
  }

  // 2 ── Detect transaction type from account patterns
  const detectedType = detectTransactionType(voucher, module);

  // 3 ── Validate accounts against rules
  if (detectedType !== 'unknown') {
    const ruleSet = TRANSACTION_RULES[module]?.[gaapKey]?.[detectedType];
    if (ruleSet) {
      const accountIssues = validateAccountsAgainstRules(
        voucher.entries, ruleSet.entries, countryCode
      );
      issues.push(...accountIssues);

      // 4 ── PMA check for depreciations
      if (pma && detectedType === 'depreciation' && ruleSet.pmaEntries) {
        const hasPMA = voucher.entries.some(e =>
          ruleSet.pmaEntries.some(pe =>
            pe.accounts.some(a => e.account.startsWith(a))
          )
        );
        if (!hasPMA) {
          issues.push({
            type: 'PMA_NOT_POSTED',
            severity: 'medium',
            code: ROOT_CAUSES.PMA_NOT_POSTED.code,
            title: ROOT_CAUSES.PMA_NOT_POSTED.title,
            detail: 'PMA is active but no provision entry (68725 DR / 1510 CR) found in this depreciation voucher.',
            fix: ROOT_CAUSES.PMA_NOT_POSTED.fix,
          });
        }
      }
    }
  }

  // 5 ── Known misconfiguration patterns
  voucher.entries.forEach(entry => {
    const pattern = COMMON_ACCOUNT_ERRORS[entry.account];
    if (!pattern) return;
    const alreadyFlagged = issues.some(i =>
      i.type === 'WRONG_ACCOUNT' && i._entry?.account === entry.account
    );
    if (!alreadyFlagged) {
      issues.push({
        type: 'WRONG_ACCOUNT',
        severity: 'high',
        code: ROOT_CAUSES.WRONG_ACCOUNT.code,
        title: 'Known D365 Misconfiguration Pattern Detected',
        detail: pattern.detail,
        fix: ROOT_CAUSES.WRONG_ACCOUNT.fix,
        _entry: entry,
        expectedAccounts: pattern.shouldBe,
      });
    }
  });

  const severity = issues.length === 0 ? 'clean'
    : issues.some(i => i.severity === 'critical') ? 'critical'
    : issues.some(i => i.severity === 'high')     ? 'high'
    : 'medium';

  return {
    voucherId:    voucher.voucherId,
    date:         voucher.date,
    entries:      voucher.entries,
    totalDebit:   voucher.totalDebit,
    totalCredit:  voucher.totalCredit,
    isBalanced:   voucher.isBalanced,
    detectedType,
    issues,
    suggestions:  buildSuggestions(issues, context, detectedType),
    severity,
    status:       issues.length === 0 ? 'clean' : 'issues',
  };
}

// ─── Account validation ───────────────────────────────────────────────────────
function validateAccountsAgainstRules(entries, ruleEntries, countryCode) {
  const issues = [];

  entries.forEach(entry => {
    const side     = entry.debit > 0 ? 'debit' : 'credit';
    const sideRules = ruleEntries.filter(r => r.side === side);
    if (sideRules.length === 0) return;

    const validPrefixes = sideRules.flatMap(r => r.accounts);
    const isValid = validPrefixes.some(p => entry.account.startsWith(p));
    if (isValid) return;

    const expectedDesc = sideRules.map(r => `${r.accounts.join(' / ')} (${r.label})`).join('  OR  ');
    const actualName   = getAccountName(entry.account, countryCode);

    issues.push({
      type:     'WRONG_ACCOUNT',
      severity: 'high',
      code:     ROOT_CAUSES.WRONG_ACCOUNT.code,
      title:    ROOT_CAUSES.WRONG_ACCOUNT.title,
      detail:   `${side.toUpperCase()} ${entry.account} "${actualName}" — Expected: ${expectedDesc}`,
      fix:      ROOT_CAUSES.WRONG_ACCOUNT.fix,
      _entry:   entry,
      expectedPrefixes: validPrefixes,
    });
  });

  return issues;
}

// ─── Transaction type detection from account patterns ────────────────────────
function detectTransactionType(voucher, module) {
  const dr = voucher.debitAccounts  || [];
  const cr = voucher.creditAccounts || [];

  const any = (list, prefixes) => list.some(a => prefixes.some(p => a.startsWith(p)));

  if (module === 'lease') {
    if (any(dr, ['231','232','2318','2319','2321','2328']) && any(cr, ['168','1681','1682']))
      return 'recognition';
    if (any(dr, ['6811','6812']) && any(cr, ['281','2818','28154']))
      return 'depreciation';
    if (any(dr, ['661','6618','6615']) && any(cr, ['168','1688']))
      return 'interest_accrual';
    if (any(dr, ['168','1681','16881']) && any(cr, ['512']))
      return 'payment';
  }

  if (module === 'fixed_assets') {
    if (any(dr, ['21','2154','2157','2182','2051']) && any(cr, ['40','401','404']))
      return 'acquisition';
    if (any(dr, ['6811','6812']) && any(cr, ['28','281']))
      return 'depreciation';
    if (any(dr, ['28','281']) && any(cr, ['21','2154','2157']))
      return 'disposal';
  }

  return 'unknown';
}

// ─── Fix suggestions ──────────────────────────────────────────────────────────
function buildSuggestions(issues, context, transactionType) {
  const seen = new Set();
  const suggestions = [];

  const add = (s) => {
    if (!seen.has(s.action)) { seen.add(s.action); suggestions.push(s); }
  };

  issues.forEach(issue => {
    if (issue.type === 'WRONG_ACCOUNT') {
      const path = context.module === 'lease'
        ? 'Lease ▸ Setup ▸ Lease Posting Profiles'
        : 'Fixed Assets ▸ Setup ▸ Fixed Asset Posting Profiles';
      add({ priority: 1, action: 'Review posting profile account mappings', path, detail: `Update account for: ${transactionType || 'transaction'}` });
    }
    if (issue.type === 'UNBALANCED_VOUCHER') {
      add({ priority: 0, action: 'Investigate voucher imbalance', path: 'General Ledger ▸ Inquiries ▸ Voucher transactions', detail: 'Search by voucher number; reverse and repost' });
    }
    if (issue.type === 'PMA_NOT_POSTED') {
      add({ priority: 2, action: 'Configure PMA in French regulatory setup', path: 'Fixed Assets ▸ Setup ▸ Fixed Asset Parameters', detail: 'Enable PMA; map accounts 68725 DR / 1510 CR' });
    }
  });

  return suggestions.sort((a, b) => a.priority - b.priority);
}

module.exports = { analyseVoucher, detectTransactionType };
