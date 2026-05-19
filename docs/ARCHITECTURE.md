# Arquitetura de imports — MyPlacar

Guia rápido para **de onde importar** sem reabrir o roteiro da refatoração. O grafo de dependências é validado por [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (`.dependency-cruiser.cjs`) e pelo CI (`.github/workflows/ci.yml`).

**Roteiro completo (histórico e passos opcionais):** [refatoracao_dependency-cruiser.md](./refatoracao_dependency-cruiser.md)

---

## Camadas (direção permitida)

Dependências fluem **de cima para baixo**. Camadas inferiores não importam telas nem `App.tsx`.

```text
┌─────────────────────────────────────────────────────────────┐
│  App.tsx · screens/ · components/     (orquestração / UI)   │
├─────────────────────────────────────────────────────────────┤
│  modules/*/hooks · Context · useGame   (estado / contratos) │
├─────────────────────────────────────────────────────────────┤
│  modules/*/services/                   (regras de domínio)    │
├─────────────────────────────────────────────────────────────┤
│  infrastructure/ (firebase, supabase)  (I/O externo)          │
├─────────────────────────────────────────────────────────────┤
│  types: src/types.ts + modules/*/types.ts + utils/          │
└─────────────────────────────────────────────────────────────┘
```

| Camada | Pastas típicas | Pode importar |
|--------|----------------|---------------|
| UI / shell | `App.tsx`, `src/screens/`, `src/components/` | módulos (`@modules/*`), infra (`@infra/*`), `src/types`, `utils/` |
| Hooks / context | `GameContext`, `UIContext`, `useGame`, `useLive` | `types` do módulo, `services/` concretos, outros `types` |
| Serviços | `src/modules/*/services/` | `types` (próprio e de outros módulos), `@infra/firebase/matches`, etc. |
| Infra | `src/infrastructure/` | `@modules/*/types`, utilitários; **não** `App.tsx` |
| Tipos | `src/types.ts`, `modules/*/types.ts` | `src/types.ts` só declara globais; tipos de módulo podem importar `../../types` (unidirecional) |

---

## Aliases (`tsconfig.json`)

| Alias | Aponta para |
|-------|-------------|
| `@modules/*` | `src/modules/*` |
| `@infra/*` | `src/infrastructure/*` |
| `@shared/*` | `src/shared/*` |
| `@routes/*` | `src/routes/*` |

---

## Preciso de X → importe de Y

### Tipos globais (partida, navegação, live)

| Preciso de… | Importar de |
|-------------|-------------|
| `GameState`, `MatchSettings`, `Screen`, `PointEvent`, `LiveLogEntry`, … | `src/types` ou `../../types` (dentro de `src/`) |
| Motor de placar (`ScoringEngine`, `getEngineForSport`) | `src/utils/sportEngine` |
| Lógica de pontuação | `src/utils/scoreEngine`, `tennisEngine`, `pickleballEngine` |

### Tipos de domínio (por módulo)

| Preciso de… | Importar de |
|-------------|-------------|
| `UserProfile`, `PlanType` | `@modules/auth/types` (ou `@modules/auth` **só na borda** — telas/App) |
| `MatchHistoryItem` | `@modules/history/types` |
| `TournamentEvent`, `TournamentMatch`, `EventRegistration`, … | `@modules/events/types` |
| `Partner`, `QueuePlayer` | `@modules/partners/types` |
| `GameContextValue` (contrato do contexto) | `@modules/game/types` |

### Comportamento (hooks, providers, serviços)

| Preciso de… | Importar de |
|-------------|-------------|
| `useGame`, `GameProvider` | `@modules/game` ou `@modules/game/useGame` |
| `createHistoryItem`, sync de histórico | `@modules/history/services/createHistoryItem`, `historySync`, etc. |
| `updateTournamentMatchProgress` (ex.) | `@modules/events/services/<arquivo>` |
| Funções de parceiros | `@modules/partners/services/<arquivo>` |
| Auth (telas) | `@modules/auth` (barrel OK no App/screens) |

### Infraestrutura

| Preciso de… | Importar de |
|-------------|-------------|
| Cliente Firebase | `@infra/firebase/client` |
| CRUD de partidas na nuvem | `@infra/firebase/matches` |
| Live matches, eventos, perfis | `@infra/firebase/liveMatches`, `events`, `userProfiles`, … |
| Supabase | `@infra/supabase/client`, `@infra/supabase/matches` |

Prefira o **arquivo concreto** em vez de `@infra/firebase` (barrel) quando o barrel puxar cadeias longas (`history`, `game`).

### Onde ficam as telas

Funcionalidade de produto está em `src/screens/` (ex.: `AdminScreen`, `SpectatorScreen`, `ScoreboardScreen`). Barrels placeholder removidos no Passo 9 — ver [DELETED_MODULES.md](./DELETED_MODULES.md).

---

## Exemplos corretos

```ts
// Tela ou App — barrel permitido na borda
import type { UserProfile } from '@modules/auth';
import { useGame } from '@modules/game';

// Serviço ou outro módulo — tipos diretos, sem hub
import type { MatchHistoryItem } from '@modules/history/types';
import type { Partner } from '@modules/partners/types';
import { createHistoryItem } from '@modules/history/services/createHistoryItem';

// Infra → só types do domínio
import type { MatchHistoryItem } from '@modules/history/types';
import { saveMatchToCloud } from '@infra/firebase/matches';
```

---

## O que **não** fazer

1. **`src/types.ts` nunca** importa nem re-exporta `@modules/*`, `src/modules/*` ou `src/infrastructure/*`.  
   Regra enforced: `types-ts-no-domain-imports` (erro no `pnpm depcruise`).

2. **Não usar `src/types.ts` como hub** de tipos de domínio (`UserProfile`, `MatchHistoryItem`, etc.). Cada um vive no `types.ts` do módulo.

3. **Barrel `index.ts` no meio do grafo** entre módulos acoplados (`game` ↔ `partners` ↔ `events` ↔ `history` ↔ `firebase`):  
   - Entre serviços/contextos: `@modules/foo/types`, `@modules/foo/services/bar`, `@modules/foo/useGame`.  
   - Barrel `@modules/foo` só em **App**, **screens** e componentes de alto nível.

4. **`modules/*` e `infrastructure/*` não importam `App.tsx`** (`modules-not-to-app`, `infra-not-to-app`).

5. **Não criar `index.ts` vazio** “para o futuro” sem uso — vira órfão (`no-orphans`).

6. **Não confundir pacotes:** use `pnpm depcruise` (script do projeto). O pacote npm `depcruise` é placeholder.

---

## Validação local e CI

```bash
pnpm lint        # tsc --noEmit
pnpm test        # vitest (64 testes)
pnpm depcruise   # 0 violações esperadas
```

No pull request, o workflow **CI** executa os três comandos após `pnpm install --frozen-lockfile`.

Relatório HTML (opcional, sobrescreve baseline): `pnpm depcruise:report` → `docs/report.html`.

---

## Estrutura alvo (resumo)

```text
src/
├── types.ts                 ← só tipos globais; zero import de modules/
├── App.tsx
├── screens/
├── modules/
│   ├── auth/types.ts
│   ├── game/types.ts        ← pode importar ../../types
│   ├── history/types.ts     ← PointEvent de ../../types (OK)
│   ├── events/types.ts
│   ├── partners/types.ts
│   └── …/services/
├── infrastructure/
│   ├── firebase/client.ts
│   ├── firebase/matches.ts
│   └── supabase/…
└── utils/
    ├── sportEngine.ts       ← ScoringEngine
    ├── scoreEngine.ts
    ├── tennisEngine.ts
    └── pickleballEngine.ts
```

---

## Próximos passos (opcionais)

Não bloqueiam o depcruise atual; ver [refatoracao_dependency-cruiser.md](./refatoracao_dependency-cruiser.md):

- Passo 13 — extrair hooks de `App.tsx`
- Passo 14 — store central (Zustand)
- Passo 15 — pastas DDD + barrels só na borda

---

*Última atualização: 2026-05-19 — alinhado à branch `refactor/dependency-cruiser` (0 violações depcruise).*
