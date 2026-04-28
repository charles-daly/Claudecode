import React from 'react';

export default function ContextSelector({ context, setContext }) {
  const set = (key, value) => setContext(prev => ({ ...prev, [key]: value }));

  return (
    <div>
      <PageTitle title="Diagnostic Context" sub="Define the module, country, GAAP framework, and PMA toggle. All diagnostic rules will adapt accordingly." />

      <div style={S.grid}>
        {/* Module */}
        <FieldCard title="Module" icon="⚙">
          <Radio name="module" value="lease"        label="Lease"        sub="IFRS 16 / ASC 842"  current={context.module} onChange={v => set('module', v)} />
          <Radio name="module" value="fixed_assets" label="Fixed Assets" sub="IAS 16 / ASC 360"   current={context.module} onChange={v => set('module', v)} />
        </FieldCard>

        {/* Country */}
        <FieldCard title="Country" icon="🌍">
          <Radio name="country" value="FR" label="France" sub="French PCG accounts" current={context.country} onChange={v => set('country', v)} />
          <Radio name="country" value="US" label="United States" sub="US D365 chart of accounts" current={context.country} onChange={v => set('country', v)} />
        </FieldCard>

        {/* GAAP */}
        <FieldCard title="GAAP Framework" icon="📚">
          <Radio name="gaap" value="french_gaap" label="French GAAP" sub="Plan Comptable Général (PCG)"              current={context.gaap} onChange={v => set('gaap', v)} />
          <Radio name="gaap" value="us_gaap"     label="US GAAP"     sub="ASC 842 / ASC 360"                         current={context.gaap} onChange={v => set('gaap', v)} />
          <Radio name="gaap" value="dual_gaap"   label="Dual GAAP"   sub="French statutory + IFRS reporting layer"   current={context.gaap} onChange={v => set('gaap', v)} />
        </FieldCard>

        {/* PMA Toggle */}
        <FieldCard title="PMA – Provision pour Mise en Amortissement" icon="🇫🇷">
          <p style={S.pmaDesc}>
            French regulatory feature requiring a provision entry (68725 DR / 1510 CR) alongside standard
            depreciation. Only applicable under French GAAP with certain asset types.
          </p>
          <label style={S.toggle}>
            <input
              type="checkbox"
              checked={context.pma}
              onChange={e => set('pma', e.target.checked)}
              style={{ display: 'none' }}
            />
            <div style={{ ...S.toggleTrack, background: context.pma ? '#3b82f6' : '#1e293b' }}>
              <div style={{ ...S.toggleThumb, left: context.pma ? '22px' : '2px' }} />
            </div>
            <span style={{ color: context.pma ? '#3b82f6' : '#64748b', fontWeight: 600 }}>
              {context.pma ? 'PMA Active' : 'PMA Inactive'}
            </span>
          </label>
          {context.gaap !== 'french_gaap' && context.pma && (
            <div style={S.warn}>⚠ PMA is a French GAAP feature. Set GAAP to French GAAP for full rule coverage.</div>
          )}
        </FieldCard>
      </div>

      {/* Summary card */}
      <div style={S.summary}>
        <div style={S.summaryTitle}>Active Configuration</div>
        <div style={S.summaryRow}>
          {[
            ['Module',  context.module === 'lease' ? 'Lease (IFRS 16)' : 'Fixed Assets'],
            ['Country', context.country],
            ['GAAP',    context.gaap.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())],
            ['PMA',     context.pma ? 'Enabled' : 'Disabled'],
          ].map(([k, v]) => (
            <div key={k} style={S.summaryItem}>
              <span style={S.summaryKey}>{k}</span>
              <span style={S.summaryVal}>{v}</span>
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
      <p style={{ fontSize: 13, color: '#64748b', maxWidth: 600 }}>{sub}</p>
    </div>
  );
}

function FieldCard({ title, icon, children }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span className="section-title" style={{ marginBottom: 0 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
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
  pmaDesc: { fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 14 },
  toggle: { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
  toggleTrack: { width: 42, height: 22, borderRadius: 999, position: 'relative', transition: 'background .2s', flexShrink: 0 },
  toggleThumb: {
    position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
    background: '#fff', transition: 'left .2s',
  },
  warn: {
    marginTop: 10, padding: '8px 12px', background: '#422006', border: '1px solid #854d0e',
    borderRadius: 6, fontSize: 12, color: '#fcd34d',
  },
  summary: {
    background: '#0d1219', border: '1px solid #1e293b', borderRadius: 10, padding: '16px 20px',
  },
  summaryTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#475569', textTransform: 'uppercase', marginBottom: 12 },
  summaryRow: { display: 'flex', gap: 32, flexWrap: 'wrap' },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  summaryKey: { fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 },
  summaryVal: { fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
};
