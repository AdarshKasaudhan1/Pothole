/**
 * PotholeGuard - Dynamic Risk & Time-To-Pothole Engine (Pure Logic)
 * RULE 4: Pure logic with zero DOM dependencies.
 * 
 * Computes Time-To-Pothole (TTP) = distance / max(speed_mps, minSpeedMps)
 * Evaluates risk levels: NONE < INFO < WARN < HIGH
 * Handles escalation if TTP < ttpEscalationSec
 * Enforces confidence thresholds, minimum alert speed, hysteresis, and per-track cooldown.
 */

import { Config } from './config.js';

export const RISK_LEVELS = Object.freeze({
  NONE: 'NONE',
  INFO: 'INFO',
  WARN: 'WARN',
  HIGH: 'HIGH'
});

const LEVEL_SEVERITY = Object.freeze({
  NONE: 0,
  INFO: 1,
  WARN: 2,
  HIGH: 3
});

export class RiskEngine {
  constructor(config = Config) {
    this.config = config;
    this.currentLevel = RISK_LEVELS.NONE;
    this.lastEscalationTime = 0;
    this.levelHoldUntil = 0;
    this.activeAlertTrackId = null;
    this.trackAlertTimestamps = new Map(); // trackId -> timestamp (ms)
  }

  /**
   * Reset risk state and alert timestamps
   */
  reset() {
    this.currentLevel = RISK_LEVELS.NONE;
    this.lastEscalationTime = 0;
    this.levelHoldUntil = 0;
    this.activeAlertTrackId = null;
    this.trackAlertTimestamps.clear();
  }

  /**
   * Evaluate risk for the current frame
   * 
   * @param {Array} tracks Array of confirmed tracks
   * @param {number} speedMps Current rider speed in m/s
   * @param {number} currentTimeMs Current performance timestamp in ms
   * @param {object} config System configuration overrides
   * @returns {object} Most urgent risk state
   */
  evaluate(tracks = [], speedMps = 0.0, currentTimeMs = performance.now(), config = this.config) {
    const minAlertSpeedKmh = config.minAlertSpeedKmh ?? 5.0;
    const minAlertSpeedMps = minAlertSpeedKmh / 3.6;
    const minSpeedMps = config.minSpeedMps ?? 1.0;
    const alertConfidence = config.alertConfidence ?? 0.50;
    const ttpEscalationSec = config.ttpEscalationSec ?? 1.5;
    const hysteresisMs = (config.riskHysteresisSec ?? 1.0) * 1000;
    const alertCooldownMs = (config.alertCooldownSec ?? 4.0) * 1000;

    const speedKmh = speedMps * 3.6;

    // Filter eligible candidates: confirmed, inPath, distance known, confidence >= threshold
    const candidates = [];
    for (const track of tracks) {
      const isConfirmed = track.isConfirmed !== undefined ? track.isConfirmed : true;
      const inPath = Boolean(track.inPath);
      const conf = track.confidence ?? track.score ?? 0;
      const dist = track.distanceM;

      if (!isConfirmed || !inPath || dist === null || dist === undefined || conf < alertConfidence) {
        continue;
      }

      // Compute Time-To-Pothole (TTP)
      const effectiveSpeedMps = Math.max(speedMps, minSpeedMps);
      const ttpSec = dist / effectiveSpeedMps;

      // Determine raw base risk level based on distance bands
      // > 30m: NONE
      // 20 - 30m: INFO
      // 10 - 20m: WARN
      // < 10m: HIGH
      let rawLevel = RISK_LEVELS.NONE;
      if (dist <= (config.distHighMaxM ?? 10.0)) {
        rawLevel = RISK_LEVELS.HIGH;
      } else if (dist <= (config.distWarnMaxM ?? 20.0)) {
        rawLevel = RISK_LEVELS.WARN;
      } else if (dist <= (config.distInfoMaxM ?? 30.0)) {
        rawLevel = RISK_LEVELS.INFO;
      }

      // Escalate one level if TTP is critically short (< ttpEscalationSec)
      let finalLevel = rawLevel;
      if (rawLevel === RISK_LEVELS.INFO && ttpSec < ttpEscalationSec) {
        finalLevel = RISK_LEVELS.WARN;
      } else if (rawLevel === RISK_LEVELS.WARN && ttpSec < ttpEscalationSec) {
        finalLevel = RISK_LEVELS.HIGH;
      }

      candidates.push({
        track,
        trackId: track.id,
        distanceM: dist,
        confidence: conf,
        ttpSec: parseFloat(ttpSec.toFixed(2)),
        rawLevel,
        finalLevel,
        severity: LEVEL_SEVERITY[finalLevel]
      });
    }

    // Pick most urgent pothole: highest severity first, then closest distance
    candidates.sort((a, b) => {
      if (b.severity !== a.severity) {
        return b.severity - a.severity;
      }
      return a.distanceM - b.distanceM;
    });

    // If speed is below minimum alert speed, suppress active alerts (or cap to INFO/NONE)
    const isStationaryOrCrawling = speedKmh < minAlertSpeedKmh;

    if (candidates.length === 0 || isStationaryOrCrawling) {
      const topCand = candidates[0] || null;
      const topDist = topCand ? topCand.distanceM : null;
      const topConf = topCand ? Math.round(topCand.confidence * 100) : null;
      const topId = topCand ? topCand.trackId : null;

      // Check hysteresis hold
      if (currentTimeMs < this.levelHoldUntil && this.currentLevel !== RISK_LEVELS.NONE) {
        return {
          level: this.currentLevel,
          distanceM: topDist,
          ttpSec: null,
          confidence: topConf,
          speedKmh: parseFloat(speedKmh.toFixed(1)),
          speedMps: parseFloat(speedMps.toFixed(2)),
          trackId: this.activeAlertTrackId || topId,
          shouldAlert: false,
          isSuppressedBySpeed: isStationaryOrCrawling && candidates.length > 0
        };
      }

      this.currentLevel = RISK_LEVELS.NONE;
      this.activeAlertTrackId = null;

      return {
        level: RISK_LEVELS.NONE,
        distanceM: topDist,
        ttpSec: null,
        confidence: topConf,
        speedKmh: parseFloat(speedKmh.toFixed(1)),
        speedMps: parseFloat(speedMps.toFixed(2)),
        trackId: topId,
        shouldAlert: false,
        isSuppressedBySpeed: isStationaryOrCrawling && candidates.length > 0
      };
    }

    const mostUrgent = candidates[0];
    const candidateSeverity = mostUrgent.severity;
    const currentSeverity = LEVEL_SEVERITY[this.currentLevel];

    let resolvedLevel = mostUrgent.finalLevel;

    // Hysteresis: immediate escalation on higher risk, delayed demotion on lower risk
    if (candidateSeverity >= currentSeverity) {
      this.currentLevel = resolvedLevel;
      this.levelHoldUntil = currentTimeMs + hysteresisMs;
    } else {
      // If candidate is lower, hold previous higher level until hold expiry
      if (currentTimeMs < this.levelHoldUntil) {
        resolvedLevel = this.currentLevel;
      } else {
        this.currentLevel = resolvedLevel;
        this.levelHoldUntil = currentTimeMs + hysteresisMs;
      }
    }

    this.activeAlertTrackId = mostUrgent.trackId;

    // Check alert cooldown for this track
    let shouldAlert = false;
    if (resolvedLevel === RISK_LEVELS.WARN || resolvedLevel === RISK_LEVELS.HIGH) {
      const hasAlerted = this.trackAlertTimestamps.has(mostUrgent.trackId);
      const lastAlert = hasAlerted ? this.trackAlertTimestamps.get(mostUrgent.trackId) : -Infinity;
      if (!hasAlerted || currentTimeMs - lastAlert >= alertCooldownMs) {
        shouldAlert = true;
        this.trackAlertTimestamps.set(mostUrgent.trackId, currentTimeMs);
      }
    }

    // Clean old track timestamps
    if (this.trackAlertTimestamps.size > 50) {
      for (const [id, time] of this.trackAlertTimestamps.entries()) {
        if (currentTimeMs - time > 30000) {
          this.trackAlertTimestamps.delete(id);
        }
      }
    }

    return {
      level: resolvedLevel,
      distanceM: parseFloat(mostUrgent.distanceM.toFixed(1)),
      ttpSec: mostUrgent.ttpSec,
      confidence: Math.round(mostUrgent.confidence * 100),
      speedKmh: parseFloat(speedKmh.toFixed(1)),
      speedMps: parseFloat(speedMps.toFixed(2)),
      trackId: mostUrgent.trackId,
      shouldAlert,
      isSuppressedBySpeed: false
    };
  }
}
