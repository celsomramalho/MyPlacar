const CACHE_NAME = 'myplacar-v2.4.03';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map(k => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de rede resiliente com suporte offline aprimorado
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  // Ignora chamadas de API externas para não quebrar o app
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      // Se tiver no cache, retorna o cache e tenta atualizar em background
      // Se não tiver no cache, busca na rede
      const fetchPromise = fetch(e.request).then(networkResponse => {
        if (networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
        }
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    }).catch(() => {
      // Fallback total se tudo falhar (rede e cache)
      if (e.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
