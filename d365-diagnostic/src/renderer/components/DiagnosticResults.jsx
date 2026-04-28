import React, { useState } from 'react';

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', clean: '#22c55e' };
const SEV_BG    = { critical: '#450a0a', high: '#431407', medium: '#422006', clean: '#052e16' };

export default function DiagnosticResults({ result, isRunning }) {
  const [expandedScenario, setExpandedScenario] = useState(null);

  if (isRunning) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚙</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>Running Diagnostic…</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Analysing vouchers and scenarios</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>No results yet</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
          Configure context, add scenarios or import an Excel file, then click <strong style={{ color: '#3b82f6' }}>Run Diagnostic</strong>.
        </p>
      </div>
    );
  }

  const { summary, scenarioAnalysis, voucherAnalysis } = result;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Diagnostic Results</h1>
        <p style={{ fontSize: 12, color: '#475569' }}>
          Run: {new Date(result.timestamp).toLocaleString()} &nbsp;·&nbsp; Module: {result.context?.module} &nbsp;·&nbsp; GAAP: {result.context?.gaap}
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div style={S.statsRow}>
        <StatusCard
          status={summary?.overallStatus || 'clean'}
          title="Overall Status"
          value={(summary?.overallStatus || 'CLEAN').toUpperCase()}
        />
        <NumCard value={summary?.totalIssues   || 0} label="Total Issues"  color={summary?.totalIssues   > 0 ? '#ef4444' : '#22c55e'} />
        <NumCard value={summary?.criticalCount || 0} label="Critical"      color={summary?.criticalCount > 0 ? '#ef4444' : '#64748b'} />
        <NumCard value={summary?.errorCount    || 0} label="High Severity" color={summary?.errorCount    > 0 ? '#f97316' : '#64748b'} />
        <NumCard value={summary?.warningCount  || 0} label="Warnings"      color={summary?.warningCount  > 0 ? '#f59e0b' : '#64748b'} />
      </div>

      {/* ── Top root causes ── */}
      {summary?.topRootCauses?.length > 0 && (
        <div style={S.card}>
          <div className="section-title">Top Root Causes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.topRootCauses.map(rc => (
              <div key={rc.type} style={S.rcRow}>
                <span style={S.rcBadge}>{rc.count}</span>
                <span style={{ flex: 1, fontWeight: 600, color: '#e2e8f0' }}>{rc.title}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{rc.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Voucher analysis summary ── */}
      {voucherAnalysis && (
        <div style={S.card}>
          <div className="section-title">Voucher Analysis</div>
          {Object.entries(voucherAnalysis).map(([sheet, data]) => (
            <div key={sheet} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Sheet: {sheet}</div>
              <div style={S.voucherStats}>
                <VoucherStat value={data.totalVouchers}    label="Total"    />
                <VoucherStat value={data.cleanVouchers}    label="Clean"    color="#22c55e" />
                <VoucherStat value={data.issueVouchers}    label="Issues"   color={data.issueVouchers    > 0 ? '#f97316' : '#22c55e'} />
                <VoucherStat value={data.criticalVouchers} label="Critical" color={data.criticalVouchers > 0 ? '#ef4444' : '#64748b'} />
              </div>

              {/* Issue categories */}
              {Object.entries(data.issueCategories || {}).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {Object.entries(data.issueCategories).map(([type, cat]) => (
                    <div key={type} style={S.catRow}>
                      <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{type.replace(/_/g,' ')}</span>
                      <span style={{ fontSize: 12, color: '#f97316', fontWeight: 700 }}>{cat.count} voucher{cat.count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scenario findings ── */}
      {scenarioAnalysis && (
        <div style={S.card}>
          <div className="section-title">Scenario Analysis ({scenarioAnalysis.total} scenarios)</div>
          {scenarioAnalysis.findings.map(f => (
            <div key={f.id} style={{ ...S.scenarioRow, borderColor: SEV_COLOR[f.status] || '#1e293b' }}>
              <div
                style={S.scenarioHeader}
                onClick={() => setExpandedScenario(expandedScenario === f.id ? null : f.id)}
              >
                <SeverityDot status={f.status} />
                <span style={{ flex: 1, fontWeight: 600, color: '#e2e8f0' }}>{f.description}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{f.transactionType}</span>
                <span style={{ fontSize: 11, color: f.issues.length > 0 ? '#f97316' : '#22c55e' }}>
                  {f.issues.length > 0 ? `${f.issues.length} issue(s)` : 'Clean'}
                </span>
                <span style={{ color: '#475569', fontSize: 11 }}>{expandedScenario === f.id ? '▲' : '▼'}</span>
              </div>

              {expandedScenario === f.id && f.issues.length > 0 && (
                <div style={{ padding: '0 12px 12px' }}>
                  {f.issues.map((issue, i) => <IssueCard key={i} issue={issue} />)}
                  {f.d365Drivers?.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={S.driversLabel}>D365 Fix Paths</div>
                      {f.d365Drivers.map((d, i) => (
                        <div key={i} style={S.driverRow}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>{d.driver}</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>{d.path}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{d.action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {expandedScenario === f.id && f.issues.length === 0 && (
                <div style={{ padding: '8px 12px 12px', fontSize: 13, color: '#22c55e' }}>✓ No issues detected</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IssueCard({ issue }) {
  return (
    <div style={{ ...S.issueCard, borderColor: SEV_COLOR[issue.severity] || '#475569', background: SEV_BG[issue.severity] || '#1a1f2e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: SEV_COLOR[issue.severity] + '33', color: SEV_COLOR[issue.severity], fontWeight: 700, textTransform: 'uppercase' }}>
          {issue.severity}
        </span>
        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{issue.title}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: issue.fix ? 4 : 0 }}>{issue.detail}</div>
      {issue.fix && <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>Fix: {issue.fix}</div>}
    </div>
  );
}

function StatusCard({ status, title, value }) {
  const color = SEV_COLOR[status] || '#22c55e';
  return (
    <div style={{ ...S.numCard, border: `1px solid ${color}33` }}>
      <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function NumCard({ value, label, color }) {
  return (
    <div style={S.numCard}>
      <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function VoucherStat({ value, label, color }) {
  return (
    <div style={S.vStat}>
      <span style={{ fontSize: 20, fontWeight: 700, color: color || '#94a3b8' }}>{value}</span>
      <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
    </div>
  );
}

function SeverityDot({ status }) {
  const color = SEV_COLOR[status] || '#475569';
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

const S = {
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', color: '#64748b',
  },
  statsRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  numCard: {
    flex: 1, minWidth: 100, background: '#1a1f2e', border: '1px solid #1e293b',
    borderRadius: 10, padding: '14px 16px',
  },
  card: { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '18px', marginBottom: 16 },
  rcRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #1e293b' },
  rcBadge: {
    minWidth: 28, height: 28, borderRadius: '50%', background: '#7c2d12',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, color: '#fdba74', flexShrink: 0,
  },
  voucherStats: { display: 'flex', gap: 20 },
  vStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  catRow: { display: 'flex', padding: '6px 0', borderBottom: '1px solid #1e293b', gap: 12 },
  scenarioRow: { border: '1px solid', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  scenarioHeader: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    cursor: 'pointer', background: '#0f1117',
  },
  issueCard: { border: '1px solid', borderRadius: 6, padding: '10px 12px', marginBottom: 6 },
  driversLabel: { fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 },
  driverRow: { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', background: '#0f1117', borderRadius: 5, marginBottom: 4 },
};
