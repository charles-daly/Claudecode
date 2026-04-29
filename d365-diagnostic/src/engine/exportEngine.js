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

module.exports = { exportToExcel, exportToWord };
