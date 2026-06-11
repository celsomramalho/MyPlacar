# Passos 14 e 15 — Plano de Implementação

> **Branch sugerida:** `refactor/cleanup-ddd`  
> **Pré-requisito:** Passo 13 Fases 1–7 ✅ (`App.tsx` 135 ln; 0 violações depcruise)  
> **Como usar:** execute os itens na ordem. Após cada item: `pnpm test` → `pnpm lint` → `pnpm depcruise`.

---

## Estado atual

| Arquivo | Linhas | Situação |
|---------|--------|----------|
| `src/App.tsx` | 135 | ✅ Concluído |
| `src/app/AppScreenRouter.tsx` | **~310** | ✅ Item 3 + 3.5 (rotas finas); compositor de telas |
| `src/app/ScoreboardRoute.tsx` | 184 | ✅ Integrado no Router (sub-passo F) |
| `src/hooks/useLiveActions.ts` | 190 | ✅ Integrado no Router (sub-passo C) |
| `src/hooks/useVersionTap.ts` | 27 | ✅ Integrado no Router (sub-passo E) |
| `src/screens/` (pasta antiga) | — | ✅ Deletada no Item 2 |
| `src/shared/` | 8 arquivos | ✅ Fonte oficial dos componentes compartilhados (não deletar) |
| `src/pages/` | — | ✅ Deletado no Item 1 |

- `pnpm test`: 64/64 ✅ (2026-05-22)
- `pnpm lint`: OK ✅ (2026-05-22)
- `pnpm depcruise`: **0 violações** (156 módulos, 513 deps) ✅ (2026-05-22, sub-passo E)

---

## Item 1 — Remover arquivos órfãos e duplicatas confirmadas ✅ (2026-05-21)

**Resultado:** 9 arquivos deletados; depcruise 152 módulos (era 158); 0 violações; 64/64 testes.

### Descoberta importante sobre `src/shared/`

A situação estava **invertida** em relação ao que o plano assumia originalmente:
- `src/shared/components/` e `src/shared/utils/` são as **fontes reais**
- `src/components/Button.tsx`, `src/components/Input.tsx` etc. são **re-exports de compatibilidade** (comentário `// Legacy compat layer` confirma)
- `src/shared/` **não deve ser deletado** — é ele que deve permanecer

### Arquivos deletados

| Arquivo | Motivo |
|---------|--------|
| `src/screens/AuthScreen.tsx` | fantasma 1 KB — re-export do módulo |
| `src/screens/PartnersScreen.tsx` | fantasma 1 KB — re-export do módulo |
| `src/screens/EventDetailScreen.tsx` | fantasma 1 KB — re-export do módulo |
| `src/screens/LocationScreen.tsx` | fantasma 1 KB — re-export do módulo |
| `src/screens/TournamentsScreen.tsx` | fantasma 1 KB — re-export do módulo |
| `src/screens/settings/HistorySection.tsx` | sem referências |
| `src/screens/settings/SettingsHeader.tsx` | sem referências |
| `src/screens/settings/SettingsTabs.tsx` | sem referências |
| `src/pages/Login.tsx` | sem referências |

### Verificação ✅

```
pnpm test      → 64/64 ✅
pnpm lint      → OK ✅
pnpm depcruise → 0 violações (152 módulos, 494 deps) ✅
```

---

## Item 2 — Migrar as 7 telas restantes de `src/screens/` para `src/modules/` ✅ (2026-05-21)

**Resultado:** todas as telas migradas; `src/screens/` deletada; 0 violações; 64/64 testes.

### Mapa de movimentação

| Origem | Destino | Módulo | Status |
|--------|---------|--------|--------|
| `src/screens/ScoreboardScreen.tsx` | `src/modules/game/screens/ScoreboardScreen.tsx` | `game` | ✅ |
| `src/screens/NewGameScreen.tsx` | `src/modules/game/screens/NewGameScreen.tsx` | `game` | ✅ |
| `src/screens/AdminScreen.tsx` | `src/modules/settings/screens/AdminScreen.tsx` | `settings` | ✅ |
| `src/screens/ProfileScreen.tsx` | `src/modules/settings/screens/ProfileScreen.tsx` | `settings` | ✅ |
| `src/screens/HelpScreen.tsx` | `src/modules/settings/screens/HelpScreen.tsx` | `settings` | ✅ |
| `src/screens/settings/TeamSection.tsx` | `src/modules/settings/components/TeamSection.tsx` | `settings` | ✅ |
| `src/screens/SpectatorScreen.tsx` | `src/modules/live/screens/SpectatorScreen.tsx` | `live` | ✅ |
| `src/screens/CommunicationsScreen.tsx` | `src/modules/auth/screens/CommunicationsScreen.tsx` | `auth` | ✅ |

### Observações de imports corrigidos

Todos os imports relativos `../` foram ajustados para `../../../` (raiz `src/`) ou aliases
(`@shared/components/Button`, `@shared/components/Input`, `@modules/live/types`, etc.)
após cada movimentação. `AppScreenRouter.tsx` e `SettingsScreen.tsx` atualizados.

### Verificação ✅

```
pnpm test      → 64/64 ✅
pnpm lint      → OK ✅
pnpm depcruise → 0 violações (151 módulos, 492 deps) ✅
src/screens/   → deletada ✅
```

---

## Item 3 — Enxugar `AppScreenRouter.tsx` (extrair lógica de negócio)

**Objetivo:** `AppScreenRouter` deve apenas **rotear telas** — sem lógica de Firestore,
cálculos de live nem `useEffect` de domínio. Meta final: **≤ 300 linhas** (baseline Item 3: 812; hoje: **674**).

**Meta intermediária (após E + F):** **≤ 450 linhas** — a meta de 300 exige rotas adicionais (Item 3.5 opcional).

> [!IMPORTANT]
> Este é o item de maior impacto e risco. Faça em sub-passos, validando após cada extração.

### Diagnóstico real do arquivo (atualizado 2026-05-22)

| Sub-passo | Status | Realidade |
|-----------|--------|-----------|
| A — `useJudgeLookup` | ✅ | Hook em `src/hooks/useJudgeLookup.ts`; Router chama `useJudgeLookup(...)` |
| D — `useMatchDeletion` | ✅ | Hook integrado; props `onDeleteMatch` / `onDeleteManyMatches` delegadas |
| B — `GlobalOverlays` | ✅ | Componente em `src/components/GlobalOverlays.tsx`; `isUpdatingVersion` permanece no Router |
| C — `useLiveActions` | ✅ | Hook em `src/hooks/useLiveActions.ts`; `handleToggleMirroring` / `handleConfirmMatch` no Router (C.1 pulada — foi direto ao hook) |
| E — `useVersionTap` | ✅ | Hook integrado; inline removido do Router |
| F — `ScoreboardRoute` | ✅ | Router delega tela scoreboard; hooks live/engine/voice só no Route |

**Estimativa após E + F:** Router **~560–580 ln** (não atinge ≤ 300 sem rotas extras).

### Ordem de execução

```
Concluído: A → D → B → C
Concluído: A → D → B → C → E → F
Opcional:  Item 3.5 (rotas extras) para meta ≤ 300 ln
```

---

### Sub-passo A — extrair `useJudgeLookup` ✅

**Arquivo novo:** `src/hooks/useJudgeLookup.ts`

**O que extrair:** `useEffect` das linhas 267–284 do `AppScreenRouter`, que faz um
`getDoc` único no Firestore quando `judgePinInput.length === 5`.

```typescript
// src/hooks/useJudgeLookup.ts
import { useEffect } from 'react';
import { findUserByPin, getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';

interface UseJudgeLookupParams {
  judgePinInput: string;
  setIsSearchingJudgePin: (v: boolean) => void;
  setJudgeNicknameLookup: (v: string) => void;
}

export function useJudgeLookup({
  judgePinInput,
  setIsSearchingJudgePin,
  setJudgeNicknameLookup,
}: UseJudgeLookupParams): void {
  useEffect(() => {
    const lookup = async () => {
      const pin = judgePinInput.toUpperCase().trim();
      if (pin.length === 5) {
        setIsSearchingJudgePin(true);
        const db = getDb();
        if (!db) { setIsSearchingJudgePin(false); return; }
        try {
          const user = await findUserByPin(db as Firestore, pin, { fallbackNickname: 'Juiz' });
          setJudgeNicknameLookup(user ? user.nickname : 'Usuário não localizado');
        } catch { setJudgeNicknameLookup(''); }
        finally { setIsSearchingJudgePin(false); }
      } else {
        setJudgeNicknameLookup('');
      }
    };
    lookup();
  }, [judgePinInput, setIsSearchingJudgePin, setJudgeNicknameLookup]);
}
```

**O que remover do `AppScreenRouter`:**
- O bloco `useEffect` das linhas 267–284
- O import `findUserByPin` de `@infra/firebase` (se não usado em outro lugar do Router)

**Substituir por:**
```typescript
import { useJudgeLookup } from '../hooks/useJudgeLookup';

// dentro do componente:
useJudgeLookup({ judgePinInput, setIsSearchingJudgePin, setJudgeNicknameLookup });
```

**Linhas removidas do Router:** ~18 ln

---

### Sub-passo D — extrair `useMatchDeletion` ✅

**Arquivo novo:** `src/hooks/useMatchDeletion.ts`

**O que extrair:** os dois handlers de deleção que hoje vivem inline como props do
`SettingsScreen` (linhas 442–467). A lógica envolve `persistHistory`,
`removeHistoryMatches`, `deleteCloudMatch/Matches` e `deleteSupabaseMatch/Matches`.

```typescript
// src/hooks/useMatchDeletion.ts
interface UseMatchDeletionParams {
  matchHistoryRef: React.MutableRefObject<MatchHistoryItem[]>;
  persistHistory: (items: MatchHistoryItem[]) => void;
  setModalConfig: (config: ModalConfig | null) => void;
  userProfile: UserProfile;
}

interface UseMatchDeletionReturn {
  handleDeleteMatch: (id: string) => void;
  handleDeleteManyMatches: (ids: Set<string>) => void;
}

export function useMatchDeletion(params: UseMatchDeletionParams): UseMatchDeletionReturn
```

**O que remover do `AppScreenRouter`:**
- Lógica inline das props `onDeleteMatch` e `onDeleteManyMatches` do `SettingsScreen`
- Os imports: `deleteCloudMatch`, `deleteCloudMatches` de `@infra/firebase`
- Os imports: `deleteSupabaseMatch`, `deleteSupabaseMatches` de `@infra/supabase`
- O import: `removeHistoryMatches` de `@modules/history/services/removeHistoryMatches`

**Linhas removidas do Router:** ~25 ln

---

### Sub-passo B — extrair `GlobalOverlays` ✅

**Arquivo novo:** `src/components/GlobalOverlays.tsx`

**O que extrair:** os 4 blocos de overlay JSX das linhas 322–384:
- `isWaitingSync` → spinner "Sincronizando com a nuvem" (linhas 322–329)
- `isServiceInterrupted` → tela "Versão descontinuada" (linhas 331–351)
- `activeCloudMatch` → banner "Partida ativa detectada" (linhas 365–376)
- `isUpdatingVersion` → tela "Atualizando sistema" (linhas 378–384)

> [!NOTE]
> `isUpdatingVersion` é **estado local** do `AppScreenRouter` (linha 212).
> Ele precisa continuar vivendo no Router e ser passado como prop para `GlobalOverlays`.
> Não mover o `useState` — apenas passar o valor e o setter via props.

```typescript
// src/components/GlobalOverlays.tsx
interface GlobalOverlaysProps {
  isWaitingSync: boolean;
  setIsWaitingSync: (v: boolean) => void;
  isServiceInterrupted: boolean;
  newAppUrl: string;
  isUpdatingVersion: boolean;
  activeCloudMatch: { id: string; sport: string } | null;
  handleConnectRemote: () => void;
  handleRejectRemote: () => void;
}

export function GlobalOverlays(props: GlobalOverlaysProps): React.ReactElement | null
```

**Substituir no Router por:**
```tsx
<GlobalOverlays
  isWaitingSync={isWaitingSync}
  setIsWaitingSync={setIsWaitingSync}
  isServiceInterrupted={isServiceInterrupted}
  newAppUrl={newAppUrl}
  isUpdatingVersion={isUpdatingVersion}
  activeCloudMatch={activeCloudMatch}
  handleConnectRemote={handleConnectRemote}
  handleRejectRemote={handleRejectRemote}
/>
```

**Linhas removidas do Router:** ~55 ln (JSX) → substituídas por ~10 ln (uso do componente)

---

### Sub-passo C — extrair `useLiveActions` ✅ (2026-05-22)

**Arquivo:** `src/hooks/useLiveActions.ts` (~190 ln)

**Concluído:**
- `handleToggleMirroring` — guards de partida em andamento, consulta Firestore, `setDoc`, trava `ownerPin`
- `handleConfirmMatch` — `updateDoc` + `deleteDoc` atrasado + limpeza de estado/localStorage
- Router usa `useLiveActions({ ... })` e passa handlers ao `ScoreboardScreen` (props `onToggleMirroring` / `onConfirmMatch`)

**Nota:** Etapa C.1 (nomear inline antes do hook) foi **pulada** — extração direta ao hook; `pnpm test` + `pnpm lint` OK.

**Imports removidos do Router (Firestore live):** confirmado — lógica vive só no hook.

---

### Sub-passo E — integrar `useVersionTap` ✅ (2026-05-22)

**Arquivo:** `src/hooks/useVersionTap.ts`

**Feito no Router:**
- Removidos `_versionTapCount`, `versionTapTimerRef`, `handleVersionTap` inline e import `useRef`
- Adicionado: `const { handleVersionTap } = useVersionTap(() => setShowLogViewer(true));`

**Linhas removidas do Router:** ~12 ln

**Verificação:** `pnpm test` 64/64 | `pnpm lint` OK | `pnpm depcruise` 0 violações

---

### Sub-passo F — integrar `ScoreboardRoute` ✅ (2026-05-22)

**Arquivo:** `src/app/ScoreboardRoute.tsx`

**Feito:**
- Bloco `ScoreboardScreen` inline substituído por `<ScoreboardRoute … />` (condição de render permanece no Router)
- Removidos do Router: `useLiveActions`, `useScoreboardEngine`, `useVoiceControl` e destructuring só usado no placar
- `useJudgeLookup` permanece no Router (efeito global por PIN)

**Linhas removidas do Router:** ~112 ln (674 → **550**)

**Verificação:** `pnpm test` 64/64 | `pnpm lint` OK | `pnpm depcruise` 0 violações (156 módulos, 511 deps)

---

### Item 3.5 — Rotas extras ✅ (2026-05-22)

| Rota | Arquivo | Status |
|------|---------|--------|
| `SettingsRoute` | `src/app/SettingsRoute.tsx` | ✅ (+ `useMatchDeletion`, PWA effect) |
| `PartnersRoute` | `src/app/PartnersRoute.tsx` | ✅ |
| `NewGameRoute` | `src/app/NewGameRoute.tsx` | ✅ |
| `AdminRoute` | `src/app/AdminRoute.tsx` | ✅ |
| `AuthRoute` | `src/app/AuthRoute.tsx` | ✅ |
| `EventDetailRoute` | `src/app/EventDetailRoute.tsx` | ✅ |
| `PublicScoreboardRoute` | `src/app/PublicScoreboardRoute.tsx` | ✅ |

**Router:** 550 → **~310 ln** (meta ≤ 300 quase atingida; telas simples permanecem inline: spectator, location, tournaments, communications).

---

### Resultado esperado após Item 3

| Arquivo | Antes | Agora | Após E+F | Meta final |
|---------|-------|-------|----------|------------|
| `src/app/AppScreenRouter.tsx` | 812 ln | **~310 ln** | — | ≤ 300 ✅ (~meta) |
| `src/hooks/useJudgeLookup.ts` | — | ✅ ~37 ln | — | — |
| `src/hooks/useMatchDeletion.ts` | — | ✅ ~71 ln | — | — |
| `src/components/GlobalOverlays.tsx` | — | ✅ | — | — |
| `src/hooks/useLiveActions.ts` | — | ✅ ~190 ln | — | — |
| `src/hooks/useVersionTap.ts` | — | WIP | ✅ integrado | — |
| `src/app/ScoreboardRoute.tsx` | — | ✅ 184 ln | — | — |

### Verificação (após cada sub-passo E, F)

```bash
pnpm test        # 64/64
pnpm lint        # 0 erros
pnpm depcruise   # 0 violações (meta); hoje: 1 órfão até E
```

---

## Resumo de novos arquivos

| Arquivo | Item | Tipo | Status |
|---------|------|------|--------|
| `src/modules/game/screens/ScoreboardScreen.tsx` | 2 | movido | ✅ |
| `src/modules/game/screens/NewGameScreen.tsx` | 2 | movido | ✅ |
| `src/modules/settings/screens/AdminScreen.tsx` | 2 | movido | ✅ |
| `src/modules/settings/screens/ProfileScreen.tsx` | 2 | movido | ✅ |
| `src/modules/settings/screens/HelpScreen.tsx` | 2 | movido | ✅ |
| `src/modules/settings/components/TeamSection.tsx` | 2 | movido | ✅ |
| `src/modules/live/screens/SpectatorScreen.tsx` | 2 | movido | ✅ |
| `src/modules/auth/screens/CommunicationsScreen.tsx` | 2 | movido | ✅ |
| `src/hooks/useJudgeLookup.ts` | 3-A | novo | ✅ |
| `src/hooks/useMatchDeletion.ts` | 3-D | novo | ✅ |
| `src/components/GlobalOverlays.tsx` | 3-B | novo | ✅ |
| `src/hooks/useLiveActions.ts` | 3-C | novo | ✅ |
| `src/hooks/useVersionTap.ts` | 3-E | novo | ✅ |
| `src/app/ScoreboardRoute.tsx` | 3-F | novo | ✅ |
| `src/app/SettingsRoute.tsx` | 3.5 | novo | ✅ |
| `src/app/PartnersRoute.tsx` | 3.5 | novo | ✅ |
| `src/app/NewGameRoute.tsx` | 3.5 | novo | ✅ |
| `src/app/AdminRoute.tsx` | 3.5 | novo | ✅ |
| `src/app/AuthRoute.tsx` | 3.5 | novo | ✅ |
| `src/app/EventDetailRoute.tsx` | 3.5 | novo | ✅ |
| `src/app/PublicScoreboardRoute.tsx` | 3.5 | novo | ✅ |

## Arquivos deletados

| Arquivo | Motivo |
|---------|--------|
| `src/screens/AuthScreen.tsx` | substituído por `@modules/auth` |
| `src/screens/PartnersScreen.tsx` | substituído por `@modules/partners` |
| `src/screens/EventDetailScreen.tsx` | substituído por `@modules/events` |
| `src/screens/LocationScreen.tsx` | substituído por `@modules/history` |
| `src/screens/TournamentsScreen.tsx` | substituído por `@modules/events` |
| `src/screens/settings/` (pasta) | substituída por `@modules/settings` |
| `src/screens/` (pasta) | esvaziada e deletada no Item 2 ✅ |
| `src/pages/Login.tsx` | substituído por `@modules/auth` |

---

## Métricas esperadas ao final

| Métrica | Antes | Agora (2026-05-22) | Meta |
|---------|-------|---------------------|------|
| Violações depcruise | 0 | **0** ✅ | 0 |
| Testes | 64 | **64** ✅ | 64+ |
| `AppScreenRouter.tsx` | 812 ln | **~310 ln** | ≤ 300 ✅ |
| Pastas legadas (`screens/`, `pages/`) | 2 ativas | **0** ✅ | 0 |
| Módulos depcruise | ~160 | **156** | ~158 |

---

## Próximo passo físico (código)

**Item 3 + 3.5:** ✅ concluído. Router ~310 ln; 7 rotas em `src/app/*Route.tsx`.

**Revisão barrels (pré-Passo 14):** ✅ — ver [docs/BARREL_AUDIT.md](../docs/BARREL_AUDIT.md)

**Passo 14 (Zustand):** plano em [implementation_plan_14_zustand.md](./implementation_plan_14_zustand.md) — começar por 14.0–14.2 (MVP).

---

*Documento de implementação — Passos 14 e 15 do roteiro `refatoracao_dependency-cruiser.md`.*  
*Última atualização: 2026-05-22 — Item 3 + 3.5 + barrel audit ✅; Passo 14 planejado.*
