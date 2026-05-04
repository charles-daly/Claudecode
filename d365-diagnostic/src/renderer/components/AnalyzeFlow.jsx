import React, { useState } from 'react';
import ResultsDashboard from './ResultsDashboard';

const STEPS = [
  { n: 1, label: 'Upload',    sub: 'Load your file' },
  { n: 2, label: 'Preview',   sub: 'Review data' },
  { n: 3, label: 'Configure', sub: 'Set options' },
  { n: 4, label: 'Results',   sub: 'View findings' },
];

const MODULES = [
  { value: 'pma',            label: 'Project Mgmt (PMA)',    color: '#8b5cf6' },
  { value: 'procurement',    label: 'Procurement',           color: '#f59e0b' },
  { value: 'sales',          label: 'Sales',                 color: '#22c55e' },
  { value: 'fixed_assets',   label: 'Fixed Assets',          color: '#3b82f6' },
  { value: 'inventory',      label: 'Inventory',             color: '#06b6d4' },
  { value: 'lease',          label: 'Lease (IFRS 16)',        color: '#ec4899' },
  { value: 'general_ledger', label: 'General Ledger',        color: '#94a3b8' },
];

export default function AnalyzeFlow({ step, setStep, importedData, setImportedData, context, setContext, result, isRunning, runError, onRun, mode }) {
  return (
    <div style={S.root}>
      <StepBar step={step} />
      <div style={S.content}>
        {step === 1 && <StepUpload importedData={importedData} setImportedData={setImportedData} onNext={() => setStep(2)} />}
        {step === 2 && <StepPreview importedData={importedData} context={context} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <StepConfigure context={context} setContext={setContext} importedData={importedData} onBack={() => setStep(2)} onRun={onRun} isRunning={isRunning} runError={runError} />}
        {step === 4 && <StepResults result={result} isRunning={isRunning} mode={mode} onBack={() => setStep(3)} onRerun={onRun} />}
      </div>
    </div>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────
function StepBar({ step }) {
  return (
    <div style={S.stepBar}>
      {STEPS.map((s, i) => {
        const done    = s.n < step;
        const current = s.n === step;
        return (
          <React.Fragment key={s.n}>
            {i > 0 && (
              <div style={{ ...S.stepLine, background: done || current ? '#3b82f6' : '#1e293b', flex: 1 }} />
            )}
            <div style={S.stepItem}>
              <div style={{
                ...S.stepCircle,
                background:   done ? '#3b82f6' : current ? '#1d4ed8' : '#1e293b',
                border:       current ? '2px solid #3b82f6' : done ? '2px solid #3b82f6' : '2px solid #334155',
                color:        done || current ? '#fff' : '#475569',
              }}>
                {done ? '✓' : s.n}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: current ? '#e2e8f0' : done ? '#94a3b8' : '#475569' }}>{s.label}</div>
                <div style={{ fontSize: 10, color: '#334155' }}>{s.sub}</div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────
function StepUpload({ importedData, setImportedData, onNext }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [tplMsg,  setTplMsg]  = useState(null);

  const handleImport = async () => {
    if (!window.electronAPI) return;
    setLoading(true); setError(null);
    try {
      const resp = await window.electronAPI.importExcel();
      if (resp.canceled) { setLoading(false); return; }
      if (resp.success) { setImportedData(resp.data); onNext(); }
      else setError(resp.error || 'Could not read the file. Please check the format.');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleSample = async () => {
    if (!window.electronAPI) return;
    setLoading(true); setError(null);
    try {
      const resp = await window.electronAPI.loadSampleData();
      if (resp.success) { setImportedData(resp.data); onNext(); }
      else setError(resp.error);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleDownloadTemplate = async () => {
    if (!window.electronAPI?.downloadTemplate) return;
    setTplMsg(null);
    try {
      const resp = await window.electronAPI.downloadTemplate();
      if (resp?.success)  setTplMsg({ ok: true,  text: 'Template saved.' });
      else if (!resp?.canceled) setTplMsg({ ok: false, text: resp?.error || 'Could not save template.' });
    } catch (e) {
      setTplMsg({ ok: false, text: e.message });
    }
  };

  return (
    <div style={S.stepContent}>
      <StepHeader title="Upload your D365 export" sub="Load a journal entry Excel file exported from Dynamics 365 Finance. Both single-account and dual-GAAP formats are supported." />

      {importedData && (
        <div style={S.alreadyLoaded}>
          <span style={{ color: '#22c55e', fontSize: 18 }}>✓</span>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>File already loaded</span>
          <button onClick={onNext} style={S.nextBtn}>Continue →</button>
        </div>
      )}

      <div style={S.uploadArea}>
        <span style={{ fontSize: 48, marginBottom: 16, display: 'block' }}>📥</span>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6, textAlign: 'center', maxWidth: 420 }}>
          Supports <strong style={{ color: '#e2e8f0' }}>Excel (.xlsx, .xls)</strong> files.
          Column names are auto-detected in English and French.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleImport} disabled={loading} style={S.uploadBtn}>
            {loading ? '⏳ Loading…' : '📂 Open Excel File'}
          </button>
          <button onClick={handleSample} disabled={loading} style={S.sampleBtn}>
            {loading ? '…' : '📋 Load Sample Data'}
          </button>
          <button onClick={handleDownloadTemplate} disabled={loading} style={S.templateBtn}>
            📄 Download Template
          </button>
        </div>
        {tplMsg && (
          <div style={{ marginTop: 10, fontSize: 12, color: tplMsg.ok ? '#22c55e' : '#fca5a5' }}>{tplMsg.text}</div>
        )}
        {error && <div style={S.errorMsg}>{error}</div>}
      </div>

      <div style={S.formatHint}>
        <div style={S.hintLabel}>Supported column names</div>
        <div style={S.hintCols}>
          <HintCol title="Required" items={['Voucher / Bon / N° Document', 'Debit / DR / Débit', 'Credit / CR / Crédit', 'Account / Compte / US_Account']} />
          <HintCol title="Optional" items={['Date', 'Description / Libellé / Text', 'Currency / Devise / CCY', 'ExchangeRate / Rate / Taux']} />
          <HintCol title="Dual-GAAP" items={['US_Account / USGAAP_Account', 'FR_Account / PCG_Account', 'BE_Account / PCMN_Account', 'Module / TransactionType']} />
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: '#334155', borderTop: '1px solid #1e293b', paddingTop: 10 }}>
          Download the template above for a pre-formatted import file with all supported columns and examples.
        </div>
      </div>
    </div>
  );
}

function HintCol({ title, items }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 6 }}>{title}</div>
      {items.map(i => <div key={i} style={{ fontSize: 12, color: '#64748b', marginBottom: 3 }}>{i}</div>)}
    </div>
  );
}

// ── Step 2: Preview ───────────────────────────────────────────────────────────
function StepPreview({ importedData, context, onBack, onNext }) {
  const [activeSheet,  setActiveSheet]  = useState(importedData ? Object.keys(importedData)[0] : null);
  const [previewTab,   setPreviewTab]   = useState('vouchers');

  if (!importedData) return (
    <div style={S.stepContent}>
      <StepHeader title="No data loaded" sub="Please go back and upload a file first." />
      <button onClick={onBack} style={S.backBtn}>← Back</button>
    </div>
  );

  const sheets        = Object.entries(importedData);
  const sheetData     = activeSheet ? importedData[activeSheet] : null;
  const entries       = (sheetData?.entries || []).slice(0, 10);
  const hasMore       = (sheetData?.entries?.length || 0) > 10;
  const totalVouchers = sheets.reduce((s, [, d]) => s + Object.keys(d.vouchers || {}).length, 0);
  const totalEntries  = sheets.reduce((s, [, d]) => s + (d.entries?.length || 0), 0);
  const hasDualGaap   = sheets.some(([, d]) => d.gaapValidation?.isDualGaap);

  const PREVIEW_TABS = [
    { id: 'vouchers', label: 'Vouchers' },
    { id: 'gaap',     label: 'GAAP Analysis' },
    { id: 'fx',       label: 'FX Analysis' },
  ];

  return (
    <div style={S.stepContent}>
      <StepHeader title="Data loaded successfully" sub="Review what was detected in your file before running the analysis." />

      {/* Summary stats */}
      <div style={S.statRow}>
        <StatPill value={sheets.length}  label="Sheets"   color="#3b82f6" />
        <StatPill value={totalVouchers}  label="Vouchers" color="#8b5cf6" />
        <StatPill value={totalEntries}   label="Entries"  color="#22c55e" />
        {hasDualGaap && <StatPill value="Dual GAAP" label="Format" color="#f59e0b" />}
      </div>

      {/* Sheet selector (multiple sheets only) */}
      {sheets.length > 1 && (
        <div style={S.sheetTabs}>
          {sheets.map(([name]) => (
            <button
              key={name}
              onClick={() => setActiveSheet(name)}
              style={{ ...S.sheetTab, ...(activeSheet === name ? S.sheetTabActive : {}) }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Preview tab bar */}
      <div style={S.previewTabBar}>
        {PREVIEW_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setPreviewTab(t.id)}
            style={{ ...S.previewTab, ...(previewTab === t.id ? S.previewTabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vouchers tab */}
      {previewTab === 'vouchers' && (
        entries.length > 0 ? (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr style={{ background: '#0d1219' }}>
                  {['Voucher', 'Date', 'Account', 'Description', 'Debit', 'Credit', 'Currency'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#12171f' : '#0f1419' }}>
                    <td style={{ ...S.td, fontWeight: 600, color: '#94a3b8' }}>{e.voucher}</td>
                    <td style={S.td}>{e.date || '–'}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', color: '#60a5fa' }}>{e.account || e.usAccount}</td>
                    <td style={{ ...S.td, color: '#64748b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '–'}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: e.debit > 0 ? '#e2e8f0' : '#334155' }}>{e.debit > 0 ? e.debit.toLocaleString() : ''}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: e.credit > 0 ? '#e2e8f0' : '#334155' }}>{e.credit > 0 ? e.credit.toLocaleString() : ''}</td>
                    <td style={S.td}>{e.currency || 'EUR'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div style={{ padding: '8px 12px', fontSize: 11, color: '#334155', textAlign: 'center' }}>
                … and {(sheetData.entries.length - 10).toLocaleString()} more entries
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#475569' }}>No entries in this sheet.</div>
        )
      )}

      {/* GAAP Analysis tab */}
      {previewTab === 'gaap' && (
        <GaapAnalysisPreview sheetData={sheetData} />
      )}

      {/* FX Analysis tab */}
      {previewTab === 'fx' && (
        <FxPreview importedData={importedData} accountingCurrency={context?.accountingCurrency || 'EUR'} />
      )}

      <div style={S.navRow}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <button onClick={onNext} style={S.nextBtn}>Continue to Configure →</button>
      </div>
    </div>
  );
}

// ── GAAP Analysis preview (Step 2) ────────────────────────────────────────────
function GaapAnalysisPreview({ sheetData }) {
  const gaap = sheetData?.gaapValidation;
  if (!gaap) return (
    <div style={{ padding: '24px 0', color: '#475569', fontSize: 13 }}>
      No GAAP validation data available. Run the full analysis for complete results.
    </div>
  );

  const { isDualGaap, mappingCoverage, unmappedAccounts = [], issues = [] } = gaap;
  const coveragePct = Math.round((mappingCoverage || 0) * 100);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatPill value={isDualGaap ? 'Dual' : 'Single'} label="GAAP Format"        color={isDualGaap ? '#f59e0b' : '#3b82f6'} />
        <StatPill value={`${coveragePct}%`}              label="Mapping Coverage"    color={coveragePct >= 90 ? '#22c55e' : coveragePct >= 70 ? '#f59e0b' : '#ef4444'} />
        <StatPill value={unmappedAccounts.length}        label="Unmapped Accounts"   color={unmappedAccounts.length > 0 ? '#f97316' : '#64748b'} />
        <StatPill value={issues.length}                  label="Pre-check Issues"    color={issues.length > 0 ? '#ef4444' : '#22c55e'} />
      </div>

      {unmappedAccounts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>
            Unmapped Accounts
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {unmappedAccounts.map(acc => (
              <span key={acc} style={{ padding: '3px 10px', background: '#431407', border: '1px solid #f9731633', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, color: '#fb923c' }}>
                {acc}
              </span>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>
            Pre-check Issues
          </div>
          {issues.map((iss, i) => (
            <div key={i} style={{ padding: '8px 12px', background: '#12171f', border: '1px solid #1e293b', borderRadius: 6, marginBottom: 6, fontSize: 13, color: '#94a3b8' }}>
              {typeof iss === 'string' ? iss : (iss.message || JSON.stringify(iss))}
            </div>
          ))}
        </div>
      )}

      {unmappedAccounts.length === 0 && issues.length === 0 && (
        <div style={{ padding: '24px', background: '#061212', border: '1px solid #14532d', borderRadius: 8, textAlign: 'center', color: '#22c55e', fontSize: 13 }}>
          ✓ All accounts mapped — no pre-check issues
        </div>
      )}
    </div>
  );
}

// ── FX preview (Step 2) ───────────────────────────────────────────────────────
function FxPreview({ importedData, accountingCurrency }) {
  const ACC = accountingCurrency || 'EUR';
  const fxLines = [];

  if (importedData) {
    Object.entries(importedData).forEach(([, sheetData]) => {
      (sheetData.entries || []).forEach(e => {
        const ccy    = e.currency || ACC;
        const rate   = typeof e.exchangeRate === 'number' ? e.exchangeRate : 1;
        const amount = (e.debit || 0) + (e.credit || 0);
        if (ccy !== ACC || Math.abs(rate - 1) > 0.0001) {
          fxLines.push({
            voucher: e.voucher,
            account: e.account || e.usAccount || '—',
            currency: ccy,
            rate,
            amount,
            converted: amount * rate,
            fxDiff:    amount * rate - amount,
          });
        }
      });
    });
  }

  if (fxLines.length === 0) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: '#475569' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
      <div>No foreign currency entries detected.</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>All entries are in {ACC}.</div>
    </div>
  );

  const totalFxDiff = fxLines.reduce((s, l) => s + l.fxDiff, 0);

  return (
    <div>
      <div style={{ marginBottom: 12, padding: '10px 14px', background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 8, fontSize: 13, color: '#94a3b8' }}>
        {fxLines.length} foreign currency line{fxLines.length !== 1 ? 's' : ''} · Total FX impact:{' '}
        <span style={{ color: Math.abs(totalFxDiff) > 0.01 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>
          {totalFxDiff >= 0 ? '+' : ''}{totalFxDiff.toLocaleString('en', { maximumFractionDigits: 2 })} {ACC}
        </span>
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr style={{ background: '#0d1219' }}>
              {['Voucher', 'Account', 'CCY', 'Rate', 'Original Amt', `Converted (${ACC})`, 'FX Diff'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fxLines.map((l, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#12171f' : '#0f1419' }}>
                <td style={{ ...S.td, fontWeight: 600, color: '#94a3b8' }}>{l.voucher}</td>
                <td style={{ ...S.td, fontFamily: 'monospace', color: '#60a5fa' }}>{l.account}</td>
                <td style={{ ...S.td, fontWeight: 700, color: '#f59e0b' }}>{l.currency}</td>
                <td style={{ ...S.td, fontFamily: 'monospace', textAlign: 'right' }}>{l.rate.toFixed(4)}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{l.amount.toLocaleString('en', { maximumFractionDigits: 2 })}</td>
                <td style={{ ...S.td, textAlign: 'right', color: '#e2e8f0' }}>{l.converted.toLocaleString('en', { maximumFractionDigits: 2 })}</td>
                <td style={{ ...S.td, textAlign: 'right', color: Math.abs(l.fxDiff) > 0.005 ? '#f59e0b' : '#475569' }}>
                  {l.fxDiff >= 0 ? '+' : ''}{l.fxDiff.toLocaleString('en', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step 3: Configure ─────────────────────────────────────────────────────────
function StepConfigure({ context, setContext, importedData, onBack, onRun, isRunning, runError }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = (k, v) => setContext(p => ({ ...p, [k]: v }));

  const activeModule = MODULES.find(m => m.value === context.module) || MODULES[0];

  return (
    <div style={S.stepContent}>
      <StepHeader
        title="Configure the analysis"
        sub="Choose the D365 module being analyzed. The engine loads the correct accounting rules automatically."
      />

      {/* Module picker */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Which module are these entries from?</FieldLabel>
        <div style={S.moduleGrid}>
          {MODULES.map(m => (
            <button
              key={m.value}
              onClick={() => set('module', m.value)}
              style={{
                ...S.moduleBtn,
                border: `2px solid ${context.module === m.value ? m.color : '#1e293b'}`,
                background: context.module === m.value ? m.color + '15' : '#1a1f2e',
                color: context.module === m.value ? m.color : '#64748b',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* GAAP selector */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Accounting framework</FieldLabel>
        <div style={S.optRow}>
          {[
            { v: 'french_gaap', l: 'French GAAP',            s: 'Plan Comptable Général (PCG)' },
            { v: 'us_gaap',     l: 'US GAAP',                s: 'ASC 842 / ASC 360' },
            { v: 'dual_gaap',   l: 'Dual reporting',         s: 'French statutory + IFRS layer' },
          ].map(({ v, l, s }) => (
            <OptCard
              key={v} value={v} label={l} sub={s}
              active={context.gaap === v} color="#3b82f6"
              onClick={() => set('gaap', v)}
            />
          ))}
        </div>
      </div>

      {/* Accounting currency */}
      <div style={{ marginBottom: 24 }}>
        <FieldLabel>Ledger currency</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {['EUR', 'USD', 'GBP', 'CHF', 'JPY'].map(c => (
            <button
              key={c}
              onClick={() => set('accountingCurrency', c)}
              style={{
                ...S.ccyBtn,
                border: (context.accountingCurrency || 'EUR') === c ? '2px solid #a78bfa' : '2px solid #1e293b',
                background: (context.accountingCurrency || 'EUR') === c ? '#1e1533' : '#1a1f2e',
                color: (context.accountingCurrency || 'EUR') === c ? '#a78bfa' : '#64748b',
              }}
            >{c}</button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button onClick={() => setShowAdvanced(p => !p)} style={S.advancedToggle}>
        {showAdvanced ? '▲' : '▼'} Advanced options (PMA, project accrual)
      </button>
      {showAdvanced && (
        <div style={S.advancedPanel}>
          <div style={{ marginBottom: 16 }}>
            <FieldLabel>PMA — French provision (Amortissement Dérogatoire)</FieldLabel>
            <label style={S.toggleLabel}>
              <input
                type="checkbox"
                checked={context.pma || false}
                onChange={e => set('pma', e.target.checked)}
                style={{ accentColor: '#3b82f6', width: 16, height: 16 }}
              />
              <span style={{ color: context.pma ? '#60a5fa' : '#64748b', fontWeight: 600 }}>
                {context.pma ? 'Active — engine will flag missing PMA entries' : 'Inactive'}
              </span>
            </label>
          </div>
          {context.module === 'pma' && (
            <div>
              <FieldLabel>Project group accrual (auto-reversal)</FieldLabel>
              <label style={S.toggleLabel}>
                <input
                  type="checkbox"
                  checked={context.projectGroup?.accrualEnabled || false}
                  onChange={e => setContext(p => ({ ...p, projectGroup: { ...p.projectGroup, accrualEnabled: e.target.checked } }))}
                  style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                />
                <span style={{ color: context.projectGroup?.accrualEnabled ? '#a78bfa' : '#64748b', fontWeight: 600 }}>
                  {context.projectGroup?.accrualEnabled ? 'Enabled — deep accrual pattern analysis' : 'Disabled'}
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {runError && <div style={S.errorMsg}>{runError}</div>}

      <div style={S.navRow}>
        <button onClick={onBack} style={S.backBtn}>← Back</button>
        <button onClick={onRun} disabled={isRunning} style={{ ...S.primaryBtn, opacity: isRunning ? .65 : 1 }}>
          {isRunning ? '⏳  Analyzing…' : `▶  Analyze ${importedData ? 'Vouchers' : 'Now'}`}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Results ───────────────────────────────────────────────────────────
function StepResults({ result, isRunning, mode, onBack, onRerun }) {
  if (isRunning) {
    return (
      <div style={S.stepContent}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚙</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>Analyzing your data…</div>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>This usually takes a few seconds</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div style={S.stepContent}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8' }}>No results yet</div>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 8, marginBottom: 24 }}>Go back to configure and run the analysis.</p>
          <button onClick={onBack} style={S.backBtn}>← Go to Configure</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.stepContent}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: '0 0 4px' }}>Analysis Results</h2>
          <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{new Date(result.timestamp).toLocaleString()}</p>
        </div>
        <button onClick={onRerun} style={S.rerunBtn}>↻ Re-analyze</button>
      </div>
      <ResultsDashboard result={result} mode={mode} />
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function StepHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: '0 0 8px' }}>{title}</h2>
      <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.6, maxWidth: 560 }}>{sub}</p>
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 10 }}>{children}</div>;
}

function StatPill({ value, label, color }) {
  return (
    <div style={{ ...S.statPill, borderColor: color + '44' }}>
      <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
    </div>
  );
}

function OptCard({ value, label, sub, active, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      ...S.optCard,
      border: `2px solid ${active ? color : '#1e293b'}`,
      background: active ? color + '15' : '#1a1f2e',
      cursor: 'pointer',
    }}>
      <div style={{ ...S.optDot, background: active ? color : '#334155' }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#e2e8f0' : '#94a3b8' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#475569' }}>{sub}</div>}
      </div>
    </div>
  );
}

const S = {
  root:    { maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' },
  content: {},

  stepBar:    { display: 'flex', alignItems: 'center', marginBottom: 40, padding: '20px 0 24px', borderBottom: '1px solid #1e293b' },
  stepItem:   { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  stepCircle: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  stepLine:   { height: 2, minWidth: 24 },

  stepContent: {},
  navRow:   { display: 'flex', alignItems: 'center', gap: 12, marginTop: 32, paddingTop: 24, borderTop: '1px solid #1e293b' },
  backBtn:  { padding: '9px 18px', background: '#1a1f2e', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  nextBtn:  { padding: '9px 22px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  primaryBtn: { padding: '10px 28px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  rerunBtn:   { padding: '7px 16px', background: '#1a1f2e', border: '1px solid #334155', borderRadius: 7, color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' },

  alreadyLoaded: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#052e16', border: '1px solid #16a34a', borderRadius: 8, marginBottom: 20 },

  uploadArea: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '48px 24px', background: '#12171f', border: '2px dashed #1e293b', borderRadius: 12, marginBottom: 24,
  },
  uploadBtn:   { padding: '12px 28px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  sampleBtn:   { padding: '12px 20px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  templateBtn: { padding: '12px 20px', background: '#0d1219', border: '1px solid #334155', borderRadius: 8, color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  errorMsg:    { padding: '10px 14px', background: '#2d0b0b', border: '1px solid #ef4444', borderRadius: 6, color: '#fca5a5', fontSize: 13, marginTop: 12 },

  previewTabBar:    { display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #1e293b' },
  previewTab:       { padding: '7px 16px', background: 'none', border: 'none', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1, transition: 'all .15s' },
  previewTabActive: { color: '#e2e8f0', borderBottomColor: '#3b82f6' },

  formatHint: { padding: '20px', background: '#0d1219', border: '1px solid #1e293b', borderRadius: 10 },
  hintLabel:  { fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  hintCols:   { display: 'flex', gap: 32, flexWrap: 'wrap' },

  statRow:  { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  statPill: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 20px', background: '#1a1f2e', border: '1px solid', borderRadius: 10, minWidth: 90 },

  sheetTabs:      { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b' },
  sheetTab:       { padding: '7px 16px', background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1 },
  sheetTabActive: { color: '#e2e8f0', borderBottomColor: '#3b82f6' },

  tableWrap: { border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:        { padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .6, whiteSpace: 'nowrap' },
  td:        { padding: '7px 12px', color: '#94a3b8', borderTop: '1px solid #1a1f2e', whiteSpace: 'nowrap' },

  moduleGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 },
  moduleBtn:  { padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all .15s' },
  optRow:     { display: 'flex', gap: 10, flexWrap: 'wrap' },
  optCard:    { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 8, flex: 1, minWidth: 160, transition: 'all .15s' },
  optDot:     { width: 14, height: 14, borderRadius: '50%', marginTop: 3, flexShrink: 0 },
  ccyBtn:     { padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' },
  advancedToggle: { background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', padding: '8px 0', textDecoration: 'underline dotted', marginBottom: 4 },
  advancedPanel:  { background: '#0d1219', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 20px', marginBottom: 16 },
  toggleLabel:    { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
};
