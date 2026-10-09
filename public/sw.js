/* Alias of inert service-worker.js — CACHE_BUST cpc-no-sw-icons-20261009i */
const CACHE_BUST = 'cpc-no-sw-icons-20261009i';

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
