const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importExcel:          ()       => ipcRenderer.invoke('dialog:openExcel'),
  runDiagnostic:        (data)   => ipcRenderer.invoke('engine:runDiagnostic', data),
  exportExcel:          (data)   => ipcRenderer.invoke('export:excel', data),
  exportWord:           (data)   => ipcRenderer.invoke('export:word', data),
  loadSampleData:       ()       => ipcRenderer.invoke('data:loadSample'),
  generateSampleExcel:  ()       => ipcRenderer.invoke('data:generateSampleExcel'),
  showFile:             (path)   => ipcRenderer.invoke('shell:showFile', path),
});
