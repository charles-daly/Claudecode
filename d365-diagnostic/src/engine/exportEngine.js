'use strict';

const ExcelJS = require('exceljs');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, ShadingType,
} = require('docx');
const fs = require('fs');
const { ROOT_CAUSES } = require('./accountingRules');
const { traceToText, confidenceLabel } = require('./accountSourceResolver');
const { moduleLoader } = require('./moduleLoader');

// ─── Shared style constants ───────────────────────────────────────────────────
const C = {
  navy:    'FF1A3A5C',
  blue:    'FF3B82F6',
  red:     'FFEF4444',
  orange:  'FFF97316',
  yellow:  'FFF59E0B',
  green:   'FF22C55E',
  white:   'FFFFFFFF',
  light:   'FFF8FAFC',
  redBg:   'FFFEE2E2',
  orangeBg:'FFFFF7ED',
  greenBg: 'FFF0FFF4',
  grayBg:  'FFF1F5F9',
};

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// ════════════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT
// ════════════════════════════════════════════════════════════════════════════════
async function exportToExcel({ diagnosticResult, context, filePath }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'D365 Diagnostic Engine';
  wb.created  = new Date();

  addSummarySheet(wb, diagnosticResult, context);

  if (diagnosticResult.voucherAnalysis) {
    Object.entries(diagnosticResult.voucherAnalysis).forEach(([name, data]) =>
      addVoucherSheet(wb, data, name, context)
    );
  }

  if (diagnosticResult.scenarioAnalysis) {
    addScenarioSheet(wb, diagnosticResult.scenarioAnalysis, context);
  }

  addRootCauseSheet(wb, diagnosticResult.summary);
  addAccountSourceSheet(wb, diagnosticResult);
  addUniversalModelSheet(wb, diagnosticResult);
  addAccrualSheet(wb, diagnosticResult, context);
  addDualGaapSheet(wb, diagnosticResult);
  addFinancialImpactSheet(wb, diagnosticResult);
  addCurrencySheet(wb, diagnosticResult);

  await wb.xlsx.writeFile(filePath);
}

// ─── Summary sheet ────────────────────────────────────────────────────────────
function addSummarySheet(wb, result, context) {
  const ws = wb.addWorksheet('Executive Summary');
  ws.columns = [{ width: 32 }, { width: 28 }, { width: 20 }, { width: 20 }, { width: 45 }];

  // Title banner
  ws.mergeCells('A1:E1');
  const title = ws.getCell('A1');
  title.value = 'D365 ACCOUNTING DIAGNOSTIC REPORT';
  title.font = { bold: true, size: 16, color: { argb: C.white } };
  title.fill = fill(C.navy);
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 38;

  // Sub-title
  ws.mergeCells('A2:E2');
  const sub = ws.getCell('A2');
  sub.value = `Generated: ${new Date().toLocaleString()}`;
  sub.font = { italic: true, size: 11, color: { argb: 'FF64748B' } };
  sub.alignment = { horizontal: 'center' };

  let r = 4;

  const section = (label) => {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: C.navy } };
    ws.getRow(r).height = 22;
    r++;
  };

  const row2 = (label, value, valueFill) => {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font  = { bold: true, size: 11 };
    ws.getCell(`B${r}`).value = value;
    if (valueFill) {
      ws.getCell(`B${r}`).fill = fill(valueFill);
      ws.getCell(`B${r}`).font = { bold: true, color: { argb: C.white } };
    }
    r++;
  };

  section('CONTEXT');
  const modMeta = moduleLoader.loadModule(context.module || 'lease').metadata;
  row2('Module',          modMeta.label || context.module || 'N/A');
  row2('Country',         context.country || 'N/A');
  row2('GAAP',            context.gaap || 'N/A');
  row2('PMA Active',      context.pma ? 'Yes' : 'No');
  row2('Accrual Engine',  context.projectGroup?.accrualEnabled ? 'Enabled' : 'Disabled');
  row2('Auto-Reversal',   context.projectGroup?.autoReverse    ? 'Enabled' : 'Disabled');
  r++;

  const s = result.summary || {};
  section('FINDINGS SUMMARY');
  row2('Total Issues',    s.totalIssues  || 0, s.totalIssues  > 0 ? C.red    : null);
  row2('Critical',        s.criticalCount || 0, s.criticalCount > 0 ? C.red    : null);
  row2('High Severity',   s.errorCount    || 0, s.errorCount    > 0 ? C.orange : null);
  row2('Warnings',        s.warningCount  || 0, s.warningCount  > 0 ? C.yellow : null);
  row2('Overall Status',  (s.overallStatus || 'clean').toUpperCase(),
    s.overallStatus === 'critical' ? C.red :
    s.overallStatus === 'error'    ? C.orange :
    s.overallStatus === 'warning'  ? C.yellow : C.green
  );
  r++;

  if (s.topRootCauses?.length) {
    section('TOP ROOT CAUSES');
    ws.getRow(r-1).height = 22;
    s.topRootCauses.forEach(rc => row2(rc.title, `${rc.count} occurrence${rc.count > 1 ? 's' : ''}`));
  }
}

// ─── Voucher sheet ────────────────────────────────────────────────────────────
function addVoucherSheet(wb, sheetData, sheetName, context) {
  const ws = wb.addWorksheet(('Vouchers - ' + sheetName).slice(0, 31));
  const modMeta = moduleLoader.loadModule(context?.module || 'lease').metadata;

  ws.columns = [
    { header: 'Voucher ID',    key: 'voucherId',    width: 20 },
    { header: 'Date',          key: 'date',          width: 14 },
    { header: 'Module',        key: 'module',        width: 22 },
    { header: 'Status',        key: 'status',        width: 11 },
    { header: 'Severity',      key: 'severity',      width: 11 },
    { header: 'Detected Type', key: 'detectedType',  width: 22 },
    { header: 'Account Source',key: 'accountSource', width: 26 },
    { header: 'Total Debit',   key: 'totalDebit',    width: 14 },
    { header: 'Total Credit',  key: 'totalCredit',   width: 14 },
    { header: 'Balanced',      key: 'isBalanced',    width: 10 },
    { header: '# Issues',      key: 'issueCount',    width: 10 },
    { header: 'Issue Summary', key: 'issueSummary',  width: 70 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center' };
  });
  ws.getRow(1).height = 24;

  sheetData.vouchers.forEach(v => {
    const topSrc = v.issues.find(i => i.actualSource)?.actualSource?.source || '–';
    const row = ws.addRow({
      voucherId:    v.voucherId,
      date:         v.date || '',
      module:       modMeta.label || context?.module || '–',
      status:       v.status,
      severity:     v.severity,
      detectedType: v.detectedType || 'unknown',
      accountSource:topSrc,
      totalDebit:   v.totalDebit,
      totalCredit:  v.totalCredit,
      isBalanced:   v.isBalanced ? 'YES' : 'NO',
      issueCount:   v.issues.length,
      issueSummary: v.issues.map(i => `[${i.severity?.toUpperCase()}] ${i.title}`).join(' | '),
    });
    row.getCell('totalDebit').numFmt  = '#,##0.00';
    row.getCell('totalCredit').numFmt = '#,##0.00';

    if (v.severity === 'critical')   row.fill = fill('FFFEE2E2');
    else if (v.severity === 'high')  row.fill = fill('FFFFF7ED');
    else if (v.status   === 'clean') row.fill = fill('FFF0FFF4');
  });

  ws.autoFilter = { from: 'A1', to: 'L1' };
}

// ─── Scenario sheet ───────────────────────────────────────────────────────────
function addScenarioSheet(wb, scenarioAnalysis, context) {
  const ws = wb.addWorksheet('Scenario Analysis');
  const modMeta = moduleLoader.loadModule(context?.module || 'lease').metadata;
  ws.columns = [
    { header: 'Scenario',          key: 'description',     width: 32 },
    { header: 'Module',            key: 'module',          width: 22 },
    { header: 'Transaction Type',  key: 'transactionType', width: 22 },
    { header: 'Account Source',    key: 'accountSource',   width: 26 },
    { header: 'Status',            key: 'status',          width: 12 },
    { header: '# Issues',          key: 'issueCount',      width: 10 },
    { header: 'Issue Details',     key: 'issueDetails',    width: 90 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center' };
  });

  scenarioAnalysis.findings.forEach(f => {
    const topSrc = f.issues.find(i => i.actualSource)?.actualSource?.source || '–';
    const row = ws.addRow({
      description:     f.description,
      module:          modMeta.label || context?.module || '–',
      transactionType: f.transactionType || 'N/A',
      accountSource:   topSrc,
      status:          f.status,
      issueCount:      f.issues.length,
      issueDetails:    f.issues.map(i => `[${i.severity?.toUpperCase()}] ${i.title}: ${i.detail}`).join('\n'),
    });
    row.getCell('issueDetails').alignment = { wrapText: true };
    if (f.status === 'critical') row.fill = fill('FFFEE2E2');
    else if (f.status === 'error') row.fill = fill('FFFFF7ED');
  });
}

// ─── Root cause sheet ─────────────────────────────────────────────────────────
function addRootCauseSheet(wb, summary) {
  const ws = wb.addWorksheet('Root Cause Analysis');
  ws.columns = [
    { header: 'Issue Type',        key: 'type',      width: 28 },
    { header: 'Occurrences',       key: 'count',     width: 14 },
    { header: 'Severity',          key: 'severity',  width: 12 },
    { header: 'Possible Causes',   key: 'causes',    width: 55 },
    { header: 'Recommended Fix',   key: 'fix',       width: 65 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center' };
  });
  ws.getRow(1).height = 24;

  if (!summary?.issuesByType) return;

  Object.entries(summary.issuesByType).forEach(([type, count]) => {
    const rc = ROOT_CAUSES[type] || {};
    const row = ws.addRow({
      type:     rc.title || type,
      count,
      severity: rc.severity || 'medium',
      causes:   (rc.possibleCauses || []).join('  •  '),
      fix:      rc.fix || 'Review system configuration',
    });
    row.getCell('causes').alignment = { wrapText: true };
    row.getCell('fix').alignment    = { wrapText: true };
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// WORD EXPORT
// ════════════════════════════════════════════════════════════════════════════════
async function exportToWord({ diagnosticResult, context, filePath }) {
  const s = diagnosticResult.summary || {};

  const statusColor =
    s.overallStatus === 'critical' ? 'C0392B' :
    s.overallStatus === 'error'    ? 'E67E22' :
    s.overallStatus === 'warning'  ? 'F39C12' : '27AE60';

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children: [

        heading1('D365 ACCOUNTING DIAGNOSTIC REPORT'),
        para(`Generated: ${new Date().toLocaleString()}`, { italics: true, color: '888888', size: 20 }),
        spacer(),

        heading2('1.  DIAGNOSTIC CONTEXT'),
        ctxTable(context),
        spacer(),

        heading2('2.  MODULE'),
        moduleInfoSection(context),
        spacer(),

        heading2('3.  EXECUTIVE SUMMARY'),
        para2('Overall Status: ', (s.overallStatus || 'CLEAN').toUpperCase(), statusColor),
        summaryTable(s),
        spacer(),

        heading2('4.  ROOT CAUSE ANALYSIS'),
        ...rootCauseSection(s),

        ...(diagnosticResult.voucherAnalysis ? [
          heading2('5.  VOUCHER ANALYSIS'),
          ...voucherSection(diagnosticResult.voucherAnalysis),
        ] : []),

        ...(diagnosticResult.scenarioAnalysis ? [
          heading2('6.  SCENARIO ANALYSIS'),
          ...scenarioSection(diagnosticResult.scenarioAnalysis),
        ] : []),

        heading2('7.  ACCOUNT SOURCE DETERMINATION'),
        ...accountSourceSection(diagnosticResult),

        heading2('8.  D365 CONFIGURATION RECOMMENDATIONS'),
        ...recommendations(diagnosticResult, context),

        ...(diagnosticResult.scenarioAnalysis?.findings?.some(f => f.accrualAnalysis) ? [
          heading2('9.  ACCRUAL / AUTO-REVERSAL ANALYSIS'),
          ...accrualSection(diagnosticResult),
        ] : []),

        heading2('10.  DUAL GAAP RECONCILIATION ANALYSIS'),
        ...dualGaapWordSection(diagnosticResult),

        heading2('11.  FINANCIAL IMPACT ANALYSIS'),
        ...financialImpactWordSection(diagnosticResult),

        heading2('12.  MULTI-CURRENCY ANALYSIS'),
        ...currencyWordSection(diagnosticResult),

        spacer(),
        para(
          'This report was generated by D365 Diagnostic Engine. All findings should be reviewed by a certified D365 Finance consultant before any remediation actions are taken.',
          { italics: true, size: 18, color: 'AAAAAA' }
        ),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buf);
}

// ─── Word helpers ─────────────────────────────────────────────────────────────
const heading1 = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 40, color: '1A3A5C' })],
  heading: HeadingLevel.HEADING_1,
  spacing: { after: 240 },
});

const heading2 = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 28, color: '1A3A5C' })],
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 480, after: 160 },
});

const para = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: opts.size || 22, italics: opts.italics, color: opts.color })],
  spacing: { after: opts.after || 100 },
});

const para2 = (label, value, color) => new Paragraph({
  children: [
    new TextRun({ text: label, bold: true, size: 24 }),
    new TextRun({ text: value, bold: true, size: 24, color }),
  ],
  spacing: { after: 160 },
});

const spacer = () => new Paragraph({ text: '', spacing: { after: 160 } });

const bullet = (text) => new Paragraph({
  bullet: { level: 0 },
  children: [new TextRun({ text, size: 20 })],
  spacing: { after: 60 },
});

function moduleInfoSection(ctx) {
  try {
    const mod = moduleLoader.loadModule(ctx?.module || 'lease');
    const meta = mod.metadata;
    const txTypes = Object.entries(mod.transactions || {});
    const sources = Object.keys(mod.sources || {});

    return new Table({
      width: { size: 80, type: WidthType.PERCENTAGE },
      rows: [
        tRow(['Module', meta.label], false, true),
        tRow(['Description', meta.description || '–'], false),
        tRow(['Transaction Types', txTypes.map(([k, v]) => `${k} — ${v.label || ''}`).join(', ')], true),
        tRow(['D365 Sources', sources.filter(s => s !== '_meta').join(', ')], false),
        tRow(['Country / GAAP', `${ctx?.country || '–'} / ${ctx?.gaap || '–'}`], true),
      ],
    });
  } catch (_) {
    return para(`Module: ${ctx?.module || 'unknown'}`, { color: '888888' });
  }
}

function ctxTable(ctx) {
  const rows = [
    ['Module',          ctx.module   || 'N/A'],
    ['Country',         ctx.country  || 'N/A'],
    ['GAAP',            ctx.gaap     || 'N/A'],
    ['PMA Active',      ctx.pma ? 'Yes' : 'No'],
    ['Accrual Engine',  ctx.projectGroup?.accrualEnabled ? 'Enabled' : 'Disabled'],
    ['Auto-Reversal',   ctx.projectGroup?.autoReverse    ? 'Enabled' : 'Disabled'],
  ];
  return new Table({
    width: { size: 50, type: WidthType.PERCENTAGE },
    rows: rows.map(([k, v], i) => tRow([k, v], i % 2 === 0)),
  });
}

function summaryTable(s) {
  const rows = [
    ['Total Issues',  String(s.totalIssues   || 0)],
    ['Critical',      String(s.criticalCount || 0)],
    ['High Severity', String(s.errorCount    || 0)],
    ['Warnings',      String(s.warningCount  || 0)],
  ];
  return new Table({
    width: { size: 40, type: WidthType.PERCENTAGE },
    rows: [
      tRow(['Metric', 'Count'], false, true),
      ...rows.map(([k, v], i) => tRow([k, v], i % 2 === 0)),
    ],
  });
}

function tRow(cells, shaded, header = false) {
  return new TableRow({
    children: cells.map(text => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(text), bold: header, size: 20,
          color: header ? 'FFFFFF' : '000000' })],
      })],
      shading: header  ? { type: ShadingType.SOLID, color: '1A3A5C', fill: '1A3A5C' }
             : shaded  ? { type: ShadingType.SOLID, color: 'F1F5F9', fill: 'F1F5F9' }
             : undefined,
    })),
  });
}

function rootCauseSection(s) {
  if (!s?.issuesByType || Object.keys(s.issuesByType).length === 0)
    return [para('No issues found.', { color: '27AE60' })];

  const parts = [];
  Object.entries(s.issuesByType).forEach(([type, count]) => {
    const rc = ROOT_CAUSES[type] || {};
    parts.push(para(`${rc.title || type}  (${count} occurrence${count > 1 ? 's' : ''})`, { after: 80 }));
    if (rc.description) parts.push(para(rc.description, { color: '444444', after: 80 }));
    if (rc.possibleCauses?.length) {
      parts.push(para('Possible Causes:', { after: 40 }));
      rc.possibleCauses.forEach(c => parts.push(bullet(c)));
    }
    if (rc.fix) parts.push(para(`Recommended Fix: ${rc.fix}`, { italics: true, color: '2563EB', after: 200 }));
  });
  return parts;
}

function voucherSection(voucherAnalysis) {
  const parts = [];
  Object.entries(voucherAnalysis).forEach(([sheetName, data]) => {
    parts.push(para(`Sheet: ${sheetName}  —  ${data.issueVouchers} issue voucher(s) of ${data.totalVouchers} total`));
    const issueVouchers = data.vouchers.filter(v => v.issues.length > 0).slice(0, 25);
    if (issueVouchers.length === 0) {
      parts.push(para('All vouchers are clean.', { color: '27AE60' }));
    } else {
      issueVouchers.forEach(v => {
        parts.push(para(`Voucher: ${v.voucherId}  |  Date: ${v.date || 'N/A'}  |  Type: ${v.detectedType}  |  Balance: ${v.isBalanced ? 'OK' : 'IMBALANCED'}`, { after: 60 }));
        v.issues.forEach(i => parts.push(bullet(`[${i.severity?.toUpperCase()}] ${i.title}: ${i.detail}`)));
        parts.push(spacer());
      });
    }
  });
  return parts;
}

function scenarioSection(sa) {
  const parts = [];
  sa.findings.forEach(f => {
    parts.push(para(`Scenario ${f.id}: ${f.description}  →  ${f.status.toUpperCase()}`, { after: 80 }));
    f.issues.forEach(i => parts.push(bullet(`[${i.severity?.toUpperCase()}] ${i.title}: ${i.detail}`)));
    f.d365Drivers?.forEach(d => parts.push(bullet(`D365 Fix: ${d.path} — ${d.action}`)));
    parts.push(spacer());
  });
  return parts;
}

function recommendations(result, context) {
  const s = result.summary || {};
  if (!s.totalIssues) return [para('No configuration changes required. System is operating correctly.', { color: '27AE60' })];

  const parts = [];
  let n = 1;

  if (s.issuesByType?.WRONG_ACCOUNT) {
    const path = context.module === 'lease'
      ? 'Lease ▸ Setup ▸ Lease Posting Profiles'
      : 'Fixed Assets ▸ Setup ▸ Fixed Asset Posting Profiles';
    parts.push(para(`${n++}. Review and Update Posting Profiles`, { after: 80 }));
    parts.push(para(`Navigate to: ${path}`, { color: '2563EB', after: 60 }));
    parts.push(para('Update account mappings for all incorrectly mapped transaction types identified in this report.', { after: 180 }));
  }
  if (s.issuesByType?.UNBALANCED_VOUCHER) {
    parts.push(para(`${n++}. Run Subledger Reconciliation`, { after: 80 }));
    parts.push(para('Navigate to: General Ledger ▸ Periodic Tasks ▸ Subledger Journal Accounting Entries', { color: '2563EB', after: 60 }));
    parts.push(para('Investigate and correct all unbalanced vouchers. These represent data integrity issues.', { after: 180 }));
  }
  if (s.issuesByType?.PMA_NOT_POSTED) {
    parts.push(para(`${n++}. Configure PMA Setup`, { after: 80 }));
    parts.push(para('Navigate to: Fixed Assets ▸ Setup ▸ Fixed Asset Parameters ▸ French Regulatory Features', { color: '2563EB', after: 60 }));
    parts.push(para('Enable PMA and configure accounts: 68725 (DR Provision Charge) and 1510 (CR PMA Reserve).', { after: 180 }));
  }
  if (s.issuesByType?.MISSING_ENTRY) {
    parts.push(para(`${n++}. Verify Batch Job Execution`, { after: 80 }));
    parts.push(para('Navigate to: System Administration ▸ Inquiries ▸ Batch Jobs', { color: '2563EB', after: 60 }));
    parts.push(para('Confirm that all periodic D365 batch jobs (depreciation, interest accrual, etc.) have completed without errors.', { after: 180 }));
  }
  if (s.issuesByType?.ACCRUAL_REVERSAL_MISSING || s.issuesByType?.MISSING_REVERSAL_LINE ||
      s.issuesByType?.WRONG_BS_ACCOUNT || s.issuesByType?.PL_NOT_NEUTRALIZED) {
    parts.push(para(`${n++}. Configure Project Group Accrual / Auto-Reversal`, { after: 80 }));
    parts.push(para('Navigate to: Project Management and Accounting ▸ Setup ▸ Project Groups ▸ Estimates tab', { color: '2563EB', after: 60 }));
    parts.push(para('Set the Reversal principle field and verify the Accruals batch job executes successfully each period.', { after: 80 }));
    if (s.issuesByType?.WRONG_BS_ACCOUNT) {
      parts.push(para('Navigate to: Project Management and Accounting ▸ Setup ▸ Posting ▸ Posting (Project Posting Profile)', { color: '2563EB', after: 60 }));
      parts.push(para('Correct the "Accrued cost" and/or "Accrued revenue-sales value" BS accounts. For French GAAP, the standard accrual BS accounts are 4871 (accrued costs) and 4181/418 (accrued revenue).', { after: 180 }));
    }
  }

  return parts;
}

// ─── Account Source Analysis — Excel sheet ────────────────────────────────────
function addAccountSourceSheet(wb, diagnosticResult) {
  const ws = wb.addWorksheet('Account Source Analysis');

  ws.columns = [
    { header: 'Voucher / Scenario', key: 'voucherId',  width: 22 },
    { header: 'Account',            key: 'account',    width: 12 },
    { header: 'Side',               key: 'side',       width: 8  },
    { header: 'Issue Type',         key: 'issueType',  width: 22 },
    { header: 'Actual Source',      key: 'actSrc',     width: 26 },
    { header: 'Actual Field',       key: 'actField',   width: 30 },
    { header: 'Confidence',         key: 'actConf',    width: 12 },
    { header: 'Expected Source',    key: 'expSrc',     width: 26 },
    { header: 'Expected Field',     key: 'expField',   width: 30 },
    { header: 'Source Match',       key: 'srcMatch',   width: 14 },
    { header: 'D365 Fix Path',      key: 'fixPath',    width: 55 },
    { header: 'Resolution Trace',   key: 'trace',      width: 65 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;

  const confFill = { High: 'FF166534', Medium: 'FF713F12', Low: 'FF1E293B' };
  const confColor= { High: 'FF86EFAC', Medium: 'FFFCD34D', Low: 'FF94A3B8' };
  const matchFill= { true: 'FF052E16', false: 'FF450A0A' };

  // Collect all source-enriched issues
  const rows = [];

  const addIssues = (issues, voucherId) => {
    issues.forEach(issue => {
      if (!issue.actualSource && !issue.expectedSource) return;
      const entry = issue._entry;
      rows.push({
        voucherId,
        account:  entry?.account || issue.actualAccount || issue.expectedAccount || '–',
        side:     entry ? (entry.debit > 0 ? 'DR' : 'CR') : '–',
        issueType: issue.type,
        actSrc:   issue.actualSource?.source   || '–',
        actField: issue.actualSource?.field    || '–',
        actConf:  issue.actualSource?.confidence || '–',
        expSrc:   issue.expectedSource?.source || '–',
        expField: issue.expectedSource?.field  || '–',
        srcMatch: issue.sourceComparison?.sameSource != null
                    ? (issue.sourceComparison.sameSource ? 'SAME' : 'DIFF')
                    : '–',
        fixPath:  issue.sourceComparison?.actionRequired || issue.expectedSource?.d365Path || '–',
        trace:    issue.actualSource?.trace ? traceToText(issue.actualSource.trace).join('  |  ') : '–',
      });
    });
  };

  if (diagnosticResult.voucherAnalysis) {
    Object.values(diagnosticResult.voucherAnalysis).forEach(sheet =>
      sheet.vouchers.forEach(v => addIssues(v.issues, v.voucherId))
    );
  }
  if (diagnosticResult.scenarioAnalysis) {
    diagnosticResult.scenarioAnalysis.findings.forEach(f =>
      addIssues(f.issues, `Scenario ${f.id}: ${f.description}`)
    );
  }

  if (rows.length === 0) {
    ws.addRow({ voucherId: 'No source-enriched issues found', account: '', side: '', issueType: '', actSrc: '', actField: '', actConf: '', expSrc: '', expField: '', srcMatch: '', fixPath: '', trace: '' });
    return;
  }

  rows.forEach(r => {
    const row = ws.addRow(r);
    // Confidence cell
    const cKey = r.actConf;
    if (confFill[cKey]) {
      row.getCell('actConf').fill  = fill(confFill[cKey]);
      row.getCell('actConf').font  = { color: { argb: confColor[cKey] }, bold: true, size: 11 };
    }
    // Source match cell
    const isMatch = r.srcMatch === 'SAME';
    if (r.srcMatch !== '–') {
      row.getCell('srcMatch').fill = fill(isMatch ? 'FF052E16' : 'FF450A0A');
      row.getCell('srcMatch').font = { color: { argb: isMatch ? 'FF86EFAC' : 'FFFCA5A5' }, bold: true };
    }
    row.getCell('fixPath').alignment = { wrapText: true };
    row.getCell('trace').alignment   = { wrapText: true };
    row.height = 36;
  });

  ws.autoFilter = { from: 'A1', to: 'L1' };
}

// ─── Account Source Determination — Word section ──────────────────────────────
function accountSourceSection(diagnosticResult) {
  const parts = [];

  const allIssues = [];

  if (diagnosticResult.voucherAnalysis) {
    Object.values(diagnosticResult.voucherAnalysis).forEach(sheet =>
      sheet.vouchers.forEach(v =>
        v.issues.forEach(i => {
          if (i.actualSource || i.expectedSource) {
            allIssues.push({ label: v.voucherId, issue: i });
          }
        })
      )
    );
  }
  if (diagnosticResult.scenarioAnalysis) {
    diagnosticResult.scenarioAnalysis.findings.forEach(f =>
      f.issues.forEach(i => {
        if (i.actualSource || i.expectedSource) {
          allIssues.push({ label: `Scenario ${f.id}: ${f.description}`, issue: i });
        }
      })
    );
  }

  if (allIssues.length === 0) {
    return [para('No account source analysis data available.', { color: '888888' })];
  }

  // Source breakdown table
  const breakdown = diagnosticResult.summary?.sourceBreakdown || {};
  if (Object.keys(breakdown).length > 0) {
    parts.push(para('Configuration Sources with Issues:', { after: 80 }));
    parts.push(new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      rows: [
        tRow(['D365 Source', 'Issue Count'], false, true),
        ...Object.entries(breakdown).sort((a,b) => b[1]-a[1]).map(([src, cnt], i) =>
          tRow([src, String(cnt)], i % 2 === 0)
        ),
      ],
    }));
    parts.push(spacer());
  }

  // Per-issue source details (up to 20)
  allIssues.slice(0, 20).forEach(({ label, issue }) => {
    parts.push(para(`${label}  —  ${issue.type.replace(/_/g,' ')}`, { after: 60 }));

    if (issue.actualSource) {
      parts.push(para(
        `Actual Source: ${issue.actualSource.source} → "${issue.actualSource.field}" (${issue.actualSource.confidence} confidence)`,
        { color: '444444', after: 40 }
      ));
      parts.push(para(`Path: ${issue.actualSource.d365Path}`, { color: '2563EB', after: 40 }));
    }
    if (issue.expectedSource) {
      parts.push(para(
        `Expected Source: ${issue.expectedSource.source} → "${issue.expectedSource.field}" (${issue.expectedSource.confidence} confidence)`,
        { color: '444444', after: 40 }
      ));
    }
    if (issue.sourceComparison) {
      parts.push(para(issue.sourceComparison.explanation, { after: 40 }));
      parts.push(para(`Action: ${issue.sourceComparison.actionRequired}`, { italics: true, color: '2563EB', after: 40 }));
    }
    if (issue.actualSource?.trace) {
      const traceLines = traceToText(issue.actualSource.trace);
      parts.push(para('Resolution Trace:', { after: 30 }));
      traceLines.forEach(l => parts.push(bullet(l)));
    }
    parts.push(spacer());
  });

  return parts;
}

// ─── Universal Accounting Model sheet ────────────────────────────────────────
function addUniversalModelSheet(wb, diagnosticResult) {
  const ws = wb.addWorksheet('Universal Model');

  ws.columns = [
    { header: 'Source',          key: 'source',          width: 22 },
    { header: 'Module',          key: 'module',          width: 22 },
    { header: 'Transaction Type',key: 'transactionType', width: 22 },
    { header: 'Posting Type',    key: 'postingType',     width: 12 },
    { header: 'Account Source',  key: 'accountSource',   width: 26 },
    { header: 'Config Element',  key: 'configElement',   width: 30 },
    { header: 'Main Account',    key: 'mainAccount',     width: 14 },
    { header: 'Issue Type',      key: 'issueType',       width: 22 },
    { header: 'Severity',        key: 'severity',        width: 12 },
    { header: 'Detail',          key: 'detail',          width: 70 },
    { header: 'Resolution Trace',key: 'trace',           width: 65 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;

  const rows = [];

  const collect = (issues, sourceLabel) => {
    issues.forEach(issue => {
      const um = issue.universalModel || {};
      rows.push({
        source:          sourceLabel,
        module:          um.module          || '–',
        transactionType: um.transactionType || '–',
        postingType:     um.postingType     || '–',
        accountSource:   um.accountSource   || issue.actualSource?.source  || '–',
        configElement:   um.configElement   || issue.actualSource?.field   || '–',
        mainAccount:     um.mainAccount     || '–',
        issueType:       issue.type,
        severity:        issue.severity,
        detail:          issue.detail || '',
        trace:           issue.actualSource?.trace ? traceToText(issue.actualSource.trace).join('  |  ') : '–',
      });
    });
  };

  if (diagnosticResult.voucherAnalysis) {
    Object.values(diagnosticResult.voucherAnalysis).forEach(sheet =>
      sheet.vouchers.forEach(v => collect(v.issues, `Voucher: ${v.voucherId}`))
    );
  }
  if (diagnosticResult.scenarioAnalysis) {
    diagnosticResult.scenarioAnalysis.findings.forEach(f =>
      collect(f.issues, `Scenario ${f.id}: ${f.description}`)
    );
  }

  if (rows.length === 0) {
    ws.addRow({ source: 'No issues found', module: '', transactionType: '', postingType: '', accountSource: '', configElement: '', mainAccount: '', issueType: '', severity: '', detail: '', trace: '' });
    return;
  }

  rows.forEach(r => {
    const row = ws.addRow(r);
    if (r.severity === 'critical')    row.fill = fill('FFFEE2E2');
    else if (r.severity === 'high')   row.fill = fill('FFFFF7ED');
    else if (r.severity === 'medium') row.fill = fill('FFFEFCE8');
    row.getCell('detail').alignment = { wrapText: true };
    row.getCell('trace').alignment  = { wrapText: true };
    row.height = 36;
  });

  ws.autoFilter = { from: 'A1', to: 'K1' };
}

// ─── Accrual Analysis — Excel sheet ──────────────────────────────────────────
function addAccrualSheet(wb, diagnosticResult, context) {
  const ws = wb.addWorksheet('Accrual Analysis');
  ws.columns = [
    { header: 'Scenario',         key: 'scenario',      width: 34 },
    { header: 'Accrual Detected', key: 'detected',      width: 16 },
    { header: 'Pairs Found',      key: 'pairCount',     width: 13 },
    { header: 'P&L Pairs',        key: 'plPairs',       width: 12 },
    { header: 'BS Pairs',         key: 'bsPairs',       width: 12 },
    { header: 'Unmatched',        key: 'unmatched',     width: 12 },
    { header: 'Net P&L Impact',   key: 'plNet',         width: 16 },
    { header: 'Net BS Impact',    key: 'bsNet',         width: 16 },
    { header: 'Reversal Valid',   key: 'reversalValid', width: 14 },
    { header: 'Status',           key: 'status',        width: 12 },
    { header: '# Issues',         key: 'issueCount',    width: 10 },
    { header: 'Issue Types',      key: 'issueTypes',    width: 42 },
    { header: 'Root Cause',       key: 'rootCause',     width: 60 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;

  if (!diagnosticResult.scenarioAnalysis) {
    ws.addRow({ scenario: 'No scenario analysis data available.' });
    return;
  }

  const findings    = diagnosticResult.scenarioAnalysis.findings;
  const hasAccrual  = findings.some(f => f.accrualAnalysis);

  if (!hasAccrual) {
    ws.addRow({
      scenario: 'Accrual engine was not enabled for this run. Enable "Accrual / Auto-Reversal" in the Context panel and re-run the diagnostic.',
      detected: 'N/A',
    });
    return;
  }

  findings.forEach(f => {
    const a = f.accrualAnalysis;
    if (!a) {
      ws.addRow({
        scenario: `Scenario ${f.id}: ${f.description}`,
        detected: 'Disabled', pairCount: '–', plPairs: '–', bsPairs: '–',
        unmatched: '–', plNet: '–', bsNet: '–', reversalValid: '–',
        status: '–', issueCount: 0, issueTypes: '–', rootCause: '–',
      });
      return;
    }

    const accrualIssues  = a.issues;
    const issueTypes     = [...new Set(accrualIssues.map(i => i.type))].join(', ') || '–';
    const rootCauses     = accrualIssues
      .filter(i => i.rootCause)
      .map(i => `${i.rootCause.driver}: ${i.rootCause.action}`)
      .join('  |  ') || '–';
    const reversalValid  = a.pairCount > 0 &&
      (a.unmatched?.length || 0) === 0 &&
      !accrualIssues.some(i => i.type === 'WRONG_BS_ACCOUNT');

    const row = ws.addRow({
      scenario:      `Scenario ${f.id}: ${f.description}`,
      detected:      a.accrualDetected ? 'YES' : 'NO',
      pairCount:     a.pairCount,
      plPairs:       a.plPairs?.length  || 0,
      bsPairs:       a.bsPairs?.length  || 0,
      unmatched:     a.unmatched?.length || 0,
      plNet:         (a.impact?.plNet   || 0).toFixed(2),
      bsNet:         (a.impact?.bsNet   || 0).toFixed(2),
      reversalValid: reversalValid ? 'VALID' : 'INVALID',
      status:        a.status,
      issueCount:    accrualIssues.length,
      issueTypes,
      rootCause:     rootCauses,
    });

    row.getCell('detected').fill     = fill(a.accrualDetected ? 'FF052E16' : 'FF450A0A');
    row.getCell('detected').font     = { color: { argb: a.accrualDetected ? 'FF86EFAC' : 'FFFCA5A5' }, bold: true };
    row.getCell('reversalValid').fill = fill(reversalValid ? 'FF052E16' : 'FF450A0A');
    row.getCell('reversalValid').font = { color: { argb: reversalValid ? 'FF86EFAC' : 'FFFCA5A5' }, bold: true };

    const statusFills = { critical: 'FFFEE2E2', error: 'FFFFF7ED', clean: 'FFF0FFF4' };
    if (statusFills[a.status]) row.getCell('status').fill = fill(statusFills[a.status]);

    row.getCell('rootCause').alignment  = { wrapText: true };
    row.getCell('issueTypes').alignment = { wrapText: true };
    row.height = 42;
  });

  ws.autoFilter = { from: 'A1', to: 'M1' };
}

// ─── Accrual / Auto-Reversal — Word section ───────────────────────────────────
function accrualSection(diagnosticResult) {
  const parts = [];

  const findings = diagnosticResult.scenarioAnalysis?.findings || [];
  const accrualFindings = findings.filter(f => f.accrualAnalysis);

  if (accrualFindings.length === 0) {
    return [para('Accrual engine was not enabled for this diagnostic run. Enable "Accrual / Auto-Reversal (Project Group)" in the Context settings and re-run.', { color: '888888' })];
  }

  parts.push(para(
    'The Accrual / Auto-Reversal Engine validates Project Group accrual behaviour by detecting mirrored entry pairs (forward accrual + reversal) within each scenario. A valid accrual voucher must: (1) contain matched pairs of equal and opposite entries on the same account, (2) use the correct balance sheet account from the Project Posting Profile, and (3) produce a net-zero P&L impact for the period.',
    { color: '333333', after: 200 }
  ));

  accrualFindings.forEach(f => {
    const a = f.accrualAnalysis;
    const statusColor = a.status === 'critical' ? 'C0392B' :
                        a.status === 'error'    ? 'E67E22' :
                        a.status === 'clean'    ? '27AE60' : 'F39C12';

    parts.push(para2(`Scenario ${f.id}: ${f.description}  →  `, a.status.toUpperCase(), statusColor));

    parts.push(new Table({
      width: { size: 65, type: WidthType.PERCENTAGE },
      rows: [
        tRow(['Detection Metric', 'Value'], false, true),
        tRow(['Accrual Pairs Detected',  String(a.pairCount)],             true),
        tRow(['P&L Account Pairs',       String(a.plPairs?.length  || 0)], false),
        tRow(['BS Account Pairs',        String(a.bsPairs?.length  || 0)], true),
        tRow(['Unmatched Entries',       String(a.unmatched?.length || 0)], false),
        tRow(['Net P&L Impact',          (a.impact?.plNet || 0).toFixed(2)], true),
        tRow(['Net BS Impact',           (a.impact?.bsNet || 0).toFixed(2)], false),
      ],
    }));
    parts.push(spacer());

    if (a.issues.length === 0) {
      parts.push(para('✓ Accrual pattern is valid. Auto-reversal correctly posted and P&L neutralized.', { color: '27AE60', after: 160 }));
    } else {
      a.issues.forEach(issue => {
        parts.push(para(`Issue: ${issue.title}  [${issue.severity?.toUpperCase()}]`, { after: 40 }));
        parts.push(para(`Detail: ${issue.detail}`, { color: '444444', after: 40 }));
        if (issue.rootCause) {
          parts.push(para(`Root Cause: ${issue.rootCause.driver} → ${issue.rootCause.element}`, { after: 30 }));
          parts.push(para(`D365 Path: ${issue.rootCause.d365Path}`, { color: '2563EB', after: 30 }));
          if (issue.rootCause.trace) {
            parts.push(para('Configuration Trace:', { after: 20 }));
            issue.rootCause.trace.split('\n').forEach(line => parts.push(bullet(line)));
          }
          parts.push(para(`Action Required: ${issue.rootCause.action}`, { italics: true, color: '1D4ED8', after: 80 }));
        }
        if (issue.impact) {
          parts.push(para(`Business Impact: ${issue.impact}`, { color: 'B45309', after: 100 }));
        }
      });

      if (a.remediation) {
        parts.push(para('Remediation Steps:', { after: 40 }));
        a.remediation.steps.forEach(step => {
          parts.push(bullet(`Step ${step.step}: ${step.title}`));
          if (step.d365Path) parts.push(bullet(`   Path: ${step.d365Path}`));
          if (step.action)   parts.push(bullet(`   Action: ${step.action}`));
        });
        parts.push(para(
          `Primary configuration location: ${a.remediation.primaryPath}`,
          { color: '2563EB', italics: true, after: 80 }
        ));
      }
    }
    parts.push(spacer());
  });

  return parts;
}

// ════════════════════════════════════════════════════════════════════════════════
// DUAL GAAP ANALYSIS — Excel sheet
// ════════════════════════════════════════════════════════════════════════════════
function addDualGaapSheet(wb, diagnosticResult) {
  const ws = wb.addWorksheet('Dual GAAP Analysis');

  ws.columns = [
    { header: 'Voucher',              key: 'voucher',       width: 20 },
    { header: 'Date',                 key: 'date',          width: 13 },
    { header: 'Module',               key: 'module',        width: 18 },
    { header: 'Transaction Type',     key: 'txType',        width: 20 },
    { header: 'US Account',           key: 'usAccount',     width: 12 },
    { header: 'FR Account (Actual)',  key: 'frAccount',     width: 16 },
    { header: 'FR Account (Expected)',key: 'expectedFr',    width: 18 },
    { header: 'Mapping Status',       key: 'mappingStatus', width: 16 },
    { header: 'US Classification',    key: 'usClass',       width: 16 },
    { header: 'FR Classification',    key: 'frClass',       width: 16 },
    { header: 'Root Cause',           key: 'rootCause',     width: 20 },
    { header: 'Issue',                key: 'issue',         width: 60 },
    { header: 'Fix',                  key: 'fix',           width: 65 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;

  // Collect all entries with gaapAnalysis across all sheets
  const rows = [];
  if (diagnosticResult.voucherAnalysis) {
    Object.values(diagnosticResult.voucherAnalysis).forEach(sheetData => {
      const gv = sheetData.gaapValidation;
      if (!gv?.isDualGaap) return;
      gv.entries.forEach(entry => {
        const ga = entry.gaapAnalysis;
        if (!ga) return;
        rows.push({
          voucher:       entry.voucher       || '–',
          date:          entry.date          || '–',
          module:        entry.module        || '–',
          txType:        entry.transactionType || '–',
          usAccount:     ga.usAccount        || '–',
          frAccount:     ga.frAccount        || '–',
          expectedFr:    ga.expectedFrAccount || '–',
          mappingStatus: ga.mappingStatus    || 'unknown',
          usClass:       ga.usClassification || '–',
          frClass:       ga.frClassification || '–',
          rootCause:     ga.rootCause        || '–',
          issue:         ga.issue            || '',
          fix:           ga.fix              || '',
        });
      });

      // Also append consistency issues as standalone rows
      gv.consistencyIssues.forEach(ci => {
        rows.push({
          voucher:       ci.voucherId || ci.affectedVouchers?.join(', ') || '–',
          date:          '–',
          module:        '–',
          txType:        '–',
          usAccount:     ci.usAccount       || '–',
          frAccount:     (ci.frAccounts || []).join(' / '),
          expectedFr:    '–',
          mappingStatus: ci.type === 'CONFLICTING_MAPPING' ? 'conflicting' : 'inconsistent',
          usClass:       '–',
          frClass:       '–',
          rootCause:     'CONSISTENCY_ISSUE',
          issue:         ci.issue || '',
          fix:           ci.fix   || '',
        });
      });
    });
  }

  if (rows.length === 0) {
    ws.addRow({ voucher: 'No dual-GAAP data found. Import an Excel file with US_Account and FR_Account columns.', date: '', module: '', txType: '', usAccount: '', frAccount: '', expectedFr: '', mappingStatus: '', usClass: '', frClass: '', rootCause: '', issue: '', fix: '' });
    return;
  }

  const statusStyle = {
    correct:     { fill: 'FF052E16', font: 'FF86EFAC' },
    incorrect:   { fill: 'FF450A0A', font: 'FFFCA5A5' },
    missing:     { fill: 'FF422006', font: 'FFFCD34D' },
    missing_us:  { fill: 'FF422006', font: 'FFFCD34D' },
    missing_fr:  { fill: 'FF422006', font: 'FFFCD34D' },
    conflicting: { fill: 'FF431407', font: 'FFFB923C' },
    inconsistent:{ fill: 'FF431407', font: 'FFFB923C' },
  };

  rows.forEach(r => {
    const row = ws.addRow(r);
    row.getCell('issue').alignment = { wrapText: true };
    row.getCell('fix').alignment   = { wrapText: true };
    row.height = 40;

    const st = statusStyle[r.mappingStatus];
    if (st) {
      const cell = row.getCell('mappingStatus');
      cell.fill = fill(st.fill);
      cell.font = { color: { argb: st.font }, bold: true };
    }

    if (r.mappingStatus === 'correct') {
      row.getCell('usAccount').font = { color: { argb: 'FF60A5FA' }, bold: true };
      row.getCell('frAccount').font = { color: { argb: 'FF34D399' }, bold: true };
    } else if (r.mappingStatus === 'incorrect' || r.mappingStatus === 'conflicting' || r.mappingStatus === 'inconsistent') {
      row.getCell('frAccount').font    = { color: { argb: 'FFFCA5A5' }, bold: true };
      row.getCell('expectedFr').font   = { color: { argb: 'FF86EFAC' }, bold: true };
    }
  });

  ws.autoFilter = { from: 'A1', to: 'M1' };
}

// ─── Dual GAAP Reconciliation — Word section ──────────────────────────────────
function dualGaapWordSection(diagnosticResult) {
  const parts = [];

  // Collect gaapValidation data
  const sheetValidations = [];
  if (diagnosticResult.voucherAnalysis) {
    Object.entries(diagnosticResult.voucherAnalysis).forEach(([name, data]) => {
      const gv = data.gaapValidation;
      if (gv?.isDualGaap) sheetValidations.push({ name, gv });
    });
  }

  if (sheetValidations.length === 0) {
    return [para(
      'No dual-GAAP data detected. Import an Excel file that contains both US_Account and FR_Account columns to enable this analysis.',
      { color: '888888' }
    )];
  }

  parts.push(para(
    'The Dual GAAP Reconciliation Engine validates the US GAAP ↔ French PCG (Plan Comptable Général) account correspondence in each imported journal entry. Each line is checked against the GAAP Mapping table. Mismatches, missing mappings, and cross-file consistency conflicts are all reported here.',
    { color: '333333', after: 200 }
  ));

  sheetValidations.forEach(({ name, gv }) => {
    const s = gv.gaapSummary;
    const statusColor = s.overallStatus === 'error' ? 'C0392B' :
                        s.overallStatus === 'warning' ? 'F39C12' : '27AE60';

    parts.push(para2(`Sheet: ${name}  —  GAAP Status: `, s.overallStatus.toUpperCase(), statusColor));

    // Summary table
    parts.push(new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      rows: [
        tRow(['Metric', 'Value'], false, true),
        tRow(['Total Entries',          String(s.totalEntries)],      true),
        tRow(['Correct Mappings',       String(s.correct)],           false),
        tRow(['Incorrect Mappings',     String(s.incorrect)],         true),
        tRow(['Missing Mappings',       String(s.missing)],           false),
        tRow(['Conflicting Mappings',   String(s.conflicting)],       true),
        tRow(['Consistency Errors',     String(s.consistencyErrors)], false),
        tRow(['Mapping Coverage',       `${s.coveragePct}%`],         true),
      ],
    }));
    parts.push(spacer());

    // Per-voucher reconciliation detail (up to 20 vouchers with issues)
    const problemVouchers = gv.reconciliations.filter(r => r.issues.length > 0).slice(0, 20);
    if (problemVouchers.length === 0) {
      parts.push(para('✓ All vouchers in this sheet have correct GAAP mappings.', { color: '27AE60', after: 160 }));
    } else {
      parts.push(para(`${problemVouchers.length} voucher(s) with mapping issues:`, { after: 80 }));
      problemVouchers.forEach(recon => {
        parts.push(para(
          `Voucher: ${recon.voucherId}  |  Entries: ${recon.totalEntries}  |  Coverage: ${recon.mappingCoverage}%  |  Status: ${recon.status.toUpperCase()}`,
          { after: 50 }
        ));
        recon.issues.forEach(ri => {
          parts.push(bullet(
            `[${ri.severity?.toUpperCase()}] ${ri.type.replace(/_/g,' ')}` +
            (ri.usAccount ? `  |  US: ${ri.usAccount}` : '') +
            (ri.frAccount ? `  |  FR: ${ri.frAccount}` : '') +
            (ri.expectedFrAccount ? `  |  Expected: ${ri.expectedFrAccount}` : '')
          ));
          if (ri.issue) parts.push(bullet(`   Issue: ${ri.issue}`));
          if (ri.fix)   parts.push(bullet(`   Fix: ${ri.fix}`));
        });
        parts.push(spacer());
      });
    }

    // Consistency issues
    if (gv.consistencyIssues.length > 0) {
      parts.push(para('Consistency Issues:', { after: 60 }));
      gv.consistencyIssues.forEach(ci => {
        parts.push(para(
          `${ci.type === 'CONFLICTING_MAPPING' ? 'Global Conflict' : 'Voucher Conflict'}  |  US Account: ${ci.usAccount}`,
          { after: 40 }
        ));
        parts.push(para(`FR Accounts Used: ${(ci.frAccounts || []).join(', ')}`, { color: '444444', after: 30 }));
        parts.push(para(`Issue: ${ci.issue}`, { color: '444444', after: 30 }));
        parts.push(para(`Fix: ${ci.fix}`, { italics: true, color: '2563EB', after: 80 }));
      });
    }
  });

  return parts;
}

// ════════════════════════════════════════════════════════════════════════════════
// FINANCIAL IMPACT ANALYSIS — Excel sheet
// ════════════════════════════════════════════════════════════════════════════════
function addFinancialImpactSheet(wb, diagnosticResult) {
  const ws = wb.addWorksheet('Financial Impact');

  ws.columns = [
    { header: 'Voucher',          key: 'voucherId',    width: 20 },
    { header: 'Date',             key: 'date',         width: 13 },
    { header: 'Module',           key: 'module',       width: 18 },
    { header: 'Transaction Type', key: 'txType',       width: 18 },
    { header: 'US Account',       key: 'usAccount',    width: 12 },
    { header: 'FR Account',       key: 'frAccount',    width: 12 },
    { header: 'Description',      key: 'description',  width: 38 },
    { header: 'Amount',           key: 'amount',       width: 14 },
    { header: 'Currency',         key: 'currency',     width: 10 },
    { header: 'Exchange Rate',    key: 'exchangeRate', width: 13 },
    { header: 'Impact Type',      key: 'impactType',   width: 24 },
    { header: 'Severity',         key: 'severity',     width: 11 },
    { header: 'P&L Impact (EUR)', key: 'plImpact',     width: 16 },
    { header: 'BS Impact (EUR)',  key: 'bsImpact',     width: 16 },
    { header: 'FX Impact (EUR)',  key: 'fxImpact',     width: 16 },
    { header: 'Issue',            key: 'issue',        width: 70 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill = fill(C.navy);
    cell.font = { bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  ws.getRow(1).height = 28;

  const fi = diagnosticResult.financialImpact;

  if (!fi || fi.impacts.length === 0) {
    ws.addRow({
      voucherId: 'No financial impact data found. Import dual-GAAP entries (US_Account + FR_Account columns) and re-run the diagnostic.',
    });
    return;
  }

  // Summary header block
  const s = fi.summary;
  const summaryRows = [
    ['FINANCIAL IMPACT SUMMARY', ''],
    ['Grand Total Exposure (EUR)',          s.grandTotal],
    ['Financial Misstatements (EUR)',        s.totalFinancialMisstatement],
    ['Classification Issues (EUR)',          s.totalClassificationIssues],
    ['FX Differences (EUR)',                 s.totalFxDifference],
    ['Missing Mapping Amounts (EUR)',        s.totalMissingMapping],
    ['P&L Exposure (EUR)',                   s.netPlImpact],
    ['BS Exposure (EUR)',                    s.netBsImpact],
    ['FX Exposure (EUR)',                    s.netFxImpact],
    ['High Severity Items',                  s.highCount],
    ['Medium Severity Items',                s.mediumCount],
    ['Low Severity Items',                   s.lowCount],
    ['Overall Severity',                     s.overallSeverity],
    ['', ''],
    ['IMPACT DETAIL', ''],
  ];

  summaryRows.forEach(([label, value]) => {
    const row = ws.addRow({ voucherId: label, date: value == null ? '' : value });
    if (label === 'FINANCIAL IMPACT SUMMARY' || label === 'IMPACT DETAIL') {
      row.getCell('voucherId').fill = fill(C.navy);
      row.getCell('voucherId').font = { bold: true, color: { argb: C.white } };
    } else if (label) {
      row.getCell('voucherId').font = { bold: true };
      row.getCell('date').numFmt = typeof value === 'number' ? '#,##0.00' : undefined;
    }
  });

  // Write a blank separator row and then column headers again for the detail section
  ws.addRow({});

  // Write all impacts (sorted: High first, then by amount descending)
  const sorted = [...fi.impacts].sort((a, b) => {
    const sevOrder = { High: 0, Medium: 1, Low: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return (b.impactAmount || 0) - (a.impactAmount || 0);
  });

  const typeRowFill = {
    'Financial Misstatement': 'FFFEE2E2',
    'Classification Issue':   'FFFFF7ED',
    'FX Difference':          'FFF5F3FF',
    'Missing Mapping':        'FFFEFCE8',
  };
  const typeFontColor = {
    'Financial Misstatement': 'FFEF4444',
    'Classification Issue':   'FFF97316',
    'FX Difference':          'FF8B5CF6',
    'Missing Mapping':        'FFF59E0B',
  };
  const sevFill = { High: 'FFFEE2E2', Medium: 'FFFFF7ED', Low: 'FFF1F5F9' };
  const sevFont = { High: 'FFEF4444', Medium: 'FFF97316', Low: 'FF64748B' };

  sorted.forEach(impact => {
    const row = ws.addRow({
      voucherId:    impact.voucherId,
      date:         impact.date,
      module:       impact.module,
      txType:       impact.transactionType || '–',
      usAccount:    impact.usAccount,
      frAccount:    impact.frAccount,
      description:  impact.description,
      amount:       impact.amount,
      currency:     impact.currency,
      exchangeRate: impact.exchangeRate,
      impactType:   impact.impactType,
      severity:     impact.severity,
      plImpact:     impact.plImpact || 0,
      bsImpact:     impact.bsImpact || 0,
      fxImpact:     impact.fxImpact || 0,
      issue:        impact.issueDescription || '',
    });

    row.getCell('amount').numFmt      = '#,##0.00';
    row.getCell('plImpact').numFmt    = '#,##0.00';
    row.getCell('bsImpact').numFmt    = '#,##0.00';
    row.getCell('fxImpact').numFmt    = '#,##0.00';
    row.getCell('issue').alignment    = { wrapText: true };
    row.height = 40;

    // Row background by impact type
    if (typeRowFill[impact.impactType]) row.fill = fill(typeRowFill[impact.impactType]);

    // Impact type cell colour
    if (typeFontColor[impact.impactType]) {
      row.getCell('impactType').font = { bold: true, color: { argb: typeFontColor[impact.impactType] } };
    }

    // Severity cell colour
    if (sevFill[impact.severity]) {
      row.getCell('severity').fill = fill(sevFill[impact.severity]);
      row.getCell('severity').font = { bold: true, color: { argb: sevFont[impact.severity] } };
    }

    // Highlight non-zero impact cells
    if (impact.plImpact > 0) {
      row.getCell('plImpact').font = { bold: true, color: { argb: C.red } };
    }
    if (impact.bsImpact > 0) {
      row.getCell('bsImpact').font = { bold: true, color: { argb: 'FFF97316' } };
    }
    if (impact.fxImpact > 0) {
      row.getCell('fxImpact').font = { bold: true, color: { argb: 'FF8B5CF6' } };
    }
    // Flag non-EUR currency
    if (impact.currency !== 'EUR') {
      row.getCell('currency').fill = fill('FFFEFCE8');
      row.getCell('currency').font = { color: { argb: 'FFF59E0B' }, bold: true };
    }
  });

  ws.autoFilter = { from: `A${summaryRows.length + 3}`, to: `P${summaryRows.length + 3}` };
}

// ─── Financial Impact — Word section ─────────────────────────────────────────
function financialImpactWordSection(diagnosticResult) {
  const fi = diagnosticResult.financialImpact;

  if (!fi || fi.impacts.length === 0) {
    return [para(
      'No financial impact data detected. Import dual-GAAP entries (US_Account + FR_Account columns) and re-run the diagnostic to enable this analysis.',
      { color: '888888' }
    )];
  }

  const s  = fi.summary;
  const ag = fi.aggregates;
  const parts = [];

  const sevColor = s.overallSeverity === 'High'   ? 'C0392B' :
                   s.overallSeverity === 'Medium'  ? 'E67E22' : '27AE60';

  parts.push(para(
    'The Financial Impact Engine quantifies the monetary exposure introduced by each detected GAAP mapping issue. ' +
    'Cross-type mismatements (P&L ↔ Balance Sheet) represent the most significant risk. ' +
    'FX differences reflect translation exposure on foreign-currency transactions.',
    { color: '333333', after: 200 }
  ));

  parts.push(para2('Overall Financial Severity: ', s.overallSeverity, sevColor));
  parts.push(spacer());

  // Executive summary table
  parts.push(new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      tRow(['Metric',                      'Amount (EUR)'],           false, true),
      tRow(['Grand Total Exposure',         `€${s.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],               true),
      tRow(['Financial Misstatements',      `€${s.totalFinancialMisstatement.toLocaleString('en-US', { minimumFractionDigits: 2 })}`], false),
      tRow(['Classification Issues',        `€${s.totalClassificationIssues.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],  true),
      tRow(['FX Differences',               `€${s.totalFxDifference.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],           false),
      tRow(['Missing Mapping Amounts',      `€${s.totalMissingMapping.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],          true),
      tRow(['P&L Exposure',                 `€${s.netPlImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],                  false),
      tRow(['BS Exposure',                  `€${s.netBsImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],                  true),
      tRow(['FX Exposure',                  `€${s.netFxImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],                  false),
      tRow(['High Severity Items',          String(s.highCount)],                         true),
      tRow(['Medium Severity Items',        String(s.mediumCount)],                       false),
    ],
  }));
  parts.push(spacer());

  // Module breakdown
  if (Object.keys(ag.byModule).length > 0) {
    parts.push(para('Impact by Module:', { after: 80 }));
    const moduleRows = Object.entries(ag.byModule)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([mod, data], i) =>
        tRow([mod, `€${data.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${data.count} item${data.count !== 1 ? 's' : ''})`], i % 2 === 0)
      );
    parts.push(new Table({
      width: { size: 55, type: WidthType.PERCENTAGE },
      rows: [tRow(['Module', 'Total Exposure'], false, true), ...moduleRows],
    }));
    parts.push(spacer());
  }

  // Top accounts
  if (ag.topAccounts.length > 0) {
    parts.push(para('Top Impacted US Accounts:', { after: 80 }));
    const acctRows = ag.topAccounts.map((a, i) =>
      tRow([a.account, `€${a.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} — ${a.impactTypes.join(', ')}`], i % 2 === 0)
    );
    parts.push(new Table({
      width: { size: 65, type: WidthType.PERCENTAGE },
      rows: [tRow(['US Account', 'Total Exposure & Impact Types'], false, true), ...acctRows],
    }));
    parts.push(spacer());
  }

  // High-severity items detail
  const highItems = fi.impacts.filter(i => i.severity === 'High').slice(0, 15);
  if (highItems.length > 0) {
    parts.push(para(`High-Severity Impact Items (${highItems.length}):`, { after: 80 }));
    highItems.forEach(impact => {
      parts.push(para(
        `${impact.voucherId}  |  ${impact.impactType}  |  US ${impact.usAccount} → FR ${impact.frAccount}  |  Amount: ${impact.amount.toLocaleString()} ${impact.currency}`,
        { after: 40 }
      ));
      parts.push(bullet(`Issue: ${impact.issueDescription}`));
      if (impact.plImpact > 0) parts.push(bullet(`P&L Exposure: €${impact.plImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
      if (impact.bsImpact > 0) parts.push(bullet(`BS Exposure: €${impact.bsImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
      if (impact.fxImpact > 0) parts.push(bullet(`FX Exposure: €${impact.fxImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}`));
      parts.push(spacer());
    });
  }

  return parts;
}

// ─── Currency Analysis sheet ──────────────────────────────────────────────────
function addCurrencySheet(wb, diagnosticResult) {
  const va = diagnosticResult.voucherAnalysis;
  if (!va) return;

  // Collect all multi-currency vouchers across sheets
  const rows = [];
  Object.entries(va).forEach(([sheetName, sheetData]) => {
    const map = sheetData.currencyAnalysisMap || {};
    Object.values(map).forEach(ana => {
      ana.issues.forEach(issue => {
        rows.push({
          sheetName,
          voucherId:         ana.voucherId,
          accountingCurrency:ana.accountingCurrency,
          currencies:        ana.currencies?.join(', ') || '',
          isMultiCurrency:   ana.isMultiCurrency ? 'Yes' : 'No',
          acctgDr:           ana.accountingBalance?.totalDrAccounting ?? '',
          acctgCr:           ana.accountingBalance?.totalCrAccounting ?? '',
          balanced:          ana.accountingBalance?.balanced ? 'Yes' : 'No',
          difference:        ana.accountingBalance?.difference ?? 0,
          issueType:         issue.type,
          issueSeverity:     issue.severity,
          issueDetail:       issue.detail || issue.issue || '',
          fix:               issue.fix || '',
        });
      });
      // Vouchers with multi-currency but no issues still get a summary row
      if (ana.issues.length === 0 && ana.isMultiCurrency) {
        rows.push({
          sheetName,
          voucherId:         ana.voucherId,
          accountingCurrency:ana.accountingCurrency,
          currencies:        ana.currencies?.join(', ') || '',
          isMultiCurrency:   'Yes',
          acctgDr:           ana.accountingBalance?.totalDrAccounting ?? '',
          acctgCr:           ana.accountingBalance?.totalCrAccounting ?? '',
          balanced:          ana.accountingBalance?.balanced ? 'Yes' : 'No',
          difference:        0,
          issueType:         'CLEAN',
          issueSeverity:     'clean',
          issueDetail:       'No FX issues detected',
          fix:               '',
        });
      }
    });
  });

  if (rows.length === 0) return;

  const ws = wb.addWorksheet('Currency Analysis');
  ws.columns = [
    { header: 'Sheet',          key: 'sheetName',          width: 22 },
    { header: 'Voucher',        key: 'voucherId',          width: 18 },
    { header: 'Acctg. Ccy',    key: 'accountingCurrency', width: 12 },
    { header: 'Currencies',    key: 'currencies',          width: 18 },
    { header: 'Multi-Ccy',     key: 'isMultiCurrency',     width: 10 },
    { header: 'Acctg DR',      key: 'acctgDr',             width: 14 },
    { header: 'Acctg CR',      key: 'acctgCr',             width: 14 },
    { header: 'Balanced',      key: 'balanced',            width: 10 },
    { header: 'Difference',    key: 'difference',          width: 12 },
    { header: 'Issue Type',    key: 'issueType',           width: 22 },
    { header: 'Severity',      key: 'issueSeverity',       width: 10 },
    { header: 'Detail',        key: 'issueDetail',         width: 50 },
    { header: 'Recommended Fix', key: 'fix',               width: 55 },
  ];

  // Header row
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: C.white }, size: 11 };
  hdr.fill = fill('FF4C1D95');
  hdr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  hdr.height = 28;

  rows.forEach(r => {
    const row = ws.addRow(r);
    const sevColor =
      r.issueSeverity === 'high'   ? 'FFFEE2E2' :
      r.issueSeverity === 'medium' ? 'FFFFF7ED' :
      r.issueSeverity === 'clean'  ? 'FFF0FFF4' : 'FFF8FAFC';
    row.fill = fill(sevColor);

    const issueCell = row.getCell('issueType');
    issueCell.font = { bold: true, color: { argb:
      r.issueSeverity === 'high'   ? C.red :
      r.issueSeverity === 'medium' ? C.orange :
      r.issueSeverity === 'clean'  ? 'FF22C55E' : 'FF64748B',
    }};
    row.getCell('issueDetail').alignment = { wrapText: true };
    row.getCell('fix').alignment = { wrapText: true };
    row.getCell('difference').numFmt = '#,##0.00';
    row.getCell('acctgDr').numFmt   = '#,##0.00';
    row.getCell('acctgCr').numFmt   = '#,##0.00';
  });

  ws.autoFilter = { from: 'A1', to: 'M1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ─── Currency Word section ────────────────────────────────────────────────────
function currencyWordSection(diagnosticResult) {
  const va = diagnosticResult.voucherAnalysis;
  const parts = [];

  if (!va) {
    parts.push(para('No voucher data available for multi-currency analysis.', { color: '888888', italics: true }));
    return parts;
  }

  // Collect summary stats
  let totalMulti = 0, totalFxIssue = 0, totalOverride = 0;
  const allCcys = new Set();

  Object.values(va).forEach(sheet => {
    const cs = sheet.currencySummary;
    if (!cs) return;
    totalMulti    += cs.multiCurrencyVouchers || 0;
    totalFxIssue  += cs.fxIssueVouchers      || 0;
    totalOverride += cs.rateOverrideVouchers  || 0;
    (cs.currenciesUsed || []).forEach(c => allCcys.add(c));
  });

  if (totalMulti === 0) {
    parts.push(para('No multi-currency vouchers detected. All entries appear to be in the accounting currency.', { color: '888888', italics: true }));
    return parts;
  }

  parts.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        new TableCell({ children: [para('Multi-Currency Vouchers')], shading: { fill: 'EDE9FE', type: ShadingType.CLEAR } }),
        new TableCell({ children: [para(String(totalMulti))] }),
        new TableCell({ children: [para('FX Issue Vouchers')], shading: { fill: 'EDE9FE', type: ShadingType.CLEAR } }),
        new TableCell({ children: [para(String(totalFxIssue))] }),
        new TableCell({ children: [para('Rate Override Vouchers')], shading: { fill: 'EDE9FE', type: ShadingType.CLEAR } }),
        new TableCell({ children: [para(String(totalOverride))] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ children: [para('Currencies Used')], shading: { fill: 'EDE9FE', type: ShadingType.CLEAR } }),
        new TableCell({ columnSpan: 5, children: [para([...allCcys].join(', '))] }),
      ]}),
    ],
  }));
  parts.push(spacer());

  // Per-sheet detail
  Object.entries(va).forEach(([sheetName, sheetData]) => {
    const map = sheetData.currencyAnalysisMap || {};
    const analyses = Object.values(map).filter(a => a.isMultiCurrency || a.issues.length > 0);
    if (analyses.length === 0) return;

    parts.push(para(sheetName, { bold: true, size: 24 }));
    analyses.forEach(ana => {
      parts.push(para(`Voucher: ${ana.voucherId}  |  Acctg. Currency: ${ana.accountingCurrency}  |  Currencies: ${ana.currencies?.join(', ')}`, { size: 20, color: '444444' }));
      if (ana.fxDifference?.detected) {
        parts.push(bullet(`${ana.fxDifference.type}: difference of ${ana.fxDifference.amount?.toFixed(2)} ${ana.accountingCurrency}`));
        parts.push(bullet(`Fix: ${ana.fxDifference.fix}`));
      }
      ana.rateOverrides?.forEach(ro => {
        parts.push(bullet(`RATE_OVERRIDE on ${ro.currency}: rates ${ro.rates?.join(' vs ')}`));
        parts.push(bullet(`Fix: ${ro.fix}`));
      });
      parts.push(spacer());
    });
  });

  return parts;
}

module.exports = { exportToExcel, exportToWord };
