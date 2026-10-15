/**
 * PotholeGuard - Multi-Frame Object Tracker (Pure Logic)
 * RULE 4: Pure logic with NO DOM dependencies.
 * 
 * Provides stable multi-frame tracking, exponential box smoothing, and confirmation filtering:
 * - Re-identifies potholes across frames using IoU and centroid proximity.
 * - Confirms a track only after it is seen in at least `confirmFrames` out of `windowFrames`.
 * - Prunes dead tracks after `maxMissedFrames` consecutive misses.
 */

import { Config } from './config.js';

let nextTrackId = 1;

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 * Box format: { x1, y1, x2, y2, width, height }
 */
export function calculateIoU(boxA, boxB) {
  const x1 = Math.max(boxA.x1, boxB.x1);
  const y1 = Math.max(boxA.y1, boxB.y1);
  const x2 = Math.min(boxA.x2, boxB.x2);
  const y2 = Math.min(boxA.y2, boxB.y2);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  if (interArea <= 0) return 0.0;

  const areaA = (boxA.x2 - boxA.x1) * (boxA.y2 - boxA.y1);
  const areaB = (boxB.x2 - boxB.x1) * (boxB.y2 - boxB.y1);
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0.0;
}

/**
 * Normalized Euclidean distance between two bounding box centroids
 */
export function calculateCentroidDistance(boxA, boxB) {
  const cxA = (boxA.x1 + boxA.x2) / 2;
  const cyA = (boxA.y1 + boxA.y2) / 2;
  const cxB = (boxB.x1 + boxB.x2) / 2;
  const cyB = (boxB.y1 + boxB.y2) / 2;

  const dx = cxA - cxB;
  const dy = cyA - cyB;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * PotholeTracker manages candidate tracks across video frames
 */
export class PotholeTracker {
  constructor(config = Config) {
    this.config = config;
    this.tracks = [];
  }

  /**
   * Reset all active tracks and reset ID sequence
   */
  reset() {
    this.tracks = [];
    nextTrackId = 1;
  }

  /**
   * Update tracks with fresh detections from the current frame
   * @param {Array} detections Raw detections from detector: [{ x1, y1, x2, y2, score, confidence, ... }]
   * @returns {Array} All active tracks after this frame update
   */
  update(detections = []) {
    const confirmFrames = this.config.confirmFrames ?? 3;
    const windowFrames = this.config.windowFrames ?? 5;
    const maxMissedFrames = this.config.maxMissedFrames ?? 2;
    const iouThresh = this.config.trackerIouThreshold ?? 0.25;
    const alpha = this.config.smoothingAlpha ?? 0.4;

    const matchedDetectionIndices = new Set();
    const matchedTrackIds = new Set();

    // 1. Build pairwise IoU cost matrix
    const candidates = [];
    for (let tIdx = 0; tIdx < this.tracks.length; tIdx++) {
      const track = this.tracks[tIdx];
      for (let dIdx = 0; dIdx < detections.length; dIdx++) {
        const det = detections[dIdx];
        const iou = calculateIoU(track.box, det);
        if (iou >= iouThresh) {
          candidates.push({ tIdx, dIdx, iou });
        }
      }
    }

    // 2. Greedy bipartite matching: highest IoU first
    candidates.sort((a, b) => b.iou - a.iou);

    for (const match of candidates) {
      if (matchedTrackIds.has(this.tracks[match.tIdx].id) || matchedDetectionIndices.has(match.dIdx)) {
        continue;
      }

      const track = this.tracks[match.tIdx];
      const det = detections[match.dIdx];

      matchedTrackIds.add(track.id);
      matchedDetectionIndices.add(match.dIdx);

      // Exponential box coordinate smoothing: new = alpha * det + (1 - alpha) * old
      const smX1 = alpha * det.x1 + (1 - alpha) * track.box.x1;
      const smY1 = alpha * det.y1 + (1 - alpha) * track.box.y1;
      const smX2 = alpha * det.x2 + (1 - alpha) * track.box.x2;
      const smY2 = alpha * det.y2 + (1 - alpha) * track.box.y2;

      track.box = {
        x1: smX1,
        y1: smY1,
        x2: smX2,
        y2: smY2,
        width: smX2 - smX1,
        height: smY2 - smY1,
        cx: (smX1 + smX2) / 2,
        cy: (smY1 + smY2) / 2
      };

      track.rawBox = {
        x1: det.x1,
        y1: det.y1,
        x2: det.x2,
        y2: det.y2,
        width: det.width || det.x2 - det.x1,
        height: det.height || det.y2 - det.y1,
        cx: (det.x1 + det.x2) / 2,
        cy: (det.y1 + det.y2) / 2
      };

      track.confidence = alpha * (det.confidence ?? det.score) + (1 - alpha) * track.confidence;
      track.hits++;
      track.misses = 0;

      // Update sliding history window
      track.history.push(true);
      if (track.history.length > windowFrames) {
        track.history.shift();
      }
    }

    // 3. Handle unmatched existing tracks (missed this frame)
    for (const track of this.tracks) {
      if (!matchedTrackIds.has(track.id)) {
        track.misses++;
        track.history.push(false);
        if (track.history.length > windowFrames) {
          track.history.shift();
        }
      }
    }

    // 4. Register new tracks for unmatched detections
    for (let dIdx = 0; dIdx < detections.length; dIdx++) {
      if (matchedDetectionIndices.has(dIdx)) continue;

      const det = detections[dIdx];
      const w = det.width || det.x2 - det.x1;
      const h = det.height || det.y2 - det.y1;

      const newTrack = {
        id: nextTrackId++,
        box: {
          x1: det.x1,
          y1: det.y1,
          x2: det.x2,
          y2: det.y2,
          width: w,
          height: h,
          cx: (det.x1 + det.x2) / 2,
          cy: (det.y1 + det.y2) / 2
        },
        rawBox: {
          x1: det.x1,
          y1: det.y1,
          x2: det.x2,
          y2: det.y2,
          width: w,
          height: h,
          cx: (det.x1 + det.x2) / 2,
          cy: (det.y1 + det.y2) / 2
        },
        confidence: det.confidence ?? det.score ?? 0.5,
        hits: 1,
        misses: 0,
        history: [true],
        isConfirmed: confirmFrames <= 1,
        inPath: false,
        lateralOffsetPx: 0,
        lateralOffsetNorm: 0,
        rawDistanceM: null,
        distanceM: null,
        lateralXM: null,
        distanceHistory: []
      };

      this.tracks.push(newTrack);
    }

    // 5. Evaluate confirmation status and prune dead tracks
    this.tracks = this.tracks.filter((track) => {
      // Delete tracks exceeding maximum missed frames
      if (track.misses > maxMissedFrames) {
        return false;
      }

      // Check confirmation criteria (at least confirmFrames in the history window)
      const recentHits = track.history.filter(Boolean).length;
      track.isConfirmed = recentHits >= confirmFrames;

      return true;
    });

    return this.tracks;
  }

  /**
   * Update and median-filter distance measurement for a track
   */
  updateDistance(track, distResult) {
    const filterWindow = this.config.distanceFilterWindow ?? 5;
    if (distResult && typeof distResult.distanceM === 'number') {
      track.rawDistanceM = distResult.rawDistanceM;
      track.lateralXM = distResult.lateralXM;
      if (!track.distanceHistory) track.distanceHistory = [];

      track.distanceHistory.push(distResult.distanceM);
      if (track.distanceHistory.length > filterWindow) {
        track.distanceHistory.shift();
      }

      // Median filter
      const sorted = [...track.distanceHistory].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      track.distanceM = sorted.length % 2 === 0
        ? parseFloat(((sorted[mid - 1] + sorted[mid]) / 2.0).toFixed(2))
        : parseFloat(sorted[mid].toFixed(2));
    } else {
      track.rawDistanceM = null;
      track.distanceM = null;
      track.lateralXM = null;
    }
    return track.distanceM;
  }

  /**
   * Return only confirmed tracks that continue down the pipeline
   */
  getConfirmedTracks() {
    return this.tracks.filter((t) => t.isConfirmed);
  }
}
