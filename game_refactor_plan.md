# Plano de Refatoração: Módulo Game (MyPlacar)

**Objetivo:** Centralizar e isolar o estado do jogo (`gameState`, `matchSettings`, `userProfile`) e os handlers de ação relacionados (`handleControlLive`, `handleCloseCloudLive`, `handleObserveLive`, `handleSyncScoreboard`) em um contexto próprio (`GameContext`), continuando a redução do acoplamento excessivo do `App.tsx`.

**Contexto:** Esta refatoração é a continuação natural da Fase Live (Fases 1–7). O padrão LiveBridge, os proxies e os estados espelho criados naquelas fases serão progressivamente substituídos por uma arquitetura mais limpa à medida que o `GameContext` absorver o estado que hoje força essas pontes.

**Estratégia de Continuidade:**
Este documento serve como a "fonte da verdade". A cada passo concluído, este arquivo será atualizado. Caso o chat atual seja encerrado, basta enviar este documento (ou o texto dele) no novo chat e pedir: *"Retome a refatoração a partir do próximo passo pendente."*

---

## 🚦 Status Atual: Fase 6 em progresso. Passo 6.1 — `userProfile` ✅ concluído (5 telas migradas). Próximo: `matchSettings`.

---

## 🗺️ O que está no `App.tsx` hoje (escopo desta refatoração)

### Estados candidatos ao `GameContext`
- `gameState` / `setGameState` — estado central do jogo ✅ migrado (Fase 4)
- `gameStateRef` — espelho ref de `gameState` ✅ migrado (Fase 4)
- `matchSettings` / `setMatchSettings` — configurações da partida ✅ migrado (Fase 4)
- `userProfile` / `setUserProfile` — perfil do usuário logado ✅ migrado (Fase 4)
- `matchHistory` / `matchHistoryRef` — histórico de partidas ✅ migrado (Fase 4)
- `partners` / `setPartners` — parceiros cadastrados ✅ migrado (Fase 4)

### Handlers candidatos ao `GameContext` (dependem só de estado do jogo)
> ⚠️ **Análise da Fase 5 (Passo 5.1):** Nenhum dos handlers abaixo é autossuficiente com o `GameContext` isolado. Todos dependem de pelo menos uma das seguintes fontes externas:
> - `resolveTargetPin` / `isOriginalOwner` / `activeLives` — vêm do `LiveContext`
> - `setModalConfig` / `setCurrentScreen` / `setShowLiveControlOverlay` — estados de UI do `AppInner`
> - `setPlayerQueue` — estado local do `AppInner`
>
> **Decisão:** A Fase 5 foi bloqueada até que um `UIContext` seja criado (ver Fase 5 revisada abaixo). A migração dos handlers será retomada após a Fase 6.

- `handleControlLive` — assume controle da live ⏸ bloqueado (deps: `resolveTargetPin`, `isOriginalOwner`, `setModalConfig`, `setCurrentScreen`)
- `handleCloseCloudLive` — encerra a live ⏸ bloqueado (deps: `resolveTargetPin`, `ctxIsClosingLiveRef`, `setShowLiveControlOverlay`, `setModalConfig`, `setCurrentScreen`)
- `handleObserveLive` — entra como observer ⏸ bloqueado (deps: `resolveTargetPin`, `isOriginalOwner`, `setModalConfig`, `setCurrentScreen`)
- `handleSyncScoreboard` — sincroniza placar manualmente ⏸ bloqueado (deps: `resolveTargetPin`, `isOriginalOwner`, `activeLives`, `ctxSetLiveLogs`, `setModalConfig`, `setShowLiveControlOverlay`)
- `handleDeleteJudge` — gestão do juiz ⏸ bloqueado (deps: `setShowLiveControlOverlay`, `setModalConfig`)
- `handleAddJudge` — gestão do juiz ⏸ bloqueado (deps: `setModalConfig`, `setIsSavingJudge`, `setJudgePinInput`)
- `handleLeaveLive` — saída voluntária da live ⏸ bloqueado (deps: `resolveTargetPin`, `isOriginalOwner`, `activeLives`)
- `finalizeMatchInternal` — finaliza a partida localmente ⏸ bloqueado (deps: `resolveTargetPin`, `setPlayerQueue`)

### Estados que ficam no `App.tsx` (UI pura, sem lógica de jogo)
- `currentScreen` / `setCurrentScreen`
- `modalConfig` / `setModalConfig`
- `showLiveControlOverlay`, `isMenuOpen`, `showInstallPwa`
- `isSyncing`, `isDownloading`, `isOfflineMode`
- `authReady`, `showLogViewer`

---

## 📝 Fases da Implementação

### Fase 1: Fundação do GameContext (Baixo Risco) ✅ CONCLUÍDA

- [x] Criar a pasta `src/modules/game/`.
- [x] Criar `src/modules/game/types.ts` com a interface `GameContextValue` completa.
- [x] Criar `src/modules/game/GameContext.tsx` com o `<GameProvider>` mínimo.
- [x] Criar `src/modules/game/useGame.ts` — hook com erro explícito se chamado fora do provider.
- [x] Criar `src/modules/game/index.ts` — barrel de exportações.
- **Resultado:** `tsc --noEmit` exit code 0. `App.tsx` não modificado.

---

### Fase 2: Instalar o `<GameProvider>` no `App.tsx` (Baixo Risco) ✅ CONCLUÍDA

- [x] Envolver o JSX do `AppInner` com `<GameProvider>` passando todos os estados como props.
- [x] Estados permanecem no `App.tsx`. Provider existe mas sem consumidores ainda.
- **Resultado:** `tsc --noEmit` passou. App funciona normalmente.

---

### Fase 3: Conectar o `ScoreboardScreen` ao `GameContext` (Risco Médio) ✅ CONCLUÍDA

#### Passo 3.1 — Adicionar `useGame()` no `ScoreboardScreen` (somente leitura) ✅
- [x] Adicionar `useGame()`, criar variáveis `effective*`, substituir 203 ocorrências no JSX.
- Props **não removidas** neste passo.
- **Resultado:** `tsc --noEmit` passou.

#### Passo 3.2 — Remover as props de jogo do `ScoreboardScreen` ✅
- [x] Removidas `gameState` e `userProfile` da interface `Props`.
- [x] `effectiveGameState` lê exclusivamente do `GameContext`.
- [x] Removidas as props das duas instâncias de `<ScoreboardScreen>` no `App.tsx`.
- **Resultado:** `tsc --noEmit` passou. ScoreboardScreen testado visualmente.

---

### Fase 4: Migrar os estados para dentro do `GameContext` (Risco Médio) ✅ CONCLUÍDA

**Decisão de Arquitetura:** Padrão **GameBridge** — componente filho do `<GameProvider>` que chama `useGame()` e injeta os valores de volta no `AppInner` via `onReady`/`onUpdate`, idêntico ao `LiveBridge`. O `AppInner` mantém estados espelho locais para preservar a reatividade existente.

#### Passo 4.0 — Extrair `safeJsonParse` e completar `GameContextValue` ✅ CONCLUÍDO
- [x] Criar `src/utils/safeJsonParse.ts`.
- [x] Adicionar `setMatchHistory` e `persistHistory` à interface `GameContextValue`.
- **Validação:** `tsc --noEmit` passou.

#### Passo 4.1 — Migrar `userProfile` / `setUserProfile` ✅ CONCLUÍDO
- [x] `useState<UserProfile>` movido para o `GameProvider`.
- [x] Espelho + wrapper estável no `AppInner` via `GameBridge`.
- **Validação:** `tsc --noEmit` passou.

#### Passo 4.2 — Migrar `partners` / `setPartners` ✅ CONCLUÍDO
- [x] `useState<Partner[]>` movido para o `GameProvider`.
- [x] Espelho + wrapper estável no `AppInner` via `GameBridge`.
- **Validação:** `tsc --noEmit` passou.

#### Passo 4.3 — Migrar `matchSettings` / `setMatchSettings` ✅ CONCLUÍDO
- [x] `useState<MatchSettings>` com lógica lazy de localStorage movido para o `GameProvider`.
- [x] Espelho + wrapper + `matchSettingsRef` local no `AppInner` via `GameBridge`.
- **Validação:** `tsc --noEmit` passou.

#### Passo 4.4 — Migrar `gameState` / `setGameState` / `gameStateRef` ✅ CONCLUÍDO
- [x] `useState<GameState | null>` com check pickleball movido para o `GameProvider`.
- [x] Espelho + `gameStateRef` local + wrapper no `AppInner` via `GameBridge`.
- **Observação:** `gameStateRef` local mantido — usado em closures de `performExit` e listeners do Firestore.
- **Validação:** `tsc --noEmit` passou.

#### Passo 4.5 — Migrar `matchHistory` / `matchHistoryRef` / `persistHistory` ✅ CONCLUÍDO
- [x] `useState<MatchHistoryItem[]>`, `matchHistoryRef` e `persistHistory` movidos para o `GameProvider`.
- [x] Espelho + wrappers + proxy `matchHistoryRef` no `AppInner` via `GameBridge`.
- **Validação:** `tsc --noEmit` passou.

#### Passo 4.6 — Limpeza das props do `GameProvider` ✅ CONCLUÍDO
- [x] `GameProviderProps = { children: React.ReactNode }` — limpo, sem `Omit`.
- [x] `<GameProvider>` no `App.tsx` sem nenhuma prop explícita.
- **Validação:** `tsc --noEmit` passou.

---

### Fase 5: Migrar os Handlers de Ação para o `GameContext` ⏸ BLOQUEADA
**Objetivo original:** Mover os handlers que dependem exclusivamente de estado do jogo para dentro do provider.

**Por que está bloqueada:** A análise do Passo 5.1 revelou que **todos** os handlers candidatos têm dependências externas ao `GameContext`:

| Handler | Dependências bloqueantes |
|---|---|
| `finalizeMatchInternal` | `resolveTargetPin` (Live), `setPlayerQueue` (UI) |
| `handleLeaveLive` | `resolveTargetPin`, `isOriginalOwner`, `activeLives` (Live) |
| `handleCloseCloudLive` | `resolveTargetPin`, `ctxIsClosingLiveRef`, `setShowLiveControlOverlay`, `setModalConfig`, `setCurrentScreen` (Live/UI) |
| `handleDeleteJudge` | `setShowLiveControlOverlay`, `setModalConfig` (UI) |
| `handleAddJudge` | `setModalConfig`, `setIsSavingJudge`, `setJudgePinInput` (UI) |
| `handleSyncScoreboard` | `resolveTargetPin`, `isOriginalOwner`, `activeLives`, `ctxSetLiveLogs`, `setModalConfig`, `setShowLiveControlOverlay` (Live/UI) |
| `handleControlLive` | `resolveTargetPin`, `isOriginalOwner`, `deviceId`, `setModalConfig`, `setCurrentScreen` (Live/UI) |
| `handleObserveLive` | `resolveTargetPin`, `isOriginalOwner`, `setModalConfig`, `setCurrentScreen` (Live/UI) |

**Decisão:** Não injetar dependências externas via props no `GameContext`. A Fase 5 será retomada após a criação de um `UIContext`.

#### Passo 5.1 — Criar `UIContext` (pré-requisito) 🔜
- [ ] Criar `src/modules/ui/UIContext.tsx` com `modalConfig`/`setModalConfig`, `currentScreen`/`setCurrentScreen`, `showLiveControlOverlay`/`setShowLiveControlOverlay`.
- [ ] Montar `<UIProvider>` acima do `<GameProvider>` na árvore.
- [ ] Expor `useUI()` hook.

#### Passo 5.2 — Migrar `handleLeaveLive` e `finalizeMatchInternal`
- [ ] Mover para o `GameContext.tsx` após `UIContext` disponível.
- [ ] `deviceId` recalculado dentro do `GameContext` com a lógica do `getDeviceId()`.
- [ ] Expor via `GameContextValue`.

#### Passo 5.3 — Migrar `handleCloseCloudLive` e `handleDeleteJudge`
- [ ] Consumir `useUI()` para deps de UI.

#### Passo 5.4 — Migrar `handleControlLive` e `handleObserveLive`

#### Passo 5.5 — Migrar `handleSyncScoreboard` e `handleAddJudge`

---

### Fase 6: Limpeza do `App.tsx` ← EM PROGRESSO

#### Passo 6.1 — Remover estados espelho sem consumidores locais ← EM PROGRESSO
**Estratégia:** Migrar telas consumidoras para `useGame()` uma a uma, liberando os espelhos progressivamente.

**Progresso por espelho:**

| Espelho | Status | Telas migradas | Consumidores restantes no AppInner |
|---|---|---|---|
| `matchHistory` | 🔄 Parcial | `LocationScreen` ✅ | exportação de dados, `useOnlineSync`, reset geral, outra tela (linha 3440) |
| `partners` | 🔄 Parcial | `PartnersScreen` ✅, `SettingsScreen` (prop morta) ✅ | sync localStorage, exportação de dados, `finalizeMatchInternal` |
| `userProfile` | ✅ Telas concluídas | `NavigationDrawer` ✅, `NewGameScreen` ✅, `PartnersScreen` ✅, `CommunicationsScreen` ✅, `SettingsScreen` ✅ | hooks internos, closures Firestore, `finalizeMatchInternal`, `LiveProvider`, `EventDetailScreen` (aguarda fonte de `@modules/events`) |
| `matchSettings` | ⏳ Pendente | — | — |
| `gameState` | ⏳ Pendente | — | depende também de refatorar o `LiveProvider` |

> ⚠️ **Nota `userProfile`:** O espelho local no `AppInner` **não foi removido** — ainda alimenta `<LiveProvider userProfile={userProfile}>`, ~25 dep arrays/closures internas e `finalizeMatchInternal`. Só cai na Fase 5. A `EventDetailScreen` ainda recebe `userProfile={userProfile}` no App.tsx pois sua fonte está em `@modules/events` (arquivo não disponível).

> ⚠️ **Nota `PartnersScreen`:** O arquivo real está em `src/modules/partners/screen/PartnersScreen.tsx`. Houve confusão durante a migração pois existem dois arquivos com o mesmo nome — o barrel em `src/screens/PartnersScreen.tsx` (2 linhas, não tocado) e o real em `@modules/partners`. Sempre editar o real.

#### Passo 6.2 — Remover imports órfãos do `App.tsx` ✅ CONCLUÍDO
- [x] `persistLocalHistory` removido do import de `@modules/history` — única ocorrência era a própria declaração; função migrou para o `GameContext` na Fase 4.5.
- [x] `initPickleballState` e `safeJsonParse` mantidos — auditoria confirmou 3 e 4 usos ativos respectivamente.
- **Validação:** `tsc --noEmit` passou.

#### Passo 6.3 — Atualizar comentários de rastreabilidade ✅ CONCLUÍDO
- [x] 14 comentários de migração (`// Passo 4.x`, `// [Passo 5.x]`) substituídos por comentários permanentes explicando **por quê** cada estrutura existe.
- [x] Espelhos do `GameBridge` e do `LiveContext` com justificativas de dependência atualizadas.
- [x] Cabeçalho do `GameContext.tsx` atualizado refletindo o estado final da Fase 4.
- **Validação:** `tsc --noEmit` passou.

---

### Fase 7: Documentação e Otimização (Baixo Risco)

- [ ] Documentar a interface `GameContextValue` no `types.ts`.
- [ ] Revisar dependências dos `useCallback`/`useMemo` migrados.
- [ ] Verificar lógica duplicada entre `GameContext` e `LiveContext`.
- **Teste de Validação:** `tsc --noEmit` passou. Nenhuma regressão.

---

## ⚠️ Riscos e Decisões Tomadas

### Onde montar o `<GameProvider>`? ✅ Decidido
Montado **dentro do `AppInner`**, acima de todo o JSX. Padrão **GameBridge** adotado para injetar valores de volta ao `AppInner`.

### Dependências de UI nos handlers ✅ Decidido
- **Callbacks como props** — descartado: acoplamento invertido.
- **UIContext** — adotado: `src/modules/ui/UIContext.tsx` criado na Fase 5 (Passo 5.1). Os handlers consumirão `useUI()` diretamente.

### `deviceId` no `GameContext` ✅ Decidido
Recalculado **dentro do `GameContext`** com a lógica do `getDeviceId()` — sem receber como prop.

### Fase 5 bloqueada ✅ Decidido
Todos os handlers dependem de `resolveTargetPin` (LiveContext) e/ou estados de UI. Migração aguarda o `UIContext`.

### Passo 6.1 bloqueado ✅ Decidido
Auditoria confirmou que todos os espelhos do `GameBridge` têm consumidores ativos (`<LiveProvider>`, hooks reativos, telas filhas via props). Remoção exige migrar as telas consumidoras para `useGame()` primeiro — mesma estratégia da Fase 3.

---

## 🛠️ Instruções para Continuidade (Prompt de Retomada)

Se a sessão cair, inicie um novo chat com o seguinte prompt:

> *"Olá! Eu estou refatorando o módulo Game do meu app (MyPlacar). Nós estávamos seguindo o documento de planejamento `game_refactor_plan.md`. O arquivo de plano indica qual é o próximo passo pendente. Por favor, leia os arquivos relevantes do projeto, valide que o último passo foi implementado corretamente e inicie o desenvolvimento do próximo passo pendente descrito no documento."*

### Arquivos a enviar ao retomar:
- `game_refactor_plan.md` (este arquivo)
- `App.tsx` (versão atual)
- `src/modules/game/GameContext.tsx`
- `src/modules/game/types.ts`
- Para continuar com `matchSettings`: arquivos das telas que recebem `matchSettings` como prop (identificar no App.tsx com `matchSettings={matchSettings}`)

> ⚠️ **Atenção `PartnersScreen`:** Existem dois arquivos com esse nome. O real está em `src/modules/partners/screen/PartnersScreen.tsx` — sempre enviar e salvar esse, nunca o barrel em `src/screens/PartnersScreen.tsx`.
