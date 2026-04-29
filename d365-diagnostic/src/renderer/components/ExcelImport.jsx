import React, { useState } from 'react';

export default function ExcelImport({ importedData, setImportedData }) {
  const [loading,  setLoading]  = useState(false);
  const [filePath, setFilePath] = useState('');
  const [error,    setError]    = useState(null);

  const handleImport = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await window.electronAPI.importExcel();
      if (resp.canceled) { setLoading(false); return; }
      if (resp.success) {
        setImportedData(resp.data);
        setFilePath(resp.filePath);
      } else {
        setError(resp.error || 'Failed to parse file');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleLoadSample = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await window.electronAPI.loadSampleData();
      if (resp.success) {
        setImportedData(resp.data);
        setFilePath('(sample data)');
      } else {
        setError(resp.error);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleGenerateSample = async () => {
    if (!window.electronAPI) return;
    const resp = await window.electronAPI.generateSampleExcel();
    if (resp.success) alert(`Sample Excel saved to:\n${resp.filePath}`);
  };

  const clear = () => { setImportedData(null); setFilePath(''); setError(null); };

  const totalSheets   = importedData ? Object.keys(importedData).length : 0;
  const totalVouchers = importedData
    ? Object.values(importedData).reduce((s, d) => s + Object.keys(d.vouchers || {}).length, 0)
    : 0;
  const totalEntries  = importedData
    ? Object.values(importedData).reduce((s, d) => s + (d.entries?.length || 0), 0)
    : 0;
  const hasDualGaap   = importedData
    ? Object.values(importedData).some(d => d.gaapValidation?.isDualGaap)
    : false;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Excel Import</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Load a D365 journal entry export. Supports single-account (legacy) and dual-GAAP formats
          (US_Account + FR_Account columns). Column names are auto-detected in English &amp; French.
        </p>
      </div>

      {!importedData ? (
        <div style={S.dropZone}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📥</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
            Import an Excel file
          </div>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 8, maxWidth: 480, textAlign: 'center' }}>
            Excel (.xlsx / .xls) with D365 voucher journal entries. Multiple sheets supported.
          </p>
          <p style={{ fontSize: 12, color: '#334155', marginBottom: 24, maxWidth: 480, textAlign: 'center' }}>
            Dual-GAAP columns detected automatically: <span style={{ color: '#60a5fa' }}>US_Account</span> + <span style={{ color: '#34d399' }}>FR_Account</span>, plus ExchangeRate, TransactionType, Project, Category.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button style={S.primaryBtn} onClick={handleImport} disabled={loading}>
              {loading ? '⏳ Loading…' : '📂 Open Excel File'}
            </button>
            <button style={S.secondaryBtn} onClick={handleLoadSample} disabled={loading}>
              🧪 Load Sample Data
            </button>
            <button style={S.ghostBtn} onClick={handleGenerateSample} disabled={loading}>
              ⬇ Download Sample Excel
            </button>
          </div>
          {error && <div style={S.errorBox}>{error}</div>}
        </div>
      ) : (
        <div>
          {/* Status banner */}
          <div style={S.successBanner}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>✅</span>
              <div>
                <div style={{ fontWeight: 700, color: '#e2e8f0' }}>
                  File loaded{hasDualGaap ? ' — Dual GAAP mode active' : ''}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{filePath}</div>
              </div>
            </div>
            <button style={S.clearBtn} onClick={clear}>✕ Clear</button>
          </div>

          {/* Stats */}
          <div style={S.statsRow}>
            <StatCard value={totalSheets}   label="Sheets"   />
            <StatCard value={totalVouchers} label="Vouchers" />
            <StatCard value={totalEntries}  label="Entries"  />
            {hasDualGaap && <DualGaapStatCards data={importedData} />}
          </div>

          {/* Sheet previews */}
          {Object.entries(importedData).map(([sheetName, data]) => (
            <SheetPreview key={sheetName} sheetName={sheetName} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dual-GAAP aggregate stat cards ──────────────────────────────────────────
function DualGaapStatCards({ data }) {
  let correct = 0, incorrect = 0, missing = 0, conflicting = 0;
  Object.values(data).forEach(d => {
    const s = d.gaapValidation?.gaapSummary;
    if (!s) return;
    correct     += s.correct      || 0;
    incorrect   += s.incorrect    || 0;
    missing     += s.missing      || 0;
    conflicting += s.conflicting  || 0;
  });
  return (
    <>
      <StatCard value={correct}     label="Correct ✓"    color="#22c55e" />
      <StatCard value={incorrect}   label="Incorrect ✗"  color={incorrect   > 0 ? '#ef4444' : '#64748b'} />
      <StatCard value={missing}     label="Missing ?"    color={missing     > 0 ? '#f59e0b' : '#64748b'} />
      <StatCard value={conflicting} label="Conflicting"  color={conflicting > 0 ? '#f97316' : '#64748b'} />
    </>
  );
}

// ─── Sheet preview ────────────────────────────────────────────────────────────
function SheetPreview({ sheetName, data }) {
  const [showAll,   setShowAll]   = useState(false);
  const [activeTab, setActiveTab] = useState('vouchers');

  const vouchers  = Object.values(data.vouchers || {});
  const visible   = showAll ? vouchers : vouchers.slice(0, 10);
  const isDualGaap = data.gaapValidation?.isDualGaap;
  const gv         = data.gaapValidation;

  return (
    <div style={S.sheetCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <span style={{ fontWeight: 700, color: '#e2e8f0' }}>📄 {sheetName}</span>
          <span style={{ fontSize: 12, color: '#475569', marginLeft: 12 }}>
            {vouchers.length} vouchers · {data.entries?.length || 0} entries ·
            {data.stats?.isBalanced ? ' ✓ Balanced' : ' ⚠ Check balance'}
            {isDualGaap && (
              <span style={{ marginLeft: 8, color: '#60a5fa', fontWeight: 600 }}>
                · Dual GAAP · {gv.gaapSummary.coveragePct}% coverage
              </span>
            )}
          </span>
        </div>
        {isDualGaap && (
          <div style={{ display: 'flex', gap: 4 }}>
            {['vouchers','gaap'].map(t => (
              <button
                key={t}
                style={{ ...S.tabBtn, ...(activeTab === t ? S.tabBtnActive : {}) }}
                onClick={() => setActiveTab(t)}
              >
                {t === 'gaap' ? 'GAAP Analysis' : 'Vouchers'}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'gaap' && isDualGaap ? (
        <DualGaapPreview gv={gv} />
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Date</th>
                <th>Entries</th>
                <th className="amount">Total Debit</th>
                <th className="amount">Total Credit</th>
                <th>Balanced</th>
                {isDualGaap && <th>GAAP Status</th>}
                <th>Accounts</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(v => {
                const recon = isDualGaap
                  ? gv.reconciliations.find(r => r.voucherId === v.voucherId)
                  : null;
                return (
                  <tr key={v.voucherId}>
                    <td style={{ fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{v.voucherId}</td>
                    <td>{v.date || '–'}</td>
                    <td>{v.entries.length}</td>
                    <td className="amount">{fmt(v.totalDebit)}</td>
                    <td className="amount">{fmt(v.totalCredit)}</td>
                    <td>
                      <span style={{ color: v.isBalanced ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {v.isBalanced ? '✓' : `⚠ ${v.imbalance?.toFixed(2)}`}
                      </span>
                    </td>
                    {isDualGaap && (
                      <td>
                        {recon ? (
                          <GaapStatusBadge status={recon.status} coverage={recon.mappingCoverage} />
                        ) : '–'}
                      </td>
                    )}
                    <td style={{ fontSize: 11, color: '#64748b' }}>
                      {[...(v.debitAccounts || []), ...(v.creditAccounts || [])].join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {vouchers.length > 10 && (
            <button style={S.showMoreBtn} onClick={() => setShowAll(p => !p)}>
              {showAll ? 'Show less ▲' : `Show all ${vouchers.length} vouchers ▼`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Dual-GAAP entry-level analysis table ────────────────────────────────────
function DualGaapPreview({ gv }) {
  const [showAll, setShowAll] = useState(false);

  const s = gv.gaapSummary;

  // All entries, issues first
  const allEntries = [...gv.entries].sort((a, b) => {
    const order = { incorrect: 0, conflicting: 1, missing: 2, missing_us: 3, missing_fr: 4, correct: 5 };
    return (order[a.gaapAnalysis?.mappingStatus] ?? 9) - (order[b.gaapAnalysis?.mappingStatus] ?? 9);
  });
  const visible = showAll ? allEntries : allEntries.slice(0, 30);

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, padding: '10px 14px', background: '#0f1117', borderRadius: 8, border: '1px solid #1e293b' }}>
        <GaapStat label="Total"      value={s.totalEntries}  color="#94a3b8" />
        <GaapStat label="Correct"    value={s.correct}       color="#22c55e" />
        <GaapStat label="Incorrect"  value={s.incorrect}     color={s.incorrect   > 0 ? '#ef4444' : '#64748b'} />
        <GaapStat label="Missing"    value={s.missing}       color={s.missing     > 0 ? '#f59e0b' : '#64748b'} />
        <GaapStat label="Conflicting"value={s.conflicting}   color={s.conflicting > 0 ? '#f97316' : '#64748b'} />
        <GaapStat label="Coverage"   value={`${s.coveragePct}%`} color={s.coveragePct >= 80 ? '#22c55e' : s.coveragePct >= 50 ? '#f59e0b' : '#ef4444'} />
      </div>

      {/* Consistency issue banners */}
      {gv.consistencyIssues.map((ci, i) => (
        <div key={i} style={{ padding: '8px 12px', background: '#431407', border: '1px solid #c2410c', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: '#fb923c', fontWeight: 700 }}>⚠ {ci.type === 'CONFLICTING_MAPPING' ? 'Global Conflict' : 'Voucher Conflict'}:</span>
          <span style={{ color: '#fed7aa', marginLeft: 6 }}>US {ci.usAccount} → [{(ci.frAccounts || []).join(', ')}]</span>
          <span style={{ color: '#9a3412', marginLeft: 8 }}>{ci.issue}</span>
        </div>
      ))}

      {/* Entry table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0d1219' }}>
              <Th>Voucher</Th>
              <Th>Description</Th>
              <Th right>DR</Th>
              <Th right>CR</Th>
              <Th>US Account</Th>
              <Th>FR Account</Th>
              <Th>Expected FR</Th>
              <Th>Status</Th>
              <Th>Issue</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry, i) => {
              const ga = entry.gaapAnalysis || {};
              const st = ga.mappingStatus || 'unknown';
              return (
                <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={Td}>{entry.voucher}</td>
                  <td style={{ ...Td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8' }}>{entry.description || '–'}</td>
                  <td style={{ ...Td, textAlign: 'right', fontFamily: 'monospace' }}>{entry.debit  > 0 ? fmt(entry.debit)  : ''}</td>
                  <td style={{ ...Td, textAlign: 'right', fontFamily: 'monospace' }}>{entry.credit > 0 ? fmt(entry.credit) : ''}</td>
                  <td style={{ ...Td, fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>{ga.usAccount || entry.account || '–'}</td>
                  <td style={{ ...Td, fontWeight: 700, color: frColor(st), fontFamily: 'monospace' }}>{ga.frAccount || '–'}</td>
                  <td style={{ ...Td, fontFamily: 'monospace', color: '#94a3b8' }}>
                    {st === 'incorrect' ? (
                      <span style={{ color: '#34d399' }}>{ga.expectedFrAccount || '–'}</span>
                    ) : st === 'correct' ? (
                      <span style={{ color: '#475569' }}>✓</span>
                    ) : '–'}
                  </td>
                  <td style={Td}><MappingBadge status={st} /></td>
                  <td style={{ ...Td, maxWidth: 260, color: '#94a3b8', fontSize: 11, whiteSpace: 'normal' }}>
                    {ga.issue || ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {allEntries.length > 30 && (
        <button style={S.showMoreBtn} onClick={() => setShowAll(p => !p)}>
          {showAll ? 'Show less ▲' : `Show all ${allEntries.length} entries ▼`}
        </button>
      )}
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────
function MappingBadge({ status }) {
  const cfg = {
    correct:     { label: '✓ Correct',     bg: '#052e16', color: '#86efac' },
    incorrect:   { label: '✗ Incorrect',   bg: '#450a0a', color: '#fca5a5' },
    missing:     { label: '? Missing',     bg: '#422006', color: '#fcd34d' },
    missing_us:  { label: '? No US Acct',  bg: '#422006', color: '#fcd34d' },
    missing_fr:  { label: '? No FR Acct',  bg: '#422006', color: '#fcd34d' },
    conflicting: { label: '⚡ Conflict',   bg: '#431407', color: '#fb923c' },
  }[status] || { label: status, bg: '#1e293b', color: '#94a3b8' };

  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '2px 7px', borderRadius: 999,
      background: cfg.bg, color: cfg.color, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function GaapStatusBadge({ status, coverage }) {
  const cfg = {
    clean:   { label: `✓ ${coverage}%`, color: '#22c55e' },
    warning: { label: `⚠ ${coverage}%`, color: '#f59e0b' },
    error:   { label: `✗ ${coverage}%`, color: '#ef4444' },
  }[status] || { label: coverage ? `${coverage}%` : '–', color: '#64748b' };

  return <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>;
}

function GaapStat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</span>
    </div>
  );
}

function StatCard({ value, label, color }) {
  return (
    <div style={S.statCard}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || '#3b82f6' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th style={{ padding: '7px 8px', textAlign: right ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, color: '#475569', borderBottom: '1px solid #1e293b' }}>
      {children}
    </th>
  );
}

const Td = { padding: '7px 8px', verticalAlign: 'middle', color: '#e2e8f0' };

const frColor = (status) =>
  status === 'correct'   ? '#34d399' :
  status === 'incorrect' ? '#fca5a5' :
  status === 'conflicting' ? '#fb923c' : '#f59e0b';

const fmt = n => n?.toLocaleString('en', { minimumFractionDigits: 2 }) || '0.00';

const S = {
  dropZone: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '60px 40px', border: '2px dashed #1e293b', borderRadius: 12, minHeight: 300,
  },
  primaryBtn:   { padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '10px 20px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  ghostBtn:     { padding: '10px 20px', background: 'none', color: '#64748b', border: '1px dashed #334155', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  errorBox:     { marginTop: 16, padding: '10px 14px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#fca5a5', fontSize: 13 },
  successBanner: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#0f2a1a', border: '1px solid #166534',
    borderRadius: 10, marginBottom: 16,
  },
  clearBtn:   { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  statsRow:   { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  statCard:   { flex: '0 1 120px', background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 },
  sheetCard:  { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '16px', marginBottom: 16, overflow: 'auto' },
  showMoreBtn:{ marginTop: 12, background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, padding: '4px 0' },
  tabBtn:     { padding: '5px 12px', background: 'none', border: '1px solid #334155', color: '#64748b', borderRadius: 5, fontSize: 12, cursor: 'pointer' },
  tabBtnActive:{ background: '#1e3a5f', border: '1px solid #3b82f6', color: '#60a5fa' },
};
