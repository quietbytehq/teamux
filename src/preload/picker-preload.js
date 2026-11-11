// src/preload/picker-preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pickerAPI', {
  onSources: (callback) => {
    ipcRenderer.on('populate-sources', (_event, sources) => callback(sources));
  },
  selectSource: (sourceId) => {
    ipcRenderer.send('screen-picker-select', sourceId);
  },
  cancel: () => {
    ipcRenderer.send('screen-picker-cancel');
  }
});
