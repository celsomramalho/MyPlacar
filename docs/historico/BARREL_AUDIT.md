# Revisão de barrels — MyPlacar

> **Data:** 2026-05-22  
> **Contexto:** última revisão antes do Passo 14 (Zustand)  
> **Validação:** `pnpm lint` + `pnpm test` + `pnpm depcruise` → 0 violações

---

## Resumo

| Camada | Regra | Status |
|--------|-------|--------|
| `src/types.ts` | Sem import de módulos/infra | ✅ enforced |
| `modules/*/services` | Tipos/infra por arquivo concreto | ✅ corrigido nesta revisão |
| `modules/*/types.ts` | `@modules/auth/types`, não `@modules/auth` | ✅ |
| Contextos (`GameContext`) | Serviços/hooks diretos; tipos diretos | ✅ |
| `modules/*/hooks` internos | `useUI` via `UIContext`, não barrel `ui` | ✅ |
| `src/app/*Route.tsx` | Barrels permitidos (borda) | ✅ intencional |
| `src/hooks/*` transversais | `useGame`/`useLive` barrels OK; infra preferir `client`/`matches`/`users` | ✅ parcial |
| Telas (`modules/*/screens`) | `useGame`/`useLive` barrels aceitáveis | ✅ documentado |

---

## Barrels existentes (`index.ts`)

| Módulo | Arquivo | Uso recomendado |
|--------|---------|-----------------|
| `auth` | `index.ts` | App, rotas, telas — exporta `AuthScreen`, `UserProfile` |
| `game` | `index.ts` | App, rotas — `GameProvider`, `useGame` |
| `live` | `index.ts` | App, rotas, telas placar |
| `ui` | `index.ts` | App — `UIProvider`, `useUI` |
| `partners` | `index.ts` | App, `PartnersRoute` — telas + serviços públicos |
| `events` | `index.ts` | App — telas + serviços de torneio |
| `history` | `index.ts` | Evitar em outros módulos; preferir `components/`, `services/` |
| `settings` | `index.ts` | Preferir `screens/`, `components/` diretos entre módulos |
| `@infra/firebase` | `index.ts` | **Borda apenas**; serviços usam `client`, `matches`, `events`, `users` |

---

## Correções aplicadas (2026-05-22)

### Meio do grafo (obrigatório)

- `UserProfile`: `@modules/auth` → `@modules/auth/types` em `types`, `services`, `GameContext`, telas
- `useGameRules` / `useScoreboardEngine`: `@modules/ui` → `@modules/ui/UIContext`
- `SettingsScreen`: `@modules/history` → `@modules/history/components/HistorySection`
- `NewGameScreen`: `@modules/settings` → `@modules/settings/components/SettingsTabs`
- `useTournamentSession`: barrel `@modules/events` → `services/*` + `types`
- Serviços `events`: `@infra/firebase` → `@infra/firebase/events`
- `createReferralPartner`: `@infra/firebase` → `@infra/firebase/users`
- `GameContext`, `useJudgeLookup`, `useMatchDeletion`, `useLiveActions`: `getDb` → `@infra/firebase/client`

### Borda (mantido de propósito)

- `App.tsx`, `AppScreenRouter`, `*Route.tsx`: `@modules/game`, `@modules/live`, `@modules/ui`
- `PartnersRoute`: `PartnersScreen` via `@modules/partners` (barrel de tela)
- Telas com `useGame()` / `useLive()` via barrel do módulo

---

## Pendências opcionais (não bloqueiam Passo 14)

Imports `@infra/firebase` (barrel) ainda em **telas** e alguns **hooks** — aceitável na borda; refinar depois para:

- `getDb` → `@infra/firebase/client`
- CRUD partidas → `@infra/firebase/matches`
- Usuários/PIN → `@infra/firebase/users`
- Torneios → `@infra/firebase/events`

Arquivos com barrel infra (ex.): `AuthScreen`, `EventDetailScreen`, `AdminScreen`, `useAppStartup`, `useHistoryCloud`, …

---

## Checklist antes do Passo 14

```text
[x] depcruise 0 violações
[x] services sem barrel cruzado auth/events/history
[x] GameContext imports diretos (já estava; auth/types reforçado)
[x] Documentação ARCHITECTURE + BARREL_AUDIT atualizada
[ ] Passo 14 Zustand — próximo
```

---

*Ver também [ARCHITECTURE.md](./ARCHITECTURE.md) e [refatoracao_dependency-cruiser.md](./refatoracao_dependency-cruiser.md).*
