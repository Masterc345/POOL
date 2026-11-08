'use strict';
// PoolMaster3D - Electron main process (CommonJS; see electron/package.json)
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || '';
const STORAGE_NAMES = new Set(['settings', 'stats']);

// Keep user data in a stable folder (%APPDATA%\PoolMaster3D) so the uninstaller can find it.
app.setName('PoolMaster3D');
app.setPath('userData', path.join(app.getPath('appData'), 'PoolMaster3D'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

function storageFile(name) {
  return path.join(app.getPath('userData'), `${name}.json`);
}

function registerIpc() {
  ipcMain.handle('storage:read', (_e, name) => {
    if (!STORAGE_NAMES.has(name)) return null;
    try {
      return fs.readFileSync(storageFile(name), 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('storage:write', (_e, name, text) => {
    if (!STORAGE_NAMES.has(name) || typeof text !== 'string' || text.length > 1_000_000) return false;
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      const target = storageFile(name);
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, text, 'utf8');
      fs.renameSync(tmp, target);
      return true;
    } catch (err) {
      console.error('storage write failed', err);
      return false;
    }
  });

  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
  }));

  ipcMain.handle('window:apply', (_e, opts = {}) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const fullscreen = !!opts.fullscreen;
    if (mainWindow.isFullScreen() !== fullscreen) mainWindow.setFullScreen(fullscreen);
    if (!fullscreen && Number.isInteger(opts.width) && Number.isInteger(opts.height)) {
      const w = Math.min(Math.max(opts.width, 960), 7680);
      const h = Math.min(Math.max(opts.height, 600), 4320);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      mainWindow.setContentSize(w, h);
      mainWindow.center();
    }
    return true;
  });

  ipcMain.on('app:quit', () => app.quit());
}

function verifyPackagedAssets() {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  if (!DEV_URL && !fs.existsSync(indexPath)) {
    dialog.showErrorBox(
      'PoolMaster3D',
      'Game files are missing or damaged.\nPlease reinstall PoolMaster3D.\n\nMissing: ' + indexPath
    );
    return false;
  }
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'PoolMaster3D',
    backgroundColor: '#0b1410',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Never navigate away from the game and never open extra windows.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) e.preventDefault();
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    dialog.showErrorBox('PoolMaster3D', `The game could not be loaded (${code}: ${desc}).`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    dialog.showErrorBox('PoolMaster3D', `The game stopped unexpectedly (${details.reason}).`);
  });

  // F11 toggles fullscreen. F12 only in development builds.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' && !app.isPackaged) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  if (DEV_URL) mainWindow.loadURL(DEV_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerIpc();
  if (!verifyPackagedAssets()) { app.quit(); return; }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
