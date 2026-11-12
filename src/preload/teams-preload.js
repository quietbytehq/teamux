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
  isComparing: false, // when user is holding "Hold to Compare"
  activeVideoStream: null
};

function saveStudioSettings() {
  localStorage.setItem('teamux_beauty_enabled', studioState.beautyEnabled ? 'true' : 'false');
  localStorage.setItem('teamux_beauty_level', String(studioState.beautyLevel));
  localStorage.setItem('teamux_light_enabled', studioState.studioLightEnabled ? 'true' : 'false');
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
if (navigator.mediaDevices) {
  const origGetUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
  if (origGetUserMedia) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      // If video is not requested, pass through directly
      if (!constraints || !constraints.video) {
        const stream = await origGetUserMedia(constraints);
        return registerStream(stream);
      }

      // 1. Acquire real webcam from hardware
      const rawStream = await origGetUserMedia(constraints);
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

      const width = rawVideoTrack.getSettings()?.width || 1280;
      const height = rawVideoTrack.getSettings()?.height || 720;
      canvas.width = width;
      canvas.height = height;

      // 4. Processing Render Loop (30 FPS)
      const renderTimer = setInterval(() => {
        if (video.readyState < 2) return;

        if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
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
          // Uses an optical soft-focus blending technique to smooth skin and imperfections
          // while preserving sharp edge contrast on eyes, lips, and hair.
          const levelNorm = studioState.beautyLevel / 100;
          const blurRadius = Math.max(2, Math.round(levelNorm * 7)); // 2px to 7px
          const overlayAlpha = Math.min(0.55, 0.15 + (levelNorm * 0.38)); // 15% to 53% opacity

          ctx.filter = `blur(${blurRadius}px)`;
          ctx.globalAlpha = overlayAlpha;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
      virtualVideoTrack.addEventListener('ended', () => {
        clearInterval(renderTimer);
        rawStream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      });

      // Combine virtual video with real audio tracks
      const combinedTracks = [virtualVideoTrack, ...rawStream.getAudioTracks()];
      const outputStream = new MediaStream(combinedTracks);

      studioState.activeVideoStream = outputStream;
      showStudioWidget();

      return registerStream(outputStream);
    };
  }

  const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
  if (origGetDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = async (...args) => {
      const stream = await origGetDisplayMedia(...args);
      return registerStream(stream);
    };
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
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
    }
    .teamux-studio-card {
      background: rgba(24, 24, 28, 0.94);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 12px;
      width: 280px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.6);
      color: #f4f4f5;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: all 0.2s ease;
    }
    .teamux-studio-header {
      padding: 10px 14px;
      background: rgba(36, 36, 42, 0.85);
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
      display: none;
      background: rgba(30, 27, 75, 0.9);
      border: 1px solid #6366f1;
      color: #ffffff;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
      font-size: 18px;
    }
    .teamux-studio-pill:hover {
      transform: scale(1.08);
    }
    /* Floating Active Meeting Recovery Banner */
    #teamux-call-banner {
      display: none;
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999998;
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

  // Widget HTML
  const container = document.createElement('div');
  container.id = 'teamux-studio-widget';
  container.innerHTML = `
    <div id="teamux-studio-card" class="teamux-studio-card">
      <div class="teamux-studio-header">
        <div class="teamux-studio-title">✨ Teamux Studio</div>
        <button id="teamux-min-btn" class="teamux-studio-btn-min" type="button" title="Minimize">−</button>
      </div>
      <div class="teamux-studio-body">
        <div class="teamux-toggle-row">
          <span>Beauty Filter</span>
          <label class="teamux-switch">
            <input type="checkbox" id="teamux-toggle-beauty" ${studioState.beautyEnabled ? 'checked' : ''}>
            <span class="teamux-slider"></span>
          </label>
        </div>

        <div class="teamux-range-group" id="teamux-level-group" style="${studioState.beautyEnabled ? '' : 'opacity:0.4; pointer-events:none;'}">
          <div class="teamux-range-label">
            <span>Smoothness</span>
            <span id="teamux-level-val">${studioState.beautyLevel}%</span>
          </div>
          <input type="range" id="teamux-range-level" class="teamux-range-input" min="10" max="100" value="${studioState.beautyLevel}">
        </div>

        <div class="teamux-toggle-row">
          <span>Studio Lighting</span>
          <label class="teamux-switch">
            <input type="checkbox" id="teamux-toggle-light" ${studioState.studioLightEnabled ? 'checked' : ''}>
            <span class="teamux-slider"></span>
          </label>
        </div>

        <button id="teamux-btn-compare" class="teamux-btn-compare" type="button" title="Hold down to temporarily see your raw camera">
          👁️ Hold to Compare
        </button>
      </div>
    </div>

    <div id="teamux-studio-pill" class="teamux-studio-pill" title="Open Teamux Studio">✨</div>
  `;
  document.body.appendChild(container);

  // Call Recovery Banner HTML
  const callBanner = document.createElement('div');
  callBanner.id = 'teamux-call-banner';
  callBanner.innerHTML = `
    <span>🟢 Active Call in Progress</span>
    <span style="background:#22c55e; color:#0f172a; font-weight:700; padding:2px 8px; border-radius:12px; font-size:11px;">RETURN TO MEETING</span>
  `;
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
  const toggleBeauty = document.getElementById('teamux-toggle-beauty');
  const levelGroup = document.getElementById('teamux-level-group');
  const rangeLevel = document.getElementById('teamux-range-level');
  const levelVal = document.getElementById('teamux-level-val');
  const toggleLight = document.getElementById('teamux-toggle-light');
  const btnCompare = document.getElementById('teamux-btn-compare');
  const minBtn = document.getElementById('teamux-min-btn');
  const card = document.getElementById('teamux-studio-card');
  const pill = document.getElementById('teamux-studio-pill');

  toggleBeauty.addEventListener('change', () => {
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
  if (widget) {
    widget.style.display = 'block';
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
