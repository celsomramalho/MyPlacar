# Quickstart — Instalação e execução local

Requisitos
- Node.js (LTS recomendado)
- npm ou pnpm (o repositório contém package.json)
- Conta no Firebase (para testes com Firestore)
- (Opcional) Capacitor instalado globalmente para builds mobile

Clonar o repositório
```bash
git clone https://github.com/celsomramalho/MyPlacar.git
cd MyPlacar
```

Instalar dependências
```bash
# npm
npm install

# ou pnpm
pnpm install
```

Variáveis de ambiente
- Verifique firebase.ts para quais variáveis são usadas. Normalmente você precisa de:
  - FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID
- Para testes locais, crie um arquivo `.env.local` na raiz com:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
(Os nomes exatos podem variar conforme `firebase.ts` — confirme o prefixo VITE_ no código.)

Executar em modo desenvolvimento (web)
```bash
npm run dev
# ou
pnpm dev
```
O Vite hospeda localmente (por padrão em http://localhost:5173).

Build para produção (web)
```bash
npm run build
# ou
pnpm build
```

Rodando como PWA / testes do service worker
- Após build, sirva a pasta `dist` (ou use Vercel/Firebase Hosting).
- Para testar service worker localmente, use um servidor HTTPS ou Vite com suporte (consulte docs do Vite).

Build mobile (Capacitor) — resumo
1. `npm run build`
2. `npx cap add android` / `npx cap add ios` (se ainda não tiver adicionado)
3. `npx cap sync`
4. Abrir projeto no Android Studio / Xcode e buildar.

Observações
- Antes de fazer deploy que usa Firestore em produção, valide `firestore.rules` e `firestore.indexes.json`.