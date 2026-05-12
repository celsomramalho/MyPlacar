# Plano de Refatoração: Módulo Game (MyPlacar)

**Objetivo:** Centralizar e isolar o estado do jogo (`gameState`, `matchSettings`, `userProfile`) e os handlers de ação relacionados (`handleControlLive`, `handleCloseCloudLive`, `handleObserveLive`, `handleSyncScoreboard`) em um contexto próprio (`GameContext`), continuando a redução do acoplamento excessivo do `App.tsx`.

**Contexto:** Esta refatoração é a continuação natural da Fase Live (Fases 1–7). O padrão LiveBridge, os proxies e os estados espelho criados naquelas fases serão progressivamente substituídos por uma arquitetura mais limpa à medida que o `GameContext` absorver o estado que hoje força essas pontes.

**Estratégia de Continuidade:**
Este documento serve como a "fonte da verdade". A cada passo concluído, este arquivo será atualizado. Caso o chat atual seja encerrado, basta enviar este documento (ou o texto dele) no novo chat e pedir: *"Retome a refatoração a partir do próximo passo pendente."*

---

## 🚦 Status Atual: Fases 1, 2 e Passo 3.1 concluídos ✅. Próximo: Passo 3.2 (Remover props de jogo do `ScoreboardScreen`).

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
- **Teste de Validação:** `tsc --noEmit` passou. App funciona normalmente.

---

### Fase 3: Conectar o `ScoreboardScreen` ao `GameContext` (Risco Médio)
**Objetivo:** Remover as props de jogo do `ScoreboardScreen`, que passará a ler diretamente do contexto.

#### Passo 3.1 — Adicionar `useGame()` no `ScoreboardScreen` (somente leitura) ✅ CONCLUÍDO
- [x] Adicionar `import { useGame } from '@modules/game'` no `ScoreboardScreen.tsx`.
- [x] Chamar `useGame()` no topo do componente e criar `effectiveGameState` com fallback para a prop: `const effectiveGameState = gameCtx.gameState ?? gameState`.
- [x] Substituir todos os usos internos de `gameState` por `effectiveGameState` (~200 ocorrências).
- [x] Props passadas para componentes filhos (`WatchBoard`, `ScoreboardDisplay`) mantidas como `gameState={effectiveGameState}` — nome da prop JSX preservado conforme contrato externo de cada filho.
- Props **não removidas** ainda.
- **Nota:** `userProfile` estava desestruturada das props mas não era usada em nenhum lugar — resquício pré-existente, não introduzido nesta fase.
- **Validação:** `tsc --noEmit` passou. Componente funciona com ou sem props.

#### Passo 3.2 — Remover as props de jogo do `ScoreboardScreen`
- [ ] Remover da interface `Props` as props que agora vêm do contexto.
- [ ] Remover das chamadas a `<ScoreboardScreen>` no `App.tsx`.
- **Validação:** `tsc --noEmit` passou. ScoreboardScreen testado visualmente.

---

### Fase 4: Migrar `gameState` e `matchSettings` para o `GameContext` (Risco Médio)
**Objetivo:** Mover as declarações de estado do `App.tsx` para o provider.

- [ ] Mover `useState` de `gameState`, `gameStateRef`, `matchSettings` para o `GameContext.tsx`.
- [ ] Mover a inicialização lazy (leitura do `localStorage`, restauração de pickleball) para dentro do provider.
- [ ] Mover `userProfile`, `matchHistory`, `matchHistoryRef`, `partners` para o provider.
- [ ] Aplicar o mesmo padrão de estados espelho + `GameBridge` usado na refatoração Live — ou avaliar se a arquitetura permite uma abordagem mais direta (sem bridge), já que o `GameProvider` pode ser montado acima do `AppInner`.
- **Nota de Arquitetura:** Se o `<GameProvider>` for montado **acima** do `AppInner` (diferente do `LiveProvider`, que é montado dentro), o `AppInner` pode chamar `useGame()` diretamente — sem o padrão bridge. Avaliar viabilidade no início desta fase.
- **Teste de Validação:** `tsc --noEmit` passou. Estados lidos do contexto, app funciona normalmente.

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

## ⚠️ Riscos e Decisões a Tomar

### Onde montar o `<GameProvider>`?
- **Opção A — Acima do `AppInner`** (recomendada): `<GameProvider>` envolve o `AppInner` no componente `App` raiz. O `AppInner` pode chamar `useGame()` diretamente, sem bridge. Mais limpo, mas exige que o provider não dependa de estado do `AppInner`.
- **Opção B — Dentro do `AppInner`** (mais segura): mesmo padrão do `LiveProvider`. Exige o padrão `GameBridge`. Mais verboso, mas sem risco de quebrar a inicialização.
- **Decisão:** Avaliar na Fase 4 — depende de quantas dependências do `AppInner` o `GameProvider` precisará receber como props.

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
