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

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      console.log('MyPlacar: ServiceWorker registrado:', registration.scope);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('MyPlacar: Nova versão do SW disponível e aguardando.');
          }
        });
      });

      await registration.update();
    } catch (error) {
      console.error('MyPlacar: Falha ao registrar ServiceWorker:', error);
    }
  });
}
