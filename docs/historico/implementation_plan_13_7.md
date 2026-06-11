# Passo 13 — Fase 7: App.tsx < 150 linhas

## Objetivo

Extrair os `useEffect` de inicialização/persistência do `AppContent` para um novo hook
`src/hooks/useAppStartup.ts`, e o `useMemo` de device name para `src/hooks/useAppDeviceName.ts`,
levando o `App.tsx` abaixo de **150 linhas**.

## Estado atual

| Arquivo | Linhas |
|---------|--------|
| `src/App.tsx` | **264** |
| `src/app/AppScreenRouter.tsx` | 812 |
| `src/app/GameLiveProviderStack.tsx` | 60 |

- `pnpm test`: 64/64 ✅
- `pnpm lint`: OK ✅
- `pnpm depcruise`: 0 violações (158 módulos, 496 deps) ✅

---

## O que será extraído do `AppContent`

### `useEffect` que migram → `useAppStartup`

| useEffect | Responsabilidade | Dependências |
|-----------|-----------------|--------------|
| startup / migration | Grava versão do app no LS; executa migração de dados (`CURRENT_DATA_VERSION`); limpa backups; limpa flags de sessão PWA | `[]` (mount only) |
| quota error | Listener global `error` + `unhandledrejection` para `QuotaExceededError`; limpa LS e oferece modal de limpeza do cache Firestore | `[]` (mount only) |
| partners persist | Serializa `partners` no `localStorage` a cada mudança | `[partners]` |
| playerQueue persist | Serializa `playerQueue` no LS + sincroniza `user_queue_metadata` no Firestore | `[userProfile.email]` |
| alert override | Substitui `window.alert` nativo pelo `setModalConfig` | `[]` (mount only) |
| brightness | Aplica `opacity` no `#brightness-overlay` conforme `matchSettings.brightness` | `[matchSettings.brightness]` |

### `useMemo` que migra → `useAppDeviceName`

| Valor | Lógica |
|-------|--------|
| `currentFullDeviceName` | `applyGoldenRule(`${deviceLabel} - ${nickname}`, true)` |

---

## Arquivos alterados

### [NEW] `src/hooks/useAppStartup.ts`

Agrupa todos os 6 `useEffect` de inicialização e persistência.

```typescript
interface UseAppStartupParams {
  partners: Partner[];
  playerQueue: QueuePlayer[];
  userProfile: UserProfile;
  matchSettings: MatchSettings;
  setModalConfig: (config: ModalConfig | null) => void;
}

export function useAppStartup(params: UseAppStartupParams): void
```

> [!NOTE]
> A constante `CURRENT_DATA_VERSION` e o import de `APP_VERSION` / `LOCAL_CODE_VERSION`
> migram para dentro deste hook — saem completamente do `App.tsx`.

> [!NOTE]
> Os imports de `getDb`, `setDoc`, `doc` (Firestore), `clearFirestoreCache` e
> `APP_VERSION` saem do `App.tsx` e ficam encapsulados em `useAppStartup.ts`.

### [NEW] `src/hooks/useAppDeviceName.ts`

Encapsula o `useMemo` de nome do dispositivo.

```typescript
export function useAppDeviceName(
  deviceLabel: string,
  nickname: string
): string
```

Internamente: `applyGoldenRule(`${deviceLabel || 'Aparelho'} - ${nickname || 'Usuário'}`, true)`

### [MODIFY] `src/App.tsx` (`AppContent`)

**Remove:**
- `CURRENT_DATA_VERSION` (migra para `useAppStartup`)
- Os 6 `useEffect` de domínio
- O `useMemo` de `currentFullDeviceName`
- Imports que ficam exclusivos nos novos hooks:
  - `getDb`, `clearFirestoreCache`, `setDoc`, `doc` (firestore)
  - `APP_VERSION as LOCAL_CODE_VERSION`
  - `applyGoldenRule`

**Adiciona:**
- `useAppStartup({ partners, playerQueue, userProfile, matchSettings, setModalConfig })`
- `const currentFullDeviceName = useAppDeviceName(matchSettings.deviceLabel, userProfile.nickname)`

**Mantém:**
- Todos os hooks de domínio (`useAppAuth`, `useAppConfig`, `useHistoryCloud`, etc.)
- `useLiveFirestoreSync`, `useWakeLock`, `useOnlineSync`
- `return <AppScreenRouter ... />`
- `App` root com providers

---

## Resultado esperado

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `src/App.tsx` | 264 ln | **~110–120 ln** ✅ |
| `src/hooks/useAppStartup.ts` | — | novo (~100 ln) |
| `src/hooks/useAppDeviceName.ts` | — | novo (~10 ln) |

---

## Verificação

```bash
pnpm test        # 64/64
pnpm lint        # 0 erros
pnpm depcruise   # 0 violações
```

Resultado esperado do depcruise: módulos sobem de 158 → ~160 (2 novos hooks); deps sobem proporcionalmente; **0 violações**.

---

## Open Questions

> [!NOTE]
> `useAppStartup` não retorna nada — é puro side-effect. Se no futuro algum
> effect precisar expor um valor (ex: `migrationDone`), adicionar ao retorno sem
> quebrar o contrato atual.

> [!NOTE]
> O `useEffect` de `playerQueue` tem `eslint-disable react-hooks/exhaustive-deps`
> intencional (depende de `userProfile.email` mas usa `playerQueue` dentro). Manter
> o comentário ao migrar para `useAppStartup`.

> [!IMPORTANT]
> Após esta fase, `App.tsx` conterá apenas: imports, `AppContent` (hooks + render) e
> `App` root. Qualquer lógica nova de inicialização deve ir para `useAppStartup`,
> não voltar para `App.tsx`.
