const unregisterServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  } catch {
    /* best-effort */
  }
};

const clearBrowserCaches = async () => {
  if (!('caches' in window)) return;

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  } catch {
    /* best-effort */
  }
};

export const reloadAppWithFreshVersion = async (version: string) => {
  await unregisterServiceWorkers();
  await clearBrowserCaches();

  const url = new URL(globalThis.location.href);
  url.search = '';
  url.searchParams.set('v', version);
  globalThis.location.replace(url.toString());
};
