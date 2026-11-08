'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit API surface exposed to the game UI.
contextBridge.exposeInMainWorld('poolAPI', {
  isElectron: true,
  readStorage: (name) => ipcRenderer.invoke('storage:read', name),
  writeStorage: (name, text) => ipcRenderer.invoke('storage:write', name, text),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  applyWindow: (opts) => ipcRenderer.invoke('window:apply', opts),
  quit: () => ipcRenderer.send('app:quit'),
});
