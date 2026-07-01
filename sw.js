/* Exhale service worker — offline app shell + runtime caching */
const CACHE = 'exhale-v1.1.1';

/* Core files that make the app work offline. Kept small + resilient:
   if any single file 404s during install we still finish (addAll is all-or-nothing,
   so we add individually and ignore failures). */
const CORE = [
  './',
  './Exhale.dc.html',
  './support.js',
  './manifest.webmanifest',
  './assets/abundate-mark.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // App-shell navigations: serve the cached page when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) ||
               (await cache.match('./Exhale.dc.html')) ||
               (await cache.match('./')) ||
               Response.error();
      }
    })());
    return;
  }

  // Everything else: cache-first, then network, and stash a copy for next time.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      // Refresh in the background (don't block the response).
      fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      // Cache successful same-origin + font responses for offline use.
      if (res && (res.ok || res.type === 'opaque')) {
        if (sameOrigin || /fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
          cache.put(req, res.clone()).catch(() => {});
        }
      }
      return res;
    } catch (e) {
      return hit || Response.error();
    }
  })());
});
