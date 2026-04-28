# D365 Diagnostic Engine

A fully offline Electron desktop application for diagnosing Microsoft Dynamics 365 Finance accounting logic errors in Lease and Fixed Asset modules.

---

## Quick Start (Development)

### Prerequisites

- Node.js 18+ (https://nodejs.org)
- npm 9+

### Install & Run

```bash
cd d365-diagnostic
npm install
npm run dev
```

This starts the Vite dev server on `localhost:5173` and launches Electron automatically.

---

## Build as Windows .exe

```bash
npm run dist:win
```

Output is in `release/`. The installer is an NSIS `.exe` that allows the user to choose installation directory.

Or for a portable build without installer:
```bash
npm run build
npx electron-builder --win portable
```

---

## Project Structure

```
d365-diagnostic/
├── main.js                       # Electron main process + IPC handlers
├── preload.js                    # Secure contextBridge API
├── index.html                    # Vite HTML entry point
├── vite.config.js
├── package.json
│
├── src/
│   ├── engine/                   # Node.js logic (runs in main process)
│   │   ├── accountingRules.js    # D365 account rules, root causes, PCG/US accounts
│   │   ├── diagnosticEngine.js   # Master diagnostic orchestrator
│   │   ├── excelParser.js        # Excel import + sample file generator
│   │   ├── voucherAnalyzer.js    # Per-voucher issue detection
│   │   └── exportEngine.js       # Excel (ExcelJS) + Word (docx) export
│   │
│   └── renderer/                 # React app (runs in renderer process)
│       ├── main.jsx
│       ├── App.jsx
│       ├── styles/global.css
│       └── components/
│           ├── Header.jsx          # App header with context chips
│           ├── Sidebar.jsx         # Navigation sidebar
│           ├── ContextSelector.jsx # Module / Country / GAAP / PMA
│           ├── ScenarioBuilder.jsx # Expected vs actual entry builder
│           ├── ExcelImport.jsx     # File import + preview
│           ├── DiagnosticResults.jsx # Summary + findings dashboard
│           ├── VoucherAnalysis.jsx # Drill-down with filter/search
│           └── ExportPanel.jsx     # Excel / Word export
│
└── data/
    └── sample-vouchers.json      # Built-in sample voucher data
```

---

## Features

### Context Selector
Select the diagnostic context before running:
- **Module**: Lease (IFRS 16) or Fixed Assets
- **Country**: France (PCG accounts) or United States
- **GAAP**: French GAAP / US GAAP / Dual GAAP
- **PMA**: Toggle French provision-pour-mise-en-amortissement detection

### Scenario Builder
Manually define expected vs actual journal entries for any transaction type:
- Lease: Recognition / Depreciation / Interest Accrual / Payment
- Fixed Assets: Acquisition / Depreciation / Disposal

### Excel Import
Load a D365 journal entry export file (.xlsx / .xls):
- Auto-detects column names (English & French)
- Groups entries by voucher ID
- Shows balance status per voucher
- Supports multiple sheets

Use **"Download Sample Excel"** to get a pre-populated test file with known errors.

### Diagnostic Engine
Analyses all data and identifies:
- **RC-001** Incorrect account mapping (e.g., 661 instead of 6618 for lease interest)
- **RC-002** Unbalanced vouchers (DR ≠ CR)
- **RC-003** Missing expected entries (batch job not run)
- **RC-004** Missing PMA entry (when PMA is active)
- **RC-005** Possible duplicate vouchers
- Known D365 misconfiguration patterns

### Voucher Drill-down
Filter and search all analysed vouchers with:
- Severity filter (critical / high / warnings / clean)
- Full-text search by voucher ID, account, description
- Line-level issue details with root causes and D365 fix paths

### Export Engine
- **Excel**: Multi-sheet workbook (Executive Summary, Vouchers, Scenario Analysis, Root Cause Analysis) — colour coded, auto-filtered
- **Word**: Full consulting document (context, executive summary, root cause analysis, recommendations)

All exports are saved locally. No internet connection required.

---

## Sample Data Errors Demonstrated

| Voucher       | Error                                      | Root Cause |
|---------------|---------------------------------------------|------------|
| LA-2024-002   | Account 661 used instead of 6618 (interest) | RC-001     |
| LP-2024-004   | Unbalanced — missing interest debit line    | RC-002     |
| FA-2024-005   | Account 401 instead of 404 (FA supplier)   | RC-001     |

---

## IPC Architecture

```
Renderer (React)          Preload (contextBridge)      Main Process (Node.js)
─────────────────         ──────────────────────       ──────────────────────
window.electronAPI   ──►  ipcRenderer.invoke      ──►  ipcMain.handle
                           dialog:openExcel             → excelParser
                           engine:runDiagnostic          → diagnosticEngine
                           export:excel                  → exportEngine (ExcelJS)
                           export:word                   → exportEngine (docx)
                           data:loadSample               → fs.readFileSync
                           shell:showFile                → shell.showItemInFolder
```

---

## Dependencies

| Package       | Purpose                     |
|---------------|-----------------------------|
| electron      | Desktop app framework       |
| react         | UI library                  |
| vite          | Bundler for renderer        |
| xlsx          | Excel file parsing (import) |
| exceljs       | Excel file generation       |
| docx          | Word document generation    |
