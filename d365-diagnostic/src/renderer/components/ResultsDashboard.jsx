import React, { useState } from 'react';
import DiagnosticResults from './DiagnosticResults';
import VoucherAnalysis   from './VoucherAnalysis';
import FinancialImpact   from './FinancialImpact';
import FxAnalysis        from './FxAnalysis';
import ExportPanel       from './ExportPanel';

// ── Label maps ────────────────────────────────────────────────────────────────
const ISSUE_LABEL = {
  WRONG_ACCOUNT:            'Wrong account used',
  UNBALANCED_VOUCHER:       'Entry out of balance',
  PMA_NOT_POSTED:           'French provision missing',
  MISSING_ENTRY:            'Entry not posted',
  CLASSIFICATION_MISMATCH:  'Account category mismatch',
  INCORRECT_FR_ACCOUNT:     'Wrong French account',
  MISSING_MAPPING:          'No account mapping',
  CONFLICTING_MAPPING:      'Conflicting account mappings',
  FX_IMBALANCE:             'Currency imbalance',
  FX_ROUNDING:              'Rounding difference',
  RATE_OVERRIDE:            'Exchange rate override',
  ACCRUAL_REVERSAL_MISSING: 'Auto-reversal not posted',
  MISSING_REVERSAL_LINE:    'Reversal entry missing',
  PL_NOT_NEUTRALIZED:       'P&L not neutralized',
  WRONG_BS_ACCOUNT:         'Wrong balance sheet account',
};

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', clean: '#22c55e' };
const SEV_BG    = { critical: '#450a0a', high: '#431407', medium: '#422006', clean: '#052e16' };
const SEV_LABEL = { critical: 'Needs immediate attention', high: 'Significant issue', medium: 'Review required', low: 'Minor note', clean: 'No issues' };

const ADV_TABS = [
  { id: 'summary',  label: 'Summary' },
  { id: 'vouchers', label: 'Vouchers' },
  { id: 'impact',   label: 'Financial Impact' },
  { id: 'fx',       label: 'FX Analysis' },
  { id: 'export',   label: 'Export' },
];

// ── Main export ───────────────────────────────────────────────────────────────
export default function ResultsDashboard({ result, mode, context }) {
  const [advTab, setAdvTab] = useState('summary');

  if (mode === 'advanced') {
    return (
      <div>
        <div style={S.advTabBar}>
          {ADV_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setAdvTab(t.id)}
              style={{ ...S.advTab, ...(advTab === t.id ? S.advTabActive : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ paddingTop: 4 }}>
          {advTab === 'summary'  && <DiagnosticResults result={result} />}
          {advTab === 'vouchers' && <VoucherAnalysis result={result} />}
          {advTab === 'impact'   && <FinancialImpact result={result} setActiveTab={setAdvTab} />}
          {advTab === 'fx'       && <FxAnalysis result={result} />}
          {advTab === 'export'   && <ExportPanel diagnosticResult={result} context={result?.context ?? context ?? {}} />}
        </div>
      </div>
    );
  }

  return <SimpleResults result={result} />;
}

// ── Simple results view ───────────────────────────────────────────────────────
function SimpleResults({ result }) {
  const { summary, voucherAnalysis, scenarioAnalysis, financialImpact } = result;
  const statusColor = SEV_COLOR[summary?.overallStatus] || '#22c55e';
  const statusBg    = SEV_BG[summary?.overallStatus]    || '#052e16';

  const allIssues = collectAllIssues(voucherAnalysis, scenarioAnalysis);

  return (
    <div>
      {/* Status banner */}
      <div style={{ ...S.statusBanner, background: statusBg, borderColor: statusColor + '55' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>
            {summary?.overallStatus === 'clean' ? '✓' : summary?.overallStatus === 'critical' ? '⚠' : '⚡'}
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: statusColor }}>
              {summary?.overallStatus === 'clean' ? 'No issues found' :
               summary?.overallStatus === 'critical' ? 'Critical issues found — action required' :
               summary?.overallStatus === 'error'    ? 'Significant issues found' :
               'Issues found — review recommended'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {summary?.totalIssues || 0} issue{(summary?.totalIssues || 0) !== 1 ? 's' : ''} detected
              {summary?.criticalCount > 0 && ` · ${summary.criticalCount} critical`}
              {summary?.errorCount    > 0 && ` · ${summary.errorCount} high severity`}
            </div>
          </div>
        </div>
        <ExportButtons result={result} />
      </div>

      {/* Stat cards */}
      <div style={S.statCards}>
        <StatCard n={summary?.totalIssues || 0}    label="Total Issues"  color={summary?.totalIssues > 0 ? '#f97316' : '#22c55e'} />
        <StatCard n={summary?.criticalCount || 0}  label="Critical"      color={summary?.criticalCount > 0 ? '#ef4444' : '#64748b'} />
        <StatCard n={summary?.errorCount    || 0}  label="High Severity" color={summary?.errorCount > 0 ? '#f97316' : '#64748b'} />
        <StatCard n={summary?.warningCount  || 0}  label="Warnings"      color={summary?.warningCount > 0 ? '#f59e0b' : '#64748b'} />
        {financialImpact && (
          <StatCard
            n={`€${(financialImpact.summary.grandTotal || 0).toLocaleString('en', { maximumFractionDigits: 0 })}`}
            label="Financial exposure"
            color="#8b5cf6"
          />
        )}
      </div>

      {/* Issues table */}
      {allIssues.length > 0 ? (
        <IssueTable issues={allIssues} />
      ) : (
        <div style={S.cleanBox}>
          <span style={{ fontSize: 32, marginBottom: 12, display: 'block' }}>✓</span>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>Everything checks out</div>
          <div style={{ fontSize: 13, color: '#475569' }}>All accounts, balances, and mappings match expected values.</div>
        </div>
      )}
    </div>
  );
}

// ── Issue table with expandable rows ──────────────────────────────────────────
function IssueTable({ issues }) {
  const [expanded, setExpanded] = useState(new Set());
  const toggle = (i) => setExpanded(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div style={S.issueTable}>
      <div style={S.issueTableHeader}>
        <span style={{ flex: 2 }}>Issue</span>
        <span style={{ flex: 1 }}>Where</span>
        <span style={{ width: 100, textAlign: 'center' }}>Severity</span>
        <span style={{ width: 28 }} />
      </div>
      {issues.map((iss, i) => {
        const isOpen = expanded.has(i);
        const color  = SEV_COLOR[iss.severity] || '#64748b';
        return (
          <div key={i} style={{ ...S.issueRow, background: isOpen ? '#12171f' : 'transparent' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer' }}
              onClick={() => toggle(i)}
            >
              <span style={{ ...S.sevDot, background: color }} />
              <span style={{ flex: 2, fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                {ISSUE_LABEL[iss.type] || iss.type}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{iss.voucherId || iss.scenarioId || '–'}</span>
              <span style={{ width: 100, textAlign: 'center' }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: color + '22', color, fontWeight: 700, textTransform: 'uppercase' }}>
                  {iss.severity}
                </span>
              </span>
              <span style={{ width: 28, color: '#475569', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={S.issueDetail}>
                {iss.detail && (
                  <div style={S.detailBlock}>
                    <div style={S.detailLabel}>What happened</div>
                    <div style={S.detailText}>{iss.detail}</div>
                  </div>
                )}
                {iss.fix && (
                  <div style={S.detailBlock}>
                    <div style={S.detailLabel}>How to fix it</div>
                    <div style={{ ...S.detailText, color: '#60a5fa' }}>{iss.fix}</div>
                  </div>
                )}
                {iss.d365Path && (
                  <div style={S.detailBlock}>
                    <div style={S.detailLabel}>Where in D365</div>
                    <div style={{ ...S.detailText, fontFamily: 'monospace', color: '#94a3b8' }}>{iss.d365Path}</div>
                  </div>
                )}
                {(iss.actualAccount || iss.expectedAccount) && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {iss.actualAccount && (
                      <div style={S.detailBlock}>
                        <div style={S.detailLabel}>Account used</div>
                        <div style={{ ...S.detailText, fontFamily: 'monospace', color: '#fca5a5' }}>{iss.actualAccount}</div>
                      </div>
                    )}
                    {iss.expectedAccount && (
                      <div style={S.detailBlock}>
                        <div style={S.detailLabel}>Expected account</div>
                        <div style={{ ...S.detailText, fontFamily: 'monospace', color: '#86efac' }}>{iss.expectedAccount}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Export buttons ────────────────────────────────────────────────────────────
function ExportButtons({ result }) {
  const [xlLoading, setXlLoading] = useState(false);
  const [wdLoading, setWdLoading] = useState(false);

  const exportXl = async () => {
    if (!window.electronAPI?.exportExcel) return;
    setXlLoading(true);
    try { await window.electronAPI.exportExcel({ diagnosticResult: result, context: result?.context || {} }); }
    finally { setXlLoading(false); }
  };

  const exportWd = async () => {
    if (!window.electronAPI?.exportWord) return;
    setWdLoading(true);
    try { await window.electronAPI.exportWord({ diagnosticResult: result, context: result?.context || {} }); }
    finally { setWdLoading(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      <button onClick={exportXl} disabled={xlLoading} style={S.exportBtn}>
        {xlLoading ? '…' : '📊 Excel'}
      </button>
      <button onClick={exportWd} disabled={wdLoading} style={S.exportBtn}>
        {wdLoading ? '…' : '📄 Word'}
      </button>
    </div>
  );
}

// ── Collect all issues for table ──────────────────────────────────────────────
function collectAllIssues(voucherAnalysis, scenarioAnalysis) {
  const issues = [];

  if (voucherAnalysis) {
    Object.entries(voucherAnalysis).forEach(([sheet, sheetData]) => {
      (sheetData.vouchers || []).forEach(v => {
        v.issues.forEach(iss => {
          issues.push({
            ...iss,
            voucherId: v.voucherId,
            sheet,
            d365Path: iss.expectedSource?.d365Path || iss.actualSource?.d365Path || null,
          });
        });
      });
    });
  }

  if (scenarioAnalysis) {
    scenarioAnalysis.findings.forEach(f => {
      f.issues.forEach(iss => {
        issues.push({
          ...iss,
          voucherId: null,
          scenarioId: `Scenario ${f.id}: ${f.description}`,
          d365Path: iss.expectedSource?.d365Path || iss.actualSource?.d365Path || null,
        });
      });
    });
  }

  // Sort: critical first
  return issues.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ n, label, color }) {
  return (
    <div style={{ ...S.statCard, borderColor: color + '33' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  statusBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px', border: '1px solid', borderRadius: 12, marginBottom: 20, flexWrap: 'wrap' },
  statCards:    { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  statCard:     { flex: 1, minWidth: 100, background: '#1a1f2e', border: '1px solid', borderRadius: 10, padding: '14px 16px', textAlign: 'center' },
  cleanBox:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', background: '#061212', border: '1px solid #14532d', borderRadius: 12, textAlign: 'center' },

  issueTable:       { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  issueTableHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#0d1219', fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .8 },
  issueRow:         { borderTop: '1px solid #1e293b' },
  sevDot:           { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  issueDetail:      { padding: '12px 24px 16px', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 12 },
  detailBlock:      { display: 'flex', flexDirection: 'column', gap: 4 },
  detailLabel:      { fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .8 },
  detailText:       { fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },

  exportBtn: { padding: '7px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },

  advTabBar:    { display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #1e293b', flexWrap: 'wrap' },
  advTab:       { padding: '8px 18px', background: 'none', border: 'none', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1, transition: 'all .15s' },
  advTabActive: { color: '#e2e8f0', borderBottomColor: '#3b82f6' },
};
