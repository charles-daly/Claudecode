import React, { useState, useEffect } from 'react';
import DiagnosticResults from './DiagnosticResults';
import FxAnalysis        from './FxAnalysis';
import ExportPanel       from './ExportPanel';

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

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#94a3b8', clean: '#22c55e' };
const SEV_BG    = { critical: '#450a0a', high: '#431407', medium: '#422006', clean: '#052e16' };

const TABS = [
  { id: 'summary',     label: 'Summary'     },
  { id: 'issues',      label: 'Issues'      },
  { id: 'fx',          label: 'FX Analysis' },
  { id: 'mapping',     label: 'Mapping'     },
  { id: 'corrections', label: 'Corrections' },
  { id: 'export',      label: 'Export'      },
];

// ── Main export ───────────────────────────────────────────────────────────────
export default function ResultsDashboard({ result, mode, context }) {
  const [tab, setTab] = useState('summary');
  const { summary, voucherAnalysis, scenarioAnalysis, financialImpact } = result || {};
  const statusColor = SEV_COLOR[summary?.overallStatus] || '#22c55e';
  const statusBg    = SEV_BG[summary?.overallStatus]    || '#052e16';

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
              {summary?.overallStatus === 'clean'    ? 'No issues found' :
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
        <StatCard n={summary?.totalIssues || 0}   label="Total Issues"  color={summary?.totalIssues > 0 ? '#f97316' : '#22c55e'} />
        <StatCard n={summary?.criticalCount || 0} label="Critical"      color={summary?.criticalCount > 0 ? '#ef4444' : '#64748b'} />
        <StatCard n={summary?.errorCount    || 0} label="High Severity" color={summary?.errorCount > 0 ? '#f97316' : '#64748b'} />
        <StatCard n={summary?.warningCount  || 0} label="Warnings"      color={summary?.warningCount > 0 ? '#f59e0b' : '#64748b'} />
        {financialImpact && (
          <StatCard
            n={`€${(financialImpact.summary?.grandTotal || 0).toLocaleString('en', { maximumFractionDigits: 0 })}`}
            label="Financial exposure"
            color="#8b5cf6"
          />
        )}
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map(t => {
          const badge = t.id === 'issues' ? (summary?.totalIssues || 0) : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}) }}
            >
              {t.label}
              {badge !== null && badge > 0 && (
                <span style={S.tabBadge}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ paddingTop: 8 }}>
        {tab === 'summary'     && <DiagnosticResults result={result} />}
        {tab === 'issues'      && <IssueListPanel voucherAnalysis={voucherAnalysis} scenarioAnalysis={scenarioAnalysis} />}
        {tab === 'fx'          && <FxAnalysis result={result} />}
        {tab === 'mapping'     && <MappingPanel result={result} />}
        {tab === 'corrections' && <CorrectionsPanel result={result} context={context} />}
        {tab === 'export'      && <ExportPanel diagnosticResult={result} context={result?.context ?? context ?? {}} />}
      </div>
    </div>
  );
}

// ── Issues tab — filterable flat list ─────────────────────────────────────────
function IssueListPanel({ voucherAnalysis, scenarioAnalysis }) {
  const [filter, setFilter] = useState('all');
  const allIssues = collectAllIssues(voucherAnalysis, scenarioAnalysis);
  const filtered  = filter === 'all' ? allIssues : allIssues.filter(i => i.severity === filter);

  const counts = { all: allIssues.length };
  ['critical', 'high', 'medium', 'low'].forEach(s => {
    counts[s] = allIssues.filter(i => i.severity === s).length;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'critical', 'high', 'medium', 'low'].map(sev => {
          const color = sev === 'all' ? '#94a3b8' : (SEV_COLOR[sev] || '#64748b');
          const active = filter === sev;
          return (
            <button
              key={sev}
              onClick={() => setFilter(sev)}
              style={{
                padding: '5px 14px', borderRadius: 6, border: `1px solid ${active ? color : '#1e293b'}`,
                background: active ? color + '20' : 'transparent', color: active ? color : '#475569',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)} ({counts[sev]})
            </button>
          );
        })}
      </div>

      {filtered.length > 0 ? (
        <IssueTable issues={filtered} />
      ) : (
        <div style={S.cleanBox}>
          <span style={{ fontSize: 32, marginBottom: 12, display: 'block' }}>✓</span>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>No issues in this category</div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            {filter === 'all' ? 'All accounts, balances, and mappings match expected values.' : `No ${filter} severity issues found.`}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mapping tab — GAAP coverage table ────────────────────────────────────────
function MappingPanel({ result }) {
  const { voucherAnalysis } = result || {};

  const accountMap = {};
  if (voucherAnalysis) {
    Object.entries(voucherAnalysis).forEach(([sheet, sheetData]) => {
      (sheetData.vouchers || []).forEach(v => {
        (v.entries || []).forEach(e => {
          const acc = e.usAccount || e.account;
          if (!acc) return;
          if (!accountMap[acc]) {
            accountMap[acc] = { usAccount: acc, frAccount: null, beAccount: null, sheets: new Set(), count: 0 };
          }
          accountMap[acc].sheets.add(sheet);
          accountMap[acc].count++;
          if (e.frAccount) accountMap[acc].frAccount = e.frAccount;
          if (e.beAccount) accountMap[acc].beAccount = e.beAccount;
        });
      });
    });
  }

  const accounts = Object.values(accountMap).sort((a, b) => b.count - a.count);
  const mapped   = accounts.filter(a => a.frAccount);
  const unmapped = accounts.filter(a => !a.frAccount);
  const coverage = accounts.length > 0 ? Math.round((mapped.length / accounts.length) * 100) : 100;

  if (accounts.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#475569' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
        <div>No account mapping data available.</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Run the diagnostic with a dual-GAAP file to see mapping coverage.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={S.statCards}>
        <StatCard n={accounts.length}  label="Unique accounts"  color="#60a5fa" />
        <StatCard n={mapped.length}    label="Mapped to FR/BE"  color="#22c55e" />
        <StatCard n={unmapped.length}  label="Missing mapping"  color={unmapped.length > 0 ? '#f97316' : '#64748b'} />
        <StatCard n={`${coverage}%`}   label="FR coverage"      color={coverage >= 90 ? '#22c55e' : coverage >= 70 ? '#f59e0b' : '#ef4444'} />
      </div>

      <div style={S.issueTable}>
        <div style={{ ...S.issueTableHeader, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 70px' }}>
          <span>US Account</span>
          <span>FR Account (PCG)</span>
          <span>BE Account (PCMN)</span>
          <span style={{ textAlign: 'center' }}>Lines</span>
        </div>
        {accounts.map((a, i) => (
          <div key={i} style={{ ...S.issueRow, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 70px', padding: '9px 16px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', color: '#7dd3fc', fontSize: 13 }}>{a.usAccount}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: a.frAccount ? '#c084fc' : '#475569' }}>
              {a.frAccount || <em style={{ fontStyle: 'italic', color: '#334155' }}>not mapped</em>}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: a.beAccount ? '#fb923c' : '#475569' }}>
              {a.beAccount || <em style={{ fontStyle: 'italic', color: '#334155' }}>—</em>}
            </span>
            <span style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>{a.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Corrections tab — async fix suggestions ───────────────────────────────────
function CorrectionsPanel({ result, context }) {
  const [fixes,   setFixes]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = () => {
    if (!result || !window.electronAPI?.suggestFixes) return;
    setLoading(true); setError(null);
    window.electronAPI.suggestFixes(result, context || {})
      .then(res  => setFixes(res))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '40px 20px', color: '#475569' }}>
        <span style={{ fontSize: 20 }}>⚙</span>
        <span style={{ fontSize: 14 }}>Generating correction suggestions…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: '#2d0b0b', border: '1px solid #ef4444', borderRadius: 8 }}>
        <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 8 }}>Could not generate corrections: {error}</div>
        <button onClick={load} style={{ padding: '6px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!fixes) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#475569' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🔧</div>
        <div>No corrections available.</div>
        <button onClick={load} style={{ marginTop: 12, padding: '6px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
          Load suggestions
        </button>
      </div>
    );
  }

  const { fixes: fixList = [], summary: fixSum = {} } = fixes;

  return (
    <div>
      <div style={S.statCards}>
        <StatCard n={fixSum.total || 0}               label="Total fixes"  color="#60a5fa" />
        <StatCard n={fixSum.glOnly || 0}              label="GL-only"      color="#22c55e" />
        <StatCard n={fixSum.projectSubledger || 0}    label="Sub-ledger"   color="#a78bfa" />
        <StatCard n={fixSum.hybrid || 0}              label="Hybrid"       color="#f59e0b" />
        <StatCard n={fixSum.configOnly || 0}          label="Config only"  color="#94a3b8" />
        {(fixSum.partial || 0) > 0 && (
          <StatCard n={fixSum.partial} label="Partial (review)" color="#f97316" />
        )}
      </div>

      {fixList.length > 0 ? (
        <div style={S.issueTable}>
          <div style={{ ...S.issueTableHeader, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px' }}>
            <span>Issue Type</span>
            <span>Correction</span>
            <span>Confidence</span>
            <span>Status</span>
          </div>
          {fixList.map((fix, i) => <FixRow key={i} fix={fix} />)}
        </div>
      ) : (
        <div style={S.cleanBox}>
          <span style={{ fontSize: 32, marginBottom: 12, display: 'block' }}>✓</span>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>No corrections needed</div>
          <div style={{ fontSize: 13, color: '#475569' }}>No actionable correction paths found.</div>
        </div>
      )}
    </div>
  );
}

function FixRow({ fix }) {
  const [open, setOpen] = useState(false);
  const confColor = fix.confidence === 'high' ? '#22c55e' : fix.confidence === 'medium' ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ ...S.issueRow, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '10px 16px', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#e2e8f0' }}>{ISSUE_LABEL[fix.issueType] || fix.issueType || '—'}</span>
        <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{fix.correctionType || '—'}</span>
        <span style={{ fontSize: 11, color: confColor, fontWeight: 700, textTransform: 'uppercase' }}>{fix.confidence || '—'}</span>
        <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
          {fix.partial
            ? <span style={{ color: '#f97316' }}>⚠ Partial</span>
            : <span style={{ color: '#22c55e' }}>✓ Ready</span>}
          <span style={{ color: '#475569' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <div style={S.issueDetail}>
          {fix.glJournal?.entries?.length > 0 && (
            <div style={S.detailBlock}>
              <div style={S.detailLabel}>GL Journal Entries</div>
              {fix.glJournal.entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, fontFamily: 'monospace', fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>
                  <span style={{ color: '#7dd3fc', minWidth: 80 }}>{e.account}</span>
                  <span style={{ flex: 1, color: '#64748b' }}>{e.description}</span>
                  {e.debit  > 0 && <span style={{ color: '#86efac' }}>Dr {e.debit.toLocaleString()}</span>}
                  {e.credit > 0 && <span style={{ color: '#fca5a5' }}>Cr {e.credit.toLocaleString()}</span>}
                </div>
              ))}
            </div>
          )}
          {fix.businessImpact && (
            <div style={S.detailBlock}>
              <div style={S.detailLabel}>Business Impact</div>
              <div style={S.detailText}>{fix.businessImpact}</div>
            </div>
          )}
          {fix.glJournal?.d365Path && (
            <div style={S.detailBlock}>
              <div style={S.detailLabel}>Where in D365</div>
              <div style={{ ...S.detailText, fontFamily: 'monospace', color: '#94a3b8' }}>{fix.glJournal.d365Path}</div>
            </div>
          )}
          {fix.validationError?.length > 0 && (
            <div style={S.detailBlock}>
              <div style={S.detailLabel}>Validation Blockers</div>
              {fix.validationError.map((b, i) => (
                <div key={i} style={{ ...S.detailText, color: '#f97316' }}>{b.message} — {b.fix}</div>
              ))}
            </div>
          )}
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

// ── Collect all issues ────────────────────────────────────────────────────────
function collectAllIssues(voucherAnalysis, scenarioAnalysis) {
  const issues = [];

  if (voucherAnalysis) {
    Object.entries(voucherAnalysis).forEach(([sheet, sheetData]) => {
      (sheetData.vouchers || []).forEach(v => {
        (v.issues || []).forEach(iss => {
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
    (scenarioAnalysis.findings || []).forEach(f => {
      (f.issues || []).forEach(iss => {
        issues.push({
          ...iss,
          voucherId: null,
          scenarioId: `Scenario ${f.id}: ${f.description}`,
          d365Path: iss.expectedSource?.d365Path || iss.actualSource?.d365Path || null,
        });
      });
    });
  }

  return issues.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
  });
}

// ── Shared sub-components ─────────────────────────────────────────────────────
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

  tabBar:       { display: 'flex', gap: 2, marginBottom: 4, borderBottom: '1px solid #1e293b', flexWrap: 'wrap' },
  tab:          { padding: '8px 18px', background: 'none', border: 'none', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1, transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6 },
  tabActive:    { color: '#e2e8f0', borderBottomColor: '#3b82f6' },
  tabBadge:     { fontSize: 10, padding: '1px 6px', borderRadius: 999, background: '#ef444422', color: '#ef4444', fontWeight: 700 },

  issueTable:       { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  issueTableHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#0d1219', fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .8 },
  issueRow:         { borderTop: '1px solid #1e293b' },
  sevDot:           { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  issueDetail:      { padding: '12px 24px 16px', borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 12 },
  detailBlock:      { display: 'flex', flexDirection: 'column', gap: 4 },
  detailLabel:      { fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .8 },
  detailText:       { fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },

  exportBtn: { padding: '7px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
};
