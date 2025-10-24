/* ==========================================================
 * Project: Lexitron
 * File: sw.js
 * Purpose: Service Worker — кэш, офлайн и обновления ассетов
 * Version: 1.3
 * Last modified: 2025-10-22
 *
 * Изменения (v1.3):
 * - Ограничение типов (js/mjs/css/index.html/sw.js/json/wasm).
 * - HEAD-проверка валидаторов; GET и кэш — только при отличиях.
 * - Троттлинг CHECK_UPDATES (не чаще 30 сек).
 * - Клиент сам решает как обновляться (без жёсткого reload отсюда).
 */
const SW_VERSION_FALLBACK = '1.3';
const CACHE_PREFIX = 'lexitron-';
let   CACHE_NAME   = CACHE_PREFIX + SW_VERSION_FALLBACK;
let   LAST_FULL_CHECK = 0;
const FULL_CHECK_COOLDOWN_MS = 30_000;

function sameOrigin(url) {
  try { const u = new URL(url, self.location.href); return u.origin === self.location.origin; } catch (_) { return false; }
}
function isCriticalUrl(u) {
  try {
    const url = typeof u === 'string' ? new URL(u, self.location.href) : u;
    const p = url.pathname;
    return (
      /\.m?js($|\?)/i.test(p) ||
      /\.css($|\?)/i.test(p) ||
      /(^|\/)index\.html($|\?)/i.test(p) ||
      /(^|\/)sw\.js($|\?)/i.test(p) ||
      /\.json($|\?)/i.test(p) ||
      /\.wasm($|\?)/i.test(p)
    );
  } catch(_) { return false; }
}
async function hashBuffer(buf) {
  try {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('');
  } catch (_) {
    const v = new Uint8Array(buf); let s = 0; for (let i=0;i<v.length;i++) s = (s*31 + v[i])>>>0;
    return 'x'+s.toString(16);
  }
}
async function responseSignature(res) {
  try {
    if (!res) return null;
    const et = res.headers.get('ETag');
    const lm = res.headers.get('Last-Modified');
    if (et || lm) return (et||'') + '|' + (lm||'');
    const buf = await res.clone().arrayBuffer();
    const h = await hashBuffer(buf);
    return 'H|' + h;
  } catch (_) { return null; }
}
async function contentsChanged(oldRes, newHeadOrGet) {
  try {
    if (!newHeadOrGet) return false;
    if (!oldRes) return true;
    const a = await responseSignature(oldRes);
    const b = await responseSignature(newHeadOrGet);
    return a !== b;
  } catch (_) { return true; }
}
async function notifyClients(msg) {
  try {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => { try { c.postMessage(msg); } catch(_){ } });
  } catch(_){}
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      const toDelete = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME);
      await Promise.all(toDelete.map((k) => caches.delete(k)));
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
    } catch (_){}
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
      } catch (_){
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

    const netFetch = isCriticalUrl(req.url)
      ? fetch(req, { method:'HEAD' }).then(async (headRes) => {
          try {
            if (headRes && headRes.ok && sameOrigin(req.url)) {
              const changed = await contentsChanged(cached, headRes);
              if (changed) {
                const full = await fetch(req, { cache:'no-store' });
                if (full && full.ok) {
                  await cache.put(req, full.clone());
                  notifyClients({ type:'ASSETS_UPDATED', urls:[req.url] });
                }
              } else {
                const full = await fetch(req).catch(()=>null);
                if (full && full.ok) await cache.put(req, full.clone());
              }
            }
          } catch(_){}
          return cached || headRes;
        }).catch(() => null)
      : fetch(req).then(async (res) => {
          try {
            if (res && res.ok && sameOrigin(req.url)) {
              await cache.put(req, res.clone());
            }
          } catch(_){}
          return res;
        }).catch(() => null);

    return cached || (await netFetch) || Response.error();
  })());
});

self.addEventListener('message', (event) => {
  const data = event && event.data || {};
  try {
    if (data.type === 'SKIP_WAITING') {
      self.skipWaiting();
      return;
    }
    if (data.type === 'CHECK_UPDATES' || data.type === 'CHECK_FOR_UPDATES' || data.type === 'UPDATE_CHECK') {
      const now = Date.now();
      if (now - LAST_FULL_CHECK < FULL_CHECK_COOLDOWN_MS) {
        notifyClients({ type:'NO_UPDATES', reason:'cooldown' });
        return;
      }
      LAST_FULL_CHECK = now;

      event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const changed = [];
        for (const req of keys) {
          if (req.method !== 'GET') continue;
          if (!sameOrigin(req.url)) continue;
          if (!isCriticalUrl(req.url)) continue;
          try {
            const oldRes = await cache.match(req);
            const head = await fetch(req, { method:'HEAD', cache:'no-store' });
            if (head && head.ok && await contentsChanged(oldRes, head)) {
              const full = await fetch(req, { cache:'no-store' });
              if (full && full.ok) {
                await cache.put(req, full.clone());
                changed.push(req.url);
              }
            }
          } catch (_){}
        }
        if (changed.length > 0) {
          await notifyClients({ type: 'ASSETS_UPDATED', urls: changed });
        } else {
          await notifyClients({ type: 'NO_UPDATES' });
        }
      })());
      return;
    }
  } catch (_){}
});
