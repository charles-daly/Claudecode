'use strict';

const {
  ROOT_CAUSES,
  COMMON_ACCOUNT_ERRORS,
  getAccountName,
} = require('./accountingRules');

const {
  resolveAccountSource,
  resolveAccountPair,
  resolveVoucherSources,
} = require('./accountSourceResolver');

const { moduleLoader } = require('./moduleLoader');

/**
 * Analyse a single grouped voucher object and return a full findings record.
 * All transaction rules are now loaded from the module plugin pack.
 */
function analyseVoucher(voucher, context) {
  const issues = [];
  const { module, gaap, pma, country } = context;
  const gaapKey     = gaap === 'dual_gaap' ? 'french_gaap' : (gaap || 'french_gaap');
  const countryCode = country === 'FR' ? 'FR' : 'US';

  // 1 ── Balance check ────────────────────────────────────────────────────────
  if (!voucher.isBalanced) {
    issues.push({
      type:     'UNBALANCED_VOUCHER',
      severity: 'critical',
      code:     ROOT_CAUSES.UNBALANCED_VOUCHER.code,
      title:    ROOT_CAUSES.UNBALANCED_VOUCHER.title,
      detail:   `Imbalance of ${voucher.imbalance.toFixed(2)}. DR = ${voucher.totalDebit.toFixed(2)},  CR = ${voucher.totalCredit.toFixed(2)}`,
      fix:      ROOT_CAUSES.UNBALANCED_VOUCHER.fix,
      actualSource:     null,
      expectedSource:   null,
      sourceComparison: null,
      universalModel:   { module, postingType: null, accountSource: null, configElement: null },
    });
  }

  // 2 ── Detect transaction type from module transactions ─────────────────────
  const detectedType = detectTransactionType(voucher, module);

  // 3 ── Resolve sources for every line ──────────────────────────────────────
  const sourceMap = resolveVoucherSources(voucher, detectedType, context);

  // 4 ── Validate accounts against module transaction rules ───────────────────
  if (detectedType && detectedType !== 'unknown') {
    const mod   = moduleLoader.loadModule(module);
    const txDef = mod.transactions[detectedType];

    if (txDef) {
      const applicableEntries = (txDef.entries || []).filter(
        e => !e.gaap || e.gaap === 'all' || e.gaap === gaapKey
      );

      const accountIssues = validateAccountsAgainstRules(
        voucher.entries, applicableEntries, countryCode, detectedType, context
      );
      issues.push(...accountIssues);

      // 5 ── PMA check ───────────────────────────────────────────────────────
      if (pma && detectedType === 'Depreciation' && txDef.pmaEntries) {
        const pmaEntries = txDef.pmaEntries.filter(
          e => !e.gaap || e.gaap === 'all' || e.gaap === gaapKey
        );
        const hasPMA = voucher.entries.some(e =>
          pmaEntries.some(pe => pe.accounts.some(a => e.account.startsWith(a)))
        );
        if (!hasPMA) {
          const expectedPMASrc = resolveAccountSource({
            module, transactionType: detectedType, side: 'debit', account: '68725', context,
          });
          issues.push({
            type:     'PMA_NOT_POSTED',
            severity: 'medium',
            code:     ROOT_CAUSES.PMA_NOT_POSTED.code,
            title:    ROOT_CAUSES.PMA_NOT_POSTED.title,
            detail:   'PMA is active but no provision entry (68725 DR / 1510 CR) found in this depreciation voucher.',
            fix:      ROOT_CAUSES.PMA_NOT_POSTED.fix,
            actualSource:     null,
            expectedSource:   expectedPMASrc,
            sourceComparison: {
              sameSource:     false,
              severity:       'missing',
              explanation:    `PMA entry absent. Expected: ${expectedPMASrc.source} → "${expectedPMASrc.field}".`,
              actionRequired: `Configure PMA accounts in: ${expectedPMASrc.d365Path}`,
            },
            universalModel: {
              module,
              transactionType: detectedType,
              postingType:     'debit',
              accountSource:   expectedPMASrc.source,
              configElement:   expectedPMASrc.field,
              mainAccount:     '68725',
            },
          });
        }
      }
    }
  }

  // 6 ── Module-specific and global known error patterns ─────────────────────
  const mod       = moduleLoader.loadModule(module);
  const txDef     = detectedType && detectedType !== 'unknown' ? mod.transactions[detectedType] : null;
  const modErrors = txDef?.knownErrors || {};

  voucher.entries.forEach(entry => {
    const pattern = modErrors[entry.account] || COMMON_ACCOUNT_ERRORS[entry.account];
    if (!pattern) return;

    const alreadyFlagged = issues.some(i =>
      i.type === 'WRONG_ACCOUNT' && i._entry?.account === entry.account
    );
    if (alreadyFlagged) return;

    const side = entry.debit > 0 ? 'debit' : 'credit';
    const pair = resolveAccountPair({
      module, transactionType: detectedType || 'unknown',
      side, actualAccount: entry.account, expectedAccount: pattern.shouldBe[0], context,
    });

    issues.push({
      type:             'WRONG_ACCOUNT',
      severity:         'high',
      code:             ROOT_CAUSES.WRONG_ACCOUNT.code,
      title:            'Known D365 Misconfiguration Pattern Detected',
      detail:           pattern.detail,
      fix:              pair.comparison?.actionRequired || ROOT_CAUSES.WRONG_ACCOUNT.fix,
      _entry:           entry,
      expectedAccounts: pattern.shouldBe,
      actualSource:     pair.actual,
      expectedSource:   pair.expected,
      sourceComparison: pair.comparison,
      universalModel: {
        module,
        transactionType: detectedType,
        postingType:     side,
        accountSource:   pair.actual?.source,
        configElement:   pair.actual?.field,
        mainAccount:     entry.account,
      },
    });
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
    module,
    sourceMap,
    issues,
    suggestions:  buildSuggestions(issues, context, detectedType),
    severity,
    status:       issues.length === 0 ? 'clean' : 'issues',
  };
}

// ─── Account validation against module transaction rules ──────────────────────
function validateAccountsAgainstRules(entries, ruleEntries, countryCode, transactionType, context) {
  const issues = [];

  entries.forEach(entry => {
    const side      = entry.debit > 0 ? 'debit' : 'credit';
    const sideRules = ruleEntries.filter(r => r.side === side);
    if (sideRules.length === 0) return;

    const validPrefixes = sideRules.flatMap(r => r.accounts).filter(a => a !== '');
    if (validPrefixes.length === 0) return; // wildcard GL manual — always valid

    const isValid = validPrefixes.some(p => entry.account.startsWith(p));
    if (isValid) return;

    const expectedRepresentative = validPrefixes[0] || '';
    const pair = resolveAccountPair({
      module: context.module, transactionType, side,
      actualAccount: entry.account, expectedAccount: expectedRepresentative, context,
    });

    const actualName   = getAccountName(entry.account, countryCode);
    const expectedDesc = sideRules.map(r => `${r.accounts.join(' / ')} (${r.label})`).join('  OR  ');

    issues.push({
      type:     'WRONG_ACCOUNT',
      severity: 'high',
      code:     ROOT_CAUSES.WRONG_ACCOUNT.code,
      title:    ROOT_CAUSES.WRONG_ACCOUNT.title,
      detail:   `${side.toUpperCase()} ${entry.account} "${actualName}" — Expected: ${expectedDesc}`,
      fix:      pair.comparison?.actionRequired || ROOT_CAUSES.WRONG_ACCOUNT.fix,
      _entry:   entry,
      expectedPrefixes: validPrefixes,
      actualSource:     pair.actual,
      expectedSource:   pair.expected,
      sourceComparison: pair.comparison,
      universalModel: {
        module:          context.module,
        transactionType,
        postingType:     side,
        accountSource:   pair.actual?.source,
        configElement:   pair.actual?.field,
        mainAccount:     entry.account,
      },
    });
  });

  return issues;
}

// ─── Transaction type detection (module-driven) ───────────────────────────────
function detectTransactionType(voucher, module) {
  const dr  = voucher.debitAccounts  || [];
  const cr  = voucher.creditAccounts || [];
  const any = (list, prefixes) => {
    const nonEmpty = prefixes.filter(p => p);
    if (nonEmpty.length === 0) return true;
    return list.some(a => nonEmpty.some(p => a.startsWith(p)));
  };

  try {
    const mod = moduleLoader.loadModule(module);
    for (const [txKey, txDef] of Object.entries(mod.transactions)) {
      const det = txDef.detection;
      if (!det) continue;
      if (any(dr, det.debitPrefixes || []) && any(cr, det.creditPrefixes || [])) return txKey;
    }
  } catch (_) { /* fall through */ }

  return 'unknown';
}

// ─── Fix suggestions ──────────────────────────────────────────────────────────
function buildSuggestions(issues, context, transactionType) {
  const seen        = new Set();
  const suggestions = [];
  const add = (s) => { if (!seen.has(s.action)) { seen.add(s.action); suggestions.push(s); } };

  issues.forEach(issue => {
    if (issue.type === 'WRONG_ACCOUNT' && issue.actualSource) {
      const path = issue.expectedSource?.d365Path || issue.actualSource.d365Path;
      add({ priority: 1,
            action: `Review account configuration in ${issue.actualSource.source}`,
            path, detail: issue.sourceComparison?.actionRequired || `Update mapping for: ${transactionType}` });
    } else if (issue.type === 'WRONG_ACCOUNT') {
      const meta = moduleLoader.loadModule(context.module)?.metadata;
      add({ priority: 1,
            action: 'Review posting profile account mappings',
            path: meta ? `${meta.label} > Setup > Posting Profiles` : 'Module Setup > Posting Profiles',
            detail: `Update account for: ${transactionType}` });
    }
    if (issue.type === 'UNBALANCED_VOUCHER') {
      add({ priority: 0, action: 'Investigate voucher imbalance',
            path: 'General Ledger ▸ Inquiries ▸ Voucher transactions',
            detail: 'Search by voucher number; reverse and repost' });
    }
    if (issue.type === 'PMA_NOT_POSTED') {
      add({ priority: 2, action: 'Configure PMA in French regulatory setup',
            path: issue.expectedSource?.d365Path || 'Fixed Assets ▸ Setup ▸ Fixed Asset Parameters',
            detail: 'Enable PMA; map accounts 68725 DR / 1510 CR' });
    }
  });

  return suggestions.sort((a, b) => a.priority - b.priority);
}

module.exports = { analyseVoucher, detectTransactionType };
