/**
 * PotholeGuard - GPS Speed Tracker
 * Tracks rider speed using Geolocation API watchPosition with Haversine fallback and smoothing.
 */

import { Config } from './config.js';

let watchId = null;
let lastFix = null;
let currentSpeedMps = 0.0;
let isSpeedUnknown = true;
let lastUpdateTime = 0;
let simulationSpeedKmh = null; // When non-null, overrides GPS speed

// Callbacks for subscribers
const speedListeners = new Set();

/**
 * Haversine formula to calculate great-circle distance between two GPS coordinates in meters
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Start listening to GPS position updates
 */
export function startSpeedTracker(onSpeedUpdate) {
  if (onSpeedUpdate) {
    speedListeners.add(onSpeedUpdate);
  }

  if (!navigator.geolocation) {
    console.warn('[PotholeGuard Speed] Geolocation API not supported in this browser.');
    isSpeedUnknown = true;
    notifySpeedListeners();
    return false;
  }

  if (watchId !== null) return true;

  const options = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  };

  watchId = navigator.geolocation.watchPosition(
    handlePositionSuccess,
    handlePositionError,
    options
  );

  // Stale check interval: if no fix for 3 seconds, mark UNKNOWN
  setInterval(() => {
    if (simulationSpeedKmh !== null) return;
    if (lastUpdateTime > 0 && performance.now() - lastUpdateTime > 3000) {
      if (!isSpeedUnknown) {
        isSpeedUnknown = true;
        currentSpeedMps = 0.0;
        notifySpeedListeners();
      }
    }
  }, 1000);

  return true;
}

/**
 * Stop GPS tracking
 */
export function stopSpeedTracker() {
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

/**
 * Handle new GPS fix from Geolocation API
 */
function handlePositionSuccess(position) {
  const now = performance.now();
  const coords = position.coords;
  let rawSpeedMps = null;

  // 1. Direct hardware speed reporting
  if (coords.speed !== null && coords.speed !== undefined && !Number.isNaN(coords.speed) && coords.speed >= 0) {
    rawSpeedMps = coords.speed;
  } 
  // 2. Haversine distance fallback between consecutive fixes
  else if (lastFix && lastFix.coords) {
    const dtSec = (position.timestamp - lastFix.timestamp) / 1000.0;
    if (dtSec > 0.3 && dtSec < 10.0) {
      const distM = calculateHaversineDistance(
        lastFix.coords.latitude,
        lastFix.coords.longitude,
        coords.latitude,
        coords.longitude
      );
      rawSpeedMps = distM / dtSec;
    }
  }

  lastFix = position;
  lastUpdateTime = now;

  if (rawSpeedMps !== null) {
    // Light exponential smoothing: alpha = 0.6
    const alpha = 0.6;
    currentSpeedMps = isSpeedUnknown ? rawSpeedMps : alpha * rawSpeedMps + (1 - alpha) * currentSpeedMps;
    isSpeedUnknown = false;
  } else if (isSpeedUnknown) {
    currentSpeedMps = 0.0;
  }

  notifySpeedListeners();
}

function handlePositionError(err) {
  console.warn('[PotholeGuard Speed] Geolocation watch error:', err.message);
  isSpeedUnknown = true;
  notifySpeedListeners();
}

/**
 * Set simulation speed override in km/h (pass null to return to real GPS)
 */
export function setSimulationSpeed(speedKmh) {
  if (speedKmh === null || speedKmh === undefined) {
    simulationSpeedKmh = null;
  } else {
    simulationSpeedKmh = Math.max(0, Number(speedKmh));
  }
  notifySpeedListeners();
}

/**
 * Get current speed telemetry
 */
export function getSpeedState() {
  if (simulationSpeedKmh !== null) {
    const mps = simulationSpeedKmh / 3.6;
    return {
      speedMps: mps,
      speedKmh: simulationSpeedKmh,
      displayString: `${simulationSpeedKmh.toFixed(0)} km/h (SIM)`,
      isUnknown: false,
      isSimulated: true
    };
  }

  if (isSpeedUnknown) {
    return {
      speedMps: 0.0,
      speedKmh: 0.0,
      displayString: 'UNKNOWN',
      isUnknown: true,
      isSimulated: false
    };
  }

  const kmh = currentSpeedMps * 3.6;
  return {
    speedMps: currentSpeedMps,
    speedKmh: kmh,
    displayString: `${kmh.toFixed(0)} km/h`,
    isUnknown: false,
    isSimulated: false
  };
}

function notifySpeedListeners() {
  const state = getSpeedState();
  for (const listener of speedListeners) {
    try {
      listener(state);
    } catch (e) {
      console.error(e);
    }
  }
}
