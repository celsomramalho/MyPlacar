let activeRegistration: ServiceWorkerRegistration | null = null;
let lastUpdateCheckAt = 0;
let updateCheckInFlight: Promise<void> | null = null;

/** Revalida o script do service worker para buscar uma publicação mais recente. */
export function checkForServiceWorkerUpdate(force = false): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return Promise.resolve();

  const now = Date.now();
  if (!force && now - lastUpdateCheckAt < 60_000) return Promise.resolve();
  if (updateCheckInFlight) return updateCheckInFlight;

  lastUpdateCheckAt = now;
  updateCheckInFlight = (async () => {
    try {
      const registration = activeRegistration || await navigator.serviceWorker.getRegistration('/');
      if (!registration) return;
      activeRegistration = registration;
      await registration.update();
    } catch (error) {
      console.warn('MyPlacar: Não foi possível verificar atualizações do ServiceWorker:', error);
    } finally {
      updateCheckInFlight = null;
    }
  })();

  return updateCheckInFlight;
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'SW_ACTIVATED') return;

    console.log('MyPlacar: novo SW ativado, recarregando para versão mais recente...');

    if (sessionStorage.getItem('sw-reload-done')) return;

    sessionStorage.setItem('sw-reload-done', '1');

    try {
      sessionStorage.setItem('myPlacar_pwa_updating', '1');
    } catch {}

    globalThis.location.reload();
  });

  globalThis.addEventListener('load', async () => {
    sessionStorage.removeItem('sw-reload-done');

    let registration: ServiceWorkerRegistration;
    try {
      registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
    } catch (error) {
      console.error('MyPlacar: Falha ao registrar ServiceWorker:', error);
      return;
    }

    activeRegistration = registration;
    console.log('MyPlacar: ServiceWorker registrado:', registration.scope);

    if (registration.waiting) {
      console.log('MyPlacar: SW em espera detectado, ativando imediatamente...');
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('MyPlacar: Nova versão do SW instalada, ativando...');
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    // Além da abertura, revalida quando o usuário volta ao app ou recupera a rede.
    const checkWhenActive = () => {
      if (document.visibilityState === 'visible') void checkForServiceWorkerUpdate();
    };
    globalThis.addEventListener('focus', checkWhenActive);
    globalThis.addEventListener('online', () => void checkForServiceWorkerUpdate(true));
    document.addEventListener('visibilitychange', checkWhenActive);
    void checkForServiceWorkerUpdate(true);
  });
}
