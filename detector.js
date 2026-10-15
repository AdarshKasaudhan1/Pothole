/**
 * PotholeGuard - ONNX Runtime Web Detector
 * Loads the single-class YOLO detection model and performs in-browser inference.
 * Supports WebGPU with automatic WASM fallback and offline caching.
 */

import { Config } from './config.js';

let session = null;
let activeBackend = 'Initializing...';
let isModelLoading = false;
let offscreenCanvas = null;
let offscreenCtx = null;

// Metrics state
let lastInferenceMs = 0;
let lastDetectionCount = 0;

/**
 * Initialize and load the ONNX Runtime Web inference session
 */
export async function initDetector(onStatusChange) {
  if (session) return { session, backend: activeBackend };
  if (isModelLoading) return null;

  isModelLoading = true;
  if (typeof window.ort === 'undefined') {
    isModelLoading = false;
    throw new Error('ONNX Runtime Web (ort) library is not loaded. Ensure lib/ort.all.min.js is included.');
  }

  // Ensure wasm binary assets are resolved relative to ./lib/
  window.ort.env.wasm.wasmPaths = './lib/';
  if (navigator.hardwareConcurrency) {
    window.ort.env.wasm.numThreads = Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1));
  }

  const providers = Config.forceWasm ? ['wasm'] : ['webgpu', 'wasm'];
  if (onStatusChange) onStatusChange('Loading AI Model...');

  const modelUrl = './models/pothole.onnx';

  try {
    session = await window.ort.InferenceSession.create(modelUrl, {
      executionProviders: providers,
      graphOptimizationLevel: 'all'
    });

    activeBackend = Config.forceWasm ? 'WASM' : (window.navigator?.gpu ? 'WebGPU' : 'WASM');
    console.log(`[PotholeGuard Detector] Model loaded with backend: ${activeBackend}`);
  } catch (gpuErr) {
    console.warn('[PotholeGuard Detector] Preferred provider failed, falling back to WASM...', gpuErr);
    session = await window.ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    activeBackend = 'WASM';
    console.log('[PotholeGuard Detector] Model loaded successfully with WASM fallback.');
  } finally {
    isModelLoading = false;
  }

  if (onStatusChange) onStatusChange(`AI Ready (${activeBackend})`);
  return { session, backend: activeBackend };
}

/**
 * Get internal offscreen canvas for preprocessing
 */
function getOffscreen(width, height) {
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  } else if (offscreenCanvas.width !== width || offscreenCanvas.height !== height) {
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
  }
  return { canvas: offscreenCanvas, ctx: offscreenCtx };
}

/**
 * Preprocess camera frame or image with letterbox resize to model dimensions (640x640)
 * Returns Float32Array in NCHW format [1, 3, 640, 640] normalized to [0, 1]
 */
function preprocess(imageSource) {
  const modelW = Config.modelInputWidth || 640;
  const modelH = Config.modelInputHeight || 640;
  const { canvas, ctx } = getOffscreen(modelW, modelH);

  const srcW = imageSource.videoWidth || imageSource.naturalWidth || imageSource.width;
  const srcH = imageSource.videoHeight || imageSource.naturalHeight || imageSource.height;

  if (!srcW || !srcH) {
    throw new Error('Invalid image source dimensions');
  }

  // Calculate letterbox scaling maintaining aspect ratio
  const scale = Math.min(modelW / srcW, modelH / srcH);
  const scaledW = Math.round(srcW * scale);
  const scaledH = Math.round(srcH * scale);
  const padX = (modelW - scaledW) / 2;
  const padY = (modelH - scaledH) / 2;

  // Fill with standard YOLO letterbox gray
  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, modelW, modelH);

  // Draw scaled image centered in 640x640 canvas
  ctx.drawImage(imageSource, 0, 0, srcW, srcH, padX, padY, scaledW, scaledH);

  const imgData = ctx.getImageData(0, 0, modelW, modelH).data;
  const channelSize = modelW * modelH;
  const float32 = new Float32Array(3 * channelSize);

  // Convert RGBA -> NCHW RGB [0.0, 1.0]
  for (let i = 0; i < channelSize; i++) {
    const pxIdx = i * 4;
    float32[i] = imgData[pxIdx] / 255.0;                         // R channel
    float32[channelSize + i] = imgData[pxIdx + 1] / 255.0;       // G channel
    float32[2 * channelSize + i] = imgData[pxIdx + 2] / 255.0;   // B channel
  }

  const tensor = new window.ort.Tensor('float32', float32, [1, 3, modelH, modelW]);
  return { tensor, scale, padX, padY, srcW, srcH };
}

/**
 * Decode YOLO single-class output [1, 5, 8400] and map back to original video dimensions
 */
function decodeDetections(outputTensor, scale, padX, padY, srcW, srcH) {
  const data = outputTensor.data;
  const dims = outputTensor.dims; // e.g., [1, 5, 8400] or [1, 8400, 5]
  const confThresh = Config.confidenceThreshold;

  let numAnchors = 8400;
  let isChannelsFirst = true;

  if (dims.length === 3) {
    if (dims[1] === 5) {
      isChannelsFirst = true;
      numAnchors = dims[2];
    } else if (dims[2] === 5) {
      isChannelsFirst = false;
      numAnchors = dims[1];
    }
  }

  const candidates = [];

  for (let i = 0; i < numAnchors; i++) {
    let cx, cy, w, h, score;

    if (isChannelsFirst) {
      score = data[4 * numAnchors + i];
      if (score < confThresh) continue;
      cx = data[0 * numAnchors + i];
      cy = data[1 * numAnchors + i];
      w  = data[2 * numAnchors + i];
      h  = data[3 * numAnchors + i];
    } else {
      const offset = i * 5;
      score = data[offset + 4];
      if (score < confThresh) continue;
      cx = data[offset];
      cy = data[offset + 1];
      w  = data[offset + 2];
      h  = data[offset + 3];
    }

    // Invert letterboxing: map (cx, cy, w, h) to original image pixels
    const x1 = Math.max(0, Math.min(srcW, (cx - w / 2 - padX) / scale));
    const y1 = Math.max(0, Math.min(srcH, (cy - h / 2 - padY) / scale));
    const x2 = Math.max(0, Math.min(srcW, (cx + w / 2 - padX) / scale));
    const y2 = Math.max(0, Math.min(srcH, (cy + h / 2 - padY) / scale));
    const boxW = x2 - x1;
    const boxH = y2 - y1;

    if (boxW <= 4 || boxH <= 4) continue;

    candidates.push({
      x1,
      y1,
      x2,
      y2,
      width: boxW,
      height: boxH,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
      confidence: score,
      score,
      classId: 0,
      label: 'pothole'
    });
  }

  // Apply Non-Maximum Suppression (NMS)
  return applyNms(candidates, Config.iouThreshold || 0.45);
}

/**
 * Non-Maximum Suppression to remove duplicate candidate boxes
 */
function applyNms(boxes, iouThresh) {
  if (boxes.length <= 1) return boxes;

  boxes.sort((a, b) => b.score - a.score);
  const kept = [];
  const active = new Array(boxes.length).fill(true);

  for (let i = 0; i < boxes.length; i++) {
    if (!active[i]) continue;
    const boxA = boxes[i];
    kept.push(boxA);

    for (let j = i + 1; j < boxes.length; j++) {
      if (!active[j]) continue;
      const boxB = boxes[j];

      const interX1 = Math.max(boxA.x1, boxB.x1);
      const interY1 = Math.max(boxA.y1, boxB.y1);
      const interX2 = Math.min(boxA.x2, boxB.x2);
      const interY2 = Math.min(boxA.y2, boxB.y2);

      const interW = Math.max(0, interX2 - interX1);
      const interH = Math.max(0, interY2 - interY1);
      const interArea = interW * interH;

      if (interArea > 0) {
        const areaA = boxA.width * boxA.height;
        const areaB = boxB.width * boxB.height;
        const unionArea = areaA + areaB - interArea;
        const iou = interArea / unionArea;

        if (iou >= iouThresh) {
          active[j] = false;
        }
      }
    }
  }

  return kept;
}

/**
 * Detect potholes in a video element or image
 */
export async function detectFrame(imageSource) {
  if (!session) {
    await initDetector();
  }

  const startT = performance.now();
  const { tensor, scale, padX, padY, srcW, srcH } = preprocess(imageSource);

  const feeds = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];

  const detections = decodeDetections(outputTensor, scale, padX, padY, srcW, srcH);
  lastInferenceMs = Math.round(performance.now() - startT);
  lastDetectionCount = detections.length;

  return {
    detections,
    inferenceMs: lastInferenceMs,
    count: lastDetectionCount,
    srcWidth: srcW,
    srcHeight: srcH
  };
}

import { getCorridor } from './geometry.js';

/**
 * Draw the translucent rider-path trapezoid corridor onto the overlay canvas
 */
export function drawCorridor(ctx, videoW, videoH, canvasW, canvasH, config = Config, options = {}) {
  const isContain = options.fit === 'contain';
  const corridor = getCorridor(videoW, videoH, config);
  const scale = isContain ? Math.min(canvasW / videoW, canvasH / videoH) : Math.max(canvasW / videoW, canvasH / videoH);
  const cropX = isContain ? -(canvasW - videoW * scale) / 2 : (videoW * scale - canvasW) / 2;
  const cropY = isContain ? -(canvasH - videoH * scale) / 2 : (videoH * scale - canvasH) / 2;

  const tlX = corridor.topLeft.x * scale - cropX;
  const tlY = corridor.topLeft.y * scale - cropY;
  const trX = corridor.topRight.x * scale - cropX;
  const trY = corridor.topRight.y * scale - cropY;
  const brX = corridor.bottomRight.x * scale - cropX;
  const brY = corridor.bottomRight.y * scale - cropY;
  const blX = corridor.bottomLeft.x * scale - cropX;
  const blY = corridor.bottomLeft.y * scale - cropY;

  ctx.save();

  // 1. Fill translucent corridor surface
  ctx.beginPath();
  ctx.moveTo(tlX, tlY);
  ctx.lineTo(trX, trY);
  ctx.lineTo(brX, brY);
  ctx.lineTo(blX, blY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.fill();

  // 2. Dashed boundary lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();

  // 3. Centerline guide
  const tcX = corridor.xCenterTop * scale - cropX;
  const bcX = corridor.xCenterBottom * scale - cropX;
  ctx.beginPath();
  ctx.moveTo(tcX, tlY);
  ctx.lineTo(bcX, brY);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw tracks and corridor on overlay canvas
 * - Tentative tracks: Thin dashed gray
 * - Confirmed in-path: Thick solid red
 * - Confirmed off-path: Solid yellow/amber
 * - Translucent path corridor
 */
export function drawDetections(ctx, items, videoW, videoH, canvasW, canvasH, config = Config, options = {}) {
  if (options.clear !== false) {
    ctx.clearRect(0, 0, canvasW, canvasH);
  }

  const isContain = options.fit === 'contain';
  const scale = isContain ? Math.min(canvasW / videoW, canvasH / videoH) : Math.max(canvasW / videoW, canvasH / videoH);
  const cropX = isContain ? -(canvasW - videoW * scale) / 2 : (videoW * scale - canvasW) / 2;
  const cropY = isContain ? -(canvasH - videoH * scale) / 2 : (videoH * scale - canvasH) / 2;

  // Render background image if provided (e.g., photo test mode)
  if (options.bgImage) {
    const drawW = videoW * scale;
    const drawH = videoH * scale;
    const offX = isContain ? (canvasW - drawW) / 2 : -cropX;
    const offY = isContain ? (canvasH - drawH) / 2 : -cropY;
    ctx.drawImage(options.bgImage, offX, offY, drawW, drawH);
  }

  if (options.showCorridor !== false) {
    drawCorridor(ctx, videoW, videoH, canvasW, canvasH, config, options);
  }

  if (!items || items.length === 0) return;

  ctx.save();
  for (const item of items) {
    const box = item.box || item;
    const x = box.x1 * scale - cropX;
    const y = box.y1 * scale - cropY;
    const w = box.width * scale;
    const h = box.height * scale;

    const isConfirmed = item.isConfirmed !== undefined ? item.isConfirmed : true;
    const inPath = item.inPath || false;
    const id = item.id ? `#${item.id} ` : '';
    const pct = Math.round((item.confidence ?? item.score ?? 0.5) * 100);
    const distStr = typeof item.distanceM === 'number' ? ` ${item.distanceM.toFixed(1)}m` : '';

    let strokeColor = '#94a3b8'; // gray for tentative
    let tagColor = 'rgba(51, 65, 85, 0.9)';
    let tagText = `TRACKING ${id}${pct}%${distStr}`;
    let lineWidth = 1.5;
    let isDashed = true;

    if (isConfirmed) {
      if (inPath) {
        strokeColor = '#ef4444'; // Red for confirmed in-path
        tagColor = '#ef4444';
        tagText = `POTHOLE ${id}${distStr || pct + '%'} [IN PATH]`;
        lineWidth = 3.5;
        isDashed = false;
      } else {
        strokeColor = '#f59e0b'; // Yellow for confirmed off-path
        tagColor = '#f59e0b';
        tagText = `POTHOLE ${id}${distStr || pct + '%'} [OFF PATH]`;
        lineWidth = 2.5;
        isDashed = false;
      }
    }

    // Bounding Box
    ctx.beginPath();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = strokeColor;
    if (isDashed) {
      ctx.setLineDash([5, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(x, y, w, h);

    // Label Tag
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const tagW = ctx.measureText(tagText).width + 12;
    const tagH = 20;
    const tagY = Math.max(0, y - tagH);

    ctx.fillStyle = tagColor;
    ctx.fillRect(x, tagY, tagW, tagH);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, x + 6, tagY + 14);

    // Contact point at bottom-center (ground intersection)
    const contactX = (box.x1 + box.x2) / 2 * scale - cropX;
    const contactY = box.y2 * scale - cropY;
    ctx.beginPath();
    ctx.arc(contactX, contactY, 4, 0, Math.PI * 2);
    ctx.fillStyle = inPath ? '#ef4444' : (isConfirmed ? '#f59e0b' : '#94a3b8');
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Return current detector status and telemetry
 */
export function getDetectorState() {
  return {
    isLoaded: Boolean(session),
    backend: activeBackend,
    inferenceMs: lastInferenceMs,
    detectionCount: lastDetectionCount
  };
}
