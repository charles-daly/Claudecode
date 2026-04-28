import React, { useState, useMemo } from 'react';

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', clean: '#22c55e' };

export default function VoucherAnalysis({ result }) {
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterSheet,    setFilterSheet]    = useState('all');
  const [search,         setSearch]         = useState('');
  const [selected,       setSelected]       = useState(null);

  if (!result?.voucherAnalysis) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>No voucher data available</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
          Import an Excel file and run the diagnostic to see voucher-level analysis.
        </p>
      </div>
    );
  }

  const { voucherAnalysis } = result;
  const sheets = Object.keys(voucherAnalysis);

  const allVouchers = useMemo(() => {
    const list = [];
    Object.entries(voucherAnalysis).forEach(([sheetName, data]) => {
      data.vouchers.forEach(v => list.push({ ...v, sheetName }));
    });
    return list;
  }, [voucherAnalysis]);

  const filtered = useMemo(() => allVouchers.filter(v => {
    if (filterSheet    !== 'all' && v.sheetName !== filterSheet) return false;
    if (filterSeverity !== 'all') {
      if (filterSeverity === 'clean'  && v.status  !== 'clean')         return false;
      if (filterSeverity === 'issues' && v.status  === 'clean')         return false;
      if (filterSeverity === 'critical' && v.severity !== 'critical')   return false;
    }
    if (search && !v.voucherId.toLowerCase().includes(search.toLowerCase()) &&
        !v.entries.some(e => e.account.includes(search) || e.description.toLowerCase().includes(search.toLowerCase())))
      return false;
    return true;
  }), [allVouchers, filterSheet, filterSeverity, search]);

  const selectedVoucher = selected ? allVouchers.find(v => v.voucherId === selected) : null;

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>

      {/* ── Left: voucher list ── */}
      <div style={S.listPane}>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>Voucher Drill-down</h1>

          <input
            style={S.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search voucher ID, account, description…"
          />

          <div style={S.filterRow}>
            <select style={S.select} value={filterSheet} onChange={e => setFilterSheet(e.target.value)}>
              <option value="all">All sheets</option>
              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={S.select} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="all">All</option>
              <option value="critical">Critical only</option>
              <option value="issues">Has issues</option>
              <option value="clean">Clean only</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
            {filtered.length} of {allVouchers.length} vouchers
          </div>
        </div>

        <div style={S.listScroll}>
          {filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#475569', fontSize: 13 }}>No vouchers match filter</div>
          )}
          {filtered.map(v => (
            <VoucherRow
              key={`${v.sheetName}-${v.voucherId}`}
              voucher={v}
              isSelected={selected === v.voucherId}
              onClick={() => setSelected(v.voucherId === selected ? null : v.voucherId)}
            />
          ))}
        </div>
      </div>

      {/* ── Right: detail pane ── */}
      <div style={S.detailPane}>
        {selectedVoucher ? (
          <VoucherDetail voucher={selectedVoucher} />
        ) : (
          <div style={S.center}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>👆</div>
            <div style={{ fontSize: 14, color: '#475569' }}>Select a voucher to see details</div>
          </div>
        )}
      </div>
    </div>
  );
}

function VoucherRow({ voucher, isSelected, onClick }) {
  const color = SEV_COLOR[voucher.severity] || '#475569';
  return (
    <div
      style={{
        ...S.vRow,
        background: isSelected ? '#1e293b' : 'transparent',
        borderLeft: `3px solid ${isSelected ? color : 'transparent'}`,
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 600, fontSize: 12, color: '#e2e8f0' }}>
          {voucher.voucherId}
        </span>
        <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>
          {voucher.severity === 'clean' ? '✓ clean' : voucher.severity}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
        {voucher.date || '–'} · {voucher.entries.length} lines ·
        {voucher.isBalanced ? ' ✓' : ` ⚠ ${voucher.imbalance?.toFixed(2)}`}
        {voucher.issues.length > 0 && ` · ${voucher.issues.length} issue(s)`}
      </div>
    </div>
  );
}

function VoucherDetail({ voucher }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
          {voucher.voucherId}
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Date: {voucher.date || '–'}  ·  Type: {voucher.detectedType || 'unknown'}  ·
          Balance: <span style={{ color: voucher.isBalanced ? '#22c55e' : '#ef4444' }}>
            {voucher.isBalanced ? 'OK' : `IMBALANCED (${voucher.imbalance?.toFixed(2)})`}
          </span>
        </div>
      </div>

      {/* Journal lines */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-title">Journal Lines</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th><th>Description</th>
              <th className="amount">Debit</th><th className="amount">Credit</th>
            </tr>
          </thead>
          <tbody>
            {voucher.entries.map((e, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{e.account}</td>
                <td>{e.description}</td>
                <td className="amount" style={{ color: e.debit > 0 ? '#93c5fd' : '#475569' }}>
                  {e.debit > 0 ? e.debit.toLocaleString('en', { minimumFractionDigits: 2 }) : '–'}
                </td>
                <td className="amount" style={{ color: e.credit > 0 ? '#86efac' : '#475569' }}>
                  {e.credit > 0 ? e.credit.toLocaleString('en', { minimumFractionDigits: 2 }) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #334155' }}>
              <td colSpan={2} style={{ padding: '6px 12px', fontWeight: 700, color: '#94a3b8', fontSize: 12 }}>TOTAL</td>
              <td className="amount" style={{ fontWeight: 700, color: '#93c5fd' }}>
                {voucher.totalDebit.toLocaleString('en', { minimumFractionDigits: 2 })}
              </td>
              <td className="amount" style={{ fontWeight: 700, color: '#86efac' }}>
                {voucher.totalCredit.toLocaleString('en', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Issues */}
      {voucher.issues.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="section-title">Issues Found ({voucher.issues.length})</div>
          {voucher.issues.map((issue, i) => (
            <div key={i} style={{
              border: `1px solid ${SEV_COLOR[issue.severity] || '#334155'}`,
              borderRadius: 8, padding: '10px 12px', marginBottom: 8,
              background: issue.severity === 'critical' ? '#1c0a0a' : issue.severity === 'high' ? '#1c0e07' : '#1a1509',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: (SEV_COLOR[issue.severity] || '#475569') + '33', color: SEV_COLOR[issue.severity] || '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                  {issue.severity}
                </span>
                <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>{issue.title}</span>
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>{issue.code}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{issue.detail}</div>
              {issue.fix && <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>▸ {issue.fix}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {voucher.suggestions?.length > 0 && (
        <div>
          <div className="section-title">D365 Fix Suggestions</div>
          {voucher.suggestions.map((s, i) => (
            <div key={i} style={S.suggRow}>
              <div style={{ fontWeight: 600, color: '#3b82f6', fontSize: 13 }}>{s.action}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>📍 {s.path}</div>
              {s.detail && <div style={{ fontSize: 11, color: '#475569' }}>{s.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {voucher.issues.length === 0 && (
        <div style={{ padding: 16, textAlign: 'center', color: '#22c55e', fontSize: 14 }}>
          ✓ This voucher has no issues
        </div>
      )}
    </div>
  );
}

const S = {
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  listPane: { width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' },
  detailPane: { flex: 1, background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: 20, overflowY: 'auto', height: 'calc(100vh - 140px)' },
  search: {
    width: '100%', padding: '8px 12px', background: '#1a1f2e',
    border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0',
    fontSize: 12, outline: 'none', marginBottom: 8,
  },
  filterRow: { display: 'flex', gap: 8 },
  select: {
    flex: 1, padding: '6px 8px', background: '#1a1f2e', border: '1px solid #334155',
    color: '#94a3b8', borderRadius: 6, fontSize: 12, outline: 'none',
  },
  listScroll: { flex: 1, overflowY: 'auto' },
  vRow: {
    padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #1e293b',
    transition: 'background .1s', borderLeft: '3px solid transparent',
  },
  suggRow: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
    padding: '10px 12px', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3,
  },
};
