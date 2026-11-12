// src/main/flags.js
// Linux, Wayland, PipeWire, GPU Acceleration, and Resource Optimization switches

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
    app.commandLine.appendSwitch('enable-zero-copy', 'false');
  }

  // Ozone Platform hint (Wayland vs X11)
  if (forceWayland) {
    app.commandLine.appendSwitch('ozone-platform', 'wayland');
  } else {
    // 'auto' detects Wayland if WAYLAND_DISPLAY is present, else falls back to X11 cleanly
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  }

  // -----------------------------------------------------------
  // Memory & Resource Optimization Switches
  // -----------------------------------------------------------
  // 1. Limit V8 heap space so garbage collection runs aggressively before memory balloons
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512 --optimize-for-size');

  // 2. Limit maximum renderer processes (prevents Teams micro-frontends from spawning 8+ renderers)
  app.commandLine.appendSwitch('renderer-process-limit', '4');

  // 3. Cap in-memory and disk cache sizes to avoid unbounded growth
  app.commandLine.appendSwitch('disk-cache-size', '134217728'); // 128 MB max
  app.commandLine.appendSwitch('media-cache-size', '67108864'); // 64 MB max

  // 4. Disable unnecessary background Chromium subsystems
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-speech-api');
  app.commandLine.appendSwitch('disable-speech-synthesis-api');

  // 5. Features to enable / disable for low footprint and fast media
  const enableFeatures = [
    'WebRTCPipeWireCapturer',
    'WaylandWindowDecorations',
    'PulseaudioLoopbackForCast',
    'CanvasOopRasterization' // Off-process canvas rasterization on GPU saves CPU
  ];

  const disableFeatures = [
    'MediaRouter',
    'Translate',
    'AutofillServerCommunication',
    'OptimizationHints'
  ];

  app.commandLine.appendSwitch('enable-features', enableFeatures.join(','));
  app.commandLine.appendSwitch('disable-features', disableFeatures.join(','));
  app.commandLine.appendSwitch('enable-webrtc-pipewire-capturer');

  // Audio / Media auto-play policy for uninterrupted calls
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  // Input method support for Wayland
  app.commandLine.appendSwitch('enable-wayland-ime');
}

module.exports = { configureAppFlags };
