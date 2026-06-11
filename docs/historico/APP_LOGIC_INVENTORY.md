# Inventário de lógica — `src/App.tsx` (Passo 13, Fase 1)

> **Data:** 2026-05-19  
> **Branch:** `refactor/dependency-cruiser` (ou `refactor/app-hooks`)  
> **Fonte:** análise estática de `App.tsx` (~2.847 linhas)  
> **Roteiro:** [refatoracao_dependency-cruiser.md](./refatoracao_dependency-cruiser.md) · [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. Resumo executivo

O `App.tsx` não é só “UI grande”: é um **orquestrador legado** que duplica estado já existente em contextos.

| Onde vive o estado real | O que o `App` ainda faz |
|-------------------------|-------------------------|
| `GameContext` | Espelha `userProfile`, `partners`, `matchSettings`, `gameState`, `matchHistory` + ~15 handlers via `*LocalRef` |
| `LiveContext` | Espelha `livePapel`, `activeLives`, `fbSyncStatus`, refs de controle + `LiveBridge` |
| `UIContext` | Consome direto (`currentScreen`, modais, fila, juiz) — OK |
| Só no `App` | Auth bootstrap, torneios, histórico cloud, listeners Firestore gigantes, router JSX |

**Causa raiz do tamanho:** `GameProvider` / `LiveProvider` montados **dentro** de `AppInner` → impossível `useGame()` no topo → padrão **Bridge + espelho** (~linhas 230–560 e 2770–2833).

**Prioridade de extração:** ~~Fase 2 (eliminar bridges)~~ **Feito (2026-05-19):** `GameLiveProviderStack` + `AppContent` usa `useGame()` / `useLive()`; removidos `GameBridge` / `LiveBridge` e espelhos de game/live. Sync mínimo `GameLivePropsSync` só para props do `LiveProvider` (ciclo Game↔Live).

---

## 2. Mapa do arquivo (por linhas)

| Linhas (aprox.) | Bloco | Linhas | Destino sugerido (Fase) |
|----------------|-------|--------|-------------------------|
| 1–49 | Imports (telas, infra, utils, contexts) | 49 | Reduzir após Fase 6 |
| 50–52 | `CURRENT_DATA_VERSION` | 3 | `useGameRules` / migração em `GameContext` (4) |
| 53–79 | `getUrlParams`, `getInitialScreen` | 27 | `utils/appNavigation.ts` (3) |
| 81–116 | `LogViewer` | 36 | `components/LogViewer.tsx` (3) |
| 130–162 | `AppInner` início + `useUI` + `useWakeLock` | 33 | `AppContent` (2) |
| 163–228 | Auth ready, app-ready, `appUrl`, spectator URL state | 66 | `useAppAuth`, `useAppConfig` (5) |
| 230–266 | Espelho `userProfile` + logger + liveLogs locais | 37 | Remover com Fase 2 |
| 267–425 | Espelhos `matchSettings`, `gameState`, Live (refs proxy) | 159 | Remover com Fase 2 |
| 428–507 | `handleLiveReady` / `handleLiveUpdate` | 80 | Remover com Fase 2 |
| 509–565 | Proxies handlers Game (`*LocalRef`) | 57 | Telas usam `useGame()` (2) |
| 566–781 | Effects: evento ativo, comms, migração LS, PWA, referral | 216 | Hooks 5 + `useGameRules` (4–5) |
| 783–867 | `handleCheckUpdate` | 85 | `useAppConfig` (5) |
| 868–928 | Effects settings persist, `targetListenPin` useMemo | 61 | `useLiveFirestoreSync` (5) |
| 929–961 | Listener placar público (`public-scoreboard`) | 33 | `useDeepLinkScreen` (6) |
| 963–1203 | **Listener principal** `live_matches/{pin}` | 241 | `LiveContext` ou `useLiveFirestoreSync` (5) |
| 1207–1228 | Perda de controle → modal | 22 | `LiveContext` (5) |
| 1231–1267 | Subscription `live_matches` collection | 37 | `LiveContext` (5) |
| 1272–1356 | `cloudLiveExists`, debounce mirroring | 85 | `LiveContext` (5) |
| 1357–1691 | Heartbeat controllers, observer register | 335 | `LiveContext` (5) |
| 1694–1725 | `fbSyncStatus` timer, auto scoreboard mode | 32 | `useScoreboardEngine` / Live (4–5) |
| 1727–1800 | Espelho `matchHistory`, tabs, clear/import history | 74 | `useHistoryCloud` (5) |
| 1802–1899 | Sync histórico, online, remote match | 98 | `useHistoryCloud`, `useOnlineSync` (5) |
| 1900–1999 | Remote connect, juiz, partners, torneio parceiro | 100 | módulos `partners` / `events` (5) |
| 1996–2094 | `handleLogout`, `handleJoinTournament`, `persistMatchSettings` | 99 | `useTournamentSession`, `useGameRules` (4–5) |
| 2096–2320 | Pause, init game, offline exit | 225 | `useScoreboardEngine`, `GameContext` (4) |
| 2321–2768 | **JSX** providers, drawer, modais, **14 telas** | 448 | `AppScreenRouter` (6) |
| 2770–2833 | `GameBridge`, `LiveBridge` | 64 | **Remover** (2) |
| 2835–2847 | `App` root + `UIProvider` | 13 | Manter enxuto (7) |

---

## 3. Componentes e bridges

| Símbolo | Linha | Papel | Ação Fase 2 |
|---------|-------|-------|-------------|
| `LogViewer` | 81 | Debug de logs | Extrair (3) |
| `AppInner` | 130 | Monólito | → `AppContent` |
| `GameBridge` | 2779 | Injeta `useGame()` em refs | **Remover** |
| `LiveBridge` | 2811 | Injeta `useLive()` em refs | **Remover** |
| `App` | 2839 | Root | &lt; 30 linhas |

---

## 4. Estado: espelho vs local vs contexto

### 4.1 Já em contexto (não duplicar em hooks novos)

| Estado | Contexto | Espelho no App? |
|--------|----------|-----------------|
| `userProfile` | `GameContext` | Sim (230–242) |
| `partners` | `GameContext` | Sim |
| `matchSettings` | `GameContext` | Sim (267–276) |
| `gameState` | `GameContext` | Sim (278–293) |
| `matchHistory` | `GameContext` | Sim (1727–1738) |
| `historyStack` | `GameContext` | Via ref no bridge |
| Handlers de placar/live | `GameContext` + `LiveContext` | Proxies `*LocalRef` (509–558) |
| `currentScreen`, modais, juiz UI | `UIContext` | Não (direto) |
| `livePapel`, `activeLives`, … | `LiveContext` | Sim (295–370) |

### 4.2 Só no `App` (candidatos a hook ou módulo)

| Estado | Linha (aprox.) | Hook / destino |
|--------|----------------|----------------|
| `authReady` | 162 | `useAppAuth` |
| `spectatorMatchId`, `spectatorPin` | 195–196 | `useDeepLinkScreen` |
| `isSyncing`, `isDownloading`, `cloudMatchesCount` | 198–201 | `useHistoryCloud` |
| `isOfflineMode` | 200 | `useOnlineSync` (já existe parcial) |
| `appUrl` | 220–228 | `useAppConfig` |
| `unreadCommsCount` | 218 | `useCommunicationsBadge` |
| `activeEvent`, `registeredEvents`, `userEntryDate` | (vários) | `useTournamentSession` |
| `activeTab`, `adminTab`, `focusMatchId` | 1740–1742 | `AppScreenRouter` / UI |
| `activeCloudMatch` | 206 | remote match (5) |
| `initialReferralPin` | (URL effect) | `useDeepLinkScreen` |

### 4.3 Contagem de proxies

- Referências `*LocalRef` / `ctxSet*Ref`: **~112** ocorrências  
- Handlers estáveis que só delegam: `handleScoreUpdate`, `handleUndo`, `handleLeaveLive`, … (**~15**)

---

## 5. `useEffect` por domínio (~40)

| # | Linhas | Domínio | Descrição |
|---|--------|---------|-----------|
| 1 | 163–170 | Auth | `onAuthStateChanged` → `authReady` |
| 2 | 172–175 | Bootstrap | evento `app-ready` |
| 3 | 177–193 | Config | snapshot `system/config` → `appUrl` |
| 4 | 211–217 | Deep link | reset password → tela auth |
| 5 | 293 | Game | sync `gameStateRef` local |
| 6 | 566–579 | Torneio | persist `activeEvent`, entry date |
| 7 | 581–583 | Torneio | persist `registeredEvents` |
| 8 | 585–603 | Comms | unread Firestore |
| 9 | 610–656 | Migração | `CURRENT_DATA_VERSION`, limpa backups |
| 10 | 658–700 | Infra | quota / Firestore cache errors |
| 11 | 704–709 | Partners | persist `partners` LS |
| 12 | 711–722 | Queue | persist `playerQueue` + cloud metadata |
| 13 | 724–735 | Marketing | referral / joinEvent / force logout URL |
| 14 | 737–741 | UI | override `window.alert` → modal |
| 15 | 743–755 | PWA | prompt instalação em settings |
| 16 | 768–781 | Auth flow | pending join event, auth → settings |
| 17 | 868+ | Settings | (bloco settings / game — ver arquivo) |
| 18 | 878+ | Online | listeners online/offline |
| 19 | 889 | Game | `matchSettingsRef` sync |
| 20 | 932+ | History | sync histórico (deps `matchHistory`) |
| 21 | 963+ | Live | **listener doc** `live_matches/{pin}` |
| 22 | 1207–1228 | Live | perda de controle → modal |
| 23 | 1231–1267 | Live | collection `live_matches` ativas |
| 24 | 1272+ | Live | debounce `cloudLiveExists` |
| 25 | 1357–1691 | Live | heartbeat / observer register |
| 26 | 1694–1699 | Live UI | clear `fbSyncStatus` |
| 27 | 1707–1725 | Live UI | auto `isScoreboardMode` observer |
| 28 | 1802+ | History | auto-sync / download triggers |
| 29 | 1855+ | History | cloud count |
| 30 | 1932+ | Spectator | deep link spectator |
| 31 | 1964 | Game | fim de partida → histórico |

> Lista completa de linhas: grep `useEffect(` em `src/App.tsx` ao implementar Fase 5.

---

## 6. Handlers principais

| Handler | Linha (aprox.) | Hoje | Destino |
|---------|----------------|------|---------|
| `handleLiveReady` / `handleLiveUpdate` | 428–507 | Bridge | Remover (2) |
| `handleLeaveLive` … `handleExportData` | 509–558 | Proxy → Game | `useGame()` (2) |
| `handleCheckUpdate` | 783 | App | `useAppConfig` |
| `handleClearAllHistory` | 1749 | App | `useHistoryCloud` |
| `handleImportData` | 1770 | App | `useHistoryCloud` |
| `handleConnectRemote` / `handleRejectRemote` | 1900+ | App | live/game |
| `handleSelectJudgeFromPartners` | 1919 | App | `partners` + UI |
| `handleConfirmPartners` | 1966 | App | `partners/services` |
| `handleAutoRegisterPartner` | 1970 | App | já em Game/partners |
| `handleLogout` | 1996 | App | `useAppAuth` |
| `handleJoinTournament` | 2032 | App | `useTournamentSession` |
| `persistMatchSettings` | 2067 | App | `useGameRules` |
| `handleTogglePause` | 2096 | App | `useScoreboardEngine` |
| `initGameState` (proxy) | 554–555 | GameContext | `useGame()` |
| `handleExitSpectator` | 1962 | App | `useDeepLinkScreen` |

---

## 7. Router de telas (`currentScreen`)

| `Screen` | Linha JSX (aprox.) | Props pesadas? | Já usa contexto? |
|----------|-------------------|----------------|------------------|
| `spectator` | 2490 | Média | Parcial |
| `public-scoreboard` | 2492–2511 | Stubs vazios no Scoreboard | Parcial |
| `auth` | 2513 | Média | Não |
| `settings` | 2525 | **Alta** (~30 props) | Parcial (`useGame` comentado em migração) |
| `partners` | 2557 | Alta | Parcial |
| `new-game` | 2587 | Alta | Parcial |
| `admin` | 2612 | Média | Não |
| `scoreboard` | 2624 | Média (handlers proxy) | **Sim** (`useGame`, `useLive`) |
| `location` | 2760 | Baixa | Não |
| `tournaments` | 2761 | Média | Não |
| `event-detail` | 2762 | Alta | Parcial |
| `communications` | 2763 | Baixa | Não |

**Telas prioritárias para deixar de receber props do App:** `settings`, `new-game`, `partners`, `event-detail`.

---

## 8. Voz (escopo `useVoiceControl`)

Referências diretas no `App.tsx` (poucas):

| Linha | Uso |
|-------|-----|
| 154 | `voiceLogs`, `setVoiceLogs` — `UIContext` |
| 1135–1137 | merge `matchConfig` voice fields no listener live |
| 2271 | prop `useGeminiVoice: false` no Scoreboard |
| 2759 | pass-through para Scoreboard |

**Lógica real de voz:** `ScoreboardScreen` + `useScoreAnnouncer` / `usePickleballAnnouncer` / `useGeminiReferee`.  
`useVoiceControl` deve unificar **prefs** (`matchSettings` + `localStorage` `myPlacar_LocalVoice*`) e **logs** (`UIContext`), não reimplementar announcers.

---

## 9. Mapeamento → hooks do Passo 13

| Hook (roteiro) | Responsabilidade | Linhas / blocos principais |
|----------------|------------------|----------------------------|
| **`useGameRules`** | Settings persist, migração versão, `canStartMatch`, sport engine | 50–52, 610–656, 2067–2089, 889 |
| **`useScoreboardEngine`** | Orquestração placar (preferir reexportar `useGame` + efeitos fim de partida) | 1964, 2096–2309, proxies 539–555 |
| **`useVoiceControl`** | Prefs voz + `voiceLogs` | 154, 1135–1137, Scoreboard props |
| `useAppAuth` | `authReady`, fluxo login URL | 163–170, 768–781, 1996–2028 |
| `useAppConfig` | `appUrl`, `handleCheckUpdate` | 177–193, 783–867 |
| `useHistoryCloud` | sync/download/delete/count | 1749–1800, 1802–1899 |
| `useTournamentSession` | eventos, join, exit | 566–583, 2032–2094 |
| `useLiveFirestoreSync` | listeners 929–1203, 1231–1691 | mover para `LiveContext` se possível |
| `useCommunicationsBadge` | unread | 585–603 |
| `useDeepLinkScreen` | URL params, spectator, public board | 53–79, 929–961, 1962 |

---

## 10. Riscos por fase

| Fase | Risco | Mitigação |
|------|-------|-----------|
| 2 | Regressão live multi-device | Teste manual owner / controller / observer; não misturar com voz |
| 4 | Hook “deus” | Um hook por domínio; não extrair em cima de espelho |
| 5 | Listener Firestore | PR isolado; manter refs estáveis |
| 6 | Props quebradas | Migrar uma tela por PR |
| Todas | depcruise | `pnpm depcruise` após cada PR |

---

## 11. PRs sugeridos (referência)

1. **PR-A** — Fase 1 apenas (este doc) + doc roteiro  
2. **PR-B** — Fase 2 bridges  
3. **PR-C** — Fase 3 `LogViewer`, navigation utils  
4. **PR-D** — `useGameRules` + Settings/NewGame  
5. **PR-E** — `useScoreboardEngine` + efeitos fim de partida  
6. **PR-F** — `useVoiceControl`  
7. **PR-G** — `useHistoryCloud` + `useTournamentSession`  
8. **PR-H** — Live sync para `LiveContext`  
9. **PR-I** — `AppScreenRouter` + slim `App.tsx`

---

## 12. Verificação Fase 1

- [x] Blocos por linha documentados  
- [x] Espelhos vs contexto listados  
- [x] `useEffect` agrupados por domínio  
- [x] Handlers e telas mapeados  
- [x] Destino de cada hook nomeado  
- [ ] Revisão com segundo dev (opcional)

**Fase 3 (2026-05-19):** extraídos `src/components/LogViewer.tsx`, `src/components/AppModal.tsx`, `src/utils/appNavigation.ts`. `App.tsx` ~2.361 linhas.

**Fase 4 (2026-05-19):** `useGameRules`, `useScoreboardEngine`, `useVoiceControl` — lint/test/depcruise OK.

**Fase 5 (2026-05-19):** `useAppAuth`, `useAppConfig`, `useCommunicationsBadge`, `useTournamentSession`, `useHistoryCloud`, `useAppLogout`, `useLiveFirestoreSync`, `useDeepLinkScreen`, `useRemoteCloudMatch`, `useAppOfflineMode`. `App.tsx` ~824 linhas.

**Próximo passo:** Fase 6 — `AppScreenRouter`.

---

*Gerado na Fase 1 do Passo 13. Atualizar este arquivo ao concluir cada fase (marcar blocos migrados).*
