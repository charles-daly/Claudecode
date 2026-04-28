import React from 'react';

const MODULE_LABELS = { lease: 'Lease (IFRS 16)', fixed_assets: 'Fixed Assets' };
const GAAP_LABELS   = { french_gaap: 'French GAAP', us_gaap: 'US GAAP', dual_gaap: 'Dual GAAP' };

export default function Header({ context, summary }) {
  const statusColor =
    summary?.overallStatus === 'critical' ? '#ef4444' :
    summary?.overallStatus === 'error'    ? '#f97316' :
    summary?.overallStatus === 'warning'  ? '#f59e0b' :
    summary ? '#22c55e' : '#334155';

  return (
    <header style={S.header}>
      <div style={S.left}>
        <div style={S.logo}>
          <span style={S.logoIcon}>D</span>
          <div>
            <div style={S.title}>D365 Diagnostic Engine</div>
            <div style={S.sub}>Accounting Logic &amp; Voucher Analysis</div>
          </div>
        </div>
      </div>

      <div style={S.chips}>
        <Chip label="Module"   value={MODULE_LABELS[context?.module]  || context?.module}  />
        <Chip label="Country"  value={context?.country}   />
        <Chip label="GAAP"     value={GAAP_LABELS[context?.gaap] || context?.gaap} />
        {context?.pma && <Chip label="PMA" value="Active" accent />}
      </div>

      {summary && (
        <div style={{ ...S.statusPill, borderColor: statusColor, color: statusColor }}>
          {(summary.overallStatus || 'clean').toUpperCase()}
          &nbsp;·&nbsp;{summary.totalIssues} issue{summary.totalIssues !== 1 ? 's' : ''}
        </div>
      )}
    </header>
  );
}

function Chip({ label, value, accent }) {
  return (
    <div style={{ ...S.chip, ...(accent ? S.chipAccent : {}) }}>
      <span style={S.chipLabel}>{label}</span>
      <span style={S.chipValue}>{value}</span>
    </div>
  );
}

const S = {
  header: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '0 24px', height: 56, backgroundColor: '#0d1219',
    borderBottom: '1px solid #1e293b', flexShrink: 0,
  },
  left:   { display: 'flex', alignItems: 'center', marginRight: 8 },
  logo:   { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: {
    width: 34, height: 34, borderRadius: 8,
    background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: 18, color: '#fff', flexShrink: 0,
  },
  title: { fontSize: 15, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 },
  sub:   { fontSize: 11, color: '#475569', lineHeight: 1.2 },
  chips: { display: 'flex', gap: 8, flex: 1 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 10px', borderRadius: 999,
    background: '#1a1f2e', border: '1px solid #1e293b',
  },
  chipAccent: { background: '#1c2d3d', border: '1px solid #3b82f6' },
  chipLabel: { fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 },
  chipValue: { fontSize: 12, color: '#94a3b8', fontWeight: 600 },
  statusPill: {
    padding: '4px 14px', borderRadius: 999, border: '1px solid',
    fontSize: 12, fontWeight: 700, letterSpacing: .5, flexShrink: 0,
  },
};
