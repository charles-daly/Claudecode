'use strict';

const ExcelJS = require('exceljs');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, ShadingType,
} = require('docx');
const fs = require('fs');
const { ROOT_CAUSES } = require('./accountingRules');
const { traceToText, confidenceLabel } = require('./accountSourceResolver');

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
      addVoucherSheet(wb, data, name)
    );
  }

  if (diagnosticResult.scenarioAnalysis) {
    addScenarioSheet(wb, diagnosticResult.scenarioAnalysis);
  }

  addRootCauseSheet(wb, diagnosticResult.summary);
  addAccountSourceSheet(wb, diagnosticResult);

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
  row2('Module',       context.module || 'N/A');
  row2('Country',      context.country || 'N/A');
  row2('GAAP',         context.gaap || 'N/A');
  row2('PMA Active',   context.pma ? 'Yes' : 'No');
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
function addVoucherSheet(wb, sheetData, sheetName) {
  const ws = wb.addWorksheet(('Vouchers - ' + sheetName).slice(0, 31));

  ws.columns = [
    { header: 'Voucher ID',    key: 'voucherId',    width: 20 },
    { header: 'Date',          key: 'date',          width: 14 },
    { header: 'Status',        key: 'status',        width: 11 },
    { header: 'Severity',      key: 'severity',      width: 11 },
    { header: 'Detected Type', key: 'detectedType',  width: 22 },
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
    const row = ws.addRow({
      voucherId:   v.voucherId,
      date:        v.date || '',
      status:      v.status,
      severity:    v.severity,
      detectedType: v.detectedType || 'unknown',
      totalDebit:  v.totalDebit,
      totalCredit: v.totalCredit,
      isBalanced:  v.isBalanced ? 'YES' : 'NO',
      issueCount:  v.issues.length,
      issueSummary: v.issues.map(i => `[${i.severity?.toUpperCase()}] ${i.title}`).join(' | '),
    });
    row.getCell('totalDebit').numFmt  = '#,##0.00';
    row.getCell('totalCredit').numFmt = '#,##0.00';

    if (v.severity === 'critical')       row.fill = fill('FFFEE2E2');
    else if (v.severity === 'high')      row.fill = fill('FFFFF7ED');
    else if (v.status   === 'clean')     row.fill = fill('FFF0FFF4');
  });

  ws.autoFilter = { from: 'A1', to: 'J1' };
}

// ─── Scenario sheet ───────────────────────────────────────────────────────────
function addScenarioSheet(wb, scenarioAnalysis) {
  const ws = wb.addWorksheet('Scenario Analysis');
  ws.columns = [
    { header: 'Scenario',          key: 'description',     width: 32 },
    { header: 'Transaction Type',  key: 'transactionType', width: 22 },
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
    const row = ws.addRow({
      description:     f.description,
      transactionType: f.transactionType || 'N/A',
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

        heading2('2.  EXECUTIVE SUMMARY'),
        para2('Overall Status: ', (s.overallStatus || 'CLEAN').toUpperCase(), statusColor),
        summaryTable(s),
        spacer(),

        heading2('3.  ROOT CAUSE ANALYSIS'),
        ...rootCauseSection(s),

        ...(diagnosticResult.voucherAnalysis ? [
          heading2('4.  VOUCHER ANALYSIS'),
          ...voucherSection(diagnosticResult.voucherAnalysis),
        ] : []),

        ...(diagnosticResult.scenarioAnalysis ? [
          heading2('5.  SCENARIO ANALYSIS'),
          ...scenarioSection(diagnosticResult.scenarioAnalysis),
        ] : []),

        heading2('6.  ACCOUNT SOURCE DETERMINATION'),
        ...accountSourceSection(diagnosticResult),

        heading2('7.  D365 CONFIGURATION RECOMMENDATIONS'),
        ...recommendations(diagnosticResult, context),

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

function ctxTable(ctx) {
  const rows = [
    ['Module',       ctx.module   || 'N/A'],
    ['Country',      ctx.country  || 'N/A'],
    ['GAAP',         ctx.gaap     || 'N/A'],
    ['PMA Active',   ctx.pma ? 'Yes' : 'No'],
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

module.exports = { exportToExcel, exportToWord };
