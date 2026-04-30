import React, { useState } from 'react';
import ScenarioBuilder from './ScenarioBuilder';
import ResultsDashboard from './ResultsDashboard';

const TX_TYPES = {
  pma:            [{ value: 'Expense', label: 'Project Expense' }, { value: 'Revenue', label: 'Project Revenue' }, { value: 'WIP', label: 'Work-In-Progress' }, { value: 'CostAccrual', label: 'Cost Accrual' }],
  procurement:    [{ value: 'Invoice', label: 'Vendor Invoice' }, { value: 'Accrual', label: 'Receipt Accrual' }, { value: 'ProductReceipt', label: 'Goods Receipt' }],
  sales:          [{ value: 'Invoice', label: 'Customer Invoice' }, { value: 'Revenue', label: 'Revenue Recognition' }, { value: 'COGS', label: 'Cost of Goods Sold' }],
  fixed_assets:   [{ value: 'Acquisition', label: 'Asset Acquisition' }, { value: 'Depreciation', label: 'Depreciation' }, { value: 'Disposal', label: 'Asset Disposal' }],
  inventory:      [{ value: 'Issue', label: 'Goods Issue' }, { value: 'Receipt', label: 'Goods Receipt' }, { value: 'Adjustment', label: 'Adjustment' }],
  lease:          [{ value: 'LeaseCommencement', label: 'Lease Recognition' }, { value: 'Depreciation', label: 'Monthly Depreciation' }, { value: 'InterestAccrual', label: 'Interest Accrual' }, { value: 'Payment', label: 'Lease Payment' }],
  general_ledger: [{ value: 'Manual', label: 'Manual Entry' }, { value: 'Allocation', label: 'Cost Allocation' }, { value: 'Periodic', label: 'Periodic Journal' }],
};

const MODULES = [
  { value: 'pma', label: 'Project Mgmt', color: '#8b5cf6' },
  { value: 'procurement', label: 'Procurement', color: '#f59e0b' },
  { value: 'sales', label: 'Sales', color: '#22c55e' },
  { value: 'fixed_assets', label: 'Fixed Assets', color: '#3b82f6' },
  { value: 'inventory', label: 'Inventory', color: '#06b6d4' },
  { value: 'lease', label: 'Lease', color: '#ec4899' },
  { value: 'general_ledger', label: 'General Ledger', color: '#94a3b8' },
];

const SAMPLES = [
  { key: 'pma',         label: 'Project expense errors',     color: '#8b5cf6' },
  { key: 'procurement', label: 'Vendor invoice AP accounts', color: '#f59e0b' },
  { key: 'sales',       label: 'Sales COGS mis-posting',     color: '#22c55e' },
  { key: 'pmaAccrual',  label: 'Accrual / auto-reversal',    color: '#6366f1' },
];

const BLANK_ENTRY = { account: '', description: '', debit: '', credit: '' };

export default function ScenarioView({ scenarios, setScenarios, context, setContext, result, isRunning, runError, onRun, onLoadSample, mode }) {
  const [view, setView] = useState(result ? 'results' : 'builder');

  if (mode === 'advanced') {
    return (
      <div style={S.root}>
        <SectionHeader
          title="Scenario Builder"
          sub="Define expected vs actual journal entries to diagnose a specific transaction."
          right={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SAMPLES.map(s => (
                <button key={s.key} onClick={() => { onLoadSample(s.key); setView('builder'); }}
                  style={{ ...S.sampleBtn, borderColor: s.color, color: s.color }}>
                  {s.label}
                </button>
              ))}
            </div>
          }
        />
        <ScenarioBuilder scenarios={scenarios} setScenarios={setScenarios} context={context} />
        <RunBar isRunning={isRunning} runError={runError} onRun={() => { onRun(); setView('results'); }} />
        {view === 'results' && result && (
          <div style={{ marginTop: 24 }}>
            <SectionTitle>Results</SectionTitle>
            <ResultsDashboard result={result} mode={mode} context={context} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={S.root}>
      {view !== 'results' ? (
        <SimpleBuilder
          scenarios={scenarios} setScenarios={setScenarios}
          context={context} setContext={setContext}
          isRunning={isRunning} runError={runError}
          onRun={() => { onRun(); setView('results'); }}
          onLoadSample={(k) => { onLoadSample(k); }}
        />
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <button onClick={() => setView('builder')} style={S.backBtn}>← Edit Scenario</button>
            <h2 style={S.sectionTitle2}>Analysis Results</h2>
            <button onClick={() => { onRun(); }} disabled={isRunning} style={S.rerunBtn}>
              {isRunning ? '…' : '↻ Re-run'}
            </button>
          </div>
          <ResultsDashboard result={result} mode={mode} context={context} />
        </div>
      )}
    </div>
  );
}

// ── Simple scenario builder ───────────────────────────────────────────────────
function SimpleBuilder({ scenarios, setScenarios, context, setContext, isRunning, runError, onRun, onLoadSample }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = (k, v) => setContext(p => ({ ...p, [k]: v }));
  const moduleColor = MODULES.find(m => m.value === context.module)?.color || '#3b82f6';
  const txTypes = TX_TYPES[context.module] || TX_TYPES.general_ledger;
  const firstScenario = scenarios[0];

  const ensureScenario = () => {
    if (scenarios.length === 0) {
      const s = {
        id: Date.now(), description: 'My scenario',
        transactionType: txTypes[0]?.value || 'Manual',
        accountingCurrency: context.accountingCurrency || 'EUR',
        expectedEntries: [{ ...BLANK_ENTRY }],
        actualEntries:   [{ ...BLANK_ENTRY }],
      };
      setScenarios([s]);
      return s;
    }
    return scenarios[0];
  };

  const updateFirst = (key, value) => {
    const s = ensureScenario();
    setScenarios(p => p.map(x => x.id === s.id ? { ...x, [key]: value } : x));
  };

  const updateEntry = (side, idx, field, value) => {
    const s = ensureScenario();
    setScenarios(p => p.map(x => {
      if (x.id !== s.id) return x;
      const entries = [...x[side]];
      entries[idx] = { ...entries[idx], [field]: value };
      return { ...x, [side]: entries };
    }));
  };

  const addEntry = (side) => {
    const s = ensureScenario();
    setScenarios(p => p.map(x => x.id !== s.id ? x : {
      ...x, [side]: [...x[side], { ...BLANK_ENTRY }]
    }));
  };

  const removeEntry = (side, idx) => {
    const s = ensureScenario();
    setScenarios(p => p.map(x => x.id !== s.id ? x : {
      ...x, [side]: x[side].filter((_, i) => i !== idx)
    }));
  };

  const sc = firstScenario || { expectedEntries: [], actualEntries: [], transactionType: txTypes[0]?.value };

  return (
    <div>
      <SectionHeader
        title="Build a Scenario"
        sub="Compare what D365 should have posted (expected) with what it actually posted (actual). The engine identifies the root cause."
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SAMPLES.map(s => (
              <button key={s.key} onClick={() => onLoadSample(s.key)}
                style={{ ...S.sampleBtn, borderColor: s.color, color: s.color }}>
                {s.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Quick module + type */}
      <div style={S.quickRow}>
        <div style={S.quickField}>
          <FieldLabel>Module</FieldLabel>
          <div style={S.moduleRow}>
            {MODULES.map(m => (
              <button
                key={m.value}
                onClick={() => set('module', m.value)}
                style={{ ...S.moduleChip, border: `2px solid ${context.module === m.value ? m.color : '#1e293b'}`, color: context.module === m.value ? m.color : '#475569', background: context.module === m.value ? m.color + '15' : '#1a1f2e' }}
              >{m.label}</button>
            ))}
          </div>
        </div>
        <div style={S.quickField}>
          <FieldLabel>Transaction type</FieldLabel>
          <select
            value={sc.transactionType || txTypes[0]?.value || ''}
            onChange={e => updateFirst('transactionType', e.target.value)}
            style={S.typeSelect}
          >
            {txTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Entry tables side-by-side */}
      <div style={S.entryCols}>
        <SimpleEntryTable
          title="What should have been posted"
          accent="#22c55e"
          entries={sc.expectedEntries || []}
          onUpdate={(i, f, v) => updateEntry('expectedEntries', i, f, v)}
          onAdd={() => addEntry('expectedEntries')}
          onRemove={(i) => removeEntry('expectedEntries', i)}
        />
        <SimpleEntryTable
          title="What was actually posted"
          accent="#3b82f6"
          entries={sc.actualEntries || []}
          onUpdate={(i, f, v) => updateEntry('actualEntries', i, f, v)}
          onAdd={() => addEntry('actualEntries')}
          onRemove={(i) => removeEntry('actualEntries', i)}
        />
      </div>

      {/* Advanced settings */}
      <button onClick={() => setShowAdvanced(p => !p)} style={S.advToggle}>
        {showAdvanced ? '▲' : '▼'} Advanced settings (GAAP, currency, PMA)
      </button>
      {showAdvanced && (
        <div style={S.advPanel}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <FieldLabel>GAAP framework</FieldLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['french_gaap','French GAAP'], ['us_gaap','US GAAP'], ['dual_gaap','Dual']].map(([v, l]) => (
                  <button key={v} onClick={() => set('gaap', v)} style={{ ...S.advChip, border: `2px solid ${context.gaap === v ? '#3b82f6' : '#1e293b'}`, color: context.gaap === v ? '#60a5fa' : '#475569', background: context.gaap === v ? '#1e3a5f' : '#1a1f2e' }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Ledger currency</FieldLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                {['EUR','USD','GBP','CHF'].map(c => (
                  <button key={c} onClick={() => set('accountingCurrency', c)} style={{ ...S.advChip, border: `2px solid ${(context.accountingCurrency||'EUR') === c ? '#a78bfa' : '#1e293b'}`, color: (context.accountingCurrency||'EUR') === c ? '#a78bfa' : '#475569', background: (context.accountingCurrency||'EUR') === c ? '#1e1533' : '#1a1f2e' }}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>PMA provision</FieldLabel>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={context.pma||false} onChange={e => set('pma', e.target.checked)} style={{ accentColor: '#3b82f6', width: 15, height: 15 }} />
                <span style={{ fontSize: 13, color: context.pma ? '#60a5fa' : '#64748b', fontWeight: 600 }}>
                  {context.pma ? 'Active' : 'Inactive'}
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {runError && <div style={S.errorBox}>{runError}</div>}

      <div style={{ marginTop: 24 }}>
        <button onClick={onRun} disabled={isRunning} style={{ ...S.runBtn, opacity: isRunning ? .65 : 1 }}>
          {isRunning ? '⏳  Analyzing…' : '▶  Analyze Scenario'}
        </button>
      </div>
    </div>
  );
}

function SimpleEntryTable({ title, accent, entries, onUpdate, onAdd, onRemove }) {
  const total = entries.reduce((s, e) => ({
    dr: s.dr + (parseFloat(e.debit) || 0),
    cr: s.cr + (parseFloat(e.credit) || 0),
  }), { dr: 0, cr: 0 });
  const balanced = Math.abs(total.dr - total.cr) < 0.01;

  return (
    <div style={S.entryBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: .8 }}>{title}</span>
        <span style={{ fontSize: 11, color: balanced ? '#22c55e' : '#ef4444' }}>
          {balanced ? '✓ Balanced' : `Δ ${Math.abs(total.dr - total.cr).toFixed(2)}`}
        </span>
      </div>
      <table style={S.entryTable}>
        <thead>
          <tr>
            {['Account', 'Description', 'Debit', 'Credit', ''].map(h => (
              <th key={h} style={S.entryTh}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td style={S.entryTd}><input style={S.inp} value={e.account} onChange={ev => onUpdate(i, 'account', ev.target.value)} placeholder="e.g. 6618" /></td>
              <td style={S.entryTd}><input style={{ ...S.inp, minWidth: 120 }} value={e.description} onChange={ev => onUpdate(i, 'description', ev.target.value)} placeholder="Description" /></td>
              <td style={S.entryTd}><input style={{ ...S.inp, textAlign: 'right', width: 80 }} value={e.debit} onChange={ev => onUpdate(i, 'debit', ev.target.value)} placeholder="0.00" inputMode="decimal" /></td>
              <td style={S.entryTd}><input style={{ ...S.inp, textAlign: 'right', width: 80 }} value={e.credit} onChange={ev => onUpdate(i, 'credit', ev.target.value)} placeholder="0.00" inputMode="decimal" /></td>
              <td style={S.entryTd}><button onClick={() => onRemove(i)} style={S.delBtn}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onAdd} style={{ ...S.addRowBtn, color: accent }}>+ Add Line</button>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' }}>{title}</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0, maxWidth: 540 }}>{sub}</p>
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: '0 0 16px' }}>{children}</h2>;
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>{children}</div>;
}

function RunBar({ isRunning, runError, onRun }) {
  return (
    <div style={S.runBar}>
      {runError && <span style={{ fontSize: 12, color: '#ef4444' }}>⚠ {runError}</span>}
      <button onClick={onRun} disabled={isRunning} style={{ ...S.runBtn, opacity: isRunning ? .65 : 1 }}>
        {isRunning ? '⏳  Analyzing…' : '▶  Run Analysis'}
      </button>
    </div>
  );
}

const S = {
  root:      { maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' },
  backBtn:   { padding: '7px 14px', background: '#1a1f2e', border: '1px solid #334155', borderRadius: 7, color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  rerunBtn:  { padding: '7px 14px', background: '#1a1f2e', border: '1px solid #334155', borderRadius: 7, color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  sectionTitle2: { fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: 0, flex: 1 },
  sampleBtn: { padding: '5px 12px', background: 'transparent', border: '1px solid', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' },

  quickRow:   { display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
  quickField: { flex: 1, minWidth: 200 },
  moduleRow:  { display: 'flex', gap: 6, flexWrap: 'wrap' },
  moduleChip: { padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' },
  typeSelect: { background: '#1a1f2e', border: '1px solid #334155', color: '#e2e8f0', padding: '8px 12px', borderRadius: 7, fontSize: 13, outline: 'none', width: '100%', maxWidth: 280 },

  entryCols:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  entryBox:   { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '14px' },
  entryTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 },
  entryTh:    { padding: '4px 6px', fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: .5, textAlign: 'left' },
  entryTd:    { padding: '3px 4px' },
  inp:        { background: '#0f1117', border: '1px solid #1e293b', color: '#e2e8f0', padding: '5px 7px', borderRadius: 5, fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' },
  delBtn:     { background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 12, padding: '2px 4px' },
  addRowBtn:  { background: 'none', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 2px', letterSpacing: .3 },

  advToggle:  { background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', padding: '8px 0', textDecoration: 'underline dotted', marginBottom: 4 },
  advPanel:   { background: '#0d1219', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 20px', marginBottom: 16 },
  advChip:    { padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' },
  errorBox:   { padding: '10px 14px', background: '#2d0b0b', border: '1px solid #ef4444', borderRadius: 6, color: '#fca5a5', fontSize: 13, marginTop: 12 },
  runBtn:     { padding: '11px 28px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  runBar:     { display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '16px 0', borderTop: '1px solid #1e293b' },
};
