# Checkpoint Arquitetural - Fase 2 - Modulo Events

Projeto: MyPlacar PWA  
Data de referencia: 30 de abril de 2026

## 1. Objetivo
Registrar a primeira leva da fase 2 para o dominio `events`, consolidando a fronteira inicial do modulo sem abrir a migracao estrutural de `settings`, `scoreboard` ou `admin`.

Este documento nao redefine a arquitetura do projeto.
Ele registra o estado atual do modulo `events` apos a consolidacao inicial.

## 2. Escopo desta leva
Esta leva teve como foco consolidar:

- tipos oficiais do dominio de eventos/torneios
- telas principais do fluxo de eventos
- API publica minima do modulo
- servicos iniciais de inscricao, listagem e progresso de confrontos
- infraestrutura Firebase tecnica para colecoes de eventos
- compatibilidade temporaria dos caminhos legados

Esta leva nao teve como objetivo:

- quebrar estruturalmente o `App.tsx`
- migrar o painel administrativo inteiro
- consolidar `settings`
- mover o fluxo de placar para `scoreboard`
- refatorar toda a UI interna de `EventDetailScreen`

## 3. Estrutura consolidada do modulo
O modulo `events` passa a ter conteudo real em:

```text
src/modules/events/
  screens/
    EventDetailScreen.tsx
    TournamentsScreen.tsx
  services/
    fetchRegisteredEvents.ts
    getActiveEventEntryDate.ts
    joinTournamentEvent.ts
    updateTournamentMatchProgress.ts
  index.ts
  types.ts
```

## 4. Ajustes de fronteira feitos
### 4.1 O que ficou no modulo
Permanecem em `modules/events`:

- UI principal de torneios/eventos
- tipo `TournamentEvent`
- tipo `TournamentEntry`
- tipo `TournamentPair`
- tipo `TournamentMatch`
- tipo `TournamentConfig`
- tipo `EventRegistration`
- regras operacionais de inscricao em evento
- leitura de inscricoes do usuario
- resolucao da data de entrada no evento ativo
- marcacao de confronto como ao vivo ou finalizado

### 4.2 O que ficou em infrastructure
As operacoes tecnicas de Firestore foram iniciadas em:

- `src/infrastructure/firebase/events.ts`

Esse arquivo concentra acesso tecnico a:

- `events`
- `events/<pin>/entries`
- `user_registrations/<email>/events`
- atualizacao de matches dentro do documento do evento

### 4.3 O que foi para shared
Foi consolidado em `shared` apenas o que ja era transversal:

- `src/shared/components/Input.tsx`
- `src/shared/components/ScoreboardIcon.tsx`
- `src/shared/components/Toggle.tsx`
- `src/shared/utils/formatters.ts`

As pastas legadas correspondentes ficaram como compat layers.

## 5. Compatibilidade temporaria mantida
Continuam como compat layers:

- `src/screens/TournamentsScreen.tsx`
- `src/screens/EventDetailScreen.tsx`
- `src/components/Input.tsx`
- `src/components/ScoreboardIcon.tsx`
- `src/components/Toggle.tsx`
- `src/utils/formatters.ts`
- reexport temporario dos tipos de eventos em `src/types.ts`

Essas camadas so reexportam e existem para reduzir risco enquanto consumidores legados ainda sao esvaziados.

## 6. Pendencias conscientes
`App.tsx` ainda centraliza estado e navegacao de eventos:

- `activeEvent`
- `registeredEvents`
- `userEntryDate`
- transicao entre `tournaments`, `event-detail` e `scoreboard`

`AdminScreen` ainda contem o painel administrativo de eventos.
Isso ficou fora desta leva porque pertence ao contorno `admin`, embora ja consuma o tipo oficial por `@modules/events`.

`AuthScreen` ainda consulta evento para enriquecer o deep link `joinEvent`.
Esse ponto deve ser tratado em uma leva posterior ou quando o modulo `auth` for aprofundado.

## 7. Validacao
Validado nesta leva:

- `npm run lint`
- `npm run build`

O primeiro build precisou de permissao fora do sandbox para iniciar o processo do esbuild.
Depois disso, o build concluiu com sucesso.

## 8. Proximo passo recomendado
O proximo passo mais seguro para `events` e reduzir a logica tecnica ainda presente em `EventDetailScreen`, trocando queries diretas por helpers de `@infra/firebase` e servicos do modulo, sem puxar o painel admin inteiro para dentro do dominio.

## 9. Segunda leva curta
Data de referencia: 30 de abril de 2026

Foi executada uma segunda leva curta para reduzir acesso tecnico direto ao Firestore dentro de `EventDetailScreen`.

### 9.1 Consolidado nesta leva
Foram movidos para `src/infrastructure/firebase/events.ts` ou consumidos a partir dele:

- assinatura do documento do evento por PIN
- leitura de participantes do evento
- atualizacao de participante do evento
- criacao manual de participante
- remocao de participante e registro do usuario
- atualizacao de coadmins
- atualizacao de configuracao do evento
- atualizacao de pares
- atualizacao de confrontos

Tambem foi adicionado em `src/infrastructure/firebase/users.ts`:

- atualizacao tecnica de campos simples do usuario usados pelo fluxo de eventos

### 9.2 O que permaneceu fora desta leva
A assinatura de `live_matches` ainda permanece em `EventDetailScreen`.
Ela foi mantida temporariamente porque cruza o dominio `events` com o placar ao vivo e deve ser tratada com cuidado em uma leva posterior.

## 10. Terceira leva curta
Data de referencia: 30 de abril de 2026

Foi isolada a assinatura tecnica de `live_matches` usada pelo detalhe do evento.

### 10.1 Consolidado nesta leva
Foi criado:

- `src/infrastructure/firebase/liveMatches.ts`

Esse arquivo concentra a assinatura de placares ao vivo por torneio e retorna um mapa por `tournamentMatchId`.

`EventDetailScreen` deixou de montar query de `live_matches` diretamente e passou a consumir:

- `subscribeTournamentLiveScores`

### 10.2 Estado apos esta leva
`EventDetailScreen` nao monta mais caminhos Firestore diretamente para `events`, `entries`, `user_registrations`, `users` ou `live_matches`.

A tela ainda contem bastante regra e UI do dominio, mas a parte tecnica de acesso externo ficou concentrada em `infrastructure`.
