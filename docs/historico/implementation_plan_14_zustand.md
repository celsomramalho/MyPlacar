# Passo 14 — Store central (Zustand) — Plano de trabalho

> **Branch sugerida:** `refactor/zustand` (ou continuar em `refactor/dependency-cruiser`)  
> **Pré-requisitos:** Passo 13 ✅ · Passo 15 Item 3 + 3.5 ✅ · [BARREL_AUDIT.md](../docs/BARREL_AUDIT.md) ✅  
> **Como usar:** um sub-passo por PR/commit; após cada um: `pnpm test` → `pnpm lint` → `pnpm depcruise`

---

## 1. Objetivo e o que **não** é este passo

### Objetivo

Introduzir **Zustand** para estado global que hoje está espalhado entre:

- hooks transversais em `src/hooks/` (`useTournamentSession`, `useDeepLinkScreen`, `useRemoteCloudMatch`, …)
- props drilling `App.tsx` → `AppScreenRouter`
- acoplamento indireto Game ↔ Live via `GameLivePropsSync`

### O que **não** fazer no Passo 14 (risco alto)

| Tentativa | Por que evitar agora |
|-----------|---------------------|
| Substituir `GameContext.tsx` (~1.200 ln) de uma vez | Handlers, Firestore, undo, histórico — tudo acoplado ao Provider |
| Remover `GameProvider` / `LiveProvider` / `UIProvider` no final do passo | Quebra 50+ consumidores `useGame()` / `useLive()` / `useUI()` |
| Unificar Game + Live num único store sem desenho | Ciclo **Game ↔ Live** exige `gameState` no Live e `useLive()` no Game |
| Mover `gameState` / placar para Zustand na primeira PR | Maior superfície de regressão (live, espelhamento, undo) |

**Estratégia:** Zustand entra **por fatias**, com **adaptadores** nos Contexts existentes até a borda consumir o store diretamente.

---

## 2. Diagnóstico do estado hoje (2026-05-22)

```text
App.tsx (135 ln)
  └── UIProvider
        └── GameLiveProviderStack
              ├── LiveProvider  ← recebe userProfile, gameState via GameLivePropsSync
              └── GameProvider  ← useLive() interno; ~1.200 ln de handlers
                    └── AppContent → hooks transversais → AppScreenRouter
```

| Fonte de estado | Onde vive | Consumidores | Candidato Zustand? |
|-----------------|-----------|--------------|-------------------|
| Partida ativa, undo, handlers | `GameContext` | Telas, rotas, hooks | Fase 14.4+ (adaptador) |
| Live, controllers, papéis | `LiveContext` | Scoreboard, hooks live | Fase 14.5+ (após game estável) |
| Navegação, modal, juiz, fila | `UIContext` | Router, telas | Fase 14.3 opcional |
| Torneio ativo, inscrições | `useTournamentSession` | App → Router → Settings | **Fase 14.1** ✅ ideal |
| Deep link / espectador | `useDeepLinkScreen` | App → Router | **Fase 14.2** ✅ ideal |
| Partida remota convite | `useRemoteCloudMatch` | App → GlobalOverlays | **Fase 14.2** |
| Offline mode | `useAppOfflineMode` | App → rotas | **Fase 14.2** (slice `app`) |
| Perfil, partners, settings | `GameContext` + localStorage | Quase tudo | Fase 14.4 (parcial) |

**Dependência instalada:** Zustand **ainda não** está no `package.json` — Sub-passo 14.0 obrigatório.

---

## 3. Arquitetura alvo (incremental)

```text
src/store/
├── index.ts                 # re-export público (opcional, só borda)
├── tournamentStore.ts       # 14.1 — activeEvent, registeredEvents, userEntryDate
├── appShellStore.ts         # 14.2 — spectator, remote match, offline
├── gameStore.ts             # 14.4 — userProfile, matchSettings, partners (sem handlers)
└── liveStore.ts             # 14.5 — activeLives, cloudLiveExists (opcional / futuro)
```

**Regras de import (iguais aos barrels):**

- `src/store/*` **não** importa `App.tsx`
- Módulos `services/` importam `@modules/*/types`, não store (salvo migração explícita documentada)
- Store pode importar `@modules/*/types`, `@infra/firebase/client`, `src/types`
- Contexts podem importar store; store **não** importa `GameContext` (evitar ciclo)

**Padrão de migração (adaptador):**

```ts
// GameContext (fase 14.4): estado lido/escrito via gameStore.getState()
const [userProfile, setUserProfile] = useStore(gameStore, s => [s.userProfile, s.setUserProfile]);
// OU setter único no store e GameContext só expõe handlers que chamam getState()
```

`useGame()` permanece com a **mesma interface** (`GameContextValue`) até Fase 14.7 (deprecação opcional).

---

## 4. Ordem de execução (menor → maior risco)

```text
14.0 Instalar Zustand + pasta store + doc
  → 14.1 tournamentStore + migrar useTournamentSession
  → 14.2 appShellStore + migrar deep link / remote / offline
  → 14.3 (opcional) uiStore OU manter UIContext
  → 14.4 gameStore parcial + adaptador em GameContext (perfil/settings/partners)
  → 14.5 liveStore parcial (avaliar após 14.4)
  → 14.6 Remover props drilling App → Router (torneio/spectator já no store)
  → 14.7 (opcional) useGame/useLive finos sobre store
```

---

## Sub-passo 14.0 — Preparação ⏳

**Objetivo:** dependência e esqueleto sem mudar comportamento.

| Tarefa | Detalhe |
|--------|---------|
| Instalar | `pnpm add zustand` (versão estável 5.x) |
| Criar | `src/store/README.md` — regras de import + diagrama |
| Criar | `src/store/tournamentStore.ts` vazio com tipos + `create()` stub |
| Atualizar | `docs/ARCHITECTURE.md` — seção “Store (Zustand)” |
| Atualizar | `docs/refatoracao_dependency-cruiser.md` — link para este plano |

**Verificação:** `pnpm test` · `pnpm lint` · `pnpm depcruise` (0 violações)

---

## Sub-passo 14.1 — `tournamentStore` ⏳

**Origem:** `src/hooks/useTournamentSession.tsx` (~170 ln)

**Estado a mover:**

| Campo | Persistência |
|-------|----------------|
| `activeEvent` | `localStorage` `myPlacarActiveEvent` |
| `registeredEvents` | `localStorage` `myPlacarRegisteredEvents` |
| `userEntryDate` | derivado Firestore (`getActiveEventEntryDate`) |

**Ações no store:**

- `setActiveEvent`, `setRegisteredEvents`, `clearTournamentSession`
- `joinTournament`, `exitTournament`, `selectEvent` (lógica hoje no hook)
- `fetchUserRegistrations(email)` — side effect async

**Hook após migração:**

```ts
// useTournamentSession.ts — fino, só selectors + efeitos de bootstrap
export function useTournamentSession() {
  const activeEvent = useTournamentStore(s => s.activeEvent);
  // ...
  return { activeEvent, handleJoinTournament, ... };
}
```

**App.tsx / AppScreenRouter:**

- Remover props `activeEvent`, `registeredEvents`, `handleJoinTournament`, … do Router quando consumidores usarem `useTournamentStore` diretamente **ou** manter hook como fachada (menor diff na 14.1).

**Recomendação 14.1:** manter `useTournamentSession()` como API pública; implementação lê o store (zero mudança em `AppScreenRouter`).

**Verificação manual:** join torneio por PIN, sair, persistência após reload.

---

## Sub-passo 14.2 — `appShellStore` ⏳

**Origem:** três hooks em `src/hooks/`

| Hook | Estado |
|------|--------|
| `useDeepLinkScreen` | `spectatorMatchId`, `spectatorPin`, efeitos URL |
| `useRemoteCloudMatch` | `activeCloudMatch` |
| `useAppOfflineMode` | `isOfflineMode` |

**Store:** `src/store/appShellStore.ts`

**Hook fino** ou consumo direto em `AppContent` / `GlobalOverlays`.

**Cuidado:** `useRemoteCloudMatch` chama `setGameState` / `setMatchSettings` — store **orquestra** chamando funções injetadas ou importando ações de `gameStore` (só após 14.4). Na 14.2, injetar callbacks do `useGame()` no hook wrapper (sem ciclo store→context).

```ts
// Padrão 14.2 — evitar gameStore antes de existir
useRemoteCloudMatch({ setGameState, setMatchSettings, setCurrentScreen });
```

**Verificação manual:** banner partida remota, modo offline, link espectador/placar público.

---

## Sub-passo 14.3 — `uiStore` (opcional) ⏳

**Só fazer se** quiser reduzir `UIProvider` ou props de navegação.

| Campo UIContext | Migrar? |
|----------------|---------|
| `currentScreen`, `setCurrentScreen` | Sim (alto impacto) |
| `modalConfig` | Sim |
| `playerQueue`, flags settings/juiz | Avaliar — muitos `useEffect` no UIContext |

**Alternativa recomendada:** **adiar 14.3** e manter `UIContext` até game/live estarem no store.

---

## Sub-passo 14.4 — `gameStore` parcial + adaptador ⏳

**Escopo mínimo do store (sem handlers de placar):**

- `userProfile` + `setUserProfile`
- `matchSettings` + `setMatchSettings` (+ persist localStorage no middleware ou subscribe)
- `partners` + `setPartners`
- `matchHistory` + `persistHistory` (refs espelho: manter no Context **ou** `store + refs` documentados)

**Fora do store nesta fase:** `gameState`, `historyStack`, todos os `handleScore*` / `handleUndo` / live sync internos.

**GameContext vira:**

1. `useGame()` lê estado estável do `gameStore`
2. Handlers permanecem no Context (chamam `getState()` + lógica atual)
3. `useEffect` de persistência LS migram para `subscribe` no store ou ficam no Context

**Métrica de sucesso:** `GameContext.tsx` reduz ~100–200 ln de `useState` inicial; **zero** mudança em assinatura `GameContextValue`.

---

## Sub-passo 14.5 — `liveStore` parcial (opcional) ⏳

**Pré-requisito:** 14.4 estável.

- Mover `activeLives`, `cloudLiveExists`, `liveLogs` para store
- `LiveContext` mantém refs de timer e `resolveTargetPin`
- Avaliar se `GameLivePropsSync` pode ler `gameState` do `gameStore` em vez de feed React

**Risco:** listeners Firestore em `useLiveFirestoreSync` + `LiveContext` — testar live multi-dispositivo.

---

## Sub-passo 14.6 — Limpar `AppScreenRouterProps` ⏳

Remover props que viraram store/hook interno:

- Torneio (se rotas usam `useTournamentSession` / store)
- Spectator / remote / offline (se `appShellStore`)

**Meta:** `AppScreenRouterProps` ≤ 15 campos (só config/auth/history cloud que ainda vivem em hooks App).

---

## Sub-passo 14.7 — Deprecação gradual (opcional, pós-14.6)

- Documentar `useGame()` como fachada sobre `gameStore` + handlers
- Novos componentes: `useGameStore(selector)` direto
- Não remover Context até 100% dos consumidores migrados

---

## 5. Impacto no grafo (depcruise)

| Risco | Mitigação |
|-------|-----------|
| `store` órfão | Todo store exportado via hook ou `index.ts` usado em App/hooks |
| `store` → `App.tsx` | Proibido; regra manual + revisão |
| Ciclo store ↔ GameContext | Store = dados; Context = handlers que leem `getState()` |
| Ciclo store ↔ Live | Live store não importa game store; selectors combinados na UI |

Após 14.0, rodar `pnpm depcruise` e, se necessário, regra opcional em `.dependency-cruiser.cjs`:

```js
// Exemplo futuro: store-not-to-modules-screens (opcional)
```

---

## 6. Métricas de sucesso do Passo 14

| Métrica | Antes | Meta (14.6) |
|---------|-------|-------------|
| Zustand instalado | Não | Sim |
| `useTournamentSession` | `useState` local | `tournamentStore` |
| Props torneio no Router | ~6 | 0 (via hook/store) |
| `GameContext.tsx` | ~1.230 ln | ≤ ~1.050 ln (14.4) |
| `pnpm test` | 64/64 | 64/64 |
| `pnpm depcruise` | 0 | 0 |
| Regressão live/placar | — | Teste manual checklist abaixo |

---

## 7. Checklist de teste manual (após cada sub-passo)

```text
[ ] Login / logout
[ ] Nova partida + placar + undo
[ ] Live: iniciar, espelhar, segundo dispositivo, encerrar
[ ] Torneio: join PIN, detalhe evento, sair
[ ] Histórico: sync/download/delete
[ ] Deep link: viewPin / viewMatch espectador
[ ] Banner partida remota (activeCloudMatch)
[ ] Modo offline
[ ] Atualização de versão / service interrupted
```

---

## 8. Estimativa de esforço

| Sub-passo | Esforço | PRs sugeridas |
|-----------|---------|---------------|
| 14.0 | 0,5 h | 1 |
| 14.1 | 2–3 h | 1 |
| 14.2 | 2–3 h | 1 |
| 14.3 | 4–6 h | 1 (opcional) |
| 14.4 | 1–2 dias | 2–3 |
| 14.5 | 1 dia | 1–2 (opcional) |
| 14.6 | 2 h | 1 |
| 14.7 | contínuo | — |

**MVP do Passo 14 (recomendado para valor rápido):** 14.0 + 14.1 + 14.2 + validação → **parar e avaliar** antes de 14.4.

---

## 9. Próximo passo físico

**Sub-passo 14.0:** instalar `zustand`, criar `src/store/` com README, atualizar docs, CI verde.

Ao concluir 14.0–14.2, marcar no [refatoracao_dependency-cruiser.md](../docs/refatoracao_dependency-cruiser.md):

```text
[/] Passo 14 — Zustand (14.0–14.2 MVP em andamento)
```

---

*Plano de implementação — Passo 14 do roteiro `refatoracao_dependency-cruiser.md`.*  
*Última atualização: 2026-05-22 — criado após barrel audit; Zustand ainda não instalado.*
