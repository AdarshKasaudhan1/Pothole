# PotholeGuard

A phone-only, offline-first web app (PWA) that turns an Android phone into a real-time pothole detection and rider-warning device for two-wheelers.

Capstone project — Kailash, BCA, Alliance University.

---

## 1. What it does

1. Rider mounts an Android phone on the bike, opens PotholeGuard in Chrome.
2. The phone camera watches the road. An on-device YOLO model detects potholes.
3. The app checks if the pothole is in the rider's path, estimates its distance, and combines that with GPS speed to compute time-to-pothole.
4. The rider is warned with voice, vibration, and a large visual banner — before reaching the pothole.

Everything runs on-device after the first load. No server, no API keys, no native app install.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | Plain HTML / CSS / JavaScript (ES modules), no framework, no bundler | Simplest possible for a solo capstone build; nothing to compile |
| AI runtime | [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) (WebGPU, WASM fallback) | Runs a YOLO model directly in the browser |
| Model | YOLO11n / YOLOv8n, trained in Colab, exported to ONNX | Small enough for real-time mobile inference |
| Camera | `getUserMedia` | Native browser camera access |
| Location | `Geolocation` API (`watchPosition`) | GPS speed |
| Orientation | `DeviceOrientationEvent` | Camera pitch for distance estimation |
| Alerts | `SpeechSynthesis`, `Vibration API`, `Web Audio API` | Voice, vibration, fallback beep |
| Offline | Service Worker + Cache Storage | Works after first load with no signal |
| Hosting | [Vercel](https://vercel.com) (free) | Free HTTPS link — camera requires HTTPS |
| Storage (session logs) | IndexedDB | Persists test session data across refreshes |
| Optional: crowdsourced map | Firebase (Anonymous Auth + Firestore) + Leaflet/OpenStreetMap | Only for the optional Phase 7 feature |

No paid API keys are required for the core app.

---

## 3. Project structure

```
potholeguard/
├── index.html            # App shell: video + canvas overlay + UI panels
├── styles.css            # All styling
├── app.js                # Camera setup, main loop, wake lock, orchestration
├── config.js             # ALL tunable values live here (single source of truth)
├── detector.js           # ONNX Runtime Web: preprocess, inference, decode, NMS
├── tracker.js            # Multi-frame tracking + confirmation logic (pure JS)
├── geometry.js           # Rider-path corridor + monocular distance math (pure JS)
├── risk.js               # Speed + time-to-pothole + risk level engine (pure JS)
├── alerts.js             # Voice, vibration, audio, visual banner
├── logger.js             # Session logging, IndexedDB, CSV export, summary screen
├── sw.js                 # Service worker (offline cache, versioned)
├── manifest.json         # PWA manifest (installable, icons, orientation)
├── tests.html            # Pure-logic unit tests (open in a browser, see PASS/FAIL)
├── /lib                  # Locally-hosted third-party libraries (onnxruntime-web, etc.)
├── /models
│   └── pothole.onnx      # Your trained model (see AI Model Training Guide)
└── /icons                # PWA icons
```

**Rule:** every tunable number (confidence threshold, corridor size, camera height, pitch, distance bands, alert cooldowns) lives only in `config.js`, editable from an in-app settings panel and saved to `localStorage`. Never hard-code a threshold inside logic files.

---

## 4. UI requirements (what needs to be designed/built)

The interface has to work **one-handed at a glance, in daylight, while the phone is mounted on a moving bike.** Design for glanceability, not information density.

### 4.1 Screens

| Screen | Purpose | Key elements |
|---|---|---|
| **Start / permissions** | First launch | Big "Start" button (required for camera/audio/vibration unlock), camera/location permission prompts with plain-language explanations |
| **Live view (main screen)** | Default screen while riding | Full-screen camera feed, detection overlay (boxes + path corridor), status bar (FPS, backend, speed), risk banner |
| **Risk / alert banner** | Overlaid on live view when a pothole is flagged | Large colored banner: `POTHOLE DETECTED` / Distance / Confidence / Speed / Risk level |
| **Settings panel** | Tune thresholds, camera height, alert preferences | Grouped sliders/inputs, all bound to `config.js`, persisted to `localStorage` |
| **Calibration screen** | One-time / per-mount setup | "Place target at 10 m, tap Capture", "Place target at 20 m, tap Capture", shows resulting error |
| **Session / logging screen** | Start/stop a test session, mark events | Start/Stop button, big tappable event buttons (Good alert / False alarm / Missed pothole), live counters |
| **Summary screen** | After a session ends | FPS, inference time, alert counts, battery drop, distance traveled, CSV download button |
| **(Optional) Map screen** | Crowdsourced pothole map | OpenStreetMap tiles, red/orange markers, privacy toggle |

### 4.2 Visual design rules

- **Color-code risk levels consistently everywhere** (banner, boxes, map): 
  - `INFO` → yellow/amber
  - `WARN` → orange
  - `HIGH` → red
  - Confirmed in-path detection box → red outline; off-path → yellow/gray; tentative (unconfirmed) → gray, thin, dashed.
- **High contrast, large text.** Assume direct sunlight and a shaking handlebar — no small gray-on-white text, no thin fonts, minimum ~24px for anything read while riding.
- **Landscape-first.** Most phone mounts are landscape; design the live view for landscape but don't break in portrait.
- **Minimal taps while riding.** Only Start/Stop should ever need a tap while moving; everything else (settings, calibration) is done while parked.
- **Persistent status strip**, always visible: FPS, GPS speed, detection backend (WebGPU/WASM), battery %.
- **Icon-first settings**, not a dense form: gear icon opens a bottom sheet with grouped sliders (Detection / Path / Distance / Alerts).

### 4.3 Interaction/accessibility notes

- Every alert must be triple-redundant: visual **and** audio **and** haptic — never rely on just one channel.
- Big tap targets (48px minimum) everywhere, since the phone is on a bumpy bike.
- No blocking modals during live view — nothing should ever stop the camera loop or hide the corridor overlay.
- Respect reduced-motion where possible; the flashing risk banner should still be readable if animations are turned off.

### 4.4 Suggested tools for the UI itself

- Since this project uses plain HTML/CSS with no framework, style with plain CSS custom properties (design tokens) for the risk colors, spacing and font sizes, defined once at the top of `styles.css`.
- If you want a quick visual mockup before building, Claude's Design/mockup tools or Figma can rough out the live-view layout and settings sheet — but the actual shipped UI should stay dependency-free per the stack above.

---

## 5. Setup & installation

### 5.1 Accounts and tools (all free)

| Tool | Link | Purpose |
|---|---|---|
| Google Antigravity | https://antigravity.google/ | AI coding agent that builds the app from prompts |
| Google Colab | https://colab.research.google.com | Free GPU for model training |
| Roboflow | https://roboflow.com / https://universe.roboflow.com | Dataset source + labeling |
| Vercel | https://vercel.com | Free HTTPS hosting |
| Netron | https://netron.app | Inspect the trained `.onnx` model |
| Firebase (optional) | https://console.firebase.google.com | Only if building the crowdsourced map feature |

### 5.2 Run locally (for development/testing on a laptop)

```bash
cd potholeguard
python3 -m http.server 8000
# open http://localhost:8000 in Chrome
```

Camera will work on `localhost` without HTTPS for local testing. On a phone, HTTPS is required — use the Netlify deployment.

### 5.3 Deploy

**Option A — Vercel CLI (fastest, no GitHub needed):**
```bash
npm install -g vercel
cd potholeguard
vercel --prod
```
Follow the prompts (sign in with GitHub/Google/email on first use). It prints an HTTPS link — open that on your Android phone in Chrome, then Chrome menu → **Add to Home screen** (or **Install app**).

**Option B — GitHub + Vercel dashboard (auto-deploy on every push):**
1. Push the `potholeguard` folder to a GitHub repo.
2. Go to https://vercel.com → **Add New Project** → import the repo.
3. Leave build settings blank/default (this is a static site — no build step, no framework preset needed).
4. Deploy. Every future `git push` auto-redeploys.

Either way, redeploy after every code change so your phone gets the update (remember to also bump `CACHE_VERSION` in `sw.js` so the service worker doesn't keep serving the old cached version).

### 5.4 Requirements

- Android phone with Chrome (latest version)
- Rear camera, GPS, vibration motor
- A bike phone holder (~₹300–800)
- No iPhone support (Safari has no Vibration API)

---

## 6. Model

Place your trained model at:

```
models/pothole.onnx
```

See **AI Model Training Guide** (separate document) for how to create it. The app expects:
- Single class: `pothole`
- Input: verify exact shape in Netron after export (typically `1x3x640x640`, float32, RGB, 0–1, NCHW)
- Output: verify in Netron (typically `1x5x8400` for a one-class YOLO model)

---

## 7. Testing

Open `tests.html` directly in Chrome — it runs the pure-logic unit tests (tracker, geometry, risk engine) and shows PASS/FAIL with no server needed.

---

## 8. Known limitations

- Android Chrome only (no iOS/Safari support — no Vibration API)
- Browser GPS updates roughly once per second
- Expect ~8–15 FPS in-browser (varies by phone)
- Distance accuracy degrades beyond ~20–25 m — validate this experimentally (see calibration steps in the build guide)
- Screen must stay on and Chrome must stay in the foreground

---

## 9. Safety

This is an advisory aid, not a substitute for attention. Never operate or view the phone while riding — all interaction (start/stop, settings, calibration) should happen while stopped. Follow traffic laws and wear a helmet.
