// src/main/index.js
// Main process entry point for Teamux

const { app, BrowserWindow, session, ipcMain, shell, screen } = require('electron');
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
const allActiveWindows = new Set();
app.isQuitting = false;

// Clamp and validate window bounds so the window never goes off-screen
function sanitizeWindowBounds(bounds) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay ? primaryDisplay.workArea : { x: 0, y: 0, width: 1920, height: 1080 };

  const defaultWidth = 1280;
  const defaultHeight = 820;

  if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
    return {
      width: Math.min(defaultWidth, workArea.width),
      height: Math.min(defaultHeight, workArea.height),
      x: workArea.x + Math.max(0, Math.round((workArea.width - defaultWidth) / 2)),
      y: workArea.y + Math.max(0, Math.round((workArea.height - defaultHeight) / 2))
    };
  }

  // Find the display containing the saved bounds, or fallback to primary
  const targetDisplay = screen.getDisplayMatching(bounds) || primaryDisplay;
  const area = targetDisplay.workArea;

  let width = Math.max(800, Math.min(bounds.width, area.width));
  let height = Math.max(560, Math.min(bounds.height, area.height));

  let x = bounds.x;
  let y = bounds.y;

  // Ensure titlebar (top 60px) and at least 300px width are well inside the visible area
  if (typeof x !== 'number' || x < area.x || x + 300 > area.x + area.width) {
    x = area.x + Math.max(0, Math.round((area.width - width) / 2));
  }
  if (typeof y !== 'number' || y < area.y || y + 60 > area.y + area.height) {
    y = area.y + Math.max(0, Math.round((area.height - height) / 2));
  }

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function bringAllTeamuxWindowsToFront() {
  allActiveWindows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
}

function resetMainWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const primary = screen.getPrimaryDisplay();
  const area = primary ? primary.workArea : { x: 0, y: 0, width: 1920, height: 1080 };
  const targetWidth = Math.min(1280, area.width);
  const targetHeight = Math.min(820, area.height);

  mainWindow.setSize(targetWidth, targetHeight);
  mainWindow.center();
  mainWindow.show();
  mainWindow.focus();

  store.set('windowBounds', mainWindow.getBounds());
  store.set('isMaximized', false);
}

async function createMainWindow() {
  const rawBounds = store.get('windowBounds', { width: 1280, height: 820 });
  const bounds = sanitizeWindowBounds(rawBounds);
  const isMaximized = store.get('isMaximized', false);
  const startMinimized = store.get('startMinimized', false);

  const iconPath = path.join(__dirname, '../../assets/icon.png');

  mainWindow = new BrowserWindow({
    title: 'Teamux - Microsoft Teams',
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 560,
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

  allActiveWindows.add(mainWindow);

  if (isMaximized && !startMinimized) {
    mainWindow.maximize();
  }

  // Track window dimension and save only sanitized bounds
  const saveBounds = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const current = mainWindow.getBounds();
      store.set('windowBounds', sanitizeWindowBounds(current));
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

  mainWindow.on('closed', () => {
    allActiveWindows.delete(mainWindow);
    mainWindow = null;
  });

  // Manage pop-out / child windows (e.g. Teams pop-out meeting window or call window)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isTeamsDomain = /(teams\.microsoft\.com|teams\.live\.com|login\.microsoftonline\.com|login\.live\.com|account\.live\.com)/i.test(url);
    if (!isTeamsDomain) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('did-create-window', (childWindow, { url }) => {
    childWindow.setIcon(iconPath);
    childWindow.setMinimumSize(640, 480);
    allActiveWindows.add(childWindow);

    childWindow.on('closed', () => {
      allActiveWindows.delete(childWindow);
    });
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
  bringAllTeamuxWindowsToFront();
});

app.whenReady().then(async () => {
  // Setup User Agent & Header spoofing
  setupUserAgent(session.defaultSession);

  // Setup WebRTC Screen Sharing & Camera permissions
  setupMediaHandlers(session.defaultSession, () => mainWindow);

  // Create Window
  await createMainWindow();

  // Create System Tray
  createTray(mainWindow, openSettingsDialog, bringAllTeamuxWindowsToFront);

  // Build Desktop Menu
  buildAppMenu(mainWindow, openSettingsDialog, {
    bringAllToFront: bringAllTeamuxWindowsToFront,
    resetPosition: resetMainWindowPosition
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      bringAllTeamuxWindowsToFront();
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

// IPC: Bring all windows to front
ipcMain.on('bring-all-to-front', () => {
  bringAllTeamuxWindowsToFront();
});

// IPC: Reset window position
ipcMain.on('reset-window-position', () => {
  resetMainWindowPosition();
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
