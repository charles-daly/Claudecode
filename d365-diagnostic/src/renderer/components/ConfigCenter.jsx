import React, { useState } from 'react';
import GaapMapping   from './GaapMapping';
import DebugPanel    from './DebugPanel';
import TestRunner    from './TestRunner';

const MODULES = [
  { value: 'pma',            label: 'Project Mgmt (PMA)',       sub: 'Cost, revenue, WIP, accruals',         color: '#8b5cf6' },
  { value: 'procurement',    label: 'Procurement',              sub: 'Vendor invoices, receipts, accruals',  color: '#f59e0b' },
  { value: 'sales',          label: 'Sales',                    sub: 'Customer invoices, revenue, COGS',     color: '#22c55e' },
  { value: 'fixed_assets',   label: 'Fixed Assets',             sub: 'Acquisition, depreciation, disposal',  color: '#3b82f6' },
  { value: 'inventory',      label: 'Inventory',                sub: 'Receipt, issue, transfer',              color: '#06b6d4' },
  { value: 'lease',          label: 'Lease (IFRS 16 / ASC 842)',sub: 'ROU asset, liability, payments',       color: '#ec4899' },
  { value: 'general_ledger', label: 'General Ledger',           sub: 'Manual journals, allocations',         color: '#94a3b8' },
];

const TABS = [
  { id: 'general',  label: 'General',          icon: '⚙' },
  { id: 'mappings', label: 'Account Mapping',  icon: '🗂' },
  { id: 'advanced', label: 'Advanced / Debug', icon: '🔬' },
];

export default function ConfigCenter({ context, setContext, mode }) {
  const [activeTab, setActiveTab] = useState('general');
  const set = (k, v) => setContext(p => ({ ...p, [k]: v }));

  const activeModule = MODULES.find(m => m.value === context.module) || MODULES[0];
  const pg = context.projectGroup || {};

  return (
    <div style={S.root}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={S.pageTitle}>System Configuration</h1>
        <p style={S.pageSub}>Set the diagnostic engine's module, GAAP framework, account mappings, and regulatory options. Changes take effect on the next analysis run.</p>
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{ ...S.tab, ...(activeTab === t.id ? S.tabActive : {}) }}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={S.tabContent}>
        {activeTab === 'general'  && <GeneralTab context={context} set={set} setContext={setContext} activeModule={activeModule} pg={pg} />}
        {activeTab === 'mappings' && <GaapMapping />}
        {activeTab === 'advanced' && <AdvancedTab mode={mode} />}
      </div>
    </div>
  );
}

// ── General Settings ──────────────────────────────────────────────────────────
function GeneralTab({ context, set, setContext, activeModule, pg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Module */}
      <Section title="D365 Module" sub="Select the Finance module these journal entries belong to. The engine loads the correct accounting rules automatically.">
        <div style={S.moduleGrid}>
          {MODULES.map(m => (
            <div
              key={m.value}
              onClick={() => set('module', m.value)}
              style={{
                ...S.moduleCard,
                border: `2px solid ${context.module === m.value ? m.color : '#1e293b'}`,
                background: context.module === m.value ? m.color + '12' : '#1a1f2e',
                cursor: 'pointer',
              }}
            >
              <div style={{ ...S.moduleIcon, background: context.module === m.value ? m.color + '30' : '#1e293b' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: context.module === m.value ? m.color : '#475569' }}>
                  {m.value === 'pma' ? 'PMA' : m.value === 'procurement' ? 'P2P' : m.value === 'sales' ? 'O2C' : m.value === 'fixed_assets' ? 'FA' : m.value === 'inventory' ? 'INV' : m.value === 'lease' ? 'LSE' : 'GL'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: context.module === m.value ? 700 : 500, color: context.module === m.value ? '#e2e8f0' : '#94a3b8' }}>{m.label}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Country + GAAP */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section title="Country" sub="Determines the chart of accounts classification.">
          <RadioGroup
            value={context.country}
            onChange={v => set('country', v)}
            options={[
              { value: 'FR', label: 'France',        sub: 'French PCG (Plan Comptable Général)' },
              { value: 'US', label: 'United States', sub: 'US GAAP chart of accounts' },
            ]}
          />
        </Section>
        <Section title="Accounting Framework" sub="The GAAP standard used for diagnostic rules.">
          <RadioGroup
            value={context.gaap}
            onChange={v => set('gaap', v)}
            options={[
              { value: 'french_gaap', label: 'French GAAP',     sub: 'Plan Comptable Général (PCG)' },
              { value: 'us_gaap',     label: 'US GAAP',         sub: 'ASC 842 / ASC 360 / US GAAP' },
              { value: 'dual_gaap',   label: 'Dual reporting',  sub: 'French statutory + IFRS layer' },
            ]}
          />
        </Section>
      </div>

      {/* Accounting currency */}
      <Section title="Ledger Currency" sub="The currency in which debits must equal credits after FX conversion. Foreign-currency lines are converted at their exchange rate.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['EUR', 'USD', 'GBP', 'CHF', 'JPY'].map(c => {
            const active = (context.accountingCurrency || 'EUR') === c;
            return (
              <button key={c} onClick={() => set('accountingCurrency', c)} style={{
                ...S.ccyBtn,
                border: `2px solid ${active ? '#a78bfa' : '#1e293b'}`,
                background: active ? '#1e1533' : '#1a1f2e',
                color: active ? '#a78bfa' : '#64748b',
              }}>{c}</button>
            );
          })}
        </div>
      </Section>

      {/* PMA */}
      <Section title="PMA — French Regulatory Provision" sub="Requires a provision entry (68725 DR / 1510 CR) alongside standard depreciation. Only relevant under French GAAP with Fixed Assets or Lease modules.">
        <ToggleRow
          checked={context.pma}
          onChange={v => set('pma', v)}
          color="#3b82f6"
          label={context.pma ? 'PMA Active — engine flags missing provisions' : 'PMA Inactive'}
        />
        {context.gaap !== 'french_gaap' && context.pma && (
          <Warning>PMA is a French GAAP feature. Switch to French GAAP for complete rule coverage.</Warning>
        )}
        {!['fixed_assets', 'lease'].includes(context.module) && context.pma && (
          <Warning>PMA applies only to Fixed Assets and Lease modules.</Warning>
        )}
      </Section>

      {/* Project Group accrual — only for PMA module */}
      {context.module === 'pma' && (
        <Section title="Project Group — Accrual / Auto-Reversal" sub="When enabled, the engine performs deep accrual pattern analysis: entry pair matching, balance sheet account validation, P&L neutralization checks, and full root-cause tracing.">
          <ToggleRow
            checked={pg.accrualEnabled || false}
            onChange={v => setContext(p => ({ ...p, projectGroup: { ...p.projectGroup, accrualEnabled: v } }))}
            color="#8b5cf6"
            label={pg.accrualEnabled ? 'Accrual engine active' : 'Accrual engine inactive'}
          />
          {pg.accrualEnabled && (
            <div style={{ marginTop: 12 }}>
              <ToggleRow
                checked={pg.autoReverse || false}
                onChange={v => setContext(p => ({ ...p, projectGroup: { ...p.projectGroup, autoReverse: v } }))}
                color="#6366f1"
                label={pg.autoReverse ? 'Auto-reversal expected — engine flags missing reversal lines' : 'Auto-reversal not expected'}
              />
            </div>
          )}
        </Section>
      )}

      {/* Active config summary */}
      <div style={S.summary}>
        <div style={S.summaryLabel}>Active configuration</div>
        <div style={S.summaryRow}>
          {[
            ['Module',   activeModule.label],
            ['Country',  context.country],
            ['GAAP',     context.gaap?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
            ['Currency', context.accountingCurrency || 'EUR'],
            ['PMA',      context.pma ? 'Enabled' : 'Off'],
            ...(context.module === 'pma' ? [['Accrual', pg.accrualEnabled ? 'On' : 'Off']] : []),
          ].map(([k, v]) => (
            <div key={k} style={S.summaryItem}>
              <span style={S.summaryKey}>{k}</span>
              <span style={{ ...S.summaryVal, color: k === 'Module' ? activeModule.color : '#e2e8f0' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Advanced / Debug Tab ──────────────────────────────────────────────────────
function AdvancedTab() {
  const [view, setView] = useState('tests');
  return (
    <div>
      <div style={S.innerTabs}>
        {['tests', 'debug'].map(v => (
          <button key={v} onClick={() => setView(v)} style={{ ...S.innerTab, ...(view === v ? S.innerTabActive : {}) }}>
            {v === 'tests' ? '🧪 Self-test' : '🐛 Debug Logs'}
          </button>
        ))}
      </div>
      {view === 'tests' && <TestRunner />}
      {view === 'debug' && <DebugPanel result={null} />}
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────
function Section({ title, sub, children }) {
  return (
    <div style={S.section}>
      <div style={{ marginBottom: 14 }}>
        <div style={S.sectionTitle}>{title}</div>
        {sub && <p style={S.sectionSub}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function RadioGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(o => {
        const active = value === o.value;
        return (
          <label
            key={o.value}
            style={{ ...S.radioLabel, ...(active ? S.radioLabelActive : {}), cursor: 'pointer' }}
          >
            <input type="radio" name="rg" value={o.value} checked={active} onChange={() => onChange(o.value)} style={{ display: 'none' }} />
            <div style={{ ...S.radioDot, ...(active ? S.radioDotActive : {}) }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#e2e8f0' : '#94a3b8' }}>{o.label}</div>
              {o.sub && <div style={{ fontSize: 11, color: '#475569' }}>{o.sub}</div>}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function ToggleRow({ checked, onChange, color, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{ ...S.trackOuter, background: checked ? color : '#1e293b' }}
      >
        <div style={{ ...S.trackThumb, left: checked ? 22 : 2 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: checked ? color : '#64748b' }}>{label}</span>
    </label>
  );
}

function Warning({ children }) {
  return (
    <div style={{ padding: '8px 12px', background: '#422006', border: '1px solid #854d0e', borderRadius: 6, fontSize: 12, color: '#fcd34d', marginTop: 10 }}>
      {children}
    </div>
  );
}

const S = {
  root:       { maxWidth: 960, margin: '0 auto', padding: '32px 24px 64px' },
  pageTitle:  { fontSize: 22, fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' },
  pageSub:    { fontSize: 13, color: '#64748b', margin: 0, maxWidth: 580, lineHeight: 1.6 },

  tabBar:     { display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid #1e293b' },
  tab:        { display: 'flex', alignItems: 'center', padding: '9px 20px', background: 'none', border: 'none', color: '#475569', fontSize: 14, fontWeight: 500, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1, transition: 'all .15s' },
  tabActive:  { color: '#e2e8f0', borderBottomColor: '#3b82f6' },
  tabContent: {},

  innerTabs:      { display: 'flex', gap: 6, marginBottom: 20 },
  innerTab:       { padding: '6px 16px', background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 6, color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s' },
  innerTabActive: { background: '#1e3a5f', border: '1px solid #3b82f6', color: '#60a5fa' },

  section:     { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 12, padding: '20px 22px' },
  sectionTitle:{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 },
  sectionSub:  { fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.6 },

  moduleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 },
  moduleCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, transition: 'all .15s' },
  moduleIcon: { width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  radioLabel:       { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 6, border: '1px solid transparent', transition: 'all .15s' },
  radioLabelActive: { background: '#0f172a', border: '1px solid #3b82f6' },
  radioDot:         { width: 14, height: 14, borderRadius: '50%', border: '2px solid #334155', background: 'transparent', flexShrink: 0, marginTop: 3, transition: 'all .15s' },
  radioDotActive:   { border: '2px solid #3b82f6', background: '#3b82f6' },

  ccyBtn:     { padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' },

  trackOuter: { width: 42, height: 22, borderRadius: 999, position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 },
  trackThumb: { position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' },

  summary:     { background: '#0d1219', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 20px' },
  summaryLabel:{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#334155', textTransform: 'uppercase', marginBottom: 12 },
  summaryRow:  { display: 'flex', gap: 28, flexWrap: 'wrap' },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  summaryKey:  { fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 },
  summaryVal:  { fontSize: 14, fontWeight: 600 },
};
