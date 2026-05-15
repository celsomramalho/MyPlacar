# Checkpoint Arquitetural - Fase 2 - Modulo Partners

Projeto: MyPlacar PWA  
Data de referencia: 16 de abril de 2026

## 1. Objetivo
Registrar o encerramento desta leva da fase 2 para o dominio `partners`, consolidando o que foi migrado, o que ficou pendente de forma consciente e qual e a fronteira atual do modulo.

Este documento nao redefine a arquitetura do projeto.
Ele apenas registra o estado arquitetural atual do modulo `partners` apos a migracao incremental executada sobre a base ja consolidada na fase 1.

## 2. Escopo desta leva
Esta leva da fase 2 teve como foco tirar o dominio `partners` do estado de pasta quase vazia e consolidar nele:

- tela principal do dominio
- tipos principais
- API publica minima
- regras de negocio diretamente ligadas ao fluxo de parceiros
- limpeza de duplicacoes pequenas
- reducao de logica residual no `App.tsx`
- uso mais consistente de `infrastructure` para consultas tecnicas ao Firebase

Esta leva nao teve como objetivo:

- quebrar estruturalmente o `App.tsx`
- mover o estado global de `partners` para outra camada
- consolidar `routes`
- reorganizar o dominio de torneios
- refatorar telas grandes fora do necessario para consumo do modulo

## 3. Estrutura consolidada do modulo
O modulo `partners` passa a ter conteudo real em:

```text
src/modules/partners/
  screens/
    PartnersScreen.tsx
  services/
    addPartnerToState.ts
    applyPartnerSelection.ts
    autoRegisterPartnerByPin.ts
    createManualPartner.ts
    createQueuePartner.ts
    createReferralPartner.ts
    createSelfPartner.ts
    guessPartnerGender.ts
    mergePartnersByPin.ts
    sanitizePartnersForCloud.ts
  index.ts
  types.ts
```

## 4. Itens efetivamente consolidados
Os itens abaixo passam a ser considerados parte consolidada do dominio `partners`:

### 4.1 Tela principal
- `src/modules/partners/screens/PartnersScreen.tsx`

### 4.2 Tipos do dominio
- `Partner`
- `QueuePlayer`

Fonte oficial atual:
- `src/modules/partners/types.ts`

### 4.3 API publica do modulo
Fonte oficial atual:
- `src/modules/partners/index.ts`

Essa API publica passou a expor os elementos externos realmente necessarios do dominio.

### 4.4 Regras e helpers de dominio extraidos
Ja foram consolidados no modulo:

- aplicacao da selecao de parceiros em `MatchSettings`
- auto-register por PIN
- criacao manual de parceiro
- criacao do proprio usuario como parceiro temporario
- criacao de parceiro a partir da fila
- criacao de parceiro de referral
- heuristica de genero
- merge e deduplicacao por PIN em estado
- merge de listas por prioridade no sync
- sanitizacao para persistencia em nuvem
- normalizacao de PIN

## 5. Ajustes de fronteira feitos nesta leva
### 5.1 O que ficou corretamente no modulo
Permanece em `modules/partners` tudo que representa:

- tela do dominio
- tipos do dominio
- regras de negocio do fluxo de parceiros
- montagem de entidades `Partner`
- deduplicacao e merge de listas do dominio
- sanitizacao especifica do dominio antes de persistir

### 5.2 O que ficou corretamente em infrastructure
As consultas tecnicas a `users` no Firebase foram puxadas para:

- `src/infrastructure/firebase/users.ts`

Esse arquivo concentra:

- busca de usuario por PIN
- busca de usuarios por lote de PINs
- busca de usuarios indicados por `referredByPin`
- resolucao tecnica de nickname e normalizacao de PIN

Com isso, o modulo `partners` consome infraestrutura tecnica sem carregar a query diretamente na tela.

### 5.3 O que ficou corretamente em shared
Foi consolidado em `shared` apenas o que e visual e transversal:

- `src/shared/components/GenderIcons.tsx`

Nenhuma regra de negocio de `partners` foi movida para `shared`.

## 6. Compatibilidade temporaria mantida
As seguintes compat layers continuam aceitas de forma temporaria:

- `src/screens/PartnersScreen.tsx`
- reexport temporario de `Partner` e `QueuePlayer` em `src/types.ts`

Essas compat layers continuam validas porque:

- reduzem risco de quebra
- ainda existem consumidores legados
- nao receberam logica nova
- estao operando apenas como ponte de transicao

## 7. Impacto pratico no App.tsx
O `App.tsx` continua centralizador, mas perdeu parte relevante da logica de dominio de `partners`.

Ja nao fica mais nele como regra principal:

- aplicacao da selecao de parceiros em times
- auto-register por PIN
- criacao manual de parceiro para torneio
- parte do fluxo de inclusao de juiz como parceiro
- deduplicacao de parceiro em estado

O papel atual do `App.tsx` nesses fluxos esta mais proximo de:

- orquestracao
- disparo de handlers
- integracao com estado raiz
- navegacao entre telas

## 8. Limpezas pequenas consolidadas
Nesta leva tambem foram feitas limpezas pequenas, mas importantes:

- `guessGender` foi unificado no modulo
- `MarsIcon` e `VenusIcon` foram consolidados em `shared`
- `maskPin` duplicado foi removido de tela legacy
- consultas repetidas de lookup por PIN foram centralizadas em `infrastructure`
- normalizacao manual repetida de PIN foi reduzida em pontos do `PartnersScreen`
- sanitizacao inline do upload para nuvem saiu da tela e virou helper do modulo

## 9. Estado atual dos consumidores legados
Ainda existem consumidores legados do dominio `partners`, o que neste momento e aceitavel.

Principais consumidores atuais:

- `src/App.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/screens/settings/TeamSection.tsx`
- `src/screens/ScoreboardScreen.tsx`
- `src/screens/EventDetailScreen.tsx`
- `src/infrastructure/supabase/mirror.ts`

Porem, o consumo ja esta mais alinhado com a arquitetura porque:

- a tela principal e importada via `@modules/partners`
- os tipos do dominio ja podem ser consumidos pela API publica do modulo
- parte das regras do dominio ja nao nasce mais nesses arquivos legados

## 10. Pendencias conscientes
Os itens abaixo ficaram propositalmente fora desta leva:

### 10.1 Estado raiz ainda no App
O estado principal de:

- `partners`
- `playerQueue`

ainda nasce em `src/App.tsx`.

Isso nao e tratado como falha desta leva.
Foi uma decisao consciente para manter a migracao segura e incremental.

### 10.2 Consumidores legados ainda existentes
`SettingsScreen`, `TeamSection`, `ScoreboardScreen` e `EventDetailScreen` continuam fora do modulo.

Isso tambem e aceitavel neste momento porque a prioridade desta leva foi consolidar o dominio, nao migrar telas adjacentes por completo.

### 10.3 Supabase mirror migrado para infrastructure
`supabaseMirror` foi migrado para:

- `src/infrastructure/supabase/mirror.ts`

O caminho antigo permanece apenas como compat layer:

- `src/services/supabaseMirror.ts`

Arquiteturalmente, o espelho passivo agora fica na camada correta de `infrastructure`.

### 10.4 Compat layers ainda nao removidas
As compat layers de tela e tipos continuam ativas.
A remocao delas depende de esvaziar os consumidores legados restantes com seguranca.

## 11. Avaliacao arquitetural
Esta leva pode ser considerada bem-sucedida porque:

- `partners` deixou de ser apenas uma pasta preparada e passou a ser um modulo real
- a maior parte da logica nova do dominio passou a nascer no modulo
- a infraestrutura tecnica usada pelo dominio ficou mais coerente com `src/infrastructure`
- `shared` recebeu apenas o que era realmente transversal
- a compatibilidade foi mantida com baixo risco
- o legado passou a consumir mais do que definir o dominio

## 12. O que ainda nao vale fazer por inercia
Mesmo com o modulo mais maduro, ainda nao e recomendavel fazer automaticamente:

- quebrar o `App.tsx` sem planejamento proprio
- mover tudo relacionado a parceiros para outro estado local/global de uma vez
- subir mais codigo para `shared` sem caso claramente transversal
- transformar `partners` em deposito de codigo reutilizavel de qualquer outro dominio

## 13. Criterio de encerramento desta leva
Esta leva da fase 2 para `partners` pode ser considerada encerrada quando:

- build e tipagem estiverem validados no estado atual
- nao houver regressao funcional nos fluxos principais do dominio
- o time reconhecer `src/modules/partners` como fronteira oficial do dominio

## 14. Proximo passo recomendado
O proximo passo recomendado nao e continuar lapidando `partners` indefinidamente.

A recomendacao e:

1. encerrar oficialmente esta leva do modulo `partners`
2. manter apenas correcoes pontuais se aparecerem
3. iniciar o planejamento do proximo dominio da fase 2 com o mesmo metodo incremental
