import React, { useState, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ContextSelector from './components/ContextSelector';
import ScenarioBuilder from './components/ScenarioBuilder';
import ExcelImport from './components/ExcelImport';
import DiagnosticResults from './components/DiagnosticResults';
import VoucherAnalysis from './components/VoucherAnalysis';
import ExportPanel from './components/ExportPanel';

const DEFAULT_CONTEXT = { module: 'lease', country: 'FR', gaap: 'french_gaap', pma: false };

export default function App() {
  const [activeTab,       setActiveTab]       = useState('context');
  const [context,         setContext]          = useState(DEFAULT_CONTEXT);
  const [scenarios,       setScenarios]        = useState([]);
  const [importedData,    setImportedData]     = useState(null);
  const [diagnosticResult,setDiagnosticResult] = useState(null);
  const [isRunning,       setIsRunning]        = useState(false);
  const [runError,        setRunError]         = useState(null);

  const runDiagnostic = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const resp = await window.electronAPI.runDiagnostic({
        context,
        scenarios,
        voucherData: importedData,
      });
      if (resp.success) {
        setDiagnosticResult(resp.result);
        setActiveTab('results');
      } else {
        setRunError(resp.error || 'Unknown error');
      }
    } catch (e) {
      setRunError(e.message);
    } finally {
      setIsRunning(false);
    }
  }, [context, scenarios, importedData]);

  const renderContent = () => {
    switch (activeTab) {
      case 'context':   return <ContextSelector context={context} setContext={setContext} />;
      case 'scenarios': return <ScenarioBuilder scenarios={scenarios} setScenarios={setScenarios} context={context} />;
      case 'import':    return <ExcelImport importedData={importedData} setImportedData={setImportedData} />;
      case 'results':   return <DiagnosticResults result={diagnosticResult} isRunning={isRunning} />;
      case 'vouchers':  return <VoucherAnalysis result={diagnosticResult} />;
      case 'export':    return <ExportPanel diagnosticResult={diagnosticResult} context={context} />;
      default:          return null;
    }
  };

  const summary = diagnosticResult?.summary;
  const statusColor =
    summary?.overallStatus === 'critical' ? '#ef4444' :
    summary?.overallStatus === 'error'    ? '#f97316' :
    summary?.overallStatus === 'warning'  ? '#f59e0b' :
    summary ? '#22c55e' : '#475569';

  return (
    <div style={S.app}>
      <Header context={context} summary={summary} />
      <div style={S.body}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} hasResult={!!diagnosticResult} />
        <main style={S.main}>{renderContent()}</main>
      </div>

      {/* Footer run bar */}
      <div style={S.footer}>
        <button
          onClick={runDiagnostic}
          disabled={isRunning}
          style={{ ...S.runBtn, opacity: isRunning ? .65 : 1 }}
        >
          {isRunning ? '⏳  Running…' : '▶  Run Diagnostic'}
        </button>

        {runError && (
          <span style={S.errorMsg}>⚠ {runError}</span>
        )}

        {summary && !runError && (
          <span style={{ ...S.footerInfo, color: statusColor }}>
            ● {(summary.overallStatus || 'clean').toUpperCase()} &nbsp;·&nbsp;
            {summary.totalIssues} issue{summary.totalIssues !== 1 ? 's' : ''} found
            &nbsp;·&nbsp; {new Date(diagnosticResult.timestamp).toLocaleTimeString()}
          </span>
        )}
        {!summary && !runError && (
          <span style={S.footerInfo}>
            Configure context → build scenarios or import Excel → click Run Diagnostic
          </span>
        )}
      </div>
    </div>
  );
}

const S = {
  app: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    backgroundColor: '#0f1117', color: '#e2e8f0', overflow: 'hidden',
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, overflowY: 'auto', padding: '24px' },
  footer: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '10px 24px', backgroundColor: '#080c12',
    borderTop: '1px solid #1e293b', flexShrink: 0,
  },
  runBtn: {
    padding: '9px 22px', backgroundColor: '#3b82f6', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700,
    transition: 'background .15s',
  },
  footerInfo: { fontSize: 12, color: '#475569' },
  errorMsg: { fontSize: 12, color: '#ef4444' },
};
