/** Bump with each production deploy that must reach sticky iOS PWAs. */
export const CPC_SW_VERSION = 'cpc-logo-frame-20261009d';

const SW_URL = `/service-worker.js?v=${CPC_SW_VERSION}`;
const BUILD_STORAGE_KEY = 'cpc-build-id';

function askWaitingWorkerToActivate(worker: ServiceWorker | null) {
  if (!worker) return;
  worker.postMessage({ type: 'SKIP_WAITING' });
}

async function clearAllCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

/**
 * If the HTML meta build id changed since last visit, wipe caches / SW and reload once.
 * Fixes iOS Safari + Home Screen PWAs that keep an old shell after Vercel deploys.
 */
export async function forceRefreshIfBuildChanged(): Promise<boolean> {
  const meta = document.querySelector('meta[name="cpc-build"]')?.getAttribute('content') || '';
  if (!meta) return false;

  let previous = '';
  try {
    previous = localStorage.getItem(BUILD_STORAGE_KEY) || '';
  } catch {
    previous = '';
  }

  if (previous === meta) return false;

  // First visit or build changed — persist, then hard-reset clients that had an older build.
  const hadPrevious = Boolean(previous);
  try {
    localStorage.setItem(BUILD_STORAGE_KEY, meta);
  } catch {
    /* ignore quota / private mode */
  }

  if (!hadPrevious) return false;

  try {
    await clearAllCaches();
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* continue to reload anyway */
  }

  const url = new URL(window.location.href);
  url.searchParams.set('cpc_refresh', meta);
  window.location.replace(url.toString());
  return true;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    // Drop one-time refresh query so URLs stay clean after forced reload.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('cpc_refresh')) {
        url.searchParams.delete('cpc_refresh');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch {
      /* ignore */
    }

    navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        registration.update().catch(() => {});
        setInterval(() => {
          registration.update().catch(() => {});
        }, 5 * 60 * 1000);

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
  });
}

export function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => {});
}
