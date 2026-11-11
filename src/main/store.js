// src/main/store.js
// Lightweight, reliable configuration manager for Teamux

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsStore {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'teamux-config.json');
    this.defaults = {
      startMinimized: false,
      minimizeToTray: true,
      closeToTray: true,
      hardwareAcceleration: true,
      forceWayland: false,
      teamsUrl: 'https://teams.microsoft.com/v2/',
      windowBounds: { width: 1280, height: 820 },
      isMaximized: false,
      enableUnreadBadges: true,
      enableNotifications: true
    };
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        return Object.assign({}, this.defaults, JSON.parse(raw));
      }
    } catch (err) {
      console.warn('[Teamux Store] Failed to load config, using defaults:', err.message);
    }
    return Object.assign({}, this.defaults);
  }

  save() {
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[Teamux Store] Failed to save config:', err.message);
    }
  }

  get(key, fallback) {
    if (this.data[key] !== undefined) {
      return this.data[key];
    }
    return fallback !== undefined ? fallback : this.defaults[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  getAll() {
    return Object.assign({}, this.data);
  }

  setAll(newConfig) {
    this.data = Object.assign({}, this.data, newConfig);
    this.save();
  }
}

module.exports = { SettingsStore };
