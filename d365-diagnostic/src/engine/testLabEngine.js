'use strict';

/**
 * testLabEngine.js
 * Test Lab: generate test cases from templates, run them through the
 * diagnostic engine, compare actual vs expected results, and export to Excel.
 */

const ExcelJS = require('exceljs');
const { runDiagnostic } = require('./diagnosticEngine');

// ─── Scenario templates ───────────────────────────────────────────────────────

const SCENARIO_TEMPLATES = {
  BASIC_PAYABLE: {
    label: 'Basic AP Entry (correct)',
    description: 'A standard vendor invoice entry that should produce no issues.',
    defaultModule: 'procurement',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '500100', frAccount: '607', beAccount: '600', description: 'COGS purchase', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '200000', frAccount: '401', beAccount: '440', description: 'Trade payable', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: [],
      expectedStatus: 'clean',
    }),
  },

  BASIC_RECEIVABLE: {
    label: 'Basic AR Entry (correct)',
    description: 'A standard customer invoice entry that should produce no issues.',
    defaultModule: 'sales',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '110000', frAccount: '411', beAccount: '400', description: 'Trade receivable', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '400200', frAccount: '701', beAccount: '700', description: 'Sales revenue', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: [],
      expectedStatus: 'clean',
    }),
  },

  UNBALANCED_VOUCHER: {
    label: 'Unbalanced Voucher (should fail)',
    description: 'A voucher where debits do not equal credits — must flag UNBALANCED_VOUCHER.',
    defaultModule: 'general_ledger',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '110000', frAccount: '411', beAccount: '400', description: 'Receivable', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '400200', frAccount: '701', beAccount: '700', description: 'Revenue', debit: 0, credit: cfg.amount * 0.9, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: ['UNBALANCED_VOUCHER'],
      expectedStatus: 'critical',
    }),
  },

  MISSING_MAPPING: {
    label: 'Missing GAAP Mapping (should warn)',
    description: 'Entry uses a US account with no mapping — must flag MISSING_MAPPING.',
    defaultModule: 'general_ledger',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '999000', frAccount: '699', beAccount: '', description: 'Unmapped account', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '200000', frAccount: '401', beAccount: '440', description: 'Trade payable', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: ['MISSING_MAPPING'],
      expectedStatus: 'warning',
    }),
  },

  CLASSIFICATION_MISMATCH: {
    label: 'French PCG Classification Mismatch',
    description: 'Entry posts to a BS French account where a P&L account is expected.',
    defaultModule: 'sales',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '110000', frAccount: '411', beAccount: '400', description: 'Trade receivable', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '400200', frAccount: '487', beAccount: '489', description: 'Deferred income (wrong — should be 701)', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: ['INCORRECT_FR_ACCOUNT', 'CLASSIFICATION_MISMATCH'],
      expectedStatus: 'error',
    }),
  },

  FX_ENTRY: {
    label: 'FX Multi-Currency Entry',
    description: 'USD invoice with EUR accounting currency — validates FX handling.',
    defaultModule: 'procurement',
    defaultGaap: 'us_gaap',
    defaultCurrency: 'USD',
    generate: (cfg) => {
      const rate = cfg.rate || 1.08;
      const amtEUR = Math.round(cfg.amount / rate * 100) / 100;
      return {
        entries: [
          { voucher: 'T001', date: '2026-01-15', usAccount: '500100', frAccount: '607', beAccount: '600', description: 'USD purchase', debit: cfg.amount, credit: 0, currency: 'USD', exchangeRate: rate },
          { voucher: 'T001', date: '2026-01-15', usAccount: '200000', frAccount: '401', beAccount: '440', description: 'USD payable', debit: 0, credit: cfg.amount, currency: 'USD', exchangeRate: rate },
        ],
        expectedIssues: [],
        expectedStatus: 'clean',
      };
    },
  },

  WRONG_ACCOUNT: {
    label: 'Wrong Account Usage',
    description: 'Salary expense posted to professional services account — must flag WRONG_ACCOUNT.',
    defaultModule: 'pma',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '52000', frAccount: '622', beAccount: '611', description: 'Salary (wrong account — should be 641)', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '215000', frAccount: '421', beAccount: '455', description: 'Salaries payable', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: ['WRONG_ACCOUNT', 'INCORRECT_FR_ACCOUNT'],
      expectedStatus: 'error',
    }),
  },

  ACCRUAL_WITH_REVERSAL: {
    label: 'Accrual with Correct Auto-Reversal',
    description: 'Period-end accrual posting with its reversal — should produce no issues.',
    defaultModule: 'pma',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-31', usAccount: '550000', frAccount: '622', beAccount: '611', description: 'Accrual — services (forward)', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-31', usAccount: '205000', frAccount: '408', beAccount: '449', description: 'Accrued liability (forward)', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T002', date: '2026-02-01', usAccount: '205000', frAccount: '408', beAccount: '449', description: 'Accrued liability (reversal)', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T002', date: '2026-02-01', usAccount: '550000', frAccount: '622', beAccount: '611', description: 'Services expense (reversal)', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: [],
      expectedStatus: 'clean',
    }),
  },

  TRIPLE_GAAP_CORRECT: {
    label: 'Triple-GAAP Entry (US / FR / BE all correct)',
    description: 'Validates all three GAAP account columns are mapped correctly.',
    defaultModule: 'sales',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-15', usAccount: '110000', frAccount: '411', beAccount: '400', description: 'AR — all GAAPs correct', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-15', usAccount: '400200', frAccount: '701', beAccount: '700', description: 'Revenue — all GAAPs correct', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: [],
      expectedStatus: 'clean',
    }),
  },

  DEPRECIATION: {
    label: 'Fixed Asset Depreciation',
    description: 'Standard depreciation journal with accumulated depreciation counter-account.',
    defaultModule: 'fixed_assets',
    defaultGaap: 'french_gaap',
    defaultCurrency: 'EUR',
    generate: (cfg) => ({
      entries: [
        { voucher: 'T001', date: '2026-01-31', usAccount: '510000', frAccount: '6811', beAccount: '630', description: 'Depreciation expense', debit: cfg.amount, credit: 0, currency: cfg.currency, exchangeRate: 1 },
        { voucher: 'T001', date: '2026-01-31', usAccount: '159000', frAccount: '2818', beAccount: '229', description: 'Accumulated depreciation', debit: 0, credit: cfg.amount, currency: cfg.currency, exchangeRate: 1 },
      ],
      expectedIssues: [],
      expectedStatus: 'clean',
    }),
  },
};

// ─── Generate test case ───────────────────────────────────────────────────────

function generateTestCase(config) {
  const {
    scenarioType,
    module:   mod       = 'general_ledger',
    gaap                = 'french_gaap',
    currency            = 'EUR',
    amount              = 10000,
    rate                = 1.08,
    name,
  } = config;

  const template = SCENARIO_TEMPLATES[scenarioType];
  if (!template) {
    return { success: false, error: `Unknown scenario type: ${scenarioType}. Available: ${Object.keys(SCENARIO_TEMPLATES).join(', ')}` };
  }

  const generated  = template.generate({ amount, currency, rate });
  const voucherId  = `TC_${scenarioType}_${Date.now()}`;

  // Build the parsedData structure expected by the diagnostic engine
  const entries  = generated.entries;
  const vouchers = {};
  for (const e of entries) {
    if (!vouchers[e.voucher]) {
      vouchers[e.voucher] = { voucherId: e.voucher, date: e.date, entries: [], totalDebit: 0, totalCredit: 0 };
    }
    vouchers[e.voucher].entries.push(e);
    vouchers[e.voucher].totalDebit  += e.debit  || 0;
    vouchers[e.voucher].totalCredit += e.credit || 0;
  }
  Object.values(vouchers).forEach(v => {
    v.imbalance  = Math.abs(v.totalDebit - v.totalCredit);
    v.isBalanced = v.imbalance < 0.01;
  });

  const voucherData = {
    'TestSheet': { entries, vouchers, stats: {
      totalEntries: entries.length,
      totalDebit:   entries.reduce((s, e) => s + (e.debit  || 0), 0),
      totalCredit:  entries.reduce((s, e) => s + (e.credit || 0), 0),
      isDualGaap:   entries.some(e => e.frAccount),
      isTripleGaap: entries.some(e => e.beAccount),
    }},
  };

  return {
    success: true,
    id: voucherId,
    name: name || template.label,
    description: template.description,
    scenarioType,
    config: { module: mod, gaap, currency, amount, rate },
    voucherData,
    context: {
      module: mod,
      gaap,
      country: gaap === 'french_gaap' || gaap === 'belgium_gaap' ? 'FR' : 'US',
      accountingCurrency: 'EUR',
      pma: mod === 'pma',
      projectGroup: { accrualEnabled: false, autoReverse: false },
    },
    expectedIssues: generated.expectedIssues,
    expectedStatus: generated.expectedStatus,
    createdAt: new Date().toISOString(),
  };
}

// ─── Run test case ────────────────────────────────────────────────────────────

function runTestCase(testCase) {
  if (!testCase?.voucherData) {
    return { success: false, error: 'Invalid test case — no voucher data' };
  }

  let actualResult;
  try {
    actualResult = runDiagnostic({
      context:     testCase.context,
      scenarios:   [],
      voucherData: testCase.voucherData,
    });
  } catch (err) {
    return { success: false, error: err.message };
  }

  const actualStatus = actualResult.summary?.overallStatus || 'unknown';

  // Collect actual issue types
  const actualIssueTypes = new Set();
  if (actualResult.voucherAnalysis) {
    Object.values(actualResult.voucherAnalysis).forEach(data =>
      (data.vouchers || []).forEach(v =>
        (v.issues || []).forEach(iss => actualIssueTypes.add(iss.type))
      )
    );
  }

  // Compare expected vs actual
  const expectedSet = new Set(testCase.expectedIssues || []);
  const assertions  = [];

  // Status assertion
  const statusPass = testCase.expectedStatus === 'any' || actualStatus === testCase.expectedStatus;
  assertions.push({
    name: 'Overall status',
    expected: testCase.expectedStatus,
    actual:   actualStatus,
    pass:     statusPass,
  });

  // Expected issues must all appear
  for (const type of expectedSet) {
    const found = actualIssueTypes.has(type);
    assertions.push({
      name: `Issue present: ${type}`,
      expected: 'present',
      actual:   found ? 'present' : 'absent',
      pass:     found,
    });
  }

  // If expected clean, no issues should appear
  if (testCase.expectedStatus === 'clean') {
    for (const type of actualIssueTypes) {
      assertions.push({
        name: `No unexpected issue: ${type}`,
        expected: 'absent',
        actual:   'present',
        pass:     false,
      });
    }
  }

  const passed = assertions.every(a => a.pass);
  const failedAssertions = assertions.filter(a => !a.pass);

  return {
    success:     true,
    testCaseId:  testCase.id,
    name:        testCase.name,
    passed,
    assertions,
    failedAssertions,
    actualResult,
    summary: {
      total:  assertions.length,
      pass:   assertions.filter(a => a.pass).length,
      fail:   failedAssertions.length,
      actualStatus,
      actualIssueTypes: [...actualIssueTypes],
    },
    executedAt: new Date().toISOString(),
  };
}

// ─── Export to Excel ─────────────────────────────────────────────────────────

async function exportTestResults(testCase, testResult, filePath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'D365 Diagnostic — Test Lab';
  wb.created = new Date();

  const C = { navy: 'FF1A3A5C', green: 'FF22C55E', red: 'FFEF4444', yellow: 'FFF59E0B', white: 'FFFFFFFF', gray: 'FF1A1F2E' };
  const fillSolid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const boldWhite = (size = 10) => ({ bold: true, color: { argb: C.white }, size });

  // ── Sheet 1: Test Overview ────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('1. Test Overview');
    ws.columns = [{ width: 28 }, { width: 50 }];
    const rows = [
      ['Test ID',          testCase.id],
      ['Name',             testCase.name],
      ['Description',      testCase.description],
      ['Scenario Type',    testCase.scenarioType],
      ['Module',           testCase.config?.module || '—'],
      ['GAAP',             testCase.config?.gaap   || '—'],
      ['Currency',         testCase.config?.currency || '—'],
      ['Amount',           testCase.config?.amount || 0],
      ['Expected Status',  testCase.expectedStatus],
      ['Actual Status',    testResult.summary?.actualStatus || '—'],
      ['Result',           testResult.passed ? 'PASS' : 'FAIL'],
      ['Executed At',      testResult.executedAt || '—'],
      ['Assertions Total', testResult.summary?.total || 0],
      ['Assertions Pass',  testResult.summary?.pass  || 0],
      ['Assertions Fail',  testResult.summary?.fail  || 0],
    ];
    ws.getRow(1).values = ['D365 DIAGNOSTIC — TEST LAB REPORT'];
    ws.mergeCells('A1:B1');
    ws.getRow(1).font = boldWhite(14);
    ws.getRow(1).fill = fillSolid(C.navy);
    ws.getRow(1).height = 30;

    rows.forEach((r, i) => {
      const row = ws.getRow(i + 2);
      row.values = r;
      row.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
      row.getCell(2).font = { size: 10 };
      if (r[0] === 'Result') {
        row.getCell(2).font = { bold: true, size: 11, color: { argb: testResult.passed ? C.green : C.red } };
      }
      if (r[0] === 'Actual Status') {
        const statusColor = { clean: C.green, error: 'FFF97316', critical: C.red, warning: C.yellow }[r[1]] || 'FF94A3B8';
        row.getCell(2).font = { bold: true, size: 10, color: { argb: statusColor } };
      }
    });
  }

  // ── Sheet 2: Input Data ───────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('2. Input Data');
    ws.columns = [
      { header: 'Voucher',     key: 'voucher',      width: 12 },
      { header: 'Date',        key: 'date',         width: 12 },
      { header: 'US Account',  key: 'usAccount',    width: 14 },
      { header: 'FR Account',  key: 'frAccount',    width: 14 },
      { header: 'BE Account',  key: 'beAccount',    width: 14 },
      { header: 'Description', key: 'description',  width: 36 },
      { header: 'Debit',       key: 'debit',        width: 14 },
      { header: 'Credit',      key: 'credit',       width: 14 },
      { header: 'Currency',    key: 'currency',     width: 10 },
      { header: 'Rate',        key: 'exchangeRate', width: 10 },
    ];
    ws.getRow(1).font = boldWhite();
    ws.getRow(1).fill = fillSolid(C.navy);

    const allEntries = Object.values(testCase.voucherData || {}).flatMap(s => s.entries || []);
    allEntries.forEach((e, i) => {
      const row = ws.getRow(i + 2);
      row.values = [e.voucher, e.date, e.usAccount, e.frAccount || '', e.beAccount || '', e.description, e.debit, e.credit, e.currency, e.exchangeRate];
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(8).numFmt = '#,##0.00';
      if (i % 2 === 0) row.fill = fillSolid('FF1A1F2E');
    });
  }

  // ── Sheet 3: Expected Results ────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('3. Expected Results');
    ws.columns = [{ width: 28 }, { width: 50 }];
    ws.getRow(1).values = ['Field', 'Expected Value'];
    ws.getRow(1).font = boldWhite();
    ws.getRow(1).fill = fillSolid(C.navy);
    ws.getRow(2).values = ['Overall Status', testCase.expectedStatus];
    ws.getRow(3).values = ['Expected Issues', (testCase.expectedIssues || []).join(', ') || 'None'];
    ws.getRow(4).values = ['Issue Count', testCase.expectedIssues?.length || 0];
  }

  // ── Sheet 4: Actual Results ──────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('4. Actual Results');
    ws.columns = [
      { header: 'Issue Type',  key: 'type',     width: 28 },
      { header: 'Severity',    key: 'severity', width: 12 },
      { header: 'Voucher',     key: 'voucher',  width: 14 },
      { header: 'Detail',      key: 'detail',   width: 60 },
      { header: 'Fix',         key: 'fix',      width: 50 },
    ];
    ws.getRow(1).font = boldWhite();
    ws.getRow(1).fill = fillSolid(C.navy);

    const allIssues = [];
    if (testResult.actualResult?.voucherAnalysis) {
      Object.values(testResult.actualResult.voucherAnalysis).forEach(data =>
        (data.vouchers || []).forEach(v =>
          (v.issues || []).forEach(iss => allIssues.push({ ...iss, voucherId: v.voucherId }))
        )
      );
    }

    if (allIssues.length === 0) {
      ws.getRow(2).values = ['No issues detected', '', '', 'Diagnostic ran cleanly.', ''];
      ws.getRow(2).font   = { color: { argb: C.green }, italic: true };
    } else {
      allIssues.forEach((iss, i) => {
        const row = ws.getRow(i + 2);
        row.values = [iss.type, iss.severity, iss.voucherId, iss.detail || '', iss.fix || ''];
        const sev = iss.severity;
        const bg = sev === 'critical' ? 'FFFEE2E2' : sev === 'high' ? 'FFFFF7ED' : sev === 'medium' ? 'FFFEFCE8' : 'FFF8FAFC';
        for (let c = 1; c <= 5; c++) row.getCell(c).fill = fillSolid(bg);
      });
    }
  }

  // ── Sheet 5: Pass/Fail Summary ───────────────────────────────────────────
  {
    const ws = wb.addWorksheet('5. Pass-Fail Summary');
    ws.columns = [
      { header: 'Assertion',     key: 'name',     width: 36 },
      { header: 'Expected',      key: 'expected', width: 20 },
      { header: 'Actual',        key: 'actual',   width: 20 },
      { header: 'Result',        key: 'result',   width: 12 },
    ];
    ws.getRow(1).font = boldWhite();
    ws.getRow(1).fill = fillSolid(C.navy);

    (testResult.assertions || []).forEach((a, i) => {
      const row = ws.getRow(i + 2);
      row.values = [a.name, a.expected, a.actual, a.pass ? 'PASS' : 'FAIL'];
      const resCell = row.getCell(4);
      resCell.font = { bold: true, color: { argb: a.pass ? C.green : C.red } };
      if (!a.pass) {
        for (let c = 1; c <= 4; c++) row.getCell(c).fill = fillSolid('FFFEE2E2');
      }
    });

    // Summary footer
    const lastRow = (testResult.assertions?.length || 0) + 3;
    ws.getRow(lastRow).values = ['', '', 'OVERALL', testResult.passed ? 'PASS' : 'FAIL'];
    ws.getRow(lastRow).font   = boldWhite(12);
    ws.getRow(lastRow).fill   = fillSolid(testResult.passed ? 'FF15803D' : 'FFB91C1C');
    ws.getRow(lastRow).height = 24;
  }

  await wb.xlsx.writeFile(filePath);
  return { success: true, filePath };
}

// ─── Available templates ──────────────────────────────────────────────────────

function getTemplates() {
  return Object.entries(SCENARIO_TEMPLATES).map(([key, t]) => ({
    key,
    label: t.label,
    description: t.description,
    defaultModule:   t.defaultModule,
    defaultGaap:     t.defaultGaap,
    defaultCurrency: t.defaultCurrency,
  }));
}

module.exports = { generateTestCase, runTestCase, exportTestResults, getTemplates, SCENARIO_TEMPLATES };
