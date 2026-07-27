const CACHE_NAME = 'mantiq-cache-v2.2.2';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './wasm/mantiq-worker.js',
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

// 1. Install event - Cache files and force skip waiting
self.addEventListener('install', event => {
  self.skipWaiting(); // Immediately activate new worker
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
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
        // If the file is in the cache, return it! (Offline mode)
        if (response) {
          return response;
        }
        // Otherwise, try to fetch it from the internet
        return fetch(event.request);
      })
  );
});
