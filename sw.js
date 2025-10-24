/* ==========================================================
 * Project: MOYAMOVA
 * File: sw.js
 * Purpose: Service Worker: кэш и офлайн
 * Version: 1.0
 * Last modified: 2025-10-19
*/

/* sw.js — стабильный service worker для MOYAMOVA */
const SW_VERSION_FALLBACK = '1.0';
const CACHE_PREFIX = 'lexitron-';
let CACHE_NAME = CACHE_PREFIX + SW_VERSION_FALLBACK;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        const v = (data && data.version) ? String(data.version) : SW_VERSION_FALLBACK;
        CACHE_NAME = CACHE_PREFIX + v;
      }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      const toDelete = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME);
      await Promise.all(toDelete.map((k) => caches.delete(k)));
    } catch (_) {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        caches.open(CACHE_NAME).then((cache) => cache.put(req, fresh.clone())).catch(() => {});
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const html = await cache.match('index.html');
        if (html) return html;
        throw _;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
      try { cache.put(req, res.clone()); } catch (_) {}
      return res;
    }).catch(() => null);
    return cached || (await fetchPromise) || Response.error();
  })());
});

/* ====================== End of file =======================
 * File: sw.js • Version: 1.0 • 2025-10-19
*/

/* [UPDATE-MSG] Support SKIP_WAITING command from UI */
self.addEventListener('message', (event) => {
  try {
    if (event && event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  } catch (_) {}
});
