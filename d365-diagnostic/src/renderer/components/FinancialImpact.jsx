import React, { useState } from 'react';

const TYPE_COLOR = {
  'Financial Misstatement': '#ef4444',
  'Classification Issue':   '#f97316',
  'FX Difference':          '#8b5cf6',
  'Missing Mapping':        '#f59e0b',
};
const TYPE_BG = {
  'Financial Misstatement': '#450a0a',
  'Classification Issue':   '#431407',
  'FX Difference':          '#2e1065',
  'Missing Mapping':        '#422006',
};
const SEV_COLOR = { High: '#ef4444', Medium: '#f97316', Low: '#64748b' };

const ALL_TYPES = ['Financial Misstatement', 'Classification Issue', 'FX Difference', 'Missing Mapping'];

const fmt = (n, currency) => {
  const abs = Math.abs(n || 0);
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${str} ${currency}` : str;
};

export default function FinancialImpact({ result, setActiveTab }) {
  const fi = result?.financialImpact;

  if (!result) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>💰</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>No diagnostic run yet</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Run a diagnostic first to see financial impact analysis.</p>
      </div>
    );
  }

  if (!fi) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔎</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>No financial impact detected</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6, textAlign: 'center', maxWidth: 400 }}>
          Financial impact analysis requires dual-GAAP data (US + FR account columns). Import an Excel file with both <strong style={{ color: '#3b82f6' }}>US_Account</strong> and <strong style={{ color: '#3b82f6' }}>FR_Account</strong> columns, then re-run the diagnostic.
        </p>
      </div>
    );
  }

  const { impacts, aggregates, summary } = fi;
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [sevFilter,    setSevFilter]    = useState('all');

  const modules = [...new Set(impacts.map(i => i.module).filter(Boolean))];

  const filtered = impacts.filter(i =>
    (typeFilter   === 'all' || i.impactType === typeFilter) &&
    (moduleFilter === 'all' || i.module     === moduleFilter) &&
    (sevFilter    === 'all' || i.severity   === sevFilter)
  );

  const overallColor = summary.overallSeverity === 'High'   ? '#ef4444' :
                       summary.overallSeverity === 'Medium' ? '#f97316' : '#64748b';

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Financial Impact Analysis</h1>
        <p style={{ fontSize: 12, color: '#475569' }}>
          {impacts.length} impact item{impacts.length !== 1 ? 's' : ''} detected &nbsp;·&nbsp;
          Overall Severity: <span style={{ color: overallColor, fontWeight: 700 }}>{summary.overallSeverity}</span>
          &nbsp;·&nbsp; Grand Total Exposure: <span style={{ color: '#f97316', fontWeight: 700 }}>€{fmt(summary.grandTotal)}</span>
        </p>
      </div>

      {/* ── 4 summary cards ── */}
      <div style={S.cardRow}>
        <ImpactCard
          label="Financial Misstatements"
          amount={summary.totalFinancialMisstatement}
          count={impacts.filter(i => i.impactType === 'Financial Misstatement').length}
          color={TYPE_COLOR['Financial Misstatement']}
          bg={TYPE_BG['Financial Misstatement']}
          note="Cross-type P&L↔BS errors"
        />
        <ImpactCard
          label="Classification Issues"
          amount={summary.totalClassificationIssues}
          count={impacts.filter(i => i.impactType === 'Classification Issue').length}
          color={TYPE_COLOR['Classification Issue']}
          bg={TYPE_BG['Classification Issue']}
          note="Same-type wrong account"
        />
        <ImpactCard
          label="FX Differences"
          amount={summary.totalFxDifference}
          count={impacts.filter(i => i.impactType === 'FX Difference').length}
          color={TYPE_COLOR['FX Difference']}
          bg={TYPE_BG['FX Difference']}
          note="Currency translation exposure"
        />
        <ImpactCard
          label="Missing Mappings"
          amount={summary.totalMissingMapping}
          count={impacts.filter(i => i.impactType === 'Missing Mapping').length}
          color={TYPE_COLOR['Missing Mapping']}
          bg={TYPE_BG['Missing Mapping']}
          note="Untraced cross-GAAP amounts"
        />
      </div>

      {/* ── Two-column: breakdown + severity ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>

        {/* P&L / BS / FX breakdown */}
        <div style={{ ...S.card, flex: 1 }}>
          <div className="section-title">Statement Impact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StatementRow
              label="P&L Exposure"
              amount={summary.netPlImpact}
              color="#ef4444"
              pct={summary.grandTotal > 0 ? Math.round((summary.netPlImpact / (summary.netPlImpact + summary.netBsImpact + summary.netFxImpact || 1)) * 100) : 0}
              tooltip="Sum of amounts on entries that are misclassified between P&L and Balance Sheet"
            />
            <StatementRow
              label="BS Exposure"
              amount={summary.netBsImpact}
              color="#f97316"
              pct={summary.grandTotal > 0 ? Math.round((summary.netBsImpact / (summary.netPlImpact + summary.netBsImpact + summary.netFxImpact || 1)) * 100) : 0}
              tooltip="Balance Sheet entries affected by cross-type mapping errors"
            />
            <StatementRow
              label="FX Exposure"
              amount={summary.netFxImpact}
              color="#8b5cf6"
              pct={summary.grandTotal > 0 ? Math.round((summary.netFxImpact / (summary.netPlImpact + summary.netBsImpact + summary.netFxImpact || 1)) * 100) : 0}
              tooltip="Translation difference between transaction currency and EUR"
            />
          </div>
        </div>

        {/* Severity + counts */}
        <div style={{ ...S.card, flex: 1 }}>
          <div className="section-title">Severity Breakdown</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'High',   count: summary.highCount,   color: '#ef4444' },
              { label: 'Medium', count: summary.mediumCount, color: '#f97316' },
              { label: 'Low',    count: summary.lowCount,    color: '#64748b' },
            ].map(({ label, count, color }) => (
              <div key={label} style={S.sevBlock}>
                <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5, marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_TYPES.map(type => {
              const cnt = impacts.filter(i => i.impactType === type).length;
              if (cnt === 0) return null;
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 999,
                    background: TYPE_BG[type], color: TYPE_COLOR[type], fontWeight: 700, minWidth: 24, textAlign: 'center',
                  }}>{cnt}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{type}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>€{fmt(aggregates.byImpactType[type] || 0)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top accounts */}
        <div style={{ ...S.card, flex: 1 }}>
          <div className="section-title">Top Impacted Accounts</div>
          {aggregates.topAccounts.length === 0
            ? <span style={{ fontSize: 12, color: '#475569' }}>No data</span>
            : aggregates.topAccounts.map(({ account, total, count, impactTypes }) => {
              const maxAmt = aggregates.topAccounts[0]?.total || 1;
              const barPct = Math.round((total / maxAmt) * 100);
              return (
                <div key={account} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{account}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>€{fmt(total)} ({count})</span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: '#3b82f6', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                    {impactTypes.join(' · ')}
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* ── Module breakdown ── */}
      {Object.keys(aggregates.byModule).length > 0 && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div className="section-title">Impact by Module</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(aggregates.byModule)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([mod, data]) => (
                <div key={mod} style={S.modBlock}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{mod}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#f97316' }}>€{fmt(data.total)}</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>{data.count} item{data.count !== 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 10, color: '#334155', marginTop: 4 }}>
                    {Object.entries(data.byType).map(([t, a]) => (
                      <div key={t} style={{ color: TYPE_COLOR[t] }}>{t.split(' ')[0]}: €{fmt(a)}</div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Full impact table ── */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Impact Register</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Type filter */}
            {['all', ...ALL_TYPES].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${t === 'all' ? '#334155' : TYPE_COLOR[t] + '66'}`,
                  background: typeFilter === t ? (t === 'all' ? '#1e293b' : TYPE_BG[t]) : 'transparent',
                  color: typeFilter === t ? (t === 'all' ? '#e2e8f0' : TYPE_COLOR[t]) : '#64748b',
                }}
              >
                {t === 'all' ? 'All Types' : t}
              </button>
            ))}
            {/* Severity filter */}
            {['all', 'High', 'Medium', 'Low'].map(s => (
              <button
                key={s}
                onClick={() => setSevFilter(s)}
                style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${s === 'all' ? '#334155' : SEV_COLOR[s] + '66'}`,
                  background: sevFilter === s ? (s === 'all' ? '#1e293b' : SEV_COLOR[s] + '33') : 'transparent',
                  color: sevFilter === s ? (s === 'all' ? '#e2e8f0' : SEV_COLOR[s]) : '#64748b',
                }}
              >
                {s === 'all' ? 'All Sev.' : s}
              </button>
            ))}
            {/* Module filter */}
            {modules.length > 1 && (
              <select
                value={moduleFilter}
                onChange={e => setModuleFilter(e.target.value)}
                style={{
                  background: '#1a1f2e', border: '1px solid #334155', borderRadius: 6,
                  color: '#94a3b8', fontSize: 11, padding: '3px 8px', cursor: 'pointer',
                }}
              >
                <option value="all">All Modules</option>
                {modules.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
          Showing {filtered.length} of {impacts.length} items
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Voucher', 'Date', 'Module', 'US Acct', 'Description', 'Amount', 'Ccy', 'Impact Type', 'Sev.', 'P&L', 'BS', 'FX', 'Issue'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={13} style={{ ...S.td, textAlign: 'center', color: '#475569', padding: '20px' }}>No items match the current filters.</td></tr>
              ) : (
                filtered
                  .sort((a, b) => {
                    const sevOrder = { High: 0, Medium: 1, Low: 2 };
                    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
                    return (b.impactAmount || 0) - (a.impactAmount || 0);
                  })
                  .map((impact, i) => (
                    <ImpactRow key={i} impact={impact} />
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ImpactRow({ impact }) {
  const [expanded, setExpanded] = useState(false);
  const typeColor = TYPE_COLOR[impact.impactType] || '#64748b';
  const typeBg    = TYPE_BG[impact.impactType]    || '#1a1f2e';
  const sevColor  = SEV_COLOR[impact.severity]    || '#64748b';

  return (
    <>
      <tr
        style={{ cursor: 'pointer', borderBottom: '1px solid #1e293b' }}
        onClick={() => setExpanded(!expanded)}
      >
        <td style={{ ...S.td, color: '#60a5fa', fontWeight: 600 }}>{impact.voucherId}</td>
        <td style={S.td}>{impact.date}</td>
        <td style={S.td}>{impact.module}</td>
        <td style={{ ...S.td, color: '#60a5fa', fontWeight: 600 }}>{impact.usAccount}</td>
        <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{impact.description}</td>
        <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{fmt(impact.amount)}</td>
        <td style={{ ...S.td, color: impact.currency !== 'EUR' ? '#f59e0b' : '#64748b' }}>{impact.currency}</td>
        <td style={{ ...S.td, padding: '6px 8px' }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
            background: typeBg, color: typeColor, fontWeight: 700,
          }}>{impact.impactType}</span>
        </td>
        <td style={{ ...S.td, padding: '6px 8px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: sevColor }}>{impact.severity}</span>
        </td>
        <td style={{ ...S.td, textAlign: 'right', color: impact.plImpact > 0 ? '#ef4444' : '#64748b' }}>
          {impact.plImpact > 0 ? fmt(impact.plImpact) : '–'}
        </td>
        <td style={{ ...S.td, textAlign: 'right', color: impact.bsImpact > 0 ? '#f97316' : '#64748b' }}>
          {impact.bsImpact > 0 ? fmt(impact.bsImpact) : '–'}
        </td>
        <td style={{ ...S.td, textAlign: 'right', color: impact.fxImpact > 0 ? '#8b5cf6' : '#64748b' }}>
          {impact.fxImpact > 0 ? fmt(impact.fxImpact) : '–'}
        </td>
        <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 11 }}>
          {impact.issueDescription}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: '#0f1117' }}>
          <td colSpan={13} style={{ padding: '10px 16px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
              <Detail label="US Account"         value={impact.usAccount} />
              <Detail label="FR Account (actual)" value={impact.frAccount} color="#f97316" />
              {impact.expectedFrAccount && impact.expectedFrAccount !== '–' && (
                <Detail label="FR Account (expected)" value={impact.expectedFrAccount} color="#22c55e" />
              )}
              <Detail label="US Classification"  value={impact.usClassification} />
              <Detail label="FR Classification"  value={impact.frClassification} />
              {impact.currency !== 'EUR' && (
                <Detail label="Exchange Rate" value={`${impact.exchangeRate} (${impact.currency}→EUR)`} />
              )}
              {impact.project && <Detail label="Project" value={impact.project} />}
              {impact.category && <Detail label="Category" value={impact.category} />}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
              <span style={{ fontWeight: 700, color: '#64748b' }}>Issue: </span>{impact.issueDescription}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ fontWeight: 600, color: color || '#e2e8f0' }}>{value || '–'}</div>
    </div>
  );
}

function ImpactCard({ label, amount, count, color, bg, note }) {
  return (
    <div style={{ ...S.impactCard, border: `1px solid ${color}33`, background: '#1a1f2e' }}>
      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>€{fmt(amount)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: bg, color, fontWeight: 700 }}>
          {count} item{count !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 10, color: '#334155' }}>{note}</span>
      </div>
    </div>
  );
}

function StatementRow({ label, amount, color, pct }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>€{fmt(amount)}</span>
      </div>
      <div style={{ height: 5, background: '#1e293b', borderRadius: 3 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

const S = {
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', color: '#64748b', textAlign: 'center',
  },
  cardRow:    { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  impactCard: { flex: 1, minWidth: 180, borderRadius: 10, padding: '14px 16px' },
  card: {
    background: '#1a1f2e', border: '1px solid #1e293b',
    borderRadius: 10, padding: '18px', marginBottom: 0,
  },
  sevBlock: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0' },
  modBlock: {
    background: '#0f1117', border: '1px solid #1e293b', borderRadius: 8,
    padding: '12px 16px', minWidth: 160,
  },
  table:   { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px', background: '#0f1117', color: '#64748b',
    fontWeight: 600, textTransform: 'uppercase', fontSize: 10,
    letterSpacing: .5, textAlign: 'left', borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  td: { padding: '8px 10px', color: '#94a3b8', verticalAlign: 'middle' },
};
