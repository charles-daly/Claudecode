const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f1117',
    title: 'D365 Diagnostic Engine',
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// ─── IPC: Open & parse Excel ─────────────────────────────────
ipcMain.handle('dialog:openExcel', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Excel File with Voucher Entries',
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
  });

  if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };

  try {
    const { parseExcelFile } = require('./src/engine/excelParser');
    const { validateDualGaap } = require('./src/engine/gaapValidationEngine');
    const data = parseExcelFile(result.filePaths[0]);

    // Run dual-GAAP validation on each sheet so the import preview
    // can show mapping status immediately without a separate diagnostic run.
    Object.keys(data).forEach(sheetName => {
      data[sheetName].gaapValidation = validateDualGaap(data[sheetName], {});
    });

    return { success: true, data, filePath: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Run diagnostic engine ───────────────────────────────
ipcMain.handle('engine:runDiagnostic', async (_event, payload) => {
  try {
    const { runDiagnostic } = require('./src/engine/diagnosticEngine');
    const result = runDiagnostic(payload);
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Export to Excel ─────────────────────────────────────
ipcMain.handle('export:excel', async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Diagnostic Report',
    defaultPath: `D365_Diagnostic_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    const { exportToExcel } = require('./src/engine/exportEngine');
    await exportToExcel({ ...payload, filePath: result.filePath });
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Export to Word ──────────────────────────────────────
ipcMain.handle('export:word', async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Consulting Report',
    defaultPath: `D365_Consulting_Report_${new Date().toISOString().slice(0, 10)}.docx`,
    filters: [{ name: 'Word Documents', extensions: ['docx'] }],
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    const { exportToWord } = require('./src/engine/exportEngine');
    await exportToWord({ ...payload, filePath: result.filePath });
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Load sample data ────────────────────────────────────
ipcMain.handle('data:loadSample', async () => {
  try {
    const samplePath = isDev
      ? path.join(__dirname, 'data', 'sample-vouchers.json')
      : path.join(process.resourcesPath, 'data', 'sample-vouchers.json');
    const raw  = fs.readFileSync(samplePath, 'utf-8');
    const json = JSON.parse(raw);

    // Build computed voucher groups and gaapValidation for each sheet
    const { groupByVoucher, calcStats } = require('./src/engine/excelParser');
    const { validateDualGaap }          = require('./src/engine/gaapValidationEngine');

    const data = {};
    Object.entries(json).forEach(([sheetName, sheetRaw]) => {
      const entries  = sheetRaw.entries || [];
      const vouchers = groupByVoucher(entries);
      const stats    = calcStats(entries);
      const sheet    = { entries, vouchers, stats };
      sheet.gaapValidation = validateDualGaap(sheet, {});
      data[sheetName] = sheet;
    });

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Download import template ───────────────────────────
ipcMain.handle('data:downloadTemplate', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Import Template',
    defaultPath: 'D365_Import_Template.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    const { generateTemplateExcel } = require('./src/engine/excelParser');
    generateTemplateExcel(result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Generate sample Excel file ─────────────────────────
ipcMain.handle('data:generateSampleExcel', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Sample Excel File',
    defaultPath: 'D365_Sample_Vouchers.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    const { generateSampleExcel } = require('./src/engine/excelParser');
    generateSampleExcel(result.filePath);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Run automated test suite ───────────────────────────
ipcMain.handle('engine:runTests', async () => {
  try {
    const { runAllTests } = require('./src/engine/testEngine');
    const result = runAllTests();
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Fetch engine logs ───────────────────────────────────
ipcMain.handle('engine:getLogs', async (_event, filter = {}) => {
  try {
    const logger = require('./src/engine/logger');
    return { success: true, logs: logger.getLogs(filter), stats: logger.stats() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Reveal file in Explorer ────────────────────────────
ipcMain.handle('shell:showFile', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

// ─── IPC: GAAP Mapping CRUD ───────────────────────────────────
ipcMain.handle('gaap:getAll', async () => {
  try {
    const { getAllMappings } = require('./src/engine/gaapMappingEngine');
    return { success: true, mappings: getAllMappings() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gaap:add', async (_event, mapping) => {
  try {
    const { addMapping } = require('./src/engine/gaapMappingEngine');
    return addMapping(mapping);
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
});

ipcMain.handle('gaap:update', async (_event, id, updates) => {
  try {
    const { updateMapping } = require('./src/engine/gaapMappingEngine');
    return updateMapping(id, updates);
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
});

ipcMain.handle('gaap:delete', async (_event, id) => {
  try {
    const { deleteMapping } = require('./src/engine/gaapMappingEngine');
    return deleteMapping(id);
  } catch (err) {
    return { success: false, errors: [err.message] };
  }
});

// ─── IPC: GAAP Mapping Import (preview) ──────────────────────
ipcMain.handle('gaap:importPreview', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Mapping File to Import',
    properties: ['openFile'],
    filters: [
      { name: 'Spreadsheet / CSV', extensions: ['xlsx', 'xls', 'csv'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  try {
    const { previewImport } = require('./src/engine/mappingImportEngine');
    return previewImport(result.filePaths[0]);
  } catch (err) {
    return { success: false, rows: [], stats: {}, errors: [err.message] };
  }
});

// ─── IPC: GAAP Mapping Import (apply) ────────────────────────
ipcMain.handle('gaap:importApply', async (_event, rows, opts) => {
  try {
    const { applyImport } = require('./src/engine/mappingImportEngine');
    return applyImport(rows, opts || {});
  } catch (err) {
    return { success: false, added: 0, updated: 0, skipped: 0, errors: [err.message] };
  }
});

// ─── IPC: GAAP Mapping Export ─────────────────────────────────
ipcMain.handle('gaap:exportMappings', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export GAAP Mappings',
    defaultPath: `GAAP_Mappings_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [
      { name: 'Excel Files', extensions: ['xlsx'] },
      { name: 'CSV Files',   extensions: ['csv'] },
    ],
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    const { getAllMappings } = require('./src/engine/gaapMappingEngine');
    const XLSX = require('xlsx');
    const mappings = getAllMappings();

    const rows = mappings.map(m => ({
      ID:           m.id,
      US_Account:   m.usAccount,
      FR_Account:   m.frAccount,
      BE_Account:   m.beAccount || '',
      Type:         m.type,
      Description:  m.description || '',
      Module:       m.module || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'GAAP Mappings');
    XLSX.writeFile(wb, result.filePath);

    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Suggest fixes ───────────────────────────────────────
ipcMain.handle('engine:suggestFixes', async (_event, result, context) => {
  try {
    const { suggestFixesForResult } = require('./src/engine/correctionEngine');
    return suggestFixesForResult(result, context || {});
  } catch (err) {
    return { fixes: [], groups: {}, summary: {}, error: err.message };
  }
});

// ─── IPC: Run simulation ──────────────────────────────────────
ipcMain.handle('engine:runSimulation', async (_event, parsedData, context, modifications) => {
  try {
    const { runSimulation } = require('./src/engine/simulationEngine');
    return runSimulation(parsedData, context || {}, modifications || {});
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Build financial statements ─────────────────────────
ipcMain.handle('engine:buildFinancials', async (_event, voucherData) => {
  try {
    const { buildAllStatements } = require('./src/engine/financialStatementEngine');
    return buildAllStatements(voucherData);
  } catch (err) {
    return { error: err.message };
  }
});

// ─── IPC: Analyse patterns ────────────────────────────────────
ipcMain.handle('engine:analysePatterns', async (_event, diagnosticResult) => {
  try {
    const { analysePatterns } = require('./src/engine/patternEngine');
    return analysePatterns(diagnosticResult);
  } catch (err) {
    return { error: err.message };
  }
});

// ─── IPC: Test Lab — get templates ───────────────────────────
ipcMain.handle('testlab:getTemplates', async () => {
  try {
    const { getTemplates } = require('./src/engine/testLabEngine');
    return getTemplates();
  } catch (err) {
    return [];
  }
});

// ─── IPC: Test Lab — generate test case ──────────────────────
ipcMain.handle('testlab:generateCase', async (_event, config) => {
  try {
    const { generateTestCase } = require('./src/engine/testLabEngine');
    return generateTestCase(config);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── IPC: Test Lab — run test case ───────────────────────────
ipcMain.handle('testlab:runCase', async (_event, testCase) => {
  try {
    const { runTestCase } = require('./src/engine/testLabEngine');
    return runTestCase(testCase);
  } catch (err) {
    return { success: false, passed: false, error: err.message };
  }
});

// ─── IPC: Test Lab — export results ──────────────────────────
ipcMain.handle('testlab:exportResults', async (_event, testCase, testResult) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Test Results',
    defaultPath: `TestLab_${(testCase?.id || 'result')}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    const { exportTestResults } = require('./src/engine/testLabEngine');
    return exportTestResults(testCase, testResult, result.filePath);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
