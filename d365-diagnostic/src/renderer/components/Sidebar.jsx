import React from 'react';

const TABS = [
  { id: 'context',   icon: '⚙', label: 'Context',      sub: 'Module & GAAP' },
  { id: 'scenarios', icon: '📋', label: 'Scenarios',    sub: 'Expected vs Actual' },
  { id: 'import',    icon: '📥', label: 'Import',       sub: 'Excel Vouchers' },
  { id: 'gaap',      icon: '🗂', label: 'GAAP Mapping', sub: 'US ↔ FR Accounts' },
  { id: 'results',   icon: '🔍', label: 'Diagnostic',   sub: 'Results & Findings', requiresResult: true },
  { id: 'vouchers',  icon: '📊', label: 'Vouchers',     sub: 'Drill-down', requiresResult: true },
  { id: 'impact',    icon: '💰', label: 'Fin. Impact',  sub: 'P&L / BS / FX', requiresResult: true },
  { id: 'export',    icon: '📤', label: 'Export',       sub: 'Excel / Word', requiresResult: true },
];

export default function Sidebar({ activeTab, setActiveTab, hasResult }) {
  return (
    <nav style={S.sidebar}>
      <div style={S.label}>NAVIGATION</div>
      {TABS.map(tab => {
        const disabled = tab.requiresResult && !hasResult;
        const active   = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => !disabled && setActiveTab(tab.id)}
            disabled={disabled}
            style={{
              ...S.tab,
              ...(active   ? S.tabActive   : {}),
              ...(disabled ? S.tabDisabled : {}),
            }}
          >
            <span style={S.icon}>{tab.icon}</span>
            <span style={S.textGroup}>
              <span style={S.tabLabel}>{tab.label}</span>
              <span style={S.tabSub}>{tab.sub}</span>
            </span>
            {active && <span style={S.indicator} />}
          </button>
        );
      })}
    </nav>
  );
}

const S = {
  sidebar: {
    width: 190, flexShrink: 0, backgroundColor: '#0d1219',
    borderRight: '1px solid #1e293b',
    display: 'flex', flexDirection: 'column',
    padding: '16px 0', overflowY: 'auto',
  },
  label: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
    color: '#334155', padding: '0 16px 10px', textTransform: 'uppercase',
  },
  tab: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', background: 'none', border: 'none', color: '#64748b',
    cursor: 'pointer', transition: 'all .15s', textAlign: 'left', width: '100%',
    borderRadius: 0,
  },
  tabActive:   { background: '#1a1f2e', color: '#e2e8f0' },
  tabDisabled: { opacity: .35, cursor: 'not-allowed' },
  icon:        { fontSize: 16, flexShrink: 0, width: 20, textAlign: 'center' },
  textGroup:   { display: 'flex', flexDirection: 'column', gap: 1 },
  tabLabel:    { fontSize: 13, fontWeight: 600, lineHeight: 1.2 },
  tabSub:      { fontSize: 10, color: '#475569', lineHeight: 1.2 },
  indicator: {
    position: 'absolute', left: 0, top: '15%', bottom: '15%',
    width: 3, borderRadius: '0 3px 3px 0', background: '#3b82f6',
  },
};
