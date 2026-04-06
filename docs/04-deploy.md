# Deploy

Opções de deploy suportadas
- Vercel (recomendado para a versão web)
- Firebase Hosting
- Builds mobile via Capacitor (Android / iOS)

Deploy para Vercel
1. Conectar repositório no Vercel.
2. Configurar variáveis de ambiente no painel do Vercel (mesmos nomes do `.env.local`).
3. Deploy automático a cada push na branch main.

Deploy para Firebase Hosting
1. Conectar com `firebase init` e escolher hosting.
2. Configurar `public` para a pasta gerada pelo build (ex.: dist).
3. `firebase deploy --only hosting`

Build mobile com Capacitor
1. `npm run build`
2. `npx cap sync`
3. Abrir projeto com Android Studio / Xcode e publicar via lojas (configurar keystore / certificados).

Notas
- Verifique performance e caching: service worker está em `sw.js`.
- Adicionar badges de CI (se houver) no README após configurar pipelines.