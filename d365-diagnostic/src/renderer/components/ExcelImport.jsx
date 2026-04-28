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
        // Rebuild grouped vouchers from flat entry list
        const raw = resp.data['Journal Entries'];
        if (raw?.entries) {
          const grouped = groupByVoucher(raw.entries);
          setImportedData({ 'Journal Entries': { entries: raw.entries, vouchers: grouped, stats: calcStats(raw.entries) } });
          setFilePath('(sample data)');
        }
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
    if (resp.success) {
      alert(`Sample Excel saved to:\n${resp.filePath}`);
    }
  };

  const clear = () => { setImportedData(null); setFilePath(''); setError(null); };

  const totalSheets   = importedData ? Object.keys(importedData).length : 0;
  const totalVouchers = importedData ? Object.values(importedData).reduce((s, d) => s + Object.keys(d.vouchers || {}).length, 0) : 0;
  const totalEntries  = importedData ? Object.values(importedData).reduce((s, d) => s + (d.entries?.length || 0), 0) : 0;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Excel Import</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Load a D365 journal entry export. Supported columns: Voucher, Date, Account, Description, Debit, Credit.
          Column names are auto-detected (English &amp; French).
        </p>
      </div>

      {/* Drop zone / action buttons */}
      {!importedData ? (
        <div style={S.dropZone}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📥</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
            Import an Excel file
          </div>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 24, maxWidth: 400, textAlign: 'center' }}>
            Excel (.xlsx / .xls) with D365 voucher journal entries. Multiple sheets are supported.
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
                <div style={{ fontWeight: 700, color: '#e2e8f0' }}>File loaded successfully</div>
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

function SheetPreview({ sheetName, data }) {
  const [showAll, setShowAll] = useState(false);
  const vouchers = Object.values(data.vouchers || {});
  const visible  = showAll ? vouchers : vouchers.slice(0, 10);

  return (
    <div style={S.sheetCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <span style={{ fontWeight: 700, color: '#e2e8f0' }}>📄 {sheetName}</span>
          <span style={{ fontSize: 12, color: '#475569', marginLeft: 12 }}>
            {vouchers.length} vouchers · {data.entries?.length || 0} entries ·
            {data.stats?.isBalanced ? ' ✓ Overall balanced' : ' ⚠ Check balance'}
          </span>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Voucher</th><th>Date</th><th>Entries</th>
            <th className="amount">Total Debit</th><th className="amount">Total Credit</th><th>Balanced</th>
            <th>Accounts</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(v => (
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
              <td style={{ fontSize: 11, color: '#64748b' }}>
                {[...v.debitAccounts, ...v.creditAccounts].join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {vouchers.length > 10 && (
        <button style={S.showMoreBtn} onClick={() => setShowAll(p => !p)}>
          {showAll ? 'Show less ▲' : `Show all ${vouchers.length} vouchers ▼`}
        </button>
      )}
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div style={S.statCard}>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#3b82f6' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
    </div>
  );
}

const fmt = n => n?.toLocaleString('en', { minimumFractionDigits: 2 }) || '0.00';

// Client-side re-grouping for sample data
function groupByVoucher(entries) {
  const v = {};
  for (const e of entries) {
    if (!v[e.voucher]) v[e.voucher] = { voucherId: e.voucher, date: e.date, entries: [], totalDebit: 0, totalCredit: 0, currency: e.currency || 'EUR' };
    v[e.voucher].entries.push(e);
    v[e.voucher].totalDebit  += e.debit  || 0;
    v[e.voucher].totalCredit += e.credit || 0;
  }
  for (const vo of Object.values(v)) {
    vo.imbalance = Math.round(Math.abs(vo.totalDebit - vo.totalCredit) * 100) / 100;
    vo.isBalanced = vo.imbalance < 0.01;
    vo.debitAccounts  = [...new Set(vo.entries.filter(e => e.debit  > 0).map(e => e.account))];
    vo.creditAccounts = [...new Set(vo.entries.filter(e => e.credit > 0).map(e => e.account))];
  }
  return v;
}
function calcStats(entries) {
  const dr = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const cr = entries.reduce((s, e) => s + (e.credit || 0), 0);
  return { totalEntries: entries.length, totalDebit: dr, totalCredit: cr, isBalanced: Math.abs(dr - cr) < 0.01 };
}

const S = {
  dropZone: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '60px 40px', border: '2px dashed #1e293b', borderRadius: 12, minHeight: 300,
  },
  primaryBtn: { padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '10px 20px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  ghostBtn:     { padding: '10px 20px', background: 'none', color: '#64748b', border: '1px dashed #334155', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  errorBox: { marginTop: 16, padding: '10px 14px', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6, color: '#fca5a5', fontSize: 13 },
  successBanner: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 18px', background: '#0f2a1a', border: '1px solid #166534',
    borderRadius: 10, marginBottom: 16,
  },
  clearBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  statsRow: { display: 'flex', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10,
    padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  sheetCard: { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '16px', marginBottom: 16, overflow: 'auto' },
  showMoreBtn: { marginTop: 12, background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, padding: '4px 0' },
};
