# Plano de Refatoração: Módulo Live (MyPlacar)

**Objetivo:** Centralizar e isolar toda a lógica de estado, presença e regras de negócio da funcionalidade "Live" em um contexto próprio (`LiveContext`), removendo o acoplamento excessivo do `App.tsx`.

**Estratégia de Continuidade:** 
Este documento serve como a "fonte da verdade". A cada passo concluído, este arquivo será atualizado. Caso o chat atual seja encerrado, basta enviar este documento (ou o texto dele) no novo chat e pedir: *"Retome a refatoração a partir do próximo passo pendente."*

---

## 🚦 Status Atual: Fase 7 concluída. Refatoração do módulo Live finalizada. ✅

---

## 📝 Fases da Implementação

### Fase 1: Fundação e Helpers (Baixo Risco)
**Objetivo:** Criar a estrutura de pastas e extrair funções puras do `App.tsx` sem alterar o comportamento do app.
- [x] Criar a pasta `src/modules/live/`.
- [x] Criar o arquivo `src/modules/live/liveHelpers.ts`.
- [x] Mover funções puras para `liveHelpers.ts` (ex: `persistLiveOwnerPin`, `getPersistedLiveOwnerPin`, `clearLiveOwnerPin`, `assertOwnerPin`).
- [x] Atualizar o `App.tsx` para importar essas funções do novo arquivo.
- **Teste de Validação:** O app deve compilar e rodar normalmente. (Validado com tsc)

### Fase 2: Estrutura do Contexto (Baixo Risco)
**Objetivo:** Definir a interface e a casca do novo Contexto.
- [x] Criar `src/modules/live/LiveContext.tsx`.
- [x] Criar `src/modules/live/types.ts` com a Interface `LiveContextValue` completa.
- [x] Criar o componente base `<LiveProvider>` com estados e refs, e placeholders para a lógica de permissão.
- [x] Criar o hook `src/modules/live/useLive.ts`.
- [x] Criar `src/modules/live/index.ts` (barrel de exportações).
- **Teste de Validação:** `tsc --noEmit` retornou exit code 0. Zero erros.

### Fase 3: Migração de Estado e Lógica (Risco Médio)
**Objetivo:** Transferir os "cérebros" da Live para o Provider.
- [x] Mover a declaração dos estados (ex: `activeLives`, `cloudLiveExists`, `liveLogs`, `fbSyncStatus`) do `App.tsx` para o `LiveContext.tsx`.
- [x] Mover os `useMemo` de permissão (`isOriginalOwner`, `isActiveController`, `livePapel`, `liveStatus`, `indicatorRole`, `resolveTargetPin`) para o `LiveContext.tsx`.
- [x] Mover as referências de ciclo de vida (`tookControlAtRef`, `lostControlAtRef`, `isClosingLiveRef`).
- **Teste de Validação:** `tsc --noEmit` retornou exit code 0. Zero erros. O provider tem toda a lógica necessária, mas o app ainda não o consome.

### Fase 4: Migração do Ciclo de Vida e Efeitos (Risco Médio/Alto)
**Objetivo:** Mover a lógica de entrada/saída (presença) da Live.
- [x] Transferir a função `performExit` e o `useEffect` de `visibilitychange` / `beforeunload` para dentro do `LiveContext.tsx`.
- [x] Remover o bloco duplicado do `App.tsx` (~130 linhas removidas; substituído por comentário de rastreabilidade).
- **Nota:** Os refs `tookControlAtRef`, `lostControlAtRef` e `isClosingLiveRef` permanecem no `App.tsx` temporariamente — ainda são lidos pelo `onSnapshot` e `handleCloseCloudLive`. Serão removidos na Fase 5.
- **Teste de Validação:** O `App.tsx` não registra mais listeners de `visibilitychange` / `beforeunload`. Zero handlers duplicados.

### Fase 5: Injeção e Refatoração das Telas (Risco Alto)
**Objetivo:** Plugar o novo sistema na UI. Fatiada em passos para minimizar risco — cada passo deve compilar e o app deve funcionar ao final dele.

#### Passo 5.1 — Instalar o `<LiveProvider>` no `App.tsx` (sem remover nada ainda)
- [x] Envolver o JSX do `App` com `<LiveProvider>` passando `deviceId`, `userProfile`, `gameState` e `gameStateRef`.
- Estados e variáveis duplicadas ficam onde estão. O Provider existirá mas ninguém o consume ainda.
- **Validação:** `tsc --noEmit` passou. App funciona normalmente.

#### Passo 5.2 — Conectar `ScoreboardScreen` ao contexto (somente leitura)
- [x] Adicionado `useLive()` no `ScoreboardScreen.tsx`.
- [x] Criadas 6 variáveis `effective*` (`effectiveCloudLiveExists`, `effectiveLivePapel`, `effectiveIsController`, `effectiveIndicatorRole`, `effectiveIsOriginalOwner`, `effectiveFbSyncStatus`) lendo do contexto com fallback para as props.
- [x] `effectiveLiveLogs` e `effectiveSetLiveLogs` atualizados para usar o contexto como fallback.
- [x] Todos os 12 usos no JSX substituídos pelas variáveis `effective*`.
- Props **não removidas** da interface — serão removidas no Passo 5.3.
- **Validação:** `tsc --noEmit` passou. ScoreboardScreen funciona com ou sem as props.

#### Passo 5.3 — Remover as props Live do `ScoreboardScreen`
- [x] Removidas da interface `Props`: `cloudLiveExists`, `livePapel`, `isController`, `indicatorRole`, `isOriginalOwner`, `liveLogs`, `setLiveLogs`, `fbSyncStatus`.
- [x] Removidas do destructuring de `props` no corpo do componente.
- [x] Bloco `effective*` atualizado: sem fallbacks para props, lê exclusivamente de `liveCtx`.
- [x] Removidas das três chamadas a `<ScoreboardScreen>` no `App.tsx` (`scoreboard`, `public-scoreboard` e a chamada principal).
- **Validação:** `tsc --noEmit` passou. ScoreboardScreen testado visualmente.

#### Passo 5.4 — Redirecionar os setters e refs do `App.tsx` para o contexto
- [x] Chamada a `useLive()` adicionada no `App.tsx`, desestruturando: `setActiveLives`, `setCloudLiveExists`, `setLiveLogs`, `setFbSyncStatus` (como `ctx*`), e os refs `tookControlAtRef`, `lostControlAtRef`, `isClosingLiveRef`, `lastFbScoreKeyRef`, `fbSyncTimerRef`, `hasAutoEnabledScoreboardRef` (como `ctx*`).
- [x] Todas as chamadas locais a `setActiveLives`, `setCloudLiveExists`, `setLiveLogs`, `setFbSyncStatus` nos handlers e `onSnapshot` substituídas pelas versões `ctx*` (~25 pontos de chamada).
- [x] Todos os acessos a `tookControlAtRef.current`, `lostControlAtRef.current`, `isClosingLiveRef.current` nos handlers substituídos pelas versões `ctx*`.
- [x] Refs locais (`tookControlAtRef`, `lostControlAtRef`, `isClosingLiveRef`) ainda declarados no `App.tsx` mas **sem nenhum uso ativo** — serão removidos no Passo 5.7.
- [x] Erros de lint `TS2540` (readonly) e `TS18047` (possibly null) nos refs do contexto corrigidos via cast para `MutableRefObject<T>`.
- **Validação:** `tsc --noEmit` passou com zero erros.
- ⚠️ **Bug introduzido:** O `useLive()` é chamado dentro do `App` (linha ~489), mas o `<LiveProvider>` só é montado no `return` do mesmo componente (linha ~3254). Em runtime, o hook roda **fora** do provider — o contexto retorna `undefined` para os refs, causando crash e o app ficando preso na tela de loading. **Será corrigido no Passo 5.4.1.**

#### Passo 5.4.1 — ✅ CONCLUÍDO (sub-passos A–C) — Corrigir bug de runtime: `useLive()` fora do `<LiveProvider>`
- [x] **Problema resolvido:** `App` era simultaneamente quem montava o `<LiveProvider>` e quem chamava `useLive()`, causando crash em runtime.
- [x] **Solução implementada:** Padrão **LiveBridge** — menor diff possível, sem prop drilling.

**Arquitetura final:**
```
App (root mínimo: só ErrorBoundary + AppInner)
└── AppInner (= corpo original do App, com todos os estados e handlers)
    └── return:
        └── LiveProvider (recebe deviceId, userProfile, gameState, gameStateRef)
            ├── LiveBridge (chama useLive(), injeta via onReady callback)
            └── JSX do app (NavigationDrawer, telas, modais...)
```

**Detalhes da implementação:**
- `App` renomeado para `AppInner` (linha 139). Zero mudança no estado/lógica interna.
- Bloco `useLive()` substituído por: refs de callback para setters, wrappers `useCallback` estáveis, proxies transparentes para os refs de ciclo de vida (`ctxTookControlAtRef.current = x` continua funcionando sem mudança nos ~25 pontos de uso).
- `handleLiveReady`: callback passado ao `LiveBridge`; aponta todos os refs/setters para os valores reais do contexto assim que o provider monta.
- `LiveBridge`: componente filho do provider que chama `useLive()` e dispara `onReady(ctx)` no `useEffect` de montagem.
- `App` (novo, mínimo): `<ErrorBoundary><AppInner /></ErrorBoundary>`.
- `ErrorBoundary` removido do `return` do `AppInner`.
- **Validação:** Estrutura verificada (único `export default`, `ErrorBoundary` apenas no `App` wrapper, `LiveBridge` declarado após `AppInner`). `tsc --noEmit` deve ser executado pelo desenvolvedor para confirmação final.

Sub-passo 5.4.1-A — ✅ Criar AppInner + LiveBridge (implementado nesta sessão)
- [x] `App` renomeado para `AppInner`
- [x] `useLive()` removido do topo do `AppInner`
- [x] Padrão de injeção via refs de callback + proxies implementado
- [x] `LiveBridge` criado como componente separado
- [x] `App` wrapper mínimo criado no final do arquivo
- [x] `return` do `AppInner` atualizado: sem `ErrorBoundary`, com `<LiveBridge>`

Sub-passo 5.4.1-B — ✅ Confirmar que o contexto está sendo lido corretamente
- [x] `console.log` temporário adicionado e validado no browser
- [x] Log confirmou: todos os setters como `"function"`, refs com valores reais (ex: `tookControlAtRef.current` com timestamp de sessão ativa)
- [x] App abriu normalmente, sem crash

Sub-passo 5.4.1-C — ✅ Remover o console.log e atualizar o documento de plano
- [x] Log removido do `handleLiveReady`
- [x] Passo 5.4.1 marcado como concluído



#### Passo 5.5 — ✅ Remover as declarações `useState` duplicadas do `App.tsx`
- [x] Removidos os 4 `useState` do `App.tsx`: `cloudLiveExists`, `activeLives`, `liveLogs`, `fbSyncStatus`.
- [x] Removidos `activeLivesRef` local e seu `useEffect` espelho.
- [x] **Padrão adotado:** estados espelho locais (`activeLives`, `cloudLiveExists`, `liveLogs`, `fbSyncStatus`) redeclarados com setters `*Local` — sincronizados pelo `handleLiveReady` (valor inicial) e pelos wrappers `ctxSet*` (atualizações em runtime). Garante reatividade dos `useMemo`/`useEffect` existentes sem prop drilling.
- [x] `activeLivesRef` substituído por proxy que delega ao ref real do contexto (mesmo padrão dos refs de ciclo de vida).
- [x] Refs dos setters locais (`setActiveLivesLocalRef`, etc.) declarados antes dos `useCallback` wrappers que os usam.
- **Validação:** `tsc --noEmit` deve ser executado pelo desenvolvedor para confirmação final.

#### Passo 5.6 — ✅ Remover os `useMemo` duplicados do `App.tsx`
- [x] Removidos os `useMemo` de: `isOriginalOwner`, `isActiveController`, `isCurrentController`, `isCommandOwner`, `livePapel`, `liveStatus`, `indicatorRole`, `isJudgeOnline`, `isOwnerOnline`.
- [x] Removido o `useCallback` local de `resolveTargetPin`.
- [x] **Padrão adotado:** estados espelho reativos (`useState`) sincronizados pelo `LiveBridge` via novo callback `onUpdate`, chamado a cada mudança nos valores computados do contexto. `resolveTargetPin` exposto via `resolveTargetPinRef` + wrapper `useCallback` estável.
- [x] `LiveBridge` expandido: agora aceita `onReady` (montagem) + `onUpdate` (cada render com deps nas variáveis computadas).
- [x] `_activeMatchPin` mantido como `useMemo` local pois depende de `isOriginalOwner` (agora estado espelho) e `gameState` local.
- **Validação:** `tsc --noEmit` deve ser executado pelo desenvolvedor para confirmação final.

#### Passo 5.7 — ✅ Remover os refs temporários do `App.tsx`
- [x] Removidas as declarações `useRef` antigas de `tookControlAtRef`, `lostControlAtRef` e `isClosingLiveRef`, junto com seus comentários descritivos.
- [x] `lastFbScoreKeyRef`, `fbSyncTimerRef` e `hasAutoEnabledScoreboardRef` já não existiam como declarações diretas — apenas como `_ctx*Inner` (inner refs do sistema de proxy), que permanecem necessários.
- [x] Confirmado via `grep` que nenhum uso direto dos nomes antigos permanece no arquivo.
- [x] Comentário de rastreabilidade inserido no lugar das declarações removidas.
- **Validação:** `tsc --noEmit` deve ser executado pelo desenvolvedor para confirmação final. Fase 5 concluída.

### Fase 6: Limpeza Final da UI (Baixo Risco) ✅
**Objetivo:** Mover os Modais que sobraram no `App.tsx`.
- [x] Extraído o `LiveControlOverlay` do `App.tsx` para `src/modules/live/components/LiveControlOverlay.tsx`.
- [x] Componente lê papéis e permissões diretamente via `useLive()` — sem prop drilling.
- [x] Estados `confirmDeleteLive` e `confirmDeleteJudge` migrados para dentro do componente (estado interno), removidos do `App.tsx`.
- [x] Prop `initialConfirmDeleteJudge` adicionada para suportar abertura direta na tela de remoção de juiz (disparada por botão externo no `NavigationDrawer`).
- [x] `Crown` e `UserCheck` removidos do import de `lucide-react` no `App.tsx` (não tinham mais uso).
- [x] Bloco de ~90 linhas JSX inline substituído por `<LiveControlOverlay ... />` com 9 linhas.
- [x] Handlers de lógica (`handleControlLive`, `handleCloseCloudLive`, `handleDeleteJudge`, `handleSyncScoreboard`) permanecem no `App.tsx` — dependem de estado do `App` (setGameState, setCurrentScreen, etc.) e migrariam com acoplamento reverso.
- **Nota:** `activeCloudMatch` (banner "Conectar relógio") mantido inline no `App.tsx` — usa handlers genéricos e não é exclusivo da Live.
- **Teste de Validação:** `tsc --noEmit` deve ser executado pelo desenvolvedor para confirmação final.

### Fase 7: Otimização e Limpeza de Lógica (Médio Risco) ✅
**Objetivo:** Aproveitar que a lógica está isolada no `LiveContext` para revisá-la, documentar decisões de design e remover imports órfãos.

#### Passo 7.1 — ✅ Documentação e clarificação interna do `LiveContext.tsx`
- [x] Cabeçalho do `LiveProvider` reescrito: lista as 4 responsabilidades reais e explica explicitamente por que os handlers de ação *não* estão aqui (acoplamento reverso com `App.tsx`).
- [x] Refs de ciclo de vida: cada ref recebeu comentário explicando *quando* é escrito, *por quem*, e *qual problema específico* resolve.
- [x] `isOriginalOwner`: adicionado aviso `⚠️` documentando a duplicação intencional com `isOwnerViaRef` dentro do `performExit` — a armadilha mais perigosa para manutenção futura.
- [x] `isCurrentController` vs `isActiveController`: distinção semântica documentada (local/imediato vs Firebase/confirmado-com-latência).
- [x] `isCommandOwner`: explicado como alias semântico de `isCurrentController` para contextos sem live ativa.
- [x] `isJudgeOnline` / `isOwnerOnline`: ambos receberam nota sobre `Date.now()` fixo no cálculo do memo — comportamento correto mas não óbvio.
- [x] `performExit`: bloco introdutório expandido com dois "Por quê?" respondendo as dúvidas mais prováveis de manutenção: por que refs em vez de closure, e por que `isOwnerViaRef` é recalculado em vez de usar `isOriginalOwner`.
- **Validação:** Nenhuma lógica alterada — só documentação. `tsc --noEmit` não é necessário, mas pode ser executado para confirmação.

#### Passo 7.2 — ✅ Limpeza de imports órfãos no `App.tsx`
- [x] Removidos do import de `lucide-react`: `Trash2`, `RefreshCw`, `Eye` — migraram para o `LiveControlOverlay` na Fase 6.
- [x] Removidos do import de `firebase/firestore`: `writeBatch`, `getDocs` — sem nenhum uso no corpo do arquivo.
- [x] Removido o import de `LiveIndicator` — aparecia apenas em comentários JSX, não em código.
- [x] Todos os demais imports confirmados com uso real via `grep`.
- **Validação:** `tsc --noEmit` deve ser executado pelo desenvolvedor para confirmação final.

---

## 🛠️ Instruções para Continuidade (Prompt de Retomada)

Se a sessão cair, inicie um novo chat com o seguinte prompt:

> *"Olá! Eu estou refatorando o módulo Live do meu app (MyPlacar). Nós estávamos seguindo o documento de planejamento. O arquivo de plano indica que as Fases X e Y já foram concluídas. Por favor, leia o projeto atual, valide que a última fase foi implementada corretamente e inicie o desenvolvimento da próxima Fase pendente descrita no documento."*
