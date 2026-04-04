const CACHE_NAME = 'myplacar-v2.5.12';

// Assets essenciais que sempre devem estar em cache
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Página de fallback exibida quando não há cache E não há rede,
// evitando que o browser mostre a tela de erro nativa do sistema.
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
// Mantém compatibilidade com o sinal do app, mas o SW já faz skipWaiting
// automaticamente no install para garantir ativação imediata após deploy.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── INSTALL ────────────────────────────────────────────────────────────────
// 1. Cacheia os arquivos essenciais.
// 2. Descobre e cacheia todos os assets JS/CSS gerados pelo Vite (com hash).
// 3. Chama skipWaiting() imediatamente para que o novo SW assuma sem esperar
//    o usuário fechar todas as abas — evita ficar preso em "waiting".
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Arquivos essenciais conhecidos
      await cache.addAll(PRECACHE_URLS);

      // 2. Extrai e cacheia assets do Vite dinamicamente
      try {
        const response = await fetch('/index.html');
        const html = await response.text();

        const assetRegex = /(?:src|href)=["'](\/?assets\/[^"']+)["']/g;
        const assetUrls = new Set();
        let match;
        while ((match = assetRegex.exec(html)) !== null) {
          assetUrls.add(match[1].startsWith('/') ? match[1] : '/' + match[1]);
        }

        const fetchPromises = [...assetUrls].map(url =>
          fetch(url)
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        );
        await Promise.all(fetchPromises);
        console.log(`Myplacar SW: ${assetUrls.size} assets cacheados.`);
      } catch (e) {
        console.warn('Myplacar SW: Não foi possível pré-cachear assets.', e);
      }
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ───────────────────────────────────────────────────────────────
// Remove caches de versões antigas e assume o controle de todas as abas.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignora tráfego de desenvolvimento
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // Nunca cachear Firebase / Firestore / Auth / EmailJS
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('emailjs')
  ) return;

  // Probe de conectividade do AuthScreen — deixa passar sem cache
  if (url.pathname === '/manifest.json' &&
      event.request.cache === 'no-store') return;

  // ── Navegação (index.html / SPA routes): Network-first com fallback seguro ──
  // Tenta a rede primeiro; se falhar entrega o cache; se não houver cache,
  // exibe a página offline embutida (evita tela de erro nativa do browser).
  if (
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  ) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) =>
              cached ||
              caches.match('/index.html') ||
              new Response(OFFLINE_FALLBACK, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            )
        )
    );
    return;
  }

  // ── Assets JS/CSS/imagens: Cache First ──
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => new Response('', { status: 408, statusText: 'Offline' }));
    })
  );
});
