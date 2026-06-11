# Passo 13 — Fase 6: AppScreenRouter

## Objetivo

Extrair todo o JSX de roteamento de telas do `AppContent` para um novo componente
`src/app/AppScreenRouter.tsx`, reduzindo o `App.tsx` significativamente em preparação
para a Fase 7 (meta: < 150 linhas).

## Estado atual

| Arquivo | Linhas |
|---------|--------|
| `src/App.tsx` | **840** |
| `src/app/GameLiveProviderStack.tsx` | 60 |

- `pnpm test`: 64/64 ✅
- `pnpm lint`: OK ✅
- `pnpm depcruise`: 0 violações ✅

---

## O que será extraído para `AppScreenRouter`

### Estado local que migra (`AppContent` → `AppScreenRouter`)

| Estado | Tipo |
|--------|------|
| `isMenuOpen` / `setIsMenuOpen` | `boolean` |
| `activeTab` / `setActiveTab` | `Tab` |
| `adminTab` / `setAdminTab` | `AdminTab` |
| `focusMatchId` / `setFocusMatchId` | `string \| null` |
| `isUpdatingVersion` / `setIsUpdatingVersion` | `boolean` |
| `showInstallPwa` / `setShowInstallPwa` | `boolean` |
| `installPromptShownSession` / `setInstallPromptShownSession` | `boolean` |
| `showLogViewer` / `setShowLogViewer` | `boolean` |
| `_versionTapCount` / `setVersionTapCount` | `number` |
| `initialConfirmDeleteJudge` / `setInitialConfirmDeleteJudge` | `boolean` |
| `versionTapTimerRef` | `useRef` |

### Handlers que migram
- `handleVersionTap`
- `handleSelectJudgeFromPartners`
- `handleConfirmPartners`
- `handleAutoRegisterPartner`
- `handleAddTournamentPartner`
- `initialReferralPin` (useMemo)

### Hooks chamados direto no `AppScreenRouter` (context / sem side-effect próprio)
- `useUI()` — contexto, sem re-subscription
- `useGame()` — contexto, sem re-subscription
- `useLive()` — contexto, sem re-subscription
- `useGameRules()` — deriva de context, sem side effects
- `useScoreboardEngine()` — deriva de context, sem side effects
- `useVoiceControl()` — lê localStorage, sem listener persistente
- `useAppLogger()` — singleton logger, sem listener
- `useInstallPwa()` — recebe o deferredPrompt do evento de browser

### Props recebidas de `AppContent` (hooks com estado/side-effects — chamados UMA vez só)

```typescript
interface AppScreenRouterProps {
  // useAppAuth
  authReady: boolean;
  // useAppConfig
  appUrl: string;
  newAppUrl: string;
  isServiceInterrupted: boolean;
  handleCheckUpdate: () => void;
  // useHistoryCloud
  isSyncing: boolean;
  isDownloading: boolean;
  cloudMatchesCount: number;
  syncHistoryToFirebase: (arg?: unknown, force?: boolean) => void;
  downloadHistoryFromFirebase: () => void;
  handleClearAllHistory: () => void;
  handleImportData: () => void;
  // useTournamentSession
  activeEvent: TournamentEvent | null;
  userEntryDate: string | null;
  registeredEvents: EventRegistration[];
  handleJoinTournament: (...) => void;
  handleExitTournament: () => void;
  handleSelectEvent: (ev: TournamentEvent) => void;
  clearTournamentSession: () => void;
  // useAppLogout
  handleLogout: () => void;
  // useDeepLinkScreen
  initialSpectatorPin: string;
  spectatorMatchId: string | null;
  spectatorPin: string | null;
  setSpectatorPin: (p: string | null) => void;
  handleExitSpectator: () => void;
  initialReferralPin: string;    // ← string derivada do LS
  // useRemoteCloudMatch
  activeCloudMatch: unknown;
  handleConnectRemote: () => void;
  handleRejectRemote: () => void;
  // useAppOfflineMode
  isOfflineMode: boolean;
  setIsOfflineMode: (v: boolean) => void;
  handleOfflineMode: () => void;
  handleExitOffline: () => void;
  // useCommunicationsBadge
  unreadCommsCount: number;
  // computed
  currentFullDeviceName: string;
  deviceId: string;
}
```

> [!NOTE]
> `setIsUpdatingVersion` é prop **interna** ao router — o `AuthScreen` chama
> `setIsUpdatingVersion` e `handleCheckUpdate`, por isso ambos já estão nas props
> recebidas. O `isUpdatingVersion` e o overlay de "Atualizando sistema" ficam
> **dentro** do `AppScreenRouter`.

---

## Arquivos alterados

### [NEW] `src/app/AppScreenRouter.tsx`
- Define a interface `AppScreenRouterProps`
- Chama os hooks de contexto diretamente (`useUI`, `useGame`, `useLive`, etc.)
- Contém todo o JSX das 14 telas + overlays + `NavigationDrawer` + modais globais
- Contém o estado local e os handlers migrados
- Contém o `useEffect` do `judgePinInput` (lookup de juiz por PIN — puro UI)

### [MODIFY] `src/App.tsx` (`AppContent`)
- Remove o bloco JSX (linhas ~453–825)
- Remove os estados locais migrados
- Remove os handlers migrados
- Passa as props necessárias para `<AppScreenRouter />`
- Mantém: todos os `useEffect` de domínio, `useLiveFirestoreSync`, `useWakeLock`, `useOnlineSync`

---

## Verificação

```bash
pnpm test        # 64/64
pnpm lint        # 0 erros
pnpm depcruise   # 0 violações
```

Resultado esperado de `App.tsx`: **≈ 250–300 linhas** (Fase 7 levará a < 150).

---

## Open Questions

> [!IMPORTANT]
> **Decisão de design:** `AppScreenRouter` receberá os valores de hooks com estado via props
> (abordagem segura, sem risco de double-subscription). Em uma Fase 7 futura pode-se
> avaliar criar contextos específicos ou mover esses hooks para dentro do router.

> [!NOTE]
> O `useEffect` de `judgePinInput` (lookup Firestore do juiz) está acoplado ao estado
> do juiz que fica no `UIContext`. Ele pode ir para o `AppScreenRouter` pois seu único
> efeito colateral é uma chamada `getDoc` sem listener persistente.
