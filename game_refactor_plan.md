# Plano de Refatoração: Módulo Game (MyPlacar)

**Objetivo:** Centralizar e isolar o estado do jogo (`gameState`, `matchSettings`, `userProfile`) e os handlers de ação relacionados (`handleControlLive`, `handleCloseCloudLive`, `handleObserveLive`, `handleSyncScoreboard`) em um contexto próprio (`GameContext`), continuando a redução do acoplamento excessivo do `App.tsx`.

**Contexto:** Esta refatoração é a continuação natural da Fase Live (Fases 1–7). O padrão LiveBridge, os proxies e os estados espelho criados naquelas fases serão progressivamente substituídos por uma arquitetura mais limpa à medida que o `GameContext` absorver o estado que hoje força essas pontes.

**Estratégia de Continuidade:**
Este documento serve como a "fonte da verdade". A cada passo concluído, este arquivo será atualizado. Caso o chat atual seja encerrado, basta enviar este documento (ou o texto dele) no novo chat e pedir: *"Retome a refatoração a partir do próximo passo pendente."*

---

## 🚦 Status Atual: Fase 4 concluída ✅. Próximo: Passo 5.1 — Migrar `handleLeaveLive` e `finalizeMatchInternal`.

---

## 🗺️ O que está no `App.tsx` hoje (escopo desta refatoração)

### Estados candidatos ao `GameContext`
- `gameState` / `setGameState` — estado central do jogo
- `gameStateRef` — espelho ref de `gameState`
- `matchSettings` / `setMatchSettings` — configurações da partida
- `userProfile` / `setUserProfile` — perfil do usuário logado
- `matchHistory` / `matchHistoryRef` — histórico de partidas
- `partners` / `setPartners` — parceiros cadastrados

### Handlers candidatos ao `GameContext` (dependem só de estado do jogo)
- `handleControlLive` — assume controle da live
- `handleCloseCloudLive` — encerra a live
- `handleObserveLive` — entra como observer
- `handleSyncScoreboard` — sincroniza placar manualmente
- `handleDeleteJudge` / `handleAddJudge` — gestão do juiz
- `handleLeaveLive` — saída voluntária da live
- `finalizeMatchInternal` — finaliza a partida localmente

### Estados que ficam no `App.tsx` (UI pura, sem lógica de jogo)
- `currentScreen` / `setCurrentScreen`
- `modalConfig` / `setModalConfig`
- `showLiveControlOverlay`, `isMenuOpen`, `showInstallPwa`
- `isSyncing`, `isDownloading`, `isOfflineMode`
- `authReady`, `showLogViewer`

---

## 📝 Fases da Implementação

### Fase 1: Fundação do GameContext (Baixo Risco) ✅ CONCLUÍDA
**Objetivo:** Criar a estrutura de pastas e a casca do novo contexto sem alterar nada no `App.tsx`.

- [x] Criar a pasta `src/modules/game/`.
- [x] Criar `src/modules/game/types.ts` com a interface `GameContextValue` completa.
  - Inclui: `gameState`, `setGameState`, `gameStateRef`, `matchSettings`, `setMatchSettings`, `userProfile`, `setUserProfile`, `matchHistory`, `matchHistoryRef`, `partners`, `setPartners`.
  - Tipos extraídos dos imports reais do `App.tsx`: `GameState`, `MatchSettings` (de `./types.ts`), `UserProfile` (de `@modules/auth`), `MatchHistoryItem` (de `@modules/history`), `Partner` (de `@modules/partners`).
- [x] Criar `src/modules/game/GameContext.tsx` com o `<GameProvider>` mínimo (recebe todos os valores como props e os repassa ao contexto, sem lógica própria ainda).
- [x] Criar `src/modules/game/useGame.ts` — hook análogo ao `useLive()`, com erro explícito se chamado fora do provider.
- [x] Criar `src/modules/game/index.ts` — barrel de exportações (`GameProvider`, `useGame`, `GameContextValue`).
- **Resultado:** `tsc --noEmit` retornou exit code 0. Zero erros. `App.tsx` não foi modificado.

---

### Fase 2: Instalar o `<GameProvider>` no `App.tsx` (Baixo Risco) ✅ CONCLUÍDA
**Objetivo:** Montar o provider na árvore sem remover nenhum estado ainda.

- [x] Envolver o JSX do `AppInner` com `<GameProvider>`, passando `gameState`, `setGameState`, `gameStateRef`, `matchSettings`, `setMatchSettings`, `userProfile`, `setUserProfile`, `matchHistory`, `matchHistoryRef`, `partners`, `setPartners` como props.
- [x] Os estados permanecem declarados no `App.tsx`. O provider existirá mas ninguém o consome ainda.
- **Resultado:** `tsc --noEmit` passou. App funciona normalmente.

---

### Fase 3: Conectar o `ScoreboardScreen` ao `GameContext` (Risco Médio) ✅ CONCLUÍDA
**Objetivo:** Remover as props de jogo do `ScoreboardScreen`, que passará a ler diretamente do contexto.

#### Passo 3.1 — Adicionar `useGame()` no `ScoreboardScreen` (somente leitura) ✅
- [x] Adicionar `useGame()` no `ScoreboardScreen.tsx`.
- [x] Criar variáveis `effective*` para `gameState` lendo do contexto com fallback para prop.
- [x] Substituir todos os usos no JSX pelas variáveis `effective*` (203 ocorrências migradas).
- Props **não removidas** neste passo.
- **Resultado:** `tsc --noEmit` passou. Componente funciona com ou sem props.

#### Passo 3.2 — Remover as props de jogo do `ScoreboardScreen` ✅
- [x] Removidas `gameState` e `userProfile` da interface `Props` do `ScoreboardScreen`.
- [x] Removido import órfão de `UserProfile` de `../types`.
- [x] `effectiveGameState` passa a ler exclusivamente do `GameContext` (sem fallback para prop).
- [x] Removidas `gameState={gameState!}` e `userProfile={userProfile}` das **duas** chamadas a `<ScoreboardScreen>` no `App.tsx` (instância de preview/admin ~linha 3427 e instância principal ~linha 3557).
- **Observação:** `matchSettings` não existia como prop no `ScoreboardScreen` — nenhuma ação necessária. `userProfile` existia na interface mas não era consumida no corpo do componente — removida como prop morta.
- **Resultado:** `tsc --noEmit` passou. ScoreboardScreen testado visualmente.

---

### Fase 4: Migrar os estados para dentro do `GameContext` (Risco Médio)
**Objetivo:** Mover as declarações de `useState`/`useRef` do `App.tsx` para dentro do `GameProvider`, eliminando progressivamente as props do provider.

**Decisão de Arquitetura (revisada no Passo 4.1):** O `<GameProvider>` está montado **dentro** do `return` do `AppInner` — ou seja, o `AppInner` é o pai do provider no JSX e **não pode** chamar `useGame()` no topo do componente. A solução adotada é o padrão **GameBridge**: componente filho do `<GameProvider>` que chama `useGame()` e injeta os valores de volta no `AppInner` via callbacks `onReady`/`onUpdate`, exatamente como o `LiveBridge`. O `AppInner` mantém estados espelho locais para preservar a reatividade de `useMemo`/`useEffect`/`useCallback` existentes.

**Lacuna identificada:** `setMatchHistory` e `persistHistory` não estão no `GameContextValue` atual mas são necessários para consumidores no `App.tsx`. Serão adicionados no Passo 4.0.

---

#### Passo 4.0 — Preparação: extrair `safeJsonParse` e completar `GameContextValue` (Baixo Risco) ✅ CONCLUÍDO
**Por que primeiro:** Todos os passos seguintes dependem disso. `safeJsonParse` é uma função local do `App.tsx` usada nas inicializações lazy de todos os estados candidatos — precisa estar acessível ao `GameContext.tsx` antes de qualquer migração.

- [x] Criar `src/utils/safeJsonParse.ts` extraindo a função `safeJsonParse` do `App.tsx` (incluindo a chamada a `isValidGameState` que ela contém).
- [x] Substituir a definição local no `App.tsx` por um import de `src/utils/safeJsonParse.ts`.
- [x] Adicionar `setMatchHistory: Dispatch<SetStateAction<MatchHistoryItem[]>>` na interface `GameContextValue` em `types.ts`.
- [x] Adicionar `persistHistory: (newList: MatchHistoryItem[]) => void` na interface `GameContextValue` em `types.ts`.
- [x] Refletir as adições no `GameProvider` (props + repasse ao contexto) em `GameContext.tsx`.
- **Validação:** `tsc --noEmit` passou. App funciona normalmente.

---

#### Passo 4.1 — Migrar `userProfile` / `setUserProfile` (Baixo Risco) ✅ CONCLUÍDO
**Por que primeiro entre os estados:** É o mais simples — inicialização de uma linha, sem refs espelho, sem dependências externas.

- [x] Mover o `useState<UserProfile>` para dentro do `GameProvider` (com lógica lazy original preservada).
- [x] Adicionar os imports necessários no `GameContext.tsx`: `safeJsonParse`, `UserProfile`, `useState`.
- [x] Remover `userProfile` e `setUserProfile` das `GameProviderProps` — `Omit<GameContextValue, ...>` aplicado.
- [x] Remover `userProfile={userProfile}` e `setUserProfile={setUserProfile}` do `<GameProvider>` no JSX do `App.tsx`.
- [x] No `App.tsx`: estado espelho `userProfile` + wrapper estável `setUserProfile` sincronizados via `GameBridge` (padrão idêntico ao `LiveBridge` — necessário pois o `<GameProvider>` está dentro do `AppInner`).
- [x] Adicionado componente `GameBridge` no `App.tsx` (filho direto do `<GameProvider>`, antes do restante do JSX).
- **Validação:** `tsc --noEmit` passou. Login, logout e salvamento de perfil funcionam.

---

#### Passo 4.2 — Migrar `partners` / `setPartners` (Baixo Risco) ✅ CONCLUÍDO
**Por que segundo:** Inicialização simples (`safeJsonParse` direto, sem refs, sem dependências cruzadas).

- [x] Mover o `useState<Partner[]>` para dentro do `GameProvider` (lazy init com `safeJsonParse` preservada).
- [x] Adicionar import de `Partner` no `GameContext.tsx`.
- [x] Remover `partners` e `setPartners` das `GameProviderProps` — adicionados ao `Omit<>`.
- [x] Remover `partners={partners}` e `setPartners={setPartners}` do `<GameProvider>` no JSX do `App.tsx`.
- [x] No `App.tsx`: estado espelho `partners` + wrapper estável `setPartners` via `GameBridge`. `onReady`/`onUpdate` expandidos com `ctx.partners`; dep array do `useEffect` atualizado.
- **Validação:** `tsc --noEmit` passou. Cadastro e seleção de parceiros funcionam.

---

#### Passo 4.3 — Migrar `matchSettings` / `setMatchSettings` (Risco Médio) ✅ CONCLUÍDO
**Por que terceiro:** A inicialização lazy é mais complexa (~10 chaves de `localStorage`, chama `isWatchDevice()`), mas autocontida — não depende de outros estados candidatos.

- [x] Mover o bloco `useState<MatchSettings>` (com toda a lógica lazy de `localStorage` + `isWatchDevice`) para dentro do `GameProvider`.
- [x] Adicionar imports no `GameContext.tsx`: `isWatchDevice` (`../../utils/device.ts` — corrigido de `deviceUtils.ts`), `DEFAULT_TENNIS_SETTINGS`, `MatchSettings`.
- [x] `matchSettingsRef` **mantido no `AppInner`** (linha 990) — usado em 3 closures do listener Firestore para evitar closure stale sem `matchSettings` no dep array. Alimentado pelo estado espelho local.
- [x] Remover `matchSettings` e `setMatchSettings` das `GameProviderProps` — adicionados ao `Omit<>`.
- [x] Remover `partners={partners}` e `setPartners={setPartners}` do `<GameProvider>` no JSX do `App.tsx`.
- [x] No `App.tsx`: estado espelho `matchSettings` (init simplificado com `DEFAULT_TENNIS_SETTINGS`) + wrapper estável `setMatchSettings` via `GameBridge`. `onReady`/`onUpdate`/dep array expandidos. Props removidas do `<GameProvider>`.
- **Validação:** `tsc --noEmit` passou. Configurações de partida, brilho, volume e modo relógio funcionam.

---

#### Passo 4.4 — Migrar `gameState` / `setGameState` / `gameStateRef` (Risco Médio) ✅ CONCLUÍDO
**Por que quarto:** Depende de `initPickleballState` e da `safeJsonParse` — ambos já disponíveis após o Passo 4.0. A ref espelho (`gameStateRef`) é simples.

- [x] Mover o `useState<GameState | null>` (com lógica lazy original + check pickleball) para dentro do `GameProvider`.
- [x] Mover o `gameStateRef` e seu `useEffect` espelho para dentro do provider.
- [x] Adicionar imports no `GameContext.tsx`: `useRef`, `useEffect`, `GameState`, `initPickleballState`.
- [x] Remover `gameState`, `setGameState` e `gameStateRef` das `GameProviderProps` — adicionados ao `Omit<>`.
- [x] Remover `gameState={gameState}`, `setGameState={setGameState}` e `gameStateRef={gameStateRef}` do `<GameProvider>` no JSX do `App.tsx`.
- [x] No `App.tsx`: estado espelho `gameState` (init `null`) + `gameStateRef` local + wrapper estável `setGameState` via `GameBridge`. `onReady`/`onUpdate`/dep array do `GameBridge` expandidos com `ctx.gameState`.
- [x] `<LiveProvider>` continua recebendo `gameState={gameState}` e `gameStateRef={gameStateRef}` do estado espelho do `AppInner` — sem alteração necessária.
- **Observação:** `gameStateRef` mantido no `AppInner` como ref espelho local (mesmo padrão do `matchSettingsRef`) — usado em closures de `performExit` e listeners do Firestore que não podem ter `gameState` no dep array.
- **Validação:** `tsc --noEmit` passou. Exit code 0, zero erros.

---

#### Passo 4.5 — Migrar `matchHistory` / `matchHistoryRef` / `setMatchHistory` / `persistHistory` (Risco Médio) ✅ CONCLUÍDO
**Por que por último:** É o estado mais deslocado no arquivo e `persistHistory` — callback que sincroniza estado + ref — precisa ser movido junto e exposto no contexto.

- [x] Mover o `useState<MatchHistoryItem[]>` (com lazy init `safeJsonParse` e sync da ref) para dentro do `GameProvider`.
- [x] Mover o `matchHistoryRef` (`useRef<MatchHistoryItem[]>([])`) para dentro do provider.
- [x] Mover `persistHistory` (`useCallback` que chama `persistLocalHistory`, sincroniza ref e setter) para dentro do provider.
- [x] Adicionar imports no `GameContext.tsx`: `useCallback`, `MatchHistoryItem` (de `@modules/history`), `persistLocalHistory` (de `@modules/history`).
- [x] Remover `matchHistory`, `setMatchHistory`, `matchHistoryRef` e `persistHistory` das `GameProviderProps` — adicionados ao `Omit<>`. O provider passa a não ter nenhuma prop de estado.
- [x] Remover as 4 props do `<GameProvider>` no JSX do `App.tsx` — tag reduzida a `<GameProvider>`.
- [x] No `App.tsx`: estado espelho `matchHistory` (init `[]`) + wrapper `setMatchHistory` + wrapper `persistHistory` + proxy `matchHistoryRef` (padrão idêntico ao `activeLivesRef`). `GameBridge.onReady`/`onUpdate`/dep array expandidos.
- **Observação:** `matchHistoryRef` proxy necessário pois é lido em closures de `finalizeMatchInternal`, `downloadHistoryFromFirebase`, `onDeleteMatch` e `useOnlineSync` sem poder adicionar dependências.
- **Validação:** `tsc --noEmit` passou. Exit code 0, zero erros.

---

#### Passo 4.6 — Limpeza das props do `GameProvider` (Baixo Risco) ✅ CONCLUÍDO
**Objetivo:** Após todos os estados migrados, o `<GameProvider>` não deve mais receber nenhuma prop de estado — só `children`.

- [x] `GameProviderProps = Omit<GameContextValue, tudo> & { children }` substituído por `{ children: React.ReactNode }` — clean e legível.
- [x] Destructure do `GameProvider` já continha apenas `children` desde o Passo 4.5 — nenhuma mudança adicional.
- [x] `<GameProvider>` no `App.tsx` já não tem nenhuma prop explícita desde o Passo 4.5 — confirmado.
- **Validação:** `tsc --noEmit` passou. Exit code 0, zero erros.

---

### Fase 5: Migrar os Handlers de Ação para o `GameContext` (Risco Alto)
**Objetivo:** Mover os handlers que dependem exclusivamente de estado do jogo para dentro do provider.
Fatiada em passos para minimizar risco.

#### Passo 5.1 — Migrar `handleLeaveLive` e `finalizeMatchInternal`
- [ ] Mover para o `GameContext.tsx` — são os handlers mais isolados, sem dependência de UI.
- [ ] Expor via `GameContextValue`.
- **Validação:** `tsc --noEmit` passou. Fluxo de saída da live testado.

#### Passo 5.2 — Migrar `handleCloseCloudLive` e `handleDeleteJudge`
- [ ] Mover para o `GameContext.tsx`.
- [ ] As dependências de UI (`setModalConfig`, `setCurrentScreen`) serão recebidas como callbacks ou via um `UIContext` futuro.
- **Validação:** `tsc --noEmit` passou. Encerramento de live testado.

#### Passo 5.3 — Migrar `handleControlLive` e `handleObserveLive`
- [ ] Mover para o `GameContext.tsx` — os maiores e mais complexos.
- [ ] Dependências de UI tratadas da mesma forma que no passo anterior.
- **Validação:** `tsc --noEmit` passou. Fluxo completo de entrada/saída de live testado.

#### Passo 5.4 — Migrar `handleSyncScoreboard`, `handleAddJudge`
- [ ] Mover os handlers restantes relacionados à live.
- **Validação:** `tsc --noEmit` passou. Sincronização de placar e gestão de juiz testados.

---

### Fase 6: Limpeza do `App.tsx` (Baixo Risco)
**Objetivo:** Remover estados, handlers e imports órfãos do `App.tsx` após a migração.

- [ ] Remover declarações de estado migradas para o `GameContext`.
- [ ] Remover o sistema de proxies e bridge do Live que se tornarem desnecessários.
- [ ] Limpar todos os imports não utilizados no `App.tsx`.
- [ ] Atualizar comentários de rastreabilidade.
- **Teste de Validação:** `tsc --noEmit` passou. Teste geral do app.

---

### Fase 7: Documentação e Otimização (Baixo Risco)
**Objetivo:** Revisar e documentar o `GameContext` com o mesmo padrão aplicado ao `LiveContext`.

- [ ] Documentar a interface `GameContextValue` no `types.ts`.
- [ ] Adicionar comentários explicativos nos handlers migrados (decisões de design, casos de borda).
- [ ] Revisar dependências dos `useCallback`/`useMemo` migrados.
- [ ] Verificar se há lógica duplicada entre `GameContext` e `LiveContext` que possa ser unificada.
- **Teste de Validação:** `tsc --noEmit` passou. Nenhuma regressão.

---

## ⚠️ Riscos e Decisões Tomadas

### Onde montar o `<GameProvider>`? ✅ Decidido
O `<GameProvider>` está montado **dentro do `AppInner`**, acima de todo o JSX. O `AppInner` chama `useGame()` diretamente — **sem o padrão bridge**. Isso foi confirmado na análise da Fase 4: o provider não depende de estado do `AppInner` para montar, então a Opção A (mais limpa) é viável sem risco.

### Dependências de UI nos handlers
Os handlers (`handleControlLive`, etc.) chamam `setModalConfig`, `setCurrentScreen` e outros estados de UI que ficam no `App.tsx`. Opções:
- **Callbacks como props** do provider — simples, mas aumenta o acoplamento.
- **UIContext futuro** — cria um terceiro contexto para estados de UI globais (modal, tela atual). Mais limpo a longo prazo.
- **Decisão:** Começar com callbacks como props e avaliar se um `UIContext` faz sentido após a Fase 5.

---

## 🛠️ Instruções para Continuidade (Prompt de Retomada)

Se a sessão cair, inicie um novo chat com o seguinte prompt:

> *"Olá! Eu estou refatorando o módulo Game do meu app (MyPlacar). Nós estávamos seguindo o documento de planejamento `game_refactor_plan.md`. O arquivo de plano indica qual é o próximo passo pendente. Por favor, leia os arquivos relevantes do projeto, valide que o último passo foi implementado corretamente e inicie o desenvolvimento do próximo passo pendente descrito no documento."*

### Arquivos a enviar ao retomar:
- `game_refactor_plan.md` (este arquivo)
- `App.tsx` (versão atual)
- `src/modules/game/GameContext.tsx`
- `src/modules/game/types.ts`
- `src/modules/game/useGame.ts`
- `src/modules/game/index.ts`
- O arquivo da tela sendo refatorada no passo atual (ex: `ScoreboardScreen.tsx`)
