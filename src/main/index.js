// src/main/index.js
// Main process entry point for Teamux

const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');
const { SettingsStore } = require('./store');
const { configureAppFlags } = require('./flags');
const { setupUserAgent } = require('./user-agent');
const { setupMediaHandlers } = require('./media-handler');
const { createTray, setTrayUnreadCount } = require('./tray');
const { buildAppMenu } = require('./menu');

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// 2. Initialize Persistent Store
const store = new SettingsStore();

// 3. Configure Chromium & Linux / Wayland / PipeWire Flags
configureAppFlags(store);

let mainWindow = null;
let settingsWindow = null;
app.isQuitting = false;

async function createMainWindow() {
  const bounds = store.get('windowBounds', { width: 1280, height: 820 });
  const isMaximized = store.get('isMaximized', false);
  const startMinimized = store.get('startMinimized', false);

  const iconPath = path.join(__dirname, '../../assets/icon.png');

  mainWindow = new BrowserWindow({
    title: 'Teamux - Microsoft Teams',
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    show: !startMinimized,
    icon: iconPath,
    backgroundColor: '#1b1b1e',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/teams-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      backgroundThrottling: false // Keep WebRTC active in background
    }
  });

  if (isMaximized && !startMinimized) {
    mainWindow.maximize();
  }

  // Remember window dimensions and state
  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      store.set('windowBounds', mainWindow.getBounds());
    }
    store.set('isMaximized', mainWindow.isMaximized());
  };

  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

  // Close to tray behavior
  mainWindow.on('close', (event) => {
    if (!app.isQuitting && store.get('closeToTray', true)) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    saveBounds();
  });

  // Minimize to tray behavior
  mainWindow.on('minimize', (event) => {
    if (store.get('minimizeToTray', true)) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // External link handling: open non-Teams web links in external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isTeamsDomain = /(teams\.microsoft\.com|teams\.live\.com|login\.microsoftonline\.com|login\.live\.com|account\.live\.com)/i.test(url);
    if (!isTeamsDomain) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Load configured Teams URL
  const teamsUrl = store.get('teamsUrl', 'https://teams.microsoft.com/v2/');
  console.log(`[Teamux] Loading Microsoft Teams from: ${teamsUrl}`);
  mainWindow.loadURL(teamsUrl);

  return mainWindow;
}

function openSettingsDialog() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    title: 'Teamux Preferences',
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
    modal: true,
    width: 600,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../ui/settings/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Focus window when a second instance tries to run
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  // Setup User Agent & Header spoofing
  setupUserAgent(session.defaultSession);

  // Setup WebRTC Screen Sharing & Camera permissions
  setupMediaHandlers(session.defaultSession, () => mainWindow);

  // Create Window
  await createMainWindow();

  // Create System Tray
  createTray(mainWindow, openSettingsDialog);

  // Build Desktop Menu
  buildAppMenu(mainWindow, openSettingsDialog);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !store.get('closeToTray', true)) {
    app.quit();
  }
});

// IPC: Unread badge update from preload
ipcMain.on('unread-badge-update', (_event, count) => {
  if (store.get('enableUnreadBadges', true)) {
    if (app.setBadgeCount) {
      app.setBadgeCount(count);
    }
    setTrayUnreadCount(count, mainWindow, openSettingsDialog);
  }
});

// IPC: Settings management
ipcMain.handle('get-settings', () => {
  return store.getAll();
});

ipcMain.handle('save-settings', (_event, newSettings) => {
  const oldUrl = store.get('teamsUrl');
  store.setAll(newSettings);

  if (mainWindow && newSettings.teamsUrl && newSettings.teamsUrl !== oldUrl) {
    mainWindow.loadURL(newSettings.teamsUrl);
  }
  return true;
});

ipcMain.handle('clear-cache', async () => {
  if (mainWindow) {
    await session.defaultSession.clearStorageData();
    mainWindow.reload();
  }
  return true;
});

ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});
