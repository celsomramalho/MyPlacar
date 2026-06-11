# Plano de Implementação - Papéis, Status e Melhorias na Interface do Modo Live (Itens 1 a 4)

Implementaremos os Itens 1, 2, 3 e 4 das especificações do modo Live. O objetivo central é distinguir claramente os papéis permanentes de participação (`role`: `'owner' | 'judge' | 'observer'`) dos status temporários de controle do placar (`status`: `'controller' | 'watcher'`), salvando-os na presença do Firestore e exibindo-os de forma dinâmica nos placares e no Painel de Controle da Live.

## Revisão do Usuário Requerida

Documentamos tudo o que exige revisão ou feedback do usuário, como mudanças significativas de design.

> [!NOTE]
> Preservamos total compatibilidade com o jogo offline/local. As alterações em rede só se aplicam quando há uma live ativa.

## Perguntas em Aberto

Nenhuma pergunta pendente para a fase atual; a lógica proposta cobre todos os requisitos requisitados.

## Alterações Propostas

---

### Componente: Tipos Centrais

Atualizaremos o tipo `ControllerRecord` em `src/types.ts` para tipar estritamente os valores de `role` e `status`.

#### [MODIFICAR] [types.ts](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/types.ts)
- Atualizar a interface `ControllerRecord` para:
  ```typescript
  export interface ControllerRecord {
    label: string;
    lastSeen: number;
    isOwner?: boolean;
    nickname?: string;
    role?: 'owner' | 'judge' | 'observer';
    status?: 'controller' | 'watcher';
    deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop';
  }
  ```

---

### Componente: Sincronização do Firestore

Atualizaremos os batimentos cardíacos de presença e sincronização para incluir o campo `status` e atribuir corretamente o `role`.

#### [MODIFICAR] [useLiveFirestoreSync.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/hooks/useLiveFirestoreSync.tsx)
- Extrair `livePapel` de `useLive()`.
- Atualizar todas as chamadas de `updateDoc` para presença de dispositivos nos vários loops de batimento cardíaco:
  - **Registro de Observador**: Adicionar `status: 'watcher'`.
  - **Batimento do Juiz**: Adicionar `status: judgeIsActive ? 'controller' : 'watcher'`.
  - **Batimento do Proprietário**: Adicionar `status: 'watcher'` (já que o proprietário não está controlando neste batimento secundário).
  - **Batimento do Observador**: Adicionar `status: 'watcher'`.
  - **Batimento/Escrita do Controlador Ativo**: Mapear `controllerRole` de forma precisa usando `livePapel` e definir `status: 'controller'`.

#### [MODIFICAR] [GameContext.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/modules/game/GameContext.tsx)
- **`handleControlLive`**:
  - Atualizar a reavaliação de presença del antigo controlador para rebaixar o status para `'watcher'`. Manter o papel consistente (se era um juiz, manter `'judge'`).
  - Atualizar a presença do controlador que está assumindo para incluir `status: 'controller'`.
- **`handleObserveLive`**:
  - Determinar se o observador que está entrando se torna controlador imediatamente. Definir `initialStatus: 'controller' | 'watcher'` de acordo e salvar no Firestore e no estado local.

#### [MODIFICAR] [App.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/App.tsx)
- Atualizar o registro de presença do controlador ao ativar o espelhamento inicial para incluir `status: 'controller'` e o mapeamento correto do papel usando `livePapel`.

---

### Componente: Placar e Indicadores de Layout

Permitiremos que o `LiveIndicator` renderize o status de controle correto quando fornecido.

#### [MODIFICAR] [LiveIndicator.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/components/LiveIndicator.tsx)
- Adicionar `status?: 'controller' | 'watcher'` opcional à interface de propriedades.
- Se o `status` for fornecido, renderizar os seguintes ícones no centro:
  - `status === 'controller'` ➡️ `Gamepad2` (Joystick).
  - `status === 'watcher'` ➡️ `Eye` (Olhos).
  - Voltar para a renderização normal por `role` se o `status` for omitido.

#### [MODIFICAR] [ScoreboardDisplay.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/components/ScoreboardDisplay.tsx)
- Passar `status={isLiveActive ? (isCommandOwner ? 'controller' : 'watcher') : undefined}` para o `LiveIndicator` no botão central.

#### [MODIFICAR] [WatchBoard.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/components/WatchBoard.tsx)
- Passar `status={isLiveActive ? (isCommandOwner ? 'controller' : 'watcher') : undefined}` para o `LiveIndicator` no botão central.

---

### Componente: Painel de Controle da Live (Overlay)

Reconstruiremos completamente a visualização dos dispositivos conectados dentro do painel para listar todos os aparelhos ativos e conectados com seus respectivos papéis e status.

#### [MODIFICAR] [LiveControlOverlay.tsx](file:///c:/Users/Celso%20Ramalho/Documents/GitHub/MyPlacar/src/modules/live/components/LiveControlOverlay.tsx)
- Filtrar `gameState.controllers` onde `Date.now() - lastSeen < 60000`.
- Exibir uma lista premium e moderna de dispositivos conectados.
- Para cada dispositivo, exibir:
  - Ícone de tipo de aparelho (`Watch` | `Smartphone` | `Tablet` | `Laptop`) baseado em `deviceType`.
  - O `nickname` do usuário ou o `label` do dispositivo.
  - Ícone de papel (role) aplicável:
    - Proprietário: `Crown` (Coroa dourada/âmbar).
    - Juiz: `UserCheck` (Ícone de verificação em índigo/roxo).
    - Observador: Sem ícone extra.
  - Ícone de status:
    - Controlador: `Gamepad2` (Joystick em verde-esmeralda).
    - Observador: `Eye` (Olho em slate/cinza).

## Plano de Verificação

### Verificação Automatizada
- Verificar se os tipos TypeScript compilam perfeitamente:
  `pnpm lint` (`tsc --noEmit`)

### Verificação Manual
- Simular jogo offline local (preserva layouts normais do placar).
- Simular inicialização de espelhamento ao vivo e conexões de observadores, confirmando a propagação correta dos campos.
