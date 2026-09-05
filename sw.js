const CACHE_NAME = 'mantiq-cache-v2.2.62'; // bumped to drop marketing page from cache

const urlsToCache = [
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
// The SW only intercepts requests for app assets. The marketing page (index.html)
// is intentionally not cached — it's a normal webpage, not part of the PWA shell.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./app.html');
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
  );
});
