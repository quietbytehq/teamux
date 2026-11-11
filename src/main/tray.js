// src/main/tray.js
// System Tray integration for Linux desktops

const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray = null;
let currentUnread = 0;

function createTray(mainWindow, openSettings) {
  const assetsDir = path.join(__dirname, '../../assets');
  const iconPath = path.join(assetsDir, 'tray-idle.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Teamux - Microsoft Teams for Linux');

  updateContextMenu(mainWindow, openSettings);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

function updateContextMenu(mainWindow, openSettings) {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Teamux',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Hide to Tray',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: currentUnread > 0 ? `Unread Messages: ${currentUnread}` : 'No unread messages',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Reload App',
      accelerator: 'CmdOrCtrl+R',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }
    },
    {
      label: 'Settings & Preferences',
      click: () => {
        if (typeof openSettings === 'function') {
          openSettings();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Teamux',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function setTrayUnreadCount(count, mainWindow, openSettings) {
  currentUnread = count;
  if (!tray) return;

  const assetsDir = path.join(__dirname, '../../assets');
  const iconName = count > 0 ? 'tray-unread.png' : 'tray-idle.png';
  tray.setImage(path.join(assetsDir, iconName));

  const tip = count > 0 
    ? `Teamux - ${count} unread notification${count > 1 ? 's' : ''}`
    : 'Teamux - Microsoft Teams for Linux';
  tray.setToolTip(tip);

  updateContextMenu(mainWindow, openSettings);
}

module.exports = {
  createTray,
  setTrayUnreadCount
};
