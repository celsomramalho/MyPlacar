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

    // A verificação explícita falha sem rede mesmo quando há um SW ativo e válido.
    if (navigator.onLine) {
      try {
        await registration.update();
      } catch (error) {
        console.warn('MyPlacar: Não foi possível verificar atualizações do ServiceWorker:', error);
      }
    }
  });
}
