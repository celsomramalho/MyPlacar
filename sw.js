const CACHE_NAME = 'myplacar-v2.4.08';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.tsx'
];

// Origens externas permitidas para cache (Fontes)
const EXTERNAL_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
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

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isExternalAllowed = EXTERNAL_ORIGINS.some(origin => url.hostname.includes(origin));

  if (!isSameOrigin && !isExternalAllowed) return;

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      // Estratégia: Cache First para Assets, Network First para Navegação
      if (cachedResponse && !e.request.mode === 'navigate') {
        return cachedResponse;
      }

      return fetch(e.request).then(networkResponse => {
        if (networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
        }
        return networkResponse;
      }).catch(() => {
        // Se falhar a rede e for navegação, retorna o index.html do cache
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return cachedResponse;
      });
    })
  );
});