# PotholeGuard - Smart Pothole Detection & Rider Alert System

A lightweight, phone-only Progressive Web App (PWA) designed for two-wheelers that runs real-time pothole detection, multi-frame tracking, monocular distance estimation, and rider warnings.

**Capstone Project — BCA**

- **Live Production App:** [https://pothole-beta.vercel.app](https://pothole-beta.vercel.app)
- **GitHub Repository:** [https://github.com/AdarshKasaudhan1/Pothole](https://github.com/AdarshKasaudhan1/Pothole)
- **Current Release:** `v10.0.0` (Offline-first PWA, WASM SIMD, INT8 YOLO)

---

## 1. Quick Start — Run Locally (Laptop Check)

1. Open your terminal in this project folder:
   ```bash
   cd d:/Pothhole
   ```
2. Start Python's built-in HTTP server:
   ```bash
   python -m http.server 8000
   ```
   *(or `python3 -m http.server 8000`)*

3. Open Chrome and navigate to:
   ```
   http://localhost:8000
   ```

4. Click the large **"Start Camera"** button:
   - Your webcam video stream will appear full screen.
   - The HUD at the top displays camera resolution (e.g. `1280x720`) and measured live frame rate (`FPS`).
   - Click the gear icon in the top right to open the **Settings** panel, where you can modify parameters and save them directly to `localStorage`.
5. Run unit tests anytime by opening:
   ```
   http://localhost:8000/tests.html
   ```

---

## 2. Deploy to Vercel (HTTPS for Phone Testing)

> **Important**: Android Chrome strictly blocks camera, sensors, and vibration on unencrypted HTTP connections. Deploying to Vercel provides a free, instant HTTPS URL required for phone testing.

### Option A: GitHub &rarr; Vercel Dashboard (Auto-Deploy)

1. Push your latest code to your GitHub repository:
   ```bash
   git add .
   git commit -m "Prepare PotholeGuard camera skeleton and PWA for Vercel"
   git push origin main
   ```
2. Open [https://vercel.com](https://vercel.com) and log in.
3. Click **"Add New..." &rarr; "Project"**.
4. Import your repository: `AdarshKasaudhan1/Pothole`.
5. Keep Framework Preset as **"Other"** (Static HTML, no build command).
6. Click **Deploy**. Vercel will deploy in seconds and generate an HTTPS URL.

### Option B: Vercel CLI (Deploy from Terminal)

1. Install Vercel CLI globally (if not already installed):
   ```bash
   npm install -g vercel
   ```
2. Run from the project directory:
   ```bash
   vercel --prod
   ```
3. Follow the terminal prompts to link and deploy.

---

## 3. Testing on Android Phone

1. Open your Vercel HTTPS URL (e.g. `https://pothole-xxx.vercel.app`) in **Chrome on Android**.
2. Tap the **"Start Camera"** button.
3. Tap **"Allow"** when Chrome prompts for Camera permissions.
4. **Verify Live Camera & HUD**:
   - The rear camera stream fills the entire screen.
   - The status pill shows the camera resolution (e.g., `1280x720`) and active FPS (~30 fps).
   - The status indicator dot turns green.
5. **Install as PWA**:
   - Tap Chrome's menu (`⋮`) &rarr; **"Add to Home screen"** (or **"Install app"**).
   - Launch PotholeGuard from your home screen as a standalone app.
6. **Test Offline Capability**:
   - Enable Airplane mode on your phone.
   - Reopen the app to verify the app shell loads offline from the Service Worker cache.
7. **Test Settings Panel**:
   - Tap the gear icon in the top-right corner.
   - Adjust any slider (e.g. **Camera Height** to `1.20 m` or **Confidence Threshold** to `0.50`) and tap **"Save Changes"**.
   - Reload the page, reopen Settings, and verify your customized values remain saved in `localStorage`.

---

---

## 4. Architecture & Completed Prompts (1 through 7)

| Phase / Prompt | Module | Description | Status |
|---|---|---|---|
| **Prompt 1: App Skeleton & Camera** | `index.html`, `styles.css`, `app.js`, `manifest.json` | Rear camera access via `getUserMedia`, Screen Wake Lock, 60fps monitor, responsive landscape/portrait HUD, offline PWA. | ✅ COMPLETED |
| **Prompt 2: In-Browser AI Detector** | `detector.js`, `models/pothole.onnx`, `lib/ort.all.min.js` | WebGPU acceleration with WASM fallback, letterbox preprocessing (640x640), YOLO single-class tensor decoding, Non-Maximum Suppression (NMS). | ✅ COMPLETED |
| **Prompt 3: Tracking & Path Corridor** | `tracker.js`, `geometry.js` | Multi-frame IoU + centroid tracking, exponential box smoothing ($\alpha=0.4$), confirmation filter ($\ge 3$ hits in 5 frames), trapezoid rider-path corridor with hysteresis buffer. | ✅ COMPLETED |
| **Prompt 4: Distance & Calibration** | `geometry.js`, `index.html` (Calib & Debug) | Flat-ground monocular pinhole distance model ($d = H / \tan(\theta + \alpha)$), 2-point calibration solver for $\theta$ & $f_y$, median distance filtering (5-frame window), sample logging & CSV export for Manual 4 validation. | ✅ COMPLETED |
| **Prompt 5: Speed, TTP & Risk Engine** | `speed.js`, `risk.js` | GPS speed (`navigator.geolocation.watchPosition` with Haversine fallback), Time-To-Pothole calculation ($TTP = d / v$), dynamic risk levels (`NONE`, `INFO`, `WARN`, `HIGH`), $TTP < 1.5\text{s}$ escalation, stationary suppression ($< 5\text{ km/h}$), risk hysteresis, per-track alert cooldown, and Simulation Mode sliders. | ✅ COMPLETED |
| **Prompt 6: Triple-Redundant Alerts** | `alerts.js`, `index.html` | Voice alerts (`SpeechSynthesis` with `en-IN` voice preferred and gesture unlock), haptic vibration motor pulses (`navigator.vibrate`), Web Audio API backup beeps, and sunlight-readable high-contrast visual banner. | ✅ COMPLETED |
| **Prompt 7: Session Logger & Report** | `logger.js`, `index.html` (Session modal) | 200ms periodic telemetry sampling to memory & IndexedDB, one-tap event markers (GOOD ALERT, FALSE ALARM, MISSED POTHOLE), Battery Status API integration, CSV Blob download, and automatic statistical summary report. | ✅ COMPLETED |

---

## 5. File Structure

```
potholeguard/
├── index.html            # Main viewport, video feed, HUD, calibration, debug, session & settings drawers
├── styles.css            # Sunlight-readable high-contrast styles, alert banner animations, responsive landscape layout
├── app.js                # Master application controller, camera & sensor lifecycle, detection orchestration
├── config.js             # Single source of truth for all tunable parameters (localStorage persistence)
├── detector.js           # ONNX Runtime Web engine: letterbox, WebGPU/WASM inference, YOLO anchor decoding, NMS
├── tracker.js            # Multi-frame IoU/centroid tracker, exponential box smoothing, median distance filter (pure JS)
├── geometry.js           # Trapezoid path corridor, flat-ground pinhole distance math, 2-point calibration solver (pure JS)
├── speed.js              # High-accuracy GPS speed tracker, Haversine distance fallback, simulation override
├── risk.js               # Time-To-Pothole (TTP) calculation, risk levels (NONE/INFO/WARN/HIGH), hysteresis, cooldown (pure JS)
├── alerts.js             # SpeechSynthesis voice, Vibration API pulses, Web Audio synthesizer beeps, visual HUD banner
├── logger.js             # 200ms session telemetry logging, IndexedDB offline persistence, marked events, summary report, CSV export
├── sw.js                 # Service worker with offline precaching (CACHE_VERSION = 'potholeguard-v10.0.0')
├── manifest.json         # PWA installation manifest (standalone, icons, landscape-primary)
├── tests.html            # In-browser test runner verifying 21 pure-logic unit tests
├── /lib                  # Local offline ONNX Runtime Web 1.30.0 bundle & WASM binaries
├── /models
│   └── pothole.onnx      # Trained single-class YOLO11n object detection model
└── /icons                # PWA icons (192x192, 512x512)
```

---

## 6. Unit Testing

Open `tests.html` in Chrome or run via Node.js to verify the complete unit test suite:
- Config defaults and storage mutation tests.
- Multi-frame tracker confirmation, missed-frame tolerance, and separate track ID allocation.
- Trapezoid corridor in-path and off-path classification with hysteresis.
- Hand-calculated monocular distance verification ($H = 1.1\text{ m}, \theta = 10^\circ, y_b = 480\text{ px} \implies 3.22\text{ m}$).
- Horizon cutoff ray and max distance threshold validation.
- 2-point calibration solver round-trip validation (solving for $\theta$ & $f_y$, verifying 15m target reads 15.0m).
- Haversine great-circle distance verification.
- Time-to-pothole and dynamic risk levels (40 km/h at 20m $\implies$ TTP 1.8s, `WARN`).
- Alert cooldown suppression on consecutive frames.
- Low-speed alert suppression while stationary ($< 5\text{ km/h}$).
- TTP escalation under 1.5s (`INFO` $\rightarrow$ `WARN` $\rightarrow$ `HIGH`).

- `manifest.json`: Web App Manifest enabling home-screen installation and standalone display.
- `vercel.json`: Security headers (COOP/COEP) for high-performance multithreaded WASM and WebGPU.
- `tests.html`: Minimal unit test runner for verifying logic modules and configuration.
- `/icons`: App icons (192x192 and 512x512) for PWA installation.
- `/lib`: Local ONNX Runtime Web JavaScript and WebAssembly binary distribution.
- `/models/pothole.onnx`: Single-class YOLO11n object detector exported for edge inference.
