'use strict';

/**
 * Debug & Test Toolkit
 *
 * Four independent panels:
 *   Test Builder    — configure & run template-based test cases with assertions
 *   Scenario Runner — direct diagnostic execution with live results
 *   Validation      — data integrity checks on imported voucher data
 *   Comparator      — side-by-side diff of two diagnostic runs
 *
 * Uses the same core engine as the main diagnostic flow.
 * No duplicate logic — all execution goes through window.electronAPI.
 */

import React, { useState, useCallback, useEffect } from 'react';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', clean: '#22c55e', unknown: '#64748b' };
const MODULES   = ['gl', 'ap', 'ar', 'fa', 'pma', 'inventory', 'sales', 'procurement', 'lease'];
const GAAPS     = [{ v: 'us_gaap', l: 'US GAAP' }, { v: 'french_gaap', l: 'French PCG' }, { v: 'belgium_gaap', l: 'Belgian PCMN' }];
const CCYS      = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'JPY', 'CAD'];

const fmt = n => (n ?? 0).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Styles ───────────────────────────────────────────────────────────────────

const T = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', background: '#0f1117', color: '#e2e8f0', fontFamily: 'monospace' },
  header: { padding: '14px 24px', borderBottom: '1px solid #1e2535', background: '#141824', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { margin: 0, fontSize: 17, fontWeight: 700, color: '#7dd3fc' },
  sub: { margin: '3px 0 0', fontSize: 11, color: '#64748b' },
  tabBar: { display: 'flex', borderBottom: '1px solid #1e2535', background: '#141824', paddingLeft: 24 },
  tab: { padding: '10px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: '#64748b', fontFamily: 'monospace', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabActive: { color: '#7dd3fc', borderBottom: '2px solid #7dd3fc' },
  body: { flex: 1, overflowY: 'auto', padding: 20 },
  card: { background: '#141824', border: '1px solid #1e2535', borderRadius: 8, padding: '14px 18px', marginBottom: 14 },
  cardTitle: { fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 },
  col: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 130 },
  label: { fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  select: { background: '#1e2535', border: '1px solid #2d3748', borderRadius: 4, color: '#e2e8f0', padding: '7px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none' },
  input: { background: '#1e2535', border: '1px solid #2d3748', borderRadius: 4, color: '#e2e8f0', padding: '7px 8px', fontSize: 12, fontFamily: 'monospace', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn: { padding: '8px 16px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' },
  btnPrimary: { background: '#2563eb', color: '#fff' },
  btnSuccess: { background: '#166534', color: '#4ade80' },
  btnSecondary: { background: '#1e2535', color: '#94a3b8', border: '1px solid #2d3748' },
  btnDanger: { background: '#7f1d1d', color: '#f87171' },
  errBox: { background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '10px 14px', color: '#f87171', fontSize: 12, marginBottom: 10 },
  okBox: { background: '#14532d22', border: '1px solid #166534', borderRadius: 6, padding: '10px 14px', color: '#4ade80', fontSize: 12, marginBottom: 10 },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 10, background: '#1e3a5f', color: '#7dd3fc', fontSize: 11, border: '1px solid #2563eb44' },
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid #12192e', fontSize: 12 },
  passIcon: { color: '#4ade80', fontWeight: 700, fontSize: 13, flexShrink: 0, minWidth: 16 },
  failIcon: { color: '#f87171', fontWeight: 700, fontSize: 13, flexShrink: 0, minWidth: 16 },
  warnIcon: { color: '#facc15', fontWeight: 700, fontSize: 13, flexShrink: 0, minWidth: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '7px 10px', textAlign: 'left', borderBottom: '1px solid #1e2535', color: '#64748b', fontSize: 10, fontWeight: 700 },
  td: { padding: '6px 10px', borderBottom: '1px solid #12192e', fontFamily: 'monospace' },
};

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'builder',    label: '🧪 Test Builder' },
  { key: 'runner',     label: '▶ Scenario Runner' },
  { key: 'validation', label: '✅ Validation' },
  { key: 'comparator', label: '⚖ Comparator' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 1 — TEST BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function TestBuilderPanel() {
  const [templates,   setTemplates]   = useState([]);
  const [selected,    setSelected]    = useState('');
  const [config,      setConfig]      = useState({ module: 'gl', gaap: 'us_gaap', currency: 'EUR', name: '' });
  const [expected,    setExpected]    = useState({ status: 'fail', issues: [] });
  const [issueInput,  setIssueInput]  = useState('');
  const [testCase,    setTestCase]    = useState(null);
  const [testResult,  setTestResult]  = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [running,     setRunning]     = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    window.electronAPI?.testlabTemplates?.()
      .then(r => { if (Array.isArray(r)) setTemplates(r); })
      .catch(() => {});
  }, []);

  const set = (k, v) => setConfig(c => ({ ...c, [k]: v }));

  const generate = async () => {
    if (!selected) { setError('Select a template first'); return; }
    setGenerating(true); setError(null); setTestResult(null);
    try {
      const res = await window.electronAPI.testlabGenerate({ ...config, scenarioType: selected, expectedStatus: expected.status, expectedIssues: expected.issues });
      if (!res?.success) throw new Error(res?.error || 'Generation failed');
      setTestCase(res);
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const run = async () => {
    if (!testCase) { setError('Generate a test case first'); return; }
    setRunning(true); setError(null);
    try {
      const res = await window.electronAPI.testlabRun(testCase);
      if (res == null) throw new Error('No response from engine');
      setTestResult(res);
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  const exportResults = async () => {
    if (!testCase || !testResult) return;
    setExporting(true);
    try { await window.electronAPI.testlabExport(testCase, testResult); }
    catch (e) { setError(e.message); }
    finally { setExporting(false); }
  };

  const QUICK_ISSUES = ['UNBALANCED_VOUCHER','MISSING_MAPPING','INCORRECT_FR_ACCOUNT','FX_INCONSISTENCY','CLASSIFICATION_MISMATCH','WRONG_ACCOUNT_TYPE','PMA_NOT_POSTED'];

  return (
    <div>
      {error && <div style={T.errBox}>{error}</div>}

      {/* Template */}
      <div style={T.card}>
        <div style={T.cardTitle}>1 — Template</div>
        {templates.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 12 }}>Loading templates…</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map(t => (
              <button
                key={t.key}
                onClick={() => { setSelected(t.key); set('name', t.label); }}
                style={{ ...T.btn, ...(selected === t.key ? T.btnPrimary : T.btnSecondary), fontSize: 11 }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Config */}
      <div style={T.card}>
        <div style={T.cardTitle}>2 — Configuration</div>
        <div style={T.row}>
          <div style={T.col}>
            <label style={T.label}>Module</label>
            <select style={T.select} value={config.module} onChange={e => set('module', e.target.value)}>
              {MODULES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={T.col}>
            <label style={T.label}>GAAP</label>
            <select style={T.select} value={config.gaap} onChange={e => set('gaap', e.target.value)}>
              {GAAPS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
            </select>
          </div>
          <div style={T.col}>
            <label style={T.label}>Currency</label>
            <select style={T.select} value={config.currency} onChange={e => set('currency', e.target.value)}>
              {CCYS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={T.col}>
          <label style={T.label}>Test Name</label>
          <input style={T.input} value={config.name} onChange={e => set('name', e.target.value)} placeholder="e.g. AP payable mapping validation" />
        </div>
      </div>

      {/* Expected */}
      <div style={T.card}>
        <div style={T.cardTitle}>3 — Expected Results</div>
        <div style={T.row}>
          <div style={T.col}>
            <label style={T.label}>Expected Status</label>
            <select style={T.select} value={expected.status} onChange={e => setExpected(x => ({ ...x, status: e.target.value }))}>
              <option value="pass">PASS</option>
              <option value="fail">FAIL</option>
              <option value="warning">WARNING</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <label style={T.label}>Expected Issue Types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {expected.issues.map(iss => (
              <span key={iss} style={T.chip}>
                {iss}
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0, fontSize: 12 }}
                  onClick={() => setExpected(x => ({ ...x, issues: x.issues.filter(i => i !== iss) }))}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input style={{ ...T.input, maxWidth: 280 }} value={issueInput} onChange={e => setIssueInput(e.target.value)}
              placeholder="Type issue type…"
              onKeyDown={e => { if (e.key === 'Enter' && issueInput.trim()) { setExpected(x => ({ ...x, issues: [...new Set([...x.issues, issueInput.trim()])] })); setIssueInput(''); }}} />
            <button style={{ ...T.btn, ...T.btnSecondary, padding: '7px 12px' }}
              onClick={() => { if (issueInput.trim()) { setExpected(x => ({ ...x, issues: [...new Set([...x.issues, issueInput.trim()])] })); setIssueInput(''); }}}>Add</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {QUICK_ISSUES.filter(q => !expected.issues.includes(q)).map(q => (
              <button key={q} style={{ ...T.btn, ...T.btnSecondary, fontSize: 10, padding: '3px 7px' }}
                onClick={() => setExpected(x => ({ ...x, issues: [...x.issues, q] }))}>{q}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={{ ...T.btn, ...T.btnPrimary, opacity: generating ? 0.6 : 1 }} onClick={generate} disabled={generating || !selected}>
          {generating ? 'Generating…' : '⚡ Generate Test Case'}
        </button>
        {testCase && (
          <button style={{ ...T.btn, ...T.btnSuccess, opacity: running ? 0.6 : 1 }} onClick={run} disabled={running}>
            {running ? 'Running…' : '▶ Run Test'}
          </button>
        )}
        {testResult && (
          <button style={{ ...T.btn, ...T.btnSecondary, opacity: exporting ? 0.6 : 1 }} onClick={exportResults} disabled={exporting}>
            {exporting ? '…' : '↓ Export Excel'}
          </button>
        )}
      </div>

      {/* Result */}
      {testResult && <TestResultDisplay result={testResult} />}

      {testCase && !testResult && (
        <div style={T.card}>
          <div style={T.cardTitle}>Generated Test Case</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            <strong style={{ color: '#7dd3fc' }}>{testCase.name}</strong> · {testCase.scenarioType} · {testCase.config?.module} · {testCase.config?.gaap}
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
            Expected: <strong style={{ color: '#7dd3fc' }}>{testCase.expectedStatus}</strong> ·
            Issues: <strong style={{ color: '#7dd3fc' }}>{testCase.expectedIssues?.length || 0}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function TestResultDisplay({ result }) {
  const passed = result?.passed;
  return (
    <div style={{ ...T.card, borderColor: passed ? '#166534' : '#7f1d1d' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 28 }}>{passed ? '✅' : '❌'}</span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: passed ? '#4ade80' : '#f87171' }}>{passed ? 'PASSED' : 'FAILED'}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{result.summary}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          {[
            ['Total', result.assertions?.length ?? 0, '#7dd3fc'],
            ['Passed', result.assertions?.filter(a => a.passed).length ?? 0, '#4ade80'],
            ['Failed', result.failedAssertions?.length ?? 0, '#f87171'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 10, color: '#475569' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {(result.assertions || []).map((a, i) => (
        <div key={i} style={T.checkRow}>
          <span style={a.passed ? T.passIcon : T.failIcon}>{a.passed ? '✓' : '✗'}</span>
          <div>
            <div style={{ fontWeight: 600, color: a.passed ? '#4ade80' : '#f87171', fontSize: 11 }}>{a.type}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{a.message}</div>
            {!a.passed && a.actual !== undefined && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                Expected: <span style={{ color: '#7dd3fc' }}>{String(a.expected)}</span> · Actual: <span style={{ color: '#f87171' }}>{String(a.actual)}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 2 — SCENARIO RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

function ScenarioRunnerPanel({ onCaptureA, onCaptureB }) {
  const [ctx, setCtx]      = useState({ module: 'gl', gaap: 'us_gaap', accountingCurrency: 'EUR', pma: false });
  const [entries, setEntries] = useState([{ voucher: 'TEST-001', account: '', description: '', debit: '', credit: '', currency: 'EUR' }]);
  const [result,  setResult]  = useState(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState(null);

  const setC = (k, v) => setCtx(c => ({ ...c, [k]: v }));

  const updateEntry = (i, k, v) => setEntries(es => es.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const addEntry    = () => setEntries(es => [...es, { voucher: es[0]?.voucher || 'TEST-001', account: '', description: '', debit: '', credit: '', currency: 'EUR' }]);
  const removeEntry = (i) => setEntries(es => es.filter((_, idx) => idx !== i));

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const voucherData = { 'Test': {
        entries: entries.map(e => ({
          ...e,
          usAccount: e.account, debit: parseFloat(e.debit) || 0, credit: parseFloat(e.credit) || 0,
        })),
        vouchers: {}, stats: {},
      }};
      const resp = await window.electronAPI.runDiagnostic({ context: ctx, scenarios: [], voucherData });
      if (!resp?.success) throw new Error(resp?.error || 'Run failed');
      setResult(resp.result);
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  };

  const summary = result?.summary;

  return (
    <div>
      {error && <div style={T.errBox}>{error}</div>}

      {/* Context */}
      <div style={T.card}>
        <div style={T.cardTitle}>Diagnostic Context</div>
        <div style={T.row}>
          <div style={T.col}>
            <label style={T.label}>Module</label>
            <select style={T.select} value={ctx.module} onChange={e => setC('module', e.target.value)}>
              {MODULES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={T.col}>
            <label style={T.label}>GAAP</label>
            <select style={T.select} value={ctx.gaap} onChange={e => setC('gaap', e.target.value)}>
              {GAAPS.map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
            </select>
          </div>
          <div style={T.col}>
            <label style={T.label}>Accounting CCY</label>
            <select style={T.select} value={ctx.accountingCurrency} onChange={e => setC('accountingCurrency', e.target.value)}>
              {CCYS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Entry editor */}
      <div style={T.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={T.cardTitle}>Journal Entries</div>
          <button style={{ ...T.btn, ...T.btnSecondary, fontSize: 11 }} onClick={addEntry}>+ Add Line</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={T.table}>
            <thead>
              <tr>
                {['Voucher','Account','Description','Debit','Credit','CCY',''].map(h => (
                  <th key={h} style={T.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td style={T.td}><input style={{ ...T.input, width: 90 }} value={e.voucher} onChange={ev => updateEntry(i, 'voucher', ev.target.value)} /></td>
                  <td style={T.td}><input style={{ ...T.input, width: 80 }} value={e.account} onChange={ev => updateEntry(i, 'account', ev.target.value)} placeholder="Account" /></td>
                  <td style={T.td}><input style={{ ...T.input, width: 140 }} value={e.description} onChange={ev => updateEntry(i, 'description', ev.target.value)} placeholder="Description" /></td>
                  <td style={T.td}><input style={{ ...T.input, width: 70, textAlign: 'right' }} value={e.debit} onChange={ev => updateEntry(i, 'debit', ev.target.value)} placeholder="0" /></td>
                  <td style={T.td}><input style={{ ...T.input, width: 70, textAlign: 'right' }} value={e.credit} onChange={ev => updateEntry(i, 'credit', ev.target.value)} placeholder="0" /></td>
                  <td style={T.td}>
                    <select style={{ ...T.select, width: 60 }} value={e.currency} onChange={ev => updateEntry(i, 'currency', ev.target.value)}>
                      {CCYS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={T.td}>
                    <button style={{ ...T.btn, ...T.btnDanger, padding: '3px 6px', fontSize: 10 }} onClick={() => removeEntry(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Run */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={{ ...T.btn, ...T.btnPrimary, opacity: running ? 0.6 : 1 }} onClick={run} disabled={running}>
          {running ? 'Running…' : '▶ Run Diagnostic'}
        </button>
        {result && <>
          <button style={{ ...T.btn, ...T.btnSecondary }} onClick={() => onCaptureA(result)}>Capture → Slot A</button>
          <button style={{ ...T.btn, ...T.btnSecondary }} onClick={() => onCaptureB(result)}>Capture → Slot B</button>
        </>}
      </div>

      {/* Live result */}
      {result && summary && (
        <div style={T.card}>
          <div style={T.cardTitle}>Result</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              ['Status', (summary.overallStatus || 'clean').toUpperCase(), SEV_COLOR[summary.overallStatus] || '#22c55e'],
              ['Issues', summary.totalIssues || 0, summary.totalIssues > 0 ? '#f97316' : '#22c55e'],
              ['Critical', summary.criticalCount || 0, summary.criticalCount > 0 ? '#ef4444' : '#64748b'],
            ].map(([l, v, c]) => (
              <div key={l}>
                <div style={{ fontSize: 10, color: '#64748b' }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          {summary.totalIssues > 0 && result.voucherAnalysis && (
            <div>
              {Object.entries(result.voucherAnalysis).flatMap(([, data]) =>
                (data.vouchers || []).flatMap(v => (v.issues || []).map((iss, i) => (
                  <div key={`${v.voucherId}-${i}`} style={T.checkRow}>
                    <span style={{ ...T.failIcon, color: SEV_COLOR[iss.severity] || '#64748b' }}>⚠</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: SEV_COLOR[iss.severity] || '#94a3b8' }}>{iss.type}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{iss.detail || iss.title}</div>
                    </div>
                  </div>
                )))
              )}
            </div>
          )}
          {summary.totalIssues === 0 && (
            <div style={{ fontSize: 12, color: '#4ade80' }}>✓ No issues detected</div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 3 — VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function ValidationPanel({ importedData }) {
  const [checks, setChecks] = useState(null);
  const [running, setRunning] = useState(false);

  const runValidation = useCallback(() => {
    if (!importedData) return;
    setRunning(true);
    // All validation is local — no backend call needed
    setTimeout(() => {
      setChecks(validateImportedData(importedData));
      setRunning(false);
    }, 60);
  }, [importedData]);

  if (!importedData) {
    return (
      <div style={{ ...T.card, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <div style={{ color: '#475569', fontSize: 13 }}>Import an Excel file first to validate your data.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <button style={{ ...T.btn, ...T.btnPrimary, opacity: running ? 0.6 : 1 }} onClick={runValidation} disabled={running}>
          {running ? 'Validating…' : '✅ Run Validation'}
        </button>
        {checks && (
          <span style={{ fontSize: 12, color: checks.passed ? '#4ade80' : '#f87171', fontWeight: 700 }}>
            {checks.passed ? `✓ All ${checks.results.length} checks passed` : `${checks.results.filter(r => r.status === 'fail').length} check(s) failed`}
          </span>
        )}
      </div>

      {checks && checks.results.map((check, i) => (
        <div key={i} style={T.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: check.items?.length ? 8 : 0 }}>
            <span style={check.status === 'pass' ? T.passIcon : check.status === 'warn' ? T.warnIcon : T.failIcon}>
              {check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: check.status === 'pass' ? '#4ade80' : check.status === 'warn' ? '#facc15' : '#f87171' }}>
                {check.name}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{check.detail}</div>
            </div>
            {check.count !== undefined && (
              <span style={{ fontSize: 18, fontWeight: 700, color: check.status === 'pass' ? '#4ade80' : '#f87171' }}>
                {check.count}
              </span>
            )}
          </div>
          {check.items?.length > 0 && (
            <div style={{ paddingLeft: 26 }}>
              {check.items.slice(0, 8).map((item, j) => (
                <div key={j} style={{ fontSize: 11, color: '#94a3b8', padding: '2px 0' }}>• {item}</div>
              ))}
              {check.items.length > 8 && <div style={{ fontSize: 10, color: '#475569' }}>… and {check.items.length - 8} more</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function validateImportedData(importedData) {
  const results = [];
  let totalEntries = 0;
  const allVouchers = [];
  const allEntries  = [];

  Object.values(importedData).forEach(sheet => {
    Object.values(sheet.vouchers || {}).forEach(v => allVouchers.push(v));
    (sheet.entries || []).forEach(e => allEntries.push(e));
    totalEntries += (sheet.entries || []).length;
  });

  // 1. Balance check
  const unbalanced = allVouchers.filter(v => !v.isBalanced);
  results.push({
    name: 'Voucher Balance',
    detail: `${allVouchers.length} vouchers checked — ${unbalanced.length} unbalanced`,
    status: unbalanced.length === 0 ? 'pass' : 'fail',
    count: unbalanced.length || allVouchers.length,
    items: unbalanced.slice(0, 10).map(v => `${v.voucherId}: imbalance ${v.imbalance?.toFixed(2)}`),
  });

  // 2. Account presence
  const missingAccount = allEntries.filter(e => !(e.usAccount || e.account));
  results.push({
    name: 'Account Reference',
    detail: `${totalEntries} entries checked — ${missingAccount.length} without account`,
    status: missingAccount.length === 0 ? 'pass' : 'fail',
    count: missingAccount.length || totalEntries,
    items: missingAccount.slice(0, 10).map(e => `Voucher ${e.voucher}: no account`),
  });

  // 3. Currency validity
  const badCcy = allEntries.filter(e => { const c = e.currency || 'EUR'; return !/^[A-Z]{3}$/.test(c); });
  results.push({
    name: 'Currency Codes',
    detail: `${totalEntries} entries — ${badCcy.length} with invalid currency code`,
    status: badCcy.length === 0 ? 'pass' : 'fail',
    count: badCcy.length || totalEntries,
    items: badCcy.slice(0, 10).map(e => `${e.voucher}: currency='${e.currency}'`),
  });

  // 4. Exchange rate validity
  const badRate = allEntries.filter(e => (e.exchangeRate !== undefined) && (isNaN(e.exchangeRate) || e.exchangeRate <= 0));
  results.push({
    name: 'Exchange Rates',
    detail: `${totalEntries} entries — ${badRate.length} with invalid rate`,
    status: badRate.length === 0 ? 'pass' : (badRate.length < 5 ? 'warn' : 'fail'),
    count: badRate.length || totalEntries,
    items: badRate.slice(0, 10).map(e => `${e.voucher}: rate=${e.exchangeRate}`),
  });

  // 5. Amount validity
  const badAmt = allEntries.filter(e => isNaN(e.debit) || isNaN(e.credit) || e.debit < 0 || e.credit < 0);
  results.push({
    name: 'Amount Values',
    detail: `${totalEntries} entries — ${badAmt.length} with negative or NaN amounts`,
    status: badAmt.length === 0 ? 'pass' : 'fail',
    count: badAmt.length || totalEntries,
    items: badAmt.slice(0, 10).map(e => `${e.voucher}: debit=${e.debit} credit=${e.credit}`),
  });

  // 6. Duplicate voucher IDs (same ID across sheets)
  const seen = new Set();
  const dupes = [];
  allVouchers.forEach(v => { if (seen.has(v.voucherId)) dupes.push(v.voucherId); else seen.add(v.voucherId); });
  const uniqueDupes = [...new Set(dupes)];
  results.push({
    name: 'Duplicate Vouchers',
    detail: `${allVouchers.length} unique voucher IDs checked — ${uniqueDupes.length} duplicate(s) found`,
    status: uniqueDupes.length === 0 ? 'pass' : 'warn',
    count: uniqueDupes.length,
    items: uniqueDupes.slice(0, 10),
  });

  // 7. FR Account coverage (if dual-GAAP)
  const dualEntries = allEntries.filter(e => e.usAccount);
  if (dualEntries.length > 0) {
    const missingFr = dualEntries.filter(e => !e.frAccount);
    const pct = Math.round(((dualEntries.length - missingFr.length) / dualEntries.length) * 100);
    results.push({
      name: 'FR Account Coverage',
      detail: `${dualEntries.length} dual-GAAP entries — ${pct}% have FR account`,
      status: pct === 100 ? 'pass' : pct >= 80 ? 'warn' : 'fail',
      count: missingFr.length,
      items: missingFr.slice(0, 10).map(e => `${e.voucher}: US ${e.usAccount} — no FR account`),
    });
  }

  const passed = results.every(r => r.status === 'pass');
  return { passed, results };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 4 — RESULT COMPARATOR
// ═══════════════════════════════════════════════════════════════════════════════

function ComparatorPanel({ slotA, slotB, onClearA, onClearB }) {
  if (!slotA && !slotB) {
    return (
      <div style={{ ...T.card, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚖</div>
        <div style={{ color: '#475569', fontSize: 13 }}>Capture two results from the Scenario Runner to compare them here.</div>
      </div>
    );
  }

  const sumA = slotA?.summary;
  const sumB = slotB?.summary;

  const LINES = [
    { key: 'overallStatus', label: 'Status', fmt: v => (v || 'n/a').toUpperCase(), colorFn: v => SEV_COLOR[v] || '#64748b' },
    { key: 'totalIssues',   label: 'Total Issues', fmt: fmt, colorFn: v => v > 0 ? '#f97316' : '#22c55e' },
    { key: 'criticalCount', label: 'Critical',      fmt: fmt, colorFn: v => v > 0 ? '#ef4444' : '#64748b' },
    { key: 'errorCount',    label: 'High Severity', fmt: fmt, colorFn: v => v > 0 ? '#f97316' : '#64748b' },
    { key: 'warningCount',  label: 'Warnings',      fmt: fmt, colorFn: v => v > 0 ? '#f59e0b' : '#64748b' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        {[['A', slotA, onClearA], ['B', slotB, onClearB]].map(([slot, res, clear]) => (
          <div key={slot} style={{ ...T.card, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7dd3fc' }}>Slot {slot}</div>
              {res && <button style={{ ...T.btn, ...T.btnDanger, fontSize: 10, padding: '2px 6px' }} onClick={clear}>Clear</button>}
            </div>
            {res ? (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                <div style={{ color: SEV_COLOR[res.summary?.overallStatus] || '#64748b', fontWeight: 700 }}>
                  {(res.summary?.overallStatus || 'unknown').toUpperCase()}
                </div>
                <div>{res.summary?.totalIssues || 0} issues · {new Date(res.timestamp).toLocaleTimeString()}</div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>No result captured</div>
            )}
          </div>
        ))}
      </div>

      {sumA && sumB && (
        <div style={T.card}>
          <div style={T.cardTitle}>Comparison</div>
          <table style={T.table}>
            <thead>
              <tr>
                <th style={T.th}>Metric</th>
                <th style={{ ...T.th, textAlign: 'right' }}>Slot A</th>
                <th style={{ ...T.th, textAlign: 'right' }}>Slot B</th>
                <th style={{ ...T.th, textAlign: 'right' }}>Delta (B−A)</th>
              </tr>
            </thead>
            <tbody>
              {LINES.map(line => {
                const vA = sumA[line.key];
                const vB = sumB[line.key];
                const isNum = typeof vA === 'number' && typeof vB === 'number';
                const delta = isNum ? vB - vA : null;
                const deltaColor = delta === null ? '#64748b' : delta < 0 ? '#4ade80' : delta > 0 ? '#f87171' : '#64748b';
                return (
                  <tr key={line.key}>
                    <td style={{ ...T.td, color: '#94a3b8' }}>{line.label}</td>
                    <td style={{ ...T.td, textAlign: 'right', color: line.colorFn(vA) }}>{line.fmt(vA)}</td>
                    <td style={{ ...T.td, textAlign: 'right', color: line.colorFn(vB) }}>{line.fmt(vB)}</td>
                    <td style={{ ...T.td, textAlign: 'right', color: deltaColor, fontWeight: 700 }}>
                      {delta === null ? '—' : delta > 0 ? `+${fmt(delta)}` : fmt(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TestLabView({ importedData }) {
  const [activeTab, setActiveTab] = useState('builder');
  const [slotA, setSlotA] = useState(null);
  const [slotB, setSlotB] = useState(null);

  return (
    <div style={T.root}>
      <div style={T.header}>
        <div>
          <h2 style={T.title}>Debug & Test Toolkit</h2>
          <p style={T.sub}>Build test cases · Run scenarios · Validate data · Compare results</p>
        </div>
      </div>

      <div style={T.tabBar}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...T.tab, ...(activeTab === t.key ? T.tabActive : {}) }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={T.body}>
        {activeTab === 'builder'    && <TestBuilderPanel />}
        {activeTab === 'runner'     && <ScenarioRunnerPanel onCaptureA={setSlotA} onCaptureB={setSlotB} />}
        {activeTab === 'validation' && <ValidationPanel importedData={importedData} />}
        {activeTab === 'comparator' && <ComparatorPanel slotA={slotA} slotB={slotB} onClearA={() => setSlotA(null)} onClearB={() => setSlotB(null)} />}
      </div>
    </div>
  );
}
