/**
 * PotholeGuard - Service Worker
 * RULE 3: Bump CACHE_VERSION constant on every change so phones load the new version.
 */
const CACHE_VERSION = 'potholeguard-v8.0.0';
const CACHE_NAME = `potholeguard-cache-${CACHE_VERSION}`;

// Core app shell assets to precache on install
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './detector.js',
  './tracker.js',
  './geometry.js',
  './speed.js',
  './risk.js',
  './alerts.js',
  './logger.js',
  './manifest.json',
  './tests.html',
  './lib/ort.all.min.js',
  './models/pothole.onnx',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log(`[SW ${CACHE_VERSION}] Pre-caching app shell...`);
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name.startsWith('potholeguard-cache-') && name !== CACHE_NAME) {
            console.log(`[SW ${CACHE_VERSION}] Deleting old cache:`, name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cache-first for same-origin requests (app shell, scripts, styles, models, icons)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch updated version in background to keep cache warm
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {
            // Network failure is expected offline, ignore
          });
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => {
          // If offline and request is for page navigation, return index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});
