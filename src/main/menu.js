// src/main/menu.js
// Application menu configuration for Teamux

const { app, Menu, shell, dialog } = require('electron');

function buildAppMenu(mainWindow, openSettings, windowActions = {}) {
  const { bringAllToFront, resetPosition } = windowActions;

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Preferences / Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettings()
        },
        {
          label: 'Hide to Tray',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
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
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Bring All Windows to Front',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            if (typeof bringAllToFront === 'function') {
              bringAllToFront();
            }
          }
        },
        {
          label: 'Reset Window Position & Size',
          accelerator: 'CmdOrCtrl+Alt+R',
          click: () => {
            if (typeof resetPosition === 'function') {
              resetPosition();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Always on Top',
          type: 'checkbox',
          checked: false,
          click: (menuItem) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(menuItem.checked);
            }
          }
        },
        { role: 'minimize' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'QuietByte GitHub Repository',
          click: async () => {
            await shell.openExternal('https://github.com/quietbytehq/teamux');
          }
        },
        {
          label: 'Report a Linux / Wayland Issue',
          click: async () => {
            await shell.openExternal('https://github.com/quietbytehq/teamux/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'About Teamux',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Teamux',
              message: 'Teamux - Microsoft Teams for Linux',
              detail: `Version: ${app.getVersion()}\n` +
                      `Electron: ${process.versions.electron}\n` +
                      `Node.js: ${process.versions.node}\n` +
                      `Chromium: ${process.versions.chrome}\n` +
                      `Display Server: ${process.env.WAYLAND_DISPLAY ? 'Wayland' : 'X11'}\n` +
                      `Audio / Video: PipeWire / WebRTC / V4L2\n\n` +
                      `Developed with QuietByte to solve Linux desktop screensharing and camera access.`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { buildAppMenu };
