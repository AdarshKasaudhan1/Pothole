/**
 * PotholeGuard - Geometry, Distance Estimation & Calibration (Pure Logic)
 * RULE 4: Pure logic with NO DOM dependencies.
 * 
 * - Flat-ground pinhole camera monocular distance model:
 *   alpha = atan((y_b - cy) / fy)
 *   distance = H / tan(theta + alpha)
 * - Lateral ground offset calculation:
 *   X = (u - cx) * distance / fx
 * - 2-Point Calibration solver for optimal pitch (theta) and focal length (fy).
 * - Trapezoid rider-path corridor projection and in-path detection with hysteresis.
 */

import { Config } from './config.js';

/**
 * Returns corridor geometric specifications in frame pixel coordinates
 */
export function getCorridor(frameWidth, frameHeight, config = Config) {
  const horizonFrac = config.horizonY ?? 0.45;
  const bottomWFrac = config.corridorBottomWidth ?? 0.85;
  const topWFrac = config.corridorTopWidth ?? 0.25;
  const centerFrac = config.corridorCenterX ?? 0.50;

  const yTop = frameHeight * horizonFrac;
  const yBottom = frameHeight;

  const xCenterTop = frameWidth * centerFrac;
  const xCenterBottom = frameWidth * centerFrac;

  const halfWTop = (frameWidth * topWFrac) / 2;
  const halfWBottom = (frameWidth * bottomWFrac) / 2;

  return {
    yTop,
    yBottom,
    xCenterTop,
    xCenterBottom,
    halfWTop,
    halfWBottom,
    topLeft: { x: xCenterTop - halfWTop, y: yTop },
    topRight: { x: xCenterTop + halfWTop, y: yTop },
    bottomRight: { x: xCenterBottom + halfWBottom, y: yBottom },
    bottomLeft: { x: xCenterBottom - halfWBottom, y: yBottom }
  };
}

/**
 * Check if a bounding box or track is within the rider-path corridor
 */
export function checkInPath(target, frameWidth, frameHeight, config = Config) {
  const box = target.box || target;
  const corridor = getCorridor(frameWidth, frameHeight, config);

  // Ground contact point: bottom-center of the pothole box
  const contactX = (box.x1 + box.x2) / 2;
  const contactY = box.y2;

  // Above the horizon row
  if (contactY < corridor.yTop) {
    const latPx = contactX - corridor.xCenterTop;
    return {
      inPath: false,
      lateralOffsetPx: latPx,
      lateralOffsetNorm: corridor.halfWTop > 0 ? latPx / corridor.halfWTop : 0,
      contactPoint: { x: contactX, y: contactY }
    };
  }

  // Linear interpolation along the trapezoid
  const corridorHeight = corridor.yBottom - corridor.yTop;
  const t = corridorHeight > 0 
    ? Math.max(0, Math.min(1, (contactY - corridor.yTop) / corridorHeight))
    : 0;

  const centerAtY = corridor.xCenterTop + t * (corridor.xCenterBottom - corridor.xCenterTop);
  const halfWidthAtY = corridor.halfWTop + t * (corridor.halfWBottom - corridor.halfWTop);

  const lateralOffsetPx = contactX - centerAtY;
  const lateralOffsetNorm = halfWidthAtY > 0 ? lateralOffsetPx / halfWidthAtY : 0;

  // Hysteresis buffer to eliminate boundary flicker on edge cases
  const hysteresisFrac = config.corridorHysteresis ?? 0.03;
  const hysteresisPx = frameWidth * hysteresisFrac;
  const effectiveTolerance = halfWidthAtY + (target.inPath ? hysteresisPx : 0);

  const inPath = Math.abs(lateralOffsetPx) <= effectiveTolerance;

  if (target.box) {
    target.inPath = inPath;
    target.lateralOffsetPx = lateralOffsetPx;
    target.lateralOffsetNorm = lateralOffsetNorm;
  }

  return {
    inPath,
    lateralOffsetPx,
    lateralOffsetNorm,
    contactPoint: { x: contactX, y: contactY }
  };
}

/**
 * Compute vertical focal length fy in pixels
 * Derived from vertical field of view (vFovDeg) unless overridden
 */
export function calculateFocalLengthY(frameHeight, config = Config) {
  if (config.focalLengthY && config.focalLengthY > 0) {
    return config.focalLengthY;
  }
  const vFovDeg = config.vFovDeg ?? 50.0;
  const vFovRad = (vFovDeg * Math.PI) / 180.0;
  return (frameHeight / 2.0) / Math.tan(vFovRad / 2.0);
}

/**
 * Estimate ground distance and lateral position using flat-ground pinhole camera model
 * 
 * @param {object} target Track or box with { x1, y1, x2, y2 }
 * @param {number} frameWidth Video frame width in pixels
 * @param {number} frameHeight Video frame height in pixels
 * @param {number} pitchDeg Camera pitch angle below horizontal in degrees (theta)
 * @param {object} config System configuration
 * @returns {object|null} Distance measurement details or null if out of range / invalid
 */
export function estimateDistance(target, frameWidth, frameHeight, pitchDeg, config = Config) {
  const box = target.box || target;
  const H = config.cameraHeightM ?? 1.10;
  const trimDeg = config.pitchTrimDeg ?? 0.0;
  const effectivePitchDeg = (pitchDeg !== undefined && pitchDeg !== null ? pitchDeg : (config.cameraPitchDeg ?? 12.0)) + trimDeg;

  const thetaRad = (effectivePitchDeg * Math.PI) / 180.0;
  const cy = frameHeight / 2.0;
  const cx = frameWidth / 2.0;

  const fy = calculateFocalLengthY(frameHeight, config);
  const fx = fy * (frameWidth / frameHeight);

  // Ground contact point: bottom edge of bounding box
  const y_b = box.y2;
  const u = (box.x1 + box.x2) / 2.0;

  // Optical angle below camera axis
  const alphaRad = Math.atan((y_b - cy) / fy);

  // Total angle below horizontal
  const phiRad = thetaRad + alphaRad;

  // Ray is horizontal or pointing above the horizon
  if (phiRad <= 0.001) {
    return null;
  }

  // Raw flat-ground distance
  const rawDistM = H / Math.tan(phiRad);
  const maxDistM = config.maxDistanceM ?? 35.0;

  if (rawDistM <= 0 || rawDistM > maxDistM) {
    return null;
  }

  // Linear calibration correction: d_final = a * d + b
  const a = config.distLinearA ?? 1.0;
  const b = config.distLinearB ?? 0.0;
  const distFinalM = Math.max(0.1, a * rawDistM + b);

  // Lateral offset in meters (X > 0 is to the right of camera center)
  const lateralXM = ((u - cx) * distFinalM) / fx;

  return {
    rawDistanceM: rawDistM,
    distanceM: distFinalM,
    lateralXM,
    alphaRad,
    phiRad,
    fy,
    fx,
    y_b,
    thetaDeg: effectivePitchDeg
  };
}

/**
 * 2-Point Calibration Solver
 * Solves for the optimal camera pitch (theta) and vertical focal length (fy)
 * matching two targets placed at known distances d1 and d2.
 * 
 * @param {number} d1 Known distance 1 in meters (e.g. 10.0)
 * @param {number} y_b1 Bottom row in pixels for target 1
 * @param {number} d2 Known distance 2 in meters (e.g. 20.0)
 * @param {number} y_b2 Bottom row in pixels for target 2
 * @param {number} frameHeight Video height in pixels (e.g. 720)
 * @param {number} cameraHeightM Camera height H in meters (e.g. 1.10)
 * @returns {object} { thetaDeg, fy, vFovDeg, error1M, error2M, maxErrorM }
 */
export function solveCalibration(d1, y_b1, d2, y_b2, frameHeight, cameraHeightM = 1.10) {
  const cy = frameHeight / 2.0;
  const H = cameraHeightM;

  // Angle below horizontal to each target
  const phi1 = Math.atan(H / d1);
  const phi2 = Math.atan(H / d2);

  const dy1 = y_b1 - cy;
  const dy2 = y_b2 - cy;

  // Both targets cannot have identical pixel rows for distinct distances
  if (Math.abs(dy1 - dy2) < 0.5) {
    throw new Error('Target rows are too close together for distinct distances.');
  }

  // Search theta in [0.5 deg, 40 deg] with fine resolution
  let bestTheta = (10.0 * Math.PI) / 180.0;
  let bestDiff = Infinity;
  let bestFy = 700;

  for (let deg = 0.5; deg <= 40.0; deg += 0.05) {
    const theta = (deg * Math.PI) / 180.0;
    const tan1 = Math.tan(phi1 - theta);
    const tan2 = Math.tan(phi2 - theta);

    if (Math.abs(tan1) < 1e-5 || Math.abs(tan2) < 1e-5) continue;

    const fy1 = dy1 / tan1;
    const fy2 = dy2 / tan2;

    // fy must be positive and physically plausible for smartphone wide/standard lenses
    if (fy1 <= 150 || fy2 <= 150 || fy1 > 3500 || fy2 > 3500) continue;

    const diff = Math.abs(fy1 - fy2);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestTheta = theta;
      bestFy = (fy1 + fy2) / 2.0;
    }
  }

  if (bestDiff === Infinity) {
    throw new Error('Could not find physically valid camera pitch and focal length for given targets.');
  }

  const thetaDeg = (bestTheta * 180.0) / Math.PI;
  const vFovDeg = 2.0 * Math.atan(cy / bestFy) * (180.0 / Math.PI);

  // Compute validation distances and residuals
  const alpha1 = Math.atan(dy1 / bestFy);
  const alpha2 = Math.atan(dy2 / bestFy);
  const predD1 = H / Math.tan(bestTheta + alpha1);
  const predD2 = H / Math.tan(bestTheta + alpha2);

  const error1M = Math.abs(predD1 - d1);
  const error2M = Math.abs(predD2 - d2);

  return {
    thetaDeg: parseFloat(thetaDeg.toFixed(2)),
    fy: Math.round(bestFy),
    vFovDeg: parseFloat(vFovDeg.toFixed(1)),
    predD1: parseFloat(predD1.toFixed(2)),
    predD2: parseFloat(predD2.toFixed(2)),
    error1M: parseFloat(error1M.toFixed(3)),
    error2M: parseFloat(error2M.toFixed(3)),
    maxErrorM: parseFloat(Math.max(error1M, error2M).toFixed(3))
  };
}
