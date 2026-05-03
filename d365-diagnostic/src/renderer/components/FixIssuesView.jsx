import React, { useState, useEffect } from 'react';

const SEV_COLOR  = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#64748b' };
const TYPE_COLOR = { GL_ONLY: '#3b82f6', PROJECT_SUBLEDGER: '#a78bfa', HYBRID: '#f59e0b', CONFIG_ONLY: '#22c55e' };
const TYPE_LABEL = { GL_ONLY: 'GL Journal', PROJECT_SUBLEDGER: 'Subledger', HYBRID: 'Hybrid', CONFIG_ONLY: 'Config Fix' };

export default function FixIssuesView({ result, context }) {
  const [fixes,       setFixes]       = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [appliedSet,  setAppliedSet]  = useState(new Set());
  const [copyToast,   setCopyToast]   = useState(null);

  useEffect(() => {
    if (!result) return;
    setLoading(true);
    setError(null);
    window.electronAPI?.suggestFixes(result, context)
      .then(resp => {
        if (resp?.success) setFixes(resp.data);
        else setError(resp?.error || 'Failed to generate fix suggestions.');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [result, context]);

  if (!result) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔧</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>No diagnostic result loaded</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Run an analysis first, then return here to view and apply fixes.</div>
      </div>
    );
  }

  if (loading) return <div style={S.empty}><div style={{ color: '#475569' }}>Generating fix suggestions…</div></div>;
  if (error)   return <div style={S.empty}><div style={{ color: '#ef4444' }}>⚠ {error}</div></div>;
  if (!fixes)  return null;

  const { fixes: allFixes, groups, summary } = fixes;
  if (allFixes.length === 0) {
    return (
      <div style={S.empty}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e' }}>No issues to fix</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>The diagnostic found no issues requiring corrective action.</div>
      </div>
    );
  }

  const selected = allFixes[selectedIdx];

  const markApplied = (idx) => setAppliedSet(p => new Set([...p, idx]));

  const markAllSimilar = () => {
    if (!selected) return;
    allFixes.forEach((f, i) => { if (f.issueType === selected.issueType) markApplied(i); });
  };

  const copyJournal = (journal) => {
    if (!journal?.lines) return;
    const text = journal.lines.map(l => `${l.side}  ${l.account}  ${l.currency} ${l.amount.toFixed(2)}  — ${l.description}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopyToast('Copied to clipboard');
      setTimeout(() => setCopyToast(null), 2000);
    });
  };

  return (
    <div style={S.root}>
      {copyToast && <div style={S.toast}>{copyToast}</div>}

      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>Fix Issues</h1>
          <p style={S.sub}>Review corrective actions for each detected issue. Apply fixes individually or batch all similar.</p>
        </div>
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          {[
            { label: 'GL Journals',  n: summary.glOnly,     color: TYPE_COLOR.GL_ONLY },
            { label: 'Subledger',    n: summary.subledger + summary.hybrid,  color: TYPE_COLOR.PROJECT_SUBLEDGER },
            { label: 'Config Fixes', n: summary.configOnly, color: TYPE_COLOR.CONFIG_ONLY },
            { label: 'High Conf',    n: summary.highConf,   color: '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.n}</div>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.split}>
        {/* Left: issue list */}
        <div style={S.list}>
          <div style={S.listHeader}>
            {allFixes.length} Issues
          </div>
          {allFixes.map((fix, i) => {
            const done = appliedSet.has(i);
            const active = i === selectedIdx;
            return (
              <div
                key={i}
                onClick={() => setSelectedIdx(i)}
                style={{
                  ...S.listItem,
                  background: active ? '#1e293b' : done ? '#0a1a0a' : 'transparent',
                  borderLeft: `3px solid ${active ? SEV_COLOR[fix.severity] || '#64748b' : 'transparent'}`,
                  opacity: done ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ ...S.dot, background: SEV_COLOR[fix.severity] || '#64748b' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fix.issueType.replace(/_/g, ' ')}
                  </span>
                  {done && <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 700 }}>DONE</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ ...S.badge, background: TYPE_COLOR[fix.correctionType] + '22', color: TYPE_COLOR[fix.correctionType] }}>
                    {TYPE_LABEL[fix.correctionType]}
                  </span>
                  <span style={{ fontSize: 9, color: '#334155' }}>
                    {Math.round(fix.confidence * 100)}% conf
                  </span>
                </div>
                {fix.voucherId && <div style={{ fontSize: 10, color: '#475569', marginTop: 3, fontFamily: 'monospace' }}>{fix.voucherId}</div>}
              </div>
            );
          })}
        </div>

        {/* Right: fix detail */}
        {selected && (
          <div style={S.detail}>
            {/* Fix header */}
            <div style={S.detailHeader}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
                  {selected.issueType.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ ...S.badge, background: SEV_COLOR[selected.severity] + '22', color: SEV_COLOR[selected.severity] }}>
                    {selected.severity?.toUpperCase()}
                  </span>
                  <span style={{ ...S.badge, background: TYPE_COLOR[selected.correctionType] + '22', color: TYPE_COLOR[selected.correctionType] }}>
                    {TYPE_LABEL[selected.correctionType]}
                  </span>
                  <span style={{ ...S.badge, background: '#1e293b', color: '#64748b' }}>
                    {Math.round(selected.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.applyBtn} onClick={() => markApplied(selectedIdx)}>
                  Mark Resolved
                </button>
                <button style={{ ...S.applyBtn, background: '#1e3a5f' }} onClick={markAllSimilar}>
                  All Similar ({allFixes.filter(f => f.issueType === selected.issueType).length})
                </button>
              </div>
            </div>

            {/* Business Impact */}
            {selected.businessImpact && (
              <Section title="Business Impact" icon="⚡">
                <p style={S.para}>{selected.businessImpact.description}</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                  {selected.businessImpact.wipImpact && (
                    <ImpactPill label="WIP" text={selected.businessImpact.wipImpact} color="#a78bfa" />
                  )}
                  {selected.businessImpact.revenueImpact && (
                    <ImpactPill label="Revenue" text={selected.businessImpact.revenueImpact} color="#34d399" />
                  )}
                  {selected.businessImpact.profitImpact && (
                    <ImpactPill label="Profitability" text={selected.businessImpact.profitImpact} color="#f59e0b" />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Priority: <span style={{ color: selected.businessImpact.priority === 'Immediate' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>{selected.businessImpact.priority}</span>
                  </div>
                  {selected.businessImpact.requiresPeriodClose && (
                    <div style={{ fontSize: 11, color: '#f59e0b' }}>Requires period-close attention</div>
                  )}
                </div>
              </Section>
            )}

            {/* GL Journal */}
            {selected.glJournal && (
              <Section title="Corrective GL Journal" icon="📒" action={<button style={S.copyBtn} onClick={() => copyJournal(selected.glJournal)}>Copy</button>}>
                <div style={S.journalNote}>
                  Post in: <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{selected.glJournal.d365Path}</span>
                </div>
                {selected.glJournal.description && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{selected.glJournal.description}</div>
                )}
                <table style={S.journalTable}>
                  <thead>
                    <tr>
                      {['Side','Account','Amount','Currency','Description'].map(h => (
                        <th key={h} style={S.jTh}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.glJournal.lines.map((line, i) => (
                      <tr key={i}>
                        <td style={{ ...S.jTd, fontWeight: 700, color: line.side === 'DR' ? '#60a5fa' : '#34d399' }}>{line.side}</td>
                        <td style={{ ...S.jTd, fontFamily: 'monospace', color: '#e2e8f0' }}>{line.account}</td>
                        <td style={{ ...S.jTd, textAlign: 'right', fontFamily: 'monospace' }}>{line.amount.toFixed(2)}</td>
                        <td style={{ ...S.jTd, color: '#64748b' }}>{line.currency}</td>
                        <td style={{ ...S.jTd, color: '#94a3b8' }}>{line.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selected.glJournal.note && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#475569', fontStyle: 'italic' }}>{selected.glJournal.note}</div>
                )}
              </Section>
            )}

            {/* Subledger Action */}
            {selected.subledger && (
              <Section title="Subledger / Project Action" icon="🏗">
                <div style={S.subledger}>
                  <SubRow label="Project ID"       value={selected.subledger.projectId} />
                  <SubRow label="Transaction Type" value={selected.subledger.transactionType} />
                  <SubRow label="Category"         value={selected.subledger.category} />
                  <SubRow label="Amount"           value={`${selected.subledger.currency} ${selected.subledger.amount.toFixed(2)}`} />
                  <SubRow label="D365 Path"        value={selected.subledger.d365Path} mono />
                </div>
                {selected.subledger.description && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{selected.subledger.description}</div>
                )}
                {selected.subledger.glImpact?.note && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#0f1117', borderRadius: 8, border: '1px solid #1e293b', fontSize: 11, color: '#64748b' }}>
                    {selected.subledger.glImpact.note}
                  </div>
                )}
              </Section>
            )}

            {/* Config Action */}
            {selected.configAction && (
              <Section title="Configuration Fix Required" icon="⚙">
                <p style={S.para}>{selected.configAction.action}</p>
                <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', marginTop: 6 }}>
                  {selected.configAction.d365Path}
                </div>
                {selected.configAction.fields && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(selected.configAction.fields).map(([k, v]) => (
                      <div key={k} style={{ background: '#0f1117', border: '1px solid #1e293b', borderRadius: 6, padding: '6px 10px' }}>
                        <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Existing fix hint from diagnostic */}
            {selected.existingFix && (
              <Section title="Diagnostic Recommendation" icon="💡">
                <p style={S.para}>{selected.existingFix}</p>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children, action }) {
  return (
    <div style={{ marginBottom: 16, background: '#1a1f2e', borderRadius: 10, border: '1px solid #1e293b', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#0d1219', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .6 }}>{title}</span>
        </div>
        {action}
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  );
}

function ImpactPill({ label, text, color }) {
  return (
    <div style={{ background: color + '18', border: `1px solid ${color}44`, borderRadius: 8, padding: '6px 10px', maxWidth: 260 }}>
      <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{text}</div>
    </div>
  );
}

function SubRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid #1e293b', padding: '6px 0' }}>
      <span style={{ fontSize: 11, color: '#475569', width: 130, flexShrink: 0, textTransform: 'uppercase', letterSpacing: .4 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#e2e8f0', fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '—'}</span>
    </div>
  );
}

const S = {
  root:   { maxWidth: 1300, margin: '0 auto', padding: '32px 32px 64px' },
  empty:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 8 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 24 },
  h1:     { fontSize: 24, fontWeight: 800, color: '#e2e8f0', margin: '0 0 6px' },
  sub:    { fontSize: 13, color: '#64748b', margin: 0 },
  split:  { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' },
  list:   { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' },
  listHeader: { padding: '10px 14px', background: '#0d1219', fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .8 },
  listItem:   { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #1e293b', transition: 'all .1s' },
  dot:        { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  badge:      { fontSize: 9, padding: '2px 6px', borderRadius: 999, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4 },
  detail:     { minWidth: 0 },
  detailHeader: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  applyBtn:   { padding: '7px 14px', background: '#15803d', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  copyBtn:    { padding: '4px 10px', background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#64748b', fontSize: 10, cursor: 'pointer' },
  para:       { fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 },
  journalNote:{ fontSize: 11, color: '#475569', marginBottom: 8 },
  journalTable:{ width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  jTh:        { padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .6, borderBottom: '1px solid #1e293b', background: '#0f1117' },
  jTd:        { padding: '7px 10px', borderBottom: '1px solid #1e293b', color: '#94a3b8' },
  subledger:  { background: '#0f1117', borderRadius: 8, border: '1px solid #1e293b', overflow: 'hidden', padding: '0 12px' },
  toast:      { position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '9px 16px', background: '#15803d', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600 },
};
