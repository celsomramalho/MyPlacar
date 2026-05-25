# Correcao da logica de participantes da live

## Objetivo

Separar corretamente tres conceitos que hoje podem se misturar:

1. **Proprietario da live**
   - E o usuario/dispositivo que criou a live.
   - Continua sendo definido por `ownerDeviceId` e `ownerPin`.
   - Outros dispositivos do mesmo usuario podem participar, mas nao viram proprietarios.

2. **Participante autorizado**
   - Pode aparecer em `controllers`.
   - Pode assumir controle do placar quando permitido.
   - Inclui:
     - dispositivo original do proprietario;
     - outros dispositivos do mesmo usuario do proprietario;
     - juiz convidado explicitamente por PIN.

3. **Espectador publico**
   - Entra pelo link publico/QR Code.
   - Apenas le o placar.
   - Nao deve ser gravado em `controllers`.
   - Nao deve aparecer como dispositivo participante.
   - Nao deve ver ou usar acao de assumir controle.

## Regra principal

Nao bloquear pelo papel `observer` sozinho.

O papel `observer` pode ser valido para um dispositivo autorizado, por exemplo:

- celular do Celso cria a live;
- relogio do Celso entra como `observer`;
- relogio do Celso pode assumir controle;
- celular do Celso continua sendo o proprietario original da live.

Portanto, a regra correta e:

- `observer` autorizado pode participar e assumir controle;
- espectador publico nao e `observer` operacional e nao entra em `controllers`.

## Arquivos principais

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\components\LiveControlOverlay.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\screens\SpectatorScreen.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\firestore.rules`

## Passo 1 - Criar helper de permissao da live

Arquivo sugerido:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve ser feita em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`.

Criar ou adicionar funcoes para centralizar a regra:

- `isOwnerDevice(live, deviceId)`
- `isSameOwnerUser(live, userPin)`
- `isInvitedJudge(live, userPin)`
- `canJoinLiveAsParticipant(live, userPin, deviceId)`
- `canTakeLiveControl(live, userPin, deviceId)`

Regra esperada:

- `isOwnerDevice`: verdadeiro quando `live.ownerDeviceId === deviceId`.
- `isSameOwnerUser`: verdadeiro quando `live.ownerPin` e igual ao PIN do usuario atual.
- `isInvitedJudge`: verdadeiro quando `live.judge.pin` ou `live.judgePin` e igual ao PIN do usuario atual.
- `canJoinLiveAsParticipant`: verdadeiro para owner device, mesmo usuario ou juiz convidado.
- `canTakeLiveControl`: inicialmente igual a `canJoinLiveAsParticipant`.

Observacao importante:

`isSameOwnerUser` permite que outro dispositivo do mesmo usuario entre como participante autorizado, mesmo com papel `observer`.

## Passo 2 - Corrigir entrada na live como participante

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useDeepLinkScreen.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\utils\appNavigation.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve ser feita principalmente em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`.

Funcao:

`handleObserveLive`

Situacao atual:

- O fluxo pode gravar `controllers.{deviceId}` para usuario externo que encontrou ou abriu a live.

Correcao:

Antes de escrever em `controllers`, calcular:

- e dispositivo proprietario?
- e outro dispositivo do mesmo usuario?
- e juiz convidado?

Se sim:

- gravar em `controllers`;
- definir `role`:
  - `owner` para o dispositivo proprietario;
  - `judge` para juiz convidado;
  - `observer` para outro dispositivo do mesmo usuario;
- definir `status`:
  - `controller` somente se realmente assumiu controle;
  - `watcher` se esta apenas assistindo.

Se nao:

- nao gravar em `controllers`;
- nao abrir painel de controle;
- direcionar para modo publico de espectador, quando a origem for link publico.

## Passo 3 - Corrigir pedido de controle

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve ser feita em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`, consumindo o helper de permissao.

Funcao:

`handleControlLive`

Situacao atual:

- A logica distingue papeis como `owner`, `judge` e `observer`.
- O risco e bloquear `observer` de forma geral.

Correcao:

Nao bloquear por `livePapel === 'observer'`.

Bloquear apenas quando:

- `canTakeLiveControl(live, userPin, deviceId)` for falso.

Comportamento esperado:

- owner original pode controlar;
- outro dispositivo do mesmo usuario pode controlar, mesmo estando como `observer`;
- juiz convidado pode controlar;
- usuario externo/publico nao pode controlar.

## Passo 4 - Corrigir botao "Pedir Controle"

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\components\LiveControlOverlay.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\components\LiveControlOverlay.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\useLive.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve ser feita em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\components\LiveControlOverlay.tsx`.

Situacao atual:

- O botao aparece com base no estado de controle atual e no papel.

Correcao:

Exibir o botao apenas se:

- o dispositivo nao e o controller atual;
- `canTakeLiveControl` e verdadeiro.

Nao usar `livePapel !== 'observer'` como criterio, porque um `observer` pode ser um dispositivo autorizado do mesmo usuario.

## Passo 5 - Ajustar entrada automatica de dispositivos autorizados

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\ui\UIContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\app\LiveSyncManager.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve ser feita em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`.

Trecho relevante:

- deteccao de live disponivel;
- entrada automatica de outro dispositivo do mesmo usuario;
- entrada automatica de juiz convidado.

Correcao:

Manter entrada automatica somente para:

- mesmo usuario do proprietario;
- juiz convidado.

Remover ou bloquear fluxo automatico para usuario externo.

Usuario externo deve usar somente a tela publica de espectador.

## Passo 6 - Impedir registro automatico indevido em controllers

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\utils\device.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve ser feita em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`.

Trechos relevantes:

- registro automatico como observer/juiz;
- heartbeat de observer;
- heartbeat de judge;
- heartbeat de owner.

Correcao:

Antes de qualquer `updateDoc` em `controllers.{deviceId}`, validar:

- owner device;
- mesmo usuario do owner;
- juiz convidado.

Se nao for participante autorizado:

- nao escrever `controllers`;
- nao enviar heartbeat;
- nao aparecer como participante.

## Passo 7 - Manter espectador publico somente leitura

Arquivos:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\screens\SpectatorScreen.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\screens\SpectatorScreen.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useDeepLinkScreen.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\app\AppScreenRouter.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\app\PublicScoreboardRoute.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\App.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. A mudanca deve preservar os fluxos existentes em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx` e `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\screens\SpectatorScreen.tsx`.

Comportamento esperado:

- link publico/QR Code abre o placar publico;
- listener usa `onSnapshot` para ler `live_matches/{pin}`;
- nao chama `handleObserveLive`;
- nao escreve em `controllers`;
- nao envia heartbeat;
- nao mostra overlay de controle.

## Passo 8 - Ajustar LiveContext para papel e permissao

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\useLive.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\app\GameLiveProviderStack.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`

Arquivos gerados/criados:

- Nenhum arquivo novo previsto. As mudancas devem ser em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\LiveContext.tsx` e, se necessario, no tipo do contexto em `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\types.ts`.

Correcao sugerida:

Adicionar ao contexto valores derivados como:

- `isSameOwnerUser`
- `isInvitedJudge`
- `canJoinLiveAsParticipant`
- `canTakeLiveControl`

Motivo:

Evita repetir a mesma regra em `GameContext`, `useLiveFirestoreSync` e `LiveControlOverlay`.

Ponto de atencao:

`livePapel` pode continuar retornando `observer` para dispositivo secundario do mesmo usuario. A permissao de controle deve vir de `canTakeLiveControl`, nao do nome do papel.

## Passo 9 - Revisar regras do Firebase

Arquivo:

`C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\firestore.rules`

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\firestore.rules`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\infrastructure\firebase\client.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\infrastructure\firebase\index.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\auth\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\types.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\docs\07-security.md`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\docs\05-api-and-data-models.md`

Arquivos gerados/criados:

- Nenhum arquivo novo obrigatorio previsto.
- Se a decisao for documentar a nova modelagem antes de aplicar regra forte, atualizar `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\docs\05-api-and-data-models.md`.
- Se a decisao for documentar impacto de seguranca, atualizar `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\docs\07-security.md`.

Situacao atual:

`live_matches/{pin}` permite `read, write: if true`.

Correcao ideal:

- leitura pode continuar publica, porque o placar publico precisa funcionar;
- escrita deve ser restrita.

Problema:

Com apenas PIN no documento, a regra do Firestore tem pouca capacidade de provar que o usuario autenticado e dono ou juiz.

Melhoria recomendada:

Adicionar campos verificaveis no documento da live, como:

- `ownerUid`;
- `ownerEmail`;
- `judgeUid`;
- `allowedUserIds`;
- ou outro identificador vindo do Firebase Auth.

Depois disso, criar regras permitindo escrita somente para:

- owner autenticado;
- juiz convidado autenticado;
- usuarios explicitamente autorizados.

Enquanto isso nao existir, a protecao principal sera no front-end, mas a seguranca real ainda ficara fraca.

## Passo 10 - Testes manuais esperados

Arquivos provaveis para analise:

- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\package.json`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\tests\regression\validation.test.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\tests\helpers\gameStateFactory.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\hooks\useLiveFirestoreSync.tsx`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\liveHelpers.ts`
- `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\components\LiveControlOverlay.tsx`

Arquivos gerados/criados:

- Possivel novo teste unitario: `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\tests\regression\livePermissions.test.ts`
- Possivel roteiro manual: `C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\docs\live_participantes_testes_manuais.md`
- Nenhum desses arquivos e obrigatorio para a correcao inicial; sao recomendados se quiser formalizar cobertura.

### Cenario A - Celular do Celso cria live

Resultado esperado:

- celular entra como `owner`;
- `ownerDeviceId` fica fixo;
- celular aparece em `controllers`.

### Cenario B - Relogio do Celso entra na live

Resultado esperado:

- relogio entra automaticamente como participante autorizado;
- role pode ser `observer`;
- status inicial `watcher`;
- aparece em `controllers`;
- pode pedir controle;
- ao assumir, status vira `controller`;
- celular continua sendo proprietario original.

### Cenario C - Juiz convidado entra

Resultado esperado:

- juiz entra como `judge`;
- aparece em `controllers`;
- pode pedir controle;
- owner pode remover juiz.

### Cenario D - Pessoa externa abre link publico

Resultado esperado:

- ve apenas placar publico;
- nao aparece em `controllers`;
- nao ve painel de live;
- nao consegue pedir controle;
- nao envia heartbeat.

### Cenario E - Pessoa externa logada tenta entrar sem convite

Resultado esperado:

- nao vira participante;
- nao grava `controllers`;
- nao pode controlar;
- deve ser tratada como espectador publico ou receber acesso negado para modo participante.

## Resultado final esperado

`controllers` passa a representar apenas participantes operacionais autorizados.

Espectadores publicos continuam podendo assistir, mas ficam fora da estrutura de controle da live.

O papel `observer` deixa de significar "usuario externo" e passa a significar apenas "participante autorizado que esta assistindo no momento".
