/* Alias of inert service-worker.js — CACHE_BUST cpc-icons-v2-ios-20261009k */
const CACHE_BUST = 'cpc-icons-v2-ios-20261009k';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    })()
  );
});
