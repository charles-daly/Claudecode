import React from 'react';

const SEV_COLOR = { critical: '#ef4444', error: '#f97316', warning: '#f59e0b', clean: '#22c55e' };

export default function HomeScreen({ onAnalyze, onScenario, onConfig, hasData, hasResult, result, onViewResults }) {
  const summary = result?.summary;
  const statusColor = summary ? (SEV_COLOR[summary.overallStatus] || '#22c55e') : null;

  return (
    <div style={S.root}>
      {/* Hero */}
      <div style={S.hero}>
        <h1 style={S.heroTitle}>D365 Finance Diagnostics</h1>
        <p style={S.heroSub}>
          Identify accounting configuration issues, GAAP mapping errors, and FX exposures
          in your Dynamics 365 Finance journal entries.
        </p>
      </div>

      {/* Recent result banner */}
      {hasResult && summary && (
        <div style={{ ...S.resultBanner, borderColor: statusColor + '55', background: statusColor + '0f' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, flexWrap: 'wrap' }}>
            <span style={{ ...S.statusDot, background: statusColor }} />
            <span style={{ fontWeight: 700, color: statusColor, fontSize: 14 }}>
              {(summary.overallStatus || 'CLEAN').toUpperCase()}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>
              Last analysis found {summary.totalIssues} issue{summary.totalIssues !== 1 ? 's' : ''}
              {summary.criticalCount > 0 && (
                <span style={{ color: '#ef4444' }}> · {summary.criticalCount} critical</span>
              )}
              &nbsp;·&nbsp; {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <button onClick={onViewResults} style={S.viewResultsBtn}>
            View Results →
          </button>
        </div>
      )}

      {/* Three action cards */}
      <div style={S.cards}>
        <FlowCard
          icon="📊"
          iconBg="#1e3a5f"
          iconColor="#60a5fa"
          title="Analyze Vouchers"
          description="Upload a D365 Excel export to detect accounting errors, GAAP mapping issues, and currency imbalances across your vouchers."
          action="Start Analysis"
          onClick={onAnalyze}
          badge={hasData ? 'Data loaded' : null}
          badgeColor="#22c55e"
          primaryColor="#3b82f6"
          bullets={['Upload Excel file', 'Auto-detect issues', 'Clear fix guidance']}
        />
        <FlowCard
          icon="⚡"
          iconBg="#1e1533"
          iconColor="#a78bfa"
          title="Build Scenario"
          description="Manually compare expected vs actual journal entries for a specific transaction. Diagnose a known issue or validate a configuration change."
          action="Build Scenario"
          onClick={onScenario}
          badge={null}
          primaryColor="#8b5cf6"
          bullets={['Define expected entries', 'Compare with actual', 'Load sample scenarios']}
        />
        <FlowCard
          icon="⚙"
          iconBg="#1a2318"
          iconColor="#4ade80"
          title="System Configuration"
          description="Configure the diagnostic engine: select module, GAAP framework, account mappings, currency settings, and regulatory options."
          action="Configure"
          onClick={onConfig}
          badge={null}
          primaryColor="#22c55e"
          bullets={['Account mapping (GAAP)', 'Module & currency setup', 'PMA and regulatory rules']}
        />
      </div>

      {/* Quick start hints */}
      <div style={S.hints}>
        <div style={S.hintTitle}>Quick start</div>
        <div style={S.hintRow}>
          <HintStep n="1" text="Upload your D365 Excel export or load sample data" />
          <HintStep n="2" text="Select the D365 module (Lease, Procurement, Sales…)" />
          <HintStep n="3" text="Click Analyze — issues are flagged with root causes and fixes" />
        </div>
      </div>
    </div>
  );
}

function FlowCard({ icon, iconBg, iconColor, title, description, action, onClick, badge, badgeColor, primaryColor, bullets }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...S.card,
        border: `1px solid ${hover ? primaryColor + '66' : '#1e293b'}`,
        background: hover ? '#1a1f2e' : '#161b27',
        transform: hover ? 'translateY(-2px)' : 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
        <div style={{ ...S.iconBox, background: iconBg }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={S.cardTitle}>{title}</span>
            {badge && (
              <span style={{ ...S.badge, background: badgeColor + '22', color: badgeColor }}>
                {badge}
              </span>
            )}
          </div>
          <p style={S.cardDesc}>{description}</p>
        </div>
      </div>

      <ul style={S.bullets}>
        {bullets.map((b, i) => (
          <li key={i} style={S.bullet}>
            <span style={{ ...S.bulletDot, background: primaryColor }} />
            {b}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 20 }}>
        <button
          style={{ ...S.actionBtn, background: primaryColor, boxShadow: hover ? `0 4px 14px ${primaryColor}44` : 'none' }}
          onClick={onClick}
        >
          {action} →
        </button>
      </div>
    </div>
  );
}

function HintStep({ n, text }) {
  return (
    <div style={S.hintStep}>
      <div style={S.hintNum}>{n}</div>
      <span style={S.hintText}>{text}</span>
    </div>
  );
}

const S = {
  root:    { maxWidth: 1100, margin: '0 auto', padding: '48px 32px 64px' },
  hero:    { textAlign: 'center', marginBottom: 48 },
  heroTitle: { fontSize: 34, fontWeight: 800, color: '#e2e8f0', margin: '0 0 12px', letterSpacing: -0.5 },
  heroSub:   { fontSize: 16, color: '#64748b', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 },

  resultBanner: {
    display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
    border: '1px solid', borderRadius: 12, marginBottom: 36, flexWrap: 'wrap',
  },
  statusDot:     { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  viewResultsBtn: { padding: '8px 18px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },

  cards:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 48 },
  card:    { borderRadius: 14, padding: '24px', transition: 'all .2s ease', userSelect: 'none' },
  iconBox: { width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { fontSize: 17, fontWeight: 700, color: '#e2e8f0' },
  cardDesc:  { fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 },
  badge:     { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: .5 },
  bullets:   { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 },
  bullet:    { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8' },
  bulletDot: { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },
  actionBtn: { padding: '10px 22px', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all .2s' },

  hints:     { borderTop: '1px solid #1e293b', paddingTop: 32 },
  hintTitle: { fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 16 },
  hintRow:   { display: 'flex', gap: 24, flexWrap: 'wrap' },
  hintStep:  { display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 200 },
  hintNum:   { width: 26, height: 26, borderRadius: '50%', background: '#1e293b', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', flexShrink: 0 },
  hintText:  { fontSize: 13, color: '#475569', lineHeight: 1.5 },
};
