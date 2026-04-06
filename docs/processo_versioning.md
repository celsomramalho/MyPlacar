# MyPlacar — Guia de Atualização de Versão

## Visão Geral

O sistema de versão do MyPlacar tem **dois pontos de verdade** que precisam estar sincronizados:

| # | Onde | Valor |
|---|------|-------|
| 1 | `src/constants.ts` → `APP_VERSION` | Versão embutida no código |
| 2 | Firebase → `system/config` → `appVersion` | Versão oficial publicada |

Quando o Firebase tem uma versão **maior** que a do código rodando no browser do usuário, o app exibe o modal de atualização automaticamente.

---

## Arquivos Envolvidos

### Código-fonte

| Arquivo | Papel |
|---------|-------|
| `src/constants.ts` | Define `APP_VERSION` — fonte primária da versão no código |
| `src/App.tsx` | `handleCheckUpdate()` — compara versão local vs Firebase e exibe modal |
| `src/screens/ProfileScreen.tsx` | Botão manual "Verificar atualização" no perfil do usuário |
| `src/screens/AdminScreen.tsx` | Tela admin onde a versão é salva no Firebase (`system/config.appVersion`) |
| `src/main.tsx` | Registra o Service Worker e escuta mensagem `SW_ACTIVATED` para reload automático |

### Build e Deploy

| Arquivo | Papel |
|---------|-------|
| `vite.config.ts` | Lê `APP_VERSION`, gera `CACHE_NAME`, injeta no SW e no HTML via plugins |
| `public/sw.template.js` | Template do Service Worker — fonte única para o SW de produção e dev |
| `public/registerSW.js` | Substituto do zumbi do `vite-plugin-pwa` — não tem função ativa no app |
| `vercel.json` | Headers HTTP do CDN — garante `no-store` para `sw.js` e `registerSW.js` |

### Firebase

| Caminho | Campos relevantes |
|---------|-------------------|
| `system/config` | `appVersion`, `minVersion`, `deprecatedVersions`, `serviceMovedTo` |

---

## Fluxo Completo de Build

```
1. vite.config.ts lê APP_VERSION de src/constants.ts
         ↓
2. Gera CACHE_NAME = "myplacar-vX.X.X"
         ↓
3. buildStart() → gera public/sw.js (para dev server)
   closeBundle() → gera dist/sw.js (para produção)
   Ambos substituem %%CACHE_NAME%% pelo valor real
         ↓
4. htmlVersionPlugin() → substitui %%APP_VERSION%% no index.html
         ↓
5. dist/ publicado no Vercel
```

---

## Como Atualizar a Versão

### Passo 1 — Atualizar o código

Edite `src/constants.ts`:

```typescript
export const APP_VERSION = 'X.X.X'; // nova versão aqui
```

### Passo 2 — Build, commit e push

```bash
pnpm build
git add .
git commit -m "MyPlacar vX.X.X"
git push
```

O Vercel detecta o push e faz o deploy automaticamente.

### Passo 3 — Atualizar o Firebase

1. Acesse o app com conta **admin**
2. Vá em **Perfil → Admin**
3. No campo **Versão do app**, coloque o mesmo número `X.X.X`
4. Clique em **Salvar**

A partir desse momento todos os usuários com versão anterior receberão o modal de atualização.

---

## Como o App Detecta a Atualização

```
App abre → aguarda 3 segundos
         ↓
handleCheckUpdate() busca system/config no Firebase
         ↓
Compara remoteVersion > localVersion?
         ↓
Sim → exibe modal "Nova versão disponível"
         ↓
Usuário confirma → desregistra SW → limpa caches → reload com ?v=X.X.X
         ↓
SW novo instala assets com cache: 'no-store' (sempre da rede)
         ↓
SW novo ativa → envia SW_ACTIVATED para a aba
         ↓
main.tsx recebe → window.location.reload()
         ↓
App carrega com bundle e versão novos ✅
```

---

## Como o Service Worker Funciona

O SW usa estratégias diferentes por tipo de recurso:

| Recurso | Estratégia | Motivo |
|---------|------------|--------|
| `index.html` / navegação | **Network First** com `cache: 'no-store'` | Sempre busca o HTML mais recente |
| `/assets/*.js` `/assets/*.css` | **Cache First** (só no `CACHE_NAME` atual) | Assets com hash — imutáveis por versão |
| Firebase / googleapis | **Sem interceptação** | Dados em tempo real |

### Ciclo de vida do SW por versão

- **Install** — baixa todos os assets do zero com `cache: 'no-store'`
- **Activate** — deleta todos os caches antigos, assume controle das abas, notifica via `SW_ACTIVATED`
- **Fetch** — serve do cache ou rede conforme a tabela acima

---

## Variáveis de Ambiente (Vercel)

Duas variáveis de ambiente estão configuradas no projeto Vercel. Anote-as antes de qualquer operação que envolva deletar e recriar o projeto.

---

## Problemas Conhecidos e Soluções

### "Versão antiga aparece após deploy"

**Causa mais comum:** Service Worker antigo ainda ativo no browser.

**Solução no DevTools (Chrome):**
1. F12 → Application → Service Workers
2. Clique em **Unregister**
3. F12 → Application → Storage → **Clear site data**
4. Recarregue a página

### "CDN do Vercel servindo arquivo antigo"

**Sintoma:** `age: XXXXX` alto nos headers, `content-length` diferente do esperado.

**Solução:** Deletar e recriar o projeto no Vercel. O plano gratuito não tem "Purge Cache" manual.

### "Build falha com ERR_PNPM_OUTDATED_LOCKFILE"

**Causa:** `package.json` foi modificado sem atualizar o lockfile.

**Solução:**
```bash
pnpm install
git add pnpm-lock.yaml
git commit -m "update lockfile"
git push
```

### "sw.js não aparece em public/ após clonar o repo"

**Esperado** — `public/sw.js` está no `.gitignore`. Ele é gerado automaticamente pelo `vite.config.ts` ao rodar `pnpm dev` ou `pnpm build`.

---

## Histórico do Problema Original (Abril 2025)

O sistema de versão não funcionava em produção por uma combinação de fatores:

1. **`public/sw.js` commitado** com `CACHE_NAME = self.__CACHE_NAME__ || 'myplacar-fallback'` — o fallback nunca mudava entre versões
2. **`vercel.json` com rewrite genérico** `(.*)→index.html` que interceptava `/sw.js` e servia HTML no lugar do JavaScript
3. **`vite-plugin-pwa` zumbi** — o plugin foi removido do código mas deixou `registerSW.js` + SW do Workbox no CDN do Vercel, que interceptavam todos os assets e entregavam o bundle antigo do cache indefinidamente

**Correções aplicadas:**
- `public/sw.js` adicionado ao `.gitignore`
- `vite.config.ts` gera `sw.js` em `buildStart()` (dev) e `closeBundle()` (build)
- `vercel.json` com exclusões explícitas no rewrite para `sw.js`, `registerSW.js`, `manifest.json` e `assets/`
- `sw.template.js` reescrito com `cache: 'no-store'` no install e `caches.open(CACHE_NAME)` no fetch
- `vite-plugin-pwa` removido do `package.json`
- Projeto Vercel recriado para limpar o CDN
