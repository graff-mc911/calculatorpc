const SW_URL = '/service-worker.js';

function askWaitingWorkerToActivate(worker: ServiceWorker | null) {
  if (!worker) return;
  worker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        // Pull updates soon after load and periodically.
        registration.update().catch(() => {});
        setInterval(() => {
          registration.update().catch(() => {});
        }, 15 * 60 * 1000);

        // If a new worker is already waiting, activate immediately (no confirm).
        if (registration.waiting) {
          askWaitingWorkerToActivate(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              askWaitingWorkerToActivate(newWorker);
            }
          });
        });
      })
      .catch(() => {
        // Registration can fail offline; ignore.
      });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_ACTIVATED' && !refreshing) {
        // Soft signal — controllerchange usually reloads; keep as backup.
      }
    });
  });
}

export function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => {});
}
