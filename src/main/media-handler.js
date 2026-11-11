// src/main/media-handler.js
// Handles WebRTC media permissions, V4L2 cameras, and Wayland/X11 screen sharing

const { BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

let activePickerWindow = null;
let activePickerCallback = null;

function setupMediaHandlers(session, getMainWindow) {
  // 1. Unconditionally approve media, camera, microphone, speaker selection, notifications, and screen capture
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });

  session.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });

  if (session.setDevicePermissionHandler) {
    session.setDevicePermissionHandler(() => true);
  }

  // 2. Handle Screen & Window Sharing (getDisplayMedia)
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    const isWayland = Boolean(process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');

    try {
      if (isWayland) {
        // On Wayland, calling desktopCapturer.getSources({ types: ['screen'] }) activates the native
        // system portal (xdg-desktop-portal-gnome / kde) allowing the user to pick entire displays or windows.
        const sources = await desktopCapturer.getSources({ types: ['screen'] });

        if (sources && sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback();
        }
        return;
      }

      // X11 Session: Use custom picker dialog
      const mainWindow = getMainWindow();

      if (activePickerCallback) {
        activePickerCallback();
        activePickerCallback = null;
      }
      if (activePickerWindow && !activePickerWindow.isDestroyed()) {
        activePickerWindow.close();
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      });

      if (!sources || sources.length === 0) {
        callback();
        return;
      }

      activePickerCallback = callback;
      openPickerModal(sources, mainWindow);
    } catch (err) {
      console.error('[Teamux Media] Failed to handle display media request:', err);
      callback();
    }
  });

  // Listen for picker selection from UI (X11)
  ipcMain.on('screen-picker-select', async (event, sourceId) => {
    if (!activePickerCallback) return;

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      });
      const selected = sources.find(s => s.id === sourceId);

      if (selected) {
        activePickerCallback({ video: selected });
      } else {
        activePickerCallback();
      }
    } catch (e) {
      console.error('[Teamux Media] Error selecting source:', e);
      activePickerCallback();
    } finally {
      activePickerCallback = null;
      if (activePickerWindow && !activePickerWindow.isDestroyed()) {
        activePickerWindow.close();
      }
    }
  });

  // Listen for picker cancel (X11)
  ipcMain.on('screen-picker-cancel', () => {
    if (activePickerCallback) {
      activePickerCallback();
      activePickerCallback = null;
    }
    if (activePickerWindow && !activePickerWindow.isDestroyed()) {
      activePickerWindow.close();
    }
  });
}

function openPickerModal(sources, parentWindow) {
  activePickerWindow = new BrowserWindow({
    title: 'Share Screen or Window - Teamux',
    parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : null,
    modal: true,
    width: 720,
    height: 540,
    resizable: true,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#1f1f23',
    webPreferences: {
      preload: path.join(__dirname, '../preload/picker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  activePickerWindow.loadFile(path.join(__dirname, '../ui/picker/picker.html'));

  activePickerWindow.webContents.on('did-finish-load', () => {
    const serializedSources = sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      isScreen: s.id.startsWith('screen:')
    }));

    activePickerWindow.webContents.send('populate-sources', serializedSources);
  });

  activePickerWindow.on('closed', () => {
    activePickerWindow = null;
    if (activePickerCallback) {
      activePickerCallback();
      activePickerCallback = null;
    }
  });
}

module.exports = { setupMediaHandlers };
