/* Alias — keep in sync with service-worker.js (CACHE_BUST). */
const CACHE_BUST = 'cpc-home-fix-20261009h';

const BYPASS =
  /\/(manifest\.json|site\.webmanifest|service-worker\.js|sw\.js|apple-touch-icon.*|cpc-home-\d+\.png|icon-\d+\.png|favicon\.(ico|svg)|favicon-\d+x\d+\.png)(\?|$)/i;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (BYPASS.test(url.pathname)) return;
  if (request.destination === 'image' && /icon|apple-touch|favicon|cpc-home/i.test(url.pathname)) {
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cached = await caches.match('/offline.html');
          return cached || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => response)
      .catch(() => caches.match(request))
  );
});
