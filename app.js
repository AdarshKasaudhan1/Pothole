/**
 * PotholeGuard - Main Application Controller
 * Manages camera lifecycle, Screen Wake Lock, frame rate tracking, and settings UI
 */

import { Config, saveConfig, resetConfig, loadConfig } from './config.js';

// DOM Elements
const videoEl = document.getElementById('camera-video');
const canvasEl = document.getElementById('overlay-canvas');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const systemStatusDot = document.getElementById('system-status-dot');
const resValueEl = document.getElementById('res-value');
const fpsValueEl = document.getElementById('fps-value');
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorRetryBtn = document.getElementById('error-retry-btn');
const errorDismissBtn = document.getElementById('error-dismiss-btn');
const toastEl = document.getElementById('toast');

// Settings Elements
const settingsOpenBtn = document.getElementById('settings-open-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsForm = document.getElementById('settings-form');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsResetBtn = document.getElementById('settings-reset-btn');

// State
let mediaStream = null;
let wakeLock = null;
let isRunning = false;
let frameCount = 0;
let lastFpsUpdateTime = performance.now();
let lastFrameTime = performance.now();
let fpsEstimate = 0.0;
let animationFrameId = null;

// ==========================================================================
// 1. Initial Setup & Service Worker
// ==========================================================================

function initApp() {
  // Register Service Worker for offline capability
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PotholeGuard] ServiceWorker registered with scope:', reg.scope);
          // Check for service worker updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showToast('New version available. Refresh to update.');
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PotholeGuard] ServiceWorker registration failed:', err);
        });
    });
  }

  // Bind UI Events
  startBtn.addEventListener('click', handleStart);
  errorRetryBtn.addEventListener('click', () => {
    hideError();
    startCamera();
  });
  errorDismissBtn.addEventListener('click', hideError);

  // Settings UI Setup
  initSettingsPanel();

  // Resize handler
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  // Re-acquire wake lock if page becomes visible again
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

// ==========================================================================
// 2. Camera & Wake Lock
// ==========================================================================

async function handleStart() {
  hideError();
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  const success = await startCamera();
  if (success) {
    startOverlay.classList.add('hidden');
    systemStatusDot.classList.remove('standby', 'error');
    isRunning = true;
    requestWakeLock();
    startFpsMonitor();
  } else {
    startBtn.disabled = false;
    startBtn.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      Retry Start
    `;
  }
}

/**
 * Request rear camera with fallbacks and detailed error reporting
 */
async function startCamera() {
  // Check Secure Context (HTTPS or localhost)
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !isLocal) {
    showError(
      'HTTPS Required',
      'Mobile Chrome disables camera, vibration, and sensors on unencrypted HTTP. Please open this app over HTTPS (e.g. your Vercel deployment link) or test on localhost.'
    );
    systemStatusDot.className = 'brand-dot error';
    return false;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError(
      'Camera API Unavailable',
      'The getUserMedia camera API is not supported in this browser. Please use Chrome on Android.'
    );
    systemStatusDot.className = 'brand-dot error';
    return false;
  }

  // Stop any existing stream
  stopCamera();

  // Primary constraints with ideal resolution
  const primaryConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: Config.facingMode },
      width: { ideal: Config.targetWidth },
      height: { ideal: Config.targetHeight }
    }
  };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (primaryErr) {
    console.warn('[PotholeGuard] Ideal constraints failed, attempting fallback...', primaryErr);

    // Fallback: try basic environment camera without resolution constraints
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' }
      });
    } catch (fallbackErr) {
      // Last-ditch fallback: any available video camera (webcam, front cam, etc.)
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true
        });
      } catch (finalErr) {
        handleCameraError(finalErr);
        return false;
      }
    }
  }

  // Bind stream to video element
  videoEl.srcObject = mediaStream;

  return new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play().then(() => {
        handleResize();
        updateResolutionDisplay();
        resolve(true);
      }).catch((playErr) => {
        handleCameraError(playErr);
        resolve(false);
      });
    };
  });
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  if (videoEl.srcObject) {
    videoEl.srcObject = null;
  }
}

function handleCameraError(err) {
  console.error('[PotholeGuard] Camera Error:', err);
  systemStatusDot.className = 'brand-dot error';

  const name = err.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    showError(
      'Camera Permission Denied',
      'Camera access was blocked by the browser. To fix this in Chrome on Android: tap the tune/lock icon in the URL bar, tap "Permissions", enable "Camera", and tap Retry.'
    );
  } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    showError(
      'No Camera Detected',
      'No usable camera device was found on this device. Ensure your device has an active camera and is not disabled.'
    );
  } else if (name === 'NotReadableError' || name === 'TrackStartError') {
    showError(
      'Camera Already In Use',
      'Another application or browser tab is currently using the camera. Please close other camera apps and tap Retry.'
    );
  } else if (name === 'OverconstrainedError') {
    showError(
      'Camera Constraints Unsupported',
      'Your camera does not support the requested video dimensions. Try adjusting resolution in Settings.'
    );
  } else {
    showError(
      'Camera Access Failed',
      `Could not initialize camera stream (${err.message || name}). Please check browser permissions and reload.`
    );
  }
}

// ==========================================================================
// 3. Screen Wake Lock
// ==========================================================================

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[PotholeGuard] Screen Wake Lock acquired.');
      wakeLock.addEventListener('release', () => {
        console.log('[PotholeGuard] Screen Wake Lock was released.');
      });
    } catch (err) {
      console.warn('[PotholeGuard] Screen Wake Lock error:', err);
    }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && isRunning) {
    requestWakeLock();
  }
}

// ==========================================================================
// 4. Frame Rate (FPS) & Canvas Alignment
// ==========================================================================

function startFpsMonitor() {
  frameCount = 0;
  lastFpsUpdateTime = performance.now();
  lastFrameTime = performance.now();

  if ('requestVideoFrameCallback' in videoEl) {
    const onFrame = (now) => {
      if (!isRunning) return;
      recordFrame(now);
      videoEl.requestVideoFrameCallback(onFrame);
    };
    videoEl.requestVideoFrameCallback(onFrame);
  } else {
    const onRaf = (now) => {
      if (!isRunning) return;
      recordFrame(now);
      animationFrameId = requestAnimationFrame(onRaf);
    };
    animationFrameId = requestAnimationFrame(onRaf);
  }
}

function recordFrame(now) {
  frameCount++;
  const delta = now - lastFpsUpdateTime;

  if (delta >= 500) {
    // Update every 500ms
    fpsEstimate = (frameCount / delta) * 1000;
    fpsValueEl.textContent = fpsEstimate.toFixed(1);
    frameCount = 0;
    lastFpsUpdateTime = now;
  }
}

function updateResolutionDisplay() {
  if (videoEl.videoWidth && videoEl.videoHeight) {
    resValueEl.textContent = `${videoEl.videoWidth}x${videoEl.videoHeight}`;
  }
}

function handleResize() {
  // Sync canvas overlay resolution with viewport
  const rect = videoEl.getBoundingClientRect();
  canvasEl.width = rect.width;
  canvasEl.height = rect.height;
  updateResolutionDisplay();
}

// ==========================================================================
// 5. Friendly Errors & Toasts
// ==========================================================================

function showError(title, msg) {
  errorTitle.textContent = title;
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2500);
}

// ==========================================================================
// 6. Settings Panel
// ==========================================================================

function initSettingsPanel() {
  settingsOpenBtn.addEventListener('click', () => {
    populateSettingsForm();
    settingsBackdrop.classList.add('open');
  });

  settingsCloseBtn.addEventListener('click', () => {
    settingsBackdrop.classList.remove('open');
  });

  settingsBackdrop.addEventListener('click', (e) => {
    if (e.target === settingsBackdrop) {
      settingsBackdrop.classList.remove('open');
    }
  });

  // Real-time slider badge value update
  settingsForm.addEventListener('input', (e) => {
    const target = e.target;
    if (target.type === 'range') {
      const badge = document.getElementById(`val-${target.name}`);
      if (badge) {
        formatBadgeValue(target.name, target.value, badge);
      }
    }
  });

  // Save Settings
  settingsSaveBtn.addEventListener('click', () => {
    const formData = new FormData(settingsForm);
    const updates = {};

    // Process inputs
    for (const [key, val] of Object.entries(Config)) {
      const input = settingsForm.elements[key];
      if (!input) continue;

      if (typeof val === 'boolean') {
        updates[key] = input.checked;
      } else if (typeof val === 'number') {
        updates[key] = parseFloat(input.value);
      }
    }

    saveConfig(updates);
    showToast('Settings saved to localStorage');
    settingsBackdrop.classList.remove('open');
  });

  // Reset to Defaults
  settingsResetBtn.addEventListener('click', () => {
    if (confirm('Reset all settings to default values?')) {
      resetConfig();
      populateSettingsForm();
      showToast('Settings restored to defaults');
    }
  });
}

function formatBadgeValue(key, val, badgeEl) {
  const num = parseFloat(val);
  if (key === 'cameraHeightM') badgeEl.textContent = `${num.toFixed(2)} m`;
  else if (key.endsWith('Deg')) badgeEl.textContent = `${num.toFixed(1)}°`;
  else if (key === 'alertCooldownSec') badgeEl.textContent = `${num.toFixed(1)} s`;
  else if (key.endsWith('Kmh')) badgeEl.textContent = `${num.toFixed(0)} km/h`;
  else if (key.endsWith('M')) badgeEl.textContent = `${num.toFixed(0)} m`;
  else if (Number.isInteger(num)) badgeEl.textContent = num.toString();
  else badgeEl.textContent = num.toFixed(2);
}

function populateSettingsForm() {
  const current = loadConfig();

  for (const [key, val] of Object.entries(current)) {
    const input = settingsForm.elements[key];
    if (!input) continue;

    if (input.type === 'checkbox') {
      input.checked = Boolean(val);
    } else {
      input.value = val;
      const badge = document.getElementById(`val-${key}`);
      if (badge) {
        formatBadgeValue(key, val, badge);
      }
    }
  }
}

// Start application
initApp();
