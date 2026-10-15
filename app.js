/**
 * PotholeGuard - Main Application Controller
 * Manages camera, sensor orientation, speed, distance estimation,
 * multi-frame tracking, dynamic risk engine, triple-redundant alerts,
 * calibration, validation debug, and session logging.
 */

import { Config, saveConfig, resetConfig, loadConfig } from './config.js';
import { initDetector, detectFrame, drawDetections, drawCorridor, getDetectorState } from './detector.js';
import { PotholeTracker } from './tracker.js';
import { checkInPath, estimateDistance, solveCalibration, calculateFocalLengthY } from './geometry.js';
import { startSpeedTracker, stopSpeedTracker, getSpeedState, setSimulationSpeed } from './speed.js';
import { RiskEngine, RISK_LEVELS } from './risk.js';
import { initAlerts, unlockAudio, handleRiskUpdate, triggerTestAlert } from './alerts.js';
import {
  startSession,
  stopSession,
  markEvent,
  downloadSessionCsv,
  isLoggingActive,
  recordGpsFix,
  getSessionSummary
} from './logger.js';

// DOM Elements - Viewport & Video
const videoEl = document.getElementById('camera-video');
const canvasEl = document.getElementById('overlay-canvas');
const overlayCtx = canvasEl.getContext('2d');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const systemStatusDot = document.getElementById('system-status-dot');

// HUD Topbar Elements
const speedValueEl = document.getElementById('speed-value');
const backendValueEl = document.getElementById('backend-value');
const inferValueEl = document.getElementById('infer-value');
const detValueEl = document.getElementById('det-value');
const fpsValueEl = document.getElementById('fps-value');
const testImageBtn = document.getElementById('test-image-btn');
const testImageInput = document.getElementById('test-image-input');
const calibOpenBtn = document.getElementById('calib-open-btn');
const debugOpenBtn = document.getElementById('debug-open-btn');
const sessionOpenBtn = document.getElementById('session-open-btn');
const settingsOpenBtn = document.getElementById('settings-open-btn');

// Error & Toast
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorRetryBtn = document.getElementById('error-retry-btn');
const errorDismissBtn = document.getElementById('error-dismiss-btn');
const toastEl = document.getElementById('toast');

// Settings Drawer
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsForm = document.getElementById('settings-form');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsResetBtn = document.getElementById('settings-reset-btn');

// Calibration Drawer
const calibBackdrop = document.getElementById('calib-backdrop');
const calibCloseBtn = document.getElementById('calib-close-btn');
const calibD1Input = document.getElementById('calib-d1-input');
const calibD2Input = document.getElementById('calib-d2-input');
const calibCap1Btn = document.getElementById('calib-cap1-btn');
const calibCap2Btn = document.getElementById('calib-cap2-btn');
const calibP1Status = document.getElementById('calib-p1-status');
const calibP2Status = document.getElementById('calib-p2-status');
const calibSolveBtn = document.getElementById('calib-solve-btn');
const calibResultsCard = document.getElementById('calib-results-card');
const calibResTheta = document.getElementById('calib-res-theta');
const calibResFy = document.getElementById('calib-res-fy');
const calibResVfov = document.getElementById('calib-res-vfov');
const calibResError = document.getElementById('calib-res-error');
const calibApplyBtn = document.getElementById('calib-apply-btn');

// Debug Drawer & Validation
const debugBackdrop = document.getElementById('debug-backdrop');
const debugCloseBtn = document.getElementById('debug-close-btn');
const dbgRawDist = document.getElementById('dbg-raw-dist');
const dbgCorrDist = document.getElementById('dbg-corr-dist');
const dbgPitch = document.getElementById('dbg-pitch');
const dbgGyroBeta = document.getElementById('dbg-gyro-beta');
const dbgHeight = document.getElementById('dbg-height');
const dbgFy = document.getElementById('dbg-fy');
const dbgTrueDistInput = document.getElementById('dbg-true-dist-input');
const dbgLogSampleBtn = document.getElementById('dbg-log-sample-btn');
const dbgSamplesTbody = document.getElementById('dbg-samples-tbody');
const dbgDownloadCsvBtn = document.getElementById('dbg-download-csv-btn');
const dbgClearSamplesBtn = document.getElementById('dbg-clear-samples-btn');
const simEnableToggle = document.getElementById('sim-enable-toggle');
const simSpeedRange = document.getElementById('sim-speed-range');
const simSpeedVal = document.getElementById('sim-speed-val');
const simDistRange = document.getElementById('sim-dist-range');
const simDistVal = document.getElementById('sim-dist-val');
const testAlertInfoBtn = document.getElementById('test-alert-info-btn');
const testAlertWarnBtn = document.getElementById('test-alert-warn-btn');
const testAlertHighBtn = document.getElementById('test-alert-high-btn');

// Session Logger Drawer
const sessionBackdrop = document.getElementById('session-backdrop');
const sessionCloseBtn = document.getElementById('session-close-btn');
const sessionStatusDot = document.getElementById('session-status-dot');
const sessionStatusText = document.getElementById('session-status-text');
const sessionTimerText = document.getElementById('session-timer-text');
const sessionToggleBtn = document.getElementById('session-toggle-btn');
const markGoodBtn = document.getElementById('mark-good-btn');
const markFalseBtn = document.getElementById('mark-false-btn');
const markMissedBtn = document.getElementById('mark-missed-btn');
const sumAvgFps = document.getElementById('sum-avg-fps');
const sumAvgInfer = document.getElementById('sum-avg-infer');
const sumP95Infer = document.getElementById('sum-p95-infer');
const sumTotalAlerts = document.getElementById('sum-total-alerts');
const sumGoodAlerts = document.getElementById('sum-good-alerts');
const sumFalseAlarms = document.getElementById('sum-false-alarms');
const sumMissed = document.getElementById('sum-missed');
const sumLeadTime = document.getElementById('sum-lead-time');
const sumBatteryDrop = document.getElementById('sum-battery-drop');
const sumDistance = document.getElementById('sum-distance');
const sumFalsePerKm = document.getElementById('sum-false-per-km');
const sessionDownloadCsvBtn = document.getElementById('session-download-csv-btn');

// Pipeline Engines & State
const tracker = new PotholeTracker(Config);
const riskEngine = new RiskEngine(Config);
let latestTracks = [];
let latestRiskState = { level: 'NONE', distanceM: null, ttpSec: null, confidence: null, speedKmh: 0, shouldAlert: false };

let mediaStream = null;
let wakeLock = null;
let isRunning = false;
let isInferring = false;
let isTestImageActive = false;
let frameCount = 0;
let lastFpsUpdateTime = performance.now();
let fpsEstimate = 0.0;
let animationFrameId = null;

// Sensor & Orientation State
let rawGyroBeta = null;
let filteredPitchDeg = 12.0;
let isSensorAvailable = false;

// Calibration State
let calibP1Row = null;
let calibP2Row = null;
let lastSolvedCalib = null;

// Validation Samples State (Manual 4)
let validationSamples = [];

// Session Timer
let sessionTimerInterval = null;
let sessionStartEpoch = 0;

// ==========================================================================
// 1. Initial Setup & Service Worker
// ==========================================================================

function initApp() {
  // Service Worker for offline capability
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PotholeGuard] ServiceWorker registered with scope:', reg.scope);
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

  // Initialize Alert Engine (Audio & Visual Banner)
  initAlerts();

  // Initialize Device Orientation Sensor
  initDeviceOrientation();

  // Bind Start & Error UI
  startBtn.addEventListener('click', handleStart);
  errorRetryBtn.addEventListener('click', () => {
    hideError();
    startCamera();
  });
  errorDismissBtn.addEventListener('click', hideError);

  // Initialize UI Panels
  initSettingsPanel();
  initCalibrationPanel();
  initDebugPanel();
  initSessionPanel();
  initTestImageHandlers();

  // Resize & Orientation handlers
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Preload AI detector in background
  if (typeof window.ort !== 'undefined') {
    initDetector((status) => {
      if (status.includes('Ready')) {
        backendValueEl.textContent = status.includes('WebGPU') ? 'WebGPU' : 'WASM';
      }
    }).then(({ backend }) => {
      backendValueEl.textContent = backend;
    }).catch((err) => {
      console.warn('[PotholeGuard] Preload notice:', err.message);
    });
  }
}

// ==========================================================================
// 2. Camera & Sensor Lifecycle
// ==========================================================================

async function handleStart() {
  hideError();
  isTestImageActive = false;
  startBtn.disabled = true;
  startBtn.textContent = 'Unlocking Sensors...';

  // 1. Unlock Web Audio & SpeechSynthesis with user gesture
  unlockAudio();

  // 2. Start GPS Speed Tracker
  startSpeedTracker((speedState) => {
    speedValueEl.textContent = speedState.displayString;
  });

  // 3. Preload/Initialize AI Model
  startBtn.textContent = 'Initializing AI...';
  try {
    const { backend } = await initDetector((status) => {
      startBtn.textContent = status;
    });
    backendValueEl.textContent = backend;
  } catch (aiErr) {
    console.warn('[PotholeGuard] AI preload warning:', aiErr);
  }

  // 4. Start Camera Stream
  startBtn.textContent = 'Starting Camera...';
  const success = await startCamera();
  if (success) {
    startOverlay.classList.add('hidden');
    systemStatusDot.classList.remove('standby', 'error');
    isRunning = true;
    requestWakeLock();
    startFpsMonitor();
    showToast('System Active. Camera & Alerts Ready.');
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

async function startCamera() {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!window.isSecureContext && !isLocal) {
    showError(
      'HTTPS Required',
      'Mobile Chrome disables camera, vibration, and sensors on unencrypted HTTP. Open over HTTPS or localhost.'
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

  stopCamera();

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
    console.warn('[PotholeGuard] Ideal constraints failed, fallback to environment...', primaryErr);
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' }
      });
    } catch (fallbackErr) {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } catch (finalErr) {
        handleCameraError(finalErr);
        return false;
      }
    }
  }

  videoEl.srcObject = mediaStream;

  return new Promise((resolve) => {
    videoEl.onloadedmetadata = () => {
      videoEl.play().then(() => {
        handleResize();
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
    showError('Camera Permission Denied', 'Camera access blocked. Enable Camera permissions in Chrome settings.');
  } else if (name === 'NotFoundError') {
    showError('No Camera Detected', 'No usable camera was found on this device.');
  } else {
    showError('Camera Error', err.message || 'Could not start camera feed.');
  }
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('[PotholeGuard] Screen Wake Lock acquired.');
    } catch (err) {
      console.warn('[PotholeGuard] Wake lock error:', err);
    }
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && isRunning) {
    requestWakeLock();
  }
}

// ==========================================================================
// 3. Device Orientation & Pitch Sensor
// ==========================================================================

function initDeviceOrientation() {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

  window.addEventListener('deviceorientation', (e) => {
    if (e.beta === null || e.beta === undefined) return;
    rawGyroBeta = e.beta;
    isSensorAvailable = true;

    // Convert orientation beta to downward pitch below horizontal:
    // In typical portrait phone mount (upright): pitch ~ (beta - 90 deg)
    // In landscape mount: pitch ~ beta or gamma
    let computedPitch = Math.abs(e.beta - 90.0);
    if (computedPitch > 60) computedPitch = Math.abs(e.beta); // fallback for alternate mounts

    // Low-pass exponential filter (alpha = 0.15) to absorb road/engine vibration
    const alpha = 0.15;
    filteredPitchDeg = alpha * computedPitch + (1 - alpha) * filteredPitchDeg;
  });
}

function getEffectivePitch() {
  if (Config.manualPitchOverride || !isSensorAvailable) {
    return (Config.cameraPitchDeg ?? 12.0) + (Config.pitchTrimDeg ?? 0.0);
  }
  return filteredPitchDeg + (Config.pitchTrimDeg ?? 0.0);
}

// ==========================================================================
// 4. Main Inference & Processing Loop
// ==========================================================================

function startFpsMonitor() {
  frameCount = 0;
  lastFpsUpdateTime = performance.now();

  const onFrame = (now) => {
    if (!isRunning) return;
    frameCount++;
    const delta = now - lastFpsUpdateTime;

    if (delta >= 500) {
      fpsEstimate = (frameCount / delta) * 1000;
      fpsValueEl.textContent = fpsEstimate.toFixed(1);
      frameCount = 0;
      lastFpsUpdateTime = now;
    }

    if (!isInferring && !isTestImageActive && isRunning && videoEl.videoWidth && videoEl.videoHeight) {
      runDetectorLoop();
    }

    if ('requestVideoFrameCallback' in videoEl) {
      videoEl.requestVideoFrameCallback(onFrame);
    } else {
      animationFrameId = requestAnimationFrame(onFrame);
    }
  };

  if ('requestVideoFrameCallback' in videoEl) {
    videoEl.requestVideoFrameCallback(onFrame);
  } else {
    animationFrameId = requestAnimationFrame(onFrame);
  }
}

async function runDetectorLoop() {
  if (isInferring || !isRunning || isTestImageActive) return;
  if (!videoEl.videoWidth || !videoEl.videoHeight) return;

  isInferring = true;
  try {
    const result = await detectFrame(videoEl);
    if (result && isRunning && !isTestImageActive) {
      inferValueEl.textContent = `${result.inferenceMs}ms`;

      // 1. Multi-Frame Tracker Update
      latestTracks = tracker.update(result.detections);

      // 2. Geometry: Corridor check and Monocular Distance Estimation
      const effectivePitch = getEffectivePitch();
      for (const track of latestTracks) {
        checkInPath(track, videoEl.videoWidth, videoEl.videoHeight, Config);
        const distResult = estimateDistance(track, videoEl.videoWidth, videoEl.videoHeight, effectivePitch, Config);
        tracker.updateDistance(track, distResult);
      }

      // 3. Confirmed Tracks Count
      const confirmedTracks = tracker.getConfirmedTracks();
      detValueEl.textContent = confirmedTracks.length > 0 ? confirmedTracks.length : (latestTracks.length > 0 ? latestTracks.length : 0);

      // 4. Dynamic Risk Engine & Triple-Redundant Alerts
      const speedState = getSpeedState();
      const now = performance.now();
      latestRiskState = riskEngine.evaluate(confirmedTracks, speedState.speedMps, now, Config);

      // 5. Trigger audio, haptic, and visual banner updates
      handleRiskUpdate(latestRiskState);

      // 6. Render Overlays
      drawDetections(
        overlayCtx,
        latestTracks,
        videoEl.videoWidth,
        videoEl.videoHeight,
        canvasEl.width,
        canvasEl.height,
        Config
      );

      // 7. Update Live Debug Telemetry if modal open
      updateDebugLiveTelemetry(effectivePitch);
    }
  } catch (err) {
    console.error('[PotholeGuard] Frame detection error:', err);
  } finally {
    isInferring = false;
  }
}

function updateDebugLiveTelemetry(pitch) {
  if (!debugBackdrop.classList.contains('open')) return;

  const inPathConfirmed = tracker.getConfirmedTracks().filter(t => t.inPath && t.distanceM !== null);
  const target = inPathConfirmed[0] || tracker.getConfirmedTracks()[0];

  dbgRawDist.textContent = target && target.rawDistanceM !== null ? `${target.rawDistanceM.toFixed(1)} m` : '--';
  dbgCorrDist.textContent = target && target.distanceM !== null ? `${target.distanceM.toFixed(1)} m` : '--';
  dbgPitch.textContent = `${pitch.toFixed(1)}°`;
  dbgGyroBeta.textContent = rawGyroBeta !== null ? `${rawGyroBeta.toFixed(1)}°` : 'N/A';
  dbgHeight.textContent = `${(Config.cameraHeightM ?? 1.1).toFixed(2)} m`;

  const fy = calculateFocalLengthY(videoEl.videoHeight || 720, Config);
  dbgFy.textContent = `${Math.round(fy)} px`;
}

// ==========================================================================
// 5. Gallery Test Image Handler
// ==========================================================================

function initTestImageHandlers() {
  if (!testImageBtn || !testImageInput) return;

  testImageBtn.addEventListener('click', () => testImageInput.click());

  testImageInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    showToast('Processing test photo...');
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        isTestImageActive = true;
        startOverlay.classList.add('hidden');
        systemStatusDot.classList.remove('standby', 'error');

        const { backend } = await initDetector();
        backendValueEl.textContent = backend;

        const result = await detectFrame(img);
        inferValueEl.textContent = `${result.inferenceMs}ms`;

        tracker.reset();
        latestTracks = tracker.update(result.detections);

        const effectivePitch = getEffectivePitch();
        for (const track of latestTracks) {
          track.isConfirmed = true;
          checkInPath(track, img.naturalWidth, img.naturalHeight, Config);
          const distResult = estimateDistance(track, img.naturalWidth, img.naturalHeight, effectivePitch, Config);
          tracker.updateDistance(track, distResult);
        }

        detValueEl.textContent = latestTracks.length;
        handleResize();

        // Draw image and overlays with exact aspect-ratio fit
        drawDetections(
          overlayCtx,
          latestTracks,
          img.naturalWidth,
          img.naturalHeight,
          canvasEl.width,
          canvasEl.height,
          Config,
          { fit: 'contain', clear: true, bgImage: img }
        );

        // Evaluate risk with default simulated speed (35 km/h)
        const speedState = getSpeedState();
        const testSpeedMps = speedState.speedMps > 0 ? speedState.speedMps : (35.0 / 3.6);
        latestRiskState = riskEngine.evaluate(latestTracks, testSpeedMps, performance.now(), Config);
        handleRiskUpdate(latestRiskState);

        showToast(`Detected ${latestTracks.length} pothole(s) in ${result.inferenceMs}ms`);
      } catch (err) {
        showError('Test Image Error', err.message || 'Failed to detect potholes.');
      } finally {
        URL.revokeObjectURL(url);
        e.target.value = '';
      }
    };
    img.src = url;
  });
}

function handleResize() {
  const rect = videoEl.getBoundingClientRect();
  canvasEl.width = rect.width || window.innerWidth;
  canvasEl.height = rect.height || window.innerHeight;
  if (!isTestImageActive) {
    const vW = videoEl.videoWidth || 1280;
    const vH = videoEl.videoHeight || 720;
    drawDetections(overlayCtx, latestTracks, vW, vH, canvasEl.width, canvasEl.height, Config);
  }
}

// ==========================================================================
// 6. 2-Point Calibration Panel (Prompt 4)
// ==========================================================================

function initCalibrationPanel() {
  calibOpenBtn.addEventListener('click', () => {
    calibBackdrop.classList.add('open');
  });

  calibCloseBtn.addEventListener('click', () => {
    calibBackdrop.classList.remove('open');
  });

  calibBackdrop.addEventListener('click', (e) => {
    if (e.target === calibBackdrop) calibBackdrop.classList.remove('open');
  });

  // Capture Point 1: Get bottom edge row y_b
  calibCap1Btn.addEventListener('click', () => {
    const target = getCandidateCalibrationTarget();
    if (target) {
      calibP1Row = Math.round(target.box.y2);
      calibP1Status.textContent = `y_b: ${calibP1Row} px`;
      calibP1Status.style.color = '#34d399';
      showToast(`Captured Point 1 at row ${calibP1Row}px`);
    } else {
      showToast('No target detected. Ensure cardboard target is in view.');
    }
  });

  // Capture Point 2: Get bottom edge row y_b
  calibCap2Btn.addEventListener('click', () => {
    const target = getCandidateCalibrationTarget();
    if (target) {
      calibP2Row = Math.round(target.box.y2);
      calibP2Status.textContent = `y_b: ${calibP2Row} px`;
      calibP2Status.style.color = '#34d399';
      showToast(`Captured Point 2 at row ${calibP2Row}px`);
    } else {
      showToast('No target detected. Ensure cardboard target is in view.');
    }
  });

  // Solve Calibration
  calibSolveBtn.addEventListener('click', () => {
    const d1 = parseFloat(calibD1Input.value) || 10.0;
    const d2 = parseFloat(calibD2Input.value) || 20.0;
    const vH = videoEl.videoHeight || 720;
    const H = Config.cameraHeightM || 1.10;

    const y1 = calibP1Row !== null ? calibP1Row : (vH * 0.48); // default fallback row if manual
    const y2 = calibP2Row !== null ? calibP2Row : (vH * 0.44);

    try {
      lastSolvedCalib = solveCalibration(d1, y1, d2, y2, vH, H);
      calibResultsCard.classList.remove('hidden');
      calibResTheta.textContent = `${lastSolvedCalib.thetaDeg}°`;
      calibResFy.textContent = `${lastSolvedCalib.fy} px`;
      calibResVfov.textContent = `${lastSolvedCalib.vFovDeg}°`;
      calibResError.textContent = `${lastSolvedCalib.maxErrorM} m`;
      calibApplyBtn.disabled = false;
      showToast('Optimal calibration computed!');
    } catch (err) {
      alert(`Calibration solver error: ${err.message}`);
    }
  });

  // Apply Calibration to Config
  calibApplyBtn.addEventListener('click', () => {
    if (!lastSolvedCalib) return;
    saveConfig({
      cameraPitchDeg: lastSolvedCalib.thetaDeg,
      vFovDeg: lastSolvedCalib.vFovDeg,
      focalLengthY: lastSolvedCalib.fy
    });
    populateSettingsForm();
    calibBackdrop.classList.remove('open');
    showToast(`Saved: Pitch ${lastSolvedCalib.thetaDeg}°, vFOV ${lastSolvedCalib.vFovDeg}°`);
  });
}

function getCandidateCalibrationTarget() {
  const confirmed = tracker.getConfirmedTracks();
  if (confirmed.length > 0) return confirmed[0];
  if (latestTracks.length > 0) return latestTracks[0];
  return null;
}

// ==========================================================================
// 7. Distance Debug & Validation Panel (Prompt 4 Manual 4 & Simulation)
// ==========================================================================

function initDebugPanel() {
  debugOpenBtn.addEventListener('click', () => {
    debugBackdrop.classList.add('open');
  });

  debugCloseBtn.addEventListener('click', () => {
    debugBackdrop.classList.remove('open');
  });

  debugBackdrop.addEventListener('click', (e) => {
    if (e.target === debugBackdrop) debugBackdrop.classList.remove('open');
  });

  // Log Sample for Distance Validation Experiment
  dbgLogSampleBtn.addEventListener('click', () => {
    const trueDist = parseFloat(dbgTrueDistInput.value);
    if (Number.isNaN(trueDist) || trueDist <= 0) {
      alert('Please enter a valid true distance in meters (e.g. 5, 10, 15, 20).');
      return;
    }

    const inPathTracks = tracker.getConfirmedTracks().filter(t => t.inPath);
    const target = inPathTracks[0] || tracker.getConfirmedTracks()[0] || latestTracks[0];

    const rawD = target && target.rawDistanceM !== null ? target.rawDistanceM : 0;
    const corrD = target && target.distanceM !== null ? target.distanceM : 0;
    const tId = target ? target.id : 0;

    const absErr = corrD > 0 ? Math.abs(corrD - trueDist) : trueDist;
    const pctErr = corrD > 0 ? (absErr / trueDist) * 100 : 100;

    const sample = {
      time: new Date().toLocaleTimeString(),
      trackId: tId,
      rawD: parseFloat(rawD.toFixed(2)),
      corrD: parseFloat(corrD.toFixed(2)),
      trueD: trueDist,
      absErr: parseFloat(absErr.toFixed(2)),
      pctErr: parseFloat(pctErr.toFixed(1))
    };

    validationSamples.push(sample);
    renderValidationSamples();
    showToast(`Logged sample: True ${trueDist}m, Read ${corrD.toFixed(1)}m`);
  });

  // Download Samples as CSV
  dbgDownloadCsvBtn.addEventListener('click', () => {
    if (validationSamples.length === 0) {
      alert('No validation samples logged yet.');
      return;
    }

    const header = 'Time,Track ID,Raw Distance (m),Corrected Distance (m),True Distance (m),Abs Error (m),Error (%)\n';
    const rows = validationSamples.map(s => 
      `${s.time},${s.trackId},${s.rawD},${s.corrD},${s.trueD},${s.absErr},${s.pctErr}`
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pothole_distance_validation.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Clear samples
  dbgClearSamplesBtn.addEventListener('click', () => {
    validationSamples = [];
    renderValidationSamples();
  });

  // Simulation Mode Controls
  simEnableToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      const spd = parseFloat(simSpeedRange.value);
      setSimulationSpeed(spd);
      showToast('Simulation Mode ENABLED');
    } else {
      setSimulationSpeed(null);
      showToast('Simulation Mode DISABLED (Live GPS active)');
    }
  });

  simSpeedRange.addEventListener('input', (e) => {
    simSpeedVal.textContent = `${e.target.value} km/h`;
    if (simEnableToggle.checked) {
      setSimulationSpeed(parseFloat(e.target.value));
    }
  });

  simDistRange.addEventListener('input', (e) => {
    simDistVal.textContent = `${parseFloat(e.target.value).toFixed(1)} m`;
  });

  // Alert Test Buttons
  testAlertInfoBtn.addEventListener('click', () => triggerTestAlert('INFO'));
  testAlertWarnBtn.addEventListener('click', () => triggerTestAlert('WARN'));
  testAlertHighBtn.addEventListener('click', () => triggerTestAlert('HIGH'));
}

function renderValidationSamples() {
  if (validationSamples.length === 0) {
    dbgSamplesTbody.innerHTML = '<tr><td colspan="6" style="padding: 12px; text-align: center; color: var(--text-muted);">No samples logged yet</td></tr>';
    return;
  }

  dbgSamplesTbody.innerHTML = validationSamples.map(s => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
      <td style="padding: 4px 6px;">${s.time}</td>
      <td style="padding: 4px 6px;">#${s.trackId}</td>
      <td style="padding: 4px 6px;">${s.rawD}m</td>
      <td style="padding: 4px 6px;">${s.corrD}m</td>
      <td style="padding: 4px 6px; font-weight:700;">${s.trueD}m</td>
      <td style="padding: 4px 6px; color: ${s.absErr < 1.5 ? '#34d399' : '#f87171'};">${s.absErr}m</td>
    </tr>
  `).join('');
}

// ==========================================================================
// 8. Session Logger & Metrics Summary Panel (Prompt 7)
// ==========================================================================

function initSessionPanel() {
  sessionOpenBtn.addEventListener('click', () => {
    updateSummaryDisplay();
    sessionBackdrop.classList.add('open');
  });

  sessionCloseBtn.addEventListener('click', () => {
    sessionBackdrop.classList.remove('open');
  });

  sessionBackdrop.addEventListener('click', (e) => {
    if (e.target === sessionBackdrop) sessionBackdrop.classList.remove('open');
  });

  // START / STOP Session Button
  sessionToggleBtn.addEventListener('click', async () => {
    if (!isLoggingActive()) {
      // Start recording
      sessionStartEpoch = Date.now();
      await startSession(() => {
        const speedState = getSpeedState();
        const confTrack = tracker.getConfirmedTracks().find(t => t.inPath);
        return {
          fps: parseFloat(fpsEstimate.toFixed(1)),
          inferMs: getDetectorState().inferenceMs,
          trackId: latestRiskState.trackId,
          confidence: latestRiskState.confidence,
          inPath: Boolean(confTrack),
          rawDistanceM: confTrack?.rawDistanceM ?? null,
          correctedDistanceM: latestRiskState.distanceM,
          speedKmh: latestRiskState.speedKmh,
          ttpSec: latestRiskState.ttpSec,
          riskLevel: latestRiskState.level,
          alertFired: latestRiskState.shouldAlert
        };
      });

      sessionStatusDot.className = 'brand-dot';
      sessionStatusText.textContent = 'RECORDING LIVE';
      sessionToggleBtn.textContent = 'STOP RECORDING SESSION';
      sessionToggleBtn.style.background = '#ef4444';

      sessionTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - sessionStartEpoch) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        sessionTimerText.textContent = `${mins}:${secs}`;
      }, 1000);

      showToast('Recording session started');
    } else {
      // Stop recording
      if (sessionTimerInterval) clearInterval(sessionTimerInterval);
      const summary = await stopSession();

      sessionStatusDot.className = 'brand-dot standby';
      sessionStatusText.textContent = 'Session Stopped';
      sessionToggleBtn.textContent = 'START RECORDING SESSION';
      sessionToggleBtn.style.background = '#10b981';

      updateSummaryDisplay(summary);
      showToast('Session saved to IndexedDB');
    }
  });

  // Event Mark Buttons
  markGoodBtn.addEventListener('click', () => {
    markEvent('GOOD_ALERT');
    showToast('Marked: GOOD ALERT');
    updateSummaryDisplay();
  });

  markFalseBtn.addEventListener('click', () => {
    markEvent('FALSE_ALARM');
    showToast('Marked: FALSE ALARM');
    updateSummaryDisplay();
  });

  markMissedBtn.addEventListener('click', () => {
    markEvent('MISSED_POTHOLE');
    showToast('Marked: MISSED POTHOLE');
    updateSummaryDisplay();
  });

  // Download Session CSV
  sessionDownloadCsvBtn.addEventListener('click', () => {
    downloadSessionCsv();
  });
}

function updateSummaryDisplay(summary = getSessionSummary()) {
  sumAvgFps.textContent = summary.avgFps > 0 ? summary.avgFps : fpsEstimate.toFixed(1);
  sumAvgInfer.textContent = `${summary.avgInferMs} ms`;
  sumP95Infer.textContent = `${summary.p95InferMs} ms`;
  sumTotalAlerts.textContent = summary.totalAlerts;
  sumGoodAlerts.textContent = summary.goodAlerts;
  sumFalseAlarms.textContent = summary.falseAlarms;
  sumMissed.textContent = summary.missedPotholes;
  sumLeadTime.textContent = `${summary.avgLeadTimeSec} s`;
  sumBatteryDrop.textContent = `${summary.batteryDrop}%`;
  sumDistance.textContent = `${summary.distanceTraveledKm} km`;
  sumFalsePerKm.textContent = summary.falseAlarmsPerKm;
}

// ==========================================================================
// 9. Settings Panel (Prompt 1, 2, 3)
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
    if (e.target === settingsBackdrop) settingsBackdrop.classList.remove('open');
  });

  // Real-time slider badge value update
  settingsForm.addEventListener('input', (e) => {
    const target = e.target;
    if (target.type === 'range') {
      const badge = document.getElementById(`val-${target.name}`);
      if (badge) formatBadgeValue(target.name, target.value, badge);
      if (['horizonY', 'corridorBottomWidth', 'corridorTopWidth', 'corridorCenterX'].includes(target.name)) {
        Config[target.name] = parseFloat(target.value);
        handleResize();
      }
    }
  });

  // Save Settings
  settingsSaveBtn.addEventListener('click', () => {
    const updates = {};
    for (const [key, val] of Object.entries(Config)) {
      const input = settingsForm.elements[key];
      if (!input) continue;
      if (typeof val === 'boolean') updates[key] = input.checked;
      else if (typeof val === 'number') updates[key] = parseFloat(input.value);
    }
    saveConfig(updates);
    showToast('Settings saved to localStorage');
    settingsBackdrop.classList.remove('open');
  });

  // Reset Defaults
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
    if (input.type === 'checkbox') input.checked = Boolean(val);
    else {
      input.value = val;
      const badge = document.getElementById(`val-${key}`);
      if (badge) formatBadgeValue(key, val, badge);
    }
  }
}

// ==========================================================================
// 10. Notifications & Errors
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
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// Start application
initApp();
