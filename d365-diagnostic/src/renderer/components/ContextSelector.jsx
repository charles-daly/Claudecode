import React from 'react';

const MODULES = [
  { value: 'pma',            label: 'Project Management & Accounting', sub: 'Project cost, revenue and WIP', color: '#8b5cf6' },
  { value: 'procurement',    label: 'Procurement (P2P)',               sub: 'Procure-to-Pay: invoices, receipts, accruals', color: '#f59e0b' },
  { value: 'sales',          label: 'Sales (O2C)',                     sub: 'Order-to-Cash: invoices, revenue, COGS', color: '#22c55e' },
  { value: 'fixed_assets',   label: 'Fixed Assets',                    sub: 'IAS 16 / ASC 360 — acquisition, depreciation, disposal', color: '#3b82f6' },
  { value: 'inventory',      label: 'Inventory Management',            sub: 'Receipt, issue, transfer and adjustment', color: '#06b6d4' },
  { value: 'lease',          label: 'Lease (IFRS 16 / ASC 842)',       sub: 'ROU asset and lease liability accounting', color: '#ec4899' },
  { value: 'general_ledger', label: 'General Ledger',                  sub: 'Manual journals, allocations, periodic entries', color: '#94a3b8' },
];

export default function ContextSelector({ context, setContext }) {
  const set = (key, value) => setContext(prev => ({ ...prev, [key]: value }));

  const setProjectGroup = (key, value) =>
    setContext(prev => ({
      ...prev,
      projectGroup: { ...(prev.projectGroup || {}), [key]: value },
    }));

  const activeModule = MODULES.find(m => m.value === context.module) || MODULES[0];
  const pg           = context.projectGroup || {};

  return (
    <div>
      <PageTitle
        title="Diagnostic Context"
        sub="Select the D365 Finance module, country, GAAP framework, and regulatory options. All diagnostic rules load automatically from the module plugin pack."
      />

      <div style={S.grid}>
        {/* Module */}
        <FieldCard title="Module" icon="⚙" span={2}>
          <div style={S.moduleGrid}>
            {MODULES.map(m => (
              <ModuleCard
                key={m.value}
                {...m}
                active={context.module === m.value}
                onClick={() => set('module', m.value)}
              />
            ))}
          </div>
        </FieldCard>

        {/* Country */}
        <FieldCard title="Country" icon="🌍">
          <Radio name="country" value="FR" label="France"          sub="French PCG accounts (Plan Comptable Général)" current={context.country} onChange={v => set('country', v)} />
          <Radio name="country" value="US" label="United States"   sub="US GAAP D365 chart of accounts"              current={context.country} onChange={v => set('country', v)} />
        </FieldCard>

        {/* GAAP */}
        <FieldCard title="GAAP Framework" icon="📚">
          <Radio name="gaap" value="french_gaap" label="French GAAP" sub="Plan Comptable Général (PCG)"              current={context.gaap} onChange={v => set('gaap', v)} />
          <Radio name="gaap" value="us_gaap"     label="US GAAP"     sub="ASC 842 / ASC 360 / US GAAP"              current={context.gaap} onChange={v => set('gaap', v)} />
          <Radio name="gaap" value="dual_gaap"   label="Dual GAAP"   sub="French statutory + IFRS reporting layer"  current={context.gaap} onChange={v => set('gaap', v)} />
        </FieldCard>

        {/* Accounting Currency */}
        <FieldCard title="Accounting Currency" icon="💱">
          <p style={S.featureDesc}>
            The ledger currency in which DR = CR must hold after FX conversion.
            Defaults to EUR. Foreign-currency lines are converted at their exchange rate.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['EUR', 'USD', 'GBP', 'CHF', 'JPY'].map(ccy => {
              const active = (context.accountingCurrency || 'EUR') === ccy;
              return (
                <button
                  key={ccy}
                  onClick={() => set('accountingCurrency', ccy)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', border: active ? '2px solid #a78bfa' : '1px solid #334155',
                    background: active ? '#1e1533' : '#0f172a', color: active ? '#a78bfa' : '#64748b',
                    letterSpacing: 0.5,
                  }}
                >
                  {ccy}
                </button>
              );
            })}
          </div>
        </FieldCard>

        {/* PMA Toggle */}
        <FieldCard title="PMA — Provision pour Mise en Amortissement" icon="🇫🇷" span={2}>
          <p style={S.featureDesc}>
            French regulatory feature requiring a provision entry (68725 DR / 1510 CR) alongside standard depreciation.
            Only applicable under French GAAP with Fixed Assets or Lease modules.
          </p>
          <Toggle
            checked={context.pma}
            onChange={v => set('pma', v)}
            color="#3b82f6"
            label={context.pma ? 'PMA Active' : 'PMA Inactive'}
          />
          {context.gaap !== 'french_gaap' && context.pma && (
            <div style={S.warn}>PMA is a French GAAP feature. Set GAAP to French GAAP for full rule coverage.</div>
          )}
          {!['fixed_assets','lease'].includes(context.module) && context.pma && (
            <div style={S.warn}>PMA is only applicable in Fixed Assets and Lease modules.</div>
          )}
        </FieldCard>

        {/* Project Group — Accrual / Auto-Reversal (PMA module only) */}
        {context.module === 'pma' && (
          <FieldCard title="Project Group — Accrual / Auto-Reversal" icon="🔄" span={2}>
            <p style={S.featureDesc}>
              When Project Group accrual is enabled, D365 posts forward accrual entries (P&L ↔ Balance Sheet)
              that are automatically reversed in the same voucher or at the start of the next period. Enabling this
              activates deep pattern detection: entry pair matching, BS account validation against the Project Posting
              Profile, P&L neutralization verification, and full root-cause tracing for every deviation found.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Toggle
                checked={pg.accrualEnabled || false}
                onChange={v => setProjectGroup('accrualEnabled', v)}
                color="#8b5cf6"
                label={pg.accrualEnabled ? 'Accrual Engine Active' : 'Accrual Engine Inactive'}
              />
              {pg.accrualEnabled && (
                <Toggle
                  checked={pg.autoReverse || false}
                  onChange={v => setProjectGroup('autoReverse', v)}
                  color="#6366f1"
                  label={pg.autoReverse ? 'Auto-Reversal Expected' : 'Auto-Reversal Not Expected'}
                  sub="Enable when the Project Group Reversal principle is configured. The engine will flag any missing reversal lines as high-severity issues."
                />
              )}
            </div>
            {pg.accrualEnabled && context.gaap !== 'french_gaap' && (
              <div style={{ ...S.warn, marginTop: 12 }}>
                Accrual pattern rules reference French PCG account prefixes (4871, 418, 6xx, 7xx). Set GAAP to French GAAP for complete diagnostic coverage.
              </div>
            )}
          </FieldCard>
        )}
      </div>

      {/* Summary card */}
      <div style={S.summary}>
        <div style={S.summaryTitle}>Active Configuration</div>
        <div style={S.summaryRow}>
          {[
            ['Module',   activeModule.label],
            ['Country',  context.country],
            ['GAAP',     context.gaap?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase())],
            ['Acctg. Ccy', context.accountingCurrency || 'EUR'],
            ['PMA',      context.pma ? 'Enabled' : 'Disabled'],
            ...(context.module === 'pma' ? [
              ['Accrual', pg.accrualEnabled ? 'Enabled' : 'Disabled'],
              ...(pg.accrualEnabled ? [['Auto-Rev', pg.autoReverse ? 'On' : 'Off']] : []),
            ] : []),
          ].map(([k, v]) => (
            <div key={k} style={S.summaryItem}>
              <span style={S.summaryKey}>{k}</span>
              <span style={{
                ...S.summaryVal,
                color: k === 'Module'   ? activeModule.color :
                       k === 'Accrual'  ? (pg.accrualEnabled ? '#8b5cf6' : '#475569') :
                       k === 'Auto-Rev' ? (pg.autoReverse    ? '#6366f1' : '#475569') :
                       '#e2e8f0',
              }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>{title}</h1>
      <p style={{ fontSize: 13, color: '#64748b', maxWidth: 640 }}>{sub}</p>
    </div>
  );
}

function FieldCard({ title, icon, children, span = 1 }) {
  return (
    <div className="card" style={span === 2 ? { gridColumn: 'span 2' } : {}}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span className="section-title" style={{ marginBottom: 0 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, color, label, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={S.toggle}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
        <div style={{ ...S.toggleTrack, background: checked ? color : '#1e293b' }}>
          <div style={{ ...S.toggleThumb, left: checked ? '22px' : '2px' }} />
        </div>
        <span style={{ color: checked ? color : '#64748b', fontWeight: 600 }}>{label}</span>
      </label>
      {sub && <p style={{ fontSize: 11, color: '#475569', marginLeft: 54, marginTop: 0 }}>{sub}</p>}
    </div>
  );
}

function ModuleCard({ value, label, sub, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...S.moduleCard,
        border: active ? `2px solid ${color}` : '2px solid #1e293b',
        background: active ? '#0f172a' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: active ? color : '#1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: active ? '#fff' : '#475569',
        letterSpacing: 0.5,
      }}>
        {value === 'pma'            ? 'PMA' :
         value === 'procurement'    ? 'P2P' :
         value === 'sales'          ? 'O2C' :
         value === 'fixed_assets'   ? 'FA'  :
         value === 'inventory'      ? 'INV' :
         value === 'lease'          ? 'LSE' : 'GL'}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#e2e8f0' : '#94a3b8' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  );
}

function Radio({ name, value, label, sub, current, onChange }) {
  const active = current === value;
  return (
    <label style={{ ...S.radio, ...(active ? S.radioActive : {}) }}>
      <input type="radio" name={name} value={value} checked={active} onChange={() => onChange(value)} style={{ display: 'none' }} />
      <div style={{ ...S.radioDot, ...(active ? S.radioDotActive : {}) }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#e2e8f0' : '#94a3b8' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#475569' }}>{sub}</div>}
      </div>
    </label>
  );
}

const S = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  moduleGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  moduleCard: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    borderRadius: 8, transition: 'all .15s',
  },
  radio: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
    borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', transition: 'all .15s',
  },
  radioActive: { background: '#0f172a', border: '1px solid #3b82f6' },
  radioDot: {
    width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginTop: 2,
    border: '2px solid #334155', background: 'transparent', transition: 'all .15s',
  },
  radioDotActive: { border: '2px solid #3b82f6', background: '#3b82f6' },
  featureDesc: { fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 14 },
  toggle: { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
  toggleTrack: { width: 42, height: 22, borderRadius: 999, position: 'relative', transition: 'background .2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' },
  warn: {
    padding: '8px 12px', background: '#422006', border: '1px solid #854d0e',
    borderRadius: 6, fontSize: 12, color: '#fcd34d',
  },
  summary: { background: '#0d1219', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 20px' },
  summaryTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#475569', textTransform: 'uppercase', marginBottom: 12 },
  summaryRow: { display: 'flex', gap: 32, flexWrap: 'wrap' },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  summaryKey: { fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 },
  summaryVal: { fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
};
