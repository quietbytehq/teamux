// src/preload/teams-preload.js
// Preload script injected into Microsoft Teams Web inside Teamux
// Features: Virtual Beauty Cam, Instant Stream Teardown, Active Meeting Finder, Badge Sync

const { ipcRenderer } = require('electron');

// -------------------------------------------------------------
// 1. Beauty Cam & Virtual Camera Processing State
// -------------------------------------------------------------
const studioState = {
  beautyEnabled: localStorage.getItem('teamux_beauty_enabled') !== 'false', // default true
  beautyLevel: parseInt(localStorage.getItem('teamux_beauty_level') || '65', 10),
  studioLightEnabled: localStorage.getItem('teamux_light_enabled') !== 'false',
  vignetteEnabled: localStorage.getItem('teamux_vignette_enabled') === 'true',
  isComparing: false, // when user is holding "Hold to Compare"
  activeVideoStream: null
};

function saveStudioSettings() {
  localStorage.setItem('teamux_beauty_enabled', studioState.beautyEnabled ? 'true' : 'false');
  localStorage.setItem('teamux_beauty_level', String(studioState.beautyLevel));
  localStorage.setItem('teamux_light_enabled', studioState.studioLightEnabled ? 'true' : 'false');
  localStorage.setItem('teamux_vignette_enabled', studioState.vignetteEnabled ? 'true' : 'false');
}

// -------------------------------------------------------------
// 2. Stream Lifecycle Tracking & Instant Teardown
// -------------------------------------------------------------
const activeStreams = new Set();

function registerStream(stream) {
  if (!stream) return stream;
  activeStreams.add(stream);

  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      if (stream.getTracks().every((t) => t.readyState === 'ended')) {
        activeStreams.delete(stream);
        updateActiveCallBanner();
      }
    });
  });

  updateActiveCallBanner();
  return stream;
}

function stopAllStreams() {
  activeStreams.forEach((stream) => {
    try {
      stream.getTracks().forEach((track) => {
        if (track.readyState !== 'ended') {
          track.stop();
        }
      });
    } catch (_) {}
  });
  activeStreams.clear();
  updateActiveCallBanner();
}

// -------------------------------------------------------------
// 3. Virtual Camera Hook (getUserMedia Interceptor)
// -------------------------------------------------------------
const MediaDevicesProto = typeof MediaDevices !== 'undefined' ? MediaDevices.prototype : null;
const origGetUserMedia = MediaDevicesProto?.getUserMedia || (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices));

if (origGetUserMedia) {
  const customGetUserMedia = async function(constraints) {
    // If video is not requested, pass through directly
    if (!constraints || !constraints.video) {
      const stream = await origGetUserMedia.call(this || navigator.mediaDevices, constraints);
      return registerStream(stream);
    }

    // 1. Acquire real webcam from hardware
    const rawStream = await origGetUserMedia.call(this || navigator.mediaDevices, constraints);
    const rawVideoTrack = rawStream.getVideoTracks()[0];

    if (!rawVideoTrack) {
      return registerStream(rawStream);
    }

    // 2. Setup offscreen video element to feed canvas
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = rawStream;
    await video.play().catch(() => {});

    // 3. Create offscreen canvas for real-time frame processing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
    }

    const width = Math.min(1280, rawVideoTrack.getSettings()?.width || 1280);
    const height = Math.min(720, rawVideoTrack.getSettings()?.height || 720);
    canvas.width = width;
    canvas.height = height;

    let cachedVignette = null;
    let vignetteW = 0;
    let vignetteH = 0;

    // 4. Processing Render Loop (30 FPS)
    const renderTimer = setInterval(() => {
      // Resource Saver: Skip all rendering if video is not ready or user muted video
      if (video.readyState < 2 || !rawVideoTrack.enabled || rawVideoTrack.readyState === 'ended') {
        return;
      }

      if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        cachedVignette = null; // Rebuild vignette on resize
      }

      const isBeautyActive = studioState.beautyEnabled && !studioState.isComparing;

      if (isBeautyActive) {
        // --- BEAUTY FILTER PIPELINE ---
        // Step A: Base Layer with Studio Lighting & Warmth
        if (studioState.studioLightEnabled) {
          ctx.filter = 'brightness(107%) contrast(104%) saturate(106%)';
        } else {
          ctx.filter = 'contrast(102%)';
        }
        ctx.globalAlpha = 1.0;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Step B: Edge-Preserved Soft-Focus Skin Smoothing Overlay
        const levelNorm = studioState.beautyLevel / 100;
        const blurRadius = Math.max(2, Math.round(levelNorm * 7)); // 2px to 7px
        const overlayAlpha = Math.min(0.55, 0.15 + (levelNorm * 0.38)); // 15% to 53% opacity

        ctx.filter = `blur(${blurRadius}px)`;
        ctx.globalAlpha = overlayAlpha;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Step C: Portrait Focus / Backdrop Vignette (Cached gradient)
        if (studioState.vignetteEnabled) {
          if (!cachedVignette || vignetteW !== canvas.width || vignetteH !== canvas.height) {
            vignetteW = canvas.width;
            vignetteH = canvas.height;
            cachedVignette = ctx.createRadialGradient(
              vignetteW / 2, vignetteH / 2, Math.min(vignetteW, vignetteH) * 0.35,
              vignetteW / 2, vignetteH / 2, Math.max(vignetteW, vignetteH) * 0.75
            );
            cachedVignette.addColorStop(0, 'rgba(0,0,0,0)');
            cachedVignette.addColorStop(1, 'rgba(0,0,0,0.50)');
          }
          ctx.fillStyle = cachedVignette;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Reset canvas context
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
      } else {
        // --- RAW CAMERA PASSTHROUGH (Or "Hold to Compare" mode) ---
        ctx.filter = 'none';
        ctx.globalAlpha = 1.0;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // If user is actively holding "Compare", display temporary A/B label badge
        if (studioState.isComparing) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.beginPath();
          ctx.roundRect(16, 16, 170, 36, 8);
          ctx.fill();

          ctx.font = 'bold 14px sans-serif';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText('👁️ RAW ORIGINAL', 32, 40);
        }
      }
    }, 1000 / 30);

    // 5. Capture processed stream
    const virtualStream = canvas.captureStream(30);
    const virtualVideoTrack = virtualStream.getVideoTracks()[0];

    // Clean up when virtual track is terminated
    const stopAllWebcam = () => {
      clearInterval(renderTimer);
      rawStream.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) {}
      });
      video.srcObject = null;
    };

    const origTrackStop = virtualVideoTrack.stop.bind(virtualVideoTrack);
    virtualVideoTrack.stop = () => {
      stopAllWebcam();
      origTrackStop();
    };
    virtualVideoTrack.addEventListener('ended', stopAllWebcam);

    // Combine virtual video with real audio tracks
    const combinedTracks = [virtualVideoTrack, ...rawStream.getAudioTracks()];
    const outputStream = new MediaStream(combinedTracks);

    studioState.activeVideoStream = outputStream;
    showStudioWidget();

    return registerStream(outputStream);
  };

  if (MediaDevicesProto) {
    MediaDevicesProto.getUserMedia = customGetUserMedia;
  }
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = customGetUserMedia;
  }
}

const origGetDisplayMedia = MediaDevicesProto?.getDisplayMedia || (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices));
if (origGetDisplayMedia) {
  const customGetDisplayMedia = async function(...args) {
    const stream = await origGetDisplayMedia.apply(this || navigator.mediaDevices, args);
    return registerStream(stream);
  };
  if (MediaDevicesProto) {
    MediaDevicesProto.getDisplayMedia = customGetDisplayMedia;
  }
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    navigator.mediaDevices.getDisplayMedia = customGetDisplayMedia;
  }
}

// -------------------------------------------------------------
// 4. In-Meeting Floating Studio Widget (Beauty Cam Controller)
// -------------------------------------------------------------
function injectStudioUI() {
  if (document.getElementById('teamux-studio-widget')) return;

  const style = document.createElement('style');
  style.id = 'teamux-studio-styles';
  style.textContent = `
    #teamux-studio-widget {
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
    }
    .teamux-studio-card {
      display: none;
      background: rgba(24, 24, 28, 0.96);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(99, 102, 241, 0.45);
      border-radius: 12px;
      width: 290px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.65);
      color: #f4f4f5;
      overflow: hidden;
      flex-direction: column;
      transition: all 0.2s ease;
    }
    .teamux-studio-header {
      padding: 10px 14px;
      background: rgba(36, 36, 42, 0.95);
      border-bottom: 1px solid rgba(63, 63, 70, 0.5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: grab;
    }
    .teamux-studio-title {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #c7d2fe;
    }
    .teamux-studio-btn-min {
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .teamux-studio-btn-min:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }
    .teamux-studio-body {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .teamux-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
    }
    .teamux-switch {
      position: relative;
      display: inline-block;
      width: 42px;
      height: 22px;
    }
    .teamux-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .teamux-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background-color: #3f3f46;
      transition: .2s;
      border-radius: 22px;
    }
    .teamux-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .2s;
      border-radius: 50%;
    }
    input:checked + .teamux-slider {
      background-color: #6366f1;
    }
    input:checked + .teamux-slider:before {
      transform: translateX(20px);
    }
    .teamux-range-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .teamux-range-label {
      font-size: 12px;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
    }
    .teamux-range-input {
      width: 100%;
      height: 5px;
      border-radius: 5px;
      background: #3f3f46;
      accent-color: #6366f1;
      outline: none;
      cursor: pointer;
    }
    .teamux-btn-compare {
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #e4e4e7;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .teamux-btn-compare:active,
    .teamux-btn-compare.active {
      background: #4338ca;
      border-color: #6366f1;
      color: white;
    }
    .teamux-studio-pill {
      display: flex;
      background: rgba(30, 27, 75, 0.94);
      border: 1px solid #818cf8;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 24px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      font-size: 13px;
      font-weight: 600;
      transition: transform 0.2s ease, background 0.2s;
    }
    .teamux-studio-pill:hover {
      background: rgba(67, 56, 202, 0.96);
      transform: scale(1.05);
    }
    .teamux-hint-box {
      font-size: 11px;
      color: #94a3b8;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 6px;
      padding: 6px 8px;
      line-height: 1.4;
    }
    /* Floating Active Meeting Recovery Banner */
    #teamux-call-banner {
      display: none;
      position: fixed !important;
      top: 14px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      z-index: 2147483646 !important;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid #22c55e;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      border-radius: 30px;
      padding: 8px 18px;
      color: white;
      font-size: 13px;
      font-weight: 500;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      animation: teamuxPulse 2.5s infinite;
    }
    @keyframes teamuxPulse {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    #teamux-call-banner:hover {
      background: #1e293b;
      border-color: #4ade80;
    }
  `;
  document.head.appendChild(style);

  // Safe helpers to build DOM without innerHTML (avoids Trusted Types / TrustedHTML violations)
  function createSwitch(id, isChecked) {
    const label = document.createElement('label');
    label.className = 'teamux-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = !!isChecked;
    const slider = document.createElement('span');
    slider.className = 'teamux-slider';
    label.appendChild(input);
    label.appendChild(slider);
    return label;
  }

  function createToggleRow(labelText, switchId, isChecked) {
    const row = document.createElement('div');
    row.className = 'teamux-toggle-row';
    const span = document.createElement('span');
    span.textContent = labelText;
    const sw = createSwitch(switchId, isChecked);
    row.appendChild(span);
    row.appendChild(sw);
    return row;
  }

  // 1. Studio Widget Container
  const container = document.createElement('div');
  container.id = 'teamux-studio-widget';

  // 2. Studio Card
  const card = document.createElement('div');
  card.id = 'teamux-studio-card';
  card.className = 'teamux-studio-card';

  // Header
  const header = document.createElement('div');
  header.className = 'teamux-studio-header';
  const title = document.createElement('div');
  title.className = 'teamux-studio-title';
  title.textContent = '✨ Teamux Studio';
  const minBtn = document.createElement('button');
  minBtn.id = 'teamux-min-btn';
  minBtn.className = 'teamux-studio-btn-min';
  minBtn.type = 'button';
  minBtn.title = 'Minimize';
  minBtn.textContent = '−';
  header.appendChild(title);
  header.appendChild(minBtn);
  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'teamux-studio-body';

  // Beauty Filter Row
  body.appendChild(createToggleRow('Beauty Filter', 'teamux-toggle-beauty', studioState.beautyEnabled));

  // Range Group (Smoothness)
  const levelGroup = document.createElement('div');
  levelGroup.className = 'teamux-range-group';
  levelGroup.id = 'teamux-level-group';
  if (!studioState.beautyEnabled) {
    levelGroup.style.opacity = '0.4';
    levelGroup.style.pointerEvents = 'none';
  }
  const labelRow = document.createElement('div');
  labelRow.className = 'teamux-range-label';
  const smoothLabel = document.createElement('span');
  smoothLabel.textContent = 'Smoothness';
  const smoothVal = document.createElement('span');
  smoothVal.id = 'teamux-level-val';
  smoothVal.textContent = `${studioState.beautyLevel}%`;
  labelRow.appendChild(smoothLabel);
  labelRow.appendChild(smoothVal);

  const rangeInput = document.createElement('input');
  rangeInput.type = 'range';
  rangeInput.id = 'teamux-range-level';
  rangeInput.className = 'teamux-range-input';
  rangeInput.min = '10';
  rangeInput.max = '100';
  rangeInput.value = String(studioState.beautyLevel);

  levelGroup.appendChild(labelRow);
  levelGroup.appendChild(rangeInput);
  body.appendChild(levelGroup);

  // Studio Lighting Row
  body.appendChild(createToggleRow('Studio Lighting', 'teamux-toggle-light', studioState.studioLightEnabled));

  // Portrait Focus Row
  body.appendChild(createToggleRow('Portrait Focus (Vignette)', 'teamux-toggle-vignette', studioState.vignetteEnabled));

  // Hint Box
  const hintBox = document.createElement('div');
  hintBox.className = 'teamux-hint-box';
  hintBox.textContent = '💡 Custom BG & Blur: Supported natively in Teams meeting under More > Video effects.';
  body.appendChild(hintBox);

  // Compare Button
  const btnCompare = document.createElement('button');
  btnCompare.id = 'teamux-btn-compare';
  btnCompare.className = 'teamux-btn-compare';
  btnCompare.type = 'button';
  btnCompare.title = 'Hold down to temporarily see your raw camera';
  btnCompare.textContent = '👁️ Hold to Compare';
  body.appendChild(btnCompare);

  card.appendChild(body);
  container.appendChild(card);

  // Pill
  const pill = document.createElement('div');
  pill.id = 'teamux-studio-pill';
  pill.className = 'teamux-studio-pill';
  pill.title = 'Open Teamux Studio';
  const pillIcon = document.createElement('span');
  pillIcon.textContent = '✨';
  const pillText = document.createElement('span');
  pillText.textContent = 'Studio';
  pill.appendChild(pillIcon);
  pill.appendChild(pillText);
  container.appendChild(pill);

  document.body.appendChild(container);

  // 3. Call Recovery Banner
  const callBanner = document.createElement('div');
  callBanner.id = 'teamux-call-banner';
  const callText = document.createElement('span');
  callText.textContent = '🟢 Active Call in Progress';
  const callBtn = document.createElement('span');
  callBtn.textContent = 'RETURN TO MEETING';
  callBtn.style.cssText = 'background:#22c55e; color:#0f172a; font-weight:700; padding:2px 8px; border-radius:12px; font-size:11px;';
  callBanner.appendChild(callText);
  callBanner.appendChild(callBtn);
  document.body.appendChild(callBanner);

  // Event Listeners for Call Recovery Banner
  callBanner.addEventListener('click', () => {
    ipcRenderer.send('bring-all-to-front');

    // Attempt to trigger Teams internal return to call button if in view
    const teamsReturnBtn = document.querySelector('[data-tid="return-to-call-button"], [aria-label*="Return to call"], [aria-label*="Back to call"]');
    if (teamsReturnBtn) {
      teamsReturnBtn.click();
    }
  });

  // Event Listeners for Studio Widget
  const toggleBeauty = container.querySelector('#teamux-toggle-beauty');
  const rangeLevel = container.querySelector('#teamux-range-level');
  const levelVal = container.querySelector('#teamux-level-val');
  const toggleLight = container.querySelector('#teamux-toggle-light');
  const toggleVignette = container.querySelector('#teamux-toggle-vignette');

  toggleBeauty?.addEventListener('change', () => {
    studioState.beautyEnabled = toggleBeauty.checked;
    levelGroup.style.opacity = studioState.beautyEnabled ? '1' : '0.4';
    levelGroup.style.pointerEvents = studioState.beautyEnabled ? 'auto' : 'none';
    saveStudioSettings();
  });

  rangeLevel.addEventListener('input', () => {
    studioState.beautyLevel = parseInt(rangeLevel.value, 10);
    levelVal.textContent = `${studioState.beautyLevel}%`;
    saveStudioSettings();
  });

  toggleLight.addEventListener('change', () => {
    studioState.studioLightEnabled = toggleLight.checked;
    saveStudioSettings();
  });

  toggleVignette?.addEventListener('change', () => {
    studioState.vignetteEnabled = toggleVignette.checked;
    saveStudioSettings();
  });

  // Hold to Compare functionality
  const startCompare = () => {
    studioState.isComparing = true;
    btnCompare.classList.add('active');
    btnCompare.textContent = '👁️ Showing RAW Original';
  };
  const stopCompare = () => {
    studioState.isComparing = false;
    btnCompare.classList.remove('active');
    btnCompare.textContent = '👁️ Hold to Compare';
  };

  btnCompare.addEventListener('mousedown', startCompare);
  btnCompare.addEventListener('touchstart', startCompare, { passive: true });
  window.addEventListener('mouseup', stopCompare);
  window.addEventListener('touchend', stopCompare);

  // Minimize / Expand
  minBtn.addEventListener('click', () => {
    card.style.display = 'none';
    pill.style.display = 'flex';
  });

  pill.addEventListener('click', () => {
    pill.style.display = 'none';
    card.style.display = 'flex';
  });
}

function showStudioWidget() {
  const widget = document.getElementById('teamux-studio-widget');
  const card = document.getElementById('teamux-studio-card');
  const pill = document.getElementById('teamux-studio-pill');
  if (widget) {
    widget.style.display = 'block';
  }
  if (card && pill) {
    pill.style.display = 'none';
    card.style.display = 'flex';
  }
}

function updateActiveCallBanner() {
  const banner = document.getElementById('teamux-call-banner');
  if (!banner) return;

  const isCallActive = activeStreams.size > 0;
  banner.style.display = isCallActive ? 'flex' : 'none';
}

// -------------------------------------------------------------
// 5. DOM Initialization & Notification Badges
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Hide annoying Teams download banners
  const style = document.createElement('style');
  style.id = 'teamux-custom-styles';
  style.textContent = `
    [data-tid="download-desktop-app-banner"],
    [data-tid="app-download-banner"],
    .download-desktop-banner,
    .use-desktop-app-bar {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  // Inject Studio Controller & Call Banner
  injectStudioUI();

  // Watchdog: Ensure studio UI stays attached even if Teams navigates or re-renders DOM
  setInterval(() => {
    if (document.body && !document.getElementById('teamux-studio-widget')) {
      injectStudioUI();
    }
  }, 1500);

  // Monitor document.title to detect unread badges (e.g., "(3) Microsoft Teams")
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const observer = new MutationObserver(() => {
      checkTitleForBadges(document.title);
    });
    observer.observe(titleElement, { childList: true });
  }

  setInterval(() => {
    checkTitleForBadges(document.title);
  }, 3000);

  // Immediately stop V4L2 webcam and PipeWire screenshare when user clicks "Leave" / "Hang up"
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el) return;

    const isHangup = el.closest('[data-tid*="hangup"]') ||
                     el.closest('[data-tid*="call-end"]') ||
                     el.closest('[aria-label*="Leave"]') ||
                     el.closest('[aria-label*="Hang up"]') ||
                     el.closest('#hangup-button');

    if (isHangup) {
      setTimeout(stopAllStreams, 150);
    }
  }, true);
});

window.addEventListener('beforeunload', stopAllStreams);

let lastCount = 0;
function checkTitleForBadges(title) {
  if (!title) return;
  const match = title.match(/\((\d+)\)/);
  const count = match ? parseInt(match[1], 10) : 0;
  if (count !== lastCount) {
    lastCount = count;
    ipcRenderer.send('unread-badge-update', count);
  }
}
