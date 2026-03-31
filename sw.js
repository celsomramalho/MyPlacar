const CACHE_NAME = 'myplacar-v2.5.09';

// Assets essenciais que sempre devem estar em cache
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ─── SKIP WAITING ───────────────────────────────────────────────────────────
// Recebe o sinal do app para ativar o novo SW imediatamente,
// sem esperar todas as abas fecharem.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── INSTALL ────────────────────────────────────────────────────────────────
// Pré-faz cache do index.html e depois descobre e cacheia todos os
// assets JS/CSS do build dinamicamente (hashes do Vite incluídos).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cacheia os arquivos essenciais conhecidos
      await cache.addAll(PRECACHE_URLS);

      // 2. Busca o index.html para extrair os assets do Vite (JS/CSS com hash)
      try {
        const response = await fetch('/index.html');
        const html = await response.text();

        // Encontra todos os src/href que apontam para /assets/
        const assetRegex = /(?:src|href)=["'](\/?assets\/[^"']+)["']/g;
        const assetUrls = new Set();
        let match;
        while ((match = assetRegex.exec(html)) !== null) {
          assetUrls.add(match[1].startsWith('/') ? match[1] : '/' + match[1]);
        }

        // Cacheia cada asset encontrado
        const fetchPromises = [...assetUrls].map(url =>
          fetch(url)
            .then(res => {
              if (res.ok) cache.put(url, res);
            })
            .catch(() => {}) // ignora falhas individuais
        );
        await Promise.all(fetchPromises);
        console.log(`Myplacar SW: ${assetUrls.size} assets cacheados.`);
      } catch (e) {
        console.warn('Myplacar SW: Não foi possível pré-cachear assets.', e);
      }

      // skipWaiting é controlado pelo app via mensagem SKIP_WAITING
      // para evitar ativar o SW no meio de uma sessão ativa
    })
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
// Remove caches de versões antigas para liberar espaço.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignora tráfego de desenvolvimento (localhost)
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Ignora requisições ao Firebase/Firestore/Auth — nunca cachear
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('emailjs')
  ) return;

  // Navegação e index.html: Stale-While-Revalidate
  // Entrega o cache instantaneamente e atualiza em segundo plano.
  if (event.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((res) => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
          return res;
        }).catch(() => cached); // se falhar na rede, usa o cache
        return cached || networkFetch;
      })
    );
    return;
  }

  // Assets JS/CSS/imagens: Cache First
  // Se estiver em cache entrega direto; se não, busca na rede e cacheia.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      }).catch(() =>
        new Response('', { status: 408, statusText: 'Offline' })
      );
    })
  );
});
