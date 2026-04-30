import React, { useState, useMemo } from 'react';

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', clean: '#22c55e' };
const CONF_COLOR = { High: '#22c55e', Medium: '#f59e0b', Low: '#64748b' };
const CONF_BG    = { High: '#052e16',  Medium: '#422006', Low: '#1e293b' };

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
    Object.entries(voucherAnalysis).forEach(([sheetName, data]) =>
      data.vouchers.forEach(v => list.push({ ...v, sheetName }))
    );
    return list;
  }, [voucherAnalysis]);

  const filtered = useMemo(() => allVouchers.filter(v => {
    if (filterSheet    !== 'all' && v.sheetName !== filterSheet) return false;
    if (filterSeverity !== 'all') {
      if (filterSeverity === 'clean'    && v.status  !== 'clean')       return false;
      if (filterSeverity === 'issues'   && v.status  === 'clean')       return false;
      if (filterSeverity === 'critical' && v.severity !== 'critical')   return false;
    }
    if (search && !v.voucherId.toLowerCase().includes(search.toLowerCase()) &&
        !v.entries?.some(e => e.account.includes(search) || e.description?.toLowerCase().includes(search.toLowerCase())))
      return false;
    return true;
  }), [allVouchers, filterSheet, filterSeverity, search]);

  const selectedVoucher = selected ? allVouchers.find(v => v.voucherId === selected) : null;

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* ── Left: list ── */}
      <div style={S.listPane}>
        <div style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 10 }}>Voucher Drill-down</h1>
          <input style={S.search} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search voucher, account, description…" />
          <div style={S.filterRow}>
            <select style={S.select} value={filterSheet} onChange={e => setFilterSheet(e.target.value)}>
              <option value="all">All sheets</option>
              {sheets.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={S.select} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="all">All statuses</option>
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
            <VoucherRow key={`${v.sheetName}-${v.voucherId}`} voucher={v}
              isSelected={selected === v.voucherId}
              onClick={() => setSelected(v.voucherId === selected ? null : v.voucherId)} />
          ))}
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div style={S.detailPane}>
        {selectedVoucher
          ? <VoucherDetail voucher={selectedVoucher} />
          : <div style={S.center}><div style={{ fontSize: 32, marginBottom: 10 }}>👆</div><div style={{ fontSize: 14, color: '#475569' }}>Select a voucher to see details and source trace</div></div>
        }
      </div>
    </div>
  );
}

function VoucherRow({ voucher, isSelected, onClick }) {
  const color = SEV_COLOR[voucher.severity] || '#475569';
  return (
    <div style={{ ...S.vRow, background: isSelected ? '#1e293b' : 'transparent', borderLeft: `3px solid ${isSelected ? color : 'transparent'}` }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'Consolas, monospace', fontWeight: 600, fontSize: 12, color: '#e2e8f0' }}>{voucher.voucherId}</span>
        <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>
          {voucher.severity === 'clean' ? '✓ clean' : voucher.severity}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
        {voucher.date || '–'} · {voucher.entries?.length || 0} lines ·
        {voucher.isBalanced ? ' ✓' : ` ⚠ ${voucher.imbalance?.toFixed(2)}`}
        {voucher.issues?.length > 0 && ` · ${voucher.issues.length} issue(s)`}
      </div>
    </div>
  );
}

function VoucherDetail({ voucher }) {
  const [traceOpen, setTraceOpen] = useState({});
  const toggleTrace = (key) => setTraceOpen(p => ({ ...p, [key]: !p[key] }));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{voucher.voucherId}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Date: {voucher.date || '–'}  ·  Type: <strong style={{ color: '#94a3b8' }}>{voucher.detectedType || 'unknown'}</strong>  ·
          Balance: <span style={{ color: voucher.isBalanced ? '#22c55e' : '#ef4444' }}>
            {voucher.isBalanced ? 'OK' : `IMBALANCED (${voucher.imbalance?.toFixed(2)})`}
          </span>
        </div>
      </div>

      {/* Journal lines with source column */}
      <div style={{ marginBottom: 16 }}>
        <div className="section-title">Journal Lines  &amp;  Account Sources</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th><th>Description</th>
              <th className="amount">Debit</th><th className="amount">Credit</th>
              <th>Source</th><th>Field</th><th>Conf.</th>
            </tr>
          </thead>
          <tbody>
            {voucher.entries?.map((e, i) => {
              const srcEntry = voucher.sourceMap?.find(s => s.entryIndex === i);
              const src      = srcEntry?.source;
              return (
                <tr key={i}>
                  <td style={{ fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{e.account}</td>
                  <td>{e.description}</td>
                  <td className="amount" style={{ color: e.debit  > 0 ? '#93c5fd' : '#475569' }}>
                    {e.debit  > 0 ? e.debit.toLocaleString('en', { minimumFractionDigits: 2 }) : '–'}
                  </td>
                  <td className="amount" style={{ color: e.credit > 0 ? '#86efac' : '#475569' }}>
                    {e.credit > 0 ? e.credit.toLocaleString('en', { minimumFractionDigits: 2 }) : '–'}
                  </td>
                  <td>
                    {src ? (
                      <button style={S.srcBtn} onClick={() => toggleTrace(`entry-${i}`)}>
                        <span style={{ fontWeight: 600, fontSize: 11 }}>{src.source}</span>
                        <span style={{ color: '#64748b', marginLeft: 4 }}>{traceOpen[`entry-${i}`] ? '▲' : '▼'}</span>
                      </button>
                    ) : <span style={{ color: '#334155' }}>–</span>}
                  </td>
                  <td style={{ fontSize: 11, color: '#64748b' }}>{src?.field || '–'}</td>
                  <td>
                    {src && (
                      <span style={{ ...S.confBadge, background: CONF_BG[src.confidence], color: CONF_COLOR[src.confidence] }}>
                        {src.confidence}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Totals */}
            {(voucher.entries?.length || 0) > 0 && (
              <tr style={{ borderTop: '2px solid #334155' }}>
                <td colSpan={2} style={{ padding: '6px 12px', fontWeight: 700, color: '#94a3b8', fontSize: 12 }}>TOTAL</td>
                <td className="amount" style={{ fontWeight: 700, color: '#93c5fd' }}>{voucher.totalDebit?.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                <td className="amount" style={{ fontWeight: 700, color: '#86efac' }}>{voucher.totalCredit?.toLocaleString('en', { minimumFractionDigits: 2 })}</td>
                <td colSpan={3}></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Per-entry trace panels */}
        {voucher.entries?.map((_, i) => {
          const srcEntry = voucher.sourceMap?.find(s => s.entryIndex === i);
          if (!srcEntry?.source || !traceOpen[`entry-${i}`]) return null;
          return (
            <TracePanel key={i} source={srcEntry.source} entryLabel={`Entry ${i + 1}: ${srcEntry.account} (${srcEntry.side.toUpperCase()})`} />
          );
        })}
      </div>

      {/* Issues */}
      {voucher.issues?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="section-title">Issues Found ({voucher.issues.length})</div>
          {voucher.issues.map((issue, i) => (
            <IssueCard key={i} issue={issue} idx={i} traceOpen={traceOpen} toggleTrace={toggleTrace} />
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

      {/* Currency breakdown */}
      {voucher.currencyAnalysis?.isMultiCurrency && (
        <CurrencyBreakdown analysis={voucher.currencyAnalysis} />
      )}

      {voucher.issues?.length === 0 && (
        <div style={{ padding: 16, textAlign: 'center', color: '#22c55e', fontSize: 14 }}>✓ This voucher has no issues</div>
      )}
    </div>
  );
}

function IssueCard({ issue, idx, traceOpen, toggleTrace }) {
  const sev   = issue.severity || 'medium';
  const color = SEV_COLOR[sev] || '#475569';
  const traceKey = `issue-${idx}`;

  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: sev === 'critical' ? '#1c0a0a' : sev === 'high' ? '#1c0e07' : '#1a1509' }}>
      {/* Issue header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: color + '33', color, fontWeight: 700, textTransform: 'uppercase' }}>{sev}</span>
        <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13, flex: 1 }}>{issue.title}</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>{issue.code}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{issue.detail}</div>

      {/* Source comparison block */}
      {(issue.actualSource || issue.expectedSource) && (
        <div style={S.sourceBlock}>
          <div style={S.sourceBlockGrid}>
            {issue.actualSource && (
              <SourceChip label="Actual Source" src={issue.actualSource} accentColor="#f97316" />
            )}
            {issue.expectedSource && (
              <SourceChip label="Expected Source" src={issue.expectedSource} accentColor="#22c55e" />
            )}
          </div>

          {issue.sourceComparison && (
            <div style={S.comparisonBox}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: '#64748b' }}>
                {issue.sourceComparison.sameSource ? '● Same Source' : '⚡ Different Sources'}&nbsp;
                {issue.sourceComparison.sameField  ? '/ Same Field' : '/ Different Fields'}
              </span>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                {issue.sourceComparison.explanation}
              </div>
              <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4, fontStyle: 'italic' }}>
                ▸ {issue.sourceComparison.actionRequired}
              </div>
            </div>
          )}

          {issue.actualSource?.trace && (
            <button style={S.traceToggle} onClick={() => toggleTrace(traceKey)}>
              {traceOpen[traceKey] ? '▲ Hide' : '▼ Show'} resolution trace
            </button>
          )}
        </div>
      )}

      {/* Trace panel */}
      {traceOpen[traceKey] && issue.actualSource?.trace && (
        <TracePanel source={issue.actualSource} entryLabel={`Account ${issue._entry?.account || issue.actualAccount || '?'}`} />
      )}

      {issue.fix && !issue.sourceComparison && (
        <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 4 }}>▸ {issue.fix}</div>
      )}
    </div>
  );
}

function SourceChip({ label, src, accentColor }) {
  return (
    <div style={{ ...S.sourceChip, borderColor: accentColor + '66' }}>
      <span style={{ fontSize: 10, color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 12, color: '#e2e8f0', marginTop: 2 }}>{src.source}</span>
      <span style={{ fontSize: 11, color: '#64748b' }}>"{src.field}"</span>
      <span style={{ ...S.confBadge, background: CONF_BG[src.confidence], color: CONF_COLOR[src.confidence], marginTop: 4, alignSelf: 'flex-start' }}>
        {src.confidence}
      </span>
      <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', marginTop: 2 }}>{src.d365Path}</span>
    </div>
  );
}

function TracePanel({ source, entryLabel }) {
  const traceLines = source?.trace || [];
  return (
    <div style={S.tracePanel}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .8 }}>
        Resolution Trace — {entryLabel}
      </div>
      {traceLines.map((t, i) => (
        <div key={i} style={{ ...S.traceLine, color: t.result === 'MATCH' ? '#22c55e' : t.result === 'SKIP_CONDITIONAL' ? '#f59e0b' : '#64748b' }}>
          <span style={S.traceIcon}>
            {t.result === 'MATCH' ? '✓' : t.result === 'SKIP_CONDITIONAL' ? '⊘' : '✗'}
          </span>
          <div>
            <span style={{ fontWeight: 600, fontSize: 11 }}>{t.source}</span>
            {t.result === 'MATCH' && (
              <span style={{ color: '#86efac', marginLeft: 8, fontSize: 11 }}>→ {t.field}</span>
            )}
            <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>{t.reason}</div>
            {t.result === 'MATCH' && t.d365Path && (
              <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 1 }}>📍 {t.d365Path}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CurrencyBreakdown({ analysis }) {
  const { accountingCurrency, currencyGroups, accountingBalance, fxDifference, rateOverrides } = analysis;
  const ab = accountingBalance;

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="section-title" style={{ color: '#a78bfa' }}>Multi-Currency Analysis</div>
      <div style={{ background: '#120e1e', border: '1px solid #4c1d9533', borderRadius: 8, padding: '12px 14px' }}>

        {/* Accounting balance header */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>Accounting Currency</div>
            <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: 14 }}>{accountingCurrency}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>Acctg DR</div>
            <div style={{ fontFamily: 'monospace', color: '#93c5fd', fontSize: 13 }}>{ab.totalDrAccounting?.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>Acctg CR</div>
            <div style={{ fontFamily: 'monospace', color: '#86efac', fontSize: 13 }}>{ab.totalCrAccounting?.toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>Balance</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: ab.balanced ? '#22c55e' : '#ef4444' }}>
              {ab.balanced ? '✓ Balanced' : `⚠ Diff: ${ab.difference?.toFixed(2)} ${accountingCurrency}`}
            </div>
          </div>
        </div>

        {/* Currency groups table */}
        {currencyGroups && Object.keys(currencyGroups).length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 10 }}>
            <thead>
              <tr style={{ color: '#6b7280', borderBottom: '1px solid #1e293b' }}>
                <th style={{ textAlign: 'left',  padding: '4px 6px 4px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4 }}>Currency</th>
                <th style={{ textAlign: 'right', padding: '4px 6px 4px 0', fontWeight: 600 }}>TX Debit</th>
                <th style={{ textAlign: 'right', padding: '4px 6px 4px 0', fontWeight: 600 }}>TX Credit</th>
                <th style={{ textAlign: 'right', padding: '4px 6px 4px 0', fontWeight: 600 }}>Acctg DR</th>
                <th style={{ textAlign: 'right', padding: '4px 6px 4px 0', fontWeight: 600 }}>Acctg CR</th>
                <th style={{ textAlign: 'center', padding: '4px 0', fontWeight: 600 }}>TX Bal</th>
                <th style={{ textAlign: 'left',  padding: '4px 0 4px 6px', fontWeight: 600 }}>Rate(s)</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(currencyGroups).map(g => (
                <tr key={g.currency} style={{ borderBottom: '1px solid #1e293b22' }}>
                  <td style={{ padding: '4px 6px 4px 0', fontWeight: 700, color: g.currency === accountingCurrency ? '#64748b' : '#f59e0b', fontFamily: 'monospace' }}>{g.currency}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px 4px 0', color: '#93c5fd', fontFamily: 'monospace' }}>{g.txDebit?.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px 4px 0', color: '#86efac', fontFamily: 'monospace' }}>{g.txCredit?.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px 4px 0', color: '#93c5fd', fontFamily: 'monospace' }}>{g.acctDebit?.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px 4px 0', color: '#86efac', fontFamily: 'monospace' }}>{g.acctCredit?.toFixed(2)}</td>
                  <td style={{ textAlign: 'center', padding: '4px 0', color: g.txBalanced ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                    {g.txBalanced ? '✓' : `Δ${Math.abs(g.txDifference).toFixed(2)}`}
                  </td>
                  <td style={{ textAlign: 'left', padding: '4px 0 4px 6px', color: '#64748b', fontFamily: 'monospace' }}>
                    {g.ratesUsed?.join(' / ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* FX difference */}
        {fxDifference?.detected && (
          <div style={{ background: '#1c0a07', border: '1px solid #7c2d1233', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: fxDifference.severity === 'high' ? '#ef4444' : '#f59e0b', marginBottom: 4 }}>
              {fxDifference.type} — {fxDifference.amount?.toFixed(2)} {accountingCurrency} ({fxDifference.direction})
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{fxDifference.rootCause}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>▸ {fxDifference.fix}</div>
          </div>
        )}

        {/* Rate overrides */}
        {rateOverrides?.map((ro, i) => (
          <div key={i} style={{ background: '#1c1207', border: '1px solid #78350f33', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 2 }}>
              RATE_OVERRIDE — {ro.currency}: {ro.rates?.join(' vs ')}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{ro.issue}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>▸ {ro.fix}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  listPane: { width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' },
  detailPane: { flex: 1, background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: 20, overflowY: 'auto', height: 'calc(100vh - 140px)' },
  search: { width: '100%', padding: '8px 12px', background: '#1a1f2e', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none', marginBottom: 8 },
  filterRow: { display: 'flex', gap: 8 },
  select: { flex: 1, padding: '6px 8px', background: '#1a1f2e', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, fontSize: 12, outline: 'none' },
  listScroll: { flex: 1, overflowY: 'auto' },
  vRow: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #1e293b', transition: 'background .1s', borderLeft: '3px solid transparent' },

  sourceBlock: { background: '#0f1117', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px', marginTop: 8 },
  sourceBlockGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 },
  sourceChip: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', border: '1px solid', borderRadius: 6, background: '#0d1219' },
  comparisonBox: { borderTop: '1px solid #1e293b', paddingTop: 8, marginTop: 4 },
  traceToggle: { marginTop: 8, background: 'none', border: '1px dashed #334155', borderRadius: 4, color: '#475569', fontSize: 11, cursor: 'pointer', padding: '3px 10px' },

  tracePanel: { background: '#080c12', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px', marginTop: 8 },
  traceLine: { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 },
  traceIcon: { fontSize: 12, fontWeight: 700, width: 14, flexShrink: 0, marginTop: 1 },

  confBadge: { fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 700 },
  srcBtn: { background: 'none', border: '1px solid #1e293b', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', color: '#94a3b8', fontSize: 11, display: 'flex', alignItems: 'center' },
  suggRow: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 3 },
};
