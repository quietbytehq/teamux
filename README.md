# Teamux 🐧

<p align="center">
  <img src="assets/icon.png" alt="Teamux Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>Unofficial Microsoft Teams desktop client for Linux with native Wayland, PipeWire screen sharing, and camera support.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Linux%20x86__64-lightgrey.svg" alt="Supported Platforms"></a>
  <a href="#"><img src="https://img.shields.io/badge/display-Wayland%20%26%20X11-purple.svg" alt="Display Server Support"></a>
  <a href="#"><img src="https://img.shields.io/badge/audio%2Fvideo-PipeWire%20%26%20V4L2-orange.svg" alt="Audio Video Support"></a>
</p>

> **Disclaimer:** Teamux is an unofficial project and is not affiliated with or endorsed by Microsoft. Microsoft Teams is a trademark of Microsoft Corporation.

---

## 💡 Why Teamux?

On modern Linux distributions (Ubuntu 22.04+, Fedora 38+, Arch, Debian 12+), Microsoft Teams often fails:
* **Screen sharing is disabled or yields a black screen** due to missing Wayland PipeWire flags and portal integration.
* **Webcams and microphones fail or freeze** due to sandboxed snap/flatpak permission blocks or misconfigured V4L2 device nodes.
* **"Your browser is not supported"** warnings appear because Microsoft blocks standard Electron user-agents.

**Teamux** solves all of these problems out of the box with zero manual flag tinkering required.

---

## ✨ Features

- 🖥️ **Reliable Screen & Window Sharing:**
  - Full native **Wayland** support via PipeWire and `xdg-desktop-portal`.
  - Seamless fallback for **X11** display sessions.
  - Interactive **Screen & Window Picker** dialog with live preview thumbnails.
- 📹 **Camera & Audio Hardware Access:**
  - Auto-granted WebRTC permissions for Video4Linux2 (`v4l2`) webcams.
  - Native PulseAudio and PipeWire audio stream routing.
  - Background audio persistence (calls do not mute when the window is behind other apps).
- 🔔 **Linux Desktop Integration:**
  - System Tray icon with dynamic unread message count badges.
  - Quick tray controls: Show/Hide, Unread status, Reload, and Quit.
  - Close-to-tray and Minimize-to-tray options.
  - Auto-start minimized on boot.
- ⚡ **GPU Hardware Acceleration:**
  - Chromium hardware rasterization and VA-API hardware decoding for smooth video and background effects.
- 🌐 **Modern Teams & Classic Support:**
  - Supports New Teams v2 (Work & School) as well as Personal (Teams Live) accounts.
  - User-Agent spoofing to unlock Microsoft's full feature set.

---

## 📦 Multi-Distro Installation

Teamux provides native packages for all major Linux distributions:

### 1. Universal (Any Linux Distro) — AppImage
Requires no installation or root privileges:
```bash
# Download teamux-v0.1.0-linux-x86_64.AppImage from Releases
chmod +x teamux-v0.1.0-linux-x86_64.AppImage
./teamux-v0.1.0-linux-x86_64.AppImage
```

### 2. Ubuntu / Debian / Linux Mint / Pop!_OS — `.deb`
```bash
sudo dpkg -i teamux-v0.1.0-linux-amd64.deb
# Or using apt:
sudo apt install ./teamux-v0.1.0-linux-amd64.deb
```

### 3. Red Hat / Fedora / CentOS / Rocky Linux — `.rpm`
```bash
sudo dnf install ./Teamux-1.0.0-x86_64.rpm
# Or on openSUSE:
sudo zypper install ./Teamux-1.0.0-x86_64.rpm
```

### 4. Arch Linux / Manjaro / EndeavourOS — `.pacman`
```bash
sudo pacman -U Teamux-1.0.0-x86_64.pacman
```

---

## 🛠️ Building from Source

### Prerequisites
* **Node.js** v20+ or v22+
* **npm** v10+
* Development tools (`rpm` and `libarchive-tools` if building cross-distro packages)

### 1. Clone Repository
```bash
git clone https://github.com/quietbytehq/teamux.git
cd teamux
```

### 2. Install Dependencies
```bash
NODE_ENV=development npm install --include=dev
```

### 3. Run Development Build
```bash
npm start
```

### 4. Build Distribution Packages
Build your specific distribution package or all at once:
```bash
# Build AppImage & Debian package
npm run dist

# Build individual formats
npm run dist:deb       # Debian / Ubuntu (.deb)
npm run dist:rpm       # Fedora / Red Hat (.rpm)
npm run dist:appimage  # Universal (.AppImage)
npm run dist:pacman    # Arch Linux (.pacman)

# Build all packages simultaneously
npm run dist:all
```
Generated installers will be output to the `dist/` folder.

---

## ⚙️ Configuration & Preferences

Open Preferences with `Ctrl + ,` or from the **File > Preferences** menu:

| Option | Description | Default |
| :--- | :--- | :--- |
| **Teams Environment** | Switch between Work/School (New Teams v2) and Personal (Teams Live) | Work/School v2 |
| **Keep running in tray** | Keep Teamux running in the system tray when window is closed | `true` |
| **Minimize to tray** | Minimize window directly to the system tray | `true` |
| **Hardware Acceleration** | GPU rasterization and VA-API video decode | `true` |
| **Force Wayland** | Enforce native Wayland mode or auto-detect based on session | `auto` |
| **Unread Badges** | Display notification count badge on the tray icon and desktop dock | `true` |

---

## 🔍 Linux Wayland / PipeWire Troubleshooting

If screen sharing does not trigger on your system, verify that PipeWire and the desktop portal backend are active:

1. **Verify `xdg-desktop-portal` is installed and running:**
   ```bash
   # On Ubuntu / Debian:
   sudo apt install xdg-desktop-portal xdg-desktop-portal-gnome  # (for GNOME)
   # Or for KDE:
   sudo apt install xdg-desktop-portal-kde

   # On Fedora:
   sudo dnf install xdg-desktop-portal xdg-desktop-portal-gnome
   ```

2. **Verify PipeWire is running:**
   ```bash
   systemctl --user status pipewire
   ```

3. **Check Display Session:**
   ```bash
   echo $XDG_SESSION_TYPE  # Should output 'wayland' or 'x11'
   ```

---

## 🤝 Contributing

Contributions are welcome! If you encounter an issue or have a feature request:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/cool-feature`)
3. Commit your changes (`git commit -m "Add cool feature"`)
4. Push to your branch (`git push origin feature/cool-feature`)
5. Open a Pull Request

---

## 📬 Contact & Support

For questions, support, or security reports, reach out to:
* **Email:** [hello@quietbytehq.uk](mailto:hello@quietbytehq.uk)
* **Website:** [https://quietbytehq.uk](https://quietbytehq.uk)
* **GitHub Issues:** [https://github.com/quietbytehq/teamux/issues](https://github.com/quietbytehq/teamux/issues)

---

## 📄 License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) and [NOTICE](NOTICE) files for details.

*Microsoft and Microsoft Teams are registered trademarks of Microsoft Corporation. Teamux is an independent open-source project and is not affiliated with, sponsored, or endorsed by Microsoft.*
