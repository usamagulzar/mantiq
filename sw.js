const CACHE_NAME = 'mantiq-cache-v2.2.8';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './wasm/mantiq-worker.js',
  './wasm/index.js',
  './wasm/index.wasm',
  // CSS
  './css/fonts.css',
  './css/vars.css',
  './css/layout.css',
  './css/topbar.css',
  './css/panels.css',
  './css/solution.css',
  './css/views.css',
  './css/kmap.css',
  './css/about.css',
  './css/responsive.css',
  // JS
  './js/three.min.js',
  './js/svg-icons.js',
  './js/worker-bridge.js',
  './js/zoom-pan.js',
  './js/xor-detector.js',
  './js/circuit-recognizer.js',
  './js/ui-core.js',
  './js/solution-renderer.js',
  './js/app-core.js',
  './js/rule-modal.js',
  './js/modals-events.js',
  './js/truth-table.js',
  './js/circuit.js',
  './js/simulation.js',
  './js/kmap.js',
  './js/tutorial.js',
];

// 1. Install event - Cache files individually so one failure doesn't abort the whole install
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache each file individually — if one fails, the rest still get cached
      return Promise.allSettled(
        urlsToCache.map(url =>
          cache.add(url).catch(err => {
            console.warn('[ServiceWorker] Failed to cache:', url, err);
          })
        )
      );
    })
  );
});

// 2. Activate event - Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch event - Cache First with Network Fallback
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // If the file is in the cache, return it (offline mode)
        if (response) {
          return response;
        }
        // Otherwise, try to fetch from network
        return fetch(event.request);
      })
  );
});
