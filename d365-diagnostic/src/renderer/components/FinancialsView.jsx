'use strict';

import React, { useState, useEffect } from 'react';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#0f1117', color: '#e2e8f0', fontFamily: 'monospace',
  },
  header: {
    padding: '16px 24px', borderBottom: '1px solid #1e2535', background: '#141824',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft: {},
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#7dd3fc' },
  headerSub: { margin: '4px 0 0', fontSize: 12, color: '#64748b' },

  tabRow: {
    display: 'flex', borderBottom: '1px solid #1e2535', background: '#141824',
    paddingLeft: 24,
  },
  tab: {
    padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: 'none', background: 'none', color: '#64748b', fontFamily: 'monospace',
    borderBottom: '2px solid transparent', marginBottom: -1,
  },
  tabActive: { color: '#7dd3fc', borderBottom: '2px solid #7dd3fc' },

  body: { flex: 1, overflowY: 'auto', padding: 24 },

  empty: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', height: '60%', gap: 12, color: '#334155',
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#475569' },

  // GAAP selector
  gaapRow: { display: 'flex', gap: 8, marginBottom: 20 },
  gaapBtn: {
    padding: '6px 16px', borderRadius: 6, border: '1px solid #2d3748',
    cursor: 'pointer', background: '#141824', color: '#64748b', fontSize: 12,
    fontFamily: 'monospace', fontWeight: 600,
  },
  gaapBtnActive: { background: '#1e3a5f', color: '#7dd3fc', borderColor: '#2563eb' },

  // Statement layout
  stmtGrid: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  stmtBox: {
    flex: 1, minWidth: 360, background: '#141824', border: '1px solid #1e2535',
    borderRadius: 8, overflow: 'hidden',
  },
  stmtTitle: {
    padding: '12px 16px', borderBottom: '1px solid #1e2535',
    fontSize: 13, fontWeight: 700, color: '#94a3b8', background: '#0f1117',
  },

  // Table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '7px 14px', textAlign: 'left', color: '#475569',
    borderBottom: '1px solid #1e2535', fontSize: 11, fontWeight: 700,
    background: '#0f1117',
  },
  thRight: {
    padding: '7px 14px', textAlign: 'right', color: '#475569',
    borderBottom: '1px solid #1e2535', fontSize: 11, fontWeight: 700,
    background: '#0f1117',
  },
  td: { padding: '6px 14px', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },
  tdRight: { padding: '6px 14px', textAlign: 'right', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },
  sectionRow: {
    padding: '6px 14px', fontWeight: 700, color: '#94a3b8', fontSize: 11,
    background: '#0f1117', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid #1e2535',
  },
  sectionTotal: {
    padding: '6px 14px', textAlign: 'right', fontWeight: 700, color: '#7dd3fc',
    background: '#0f1117', borderBottom: '1px solid #1e2535', fontFamily: 'monospace',
  },
  subtotalRow: {
    padding: '8px 14px', fontWeight: 700, borderTop: '1px solid #2d3748',
    borderBottom: '2px solid #2d3748', background: '#141824',
    fontSize: 12, color: '#e2e8f0',
  },
  subtotalRight: {
    padding: '8px 14px', textAlign: 'right', fontWeight: 700,
    borderTop: '1px solid #2d3748', borderBottom: '2px solid #2d3748',
    background: '#141824', fontSize: 12, color: '#7dd3fc', fontFamily: 'monospace',
  },

  // Comparison table
  compTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  compTh: {
    padding: '8px 14px', textAlign: 'right', color: '#475569',
    borderBottom: '1px solid #1e2535', fontSize: 11, fontWeight: 700,
  },
  compThLeft: {
    padding: '8px 14px', textAlign: 'left', color: '#475569',
    borderBottom: '1px solid #1e2535', fontSize: 11, fontWeight: 700,
  },
  compTd: { padding: '6px 14px', textAlign: 'right', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },
  compTdLeft: { padding: '6px 14px', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },
  diffPos: { color: '#4ade80' },
  diffNeg: { color: '#f87171' },
  diffZero: { color: '#475569' },

  statsRow: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  statCard: {
    background: '#141824', border: '1px solid #1e2535', borderRadius: 6,
    padding: '10px 16px', minWidth: 120,
  },
  statLabel: { fontSize: 10, color: '#64748b', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 700, color: '#7dd3fc', fontFamily: 'monospace' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GAAP_LABELS = { us_gaap: 'US GAAP', french_gaap: 'French PCG', belgium_gaap: 'Belgian PCMN' };
const GAAP_KEYS   = ['us_gaap', 'french_gaap', 'belgium_gaap'];

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDiff(n) {
  if (n === undefined || n === null || isNaN(n) || Math.abs(n) < 0.5) return '—';
  return (n > 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const LINE_LABELS = {
  revenue: 'Revenue', cogs: 'COGS', grossProfit: 'Gross Profit',
  opEx: 'Operating Expenses', ebit: 'EBIT', netIncome: 'Net Income / EBT',
  totalAssets: 'Total Assets', totalLiab: 'Total Liabilities', equity: 'Equity',
};

// ─── P&L statement ────────────────────────────────────────────────────────────

function PnLStatement({ pnl, gaapKey }) {
  if (!pnl) return <div style={{ padding: 16, color: '#475569', fontSize: 12 }}>No P&L data available.</div>;

  const accentColor = gaapKey === 'french_gaap' ? '#c084fc' : gaapKey === 'belgium_gaap' ? '#fb923c' : '#7dd3fc';

  const rows = [
    { label: 'Revenue',                  value: pnl.revenue,    bold: false },
    { label: 'Cost of Goods Sold',        value: -pnl.cogs,      bold: false },
    { label: 'Gross Profit',              value: pnl.grossProfit, bold: true, subtotal: true },
    { label: 'Operating Expenses',        value: -(pnl.opEx),    bold: false },
    { label: 'EBIT',                      value: pnl.ebit,       bold: true, subtotal: true },
    { label: 'Finance Costs',             value: -pnl.finCosts,  bold: false },
    { label: 'Net Income (EBT)',          value: pnl.netIncome,  bold: true, subtotal: true, accent: true },
  ];

  return (
    <div style={S.stmtBox}>
      <div style={{ ...S.stmtTitle, borderLeft: `3px solid ${accentColor}`, paddingLeft: 13 }}>
        Profit & Loss — {GAAP_LABELS[gaapKey]}
      </div>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Line Item</th>
            <th style={S.thRight}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => r.subtotal ? (
            <tr key={r.label}>
              <td style={S.subtotalRow}>{r.label}</td>
              <td style={{ ...S.subtotalRight, color: r.accent ? accentColor : '#7dd3fc' }}>
                {fmt(r.value)}
              </td>
            </tr>
          ) : (
            <tr key={r.label}>
              <td style={{ ...S.td, paddingLeft: 22, color: '#94a3b8' }}>{r.label}</td>
              <td style={{ ...S.tdRight, color: r.value >= 0 ? '#e2e8f0' : '#f87171' }}>{fmt(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pnl.sections && pnl.sections.length > 0 && (
        <details style={{ padding: '8px 14px' }}>
          <summary style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Detail by account</summary>
          <table style={{ ...S.table, marginTop: 8 }}>
            <thead>
              <tr><th style={S.th}>Account</th><th style={S.th}>Description</th><th style={S.thRight}>Balance</th></tr>
            </thead>
            <tbody>
              {pnl.sections.flatMap(sec =>
                sec.accounts.length > 0 ? [
                  <tr key={'hdr-' + sec.section}>
                    <td colSpan={3} style={{ ...S.sectionRow }}>{sec.section}</td>
                  </tr>,
                  ...sec.accounts.map(a => (
                    <tr key={a.account}>
                      <td style={{ ...S.td, color: accentColor }}>{a.account}</td>
                      <td style={{ ...S.td, color: '#94a3b8' }}>{a.description || '—'}</td>
                      <td style={S.tdRight}>{fmt(a.balance)}</td>
                    </tr>
                  )),
                ] : []
              )}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

// ─── Balance Sheet statement ──────────────────────────────────────────────────

function BSStatement({ bs, gaapKey }) {
  if (!bs) return <div style={{ padding: 16, color: '#475569', fontSize: 12 }}>No Balance Sheet data available.</div>;

  const accentColor = gaapKey === 'french_gaap' ? '#c084fc' : gaapKey === 'belgium_gaap' ? '#fb923c' : '#7dd3fc';

  const rows = [
    { label: 'Current Assets',      value: bs.currentAssets,   bold: false },
    { label: 'Fixed Assets (net)',   value: bs.fixedAssets,     bold: false },
    { label: 'Total Assets',         value: bs.totalAssets,     bold: true, subtotal: true },
    { label: 'Current Liabilities',  value: bs.currentLiab,    bold: false },
    { label: 'Long-Term Liabilities',value: bs.longTermLiab,   bold: false },
    { label: 'Equity',               value: bs.equity,          bold: false },
    { label: 'Total Liab. + Equity', value: bs.totalLiabEquity, bold: true, subtotal: true, accent: true },
  ];

  return (
    <div style={S.stmtBox}>
      <div style={{ ...S.stmtTitle, borderLeft: `3px solid ${accentColor}`, paddingLeft: 13 }}>
        Balance Sheet — {GAAP_LABELS[gaapKey]}
      </div>
      <table style={S.table}>
        <thead>
          <tr><th style={S.th}>Line Item</th><th style={S.thRight}>Amount</th></tr>
        </thead>
        <tbody>
          {rows.map(r => r.subtotal ? (
            <tr key={r.label}>
              <td style={S.subtotalRow}>{r.label}</td>
              <td style={{ ...S.subtotalRight, color: r.accent ? accentColor : '#7dd3fc' }}>{fmt(r.value)}</td>
            </tr>
          ) : (
            <tr key={r.label}>
              <td style={{ ...S.td, paddingLeft: 22, color: '#94a3b8' }}>{r.label}</td>
              <td style={{ ...S.tdRight, color: '#e2e8f0' }}>{fmt(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {bs.sections && bs.sections.length > 0 && (
        <details style={{ padding: '8px 14px' }}>
          <summary style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Detail by account</summary>
          <table style={{ ...S.table, marginTop: 8 }}>
            <thead>
              <tr><th style={S.th}>Account</th><th style={S.th}>Description</th><th style={S.thRight}>Balance</th></tr>
            </thead>
            <tbody>
              {bs.sections.flatMap(sec =>
                sec.accounts.length > 0 ? [
                  <tr key={'hdr-' + sec.section}><td colSpan={3} style={S.sectionRow}>{sec.section}</td></tr>,
                  ...sec.accounts.map(a => (
                    <tr key={a.account}>
                      <td style={{ ...S.td, color: accentColor }}>{a.account}</td>
                      <td style={{ ...S.td, color: '#94a3b8' }}>{a.description || '—'}</td>
                      <td style={S.tdRight}>{fmt(a.balance)}</td>
                    </tr>
                  )),
                ] : []
              )}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

// ─── GAAP comparison ──────────────────────────────────────────────────────────

function GaapComparison({ comparison, stmts }) {
  if (!comparison) return null;
  const { diffs, hasGaapDifferences } = comparison;

  if (!hasGaapDifferences) {
    return (
      <div style={{ background: '#14532d22', border: '1px solid #166534', borderRadius: 8, padding: '14px 18px' }}>
        <span style={{ color: '#4ade80', fontWeight: 700 }}>✓ All three GAAPs produce identical P&L and Balance Sheet values.</span>
      </div>
    );
  }

  return (
    <div style={{ background: '#141824', border: '1px solid #1e2535', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2535', background: '#0f1117', fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
        GAAP Reconciliation — Key Differences
      </div>
      <table style={S.compTable}>
        <thead>
          <tr>
            <th style={S.compThLeft}>Line</th>
            <th style={S.compTh}>US GAAP</th>
            <th style={S.compTh}>French PCG</th>
            <th style={S.compTh}>Δ FR</th>
            <th style={S.compTh}>Belgian PCMN</th>
            <th style={S.compTh}>Δ BE</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map(d => {
            const frStyle = Math.abs(d.diffUSvsFR) < 0.5 ? S.diffZero : d.diffUSvsFR > 0 ? S.diffPos : S.diffNeg;
            const beStyle = Math.abs(d.diffUSvsBE) < 0.5 ? S.diffZero : d.diffUSvsBE > 0 ? S.diffPos : S.diffNeg;
            return (
              <React.Fragment key={d.line}>
                <tr>
                  <td style={{ ...S.compTdLeft, fontWeight: 600, color: '#94a3b8' }}>{LINE_LABELS[d.line] || d.line}</td>
                  <td style={S.compTd}>{fmt(d.us)}</td>
                  <td style={{ ...S.compTd, color: '#c084fc' }}>{fmt(d.fr)}</td>
                  <td style={{ ...S.compTd, ...frStyle }}>{fmtDiff(d.diffUSvsFR)}</td>
                  <td style={{ ...S.compTd, color: '#fb923c' }}>{fmt(d.be)}</td>
                  <td style={{ ...S.compTd, ...beStyle }}>{fmtDiff(d.diffUSvsBE)}</td>
                </tr>
                {d.driver && (
                  <tr>
                    <td colSpan={6} style={{ padding: '2px 14px 8px', fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                      {d.driver}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Overview stats ───────────────────────────────────────────────────────────

function OverviewStats({ stmts }) {
  if (!stmts) return null;
  const { us, fr, be } = stmts;
  return (
    <div style={S.statsRow}>
      {[
        { label: 'US Net Income',  value: fmt(us?.pnl?.netIncome),  color: '#7dd3fc' },
        { label: 'FR Net Income',  value: fmt(fr?.pnl?.netIncome),  color: '#c084fc' },
        { label: 'BE Net Income',  value: fmt(be?.pnl?.netIncome),  color: '#fb923c' },
        { label: 'US Total Assets',value: fmt(us?.bs?.totalAssets), color: '#7dd3fc' },
        { label: 'FR Total Assets',value: fmt(fr?.bs?.totalAssets), color: '#c084fc' },
        { label: 'BE Total Assets',value: fmt(be?.bs?.totalAssets), color: '#fb923c' },
        { label: 'Entries',        value: us?.entryCount ?? '—',     color: '#64748b' },
        { label: 'Classified',     value: us?.classifiedCount ?? '—',color: '#64748b' },
      ].map(s => (
        <div key={s.label} style={S.statCard}>
          <div style={S.statLabel}>{s.label}</div>
          <div style={{ ...S.statValue, color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'pnl',        label: 'P&L' },
  { key: 'bs',         label: 'Balance Sheet' },
  { key: 'comparison', label: 'GAAP Comparison' },
];

export default function FinancialsView({ voucherData }) {
  const [activeTab, setActiveTab]   = useState('overview');
  const [activeGaap, setActiveGaap] = useState('us_gaap');
  const [stmts, setStmts]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const hasData = voucherData && Object.keys(voucherData).length > 0;

  useEffect(() => {
    if (!hasData) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.electronAPI.buildFinancials(voucherData)
      .then(res => {
        if (cancelled) return;
        if (res.error) setError(res.error);
        else setStmts(res);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [voucherData]);

  const activeStmt = stmts?.[activeGaap === 'us_gaap' ? 'us' : activeGaap === 'french_gaap' ? 'fr' : 'be'];

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.headerLeft}>
          <h2 style={S.headerTitle}>Financial Statements</h2>
          <p style={S.headerSub}>P&L and Balance Sheet across US GAAP, French PCG, and Belgian PCMN</p>
        </div>
        {stmts && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ {stmts.us?.entryCount || 0} entries classified</span>}
      </div>

      <div style={S.tabRow}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...S.tab, ...(activeTab === t.key ? S.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.body}>
        {!hasData && (
          <div style={S.empty}>
            <span style={S.emptyIcon}>📊</span>
            <span style={S.emptyText}>Upload an Excel file to generate financial statements.</span>
          </div>
        )}

        {hasData && loading && (
          <div style={S.empty}>
            <span style={S.emptyText}>Building financial statements…</span>
          </div>
        )}

        {hasData && error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', color: '#f87171' }}>
            {error}
          </div>
        )}

        {hasData && !loading && stmts && (
          <>
            {activeTab === 'overview' && (
              <>
                <OverviewStats stmts={stmts} />
                <GaapComparison comparison={stmts.comparison} stmts={stmts} />
              </>
            )}

            {activeTab === 'pnl' && (
              <>
                <div style={S.gaapRow}>
                  {GAAP_KEYS.map(g => (
                    <button
                      key={g}
                      style={{ ...S.gaapBtn, ...(activeGaap === g ? S.gaapBtnActive : {}) }}
                      onClick={() => setActiveGaap(g)}
                    >
                      {GAAP_LABELS[g]}
                    </button>
                  ))}
                </div>
                <div style={S.stmtGrid}>
                  <PnLStatement pnl={activeStmt?.pnl} gaapKey={activeGaap} />
                </div>
              </>
            )}

            {activeTab === 'bs' && (
              <>
                <div style={S.gaapRow}>
                  {GAAP_KEYS.map(g => (
                    <button
                      key={g}
                      style={{ ...S.gaapBtn, ...(activeGaap === g ? S.gaapBtnActive : {}) }}
                      onClick={() => setActiveGaap(g)}
                    >
                      {GAAP_LABELS[g]}
                    </button>
                  ))}
                </div>
                <div style={S.stmtGrid}>
                  <BSStatement bs={activeStmt?.bs} gaapKey={activeGaap} />
                </div>
              </>
            )}

            {activeTab === 'comparison' && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={S.stmtGrid}>
                    <PnLStatement pnl={stmts.us?.pnl}  gaapKey="us_gaap" />
                    <PnLStatement pnl={stmts.fr?.pnl}  gaapKey="french_gaap" />
                    <PnLStatement pnl={stmts.be?.pnl}  gaapKey="belgium_gaap" />
                  </div>
                </div>
                <GaapComparison comparison={stmts.comparison} stmts={stmts} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
