import React, { useState, useCallback } from 'react';
import HomeScreen    from './components/HomeScreen';
import AnalyzeFlow   from './components/AnalyzeFlow';
import ScenarioView  from './components/ScenarioView';
import ConfigCenter  from './components/ConfigCenter';

const DEFAULT_CONTEXT = {
  module: 'lease', country: 'FR', gaap: 'french_gaap', pma: false,
  projectGroup: { accrualEnabled: false, autoReverse: false },
  accountingCurrency: 'EUR',
};

const SAMPLE_SCENARIOS = {
  pma: {
    context: { module: 'pma', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: false, autoReverse: false }, accountingCurrency: 'EUR' },
    scenarios: [
      { id: 1, description: 'Project expense — wrong AP account', transactionType: 'Expense',
        expectedEntries: [
          { account: '622', description: 'External services', debit: 15000, credit: 0 },
          { account: '401', description: 'Trade payable',     debit: 0, credit: 15000 },
        ],
        actualEntries: [
          { account: '641', description: 'Salary expense (wrong)',  debit: 15000, credit: 0 },
          { account: '421', description: 'Personnel payable',       debit: 0, credit: 15000 },
        ],
      },
      { id: 2, description: 'WIP recognition — wrong revenue account', transactionType: 'WIP',
        expectedEntries: [
          { account: '3411', description: 'WIP goods in progress', debit: 50000, credit: 0 },
          { account: '706',  description: 'Services revenue',      debit: 0, credit: 50000 },
        ],
        actualEntries: [
          { account: '3411', description: 'WIP goods in progress', debit: 50000, credit: 0 },
          { account: '487',  description: 'Deferred income (wrong)', debit: 0, credit: 50000 },
        ],
      },
      { id: 3, description: 'Revenue recognition (correct)', transactionType: 'Revenue',
        expectedEntries: [
          { account: '411', description: 'Trade receivables', debit: 25000, credit: 0 },
          { account: '706', description: 'Services revenue',  debit: 0, credit: 25000 },
        ],
        actualEntries: [
          { account: '411', description: 'Trade receivables', debit: 25000, credit: 0 },
          { account: '706', description: 'Services revenue',  debit: 0, credit: 25000 },
        ],
      },
    ],
  },
  procurement: {
    context: { module: 'procurement', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: false, autoReverse: false }, accountingCurrency: 'EUR' },
    scenarios: [
      { id: 1, description: 'Vendor invoice — wrong AP account', transactionType: 'Invoice',
        expectedEntries: [
          { account: '601', description: 'Raw material purchases', debit: 80000, credit: 0 },
          { account: '401', description: 'Trade payables',         debit: 0, credit: 80000 },
        ],
        actualEntries: [
          { account: '601', description: 'Raw material purchases', debit: 80000, credit: 0 },
          { account: '408', description: 'Accrued invoices (wrong)', debit: 0, credit: 80000 },
        ],
      },
      { id: 2, description: 'Receipt accrual (correct)', transactionType: 'Accrual',
        expectedEntries: [
          { account: '311', description: 'Raw materials stock', debit: 40000, credit: 0 },
          { account: '408', description: 'Accrued invoices',    debit: 0, credit: 40000 },
        ],
        actualEntries: [
          { account: '311', description: 'Raw materials stock', debit: 40000, credit: 0 },
          { account: '408', description: 'Accrued invoices',    debit: 0, credit: 40000 },
        ],
      },
      { id: 3, description: 'FA invoice — wrong supplier account', transactionType: 'Invoice',
        expectedEntries: [
          { account: '2154', description: 'Equipment',           debit: 120000, credit: 0 },
          { account: '404',  description: 'FA supplier payable', debit: 0, credit: 120000 },
        ],
        actualEntries: [
          { account: '2154', description: 'Equipment',                    debit: 120000, credit: 0 },
          { account: '401',  description: 'General trade payable (wrong)', debit: 0, credit: 120000 },
        ],
      },
    ],
  },
  sales: {
    context: { module: 'sales', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: false, autoReverse: false }, accountingCurrency: 'EUR' },
    scenarios: [
      { id: 1, description: 'Customer invoice — deferred revenue error', transactionType: 'Invoice',
        expectedEntries: [
          { account: '411', description: 'Trade receivables', debit: 30000, credit: 0 },
          { account: '707', description: 'Goods sales revenue', debit: 0, credit: 30000 },
        ],
        actualEntries: [
          { account: '411', description: 'Trade receivables',         debit: 30000, credit: 0 },
          { account: '487', description: 'Deferred income (unintended)', debit: 0, credit: 30000 },
        ],
      },
      { id: 2, description: 'COGS — wrong accounts', transactionType: 'COGS',
        expectedEntries: [
          { account: '607', description: 'Cost of goods sold',  debit: 18000, credit: 0 },
          { account: '355', description: 'Finished goods stock', debit: 0, credit: 18000 },
        ],
        actualEntries: [
          { account: '601', description: 'Purchases (wrong)',    debit: 18000, credit: 0 },
          { account: '401', description: 'Trade payable (wrong)', debit: 0, credit: 18000 },
        ],
      },
    ],
  },
  pmaAccrual: {
    context: { module: 'pma', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: true, autoReverse: true }, accountingCurrency: 'EUR' },
    scenarios: [
      { id: 1, description: 'Accrual — correct with auto-reversal', transactionType: 'CostAccrual',
        expectedEntries: [
          { account: '6180', description: 'Cost accrual (forward)',   debit: 25000, credit: 0 },
          { account: '4871', description: 'Accrued costs (forward)',  debit: 0, credit: 25000 },
          { account: '4871', description: 'Accrued costs (reversal)', debit: 25000, credit: 0 },
          { account: '6180', description: 'Cost accrual (reversal)',  debit: 0, credit: 25000 },
        ],
        actualEntries: [
          { account: '6180', description: 'Cost accrual (forward)',   debit: 25000, credit: 0 },
          { account: '4871', description: 'Accrued costs (forward)',  debit: 0, credit: 25000 },
          { account: '4871', description: 'Accrued costs (reversal)', debit: 25000, credit: 0 },
          { account: '6180', description: 'Cost accrual (reversal)',  debit: 0, credit: 25000 },
        ],
      },
      { id: 2, description: 'Accrual — missing reversal', transactionType: 'CostAccrual',
        expectedEntries: [
          { account: '6220', description: 'Services accrual (forward)',  debit: 18000, credit: 0 },
          { account: '4871', description: 'Accrued costs (forward)',     debit: 0, credit: 18000 },
          { account: '4871', description: 'Reversal — BS account',       debit: 18000, credit: 0 },
          { account: '6220', description: 'Reversal — P&L account',      debit: 0, credit: 18000 },
        ],
        actualEntries: [
          { account: '6220', description: 'Services accrual (forward)', debit: 18000, credit: 0 },
          { account: '4871', description: 'Accrued costs (forward)',    debit: 0, credit: 18000 },
        ],
      },
    ],
  },
};

export default function App() {
  const [mode, setMode]   = useState(() => localStorage.getItem('d365_ui_mode') || 'simple');
  const [flow, setFlow]   = useState('home');
  const [analyzeStep, setAnalyzeStep] = useState(1);

  const [context,          setContext]          = useState(DEFAULT_CONTEXT);
  const [scenarios,        setScenarios]        = useState([]);
  const [importedData,     setImportedData]     = useState(null);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [isRunning,        setIsRunning]        = useState(false);
  const [runError,         setRunError]         = useState(null);

  const toggleMode = () => {
    const next = mode === 'simple' ? 'advanced' : 'simple';
    setMode(next);
    localStorage.setItem('d365_ui_mode', next);
  };

  const goTo = (newFlow, step = null) => {
    setFlow(newFlow);
    if (newFlow === 'analyze') setAnalyzeStep(step ?? (importedData ? 3 : 1));
    else if (step !== null) setAnalyzeStep(step);
    setRunError(null);
  };

  const runDiagnostic = useCallback(async () => {
    if (!window.electronAPI) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const resp = await window.electronAPI.runDiagnostic({ context, scenarios, voucherData: importedData });
      if (resp.success) {
        setDiagnosticResult(resp.result);
        setAnalyzeStep(4);
      } else {
        setRunError(resp.error || 'Analysis failed. Please check your data and settings.');
      }
    } catch (e) {
      setRunError(e.message);
    } finally {
      setIsRunning(false);
    }
  }, [context, scenarios, importedData]);

  const loadSample = useCallback((key) => {
    const sample = SAMPLE_SCENARIOS[key];
    if (!sample) return;
    setContext({ ...sample.context, accountingCurrency: 'EUR' });
    setScenarios(sample.scenarios);
    setDiagnosticResult(null);
    setRunError(null);
    goTo('scenario');
  }, []);

  const summary = diagnosticResult?.summary;

  return (
    <div style={S.app}>
      <AppHeader
        flow={flow} mode={mode} toggleMode={toggleMode}
        onHome={() => goTo('home')} summary={summary}
      />
      <main style={S.main}>
        {flow === 'home' && (
          <HomeScreen
            onAnalyze={() => goTo('analyze')}
            onScenario={() => goTo('scenario')}
            onConfig={() => goTo('config')}
            hasData={!!importedData}
            hasResult={!!diagnosticResult}
            result={diagnosticResult}
            onViewResults={() => goTo('analyze', 4)}
          />
        )}
        {flow === 'analyze' && (
          <AnalyzeFlow
            step={analyzeStep} setStep={setAnalyzeStep}
            importedData={importedData} setImportedData={setImportedData}
            context={context} setContext={setContext}
            result={diagnosticResult}
            isRunning={isRunning} runError={runError}
            onRun={runDiagnostic} mode={mode}
          />
        )}
        {flow === 'scenario' && (
          <ScenarioView
            scenarios={scenarios} setScenarios={setScenarios}
            context={context} setContext={setContext}
            result={diagnosticResult}
            isRunning={isRunning} runError={runError}
            onRun={runDiagnostic} onLoadSample={loadSample}
            mode={mode}
          />
        )}
        {flow === 'config' && (
          <ConfigCenter context={context} setContext={setContext} mode={mode} />
        )}
      </main>
    </div>
  );
}

// ─── App Header ───────────────────────────────────────────────────────────────
function AppHeader({ flow, mode, toggleMode, onHome, summary }) {
  const statusColor =
    summary?.overallStatus === 'critical' ? '#ef4444' :
    summary?.overallStatus === 'error'    ? '#f97316' :
    summary?.overallStatus === 'warning'  ? '#f59e0b' :
    summary                               ? '#22c55e' : null;

  const FLOW_LABELS = { analyze: 'Analyze Vouchers', scenario: 'Build Scenario', config: 'Configuration' };

  return (
    <header style={S.header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={S.logo}>
          <span style={S.logoIcon}>D</span>
          <span style={S.logoText}>D365 Diagnostic</span>
        </div>
        {flow !== 'home' && (
          <>
            <span style={S.sep}>/</span>
            <button onClick={onHome} style={S.crumb}>Home</button>
            <span style={S.sep}>/</span>
            <span style={S.crumbActive}>{FLOW_LABELS[flow]}</span>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={S.modeToggle}>
        <button
          onClick={() => mode !== 'simple' && toggleMode()}
          style={{ ...S.modeBtn, ...(mode === 'simple' ? S.modeBtnOn : S.modeBtnOff) }}
        >Simple</button>
        <button
          onClick={() => mode !== 'advanced' && toggleMode()}
          style={{ ...S.modeBtn, ...(mode === 'advanced' ? S.modeBtnOn : S.modeBtnOff) }}
        >Advanced</button>
      </div>

      {summary && statusColor && (
        <div style={{ ...S.statusPill, borderColor: statusColor, color: statusColor }}>
          {(summary.overallStatus || 'CLEAN').toUpperCase()}
          &nbsp;·&nbsp;{summary.totalIssues} issue{summary.totalIssues !== 1 ? 's' : ''}
        </div>
      )}
    </header>
  );
}

const S = {
  app:         { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0f1117', color: '#e2e8f0', overflow: 'hidden' },
  main:        { flex: 1, overflowY: 'auto' },
  header:      { display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 52, backgroundColor: '#0d1219', borderBottom: '1px solid #1e293b', flexShrink: 0 },
  logo:        { display: 'flex', alignItems: 'center', gap: 10 },
  logoIcon:    { width: 30, height: 30, borderRadius: 7, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: '#fff', flexShrink: 0 },
  logoText:    { fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: -0.3 },
  sep:         { color: '#334155', margin: '0 8px', fontSize: 14 },
  crumb:       { background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0, transition: 'color .15s' },
  crumbActive: { fontSize: 13, color: '#94a3b8', fontWeight: 600 },
  modeToggle:  { display: 'flex', background: '#1a1f2e', border: '1px solid #1e293b', borderRadius: 6, padding: 2, gap: 2 },
  modeBtn:     { padding: '4px 12px', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' },
  modeBtnOn:   { background: '#3b82f6', color: '#fff' },
  modeBtnOff:  { background: 'transparent', color: '#475569' },
  statusPill:  { padding: '3px 12px', borderRadius: 999, border: '1px solid', fontSize: 11, fontWeight: 700, letterSpacing: .5, flexShrink: 0 },
};
