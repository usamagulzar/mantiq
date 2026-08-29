const CACHE_NAME = 'mantiq-cache-v2.2.57'; // bumped for landing page split

const urlsToCache = [
  './',
  './index.html',
  './app.html',
  './manifest.json',
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-48.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './wasm/mantiq-worker.js',
  './wasm/index.js',
  './wasm/index.wasm',
  // App CSS
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
  './css/integrity.css',
  // Landing CSS + JS
  './css/landing.css',
  './js/landing.js',
  // Landing assets
  './assets/logo.svg',
  './assets/shots/diagram.jpg',
  './assets/shots/kmap.jpg',
  './assets/shots/landing.jpg',
  './assets/shots/proofs.jpg',
  './assets/shots/simulation.jpg',
  './assets/shots/truthtable.jpg',
  './assets/shots/verilog.jpg',
  // App JS
  './js/integrity-gate.js',
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

// 3. Fetch event - Cache First (ignoring query strings) with Network Fallback
self.addEventListener('fetch', event => {
  event.respondWith(
    // ignoreSearch: true so "css/fonts.css?v=2.0.1" matches the cached
    // "css/fonts.css" entry — this is the fix for the "You're Offline" bug.
    caches.match(event.request, { ignoreSearch: true })
      .then(response => {
        // If the file is in the cache, return it (offline mode)
        if (response) {
          return response;
        }
        // Otherwise, try to fetch from network
        return fetch(event.request).catch(() => {
          // No cache hit and no network — fall back to the app shell
          // (not the marketing page) so users can still use the app offline.
          if (event.request.mode === 'navigate') {
            return caches.match('./app.html');
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
  );
});
