// Este arquivo substitui o registerSW.js gerado pelo vite-plugin-pwa (Workbox)
// que ficou como zumbi em deploys anteriores.
// O registro real do SW é feito em src/main.tsx.
// Este arquivo existe apenas para sobrescrever o zumbi no CDN do Vercel.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => {
      // Desregistra qualquer SW do Workbox/vite-plugin-pwa antigo
      if (r.active?.scriptURL?.includes('sw.js') || r.active?.scriptURL?.includes('workbox')) {
        r.unregister();
      }
    });
  });
}
