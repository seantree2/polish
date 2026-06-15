// Bridges the settings window to the main process. Only these functions are
// exposed to the page — no direct Node or filesystem access in the renderer.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('polish', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  testConnection: () => ipcRenderer.invoke('test-connection'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  permStatus: () => ipcRenderer.invoke('perm-status'),
  openAccessibilitySettings: () => ipcRenderer.invoke('open-accessibility-settings'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
});
