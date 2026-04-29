import React, { useState } from 'react';

const TX_TYPES = {
  pma: [
    { value: 'Expense',        label: 'Project Expense' },
    { value: 'Revenue',        label: 'Project Revenue' },
    { value: 'WIP',            label: 'Work-In-Progress (WIP)' },
    { value: 'CostAccrual',    label: 'Cost Accrual (Auto-Reversal)' },
    { value: 'RevenueAccrual', label: 'Revenue Accrual (Auto-Reversal)' },
  ],
  procurement: [
    { value: 'Invoice',       label: 'Vendor Invoice' },
    { value: 'Accrual',       label: 'Receipt Accrual (Uninvoiced)' },
    { value: 'ProductReceipt',label: 'Product Receipt (GRN)' },
  ],
  sales: [
    { value: 'Invoice', label: 'Customer Invoice' },
    { value: 'Revenue', label: 'Revenue Recognition' },
    { value: 'COGS',    label: 'Cost of Goods Sold' },
  ],
  fixed_assets: [
    { value: 'Acquisition',  label: 'Asset Acquisition' },
    { value: 'Depreciation', label: 'Asset Depreciation' },
    { value: 'Disposal',     label: 'Asset Disposal' },
    { value: 'Revaluation',  label: 'Asset Revaluation' },
  ],
  inventory: [
    { value: 'Issue',      label: 'Inventory Issue / Consumption' },
    { value: 'Receipt',    label: 'Inventory Receipt' },
    { value: 'Transfer',   label: 'Inventory Transfer' },
    { value: 'Adjustment', label: 'Inventory Adjustment' },
  ],
  lease: [
    { value: 'LeaseCommencement', label: 'Lease Initial Recognition' },
    { value: 'Depreciation',      label: 'Monthly Depreciation' },
    { value: 'InterestAccrual',   label: 'Interest Accrual' },
    { value: 'Payment',           label: 'Lease Payment' },
    { value: 'VariablePayment',   label: 'Variable / Short-term Lease' },
  ],
  general_ledger: [
    { value: 'Manual',       label: 'Manual Journal Entry' },
    { value: 'Allocation',   label: 'Ledger Allocation' },
    { value: 'Periodic',     label: 'Periodic Journal' },
    { value: 'Intercompany', label: 'Intercompany Transaction' },
  ],
};

const BLANK_ENTRY    = { account: '', description: '', debit: '', credit: '' };
const BLANK_SCENARIO = (n, module) => ({
  id:              Date.now(),
  description:     `Scenario ${n}`,
  transactionType: TX_TYPES[module]?.[0]?.value || '',
  expectedEntries: [{ ...BLANK_ENTRY }],
  actualEntries:   [{ ...BLANK_ENTRY }],
});

export default function ScenarioBuilder({ scenarios, setScenarios, context }) {
  const [open, setOpen] = useState(null);

  const add = () => {
    const s = BLANK_SCENARIO(scenarios.length + 1, context.module);
    setScenarios(p => [...p, s]);
    setOpen(s.id);
  };

  const remove = (id) => {
    setScenarios(p => p.filter(s => s.id !== id));
    if (open === id) setOpen(null);
  };

  const update = (id, key, value) =>
    setScenarios(p => p.map(s => s.id === id ? { ...s, [key]: value } : s));

  const txTypes = TX_TYPES[context.module] || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Scenario Builder</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Define expected vs actual journal entries. The engine compares them and identifies root causes using the <b style={{ color: '#94a3b8' }}>{context.module}</b> module rule pack.
          </p>
        </div>
        <button style={S.addBtn} onClick={add}>+ Add Scenario</button>
      </div>

      {scenarios.length === 0 && <EmptyState onAdd={add} module={context.module} />}

      {scenarios.map((s, i) => (
        <div key={s.id} style={{ ...S.card, marginBottom: 12 }}>
          <div style={S.cardHeader} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span style={S.cardNum}>{i + 1}</span>
            <input
              style={S.descInput}
              value={s.description}
              onChange={e => update(s.id, 'description', e.target.value)}
              onClick={e => e.stopPropagation()}
              placeholder="Scenario description…"
            />
            <select
              style={S.typeSelect}
              value={s.transactionType}
              onChange={e => update(s.id, 'transactionType', e.target.value)}
              onClick={e => e.stopPropagation()}
            >
              {txTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button style={S.removeBtn} onClick={e => { e.stopPropagation(); remove(s.id); }}>✕</button>
            <span style={{ color: '#475569', fontSize: 12 }}>{open === s.id ? '▲' : '▼'}</span>
          </div>

          {open === s.id && (
            <div style={S.cardBody}>
              <div style={S.cols}>
                <EntryTable
                  title="Expected Entries"
                  accent="#22c55e"
                  entries={s.expectedEntries}
                  onChange={v => update(s.id, 'expectedEntries', v)}
                />
                <EntryTable
                  title="Actual Entries (Posted)"
                  accent="#3b82f6"
                  entries={s.actualEntries}
                  onChange={v => update(s.id, 'actualEntries', v)}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EntryTable({ title, accent, entries, onChange }) {
  const add    = ()        => onChange([...entries, { ...BLANK_ENTRY }]);
  const remove = (i)       => onChange(entries.filter((_, j) => j !== i));
  const edit   = (i, k, v) => onChange(entries.map((e, j) => j === i ? { ...e, [k]: v } : e));

  const drTotal  = entries.reduce((s, e) => s + (parseFloat(e.debit)  || 0), 0);
  const crTotal  = entries.reduce((s, e) => s + (parseFloat(e.credit) || 0), 0);
  const balanced = Math.abs(drTotal - crTotal) < 0.01;

  return (
    <div style={S.entryBox}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: .8 }}>{title}</span>
        <span style={{ fontSize: 11, color: balanced ? '#22c55e' : '#ef4444' }}>
          {balanced ? '✓ Balanced' : `Diff: ${Math.abs(drTotal - crTotal).toFixed(2)}`}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: '#475569' }}>
            <th style={S.th}>Account</th>
            <th style={S.th}>Description</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Debit</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Credit</th>
            <th style={S.th}></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td style={S.td}><input style={S.inp} value={e.account}     onChange={ev => edit(i,'account',     ev.target.value)} placeholder="e.g. 6618" /></td>
              <td style={S.td}><input style={S.inp} value={e.description} onChange={ev => edit(i,'description', ev.target.value)} placeholder="Description" /></td>
              <td style={S.td}><input style={{ ...S.inp, textAlign: 'right' }} value={e.debit}  onChange={ev => edit(i,'debit',  ev.target.value)} placeholder="0.00" type="number" /></td>
              <td style={S.td}><input style={{ ...S.inp, textAlign: 'right' }} value={e.credit} onChange={ev => edit(i,'credit', ev.target.value)} placeholder="0.00" type="number" /></td>
              <td style={S.td}><button style={S.delRow} onClick={() => remove(i)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ ...S.addRowBtn, borderColor: accent, color: accent }} onClick={add}>+ Add Line</button>
    </div>
  );
}

function EmptyState({ onAdd, module }) {
  const examples = {
    pma:            'Project expense, WIP recognition, or cost accrual with auto-reversal',
    procurement:    'Vendor invoice or receipt accrual',
    sales:          'Customer invoice or revenue recognition',
    fixed_assets:   'Asset acquisition or depreciation',
    inventory:      'Inventory receipt or goods issue',
    lease:          'Lease commencement or monthly depreciation',
    general_ledger: 'Manual journal or cost allocation',
  };
  return (
    <div style={S.empty}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>No scenarios yet</div>
      <p style={{ fontSize: 13, color: '#475569', marginBottom: 6, maxWidth: 380, textAlign: 'center' }}>
        Add a scenario to compare expected vs actual D365 journal entries.
      </p>
      {examples[module] && (
        <p style={{ fontSize: 12, color: '#334155', marginBottom: 16, textAlign: 'center' }}>
          Example for this module: <em style={{ color: '#64748b' }}>{examples[module]}</em>
        </p>
      )}
      <button style={S.addBtn} onClick={onAdd}>+ Add First Scenario</button>
    </div>
  );
}

const S = {
  card: { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' },
  cardNum: {
    width: 24, height: 24, borderRadius: '50%', background: '#334155',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#94a3b8', flexShrink: 0,
  },
  descInput: { flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 14, fontWeight: 600 },
  typeSelect: {
    background: '#0f172a', border: '1px solid #334155', color: '#94a3b8',
    padding: '4px 8px', borderRadius: 6, fontSize: 12, outline: 'none',
  },
  removeBtn: { background: 'none', border: 'none', color: '#475569', fontSize: 14, cursor: 'pointer', padding: '0 4px' },
  cardBody: { padding: '0 16px 16px', borderTop: '1px solid #1e293b' },
  cols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 },
  entryBox: { background: '#0f1117', border: '1px solid #1e293b', borderRadius: 8, padding: '12px' },
  th: { padding: '6px 6px 6px 0', textAlign: 'left', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, borderBottom: '1px solid #1e293b' },
  td: { padding: '4px 4px 0 0', verticalAlign: 'top' },
  inp: { width: '100%', background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 4, color: '#e2e8f0', padding: '5px 7px', fontSize: 12, outline: 'none' },
  delRow: { background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '5px 4px', fontSize: 13 },
  addRowBtn: { marginTop: 8, background: 'none', border: '1px dashed', borderRadius: 4, padding: '4px 12px', fontSize: 12, cursor: 'pointer', width: '100%' },
  addBtn: { padding: '9px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', border: '2px dashed #1e293b', borderRadius: 12 },
};
