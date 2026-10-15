/**
 * PotholeGuard - Triple-Redundant Alert Engine
 * 1. Voice prompt (SpeechSynthesis with Indian English preferred)
 * 2. Vibration motor patterns (Vibration API)
 * 3. Web Audio synthesis beeps (low-latency fallback)
 * 4. High-contrast visual warning banner
 */

import { Config } from './config.js';

let audioCtx = null;
let preferredVoice = null;
let isAudioUnlocked = false;
let isVibrationSupported = false;

// DOM References
let bannerEl = null;
let levelBadgeEl = null;
let titleEl = null;
let distValEl = null;
let confValEl = null;
let speedValEl = null;
let ttpValEl = null;

/**
 * Initialize Alert Engine with UI elements and sound system
 */
export function initAlerts(elements = {}) {
  bannerEl = elements.bannerEl || document.getElementById('risk-banner');
  levelBadgeEl = elements.levelBadgeEl || document.getElementById('risk-level-badge');
  titleEl = elements.titleEl || document.getElementById('risk-title');
  distValEl = elements.distValEl || document.getElementById('risk-dist-val');
  confValEl = elements.confValEl || document.getElementById('risk-conf-val');
  speedValEl = elements.speedValEl || document.getElementById('risk-speed-val');
  ttpValEl = elements.ttpValEl || document.getElementById('risk-ttp-val');

  // Detect Vibration API support
  isVibrationSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  if (!isVibrationSupported) {
    console.info('[PotholeGuard Alerts] Vibration API not supported on this device/browser.');
  }

  // Load voices when available
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    updatePreferredVoice();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updatePreferredVoice;
    }
  }
}

/**
 * Find preferred English (India) or general English speech voice
 */
function updatePreferredVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  // 1. Try English (India)
  preferredVoice = voices.find(v => v.lang === 'en-IN' || v.lang.startsWith('en_IN'));
  // 2. Fallback to any English voice
  if (!preferredVoice) {
    preferredVoice = voices.find(v => v.lang.startsWith('en'));
  }
  // 3. Fallback to default
  if (!preferredVoice && voices.length > 0) {
    preferredVoice = voices[0];
  }
}

/**
 * User gesture unlock for Web Audio and SpeechSynthesis (called on START tap)
 */
export function unlockAudio() {
  if (isAudioUnlocked) return;

  try {
    // 1. Unlock Web Audio Context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      // Play a 1ms inaudible buffer
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
    }

    // 2. Unlock SpeechSynthesis with silent utterance
    if ('speechSynthesis' in window) {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0.01;
      silent.rate = 2.0;
      window.speechSynthesis.speak(silent);
    }

    isAudioUnlocked = true;
    console.log('[PotholeGuard Alerts] Audio unlocked successfully.');
  } catch (err) {
    console.warn('[PotholeGuard Alerts] Audio unlock failed:', err);
  }
}

/**
 * Play synthesizer backup beep using Web Audio API
 */
export function playBeep(frequency = 880, durationMs = 180, pulses = 1) {
  if (!Config.beepsEnabled) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!audioCtx) return;

    for (let p = 0; p < pulses; p++) {
      const startTime = audioCtx.currentTime + (p * (durationMs + 70)) / 1000;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, startTime);

      const vol = Config.voiceVolume ?? 1.0;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.4 * vol, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + durationMs / 1000 + 0.02);
    }
  } catch (e) {
    console.warn('[PotholeGuard Alerts] Beep error:', e);
  }
}

/**
 * Trigger spoken alert message via SpeechSynthesis
 */
export function speakAlert(phrase) {
  if (!Config.voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel(); // Cancel any prior pending speech

    const utterance = new SpeechSynthesisUtterance(phrase);
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = Config.speechRate ?? 1.1;
    utterance.volume = Config.voiceVolume ?? 1.0;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[PotholeGuard Alerts] SpeechSynthesis error:', err);
  }
}

/**
 * Trigger haptic vibration pattern
 */
export function triggerVibration(pattern) {
  if (!Config.vibrationEnabled || !isVibrationSupported) return;
  try {
    navigator.vibrate(pattern);
  } catch (e) {
    console.warn('[PotholeGuard Alerts] Vibration error:', e);
  }
}

/**
 * Update visual banner and dispatch alerts based on risk engine output
 */
export function handleRiskUpdate(riskState) {
  const { level, distanceM, ttpSec, confidence, speedKmh, shouldAlert } = riskState;

  // 1. Update Visual Banner
  if (bannerEl) {
    if (level === 'NONE' || !level) {
      bannerEl.classList.add('hidden');
      bannerEl.className = 'risk-banner hidden';
    } else {
      bannerEl.classList.remove('hidden');
      bannerEl.className = `risk-banner level-${level.toLowerCase()}`;

      if (levelBadgeEl) levelBadgeEl.textContent = level;
      if (titleEl) {
        titleEl.textContent = level === 'HIGH' ? 'POTHOLE! IMMINENT' : 'POTHOLE DETECTED';
      }
      if (distValEl) distValEl.textContent = distanceM !== null ? `${distanceM}m` : '--';
      if (confValEl) confValEl.textContent = confidence !== null ? `${confidence}%` : '--';
      if (speedValEl) speedValEl.textContent = `${speedKmh} km/h`;
      if (ttpValEl) ttpValEl.textContent = ttpSec !== null ? `${ttpSec}s` : '--';
    }
  }

  // 2. Dispatch audio and haptic alerts if shouldAlert is flagged
  if (shouldAlert) {
    if (level === 'WARN') {
      // Spoken warning
      speakAlert('Pothole ahead. Slow down.');
      // Vibration: two short pulses
      triggerVibration([180, 100, 180]);
      // Backup beeps: 2 medium beeps
      playBeep(750, 160, 2);
    } else if (level === 'HIGH') {
      // Strong urgent spoken warning
      speakAlert('Pothole! Slow down now!');
      // Vibration: strong persistent pattern
      triggerVibration([350, 80, 350, 80, 400]);
      // Backup beeps: 3 high urgent beeps
      playBeep(980, 140, 3);
    }
  }
}

/**
 * Manual test alert triggers for settings screen testing
 */
export function triggerTestAlert(level) {
  if (level === 'INFO') {
    handleRiskUpdate({
      level: 'INFO',
      distanceM: 25.0,
      ttpSec: 2.5,
      confidence: 88,
      speedKmh: 36.0,
      shouldAlert: false
    });
    playBeep(600, 120, 1);
  } else if (level === 'WARN') {
    handleRiskUpdate({
      level: 'WARN',
      distanceM: 16.0,
      ttpSec: 1.6,
      confidence: 92,
      speedKmh: 36.0,
      shouldAlert: true
    });
  } else if (level === 'HIGH') {
    handleRiskUpdate({
      level: 'HIGH',
      distanceM: 7.5,
      ttpSec: 0.8,
      confidence: 96,
      speedKmh: 36.0,
      shouldAlert: true
    });
  }

  // Auto-dismiss banner after 4 seconds during manual test
  setTimeout(() => {
    if (bannerEl) {
      bannerEl.classList.add('hidden');
    }
  }, 4000);
}
