# Checkpoint Arquitetural - Fase 2 - Modulo History

Projeto: MyPlacar PWA  
Data de referencia: 22 de abril de 2026

## 1. Objetivo
Registrar o encerramento desta leva da fase 2 para o dominio `history`, consolidando o que foi migrado, o que ficou pendente de forma consciente e qual e a fronteira atual do modulo.

Este documento nao redefine a arquitetura do projeto.
Ele apenas registra o estado arquitetural atual do modulo `history` apos a migracao incremental executada sobre a base ja consolidada na fase 1.

## 2. Escopo desta leva
Esta leva da fase 2 teve como foco tirar o dominio `history` do estado de placeholder e consolidar nele:

- tipo oficial do dominio
- tela principal de historico
- tela de localizacao associada ao historico
- API publica minima
- helpers de filtro, agrupamento, persistencia e merge do dominio
- coordenacao operacional de sync, download, contagem e limpeza do historico
- reducao de acoplamento indevido com `scoreboard`
- uso mais consistente de `infrastructure` para Firebase e Supabase em `matches`

Esta leva nao teve como objetivo:

- tirar o estado raiz de historico do `App.tsx`
- quebrar estruturalmente o `App.tsx`
- consolidar `routes`
- migrar o fluxo administrativo inteiro
- refatorar `SettingsScreen` para fora do legado

## 3. Estrutura consolidada do modulo
O modulo `history` passa a ter conteudo real em:

```text
src/modules/history/
  components/
    HistorySection.tsx
  screens/
    LocationScreen.tsx
  services/
    clearCloudHistory.ts? (via historySync.ts)
    createHistoryItem.ts
    filterHistory.ts
    getUnsyncedHistory.ts
    groupHistoryByDate.ts
    historySync.ts
    markHistoryAsSynced.ts
    mergeDownloadedHistory.ts
    persistLocalHistory.ts
    removeHistoryMatches.ts
  index.ts
  types.ts
```

Observacao:
- a coordenacao operacional do dominio foi consolidada em `historySync.ts`

## 4. Itens efetivamente consolidados
Os itens abaixo passam a ser considerados parte consolidada do dominio `history`:

### 4.1 UI principal do dominio
- `src/modules/history/components/HistorySection.tsx`
- `src/modules/history/screens/LocationScreen.tsx`

### 4.2 Tipo oficial do dominio
- `MatchHistoryItem`

Fonte oficial atual:
- `src/modules/history/types.ts`

### 4.3 API publica do modulo
Fonte oficial atual:
- `src/modules/history/index.ts`

Essa API publica passou a expor os elementos externos realmente necessarios do dominio.

### 4.4 Regras e helpers de dominio extraidos
Ja foram consolidados no modulo:

- criacao de `MatchHistoryItem` a partir de `GameState`
- filtro textual de historico
- agrupamento por data
- identificacao de itens pendentes de sync
- marcacao de itens sincronizados
- merge entre historico baixado e historico local
- persistencia local com limite
- remocao de uma ou varias partidas da lista local
- coordenacao de sync, download, contagem e limpeza do historico

## 5. Ajustes de fronteira feitos nesta leva
### 5.1 O que ficou corretamente no modulo
Permanece em `modules/history` tudo que representa:

- tipo do dominio
- UI principal do historico
- visualizacao de localizacao do historico
- montagem de entidade `MatchHistoryItem`
- filtro, agrupamento e merge de listas do dominio
- coordenacao operacional do fluxo de historico

### 5.2 O que ficou corretamente em infrastructure
As integracoes tecnicas do dominio foram consolidadas em:

- `src/infrastructure/firebase/matches.ts`
- `src/infrastructure/supabase/matches.ts`

Esses arquivos concentram:

- contagem de partidas na nuvem
- sync de partidas no Firebase
- download de partidas do Firebase
- delete individual, em lote e total no Firebase
- espelhamento de partidas no Supabase
- delete individual, em lote e total no Supabase
- leitura global de partidas para uso administrativo/mapa

Com isso, o modulo `history` consome infraestrutura tecnica sem carregar query, batch ou upsert direto na UI.

### 5.3 O que ficou corretamente em shared
Foi consolidado em `shared` apenas o que era claramente transversal:

- `src/shared/components/MatchTimeline.tsx`

Essa extracao foi necessaria porque `history` dependia indevidamente de um arquivo interno de `scoreboard`.

Nenhuma regra de negocio de `history` foi movida para `shared`.

## 6. Compatibilidade temporaria mantida
As seguintes compat layers continuam aceitas de forma temporaria:

- `src/screens/settings/HistorySection.tsx`
- `src/screens/LocationScreen.tsx`
- reexport temporario de `MatchHistoryItem` em `src/types.ts`

Essas compat layers continuam validas porque:

- reduzem risco de quebra
- ainda existem consumidores legados
- nao receberam logica nova
- estao operando apenas como ponte de transicao

## 7. Impacto pratico no App.tsx
O `App.tsx` continua centralizador, mas perdeu parte relevante da logica operacional de `history`.

Ja nao fica mais nele como dono principal:

- criacao do `MatchHistoryItem`
- filtro de itens pendentes
- marcacao de itens sincronizados
- merge de historico baixado
- persistencia local limitada
- coordenacao de sync/download/count/clear do historico
- delete local por helper do dominio

O papel atual do `App.tsx` nesses fluxos esta mais proximo de:

- orquestracao do estado raiz
- disparo de handlers
- integracao com UI legada
- navegacao entre telas

## 8. Limpezas pequenas consolidadas
Nesta leva tambem foram feitas limpezas pequenas, mas importantes:

- `MatchTimeline` saiu de `ScoreboardScreen` e virou componente compartilhado
- `HistorySection` deixou de importar arquivo interno de `scoreboard`
- `LocationScreen` deixou de fazer query tecnica diretamente fora da fronteira consolidada
- `AdminScreen` passou a consumir `MatchHistoryItem` por `@modules/history`
- `matches` no Supabase saiu da pasta legada como ponto de uso do dominio

## 9. Estado atual dos consumidores legados
Ainda existem consumidores legados do dominio `history`, o que neste momento e aceitavel.

Principais consumidores atuais:

- `src/App.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/screens/AdminScreen.tsx`
- `src/types.ts` como reexport temporario

Porem, o consumo ja esta mais alinhado com a arquitetura porque:

- a UI principal do dominio e importada via `@modules/history`
- o tipo do dominio ja pode ser consumido pela API publica do modulo
- a infraestrutura tecnica ja nao nasce no `App.tsx`

## 10. Pendencias conscientes
Os itens abaixo ficaram propositalmente fora desta leva:

### 10.1 Estado raiz ainda no App
O estado principal de:

- `matchHistory`
- `cloudMatchesCount`
- flags de sync/download

ainda nasce em `src/App.tsx`.

Isso nao e tratado como falha desta leva.
Foi uma decisao consciente para manter a migracao segura e incremental.

### 10.2 Settings continua orquestrador legado
`SettingsScreen` continua fora do modulo e apenas consome `HistorySection`.

Isso tambem e aceitavel neste momento porque a prioridade desta leva foi consolidar o dominio, nao migrar a tela de settings inteira.

### 10.3 Fluxos administrativos continuam fora do modulo
`AdminScreen` continua fora do modulo e apenas consome tipo e infraestrutura quando necessario.

Isso tambem e aceitavel neste momento porque o fluxo admin pertence a outro contorno funcional.

### 10.4 Compat layers ainda nao removidas
As compat layers de tela e tipo continuam ativas.
A remocao delas depende de esvaziar os consumidores legados restantes com seguranca.

## 11. Avaliacao arquitetural
Esta leva pode ser considerada bem-sucedida porque:

- `history` deixou de ser apenas uma pasta preparada e passou a ser um modulo real
- a maior parte da logica nova do dominio passou a nascer no modulo
- a infraestrutura tecnica usada pelo dominio ficou mais coerente com `src/infrastructure`
- `shared` recebeu apenas o que era realmente transversal
- a compatibilidade foi mantida com baixo risco
- o legado passou a consumir mais do que definir o dominio

## 12. O que ainda nao vale fazer por inercia
Mesmo com o modulo mais maduro, ainda nao e recomendavel fazer automaticamente:

- tirar todo o estado de `history` do `App.tsx` sem planejamento proprio
- quebrar `SettingsScreen` por completo nesta mesma frente
- subir mais codigo para `shared` sem caso claramente transversal
- misturar `history` com responsabilidades de `scoreboard`, `settings` ou `admin`

## 13. Criterio de encerramento desta leva
Esta leva da fase 2 para `history` pode ser considerada encerrada quando:

- build e tipagem estiverem validados no estado atual
- nao houver regressao funcional nos fluxos principais do dominio
- o time reconhecer `src/modules/history` como fronteira oficial do dominio

## 14. Proximo passo recomendado
O proximo passo recomendado nao e continuar lapidando `history` indefinidamente.

A recomendacao e:

1. encerrar oficialmente esta leva do modulo `history`
2. manter apenas correcoes pontuais se aparecerem
3. iniciar o planejamento do proximo dominio da fase 2 com o mesmo metodo incremental
