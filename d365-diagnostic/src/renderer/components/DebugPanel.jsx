import React, { useState, useEffect } from 'react';

export default function DebugPanel({ result }) {
  const [logs,        setLogs]        = useState([]);
  const [logFilter,   setLogFilter]   = useState('info');
  const [activeSection, setSection]   = useState('summary');
  const [refreshing,  setRefreshing]  = useState(false);

  const fetchLogs = async () => {
    if (!window.electronAPI?.getLogs) return;
    setRefreshing(true);
    try {
      const resp = await window.electronAPI.getLogs({ minLevel: logFilter, limit: 200 });
      if (resp.success) setLogs(resp.logs.slice().reverse());
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [logFilter]);

  // ── Engine summary ──────────────────────────────────────────────────────────
  const summary = result?.summary;
  const fxGainLoss = result?.fxGainLoss;
  const voucherAnalysis = result?.voucherAnalysis;

  const allVouchers = voucherAnalysis
    ? Object.entries(voucherAnalysis).flatMap(([sheet, sd]) =>
        sd.vouchers.map(v => ({ ...v, sheetName: sheet }))
      )
    : [];

  const sections = [
    { id: 'summary',   label: 'Engine Summary' },
    { id: 'vouchers',  label: `Vouchers (${allVouchers.length})` },
    { id: 'fx',        label: 'FX Calculations' },
    { id: 'logs',      label: `Logs (${logs.length})` },
  ];

  return (
    <div style={S.root}>
      <div style={S.titleRow}>
        <h1 style={S.title}>Debug Information</h1>
        <span style={S.badge}>Last run: {result ? new Date(result.timestamp).toLocaleTimeString() : '–'}</span>
      </div>

      {/* Tab bar */}
      <div style={S.tabs}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{ ...S.tab, ...(activeSection === s.id ? S.tabActive : {}) }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={S.content}>
        {activeSection === 'summary'  && <SummarySection summary={summary} result={result} />}
        {activeSection === 'vouchers' && <VouchersSection vouchers={allVouchers} />}
        {activeSection === 'fx'       && <FxSection fxGainLoss={fxGainLoss} />}
        {activeSection === 'logs'     && (
          <LogsSection logs={logs} filter={logFilter} setFilter={setLogFilter}
            onRefresh={fetchLogs} refreshing={refreshing} />
        )}
      </div>
    </div>
  );
}

// ── Engine summary section ───────────────────────────────────────────────────

function SummarySection({ summary, result }) {
  if (!result) return <Empty text="Run a diagnostic to see engine summary." />;

  const rows = [
    ['Module',           result.module?.label || result.context?.module || '–'],
    ['GAAP',             result.context?.gaap || '–'],
    ['Accounting Ccy',   result.context?.accountingCurrency || 'EUR'],
    ['PMA',              result.context?.pma ? 'On' : 'Off'],
    ['Overall Status',   summary?.overallStatus?.toUpperCase() || '–'],
    ['Total Issues',     String(summary?.totalIssues ?? '–')],
    ['Critical',         String(summary?.criticalCount ?? 0)],
    ['Errors',           String(summary?.errorCount ?? 0)],
    ['Warnings',         String(summary?.warningCount ?? 0)],
    ['Dual GAAP',        summary?.dualGaap?.isDualGaap ? `Yes — ${summary.dualGaap.coveragePct}% coverage` : 'No'],
    ['FX Exposure',      result.fxGainLoss ? `Net ${result.fxGainLoss.netFx?.toFixed(2)} ${result.fxGainLoss.accountingCurrency}` : 'None'],
    ['Financial Impact', result.financialImpact ? `${result.financialImpact.summary?.totalImpacts} items` : 'None'],
    ['Timestamp',        new Date(result.timestamp).toLocaleString()],
  ];

  return (
    <div>
      <Table rows={rows} />
      {summary?.topRootCauses?.length > 0 && (
        <Section title="Top Root Causes">
          {summary.topRootCauses.map((rc, i) => (
            <Row key={i} left={rc.title || rc.type} right={`× ${rc.count}`} />
          ))}
        </Section>
      )}
      {summary?.topSources?.length > 0 && (
        <Section title="Top Sources">
          {summary.topSources.map((s, i) => (
            <Row key={i} left={s.source} right={`× ${s.count}`} />
          ))}
        </Section>
      )}
    </div>
  );
}

// ── Vouchers section ─────────────────────────────────────────────────────────

function VouchersSection({ vouchers }) {
  const [selected, setSelected] = useState(null);
  if (vouchers.length === 0) return <Empty text="No vouchers in diagnostic result." />;

  const sel = selected ? vouchers.find(v => v.voucherId === selected && v.sheetName === selected.split('|')[0]) : null;
  const selV = vouchers.find(v => `${v.sheetName}|${v.voucherId}` === selected);

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* List */}
      <div style={S.vList}>
        {vouchers.map(v => {
          const key = `${v.sheetName}|${v.voucherId}`;
          const active = selected === key;
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              style={{ ...S.vRow, ...(active ? S.vRowActive : {}) }}
            >
              <span style={{ ...S.vSev, background: SEV_COLOR[v.severity] || '#334155' }}>{(v.severity || 'clean').slice(0,1).toUpperCase()}</span>
              <span style={{ flex: 1, fontSize: 12, color: '#cbd5e1' }}>{v.voucherId}</span>
              <span style={{ fontSize: 11, color: '#475569' }}>{v.issues.length}i</span>
            </button>
          );
        })}
      </div>
      {/* Detail */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selV ? <VoucherDebug v={selV} /> : <Empty text="Select a voucher to see details." />}
      </div>
    </div>
  );
}

function VoucherDebug({ v }) {
  const meta = [
    ['Voucher ID',      v.voucherId],
    ['Sheet',           v.sheetName],
    ['Detected Type',   v.detectedType || 'unknown'],
    ['Module',          v.module       || '–'],
    ['Status',          v.status],
    ['Severity',        v.severity],
    ['Issues',          String(v.issues.length)],
    ['Balanced',        v.isBalanced ? 'Yes' : `No (Δ${(v.totalDebit - v.totalCredit).toFixed(2)})`],
    ['Multi-Currency',  v.currencyAnalysis?.isMultiCurrency ? 'Yes' : 'No'],
  ];

  return (
    <div>
      <Table rows={meta} />
      {v.issues.length > 0 && (
        <Section title="Issues">
          {v.issues.map((issue, i) => (
            <div key={i} style={S.issueBlock}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ ...S.chip, background: SEV_COLOR[issue.severity] || '#334155', color: '#fff' }}>
                  {issue.severity?.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{issue.type}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{issue.detail}</div>
              {issue.fix && <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4 }}>Fix: {issue.fix}</div>}
              {issue.universalModel?.accountSource && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Source: {issue.universalModel.accountSource} → {issue.universalModel.configElement}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}
      {v.currencyAnalysis?.isMultiCurrency && (
        <Section title="Currency Analysis">
          {Object.entries(v.currencyAnalysis.currencyGroups || {}).map(([ccy, grp]) => (
            <Row key={ccy}
              left={`${ccy} × ${grp.lineCount} lines`}
              right={`${grp.totalDebit?.toFixed(2)} DR / ${grp.totalCredit?.toFixed(2)} CR`}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

// ── FX section ───────────────────────────────────────────────────────────────

function FxSection({ fxGainLoss }) {
  if (!fxGainLoss) return <Empty text="No FX gain/loss data in this diagnostic result." />;

  const meta = [
    ['Accounting Currency', fxGainLoss.accountingCurrency],
    ['Total Gain',          `+${fxGainLoss.totalGain?.toFixed(2)}`],
    ['Total Loss',          fxGainLoss.totalLoss?.toFixed(2)],
    ['Net FX',              fxGainLoss.netFx?.toFixed(2)],
  ];

  return (
    <div>
      <Table rows={meta} />
      {Object.entries(fxGainLoss.sheetResults || {}).map(([sheet, sr]) => (
        <Section key={sheet} title={`Sheet: ${sheet}`}>
          <Row left="FX Vouchers" right={String(sr.fxVoucherCount)} />
          <Row left="Sheet Gain"  right={`+${sr.sheetGain?.toFixed(2)}`} />
          <Row left="Sheet Loss"  right={sr.sheetLoss?.toFixed(2)} />
          <Row left="Net"         right={sr.sheetNetFx?.toFixed(2)} />
          {Object.entries(sr.voucherFxMap || {}).map(([vid, vfx]) => (
            <div key={vid} style={S.issueBlock}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{vid}</div>
              {vfx.fxLines?.map((line, i) => (
                <div key={i} style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                  {line.side?.toUpperCase()} {line.account} {line.originalCurrency} {line.originalAmount}
                  &nbsp;@ {line.originalExchangeRate} → {line.currentExchangeRate}
                  &nbsp;· <span style={{ color: line.gainOrLoss === 'gain' ? '#22c55e' : line.gainOrLoss === 'loss' ? '#ef4444' : '#94a3b8' }}>
                    {line.gainOrLoss} {line.economicFxDiff >= 0 ? '+' : ''}{line.economicFxDiff?.toFixed(2)} [{line.type}]
                  </span>
                </div>
              ))}
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}

// ── Logs section ─────────────────────────────────────────────────────────────

function LogsSection({ logs, filter, setFilter, onRefresh, refreshing }) {
  const levelColors = { error: '#ef4444', warn: '#f59e0b', info: '#3b82f6', debug: '#64748b' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#475569' }}>Min level:</span>
        {['error','warn','info','debug'].map(l => (
          <button key={l} onClick={() => setFilter(l)}
            style={{ ...S.chip, background: filter === l ? levelColors[l] : '#1e293b', color: '#e2e8f0', cursor: 'pointer', border: 'none' }}>
            {l}
          </button>
        ))}
        <button onClick={onRefresh} disabled={refreshing}
          style={{ ...S.chip, background: '#1e293b', color: '#64748b', cursor: 'pointer', border: 'none', marginLeft: 'auto' }}>
          {refreshing ? '⏳' : '↻'} Refresh
        </button>
      </div>
      {logs.length === 0 ? (
        <Empty text="No log entries at this level." />
      ) : (
        <div style={S.logContainer}>
          {logs.map((entry, i) => (
            <div key={i} style={{ ...S.logRow, borderLeft: `3px solid ${levelColors[entry.level] || '#334155'}` }}>
              <span style={{ ...S.logLevel, color: levelColors[entry.level] }}>{entry.level.toUpperCase()}</span>
              <span style={S.logCat}>[{entry.category}]</span>
              <span style={S.logMsg}>{entry.message}</span>
              <span style={S.logTime}>{entry.timestamp.slice(11, 23)}</span>
              {entry.data && (
                <div style={S.logData}>{JSON.stringify(entry.data)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Empty({ text }) {
  return <div style={{ color: '#475569', fontSize: 13, padding: 24 }}>{text}</div>;
}

function Table({ rows }) {
  return (
    <table style={S.table}>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i}>
            <td style={S.tdKey}>{k}</td>
            <td style={S.tdVal}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, children }) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div style={S.kv}>
      <span style={{ color: '#94a3b8', fontSize: 12 }}>{left}</span>
      <span style={{ color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace' }}>{right}</span>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', clean: '#22c55e' };

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root:       { display: 'flex', flexDirection: 'column', height: '100%', gap: 0 },
  titleRow:   { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  title:      { fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 },
  badge:      { fontSize: 11, color: '#475569', background: '#1e293b', padding: '3px 8px', borderRadius: 4 },
  tabs:       { display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 0 },
  tab:        { padding: '7px 16px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive:  { color: '#e2e8f0', borderBottomColor: '#3b82f6' },
  content:    { flex: 1, overflowY: 'auto' },

  table:      { borderCollapse: 'collapse', marginBottom: 20, width: '100%', maxWidth: 600 },
  tdKey:      { padding: '5px 14px 5px 0', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top', width: 160 },
  tdVal:      { padding: '5px 0', fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace' },
  section:    { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#334155', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  kv:         { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '4px 0', borderBottom: '1px solid #0f1117' },
  chip:       { padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  issueBlock: { background: '#0d1219', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px', marginBottom: 8 },

  vList:      { width: 200, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  vRow:       { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#0d1219', border: '1px solid #1e293b', borderRadius: 4, cursor: 'pointer', width: '100%', textAlign: 'left' },
  vRowActive: { background: '#1a1f2e', borderColor: '#3b82f6' },
  vSev:       { width: 18, height: 18, borderRadius: 3, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },

  logContainer: { display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'monospace' },
  logRow:     { padding: '6px 10px', background: '#0d1219', borderRadius: 4, fontSize: 11 },
  logLevel:   { fontWeight: 700, marginRight: 6, minWidth: 42, display: 'inline-block' },
  logCat:     { color: '#475569', marginRight: 8 },
  logMsg:     { color: '#cbd5e1' },
  logTime:    { color: '#334155', float: 'right' },
  logData:    { color: '#475569', marginTop: 3, wordBreak: 'break-all' },
};
