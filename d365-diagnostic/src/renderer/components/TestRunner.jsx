import React, { useState } from 'react';

export default function TestRunner() {
  const [result,   setResult]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState({});

  const runTests = async () => {
    if (!window.electronAPI?.runTests) {
      setError('Test runner not available (electronAPI not found).');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const resp = await window.electronAPI.runTests();
      if (resp.success) {
        setResult(resp.result);
      } else {
        setError(resp.error || 'Test run failed');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const toggle = (name) => setExpanded(p => ({ ...p, [name]: !p[name] }));

  return (
    <div style={S.root}>
      <div style={S.titleRow}>
        <h1 style={S.title}>Test Runner</h1>
        <button onClick={runTests} disabled={running} style={{ ...S.runBtn, opacity: running ? .65 : 1 }}>
          {running ? '⏳  Running…' : '▶  Run All Tests'}
        </button>
      </div>

      <p style={S.intro}>
        Automated test suite covering validation, FX gain/loss calculations, and multi-currency analysis.
        Runs entirely in the main process against the engine modules directly.
      </p>

      {error && <div style={S.errorBox}>⚠ {error}</div>}

      {result && (
        <>
          {/* Summary cards */}
          <div style={S.cards}>
            <Card label="Status"   value={result.overallStatus} color={result.overallStatus === 'PASS' ? '#22c55e' : '#ef4444'} />
            <Card label="Passed"   value={result.pass}   color="#22c55e" />
            <Card label="Failed"   value={result.fail}   color={result.fail > 0 ? '#ef4444' : '#64748b'} />
            <Card label="Skipped"  value={result.skip}   color="#f59e0b" />
            <Card label="Total"    value={result.total}  color="#3b82f6" />
            <Card label="Duration" value={`${result.durationMs}ms`} color="#475569" />
          </div>

          {/* Failed tests highlight */}
          {result.failedTests?.length > 0 && (
            <div style={S.failedSection}>
              <div style={S.sectionLabel}>Failed Tests</div>
              {result.failedTests.map((t, i) => (
                <div key={i} style={S.failRow}>
                  <span style={S.failIcon}>✗</span>
                  <div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{t.name}</div>
                    {t.expected && <div style={{ fontSize: 12, color: '#64748b' }}>Expected: {String(t.expected)}</div>}
                    {t.got      && <div style={{ fontSize: 12, color: '#ef4444' }}>Got: {String(t.got)}</div>}
                    {t.detail   && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{t.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* All tests list */}
          <div style={S.sectionLabel}>All Tests</div>
          <div style={S.testList}>
            {result.tests.map((t, i) => {
              const isOpen = expanded[t.name];
              const hasDetail = t.detail || t.expected || t.got || t.reason;
              return (
                <div key={i}
                  onClick={() => hasDetail && toggle(t.name)}
                  style={{ ...S.testRow, cursor: hasDetail ? 'pointer' : 'default', background: isOpen ? '#1a1f2e' : '#0d1219' }}
                >
                  <span style={{ ...S.statusDot, color: STATUS_COLOR[t.status] }}>
                    {t.status === 'PASS' ? '✓' : t.status === 'FAIL' ? '✗' : '⊘'}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: t.status === 'FAIL' ? '#fca5a5' : '#cbd5e1' }}>
                    {t.name}
                  </span>
                  <span style={{ ...S.statusBadge, background: STATUS_BG[t.status], color: STATUS_COLOR[t.status] }}>
                    {t.status}
                  </span>
                  {isOpen && hasDetail && (
                    <div style={S.testDetail}>
                      {t.detail   && <div style={{ color: '#94a3b8' }}>{t.detail}</div>}
                      {t.expected && <div style={{ color: '#64748b' }}>Expected: {String(t.expected)}</div>}
                      {t.got      && <div style={{ color: '#ef4444' }}>Got: {String(t.got)}</div>}
                      {t.reason   && <div style={{ color: '#f59e0b' }}>Skipped: {t.reason}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!result && !running && !error && (
        <div style={S.empty}>Click "Run All Tests" to execute the automated test suite.</div>
      )}
    </div>
  );
}

function Card({ label, value, color }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const STATUS_COLOR = { PASS: '#22c55e', FAIL: '#ef4444', SKIP: '#f59e0b' };
const STATUS_BG    = { PASS: '#052e16', FAIL: '#2d0b0b', SKIP: '#2d1f00' };

const S = {
  root:         { display: 'flex', flexDirection: 'column', gap: 0 },
  titleRow:     { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 },
  title:        { fontSize: 20, fontWeight: 700, color: '#e2e8f0', margin: 0 },
  intro:        { fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 },
  runBtn:       { padding: '9px 22px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  errorBox:     { background: '#2d0b0b', border: '1px solid #ef4444', borderRadius: 6, padding: '12px 16px', color: '#fca5a5', fontSize: 13, marginBottom: 16 },
  cards:        { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  card:         { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 8, padding: '14px 20px', textAlign: 'center', minWidth: 90 },
  failedSection:{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '16px', marginBottom: 20 },
  failRow:      { display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #2d1010', alignItems: 'flex-start' },
  failIcon:     { color: '#ef4444', fontSize: 16, fontWeight: 700, marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#334155', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  testList:     { display: 'flex', flexDirection: 'column', gap: 2 },
  testRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 5, border: '1px solid #1e293b', flexWrap: 'wrap' },
  statusDot:    { fontSize: 14, fontWeight: 700, width: 18, flexShrink: 0 },
  statusBadge:  { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 },
  testDetail:   { width: '100%', paddingLeft: 28, paddingTop: 6, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 },
  empty:        { color: '#475569', fontSize: 13, padding: '40px 0', textAlign: 'center' },
};
