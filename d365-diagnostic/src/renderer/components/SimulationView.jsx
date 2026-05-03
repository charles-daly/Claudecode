'use strict';

import React, { useState, useCallback } from 'react';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#0f1117', color: '#e2e8f0', fontFamily: 'monospace',
  },
  header: {
    padding: '16px 24px', borderBottom: '1px solid #1e2535',
    background: '#141824',
  },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#7dd3fc' },
  headerSub: { margin: '4px 0 0', fontSize: 12, color: '#64748b' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },

  // Left panel — modification editor
  leftPanel: {
    width: 340, borderRight: '1px solid #1e2535', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  section: { borderBottom: '1px solid #1e2535' },
  sectionHeader: {
    padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#141824',
  },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  sectionBody: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },

  inputRow: { display: 'flex', gap: 6, alignItems: 'center' },
  input: {
    flex: 1, background: '#1e2535', border: '1px solid #2d3748', borderRadius: 4,
    color: '#e2e8f0', padding: '6px 8px', fontSize: 12, fontFamily: 'monospace',
    outline: 'none',
  },
  inputSmall: {
    width: 70, background: '#1e2535', border: '1px solid #2d3748', borderRadius: 4,
    color: '#e2e8f0', padding: '6px 8px', fontSize: 12, fontFamily: 'monospace',
    outline: 'none',
  },
  arrow: { color: '#60a5fa', fontSize: 14, flexShrink: 0 },
  addBtn: {
    padding: '5px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
    background: '#1e3a5f', color: '#7dd3fc', fontFamily: 'monospace',
  },
  removeBtn: {
    padding: '3px 6px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
    background: '#3b1a1a', color: '#f87171', fontFamily: 'monospace', flexShrink: 0,
  },
  chip: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#1e2535', borderRadius: 4, padding: '4px 8px', fontSize: 11,
  },
  chipLabel: { color: '#94a3b8', flex: 1 },
  chipValue: { color: '#7dd3fc' },

  runBtn: {
    margin: 16, padding: '10px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: '#1e3a5f', color: '#7dd3fc', fontSize: 13, fontWeight: 700,
    fontFamily: 'monospace', transition: 'background 0.15s',
  },
  runBtnActive: { background: '#2563eb' },

  clearBtn: {
    margin: '0 16px 16px', padding: '6px 12px', borderRadius: 4, border: '1px solid #2d3748',
    cursor: 'pointer', background: 'transparent', color: '#64748b', fontSize: 11,
    fontFamily: 'monospace',
  },

  // Right panel — results
  rightPanel: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },

  empty: {
    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', gap: 12, color: '#334155',
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#475569' },

  // Diff summary cards
  diffRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  diffCard: {
    flex: 1, minWidth: 140, background: '#141824', borderRadius: 8,
    border: '1px solid #1e2535', padding: '14px 18px',
  },
  diffCardGood: { borderColor: '#166534' },
  diffCardBad:  { borderColor: '#7f1d1d' },
  diffCardLabel: { fontSize: 11, color: '#64748b', marginBottom: 6 },
  diffCardValue: { fontSize: 24, fontWeight: 700 },
  diffCardValueGood: { color: '#4ade80' },
  diffCardValueBad:  { color: '#f87171' },
  diffCardValueNeutral: { color: '#94a3b8' },

  // Status change badge
  statusBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
  },

  // Issue changes table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #1e2535', color: '#64748b', fontWeight: 600 },
  td: { padding: '7px 12px', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },

  // Entry changes
  entryCard: {
    background: '#141824', border: '1px solid #1e2535', borderRadius: 6,
    padding: '10px 14px', fontSize: 11,
  },
  entryRow: { display: 'flex', gap: 10, marginTop: 6, alignItems: 'flex-start' },
  entryBefore: { flex: 1, color: '#f87171' },
  entryAfter:  { flex: 1, color: '#4ade80' },
  entryMeta: { color: '#475569', fontSize: 11, marginBottom: 4 },

  panelTitle: { fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 10 },
  panelBox: {
    background: '#141824', border: '1px solid #1e2535', borderRadius: 8, padding: 16,
  },

  statusDot: {
    width: 8, height: 8, borderRadius: '50%', display: 'inline-block', marginRight: 6,
  },
};

// ─── Status colour helper ─────────────────────────────────────────────────────

const STATUS_COLOR = { pass: '#4ade80', warning: '#facc15', fail: '#f87171', unknown: '#64748b' };

function statusStyle(s) {
  const c = STATUS_COLOR[s] || STATUS_COLOR.unknown;
  return { ...S.statusBadge, background: c + '22', color: c, border: `1px solid ${c}44` };
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function ColSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={S.section}>
      <div style={S.sectionHeader} onClick={() => setOpen(o => !o)}>
        <span style={S.sectionTitle}>{title}</span>
        <span style={{ color: '#475569', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={S.sectionBody}>{children}</div>}
    </div>
  );
}

// ─── Account substitution editor ─────────────────────────────────────────────

function AccountSubsEditor({ subs, onChange }) {
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  const add = () => {
    const f = from.trim(), t = to.trim();
    if (!f || !t || f === t) return;
    onChange({ ...subs, [f]: t });
    setFrom(''); setTo('');
  };

  const remove = (key) => {
    const next = { ...subs };
    delete next[key];
    onChange(next);
  };

  return (
    <>
      {Object.entries(subs).map(([f, t]) => (
        <div key={f} style={S.chip}>
          <span style={S.chipLabel}>{f}</span>
          <span style={S.arrow}>→</span>
          <span style={S.chipValue}>{t}</span>
          <button style={S.removeBtn} onClick={() => remove(f)}>✕</button>
        </div>
      ))}
      <div style={S.inputRow}>
        <input style={S.input} placeholder="From account" value={from} onChange={e => setFrom(e.target.value)} />
        <span style={S.arrow}>→</span>
        <input style={S.input} placeholder="To account" value={to} onChange={e => setTo(e.target.value)} />
        <button style={S.addBtn} onClick={add}>Add</button>
      </div>
    </>
  );
}

// ─── Mapping override editor ──────────────────────────────────────────────────

function MappingOverrideEditor({ overrides, onChange }) {
  const [usAcc, setUsAcc] = useState('');
  const [frAcc, setFrAcc] = useState('');
  const [beAcc, setBeAcc] = useState('');

  const add = () => {
    const us = usAcc.trim();
    if (!us) return;
    const ov = {};
    if (frAcc.trim()) ov.frAccount = frAcc.trim();
    if (beAcc.trim()) ov.beAccount = beAcc.trim();
    if (Object.keys(ov).length === 0) return;
    onChange({ ...overrides, [us]: ov });
    setUsAcc(''); setFrAcc(''); setBeAcc('');
  };

  const remove = (key) => {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  };

  return (
    <>
      {Object.entries(overrides).map(([us, ov]) => (
        <div key={us} style={S.chip}>
          <span style={{ color: '#7dd3fc', fontWeight: 700 }}>{us}</span>
          <span style={{ color: '#64748b', margin: '0 4px' }}>→</span>
          {ov.frAccount && <span style={{ color: '#c084fc' }}>FR:{ov.frAccount}</span>}
          {ov.frAccount && ov.beAccount && <span style={{ color: '#475569', margin: '0 3px' }}>/</span>}
          {ov.beAccount && <span style={{ color: '#fb923c' }}>BE:{ov.beAccount}</span>}
          <button style={S.removeBtn} onClick={() => remove(us)}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input style={S.input} placeholder="US account" value={usAcc} onChange={e => setUsAcc(e.target.value)} />
        <div style={S.inputRow}>
          <input style={S.input} placeholder="FR account (optional)" value={frAcc} onChange={e => setFrAcc(e.target.value)} />
          <input style={S.input} placeholder="BE account (optional)" value={beAcc} onChange={e => setBeAcc(e.target.value)} />
        </div>
        <button style={{ ...S.addBtn, alignSelf: 'flex-start' }} onClick={add}>Add Override</button>
      </div>
    </>
  );
}

// ─── Rate override editor ─────────────────────────────────────────────────────

function RateOverrideEditor({ rates, onChange }) {
  const [ccy, setCcy]   = useState('');
  const [rate, setRate] = useState('');

  const add = () => {
    const c = ccy.trim().toUpperCase(), r = parseFloat(rate);
    if (!c || isNaN(r) || r <= 0) return;
    onChange({ ...rates, [c]: r });
    setCcy(''); setRate('');
  };

  const remove = (key) => {
    const next = { ...rates };
    delete next[key];
    onChange(next);
  };

  return (
    <>
      {Object.entries(rates).map(([c, r]) => (
        <div key={c} style={S.chip}>
          <span style={{ color: '#facc15', fontWeight: 700, minWidth: 40 }}>{c}</span>
          <span style={S.arrow}>=</span>
          <span style={S.chipValue}>{r}</span>
          <button style={S.removeBtn} onClick={() => remove(c)}>✕</button>
        </div>
      ))}
      <div style={S.inputRow}>
        <input style={S.input} placeholder="CCY (e.g. USD)" value={ccy} onChange={e => setCcy(e.target.value)} />
        <input style={S.inputSmall} placeholder="Rate" value={rate} onChange={e => setRate(e.target.value)} />
        <button style={S.addBtn} onClick={add}>Add</button>
      </div>
    </>
  );
}

// ─── Diff value display ───────────────────────────────────────────────────────

function DeltaValue({ delta, prefix = '', suffix = '', invertColour = false }) {
  const improved = invertColour ? delta > 0 : delta < 0;
  const neutral  = delta === 0;
  const style    = neutral ? S.diffCardValueNeutral : improved ? S.diffCardValueGood : S.diffCardValueBad;
  const sign     = delta > 0 ? '+' : '';
  return <span style={style}>{prefix}{sign}{delta}{suffix}</span>;
}

// ─── Issue changes table ──────────────────────────────────────────────────────

function IssueChangeTable({ changes }) {
  if (!changes || changes.length === 0) return <p style={{ color: '#475569', fontSize: 12 }}>No issue type changes detected.</p>;
  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Issue Type</th>
          <th style={{ ...S.th, textAlign: 'right' }}>Before</th>
          <th style={{ ...S.th, textAlign: 'right' }}>After</th>
          <th style={{ ...S.th, textAlign: 'right' }}>Delta</th>
        </tr>
      </thead>
      <tbody>
        {changes.map(c => (
          <tr key={c.type}>
            <td style={S.td}>{c.type}</td>
            <td style={{ ...S.td, textAlign: 'right', color: '#94a3b8' }}>{c.before}</td>
            <td style={{ ...S.td, textAlign: 'right', color: '#94a3b8' }}>{c.after}</td>
            <td style={{ ...S.td, textAlign: 'right' }}>
              <span style={{ color: c.improved ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                {c.delta > 0 ? '+' : ''}{c.delta}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Entry changes list ───────────────────────────────────────────────────────

function EntryChangeList({ changes }) {
  if (!changes || changes.length === 0) return <p style={{ color: '#475569', fontSize: 12 }}>No journal entry changes.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {changes.slice(0, 20).map((c, i) => (
        <div key={i} style={S.entryCard}>
          <div style={S.entryMeta}>
            Sheet: <strong style={{ color: '#7dd3fc' }}>{c.sheet}</strong>
            {c.voucher && <> · Voucher: <strong style={{ color: '#7dd3fc' }}>{c.voucher}</strong></>}
            · Row {c.row}
            <span style={{
              marginLeft: 8, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
              background: c.changeType === 'added' ? '#14532d' : c.changeType === 'removed' ? '#450a0a' : '#1e3a5f',
              color: c.changeType === 'added' ? '#4ade80' : c.changeType === 'removed' ? '#f87171' : '#7dd3fc',
            }}>{c.changeType}</span>
          </div>
          <div style={S.entryRow}>
            {c.before && (
              <div style={S.entryBefore}>
                <div style={{ color: '#94a3b8', marginBottom: 2 }}>Before</div>
                {c.before.account && <div>Account: {c.before.account}</div>}
                {c.before.frAccount && <div>FR: {c.before.frAccount}</div>}
                {c.before.beAccount && <div>BE: {c.before.beAccount}</div>}
                {c.before.rate !== undefined && <div>Rate: {c.before.rate}</div>}
              </div>
            )}
            {c.after && (
              <div style={S.entryAfter}>
                <div style={{ color: '#94a3b8', marginBottom: 2 }}>After</div>
                {c.after.account && <div>Account: {c.after.account}</div>}
                {c.after.frAccount && <div>FR: {c.after.frAccount}</div>}
                {c.after.beAccount && <div>BE: {c.after.beAccount}</div>}
                {c.after.rate !== undefined && <div>Rate: {c.after.rate}</div>}
              </div>
            )}
          </div>
        </div>
      ))}
      {changes.length > 20 && (
        <p style={{ color: '#475569', fontSize: 11, textAlign: 'center' }}>
          … and {changes.length - 20} more changes
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SimulationView({ parsedData, context }) {
  const [accountSubs,      setAccountSubs]      = useState({});
  const [mappingOverrides, setMappingOverrides]  = useState({});
  const [rateOverrides,    setRateOverrides]     = useState({});
  const [running,          setRunning]           = useState(false);
  const [simResult,        setSimResult]         = useState(null);
  const [error,            setError]             = useState(null);

  const modCount =
    Object.keys(accountSubs).length +
    Object.keys(mappingOverrides).length +
    Object.keys(rateOverrides).length;

  const hasData = parsedData && Object.keys(parsedData).length > 0;

  const runSim = useCallback(async () => {
    if (!hasData || running) return;
    setRunning(true);
    setError(null);
    try {
      const modifications = { accountSubs, mappingOverrides, rateOverrides };
      const result = await window.electronAPI.runSimulation(parsedData, context, modifications);
      if (!result.success) {
        setError(result.error || 'Simulation failed.');
      } else {
        setSimResult(result);
      }
    } catch (e) {
      setError(e.message || 'Unexpected error');
    } finally {
      setRunning(false);
    }
  }, [hasData, running, parsedData, context, accountSubs, mappingOverrides, rateOverrides]);

  const clear = () => {
    setAccountSubs({});
    setMappingOverrides({});
    setRateOverrides({});
    setSimResult(null);
    setError(null);
  };

  const diff = simResult?.diff;

  return (
    <div style={S.root}>
      <div style={S.header}>
        <h2 style={S.headerTitle}>What-If Simulation</h2>
        <p style={S.headerSub}>
          Apply account substitutions, mapping overrides, and FX rate changes to see how issues would change — without modifying your data.
        </p>
      </div>

      <div style={S.body}>
        {/* ── Left: modification editor ── */}
        <div style={S.leftPanel}>
          <ColSection title="Account Substitutions">
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
              Swap one GL account for another across all entries.
            </p>
            <AccountSubsEditor subs={accountSubs} onChange={setAccountSubs} />
          </ColSection>

          <ColSection title="Mapping Overrides" defaultOpen={false}>
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
              Override the FR/BE account targets for a US account.
            </p>
            <MappingOverrideEditor overrides={mappingOverrides} onChange={setMappingOverrides} />
          </ColSection>

          <ColSection title="FX Rate Overrides" defaultOpen={false}>
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
              Change exchange rates per currency (absolute rate).
            </p>
            <RateOverrideEditor rates={rateOverrides} onChange={setRateOverrides} />
          </ColSection>

          <button
            style={{ ...S.runBtn, ...(modCount > 0 && hasData ? S.runBtnActive : {}) }}
            onClick={runSim}
            disabled={!hasData || running || modCount === 0}
          >
            {running ? 'Running…' : `Run Simulation${modCount > 0 ? ` (${modCount} mod${modCount > 1 ? 's' : ''})` : ''}`}
          </button>

          {(modCount > 0 || simResult) && (
            <button style={S.clearBtn} onClick={clear}>Clear all</button>
          )}

          {!hasData && (
            <p style={{ fontSize: 11, color: '#f87171', padding: '0 16px 16px' }}>
              Upload an Excel file first to enable simulation.
            </p>
          )}
        </div>

        {/* ── Right: results ── */}
        <div style={S.rightPanel}>
          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '12px 16px', color: '#f87171', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!simResult && !error && (
            <div style={S.empty}>
              <span style={S.emptyIcon}>⚗️</span>
              <span style={S.emptyText}>Add modifications and run the simulation to see before/after results.</span>
            </div>
          )}

          {simResult && diff && (
            <>
              {/* Summary cards */}
              <div>
                <div style={S.panelTitle}>Simulation Summary</div>
                <div style={S.diffRow}>
                  <div style={{ ...S.diffCard, ...(diff.totalIssuesDelta < 0 ? S.diffCardGood : diff.totalIssuesDelta > 0 ? S.diffCardBad : {}) }}>
                    <div style={S.diffCardLabel}>Total Issues</div>
                    <DeltaValue delta={diff.totalIssuesDelta} />
                  </div>
                  <div style={{ ...S.diffCard, ...(diff.criticalDelta < 0 ? S.diffCardGood : diff.criticalDelta > 0 ? S.diffCardBad : {}) }}>
                    <div style={S.diffCardLabel}>Critical Issues</div>
                    <DeltaValue delta={diff.criticalDelta} />
                  </div>
                  <div style={S.diffCard}>
                    <div style={S.diffCardLabel}>Resolved Types</div>
                    <span style={S.diffCardValueGood}>{diff.resolved}</span>
                  </div>
                  <div style={S.diffCard}>
                    <div style={S.diffCardLabel}>New Issues</div>
                    <span style={diff.introduced > 0 ? S.diffCardValueBad : S.diffCardValueNeutral}>{diff.introduced}</span>
                  </div>
                  <div style={S.diffCard}>
                    <div style={S.diffCardLabel}>Financial Impact Δ</div>
                    <DeltaValue delta={Math.round(diff.financialImpactDelta)} invertColour />
                  </div>
                </div>
              </div>

              {/* Status change */}
              {diff.statusChange && (
                <div style={S.panelBox}>
                  <div style={S.panelTitle}>Overall Status</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={statusStyle(diff.statusChange.before)}>{diff.statusChange.before || '—'}</span>
                    <span style={{ color: '#475569', fontSize: 18 }}>→</span>
                    <span style={statusStyle(diff.statusChange.after)}>{diff.statusChange.after || '—'}</span>
                    {diff.improved && <span style={{ color: '#4ade80', fontSize: 12, marginLeft: 8 }}>✓ Improved</span>}
                    {!diff.improved && diff.totalIssuesDelta > 0 && <span style={{ color: '#f87171', fontSize: 12, marginLeft: 8 }}>⚠ Regressed</span>}
                  </div>
                </div>
              )}

              {/* Counts before / after */}
              <div style={S.panelBox}>
                <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Before</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#94a3b8' }}>
                      {simResult.before?.summary?.totalIssues ?? '—'}
                      <span style={{ fontSize: 12, color: '#475569', marginLeft: 4 }}>issues</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>After</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#7dd3fc' }}>
                      {simResult.after?.summary?.totalIssues ?? '—'}
                      <span style={{ fontSize: 12, color: '#475569', marginLeft: 4 }}>issues</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Modifications</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#facc15' }}>
                      {simResult.modificationCount}
                    </div>
                  </div>
                </div>
                <div style={S.panelTitle}>Issue Type Changes</div>
                <IssueChangeTable changes={diff.issueChanges} />
              </div>

              {/* Entry changes */}
              {simResult.entryChanges && simResult.entryChanges.length > 0 && (
                <div style={S.panelBox}>
                  <div style={S.panelTitle}>Journal Entry Changes ({simResult.entryChanges.length})</div>
                  <EntryChangeList changes={simResult.entryChanges} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
