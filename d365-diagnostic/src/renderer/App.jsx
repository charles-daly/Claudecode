import React, { useState, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ContextSelector from './components/ContextSelector';
import ScenarioBuilder from './components/ScenarioBuilder';
import ExcelImport from './components/ExcelImport';
import DiagnosticResults from './components/DiagnosticResults';
import VoucherAnalysis from './components/VoucherAnalysis';
import ExportPanel from './components/ExportPanel';
import GaapMapping from './components/GaapMapping';
import FinancialImpact from './components/FinancialImpact';

const DEFAULT_CONTEXT = {
  module: 'lease', country: 'FR', gaap: 'french_gaap', pma: false,
  projectGroup: { accrualEnabled: false, autoReverse: false },
  accountingCurrency: 'EUR',
};

// ─── Built-in sample scenarios ────────────────────────────────────────────────
const SAMPLE_SCENARIOS = {
  pma: {
    context: { module: 'pma', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: false, autoReverse: false },
    },
    scenarios: [
      {
        id: 1,
        description: 'PMA — Project expense with wrong AP account',
        transactionType: 'Expense',
        expectedEntries: [
          { account: '622', description: 'External services expense', debit: 15000, credit: 0 },
          { account: '401', description: 'Trade payable',            debit: 0, credit: 15000 },
        ],
        actualEntries: [
          { account: '641', description: 'Salary expense (wrong)',   debit: 15000, credit: 0 },
          { account: '421', description: 'Personnel payable',        debit: 0, credit: 15000 },
        ],
      },
      {
        id: 2,
        description: 'PMA — WIP recognition uses wrong revenue account',
        transactionType: 'WIP',
        expectedEntries: [
          { account: '3411', description: 'WIP — goods in progress', debit: 50000, credit: 0     },
          { account: '706',  description: 'Services revenue',        debit: 0,     credit: 50000 },
        ],
        actualEntries: [
          { account: '3411', description: 'WIP — goods in progress', debit: 50000, credit: 0     },
          { account: '487',  description: 'Deferred income (wrong)', debit: 0,     credit: 50000 },
        ],
      },
      {
        id: 3,
        description: 'PMA — Revenue recognition (correct)',
        transactionType: 'Revenue',
        expectedEntries: [
          { account: '411', description: 'Trade receivables', debit: 25000, credit: 0     },
          { account: '706', description: 'Services revenue',  debit: 0,     credit: 25000 },
        ],
        actualEntries: [
          { account: '411', description: 'Trade receivables', debit: 25000, credit: 0     },
          { account: '706', description: 'Services revenue',  debit: 0,     credit: 25000 },
        ],
      },
    ],
  },

  procurement: {
    context: { module: 'procurement', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: false, autoReverse: false },
    },
    scenarios: [
      {
        id: 1,
        description: 'Procurement — Invoice uses wrong AP account',
        transactionType: 'Invoice',
        expectedEntries: [
          { account: '601', description: 'Raw material purchases', debit: 80000, credit: 0     },
          { account: '401', description: 'Trade payables',         debit: 0,     credit: 80000 },
        ],
        actualEntries: [
          { account: '601', description: 'Raw material purchases', debit: 80000, credit: 0     },
          { account: '408', description: 'Accrued invoices (wrong)', debit: 0,   credit: 80000 },
        ],
      },
      {
        id: 2,
        description: 'Procurement — Receipt accrual (correct 408 usage)',
        transactionType: 'Accrual',
        expectedEntries: [
          { account: '311', description: 'Raw materials stock',   debit: 40000, credit: 0     },
          { account: '408', description: 'Accrued invoices',      debit: 0,     credit: 40000 },
        ],
        actualEntries: [
          { account: '311', description: 'Raw materials stock',   debit: 40000, credit: 0     },
          { account: '408', description: 'Accrued invoices',      debit: 0,     credit: 40000 },
        ],
      },
      {
        id: 3,
        description: 'Procurement — FA invoice uses trade payable instead of 404',
        transactionType: 'Invoice',
        expectedEntries: [
          { account: '2154', description: 'Equipment (FA)',         debit: 120000, credit: 0      },
          { account: '404',  description: 'FA supplier payable',   debit: 0,      credit: 120000 },
        ],
        actualEntries: [
          { account: '2154', description: 'Equipment (FA)',         debit: 120000, credit: 0      },
          { account: '401',  description: 'General trade payable (wrong)', debit: 0, credit: 120000 },
        ],
      },
    ],
  },

  pmaAccrual: {
    context: {
      module: 'pma', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: true, autoReverse: true },
    },
    scenarios: [
      {
        id: 1,
        description: 'Accrual — Correct cost accrual with auto-reversal (clean)',
        transactionType: 'CostAccrual',
        expectedEntries: [
          { account: '6180',  description: 'Project cost accrual (P&L forward)',    debit: 25000, credit: 0     },
          { account: '4871',  description: 'Accrued project costs (BS forward)',     debit: 0,     credit: 25000 },
          { account: '4871',  description: 'Accrued project costs (BS reversal)',    debit: 25000, credit: 0     },
          { account: '6180',  description: 'Project cost accrual (P&L reversal)',    debit: 0,     credit: 25000 },
        ],
        actualEntries: [
          { account: '6180',  description: 'Project cost accrual (P&L forward)',    debit: 25000, credit: 0     },
          { account: '4871',  description: 'Accrued project costs (BS forward)',     debit: 0,     credit: 25000 },
          { account: '4871',  description: 'Accrued project costs (BS reversal)',    debit: 25000, credit: 0     },
          { account: '6180',  description: 'Project cost accrual (P&L reversal)',    debit: 0,     credit: 25000 },
        ],
      },
      {
        id: 2,
        description: 'Accrual — Wrong BS account (52000 used instead of 4871)',
        transactionType: 'CostAccrual',
        expectedEntries: [
          { account: '6180',  description: 'Project cost accrual (P&L forward)',    debit: 30000, credit: 0     },
          { account: '4871',  description: 'Accrued project costs (BS forward)',     debit: 0,     credit: 30000 },
          { account: '4871',  description: 'Reversal — BS account',                  debit: 30000, credit: 0     },
          { account: '6180',  description: 'Reversal — P&L account',                 debit: 0,     credit: 30000 },
        ],
        actualEntries: [
          { account: '6180',  description: 'Project cost accrual (P&L forward)',    debit: 30000, credit: 0     },
          { account: '52000', description: 'Other financial account (wrong BS)',     debit: 0,     credit: 30000 },
          { account: '52000', description: 'Reversal — wrong BS account',            debit: 30000, credit: 0     },
          { account: '6180',  description: 'Reversal — P&L account',                 debit: 0,     credit: 30000 },
        ],
      },
      {
        id: 3,
        description: 'Accrual — Missing auto-reversal (only forward entries posted)',
        transactionType: 'CostAccrual',
        expectedEntries: [
          { account: '6220',  description: 'External services accrual (P&L forward)', debit: 18000, credit: 0     },
          { account: '4871',  description: 'Accrued costs (BS forward)',               debit: 0,     credit: 18000 },
          { account: '4871',  description: 'Reversal — BS account',                    debit: 18000, credit: 0     },
          { account: '6220',  description: 'Reversal — P&L account',                   debit: 0,     credit: 18000 },
        ],
        actualEntries: [
          { account: '6220',  description: 'External services accrual (P&L forward)', debit: 18000, credit: 0     },
          { account: '4871',  description: 'Accrued costs (BS forward)',               debit: 0,     credit: 18000 },
        ],
      },
    ],
  },

  sales: {
    context: { module: 'sales', country: 'FR', gaap: 'french_gaap', pma: false,
      projectGroup: { accrualEnabled: false, autoReverse: false },
    },
    scenarios: [
      {
        id: 1,
        description: 'Sales — Invoice with deferred revenue (wrong account)',
        transactionType: 'Invoice',
        expectedEntries: [
          { account: '411', description: 'Trade receivables', debit: 30000, credit: 0     },
          { account: '707', description: 'Goods sales revenue', debit: 0,   credit: 30000 },
        ],
        actualEntries: [
          { account: '411', description: 'Trade receivables', debit: 30000, credit: 0     },
          { account: '487', description: 'Deferred income (unintended)', debit: 0, credit: 30000 },
        ],
      },
      {
        id: 2,
        description: 'Sales — COGS uses purchase account instead of stock movement',
        transactionType: 'COGS',
        expectedEntries: [
          { account: '607',  description: 'Cost of goods sold',  debit: 18000, credit: 0     },
          { account: '355',  description: 'Finished goods stock', debit: 0,    credit: 18000 },
        ],
        actualEntries: [
          { account: '601',  description: 'Purchases (wrong)',   debit: 18000, credit: 0     },
          { account: '401',  description: 'Trade payable (wrong)',debit: 0,    credit: 18000 },
        ],
      },
      {
        id: 3,
        description: 'Sales — Revenue recognition release (correct)',
        transactionType: 'Revenue',
        expectedEntries: [
          { account: '487', description: 'Deferred revenue release', debit: 10000, credit: 0     },
          { account: '706', description: 'Services revenue',         debit: 0,     credit: 10000 },
        ],
        actualEntries: [
          { account: '487', description: 'Deferred revenue release', debit: 10000, credit: 0     },
          { account: '706', description: 'Services revenue',         debit: 0,     credit: 10000 },
        ],
      },
    ],
  },
};

export default function App() {
  const [activeTab,        setActiveTab]        = useState('context');
  const [context,          setContext]           = useState(DEFAULT_CONTEXT);
  const [scenarios,        setScenarios]         = useState([]);
  const [importedData,     setImportedData]      = useState(null);
  const [diagnosticResult, setDiagnosticResult]  = useState(null);
  const [isRunning,        setIsRunning]         = useState(false);
  const [runError,         setRunError]          = useState(null);

  const loadSample = useCallback((sampleKey) => {
    const sample = SAMPLE_SCENARIOS[sampleKey];
    if (!sample) return;
    setContext(sample.context);
    setScenarios(sample.scenarios);
    setActiveTab('scenarios');
    setDiagnosticResult(null);
    setRunError(null);
  }, []);

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
      case 'gaap':      return <GaapMapping />;
      case 'results':   return <DiagnosticResults result={diagnosticResult} isRunning={isRunning} />;
      case 'vouchers':  return <VoucherAnalysis result={diagnosticResult} />;
      case 'impact':    return <FinancialImpact result={diagnosticResult} setActiveTab={setActiveTab} />;
      case 'export':    return <ExportPanel diagnosticResult={diagnosticResult} context={context} />;
      case 'samples':   return <SamplePanel onLoad={loadSample} />;
      default:          return null;
    }
  };

  const summary      = diagnosticResult?.summary;
  const statusColor  =
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

        {/* Sample loaders */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'pma',         label: 'PMA Sample',          color: '#8b5cf6' },
            { key: 'procurement', label: 'Procurement Sample',   color: '#f59e0b' },
            { key: 'sales',       label: 'Sales Sample',         color: '#22c55e' },
            { key: 'pmaAccrual',  label: 'Accrual Sample',       color: '#6366f1' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => loadSample(s.key)}
              style={{ ...S.sampleBtn, borderColor: s.color, color: s.color }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {runError && <span style={S.errorMsg}>⚠ {runError}</span>}

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

// ─── Sample scenarios info panel ──────────────────────────────────────────────
function SamplePanel({ onLoad }) {
  const samples = [
    { key: 'pma',         title: 'PMA — Project Management & Accounting', color: '#8b5cf6',
      desc: '3 scenarios: project expense with wrong account, WIP recognition error, correct revenue entry.' },
    { key: 'procurement', title: 'Procurement (Procure-to-Pay)',          color: '#f59e0b',
      desc: '3 scenarios: invoice with wrong AP (408 instead of 401), correct receipt accrual, FA invoice using trade payable instead of 404.' },
    { key: 'sales',       title: 'Sales (Order-to-Cash)',                 color: '#22c55e',
      desc: '3 scenarios: invoice deferred unintentionally, COGS using purchase accounts, correct revenue recognition release.' },
    { key: 'pmaAccrual',  title: 'PMA — Accrual / Auto-Reversal Engine',  color: '#6366f1',
      desc: '3 scenarios with Project Group accrual enabled: correct auto-reversal (clean), wrong BS account (4871 → 52000), and missing reversal (only forward entries posted). Activates deep accrual pattern diagnostics.' },
  ];
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Sample Scenarios</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Load a built-in scenario pack to explore the diagnostic engine with realistic D365 accounting examples.
          Each pack includes correct and incorrect entries across the module's transaction types.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {samples.map(s => (
          <div key={s.key} style={{ ...S.sampleCard, borderColor: s.color + '40' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{s.desc}</div>
            </div>
            <button
              onClick={() => onLoad(s.key)}
              style={{ ...S.runBtn, background: s.color, padding: '8px 18px', flexShrink: 0 }}
            >
              Load Sample
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const S = {
  app: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0f1117', color: '#e2e8f0', overflow: 'hidden' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, overflowY: 'auto', padding: '24px' },
  footer: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '10px 24px', backgroundColor: '#080c12',
    borderTop: '1px solid #1e293b', flexShrink: 0,
  },
  runBtn: {
    padding: '9px 22px', backgroundColor: '#3b82f6', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer',
    transition: 'background .15s',
  },
  sampleBtn: {
    padding: '6px 12px', background: 'transparent',
    border: '1px solid', borderRadius: 5, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity .15s',
  },
  sampleCard: {
    display: 'flex', alignItems: 'center', gap: 20,
    background: '#1a1f2e', border: '1px solid', borderRadius: 10, padding: '16px 20px',
  },
  footerInfo: { fontSize: 12, color: '#475569' },
  errorMsg:   { fontSize: 12, color: '#ef4444' },
};
