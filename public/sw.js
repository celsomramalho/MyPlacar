const CACHE_NAME = 'myplacar-v2.5.12';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const OFFLINE_FALLBACK = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Placar — Offline</title>
  <style>
    body { margin: 0; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100vh; background: #0f172a;
           font-family: system-ui, sans-serif; color: #fff; text-align: center; padding: 24px; }
    h1 { font-size: 1.5rem; font-weight: 900; margin-bottom: 8px; }
    p  { font-size: 0.875rem; color: #94a3b8; margin-bottom: 24px; }
    button { background: #22c55e; color: #fff; border: none; border-radius: 999px;
             padding: 12px 32px; font-size: 0.875rem; font-weight: 900;
             cursor: pointer; }
  </style>
</head>
<body>
  <h1>📶 Sem conexão</h1>
  <p>Verifique sua internet e tente novamente.</p>
  <button onclick="location.reload()">Tentar novamente</button>
</body>
</html>`;

// ─── SKIP WAITING ───────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── INSTALL ────────────────────────────────────────────────────────────────
// CRÍTICO: sempre busca da rede com cache: 'no-store' para garantir
// que o install nunca usa assets do CDN cacheado ou de versões anteriores.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Arquivos essenciais — sempre da rede, nunca do cache HTTP
      await Promise.all(
        PRECACHE_URLS.map(url =>
          fetch(url, { cache: 'no-store' })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      );

      // 2. Extrai e cacheia assets do Vite dinamicamente a partir do index.html novo
      try {
        const response = await fetch('/index.html', { cache: 'no-store' });
        const html = await response.text();

        // Guarda o index.html no cache com a chave canônica
        cache.put('/index.html', new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }));

        const assetRegex = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
        const assetUrls = new Set();
        let match;
        while ((match = assetRegex.exec(html)) !== null) {
          assetUrls.add(match[1]);
        }

        await Promise.all([...assetUrls].map(url =>
          fetch(url, { cache: 'no-store' })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        ));
        console.log(`Myplacar SW ${CACHE_NAME}: ${assetUrls.size} assets cacheados.`);
      } catch (e) {
        console.warn('Myplacar SW: Não foi possível pré-cachear assets.', e);
      }
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
// 1. Assume controle imediato de todas as abas (clients.claim antes de limpar).
// 2. Remove TODOS os caches que não sejam o CACHE_NAME atual.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.claim().then(() =>
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log(`Myplacar SW: removendo cache antigo "${name}"`);
              return caches.delete(name);
            })
        )
      )
    )
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignora tráfego de desenvolvimento
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Nunca interceptar Firebase / Firestore / Auth / EmailJS
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('emailjs')
  ) return;

  // ── Navegação (index.html / SPA routes): Network-first ──
  // CRÍTICO: busca sempre da rede primeiro para garantir index.html atualizado.
  // O ?v=X.X.X adicionado pelo processo de update força bypass do CDN.
  if (
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((res) => {
          // Atualiza o cache com o index.html mais recente (chave sem querystring)
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('/index.html', clone);
            cache.put('/', clone.clone());
          });
          return res;
        })
        .catch(() =>
          // Offline: tenta cache, senão exibe página offline embutida
          caches.open(CACHE_NAME).then(cache =>
            cache.match('/index.html').then(cached =>
              cached ||
              new Response(OFFLINE_FALLBACK, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            )
          )
        )
    );
    return;
  }

  // ── Assets JS/CSS/imagens com hash do Vite: Cache First ──
  // Busca APENAS no CACHE_NAME atual (não contamina com caches de outras versões).
  // Assets com hash mudam a cada build — se não estiver no cache, busca da rede.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(event.request, res.clone());
            }
            return res;
          })
          .catch(() => new Response('', { status: 408, statusText: 'Offline' }));
      })
    )
  );
});
