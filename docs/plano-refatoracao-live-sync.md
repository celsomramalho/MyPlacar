# Plano de Refatoração — Domínio Live & Realtime Sync

> **Status geral: ✅ CONCLUÍDO** — Todas as 6 fases executadas e validadas.

---

## Diagnóstico Original

| Arquivo Crítico | Tamanho | Problema |
|---|---|---|
| `src/modules/live/hooks/useLiveFirestoreSync.tsx` | **63 KB** | Acúmulo de listeners, debouncing, concorrência offline/online, formatação |
| `src/modules/live/LiveContext.tsx` | 25 KB | Orquestração central de transmissão e spectator mode misturados |

---

## Arquitetura Resultante

```
LiveSyncManager.tsx (src/app/)
  └── useLiveFirestoreSync   ← FACADE ~1.4 KB (era 63 KB)
        ├── useLivePublisher  ← canal de escrita (deltas, heartbeats)
        │     └── liveReconciliation.hasMatchStateChanged / hasConfigChanged
        └── useLiveSubscriber ← canal de leitura (3× onSnapshot, watchdog, overlay)
              └── liveReconciliation.reconcileIncomingGameState / reconcileClosedGameState / …

src/modules/live/domain/
  ├── liveReconciliation.ts  ← funções puras, sem React, sem Firebase SDK
  └── liveTeardown.ts        ← performSafeLiveExit(), import dinâmico do Firebase

LiveContext.tsx
  └── performExit → delega para performSafeLiveExit()
```

---

## Fase 1 — Baseline e Snapshot

- [x] Executar `npm test` → **128/128** testes passando (estado inicial)
- [x] Executar `npm run depcruise` → **0 violações** (248 módulos)
- [x] Registrar métricas iniciais como baseline

---

## Fase 2 — `liveReconciliation.ts` + Testes Unitários

- [x] Criar `src/modules/live/domain/liveReconciliation.ts`
  - Funções puras exportadas: `isJudgeForLive`, `shouldDiscardStaleWrite`, `hasMatchStateChanged`, `hasConfigChanged`, `computeScoreKey`, `detectScoredTeamFromKeys`, `detectScoredTeamFromSnapshot`, `reconcileIncomingGameState`, `reconcileClosedGameState`, `resolveMatchWinner`
  - Zero dependências de React ou Firebase SDK
- [x] Criar `tests/regression/liveReconciliation.test.ts` — **25 testes unitários**
- [x] Exportar de `src/modules/live/index.ts`
- [x] `npm test` → **153/153** passando ✅

---

## Fase 3 — `useLivePublisher.ts`

- [x] Criar `src/modules/live/hooks/useLivePublisher.ts`
  - Canal de saída exclusivo: deltas de placar, heartbeats (controller / judge / owner / observer)
  - Detecção de `fbSyncStatus`, persistência em localStorage
  - Chama `liveReconciliation.hasMatchStateChanged` e `hasConfigChanged`
- [x] Adicionar `LivePublisherParams` e `LivePublisherReturn` em `src/modules/live/types.ts`
- [x] Exportar de `src/modules/live/index.ts`
- [x] `npm run lint` → 0 erros | `npm run depcruise` → 0 violações (250 módulos) | `npm test` → 153/153 ✅

---

## Fase 4 — `useLiveSubscriber.tsx`

- [x] Criar `src/modules/live/hooks/useLiveSubscriber.tsx`
  - 3× listeners `onSnapshot` (placar público + metadados + estado de jogo)
  - Spectator mode, watchdog de presença remota, reconexão automática
  - Alerta offline (ícone WifiOff), auto-overlay e auto-join
  - Recebe callback `markStateAsSent` do Publisher para sincronização
- [x] Adicionar `LiveSubscriberParams` em `src/modules/live/types.ts`
- [x] Exportar de `src/modules/live/index.ts`
- [x] `npm run lint` → 0 erros | `npm run depcruise` → 0 violações (251 módulos) | `npm test` → 153/153 ✅

---

## Fase 5 — Orquestração e Enxugamento

- [x] Criar `src/modules/live/domain/liveTeardown.ts`
  - `performSafeLiveExit(SafeLiveExitParams)` extraída de `LiveContext.tsx`
  - Async, import dinâmico do Firebase, trata owner / judge / observer
- [x] Reescrever `useLiveFirestoreSync.tsx` como facade (~35 linhas)
  - De **63 KB / ~1450 linhas** → **1.4 KB / ~35 linhas**
- [x] Refatorar `LiveContext.tsx`
  - Removidos imports não usados: `doc`, `setDoc`, `updateDoc`, `deleteField`, `FieldValue`, `getDb`
  - `performExit` de ~90 linhas → 1 chamada a `performSafeLiveExit(...)`
- [x] Exportar `performSafeLiveExit` e `SafeLiveExitParams` de `src/modules/live/index.ts`
- [x] `npm run build` → ✅ **1829 módulos transformados**, sem erros
- [x] `npm test` → **153/153** | `npm run depcruise` → 0 violações (252 módulos) | `npm run lint` → 0 erros ✅

---

## Fase 6 — Validação Final e Regressão ✅

- [x] `npm run lint` (`tsc --noEmit`) → **0 erros de tipo** ✅
- [x] `npm run depcruise` → **0 violações** (252 módulos) ✅
- [x] `npm test` → **153/153 testes passando** (11 arquivos) ✅
- [ ] Testes manuais recomendados (executar em ambiente de desenvolvimento):
  - [ ] Validação multi-dispositivo: Celular/Controller + Desktop/Observer em simultâneo
  - [ ] Testar transferência de comando: Owner → Juiz → Owner
  - [ ] Testar modo offline momentâneo: desconectar Wi-Fi por ~10s e reconectar
  - [ ] Confirmar reconexão automática e re-sincronização de placar

---

## Resumo de Impacto

| Métrica | Antes | Depois | Variação |
|---|---|---|---|
| `useLiveFirestoreSync.tsx` | 63 KB / ~1450 linhas | **1.4 KB / ~35 linhas** | ↓ **−97%** |
| `LiveContext.tsx` | 25 KB | ~20 KB | ↓ −20% |
| Testes automatizados | 128 | **153** | +25 unitários |
| Violações de dependência | 0 | **0** | mantido |
| Erros TypeScript | 0 | **0** | mantido |
| Módulos cruised | 248 | **252** | +4 novos |

### Novos Arquivos Criados

| Arquivo | Responsabilidade |
|---|---|
| `src/modules/live/domain/liveReconciliation.ts` | Funções puras de reconciliação (sem React, sem Firebase) |
| `src/modules/live/domain/liveTeardown.ts` | `performSafeLiveExit()` — teardown assíncrono |
| `src/modules/live/hooks/useLivePublisher.ts` | Canal de escrita: deltas, heartbeats |
| `src/modules/live/hooks/useLiveSubscriber.tsx` | Canal de leitura: onSnapshot × 3, watchdog, overlay |
| `tests/regression/liveReconciliation.test.ts` | 25 testes unitários das funções puras |
