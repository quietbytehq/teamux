// src/preload/teams-preload.js
// Preload script injected into Microsoft Teams Web inside Teamux

const { ipcRenderer } = require('electron');

// Track all active WebRTC streams (camera, microphone, screenshare)
const activeStreams = new Set();

function registerStream(stream) {
  if (!stream) return stream;
  activeStreams.add(stream);

  stream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      if (stream.getTracks().every((t) => t.readyState === 'ended')) {
        activeStreams.delete(stream);
      }
    });
  });

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
}

// Hook mediaDevices to track streams for instant cleanup on hangup
if (navigator.mediaDevices) {
  const origGetUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
  if (origGetUserMedia) {
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await origGetUserMedia(...args);
      return registerStream(stream);
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

window.addEventListener('DOMContentLoaded', () => {
  // 1. Hide "Download Teams desktop app" promos
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

  // 2. Monitor document.title to detect unread badges (e.g., "(3) Microsoft Teams")
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

  // 3. Immediately stop V4L2 webcam and PipeWire screenshare when user clicks "Leave" / "Hang up"
  // Prevents the hybrid GPU / PipeWire DRM buffer freeze on call teardown
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
