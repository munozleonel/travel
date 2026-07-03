// Trip Planner service worker
// Bump CACHE_VERSION whenever index.html/manifest/icons change so clients
// pick up the new version instead of serving a stale cached copy.
const CACHE_VERSION = 'trip-planner-v1';
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Third-party libraries (D3, TopoJSON) rarely change — safe to cache-first.
const CDN_HOSTS = ['cdnjs.cloudflare.com'];

// Never cache: GitHub API/raw content (needs to always be fresh/live) and
// the world-atlas map data (large, and freshness doesn't matter much but
// we don't want it to ever mask a network error silently).
const NETWORK_ONLY_HOSTS = ['api.github.com', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POST/PUT (GitHub saves, etc.)

  const url = new URL(req.url);

  // Always hit the network for GitHub sync + map data — never serve stale data.
  if (NETWORK_ONLY_HOSTS.some((h) => url.hostname === h)) {
    return; // let the browser handle it normally
  }

  // CDN libraries: cache-first, falling back to network, then updating cache.
  if (CDN_HOSTS.some((h) => url.hostname === h)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          return res;
        });
      })
    );
    return;
  }

  // App shell (same-origin): network-first so updates are picked up when
  // online, falling back to cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
  }
});
