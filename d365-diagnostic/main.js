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
    const data = parseExcelFile(result.filePaths[0]);
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
    const raw = fs.readFileSync(samplePath, 'utf-8');
    return { success: true, data: JSON.parse(raw) };
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

// ─── IPC: Reveal file in Explorer ────────────────────────────
ipcMain.handle('shell:showFile', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
  return { success: true };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
