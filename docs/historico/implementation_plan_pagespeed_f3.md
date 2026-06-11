# Plano de Ação — Rodada 3 (Desempenho Mobile 75 → 90+)

Este plano visa resolver o bottleneck de **FCP (First Contentful Paint)** e **LCP (Largest Contentful Paint)** sob conexões móveis lentas. 

Faremos isso eliminando completamente todas as importações estáticas do **Firebase Firestore** e **Firestore Lite** da árvore crítica de renderização inicial do app (startup), mudando para carregamento sob demanda (dynamic imports) e carregamento de fontes assíncronas.

---

## 🛠️ Passo a Passo de Implementação

### Passo 1: Carregamento de Fontes Assíncrono (FCP)
* **Objetivo:** Impedir que o CSS pesado de fontes `/fonts.css` bloqueie a renderização inicial do loader (`#app-loader`).
* **Arquivo:** `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\index.html`
* **Lógica:** Alterar a tag `<link rel="stylesheet" href="/fonts.css">` na `<head>` para carregar sem bloquear o primeiro paint da tela (usando o truque de troca de mídia no `onload`).

---

### Passo 2: Adiamento do Firestore Lite no Ícone de Esportes
* **Objetivo:** Evitar o carregamento estático do SDK lite de Firestore ao renderizar o app.
* **Arquivo:** `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\components\LazySportIcon.tsx`
* **Lógica:** Substituir as importações estáticas do topo de `firebase/firestore/lite` e `getDbLite` por `await import()` dinâmicos dentro do método assíncrono `loadIcon`.

---

### Passo 3: Adiamento de Firestore no Contexto Principal (`GameContext.tsx`)
* **Objetivo:** Retirar as chamadas de banco de dados do caminho crítico do `GameProvider` (que roda no topo do app).
* **Arquivo:** `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
* **Lógica:** Remover `import { ... } from 'firebase/firestore'` do topo. Substituir por `const { doc, setDoc, ... } = await import('firebase/firestore')` sob demanda em cada um dos callbacks de ação (`handleSaveProfile`, `finalizeMatchInternal`, `handleLeaveLive`, `handleCloseCloudLive`, `handleControlLive`, `handleObserveLive`, `handleSyncScoreboard`).

---

### Passo 4: Adiamento de Firestore no Contexto de Transmissão (`LiveContext.tsx`)
* **Objetivo:** Desacoplar o Firestore do `LiveProvider`.
* **Arquivo:** `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
* **Lógica:** Remover importações estáticas do topo. Dynamic import de `firebase/firestore` dentro do método de saída segura `performExit`.

---

### Passo 5: Criar Wrapper de Sincronização e Lazy Load (`LiveSyncManager.tsx`)
* **Objetivo:** Evitar baixar e compilar as mais de 1000 linhas de lógica de sincronização (`useLiveFirestoreSync.tsx`) e suas dezenas de conexões com Firestore no primeiro frame de visualização.
* **Novo Arquivo [NEW]:** `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\app\LiveSyncManager.tsx`
  * **Lógica:** Criar um componente wrapper puro que apenas executa o hook `useLiveFirestoreSync` e retorna `null`.
* **Arquivo de Modificação [MODIFY]:** `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\App.tsx`
  * **Lógica:** Importar o `<LiveSyncManager />` usando `React.lazy`. Renderizá-lo condicionalmente envolto em `<React.Suspense fallback={null}>` **somente se** o usuário estiver logado (`userProfile.pin !== ""`) ou na tela de visitante público (`currentScreen === 'public-scoreboard'`).

---

### Passo 6: Ajustar os Hooks Globais Auxiliares para Dynamic Import
* **Objetivo:** Limpar a árvore estática do `AppContent`. Em cada hook, remover importações estáticas de Firestore do topo e inseri-las dinamicamente apenas nos efeitos/callbacks que dependem de rede:
  1. `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useAppConfig.ts` *(import dinâmico no onSnapshot do snap e no getDoc de check-update)*
  2. `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useAppLogout.tsx` *(import dinâmico no callback de limpar live ao deslogar)*
  3. `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useAppStartup.ts` *(import dinâmico no setDoc de sincronizar fila)*
  4. `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useHistoryCloud.ts` *(import dinâmico ao rodar batch sync/download)*
  5. `c:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useTournamentSession.tsx` *(import dinâmico ao obter inscrições do usuário)*

---

## 🧪 Plano de Verificação

### 1. Compilação e Build
Executaremos a compilação de produção para verificar:
```bash
pnpm build
```
O build deve gerar os chunks perfeitamente separados e nos mostrará a redução drástica de tamanho nos feixes estáticos principais (especialmente no bundle `index.js` inicial e no vendor crítico).

### 2. Validação TypeScript e Linter
Garantir total ausência de erros de tipagem estática e linting causados pelo uso de imports dinâmicos assíncronos:
```bash
pnpm lint
```

---

## 📈 Impacto Mobile Esperado
* **FCP:** ~1.2s (Desbloqueio de CSS)
* **LCP:** ~2.1s (Bundle inicial >60% menor no celular)
* **Desempenho Mobile Lighthouse:** ~92+
