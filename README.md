# PotholeGuard - Smart Pothole Detection & Rider Alert System

A lightweight, phone-only Progressive Web App (PWA) designed for two-wheelers that runs real-time pothole detection, multi-frame tracking, monocular distance estimation, and rider warnings.

**Capstone Project — BCA**

GitHub Repository: [https://github.com/Suraj18-108/Pothole](https://github.com/Suraj18-108/Pothole)

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
4. Import your repository: `Suraj18-108/Pothole`.
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

## 4. Project Structure

- `index.html`: Application shell containing `<video>`, transparent `<canvas>` overlay, start trigger, HUD, and settings drawer.
- `styles.css`: Sunlight-readable, high-contrast dark theme optimized for motorcycle phone mounts.
- `config.js`: Single source of truth for all tunable parameters (confidence, corridor geometry, camera height/pitch, thresholds, cooldowns) with `localStorage` persistence.
- `app.js`: Camera stream initialization (`getUserMedia`), Screen Wake Lock maintenance, frame rate monitor, error reporting, and UI event binding.
- `sw.js`: Service worker caching the app shell for offline functionality with versioned cache management (`CACHE_VERSION`).
- `manifest.json`: Web App Manifest enabling home-screen installation and standalone display.
- `tests.html`: Minimal unit test runner for verifying logic modules and configuration.
- `/icons`: App icons (192x192 and 512x512) for PWA installation.
- `/lib`: Directory reserved for offline third-party scripts (e.g. ONNX Runtime Web in Phase 2).
- `/models`: Directory reserved for the trained YOLO ONNX model (`pothole.onnx` in Phase 2).
