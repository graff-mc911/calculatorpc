/** Bump with each production deploy that must reach sticky iOS PWAs. */
export const CPC_SW_VERSION = 'cpc-no-sw-icons-20261009i';

const BUILD_STORAGE_KEY = 'cpc-build-id';

async function clearAllCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function unregisterAllServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
}

/**
 * If the HTML meta build id changed since last visit, wipe caches / SW and reload once.
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

  const hadPrevious = Boolean(previous);
  try {
    localStorage.setItem(BUILD_STORAGE_KEY, meta);
  } catch {
    /* ignore */
  }

  if (!hadPrevious) return false;

  try {
    await clearAllCaches();
    await unregisterAllServiceWorkers();
  } catch {
    /* continue */
  }

  const url = new URL(window.location.href);
  url.searchParams.set('cpc_refresh', meta);
  // Drop stale PWA query junk before reload
  url.searchParams.delete('utm_source');
  url.searchParams.delete('utm_medium');
  url.searchParams.delete('utm_campaign');
  window.location.replace(url.toString());
  return true;
}

/**
 * Do NOT register a service worker while iOS home-screen icons are broken.
 * Old SWs intercept icon/manifest fetches and Safari falls back to letter "C".
 * Always unregister any existing worker + clear caches once per load.
 */
export function registerServiceWorker() {
  window.addEventListener('load', () => {
    try {
      const url = new URL(window.location.href);
      let dirty = false;
      for (const key of ['cpc_refresh', 'utm_source', 'utm_medium', 'utm_campaign']) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          dirty = true;
        }
      }
      if (dirty) {
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch {
      /* ignore */
    }

    void (async () => {
      try {
        await unregisterAllServiceWorkers();
        await clearAllCaches();
      } catch {
        /* ignore */
      }
    })();
  });
}

export function unregisterServiceWorker() {
  void unregisterAllServiceWorkers();
}
