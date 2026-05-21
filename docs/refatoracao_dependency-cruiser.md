# Refatoração dependency-cruiser — MyPlacar

> **Branch:** `refactor/dependency-cruiser`  
> **Última atualização:** 2026-05-21  
> **Como usar:** passos 1–13 concluídos (depcruise + CI + arquitetura) ✅. Passos 14–15 opcionais.

---

## 1. Situação atual

| Métrica | Baseline (`docs/report.html`) | Agora (`pnpm depcruise`) |
|--------|-------------------------------|---------------------------|
| Violações totais | 81 | **0** |
| `no-circular` | 75 | **0** |
| `no-orphans` | 6 | **0** |
| Testes | 48 | **64** |
| `src/types.ts` importa módulos? | Sim (4 re-exports) | **Não** |

**Objetivo desta refatoração:** eliminar dependências circulares sem quebrar o app.  
**Status:** depcruise **limpo** + CI + [ARCHITECTURE.md](./ARCHITECTURE.md). **Passo 13:** Fases 1–6 ✅ ([APP_LOGIC_INVENTORY.md](./APP_LOGIC_INVENTORY.md)). Passos 14–15 opcionais.

---

## 2. Roteiro completo (visão geral)

```text
── CONCLUÍDO ──────────────────────────────────────────────────
Passo 1   Preparação (branch + baseline)
Passo 2   Rede de segurança (testes — Opção A)
Passo 3   Limpar src/types.ts (re-exports)
Passo 4   Atualizar imports de tipos nos consumidores
Passo 5   History + Firebase (imports diretos)
Passo 6   Game + Partners + Events + UI (barrels críticos)
Passo 7   Scripts depcruise no package.json
Passo 8   Validar (test + lint + depcruise)
Passo 9   Resolver 6 módulos órfãos
Passo 10  Regras no .dependency-cruiser.cjs
Passo 11  CI (lint + test + depcruise no PR)
Passo 12  Documentar arquitetura (ARCHITECTURE.md)
Passo 13  Refatorar app.tsx (hooks) — Fases 1–7 ✅

── OPCIONAL (após Passo 13) ─────────────────────────────────
Passo 14  Store central (Zustand)
Passo 15  Reorganizar pastas DDD + barrels “públicos” seguros
```

---

## 3. Regras de ouro (válidas daqui pra frente)

1. **`src/types.ts` nunca** faz `import` nem `export … from` de `src/modules/*` ou `@modules/*`.
2. **Tipos de domínio** vivem em `src/modules/<módulo>/types.ts` e são importados de lá (ou do `index` só na UI/App).
3. **Entre módulos acoplados** (game ↔ partners ↔ events ↔ history ↔ infra), prefira:
   - tipos → `@modules/<módulo>/types`
   - serviços → `@modules/<módulo>/services/<arquivo>`
   - hooks → `@modules/<módulo>/useGame.ts` (ou arquivo concreto)
   - evite `@modules/<módulo>` (barrel `index.ts`) no **meio** de uma cadeia que já deu ciclo
4. **Infra:** preferir `@infra/firebase/matches`, `@infra/firebase/client` em vez de `@infra/firebase` quando o barrel puxar history/game.
5. **Após cada passo:** `pnpm test` → `pnpm lint` → `pnpm depcruise` (usa [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs)).

**Comandos:**

```bash
pnpm test
pnpm lint
pnpm depcruise              # saída resumida no terminal
pnpm depcruise:report       # gera HTML (cuidado: sobrescreve docs/report.html)
```

> Use `pnpm depcruise`, não o pacote npm `depcruise` (é placeholder). O binário real é `dependency-cruiser`.

---

# Parte A — Passos já executados (1 a 8)

Marque mentalmente como referência; **não é necessário repetir**, exceto se abrir um novo branch.

---

## Passo 1 — Preparação

**Objetivo:** ter baseline e branch isolada.

- [x] Criar branch `refactor/dependency-cruiser`
- [x] Gerar relatório baseline: `docs/report.html` (81 violações: 75 circulares + 6 órfãos)
- [x] Entender o ciclo típico:

```text
types.ts → auth → firebase → history → game → utils → types.ts
```

**Verificação:** `docs/report.html` existe; branch ativa.

---

## Passo 2 — Testes antes da refatoração (Opção A)

**Objetivo:** rede de segurança nos engines de placar antes de mexer em tipos/imports.

- [x] Manter testes existentes: `tennisEngine`, `sportEngine`, `sanitize`
- [x] Adicionar:
  - `tests/regression/pickleballEngine.test.ts`
  - `tests/regression/scoreEngine.test.ts`
  - `tests/regression/validation.test.ts`
- [x] Helper: `tests/helpers/gameStateFactory.ts` (inclui `createPickleballState`)

**Verificação:** `pnpm test` → 64 testes passando.

> **Nota de ordem:** no roteiro antigo por “semanas”, testes eram Fase 6. Você escolheu Opção A (testes primeiro) — foi a decisão correta.

---

## Passo 3 — Limpar `src/types.ts`

**Objetivo:** remover o hub que puxava módulos para dentro do arquivo global.

**Removido de `src/types.ts`:**

| Linha (antes) | Ação |
|---------------|------|
| `import` / `export ScoringEngine` de `./utils/sportEngine` | Removido; `Match.scoringEngine` usa `'tennis' \| 'pickleball'` inline |
| `export { PlanType, UserProfile } from '@modules/auth'` | Removido |
| `export { … } from './modules/events/types'` | Removido |
| `export { MatchHistoryItem } from './modules/history/types'` | Removido |

**Estado atual:** `src/types.ts` só declara tipos globais (`GameState`, `MatchSettings`, `Screen`, live, etc.) — **zero** imports de outros arquivos.

**Efeito no depcruise:** 81 → **~53** violações (`docs/depcruise-after-2.1.txt`).

**Verificação:**

```bash
# Não deve retornar linhas em src/types.ts
rg "^import|^export.*from" src/types.ts
pnpm lint && pnpm test
```

---

## Passo 4 — Atualizar consumidores dos tipos removidos

**Objetivo:** cada tipo voltar ao módulo de origem nos `import`.

| Tipo | Importar de |
|------|-------------|
| `UserProfile`, `PlanType` | `@modules/auth` ou `@modules/auth/types` |
| `TournamentEvent`, `EventRegistration`, … | `@modules/events` ou `@modules/events/types` |
| `MatchHistoryItem` | `@modules/history/types` |
| `ScoringEngine` (se precisar) | `src/utils/sportEngine` |

**Arquivos principais alterados:** `App.tsx`, `ProfileScreen`, `HelpScreen`, `TeamSection`, `NewGameScreen`, `AdminScreen`, `CommunicationsPanel`, `createHistoryItem`, `createSelfPartner`, `EventDetailScreen`, etc.

**Verificação:** `pnpm lint` sem erros de tipo exportado.

---

## Passo 5 — History + Firebase (imports diretos)

**Objetivo:** quebrar ciclo `firebase/index → history/index → LocationScreen → game`.

| Antes | Depois |
|-------|--------|
| `firebase/matches.ts` importa `@modules/history` | `@modules/history/types` |
| `supabase/matches.ts` idem | `@modules/history/types` |
| `App.tsx` importa barrel `@modules/history` | Caminhos: `screens/LocationScreen`, `services/historySync`, etc. |
| `GameContext` importa `createHistoryItem` do barrel | `@modules/history/services/createHistoryItem` |
| `LocationScreen` → `@infra/firebase` | `@infra/firebase/client` + `@infra/firebase/matches` |
| `historySync` → `@infra/firebase` | `@infra/firebase/matches` |

**Efeito no depcruise:** ~53 → **~19** violações (`docs/depcruise-after-2.2.txt`).

**Verificação:** `pnpm depcruise` — queda forte de `no-circular`; `pnpm test`.

---

## Passo 6 — Game + Partners + Events + UI (barrels críticos)

**Objetivo:** eliminar ciclos `game ↔ partners ↔ events` via `index.ts`.

| Antes | Depois |
|-------|--------|
| `game/types.ts` → `@modules/partners`, `@modules/events` | `@modules/partners/types`, `@modules/events/types` |
| `GameContext` → barrels partners/events/ui/live | `partners/services/*`, `events/services/updateTournamentMatchProgress`, `UIContext`, `useLive.ts` |
| `PartnersScreen` → `@modules/partners` + `@modules/game` | `../services/*` + `@modules/game/useGame` |
| `EventDetailScreen` → `Partner` do barrel | `@modules/partners/types` |
| `UIContext` / `ui/types` → `../partners` | `@modules/partners/types` |

**Efeito no depcruise:** ~19 → **6** violações (0 circulares) — `docs/depcruise-current.txt`.

**Verificação:** `pnpm depcruise` → apenas `no-orphans` (6).

---

## Passo 7 — Scripts no `package.json`

- [x] `"depcruise": "dependency-cruiser src --include-only \"^src\" --output-type err"`
- [x] `"depcruise:report": "dependency-cruiser src --include-only \"^src\" -o docs/report.html"`

---

## Passo 8 — Validação final desta etapa

- [x] `pnpm test` — 64/64
- [x] `pnpm lint` — OK
- [x] `pnpm depcruise` — 0 circulares, 6 órfãos

**Relatórios guardados:**

| Arquivo | Violações |
|---------|-----------|
| `docs/report.html` | 81 (baseline) |
| `docs/depcruise-after-2.1.txt` | ~53 |
| `docs/depcruise-after-2.2.txt` | ~19 |
| `docs/depcruise-current.txt` | 6 |

---

# Parte B — Próximos passos (9 em diante)

Execute **um passo por vez**; rode a verificação antes do próximo.

---

## Passo 9 — Resolver os 6 módulos órfãos ✅

**Objetivo:** `pnpm depcruise` → **0** violações.

**Decisão (2026-05-18):** todos eram placeholders `export {}` nunca importados. Funcionalidade real já em `src/screens/*`. **Removidos** (ver `docs/DELETED_MODULES.md`):

- `src/routes/index.ts`
- `src/modules/teams/index.ts`
- `src/modules/spectator/index.ts`
- `src/modules/scoreBoard/index.ts`
- `src/modules/communications/index.ts`
- `src/modules/admin/index.ts`

**Verificação:**

```bash
pnpm test    # 64/64
pnpm lint    # OK
pnpm depcruise
# ✔ no dependency violations found (140 modules, 403 dependencies cruised)
```

---

## Passo 10 — Regras no `.dependency-cruiser.cjs` ✅

**Objetivo:** impedir regressão (especialmente `types.ts` → módulos).

**Arquivo:** [`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) (config oficial do `dependency-cruiser init`, estendido nesta branch).

**Alterações:**

| Regra | Severidade | Função |
|-------|------------|--------|
| `no-circular` | `error` (era `warn`) | Bloqueia ciclos |
| `no-orphans` | `error` (era `warn`) | Bloqueia módulos mortos |
| `types-ts-no-domain-imports` | `error` | `src/types.ts` → proibido `src/modules/*` e `src/infrastructure/*` |
| `modules-not-to-app` | `error` | `src/modules/*` → proibido `App.tsx` |
| `infra-not-to-app` | `error` | `src/infrastructure/*` → proibido `App.tsx` |
| `includeOnly: ['^src']` | opção | Cruza só `src/` |

**Scripts:** `pnpm depcruise` carrega `.dependency-cruiser.cjs` automaticamente.

**Verificação (feita):** import temporário em `types.ts` de `./modules/auth/types` →

```text
error types-ts-no-domain-imports: src/types.ts → src/modules/auth/types.ts
```

**Verificação contínua:**

```bash
pnpm depcruise
# ✔ no dependency violations found
```

---

## Passo 11 — CI no pull request ✅

**Objetivo:** automação igual à validação local.

- [x] Workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):
  - `push` em `main` e todo `pull_request`
  - `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm test` → `pnpm depcruise`
  - Node 22 + pnpm 10 (alinhado a `packageManager` e ambiente local)
- [ ] PR da branch `refactor/dependency-cruiser` só mergear com pipeline verde (após push e abertura do PR no GitHub)

**Verificação local (feita):** `pnpm lint`, `pnpm test` (64/64), `pnpm depcruise` (0 violações).

**Verificação no GitHub:** PR de teste com violação proposital deve falhar no job `Dependency cruise`.

---

## Passo 12 — Documentar arquitetura final ✅

**Objetivo:** time sabe **de onde importar** sem reler este roteiro.

- [x] [docs/ARCHITECTURE.md](./ARCHITECTURE.md):
  - Camadas: UI → Hooks/Context → Services → Infra → Types
  - Tabela “preciso de X → importe de Y” (`UserProfile` → `@modules/auth/types`; `MatchHistoryItem` → `@modules/history/types`)
  - O que **não** fazer + regras do `.dependency-cruiser.cjs` e CI
  - Link para este roteiro

**Verificação:** revisão rápida com outro dev — consegue achar `UserProfile` e `MatchHistoryItem` sem ambiguidade.

---

## Passo 13 — Refatorar `app.tsx` em hooks (em andamento)

**Objetivo:** manutenção; **não** é necessário para depcruise. Respeitar [ARCHITECTURE.md](./ARCHITECTURE.md) e `pnpm depcruise` após cada sub-PR.

**Diagnóstico (2026-05-19):** `src/App.tsx` ≈ **2.847 linhas** (original); após Fase 6 → **264 linhas**. `GameContext` já tem estado do jogo, mas `AppInner` mantinha **espelhos** + `GameBridge` / `LiveBridge` (~112 refs `*LocalRef`).

| Métrica | Valor |
|---------|--------|
| `useEffect` em `App.tsx` | ~40 |
| `useState` em `AppInner` | ~45 |
| Ramificações `currentScreen ===` (telas) | ~14 |
| Meta final | `App.tsx` &lt; **150** linhas (só providers + composição) |

### Sub-passos (ordem obrigatória)

| Fase | Conteúdo | Artefato / PR |
|------|----------|----------------|
| **1** | Inventário de lógica | [APP_LOGIC_INVENTORY.md](./APP_LOGIC_INVENTORY.md) |
| **2** | Reordenar providers; remover `GameBridge` / `LiveBridge` e espelhos | `AppProviders`, `AppContent` |
| **3** | Extrair UI auxiliar (`LogViewer`, modal, navegação inicial) | componentes / utils |
| **4** | Hooks de domínio: `useGameRules`, `useScoreboardEngine`, `useVoiceControl` | `modules/game/hooks`, `hooks/` |
| **5** | Hooks transversais: auth, config, history cloud, torneios, live sync | ver inventário |
| **6** | `AppScreenRouter` — JSX das telas | `src/app/AppScreenRouter.tsx` |
| **7** | `App.tsx` enxuto + validação CI | &lt; 150 linhas |

### Checklist Passo 13

- [x] **Fase 1** — Inventário (`docs/APP_LOGIC_INVENTORY.md`)
- [x] **Fase 2** — Remover bridges e estados espelho (`GameLiveProviderStack`, `useGame`/`useLive` no `AppContent`)
- [x] **Fase 3** — `LogViewer`, `AppModal`, `utils/appNavigation.ts` (`getUrlParams`, `getInitialScreen`)
- [x] **Fase 4** — `useGameRules`, `useScoreboardEngine`, `useVoiceControl` (lint/test/depcruise 2026-05-19)
- [x] **Fase 5** — Hooks transversais + `useLiveFirestoreSync`, `useDeepLinkScreen`, `useRemoteCloudMatch`, `useAppOfflineMode` (lint/test/depcruise 2026-05-19)
- [x] **Fase 6** — Router de telas: `AppScreenRouter` — JSX das telas extraído para `src/app/AppScreenRouter.tsx`; `App.tsx` → 264 linhas; lint/test 64/depcruise 0 violações (2026-05-21)
- [x] **Fase 7** — Meta &lt; 150 linhas → 135 linhas; lint/test 64/depcruise 0 violações (2026-05-21)

**Verificação contínua:** após cada fase → `pnpm test` → `pnpm lint` → `pnpm depcruise`.

---

## Passo 14 — (Opcional) Store central (Zustand)

**Objetivo:** estado global único; reduz duplicação entre Contexts.

- [ ] `src/store/gameStore.ts`
- [ ] Migrar hooks para consumir store

**Quando fazer:** se Passo 13 gerar necessidade clara de estado compartilhado.

---

## Passo 15 — (Opcional) Estrutura DDD + barrels seguros

**Objetivo:** organização de pastas; barrels só na **borda** (App/screens).

- [ ] Padrão por módulo: `types.ts`, `services/`, `hooks/`, `components/`, `index.ts` (só re-export público)
- [ ] Regra: serviços internos **nunca** importam `index.ts` do próprio ou de outro módulo acoplado

**Quando fazer:** refatoração de produto, não bloqueia métricas atuais.

---

# Parte C — Referência rápida

## Arquitetura alvo (imports)

```text
src/
├── types.ts              ← só tipos globais; SEM import de modules/
├── modules/
│   ├── auth/types.ts
│   ├── game/types.ts     ← pode importar ../../types (GameState)
│   ├── history/types.ts  ← importa PointEvent de ../../types (OK: unidirecional)
│   ├── events/types.ts
│   └── partners/types.ts
├── infrastructure/
│   ├── firebase/matches.ts   ← importa @modules/history/types
│   └── firebase/client.ts
└── utils/
    ├── sportEngine.ts    ← ScoringEngine definido aqui
    ├── scoreEngine.ts    ← dispatcher público de placar
    ├── tennisEngine.ts
    └── pickleballEngine.ts
```

## O que mudou em relação ao “plano por semanas” original

| Tema | Plano antigo | O que fizemos |
|------|--------------|---------------|
| Ordem | Semanas 1→7 lineares | Passos 1–8: tipos + barrels + testes antecipados |
| `src/domain/types/` | Criar pasta nova | Usamos `modules/*/types.ts` existentes |
| Fase 3–4 antes de ciclos | Hooks + Zustand cedo | Adiados (Passos 13–14); ciclos eram de grafo |
| Fase 5.2 barrels | Semana 5 | Antecipada no Passo 6 (necessário para 0 circulares) |
| Diagnóstico Fase 1 | 6 artefatos JSON/MD | Baseline `report.html` + `depcruise-*.txt` |

Isso **não invalida** o plano — condensa o caminho mínimo para o resultado.

## Diagnóstico baseline (resumo)
- [x] **Fase 6** — Router de telas: `AppScreenRouter` — JSX das telas extraído para `src/app/AppScreenRouter.tsx`; `App.tsx` → 264 linhas; lint/test 64/depcruise 0 violações (2026-05-21)
- [x] **Fase 7** — Meta &lt; 150 linhas → 135 linhas; lint/test 64/depcruise 0 violações (2026-05-21)

**Verificação contínua:** após cada fase → `pnpm test` → `pnpm lint` → `pnpm depcruise`.

---

## Passo 14 — (Opcional) Store central (Zustand)

**Objetivo:** estado global único; reduz duplicação entre Contexts.

- [ ] `src/store/gameStore.ts`
- [ ] Migrar hooks para consumir store

**Quando fazer:** se Passo 13 gerar necessidade clara de estado compartilhado.

---

## Passo 15 — (Opcional) Estrutura DDD + barrels seguros

**Objetivo:** organização de pastas; barrels só na **borda** (App/screens).

- [ ] Padrão por módulo: `types.ts`, `services/`, `hooks/`, `components/`, `index.ts` (só re-export público)
- [ ] Regra: serviços internos **nunca** importam `index.ts` do próprio ou de outro módulo acoplado

**Quando fazer:** refatoração de produto, não bloqueia métricas atuais.

---

# Parte C — Referência rápida

## Arquitetura alvo (imports)

```text
src/
├── types.ts              ← só tipos globais; SEM import de modules/
├── modules/
│   ├── auth/types.ts
│   ├── game/types.ts     ← pode importar ../../types (GameState)
│   ├── history/types.ts  ← importa PointEvent de ../../types (OK: unidirecional)
│   ├── events/types.ts
│   └── partners/types.ts
├── infrastructure/
│   ├── firebase/matches.ts   ← importa @modules/history/types
│   └── firebase/client.ts
└── utils/
    ├── sportEngine.ts    ← ScoringEngine definido aqui
    ├── scoreEngine.ts    ← dispatcher público de placar
    ├── tennisEngine.ts
    └── pickleballEngine.ts
```

## O que mudou em relação ao “plano por semanas” original

| Tema | Plano antigo | O que fizemos |
|------|--------------|---------------|
| Ordem | Semanas 1→7 lineares | Passos 1–8: tipos + barrels + testes antecipados |
| `src/domain/types/` | Criar pasta nova | Usamos `modules/*/types.ts` existentes |
| Fase 3–4 antes de ciclos | Hooks + Zustand cedo | Adiados (Passos 13–14); ciclos eram de grafo |
| Fase 5.2 barrels | Semana 5 | Antecipada no Passo 6 (necessário para 0 circulares) |
| Diagnóstico Fase 1 | 6 artefatos JSON/MD | Baseline `report.html` + `depcruise-*.txt` |

Isso **não invalida** o plano — condensa o caminho mínimo para o resultado.

## Diagnóstico baseline (resumo)

- **75 ciclos:** quase todos passavam por `src/types.ts` re-exportando módulos + barrels (`index.ts`) entre game, auth, firebase, history, partners, events, ui.
- **6 órfãos:** módulos nunca importados (lista no Passo 9).
- **Causa raiz:** acoplamento bidirecional de tipos via hub central, não falta de Zustand ou tamanho do `app.tsx`.

## Checklist de acompanhamento (cole no PR / notas)

```text
[x] Passo 9  — órfãos (0 violações)
[x] Passo 10 — .dependency-cruiser.cjs
[x] Passo 11 — CI
[x] Passo 12 — ARCHITECTURE.md
[x] Passo 13 — hooks app (Fases 1–7 ✅)
[ ] Passo 14 — store (opcional)
[/] Passo 15 — DDD pastas + limpeza do Router (em andamento ⏳)
```

---

## Histórico de métricas

| Data | Passo | Circulares | Órfãos | Total |
|------|-------|------------|--------|-------|
| baseline | — | 75 | 6 | 81 |
| 2026-05-18 | 3–4 | ~47 | 6 | ~53 |
| 2026-05-18 | 5 | ~13 | 6 | ~19 |
| 2026-05-18 | 6–8 | **0** | 6 | **6** |
| 2026-05-18 | 9 | **0** | **0** | **0** |
| 2026-05-21 | 13 Fase 6 | **0** | **0** | **0** | — `App.tsx` 264 ln; `AppScreenRouter.tsx` criado; 158 módulos, 496 deps |
| 2026-05-21 | 14-15 (Item 1 & 2) | **0** | **0** | **0** | — `AppScreenRouter.tsx` reduzido para 678 ln; `screens/` deletada; 151 módulos, 492 deps |

---

*Documento único de verdade para esta refatoração. O conteúdo antigo (checklists 1.1.x, scripts Python, templates por semana) foi substituído por este roteiro sequencial.*
