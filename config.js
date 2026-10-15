/**
 * PotholeGuard - Configuration Module
 * RULE 1: Every tunable number lives ONLY in config.js.
 * Values can be edited in the settings panel and are saved to localStorage.
 */

export const DEFAULT_CONFIG = Object.freeze({
  // --- Detection Parameters ---
  confidenceThreshold: 0.30,
  iouThreshold: 0.45,
  modelInputWidth: 640,
  modelInputHeight: 640,
  forceWasm: false,

  // --- Multi-Frame Tracker ---
  confirmFrames: 2,         // Must be seen in at least X frames
  windowFrames: 5,          // Out of the last Y frames
  maxMissedFrames: 2,       // Delete track after Z consecutive misses
  trackerIouThreshold: 0.25,
  smoothingAlpha: 0.4,      // Box smoothing factor (0 = keep old, 1 = snap to new)

  // --- Rider-Path Corridor (Geometry) ---
  horizonY: 0.45,           // Fraction of frame height (0.0 to 1.0)
  corridorBottomWidth: 0.85,// Fraction of frame width at bottom
  corridorTopWidth: 0.25,   // Fraction of frame width at horizon
  corridorCenterX: 0.50,    // Center fraction of frame width
  corridorHysteresis: 0.03, // Edge tolerance to avoid flicker

  // --- Camera & Mount Geometry ---
  cameraHeightM: 1.10,      // Lens height above ground in meters (H)
  cameraPitchDeg: 12.0,     // Nominal pitch angle below horizontal in degrees (theta)
  pitchTrimDeg: 0.0,        // Calibration trim offset in degrees
  useDeviceOrientationPitch: true, // Use sensor beta if available
  manualPitchOverride: false,      // Force manual pitch instead of sensor
  vFovDeg: 50.0,            // Assumed vertical Field of View in degrees
  targetWidth: 1280,        // Camera ideal width
  targetHeight: 720,        // Camera ideal height
  facingMode: 'environment',

  // --- Monocular Distance & Calibration ---
  maxDistanceM: 35.0,       // Max valid distance in meters
  distanceFilterWindow: 5,  // Median filter window (frames)
  distLinearA: 1.0,         // Linear correction slope (d_final = a*d + b)
  distLinearB: 0.0,         // Linear correction offset (meters)
  calibDist1M: 10.0,        // First calibration point distance
  calibDist2M: 20.0,        // Second calibration point distance

  // --- Risk Engine, Speed & TTP ---
  distInfoMinM: 20.0,       // Info band min distance
  distInfoMaxM: 30.0,       // Info band max distance
  distWarnMinM: 10.0,       // Warn band min distance
  distWarnMaxM: 20.0,       // Warn band max distance
  distHighMaxM: 10.0,       // High risk threshold (under 10m)
  minSpeedMps: 1.0,         // Min speed denominator for TTP
  minAlertSpeedKmh: 5.0,    // Minimum GPS speed to activate warnings
  alertConfidence: 0.40,    // Min confidence to trigger rider warning
  ttpEscalationSec: 1.5,    // Escalate risk if time-to-pothole < threshold
  riskHysteresisSec: 1.0,   // Delay before lowering risk level
  alertCooldownSec: 4.0,    // Minimum seconds between spoken alerts per track

  // --- Alert Settings ---
  voiceEnabled: true,
  vibrationEnabled: true,
  beepsEnabled: true,
  voiceVolume: 1.0,
  speechRate: 1.1
});

const STORAGE_KEY = 'potholeguard_config_v2';

// Mutable runtime configuration object initialized with defaults
export const Config = { ...DEFAULT_CONFIG };

/**
 * Load persisted overrides from localStorage
 */
export function loadConfig() {
  if (typeof localStorage === 'undefined') return Config;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [key, value] of Object.entries(parsed)) {
        if (key in DEFAULT_CONFIG) {
          // Preserve numeric/boolean typing
          if (typeof DEFAULT_CONFIG[key] === 'number') {
            const num = Number(value);
            if (!Number.isNaN(num)) Config[key] = num;
          } else if (typeof DEFAULT_CONFIG[key] === 'boolean') {
            Config[key] = Boolean(value);
          } else {
            Config[key] = value;
          }
        }
      }
    }
  } catch (err) {
    console.warn('PotholeGuard: Could not load stored config, using defaults.', err);
  }
  return Config;
}

/**
 * Save updated values to localStorage and update active Config
 */
export function saveConfig(updates = {}) {
  for (const [key, value] of Object.entries(updates)) {
    if (key in DEFAULT_CONFIG) {
      if (typeof DEFAULT_CONFIG[key] === 'number') {
        const num = Number(value);
        if (!Number.isNaN(num)) Config[key] = num;
      } else if (typeof DEFAULT_CONFIG[key] === 'boolean') {
        Config[key] = Boolean(value);
      } else {
        Config[key] = value;
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Config));
    } catch (err) {
      console.error('PotholeGuard: Failed to save config to localStorage.', err);
    }
  }

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('potholeguard:config-updated', { detail: Config }));
  }
  return Config;
}

/**
 * Reset config back to default values
 */
export function resetConfig() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('PotholeGuard: Failed to clear config from localStorage.', err);
    }
  }

  for (const key of Object.keys(Config)) {
    delete Config[key];
  }
  Object.assign(Config, DEFAULT_CONFIG);

  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('potholeguard:config-updated', { detail: Config }));
  }
  return Config;
}

// Initial load
loadConfig();
