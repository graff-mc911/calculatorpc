/* Intentionally inert — iOS PWA icons break when a SW intercepts icon fetches.
 * CACHE_BUST: cpc-icons-v2-ios-20261009k
 * Clients unregister this worker from registerServiceWorker.ts.
 */
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
      // Do not claim clients — stay inert so icons load from network.
    })()
  );
});

// No fetch handler — browser default network for everything including icons.
