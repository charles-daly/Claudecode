import React, { useState, useEffect, useCallback } from 'react';

const ACCOUNT_TYPES = [
  'Asset', 'Liability', 'Revenue', 'Cost', 'COGS', 'Expense',
  'Receivable', 'Payable', 'Accrual', 'Depreciation', 'Accumulated Depreciation',
  'Interest', 'Inventory', 'Equity', 'Other',
];

const MODULES = [
  { value: '',               label: '— All modules —' },
  { value: 'pma',            label: 'PMA' },
  { value: 'procurement',    label: 'Procurement' },
  { value: 'sales',          label: 'Sales' },
  { value: 'fixed_assets',   label: 'Fixed Assets' },
  { value: 'inventory',      label: 'Inventory' },
  { value: 'lease',          label: 'Lease' },
  { value: 'general_ledger', label: 'General Ledger' },
];

const BLANK_FORM = { usAccount: '', frAccount: '', type: '', description: '', module: '' };

export default function GaapMapping() {
  const [mappings,    setMappings]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [filterMod,   setFilterMod]   = useState('');
  const [filterType,  setFilterType]  = useState('');
  const [filterText,  setFilterText]  = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [form,        setForm]        = useState(BLANK_FORM);
  const [formErrors,  setFormErrors]  = useState([]);
  const [saving,      setSaving]      = useState(false);
  const [deleteId,    setDeleteId]    = useState(null);
  const [toast,       setToast]       = useState(null);

  const showToast = useCallback((msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await window.electronAPI.gaapGetAll();
      if (resp.success) {
        setMappings(resp.mappings);
      } else {
        setError(resp.error || 'Failed to load mappings');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditId(null);
    setForm(BLANK_FORM);
    setFormErrors([]);
    setShowForm(true);
  };

  const openEdit = (m) => {
    setEditId(m.id);
    setForm({ usAccount: m.usAccount, frAccount: m.frAccount, type: m.type, description: m.description || '', module: m.module || '' });
    setFormErrors([]);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(BLANK_FORM);
    setFormErrors([]);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormErrors([]);
    try {
      let resp;
      if (editId) {
        resp = await window.electronAPI.gaapUpdate(editId, form);
      } else {
        resp = await window.electronAPI.gaapAdd(form);
      }
      if (resp.success) {
        showToast(editId ? 'Mapping updated.' : 'Mapping added.');
        closeForm();
        load();
      } else {
        setFormErrors(resp.errors || ['Unknown error']);
      }
    } catch (e) {
      setFormErrors([e.message]);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const resp = await window.electronAPI.gaapDelete(id);
      if (resp.success) {
        showToast('Mapping deleted.');
        setDeleteId(null);
        load();
      } else {
        showToast((resp.errors || ['Delete failed']).join(', '), false);
      }
    } catch (e) {
      showToast(e.message, false);
    }
  };

  // ── Filtered view ──────────────────────────────────────────────────────────
  const visible = mappings.filter(m => {
    if (filterMod  && m.module !== filterMod)   return false;
    if (filterType && m.type   !== filterType)   return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      if (![m.usAccount, m.frAccount, m.description, m.type].some(v => (v || '').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative' }}>
      {/* Toast */}
      {toast && (
        <div style={{ ...S.toast, background: toast.ok ? '#15803d' : '#b91c1c' }}>
          {toast.ok ? '✓' : '✗'} {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>GAAP Mapping</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Manage US GAAP ↔ French PCG account mappings. Used by the diagnostic engine to detect cross-GAAP mismatches and provide traceability.
          </p>
        </div>
        <button style={S.addBtn} onClick={openAdd}>+ Add Mapping</button>
      </div>

      {/* Stats strip */}
      <div style={S.statsStrip}>
        <div style={S.stat}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{mappings.length}</span>
          <span style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 }}>Total Mappings</span>
        </div>
        {['pma','procurement','sales','fixed_assets','inventory','lease','general_ledger'].map(mod => {
          const n = mappings.filter(m => m.module === mod).length;
          if (!n) return null;
          return (
            <div key={mod} style={S.stat}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8' }}>{n}</span>
              <span style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: .5 }}>{mod.replace('_',' ')}</span>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input
          style={S.filterInput}
          placeholder="Search accounts or description…"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
        />
        <select style={S.filterSelect} value={filterMod} onChange={e => setFilterMod(e.target.value)}>
          {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select style={S.filterSelect} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">— All types —</option>
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterText || filterMod || filterType) && (
          <button style={S.clearBtn} onClick={() => { setFilterText(''); setFilterMod(''); setFilterType(''); }}>✕ Clear</button>
        )}
        <span style={{ fontSize: 12, color: '#475569', marginLeft: 'auto' }}>
          {visible.length} of {mappings.length} mappings
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={S.center}><div style={{ color: '#475569' }}>Loading mappings…</div></div>
      ) : error ? (
        <div style={S.center}><div style={{ color: '#ef4444' }}>⚠ {error}</div></div>
      ) : visible.length === 0 ? (
        <div style={S.center}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗂</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
            {mappings.length === 0 ? 'No mappings yet' : 'No results match the filter'}
          </div>
          {mappings.length === 0 && (
            <button style={S.addBtn} onClick={openAdd}>+ Add First Mapping</button>
          )}
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0d1219' }}>
                <Th>ID</Th>
                <Th>US GAAP Account</Th>
                <Th>↔</Th>
                <Th>French PCG Account</Th>
                <Th>Type</Th>
                <Th>Description</Th>
                <Th>Module</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => (
                <tr
                  key={m.id}
                  style={S.tr}
                  onMouseEnter={e => e.currentTarget.style.background = '#1a1f2e'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ ...S.td, color: '#475569', fontFamily: 'monospace' }}>{m.id}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>{m.usAccount}</td>
                  <td style={{ ...S.td, color: '#334155', textAlign: 'center' }}>↔</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#34d399', fontFamily: 'monospace' }}>{m.frAccount}</td>
                  <td style={S.td}>
                    <span style={S.typeBadge}>{m.type}</span>
                  </td>
                  <td style={{ ...S.td, color: '#94a3b8', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.description || '—'}
                  </td>
                  <td style={{ ...S.td, color: '#64748b' }}>{m.module || '—'}</td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <button style={S.editBtn} onClick={() => openEdit(m)}>Edit</button>
                    {deleteId === m.id ? (
                      <>
                        <button style={{ ...S.confirmBtn, marginLeft: 4 }} onClick={() => handleDelete(m.id)}>Confirm</button>
                        <button style={{ ...S.cancelBtn,  marginLeft: 4 }} onClick={() => setDeleteId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={{ ...S.deleteBtn, marginLeft: 4 }} onClick={() => setDeleteId(m.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit form modal */}
      {showForm && (
        <div style={S.overlay} onClick={closeForm}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                {editId ? 'Edit Mapping' : 'Add New Mapping'}
              </h2>
              <button style={S.closeBtn} onClick={closeForm}>✕</button>
            </div>

            {formErrors.length > 0 && (
              <div style={S.errBox}>
                {formErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}

            <div style={S.formGrid}>
              <FormField label="US GAAP Account *" hint="e.g. 110000">
                <input
                  style={S.inp}
                  value={form.usAccount}
                  onChange={e => setForm(f => ({ ...f, usAccount: e.target.value }))}
                  placeholder="110000"
                />
              </FormField>
              <FormField label="French PCG Account *" hint="e.g. 411">
                <input
                  style={S.inp}
                  value={form.frAccount}
                  onChange={e => setForm(f => ({ ...f, frAccount: e.target.value }))}
                  placeholder="411"
                />
              </FormField>
              <FormField label="Account Type *" hint="Classification">
                <select
                  style={S.inp}
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="">— Select type —</option>
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Module" hint="Optional">
                <select
                  style={S.inp}
                  value={form.module}
                  onChange={e => setForm(f => ({ ...f, module: e.target.value }))}
                >
                  {MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </FormField>
              <FormField label="Description" hint="Optional — full row" fullWidth>
                <input
                  style={S.inp}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Trade accounts receivable"
                />
              </FormField>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={S.cancelFormBtn} onClick={closeForm} disabled={saving}>Cancel</button>
              <button style={{ ...S.addBtn, opacity: saving ? .65 : 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: '#475569', borderBottom: '1px solid #1e293b' }}>
      {children}
    </th>
  );
}

function FormField({ label, hint, children, fullWidth }) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 5 }}>
        {label} {hint && <span style={{ fontWeight: 400, color: '#334155', textTransform: 'none' }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

const S = {
  addBtn: { padding: '9px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  statsStrip: { display: 'flex', gap: 20, flexWrap: 'wrap', background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 20px', marginBottom: 16, alignItems: 'center' },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 },
  filters: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  filterInput: { flex: 1, minWidth: 180, background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 6, color: '#e2e8f0', padding: '7px 10px', fontSize: 12, outline: 'none' },
  filterSelect: { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 6, color: '#94a3b8', padding: '7px 8px', fontSize: 12, outline: 'none' },
  clearBtn: { background: 'none', border: '1px solid #334155', borderRadius: 5, color: '#64748b', padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  tableWrap: { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, overflow: 'auto' },
  tr: { borderBottom: '1px solid #1e293b', transition: 'background .1s', cursor: 'default' },
  td: { padding: '9px 10px', verticalAlign: 'middle', color: '#e2e8f0' },
  typeBadge: { display: 'inline-block', fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#334155', color: '#94a3b8', fontWeight: 600 },
  editBtn: { background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#94a3b8', padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #450a0a', borderRadius: 4, color: '#ef4444', padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  confirmBtn: { background: '#b91c1c', border: 'none', borderRadius: 4, color: '#fff', padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 },
  cancelBtn: { background: 'none', border: '1px solid #334155', borderRadius: 4, color: '#64748b', padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 40px', color: '#64748b', gap: 8 },
  toast: { position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '10px 18px', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px #0008' },
  overlay: { position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#1a1f2e', border: '1px solid #334155', borderRadius: 12, padding: '24px', width: 560, maxWidth: '95vw', boxShadow: '0 8px 40px #000c' },
  closeBtn: { background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', padding: '0 4px' },
  errBox: { background: '#450a0a', border: '1px solid #b91c1c', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#fca5a5', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' },
  inp: { width: '100%', background: '#0f1117', border: '1px solid #334155', borderRadius: 6, color: '#e2e8f0', padding: '8px 10px', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  cancelFormBtn: { padding: '9px 18px', background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
};
