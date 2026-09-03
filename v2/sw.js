// Cache names are namespaced per app. v1 and v2 are served from the same
// origin, so each service worker must only ever clean up ITS OWN caches —
// a blanket "delete everything that isn't mine" makes the two evict each
// other's offline data on every activation.
const PREFIX = 'putting-tracker-v2';
const CACHE  = PREFIX + '-11';

// The app shell. Paths are relative so this works under a GitHub Pages
// project path (flashr12.github.io/putting-tracker/), not just a domain root.
const LOCAL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Third-party libraries, cached best-effort (see install).
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Install: cache the shell, then the CDN files.
// cache.addAll() is ATOMIC — one cross-origin failure rejects the whole call
// and leaves the cache completely empty. Keeping the CDN entries out of the
// atomic set is what makes offline mode actually work.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await cache.addAll(LOCAL);
      await Promise.allSettled(CDN.map(url =>
        // no-cors gives an opaque response — unusable for reading, but it
        // replays fine from cache for a <script src>, which is all we need.
        fetch(url, { mode: 'no-cors' }).then(res => cache.put(url, res))
      ));
    }).then(() => self.skipWaiting())
  );
});

// Activate: drop only this app's older caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.startsWith(PREFIX) && k !== CACHE)
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const isDoc = e.request.mode === 'navigate' || e.request.destination === 'document';

  // The page itself is NETWORK-FIRST. Cache-first on the document means a
  // published update is never seen: the worker keeps serving the stale HTML
  // until sw.js itself happens to change. Falling back to cache preserves
  // offline use.
  if (isDoc) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(hit => hit || caches.match('./index.html'))
      )
    );
    return;
  }

  // Static assets are cache-first — they're immutable enough and this keeps
  // the app instant offline.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => undefined);
    })
  );
});
