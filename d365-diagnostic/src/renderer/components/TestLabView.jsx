'use strict';

import React, { useState, useEffect } from 'react';

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#0f1117', color: '#e2e8f0', fontFamily: 'monospace',
  },
  header: {
    padding: '16px 24px', borderBottom: '1px solid #1e2535', background: '#141824',
  },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#7dd3fc' },
  headerSub: { margin: '4px 0 0', fontSize: 12, color: '#64748b' },

  body: { flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 },

  // Stepper
  stepperRow: { display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 },
  stepCircle: {
    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
    border: '2px solid #2d3748', background: '#0f1117', color: '#475569',
  },
  stepCircleActive: { borderColor: '#2563eb', background: '#1e3a5f', color: '#7dd3fc' },
  stepCircleDone:   { borderColor: '#166534', background: '#14532d', color: '#4ade80' },
  stepLine: { flex: 1, height: 2, background: '#1e2535' },
  stepLineDone: { background: '#166534' },
  stepLabel: { position: 'absolute', top: 32, fontSize: 10, color: '#475569', whiteSpace: 'nowrap', transform: 'translateX(-50%)' },

  // Cards
  card: {
    background: '#141824', border: '1px solid #1e2535', borderRadius: 8,
    padding: '16px 20px',
  },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 14 },

  // Form controls
  formRow: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 160 },
  label: { fontSize: 11, color: '#64748b', fontWeight: 600 },
  select: {
    background: '#1e2535', border: '1px solid #2d3748', borderRadius: 4,
    color: '#e2e8f0', padding: '7px 10px', fontSize: 12, fontFamily: 'monospace',
    outline: 'none',
  },
  input: {
    background: '#1e2535', border: '1px solid #2d3748', borderRadius: 4,
    color: '#e2e8f0', padding: '7px 10px', fontSize: 12, fontFamily: 'monospace',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },

  // Template grid
  templateGrid: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  templateCard: {
    flex: '1 1 200px', background: '#1a2030', border: '1px solid #2d3748',
    borderRadius: 6, padding: '10px 14px', cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  templateCardActive: { borderColor: '#2563eb', background: '#1e3a5f' },
  templateName: { fontSize: 12, fontWeight: 700, color: '#7dd3fc', marginBottom: 4 },
  templateDesc: { fontSize: 11, color: '#64748b' },

  // Issue chips
  issueChipRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  issueChip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
    borderRadius: 12, fontSize: 11, background: '#1e3a5f', color: '#7dd3fc',
    border: '1px solid #2563eb44',
  },
  removeChip: {
    background: 'none', border: 'none', cursor: 'pointer', color: '#475569',
    fontSize: 12, padding: 0, lineHeight: 1,
  },

  // Nav buttons
  btnRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  btn: {
    padding: '9px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
  },
  btnPrimary: { background: '#2563eb', color: '#fff' },
  btnSecondary: { background: '#1e2535', color: '#94a3b8', border: '1px solid #2d3748' },
  btnSuccess: { background: '#166534', color: '#4ade80', border: '1px solid #4ade8044' },
  btnDanger: { background: '#7f1d1d', color: '#f87171', border: '1px solid #f8717144' },

  // Results
  resultCard: {
    background: '#141824', border: '1px solid #1e2535', borderRadius: 8,
    padding: '16px 20px',
  },
  passLabel: { color: '#4ade80', fontWeight: 700 },
  failLabel: { color: '#f87171', fontWeight: 700 },
  assertRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0',
    borderBottom: '1px solid #12192e', fontSize: 12,
  },
  assertIcon: { flexShrink: 0, marginTop: 1 },

  // Table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '7px 12px', textAlign: 'left', borderBottom: '1px solid #1e2535', color: '#64748b', fontSize: 11 },
  td: { padding: '6px 12px', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },

  summaryRow: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  summaryCard: {
    background: '#0f1117', border: '1px solid #1e2535', borderRadius: 6,
    padding: '10px 16px', minWidth: 100,
  },
  summaryLabel: { fontSize: 10, color: '#64748b', marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: 700, fontFamily: 'monospace' },

  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: 40, color: '#334155',
  },
  emptyIcon: { fontSize: 40 },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULES    = ['gl', 'ap', 'ar', 'fa', 'pma', 'inventory'];
const GAAPS      = ['us_gaap', 'french_gaap', 'belgium_gaap'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'JPY', 'CAD'];
const GAAP_LABELS = { us_gaap: 'US GAAP', french_gaap: 'French PCG', belgium_gaap: 'Belgian PCMN' };
const STATUSES = ['pass', 'fail', 'warning'];

const STEP_LABELS = ['Template', 'Config', 'Expected', 'Generate', 'Run'];

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ step }) {
  return (
    <div style={S.stepperRow}>
      {STEP_LABELS.map((label, i) => {
        const idx = i + 1;
        const active = step === idx;
        const done   = step > idx;
        return (
          <React.Fragment key={label}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ ...S.stepCircle, ...(done ? S.stepCircleDone : active ? S.stepCircleActive : {}) }}>
                {done ? '✓' : idx}
              </div>
              <span style={{ position: 'absolute', top: 34, fontSize: 10, color: active ? '#7dd3fc' : done ? '#4ade80' : '#475569', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div style={{ ...S.stepLine, ...(done ? S.stepLineDone : {}) }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step 1: Template selector ────────────────────────────────────────────────

function StepTemplate({ templates, selected, onSelect }) {
  if (!templates || templates.length === 0) {
    return <div style={{ color: '#475569', fontSize: 12 }}>Loading templates…</div>;
  }
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Choose a Scenario Template</div>
      <div style={S.templateGrid}>
        {templates.map(t => (
          <div
            key={t.key}
            style={{ ...S.templateCard, ...(selected === t.key ? S.templateCardActive : {}) }}
            onClick={() => onSelect(t)}
          >
            <div style={S.templateName}>{t.label}</div>
            <div style={S.templateDesc}>{t.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Config ───────────────────────────────────────────────────────────

function StepConfig({ config, onChange }) {
  const set = (key, val) => onChange({ ...config, [key]: val });
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Configure Test Parameters</div>
      <div style={S.formRow}>
        <div style={S.formGroup}>
          <label style={S.label}>Module</label>
          <select style={S.select} value={config.module || 'gl'} onChange={e => set('module', e.target.value)}>
            {MODULES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Primary GAAP</label>
          <select style={S.select} value={config.gaap || 'us_gaap'} onChange={e => set('gaap', e.target.value)}>
            {GAAPS.map(g => <option key={g} value={g}>{GAAP_LABELS[g]}</option>)}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Currency</label>
          <select style={S.select} value={config.currency || 'EUR'} onChange={e => set('currency', e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={S.formRow}>
        <div style={S.formGroup}>
          <label style={S.label}>Test Name</label>
          <input style={S.input} value={config.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. AP Payable Mapping Validation" />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Company</label>
          <input style={S.input} value={config.company || ''} onChange={e => set('company', e.target.value)} placeholder="e.g. USMF" />
        </div>
      </div>
      <div style={{ ...S.formGroup, marginTop: 4 }}>
        <label style={S.label}>Description (optional)</label>
        <textarea
          style={{ ...S.input, height: 60, resize: 'vertical' }}
          value={config.description || ''}
          onChange={e => set('description', e.target.value)}
          placeholder="Describe the test scenario…"
        />
      </div>
    </div>
  );
}

// ─── Step 3: Expected results ─────────────────────────────────────────────────

const COMMON_ISSUE_TYPES = [
  'UNBALANCED_VOUCHER', 'MISSING_MAPPING', 'INCORRECT_FR_ACCOUNT', 'INCORRECT_BE_ACCOUNT',
  'FX_INCONSISTENCY', 'DUPLICATE_VOUCHER', 'CLASSIFICATION_MISMATCH', 'WRONG_ACCOUNT_TYPE',
  'PMA_NOT_POSTED', 'PL_NOT_NEUTRALIZED', 'DUPLICATE_EXCHANGE_RATE',
];

function StepExpected({ expected, onChangeStatus, onAddIssue, onRemoveIssue }) {
  const [issueInput, setIssueInput] = useState('');

  const add = (val) => {
    const v = (val || issueInput).trim();
    if (!v) return;
    if (!expected.issues.includes(v)) onAddIssue(v);
    setIssueInput('');
  };

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Define Expected Results</div>

      <div style={S.formGroup}>
        <label style={S.label}>Expected Status</label>
        <select style={{ ...S.select, maxWidth: 200 }} value={expected.status} onChange={e => onChangeStatus(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={S.label}>Expected Issue Types (must all appear in result)</div>
        <div style={S.issueChipRow}>
          {expected.issues.map(iss => (
            <div key={iss} style={S.issueChip}>
              <span>{iss}</span>
              <button style={S.removeChip} onClick={() => onRemoveIssue(iss)}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            style={{ ...S.input, maxWidth: 300 }}
            placeholder="Add issue type (or select below)"
            value={issueInput}
            onChange={e => setIssueInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <button style={{ ...S.btn, ...S.btnSecondary, padding: '7px 14px' }} onClick={() => add()}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {COMMON_ISSUE_TYPES.filter(t => !expected.issues.includes(t)).map(t => (
            <button
              key={t}
              style={{ padding: '3px 8px', fontSize: 10, borderRadius: 4, border: '1px solid #2d3748', background: '#1a2030', color: '#64748b', cursor: 'pointer', fontFamily: 'monospace' }}
              onClick={() => add(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: '10px 14px', background: '#0f1117', borderRadius: 6, fontSize: 11, color: '#475569' }}>
        <strong style={{ color: '#94a3b8' }}>Assertion logic:</strong> All listed issue types must appear in the result.
        {expected.status === 'pass' && ' Expected status = PASS means no unexpected issues are allowed.'}
      </div>
    </div>
  );
}

// ─── Step 4: Generate ─────────────────────────────────────────────────────────

function StepGenerate({ testCase, onGenerate, generating }) {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Generate Test Case</div>
      {!testCase && (
        <>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
            Click "Generate" to create test data and expected assertions from your configuration.
          </p>
          <button
            style={{ ...S.btn, ...S.btnPrimary, opacity: generating ? 0.6 : 1 }}
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate Test Case'}
          </button>
        </>
      )}
      {testCase && (
        <div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['ID',        testCase.id],
              ['Scenario',  testCase.scenarioType],
              ['Module',    testCase.config?.module],
              ['GAAP',      GAAP_LABELS[testCase.config?.gaap] || testCase.config?.gaap],
              ['Currency',  testCase.config?.currency],
            ].map(([l, v]) => (
              <div key={l} style={S.summaryCard}>
                <div style={S.summaryLabel}>{l}</div>
                <div style={{ fontSize: 12, color: '#7dd3fc', fontWeight: 700 }}>{v || '—'}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
            <strong>Name:</strong> {testCase.name}
          </div>
          {testCase.description && (
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>{testCase.description}</div>
          )}
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Generated at {new Date(testCase.createdAt).toLocaleString()}.
            &nbsp;Expected status: <strong style={{ color: '#7dd3fc' }}>{testCase.expectedStatus}</strong>.
            &nbsp;Expected issues: <strong style={{ color: '#7dd3fc' }}>{testCase.expectedIssues?.length || 0}</strong>.
          </div>
          <div style={{ marginTop: 12 }}>
            <button style={{ ...S.btn, ...S.btnSecondary, fontSize: 11 }} onClick={onGenerate} disabled={generating}>
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Run & results ────────────────────────────────────────────────────

function StepRun({ testCase, testResult, onRun, onExport, running, exporting }) {
  if (!testCase) {
    return (
      <div style={S.card}>
        <div style={{ color: '#475569', fontSize: 12 }}>Generate a test case first.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={S.card}>
        <div style={S.cardTitle}>Run Test</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ ...S.btn, ...S.btnPrimary, opacity: running ? 0.6 : 1 }}
            onClick={onRun}
            disabled={running}
          >
            {running ? 'Running…' : '▶ Run Test'}
          </button>
          {testResult && (
            <button
              style={{ ...S.btn, ...S.btnSecondary, opacity: exporting ? 0.6 : 1 }}
              onClick={onExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : '↓ Export to Excel'}
            </button>
          )}
        </div>
      </div>

      {testResult && (
        <div style={S.resultCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <span style={{ fontSize: 32 }}>{testResult.passed ? '✅' : '❌'}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, ...(testResult.passed ? { color: '#4ade80' } : { color: '#f87171' }) }}>
                {testResult.passed ? 'PASSED' : 'FAILED'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{testResult.summary}</div>
            </div>
          </div>

          <div style={S.summaryRow}>
            {[
              ['Total Assertions', testResult.assertions?.length ?? 0, '#7dd3fc'],
              ['Passed',           testResult.assertions?.filter(a => a.passed).length ?? 0, '#4ade80'],
              ['Failed',           testResult.failedAssertions?.length ?? 0, '#f87171'],
            ].map(([l, v, c]) => (
              <div key={l} style={S.summaryCard}>
                <div style={S.summaryLabel}>{l}</div>
                <div style={{ ...S.summaryValue, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={S.cardTitle}>Assertions</div>
          {(testResult.assertions || []).map((a, i) => (
            <div key={i} style={S.assertRow}>
              <span style={S.assertIcon}>{a.passed ? '✓' : '✗'}</span>
              <div>
                <div style={{ ...(a.passed ? { color: '#4ade80' } : { color: '#f87171' }), fontWeight: 600, fontSize: 12 }}>
                  {a.type}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{a.message}</div>
                {!a.passed && a.actual !== undefined && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    Expected: <span style={{ color: '#7dd3fc' }}>{String(a.expected)}</span>
                    &nbsp;· Actual: <span style={{ color: '#f87171' }}>{String(a.actual)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {testResult.actualResult?.summary && (
            <details style={{ marginTop: 14 }}>
              <summary style={{ fontSize: 11, color: '#475569', cursor: 'pointer' }}>Actual diagnostic result</summary>
              <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(testResult.actualResult.summary).map(([k, v]) => (
                  <div key={k} style={S.summaryCard}>
                    <div style={S.summaryLabel}>{k}</div>
                    <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>{String(v)}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TestLabView() {
  const [step,       setStep]       = useState(1);
  const [templates,  setTemplates]  = useState([]);
  const [selected,   setSelected]   = useState(null);  // template key
  const [config,     setConfig]     = useState({ module: 'gl', gaap: 'us_gaap', currency: 'EUR', name: '', company: '', description: '' });
  const [expected,   setExpected]   = useState({ status: 'fail', issues: [] });
  const [generating, setGenerating] = useState(false);
  const [testCase,   setTestCase]   = useState(null);
  const [running,    setRunning]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [exporting,  setExporting]  = useState(false);
  const [error,      setError]      = useState(null);

  useEffect(() => {
    window.electronAPI.testlabTemplates()
      .then(res => {
        if (Array.isArray(res)) setTemplates(res);
      })
      .catch(() => {});
  }, []);

  const selectTemplate = (t) => {
    setSelected(t.key);
    setConfig(c => ({
      ...c,
      module: t.defaultModule || c.module,
      gaap:   t.defaultGaap   || c.gaap,
      currency: t.defaultCurrency || c.currency,
      name: t.label,
      description: t.description,
    }));
    setStep(2);
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await window.electronAPI.testlabGenerate({
        ...config,
        scenarioType: selected,
        expectedStatus: expected.status,
        expectedIssues: expected.issues,
      });
      if (!res.success) { setError(res.error || 'Generation failed'); return; }
      setTestCase(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const run = async () => {
    if (!testCase) return;
    setRunning(true);
    setError(null);
    try {
      const res = await window.electronAPI.testlabRun(testCase);
      if (!res.success && !res.passed) setError(res.error || 'Run failed');
      setTestResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const exportResults = async () => {
    if (!testCase || !testResult) return;
    setExporting(true);
    try {
      const res = await window.electronAPI.testlabExport(testCase, testResult);
      if (res.success) {
        // show path briefly
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const canNext = (s) => {
    if (s === 1) return !!selected;
    if (s === 2) return !!(config.module && config.gaap && config.currency);
    if (s === 3) return true;
    if (s === 4) return !!testCase;
    return false;
  };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <h2 style={S.headerTitle}>Test Lab</h2>
        <p style={S.headerSub}>Generate, run, and export accounting scenario tests to validate diagnostic accuracy.</p>
      </div>

      <div style={S.body}>
        <div style={{ paddingBottom: 28 }}>
          <Stepper step={step} />
        </div>

        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '10px 14px', color: '#f87171', fontSize: 12 }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <StepTemplate templates={templates} selected={selected} onSelect={selectTemplate} />
        )}

        {step === 2 && (
          <StepConfig config={config} onChange={setConfig} />
        )}

        {step === 3 && (
          <StepExpected
            expected={expected}
            onChangeStatus={s => setExpected(e => ({ ...e, status: s }))}
            onAddIssue={t => setExpected(e => ({ ...e, issues: [...e.issues, t] }))}
            onRemoveIssue={t => setExpected(e => ({ ...e, issues: e.issues.filter(i => i !== t) }))}
          />
        )}

        {step === 4 && (
          <StepGenerate testCase={testCase} onGenerate={generate} generating={generating} />
        )}

        {step === 5 && (
          <StepRun
            testCase={testCase}
            testResult={testResult}
            onRun={run}
            onExport={exportResults}
            running={running}
            exporting={exporting}
          />
        )}

        {/* Navigation */}
        <div style={S.btnRow}>
          <button
            style={{ ...S.btn, ...S.btnSecondary, visibility: step === 1 ? 'hidden' : 'visible' }}
            onClick={() => setStep(s => s - 1)}
          >
            ← Back
          </button>
          <span style={{ fontSize: 11, color: '#475569' }}>Step {step} of {STEP_LABELS.length}</span>
          {step < STEP_LABELS.length ? (
            <button
              style={{ ...S.btn, ...S.btnPrimary, opacity: canNext(step) ? 1 : 0.4 }}
              onClick={() => canNext(step) && setStep(s => s + 1)}
              disabled={!canNext(step)}
            >
              Next →
            </button>
          ) : (
            <button
              style={{ ...S.btn, ...S.btnSecondary }}
              onClick={() => {
                setStep(1); setSelected(null); setTestCase(null);
                setTestResult(null); setError(null);
                setExpected({ status: 'fail', issues: [] });
                setConfig({ module: 'gl', gaap: 'us_gaap', currency: 'EUR', name: '', company: '', description: '' });
              }}
            >
              ↺ New Test
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
