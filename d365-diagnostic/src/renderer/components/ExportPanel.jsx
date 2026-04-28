import React, { useState } from 'react';

export default function ExportPanel({ diagnosticResult, context }) {
  const [excelStatus, setExcelStatus] = useState(null);
  const [wordStatus,  setWordStatus]  = useState(null);
  const [excelPath,   setExcelPath]   = useState(null);
  const [wordPath,    setWordPath]    = useState(null);

  if (!diagnosticResult) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📤</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>No results to export</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
          Run the diagnostic first, then come back here to export.
        </p>
      </div>
    );
  }

  const payload = { diagnosticResult, context };

  const exportExcel = async () => {
    setExcelStatus('loading');
    const resp = await window.electronAPI?.exportExcel(payload);
    if (resp?.success) { setExcelStatus('done'); setExcelPath(resp.filePath); }
    else setExcelStatus(resp?.canceled ? null : 'error');
  };

  const exportWord = async () => {
    setWordStatus('loading');
    const resp = await window.electronAPI?.exportWord(payload);
    if (resp?.success) { setWordStatus('done'); setWordPath(resp.filePath); }
    else setWordStatus(resp?.canceled ? null : 'error');
  };

  const showFile = async (path) => {
    await window.electronAPI?.showFile(path);
  };

  const s = diagnosticResult.summary || {};

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Export Engine</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Generate professional reports from your diagnostic results. Files are saved directly to your local machine.
        </p>
      </div>

      {/* Report summary */}
      <div style={S.summaryCard}>
        <div className="section-title">Report Contents</div>
        <div style={S.summaryGrid}>
          <SummaryItem icon="⚙" label="Module"       value={context?.module} />
          <SummaryItem icon="🌍" label="Country"      value={context?.country} />
          <SummaryItem icon="📚" label="GAAP"         value={context?.gaap?.replace(/_/g,' ')} />
          <SummaryItem icon="🔍" label="Total Issues" value={s.totalIssues || 0} accent={s.totalIssues > 0} />
          <SummaryItem icon="🚨" label="Critical"     value={s.criticalCount || 0} accent={s.criticalCount > 0} />
          <SummaryItem icon="⚠" label="Warnings"     value={s.warningCount || 0} />
          <SummaryItem icon="📄" label="Scenario Analysis"  value={diagnosticResult.scenarioAnalysis ? `${diagnosticResult.scenarioAnalysis.total} scenarios` : 'None'} />
          <SummaryItem icon="📊" label="Voucher Sheets"     value={diagnosticResult.voucherAnalysis ? Object.keys(diagnosticResult.voucherAnalysis).length : 0} />
        </div>
      </div>

      {/* Export cards */}
      <div style={S.exportGrid}>

        {/* Excel export */}
        <div style={S.exportCard}>
          <div style={S.exportIcon}>📊</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f0', marginBottom: 6 }}>
            Excel Report
          </div>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
            Multi-sheet Excel workbook with:
          </p>
          <ul style={S.featureList}>
            <li>Executive Summary</li>
            <li>Voucher-level analysis (colour-coded)</li>
            <li>Scenario comparison</li>
            <li>Root cause analysis</li>
            <li>Auto-filter on all sheets</li>
          </ul>

          {excelStatus === 'done' && excelPath ? (
            <div style={S.doneBox}>
              <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 6 }}>✓ Saved successfully</div>
              <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all', marginBottom: 10 }}>{excelPath}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.secondaryBtn} onClick={() => showFile(excelPath)}>📂 Show in Folder</button>
                <button style={S.ghostBtn}     onClick={() => { setExcelStatus(null); setExcelPath(null); }}>Export Again</button>
              </div>
            </div>
          ) : (
            <button
              style={{ ...S.exportBtn, background: '#1d6f42', opacity: excelStatus === 'loading' ? .65 : 1 }}
              onClick={exportExcel}
              disabled={excelStatus === 'loading'}
            >
              {excelStatus === 'loading' ? '⏳ Generating…' : '⬇ Export to Excel'}
            </button>
          )}
          {excelStatus === 'error' && <div style={S.errMsg}>Export failed. Check console.</div>}
        </div>

        {/* Word export */}
        <div style={S.exportCard}>
          <div style={S.exportIcon}>📝</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f0', marginBottom: 6 }}>
            Consulting Report (Word)
          </div>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
            Structured Word document with:
          </p>
          <ul style={S.featureList}>
            <li>Executive summary with status</li>
            <li>Context &amp; configuration overview</li>
            <li>Root cause analysis (per issue type)</li>
            <li>Voucher findings (top 25)</li>
            <li>D365 configuration recommendations</li>
          </ul>

          {wordStatus === 'done' && wordPath ? (
            <div style={S.doneBox}>
              <div style={{ color: '#22c55e', fontWeight: 600, marginBottom: 6 }}>✓ Saved successfully</div>
              <div style={{ fontSize: 11, color: '#64748b', wordBreak: 'break-all', marginBottom: 10 }}>{wordPath}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.secondaryBtn} onClick={() => showFile(wordPath)}>📂 Show in Folder</button>
                <button style={S.ghostBtn}     onClick={() => { setWordStatus(null); setWordPath(null); }}>Export Again</button>
              </div>
            </div>
          ) : (
            <button
              style={{ ...S.exportBtn, background: '#1e3a5f', opacity: wordStatus === 'loading' ? .65 : 1 }}
              onClick={exportWord}
              disabled={wordStatus === 'loading'}
            >
              {wordStatus === 'loading' ? '⏳ Generating…' : '⬇ Export to Word'}
            </button>
          )}
          {wordStatus === 'error' && <div style={S.errMsg}>Export failed. Check console.</div>}
        </div>
      </div>

      {/* Notes */}
      <div style={S.notesCard}>
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
          <strong style={{ color: '#64748b' }}>Notes:</strong> Files are saved directly to your local machine via a native save dialog.
          No data is transmitted to any external service. All processing is 100% offline.
          For large voucher sets (&gt;1000), Excel generation may take a few seconds.
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value, accent }) {
  return (
    <div style={S.summaryItem}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 11, color: '#475569' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ? '#f97316' : '#94a3b8' }}>{value}</span>
    </div>
  );
}

const S = {
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  summaryCard: { background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 10, padding: '18px', marginBottom: 20 },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 3 },
  exportGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 },
  exportCard: {
    background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 12, padding: '24px',
    display: 'flex', flexDirection: 'column',
  },
  exportIcon: { fontSize: 36, marginBottom: 10 },
  featureList: {
    listStyle: 'none', padding: 0, margin: '0 0 20px',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  exportBtn: {
    padding: '12px 20px', color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 'auto',
  },
  doneBox: { background: '#052e16', border: '1px solid #166534', borderRadius: 8, padding: '12px', marginTop: 'auto' },
  secondaryBtn: { flex: 1, padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  ghostBtn: { flex: 1, padding: '8px', background: 'none', border: '1px dashed #334155', color: '#64748b', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  errMsg: { fontSize: 12, color: '#ef4444', marginTop: 8 },
  notesCard: { background: '#0d1219', border: '1px solid #1e293b', borderRadius: 10, padding: '14px 18px' },
};
