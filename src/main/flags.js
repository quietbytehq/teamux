// src/main/flags.js
// Linux, Wayland, PipeWire, and GPU Hardware Acceleration switches

const { app } = require('electron');

function configureAppFlags(store) {
  const hardwareAccel = store.get('hardwareAcceleration', true);
  const forceWayland = store.get('forceWayland', false);

  if (!hardwareAccel) {
    app.disableHardwareAcceleration();
  } else {
    // Hardware acceleration optimization for Linux
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
  }

  // Ozone Platform hint (Wayland vs X11)
  if (forceWayland) {
    app.commandLine.appendSwitch('ozone-platform', 'wayland');
  } else {
    // 'auto' detects Wayland if WAYLAND_DISPLAY is present, else falls back to X11 cleanly
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  }

  // Enable PipeWire WebRTC screen capture and audio loopback for screen sharing sound
  const features = [
    'WebRTCPipeWireCapturer',
    'WaylandWindowDecorations',
    'PulseaudioLoopbackForCast'
  ];

  app.commandLine.appendSwitch('enable-features', features.join(','));
  app.commandLine.appendSwitch('enable-webrtc-pipewire-capturer');

  // Disable MediaRouter to prevent mDNS discovery hangs when leaving calls
  app.commandLine.appendSwitch('disable-features', 'MediaRouter');

  // Audio / Media auto-play policy for uninterrupted calls
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  // Input method support for Wayland
  app.commandLine.appendSwitch('enable-wayland-ime');
}

module.exports = { configureAppFlags };
