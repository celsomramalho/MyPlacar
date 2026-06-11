# Planejamento Arquitetural - Fase 2 - Modulo Admin

Projeto: MyPlacar PWA  
Data de referencia: 22 de maio de 2026

## 1. Objetivo
Registrar o planejamento inicial da fase 2 para o dominio `admin`, antes de qualquer movimentacao de codigo desta frente.

Este documento nao redefine a arquitetura do projeto.
Ele registra a fronteira recomendada para tirar `AdminScreen` de `settings` com baixo risco, considerando o estado atual apos a refatoracao de `dependency-cruiser`, DDD/router e a leva pequena de `ProfileScreen`.

## 2. Contexto atual
A arquitetura oficial do frontend continua sendo modular por dominio:

- `src/modules`
- `src/shared`
- `src/infrastructure`
- `src/routes`

No estado atual, `AdminScreen` esta fisicamente em:

```text
src/modules/settings/screens/AdminScreen.tsx
```

Esse local e considerado transitorio.

O fluxo de rota ja existe em:

```text
src/app/AdminRoute.tsx
```

Hoje `AdminRoute` importa `AdminScreen` diretamente de um arquivo interno de `settings`:

```text
@modules/settings/screens/AdminScreen
```

Essa importacao e aceitavel temporariamente como borda de rota, mas reforca que `admin` ainda nao tem fronteira propria.

## 3. Avaliacao do dominio
`admin` e um dominio amplo e sensivel porque mistura operacoes de alto impacto:

- configuracoes globais do app;
- comandos de voz e sons;
- versao remota do app;
- usuarios e plano premium;
- icones de categorias e esportes;
- arquivos e buckets do Firebase Storage;
- eventos/torneios;
- painel de comunicacoes/avisos;
- limpeza de cache tecnico;
- limpeza de transmissoes ao vivo expiradas;
- migracao manual para Supabase;
- correcao de partidas legadas;
- importacao/exportacao de dados;
- limpeza global de historico.

Por isso, a recomendacao e nao tentar decompor tudo em uma unica leva.

## 4. Fronteira recomendada para a primeira leva
A primeira leva deve consolidar apenas a fronteira estrutural do modulo `admin`.

Objetivo:

- criar `src/modules/admin`;
- mover `AdminScreen` para `src/modules/admin/screens/AdminScreen.tsx`;
- expor `AdminScreen` pela API publica de `@modules/admin`;
- atualizar `src/app/AdminRoute.tsx` para consumir `@modules/admin`;
- manter comportamento funcional atual;
- nao extrair subdominios internos ainda;
- nao redesenhar a tela.

Estrutura inicial recomendada:

```text
src/modules/admin/
  screens/
    AdminScreen.tsx
  index.ts
```

## 5. O que deve entrar na primeira leva
Deve entrar:

- `AdminScreen` como tela principal do modulo;
- tipos locais simples que hoje vivem dentro da propria tela, se continuarem usados apenas nela;
- API publica minima em `src/modules/admin/index.ts`;
- ajuste de `AdminRoute` para consumir `AdminScreen` por `@modules/admin`.

Se durante a movimentacao algum import relativo quebrar, a preferencia e trocar para alias oficial ja existente:

- `@shared/components/Button`;
- `@shared/components/Toggle`, se for consolidado antes ou durante a leva;
- `@shared/components/ScoreboardIcon`, se for consolidado antes ou durante a leva;
- `@shared/utils/formatters`, se for seguro;
- `@infra/firebase/...`;
- `@infra/supabase/...`;
- tipos de dominio por `@modules/<dominio>/types`.

## 6. O que nao deve entrar na primeira leva
Nao devem ser tratados nesta primeira movimentacao:

- extrair toda a gestao de eventos para `events`;
- migrar `CommunicationsPanel`;
- criar submodulo de storage;
- reestruturar migracao Supabase;
- reescrever configuracoes globais;
- mover import/export/clear history para `history`;
- mexer no controle de autorizacao admin;
- redesenhar UI;
- quebrar `AdminScreen` em varias telas;
- criar estado global novo;
- introduzir Zustand.

Esses pontos precisam de levas proprias depois que a fronteira `admin` existir.

## 7. O que deve ir para infrastructure
Operacoes tecnicas externas devem ser candidatas a `infrastructure`, mas somente quando forem tocadas por necessidade real.

Candidatos observados:

- leitura/escrita de `system/config`;
- leitura/escrita de `category_icons`;
- leitura/escrita de `sport_icons`;
- leitura/escrita e delete de `events`;
- leitura/delete de `live_matches`;
- busca de usuarios para administracao;
- atualizacao de plano do usuario;
- operacoes tecnicas de Firebase Storage;
- limpeza tecnica de cache Firestore;
- migracao tecnica para Supabase.

Na primeira leva, nao e obrigatorio extrair tudo isso.
Se a tela for apenas movida, o comportamento deve ser preservado e a extracao tecnica deve ser planejada em levas pequenas.

## 8. O que deve ir para shared
Nada deve ir automaticamente para `shared`.

Possiveis candidatos ja parecem transversais, mas devem ser avaliados com cuidado:

- `Toggle`;
- `ScoreboardIcon`;
- `CommunicationsPanel`, apenas se deixar de carregar regra especifica de comunicacoes/admin;
- helpers de formatacao, quando ja houver equivalente em `@shared/utils/formatters`.

Regra pratica:
- se carregar regra administrativa, fica em `admin`;
- se for componente visual generico e sem regra de negocio, pode ir para `shared`;
- se houver duvida, fica primeiro no modulo.

## 9. Dependencias atuais relevantes
`AdminScreen` hoje depende de:

- Firebase Firestore;
- Firebase Storage;
- Supabase mirror;
- constantes globais de esportes, voz e versao;
- `Button`;
- `Toggle`;
- `ScoreboardIcon`;
- `CommunicationsPanel`;
- tipos de `history`, `events`, `auth` e `src/types`;
- helpers de audio de `useScoreAnnouncer`;
- formatadores legados.

Essas dependencias mostram que `AdminScreen` ainda e uma tela agregadora, nao um modulo limpo.
Isso e aceitavel para a primeira leva desde que o novo modulo nao passe a esconder essa divida como se estivesse encerrada.

## 10. Ordem segura de migracao
Ordem recomendada:

1. confirmar status do repositorio;
2. criar `src/modules/admin/screens`;
3. mover `AdminScreen` para `src/modules/admin/screens/AdminScreen.tsx`;
4. criar `src/modules/admin/index.ts` expondo somente `AdminScreen`;
5. ajustar imports relativos quebrados pelo movimento;
6. atualizar `src/app/AdminRoute.tsx` para importar de `@modules/admin`;
7. garantir que `settings` nao importe `AdminScreen`;
8. rodar `pnpm lint`;
9. rodar `pnpm test`;
10. rodar `pnpm depcruise`;
11. rodar `pnpm build`;
12. registrar checkpoint da primeira leva.

## 11. Riscos e cuidados
### 11.1 Tela grande com muitos efeitos
`AdminScreen` tem muitas responsabilidades e efeitos.
Mover e extrair ao mesmo tempo aumenta o risco de regressao.

### 11.2 Operacoes destrutivas
A tela contem deletes, limpeza de cache, limpeza de lives, exclusao de eventos e limpeza de historico.
Esses fluxos devem ser preservados com muito cuidado.

### 11.3 Firebase Storage
As operacoes de storage usam bucket padrao e buckets adicionais.
Nao devem ser reorganizadas junto com a primeira movimentacao.

### 11.4 Eventos e comunicacoes
Apesar de `admin` editar eventos e conter comunicacoes, isso nao significa que esses dominios devam ser absorvidos por `admin`.
Na primeira leva, `admin` pode orquestrar esses fluxos; depois, servicos especificos podem ser coordenados com `events` e `communications`.

### 11.5 Supabase mirror
Migracao manual para Supabase e espelhamentos devem continuar em `infrastructure/supabase`.
Regras de quando executar a migracao podem ficar em `admin`.

## 12. Criterio de pronto da primeira leva
A primeira leva de `admin` deve ser considerada pronta quando:

- `src/modules/admin` existir com implementacao real;
- `AdminScreen` estiver em `src/modules/admin/screens`;
- `AdminRoute` consumir `AdminScreen` por `@modules/admin`;
- `settings` nao contiver mais `AdminScreen`;
- nao houver nova logica em diretorios legados;
- `pnpm lint` passar;
- `pnpm test` passar;
- `pnpm depcruise` passar com 0 violacoes;
- `pnpm build` passar.

## 13. Proximos passos apos a primeira leva
Depois da movimentacao estrutural, as proximas levas devem ser escolhidas por risco e coesao:

1. extrair helpers tecnicos de `system/config`;
2. extrair helpers de usuarios/admin;
3. extrair helpers de icones/esportes;
4. extrair helpers de eventos administrativos;
5. avaliar `CommunicationsPanel` e decidir se vira modulo proprio;
6. avaliar storage como servico tecnico;
7. reduzir imports legados de componentes/utilitarios.

## 14. Recomendacao final
O proximo passo nao deve ser decompor `AdminScreen` inteiro.

A recomendacao e primeiro dar a ele uma fronteira propria em `src/modules/admin`, mantendo o comportamento atual. So depois disso vale iniciar extracoes pequenas, validadas uma por uma.

## 15. Checkpoint da primeira leva estrutural
Data de referencia: 22 de maio de 2026

Foi executada a primeira leva estrutural do dominio `admin`, limitada a criar a fronteira fisica do modulo sem decompor a tela.

### 15.1 Consolidado nesta leva
`AdminScreen` foi movida para:

```text
src/modules/admin/screens/AdminScreen.tsx
```

Foi criada a API publica minima do modulo:

```text
src/modules/admin/index.ts
```

Essa API publica expoe somente:

- `AdminScreen`

`src/app/AdminRoute.tsx` passou a consumir a tela por:

- `@modules/admin`

### 15.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- decomposicao interna de `AdminScreen`;
- redesenho visual;
- migracao de storage, eventos, comunicacoes ou Supabase;
- movimentacao de `TeamSection`, `ProfileScreen` ou fluxos de passkey/auth.

### 15.3 Estado arquitetural apos a leva
`settings` nao contem mais `AdminScreen` em `src/modules/settings/screens`.

`AdminScreen` continua sendo uma tela agregadora com dividas conhecidas, mas agora tem fronteira propria para permitir extracoes pequenas e reversiveis nas proximas levas.

### 15.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 16. Checkpoint da leva pequena de system/config
Data de referencia: 22 de maio de 2026

Foi executada uma segunda leva pequena em `AdminScreen`, limitada a reduzir conhecimento direto do documento tecnico `system/config`.

### 16.1 Consolidado nesta leva
Foi criado o helper tecnico:

```text
src/infrastructure/firebase/systemConfig.ts
```

Esse helper centraliza:

- leitura de `system/config`;
- escrita parcial com merge em `system/config`;
- tipo tecnico `FirebaseSystemConfig`.

`AdminScreen` passou a usar:

- `fetchSystemConfig`;
- `saveSystemConfigPatch`.

### 16.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- reorganizacao de Firebase Storage ou buckets alem da persistencia da lista em `system/config`;
- extracao de eventos administrativos;
- extracao de usuarios/admin;
- extracao de icones/categorias/esportes;
- decomposicao visual de `AdminScreen`;
- mudancas em Supabase ou comunicacoes.

### 16.3 Estado arquitetural apos a leva
`AdminScreen` nao referencia mais diretamente o caminho Firestore `system/config`.

A tela ainda decide como aplicar os valores em estado local e continua responsavel pela UI e pelas mensagens de status. Isso preserva comportamento atual e deixa a infraestrutura apenas com acesso tecnico.

### 16.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 17. Checkpoint da leva pequena de usuarios/admin
Data de referencia: 22 de maio de 2026

Foi executada uma terceira leva pequena em `AdminScreen`, limitada aos acessos tecnicos de gestao administrativa de usuarios.

### 17.1 Consolidado nesta leva
Foram adicionados helpers em:

```text
src/infrastructure/firebase/users.ts
```

Esses helpers centralizam:

- busca de perfis por prefixo de e-mail;
- atualizacao do `planType` do usuario com merge no documento existente.

`AdminScreen` passou a usar:

- `searchUserProfilesByEmailPrefix`;
- `updateUserPlanType`.

### 17.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- migracao manual Firebase -> Supabase;
- espelhamento Supabase alem da chamada ja existente apos alterar plano;
- regras de autorizacao admin;
- tela ou UX de busca de usuarios;
- demais operacoes de usuarios fora de busca e plano.

### 17.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente a query Firestore de busca de usuarios por e-mail e nao escreve diretamente o `planType` no documento `users`.

A tela continua responsavel por orquestrar estado local, mensagens e espelhamento Supabase ja existente, preservando comportamento.

### 17.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 18. Checkpoint da leva pequena de icones administrativos
Data de referencia: 22 de maio de 2026

Foi executada uma quarta leva pequena em `AdminScreen`, limitada ao acesso Firestore dos metadados de categorias e esportes.

### 18.1 Consolidado nesta leva
Foi criado o helper tecnico:

```text
src/infrastructure/firebase/adminIcons.ts
```

Esse helper centraliza:

- leitura de `category_icons` e `sport_icons`;
- salvamento de um item administrativo de categoria ou esporte;
- exclusao de um item administrativo de categoria ou esporte;
- tipos tecnicos `FirebaseAdminCategoryIcon` e `FirebaseAdminSportIcon`.

`AdminScreen` passou a usar:

- `fetchAdminIconCatalog`;
- `saveAdminIcon`;
- `deleteAdminIcon`.

### 18.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- upload de imagens/base64;
- Firebase Storage;
- reorganizacao do mirror Supabase de icones;
- migracao manual Firebase -> Supabase;
- UI de edicao de categorias/esportes.

### 18.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente as operacoes Firestore principais de `category_icons` e `sport_icons`.

A tela continua responsavel por estado local, selecao, edicao visual e chamada ao espelhamento Supabase ja existente.

### 18.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 19. Checkpoint da leva pequena de eventos administrativos
Data de referencia: 22 de maio de 2026

Foi executada uma quinta leva pequena em `AdminScreen`, limitada ao acesso Firestore da gestao administrativa de eventos.

### 19.1 Consolidado nesta leva
Foi criado o helper tecnico:

```text
src/infrastructure/firebase/adminEvents.ts
```

Esse helper centraliza:

- listagem de documentos de `events` para administracao;
- salvamento de um evento administrativo com merge;
- exclusao de um evento administrativo.

`AdminScreen` passou a usar:

- `fetchAdminEvents`;
- `saveAdminEvent`;
- `deleteAdminEvent`.

### 19.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- subcolecoes de inscricoes de eventos;
- regras de pareamento, partidas ou coadministradores;
- telas publicas do modulo `events`;
- upload e persistencia de banner em Storage;
- reorganizacao de Supabase ou comunicacoes;
- decomposicao visual de `AdminScreen`.

### 19.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente as operacoes Firestore principais da colecao `events` usadas pela aba administrativa.

A tela continua responsavel por estado local, ordenacao, edicao visual, mensagens de status e recarregamento da lista apos salvar.

### 19.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 20. Checkpoint da leva estrutural de comunicacoes/admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva estrutural pequena para tirar o painel administrativo de comunicacoes da pasta legada `src/components`.

### 20.1 Consolidado nesta leva
O painel administrativo de comunicacoes foi movido para:

```text
src/modules/communications/components/AdminCommunicationsPanel.tsx
```

Foi criada a API publica minima do modulo:

```text
src/modules/communications/index.ts
```

Essa API publica expoe somente:

- `AdminCommunicationsPanel`

`AdminScreen` passou a consumir o painel por:

- `@modules/communications`

### 20.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- mover a tela publica de comunicados que ainda esta em `auth`;
- extrair helpers Firestore de comunicacoes;
- alterar `notificationService`;
- mover tipos globais de `Communication` e `Reply`;
- redesenhar o painel ou mudar UX de envio;
- alterar regras de e-mail, push, enquetes, respostas ou reacoes.

### 20.3 Estado arquitetural apos a leva
`CommunicationsPanel` deixou de existir em `src/components` como componente legado.

O dominio `communications` agora tem fronteira propria inicial e pode receber, em levas separadas, a tela publica e os helpers tecnicos de Firestore.

### 20.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 21. Checkpoint da leva estrutural da tela publica de comunicacoes
Data de referencia: 22 de maio de 2026

Foi executada uma leva estrutural pequena para tirar a tela publica de comunicados do modulo `auth`.

### 21.1 Consolidado nesta leva
A tela publica de comunicacoes foi movida para:

```text
src/modules/communications/screens/CommunicationsScreen.tsx
```

A API publica do modulo `communications` passou a expor:

- `AdminCommunicationsPanel`;
- `CommunicationsScreen`.

`AppScreenRouter` passou a consumir a tela por:

- `@modules/communications`

### 21.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- extrair helpers Firestore de comunicacoes;
- mover tipos globais de `Communication`, `Reply` e `PollOption`;
- alterar regras de leitura, voto, reacao ou resposta;
- alterar `notificationService`;
- redesenhar a tela publica ou o painel admin.

### 21.3 Estado arquitetural apos a leva
`auth` nao contem mais a tela publica de comunicados.

O modulo `communications` agora concentra a entrada administrativa e a entrada publica do dominio, ainda preservando os acessos tecnicos diretos para uma proxima leva pequena.

### 21.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 22. Checkpoint da leva pequena de infraestrutura de comunicacoes
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para reduzir acesso direto ao Firestore nos fluxos de comunicacoes.

### 22.1 Consolidado nesta leva
Foi criado o helper tecnico:

```text
src/infrastructure/firebase/communications.ts
```

Esse helper centraliza:

- assinatura dos comunicados recentes para administracao;
- assinatura dos comunicados visiveis para um usuario;
- contagem de comunicados nao lidos;
- criacao e exclusao de comunicados;
- marcacao de comunicado como lido;
- adicao de respostas;
- atualizacao de votos de enquete;
- atualizacao de reacoes;
- busca do PIN de destinatario por e-mail;
- busca de destinatarios para notificacoes em massa.

Passaram a usar esse helper:

- `AdminCommunicationsPanel`;
- `CommunicationsScreen`;
- `useCommunicationsBadge`.

### 22.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- mover tipos globais de `Communication`, `Reply` e `PollOption`;
- alterar contrato de dados da colecao `communications`;
- mudar UX de envio, leitura, voto, reacao ou resposta;
- alterar `notificationService`;
- reorganizar e-mail ou push.

### 22.3 Estado arquitetural apos a leva
As telas de comunicacoes e o hook de badge nao montam mais queries ou updates diretamente contra a colecao `communications`.

As telas continuam responsaveis por estado local, validacoes de interacao e montagem dos dados de UI, enquanto `infrastructure/firebase/communications` concentra o acesso tecnico ao Firestore.

### 22.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 23. Checkpoint da leva pequena de tipos de comunicacoes
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para tirar os tipos de comunicacoes do arquivo global `src/types.ts`.

### 23.1 Consolidado nesta leva
Foi criado:

```text
src/modules/communications/types.ts
```

Esse arquivo passou a concentrar:

- `Communication`;
- `Reply`;
- `PollOption`.

A API publica do modulo `communications` passou a expor esses tipos por:

- `@modules/communications`

Foram atualizados os imports em:

- `AdminCommunicationsPanel`;
- `CommunicationsScreen`;
- `src/infrastructure/firebase/communications.ts`;
- `src/services/notificationService.ts`.

### 23.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- alterar o contrato de dados de `communications`;
- renomear campos Firestore;
- mover `notificationService` para dentro do modulo;
- revisar modelo de push/e-mail;
- mexer nos demais tipos globais de `src/types.ts`.

### 23.3 Estado arquitetural apos a leva
`src/types.ts` nao contem mais os tipos de comunicacoes.

O dominio `communications` agora concentra seus componentes, telas, tipos e helpers tecnicos de Firebase.

### 23.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 24. Checkpoint da leva pequena de servico de notificacoes de comunicacoes
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para aproximar o servico de notificacoes do dominio `communications`.

### 24.1 Consolidado nesta leva
O servico foi movido de:

```text
src/services/notificationService.ts
```

para:

```text
src/modules/communications/services/notificationService.ts
```

`AdminCommunicationsPanel` passou a consumir o servico por caminho interno do modulo.

A compat layer legada:

```text
src/services/emailService.ts
```

foi removida porque nao havia mais consumidores; os fluxos continuam usando a infraestrutura oficial:

- `@infra/email`

### 24.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- implementar push real no lugar da simulacao atual;
- alterar templates de e-mail;
- alterar contrato de envio hibrido;
- mover a infraestrutura de e-mail;
- redesenhar o painel de comunicacoes.

### 24.3 Estado arquitetural apos a leva
O dominio `communications` concentra agora:

- componentes;
- telas;
- tipos;
- helpers tecnicos de Firebase;
- servico de notificacao especifico de comunicados.

### 24.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 25. Checkpoint da leva pequena de Firebase Storage/admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para reduzir acesso direto ao Firebase Storage dentro de `AdminScreen`.

### 25.1 Consolidado nesta leva
Foi criado o helper tecnico:

```text
src/infrastructure/firebase/adminStorage.ts
```

Esse helper centraliza:

- normalizacao do nome do bucket;
- selecao do bucket padrao ou bucket adicional;
- listagem recursiva de arquivos;
- leitura de URL e metadados de arquivos;
- upload de arquivo administrativo;
- exclusao de arquivo administrativo;
- tipo tecnico `FirebaseAdminStorageFile`.

`AdminScreen` passou a usar:

- `fetchAdminStorageFiles`;
- `uploadAdminStorageFile`;
- `deleteAdminStorageFile`.

### 25.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- persistencia da lista de buckets em `system/config`;
- UI da aba de storage;
- regras de seguranca do Firebase Storage;
- upload de imagens/base64 dos icones administrativos;
- reorganizacao de arquivos ou pastas dentro dos buckets.

### 25.3 Estado arquitetural apos a leva
`AdminScreen` nao importa mais APIs diretas de `firebase/storage`.

A tela continua responsavel por estado local, bucket ativo, mensagens e recarregamento da lista apos upload/exclusao.

### 25.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 26. Checkpoint da leva pequena de live matches expiradas
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para reduzir acesso direto a `live_matches` dentro de `AdminScreen`.

### 26.1 Consolidado nesta leva
Foram adicionados helpers em:

```text
src/infrastructure/firebase/liveMatches.ts
```

Esses helpers centralizam:

- calculo de estatisticas das transmissoes ao vivo;
- identificacao de transmissoes expiradas;
- exclusao em lote de transmissoes expiradas;
- tipo tecnico `FirebaseLiveMatchesStats`.

`AdminScreen` passou a usar:

- `fetchLiveMatchesStats`;
- `deleteLiveMatchesByIds`.

### 26.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- alterar o criterio de expiracao de 24 horas;
- mudar a UI de limpeza tecnica;
- mexer nos fluxos de transmissao ao vivo em jogo;
- extrair a correcao de partidas legadas;
- reorganizar hooks de live fora do admin.

### 26.3 Estado arquitetural apos a leva
`AdminScreen` nao consulta nem exclui diretamente documentos da colecao `live_matches` para a limpeza administrativa.

A tela continua responsavel por estado local, confirmacao destrutiva, mensagens e recarregamento das estatisticas.

### 26.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 27. Checkpoint da leva pequena de partidas legadas
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para reduzir acesso direto a `matches` no fluxo de correcao de partidas legadas em `AdminScreen`.

### 27.1 Consolidado nesta leva
Foi adicionado o helper tecnico:

```text
src/infrastructure/firebase/matches.ts
```

Esse helper centraliza:

- busca de partidas sem `ownerEmail`;
- atualizacao em lote dessas partidas;
- retorno da quantidade de partidas vinculadas.

`AdminScreen` passou a usar:

- `linkLegacyMatchesToOwnerEmail`.

### 27.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- migracao manual Firebase -> Supabase;
- leitura de `matches` usada pela migracao Supabase;
- alteracao da regra de identificacao de partidas orfas;
- UI de confirmacao da correcao;
- regras de sincronizacao de historico.

### 27.3 Estado arquitetural apos a leva
`AdminScreen` nao executa mais `writeBatch` diretamente para corrigir partidas legadas.

A tela continua responsavel por abrir/fechar confirmacao, estado de carregamento e mensagens de sucesso/erro.

### 27.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 28. Checkpoint da leva pequena de migracao manual Supabase
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para reduzir a orquestracao tecnica da migracao manual Firebase -> Supabase dentro de `AdminScreen`.

### 28.1 Consolidado nesta leva
Foi criado o helper tecnico:

```text
src/infrastructure/supabase/adminMigration.ts
```

Esse helper centraliza:

- leitura de usuarios no Firebase;
- leitura e agrupamento de partidas por dono;
- leitura de metadados de parceiros;
- leitura de icones de esporte e categoria;
- chamadas de espelhamento para Supabase;
- retorno do resumo da migracao.

`AdminScreen` passou a usar:

- `migrateFirebaseAdminDataToSupabase`.

### 28.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- alterar as funcoes de mirror do Supabase;
- mudar o contrato das tabelas Supabase;
- tornar a migracao transacional;
- adicionar progresso incremental;
- reorganizar a UI da migracao;
- remover espelhamentos pontuais ja existentes em outros fluxos do admin.

### 28.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente as leituras Firestore da migracao manual para Supabase.

A tela continua responsavel por estado de carregamento, mensagens de erro e exibicao do resumo final.

### 28.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 29. Checkpoint da leva pequena de persistencia espelhada do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para tirar espelhamentos Supabase pontuais de dentro de `AdminScreen`.

### 29.1 Consolidado nesta leva
Foi criado o servico interno do modulo:

```text
src/modules/admin/services/adminPersistence.ts
```

Esse servico centraliza:

- atualizacao do plano do usuario no Firebase e espelhamento do usuario no Supabase;
- salvamento de icone administrativo no Firebase e espelhamento do icone no Supabase;
- exclusao de icone administrativo no Firebase e exclusao do espelho no Supabase.

`AdminScreen` passou a usar:

- `updateAdminUserPlan`;
- `saveAdminIconAndMirror`;
- `deleteAdminIconAndMirror`.

### 29.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- migracao manual Firebase -> Supabase;
- regras de autorizacao admin;
- UI de usuarios ou icones;
- helpers puros de Firebase ja existentes;
- funcoes de mirror do Supabase.

### 29.3 Estado arquitetural apos a leva
`AdminScreen` nao chama mais diretamente `mirrorUser`, `mirrorIcon` ou `deleteIcon`.

A tela continua responsavel por estado local, mensagens, selecao e edicao visual dos itens.

### 29.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 30. Estado consolidado apos os checkpoints 15-29
Data de referencia: 22 de maio de 2026

Esta secao registra o estado arquitetural consolidado apos a sequencia de levas pequenas executadas sobre `admin` e `communications`.

O objetivo deste marco e evitar que a fase perca contexto depois de varias extracoes bem-sucedidas.

### 30.1 Fronteiras criadas ou consolidadas
Foram consolidadas as seguintes fronteiras:

```text
src/modules/admin
src/modules/communications
src/infrastructure/firebase
src/infrastructure/supabase
```

`admin` agora possui tela propria, API publica minima e servico interno para persistencias espelhadas.

`communications` deixou de ser um conjunto espalhado entre `components`, `auth`, `services` e `types`, passando a concentrar:

- painel administrativo;
- tela publica;
- tipos do dominio;
- servico de notificacao;
- helper Firebase especifico.

### 30.2 Responsabilidades tecnicas extraidas de AdminScreen
`AdminScreen` deixou de montar diretamente as principais operacoes tecnicas de:

- `system/config`;
- busca e alteracao de plano de usuarios;
- categorias e esportes administrativos;
- eventos administrativos;
- painel e tela de comunicacoes;
- infraestrutura Firebase de comunicacoes;
- tipos de comunicacoes;
- servico de notificacoes de comunicados;
- Firebase Storage administrativo;
- limpeza de `live_matches` expiradas;
- correcao de partidas legadas;
- migracao manual Firebase -> Supabase;
- espelhamentos pontuais de usuarios e icones para Supabase.

### 30.3 Helpers e servicos criados ou ampliados
Foram criados ou ampliados:

```text
src/infrastructure/firebase/systemConfig.ts
src/infrastructure/firebase/users.ts
src/infrastructure/firebase/adminIcons.ts
src/infrastructure/firebase/adminEvents.ts
src/infrastructure/firebase/adminStorage.ts
src/infrastructure/firebase/communications.ts
src/infrastructure/firebase/liveMatches.ts
src/infrastructure/firebase/matches.ts
src/infrastructure/supabase/adminMigration.ts
src/modules/admin/services/adminPersistence.ts
src/modules/communications/components/AdminCommunicationsPanel.tsx
src/modules/communications/screens/CommunicationsScreen.tsx
src/modules/communications/services/notificationService.ts
src/modules/communications/types.ts
```

### 30.4 Estado atual de AdminScreen
`AdminScreen` continua sendo uma tela grande e agregadora, mas agora atua mais como orquestradora de estado, mensagens e UI.

Responsabilidades que ainda permanecem nela:

- selecao e navegacao entre abas administrativas;
- estado local de formularios e edicao visual;
- mensagens de sucesso/erro;
- confirmacoes destrutivas;
- leitura inicial de configuracoes para preencher estado local;
- montagem de dados de UI antes de chamar helpers;
- import/export/clear history recebidos por props;
- chamada direta a `clearFirestoreCache`;
- uso de componentes/utilitarios legados por caminhos relativos.

Isso ainda e divida, mas a superficie tecnica de Firebase/Supabase foi bastante reduzida.

### 30.5 Estado atual de communications
`communications` ja tem fronteira propria funcional.

O modulo contem:

- `AdminCommunicationsPanel`;
- `CommunicationsScreen`;
- `notificationService`;
- `types`;
- API publica em `index.ts`.

A infraestrutura Firebase de comunicacoes fica em:

```text
src/infrastructure/firebase/communications.ts
```

O modulo ainda pode ser refinado depois, mas nao parece mais um candidato urgente da fase `admin`.

### 30.6 Validacao acumulada
Todos os checkpoints de 15 a 29 foram validados com:

- `pnpm lint`;
- `pnpm test`;
- `pnpm depcruise`;
- `pnpm build`.

Resultado recorrente:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

### 30.7 Fila recomendada a partir daqui
As proximas levas recomendadas sao:

1. reduzir imports relativos legados de `AdminScreen`;
2. avaliar `Toggle`, `ScoreboardIcon`, formatadores e audio helpers para aliases/modulos adequados;
3. extrair subcomponentes pequenos e estaveis de `AdminScreen`, comecando por cabecalho, abas, status e modal de confirmacao;
4. avaliar uma acao administrativa para `clearFirestoreCache`;
5. planejar separacao entre admin tecnico e admin funcional.

Nao e recomendado iniciar uma grande decomposicao visual da tela antes de fechar os imports legados e definir os primeiros subcomponentes estaveis.

## 31. Checkpoint da leva pequena de imports compartilhados do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para reduzir imports relativos legados de componentes e utilitarios ja consolidados em `shared`.

### 31.1 Consolidado nesta leva
`AdminScreen` passou a importar por alias oficial:

- `@shared/components/Toggle`;
- `@shared/components/ScoreboardIcon`;
- `@shared/utils/formatters`.

Foram removidos da tela os imports relativos equivalentes para:

- `../../../components/Toggle`;
- `../../../components/ScoreboardIcon`;
- `../../../utils/formatters`.

### 31.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- constantes globais de `src/constants`;
- tipos globais de `src/types`;
- helpers de audio de `useScoreAnnouncer`;
- remocao das compat layers legadas em `src/components` e `src/utils`;
- refatoracao visual de `AdminScreen`.

### 31.3 Estado arquitetural apos a leva
`AdminScreen` usa aliases oficiais para os componentes compartilhados e formatadores ja consolidados.

Ainda restam imports relativos em pontos que precisam de avaliacao propria antes de movimentacao.

### 31.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 32. Checkpoint da leva pequena de acao tecnica de cache
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para tirar a chamada direta de limpeza de cache Firestore do JSX de `AdminScreen`.

### 32.1 Consolidado nesta leva
Foi criado o servico interno:

```text
src/modules/admin/services/adminTechnicalActions.ts
```

Esse servico expoe:

- `clearAdminFirestoreCache`.

`AdminScreen` passou a chamar essa acao administrativa em vez de importar `clearFirestoreCache` diretamente de `@infra/firebase`.

### 32.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- comportamento interno de `clearFirestoreCache`;
- modal de confirmacao;
- fluxos de startup que tambem usam `clearFirestoreCache`;
- decomposicao visual do modal.

### 32.3 Estado arquitetural apos a leva
`AdminScreen` nao aciona mais diretamente a infraestrutura de limpeza de cache.

A tela continua responsavel por abrir/fechar o modal e exibir a confirmacao destrutiva.

### 32.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 33. Checkpoint da leva pequena de modais de confirmacao do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair os modais de confirmacao estaveis do topo de `AdminScreen`.

### 33.1 Consolidado nesta leva
Foi criado o componente:

```text
src/modules/admin/components/AdminConfirmModals.tsx
```

Esse componente centraliza:

- confirmacao de limpeza de cache tecnico;
- confirmacao de correcao de partidas legadas;
- confirmacao de exclusoes destrutivas;
- tipo `AdminDeleteConfirm`.

`AdminScreen` passou a renderizar:

- `AdminConfirmModals`.

### 33.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- logica de confirmacao/exclusao;
- comportamento dos botoes destrutivos;
- modal de status;
- cabecalho e tabs;
- demais secoes visuais do admin.

### 33.3 Estado arquitetural apos a leva
`AdminScreen` ficou menor no bloco inicial de renderizacao e passou a delegar os modais de confirmacao a um componente interno do modulo `admin`.

A tela continua responsavel por estado e callbacks dos fluxos confirmados.

### 33.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 34. Checkpoint da leva pequena de cabecalho e abas do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair o cabecalho e a navegacao por abas de `AdminScreen`.

### 34.1 Consolidado nesta leva
Foram criados:

```text
src/modules/admin/components/AdminHeader.tsx
src/modules/admin/types.ts
```

`AdminHeader` centraliza:

- titulo do painel administrativo;
- botao de voltar;
- lista de abas administrativas;
- estado visual da aba ativa.

`src/modules/admin/types.ts` passou a expor:

- `AdminTab`.

`AdminScreen` passou a renderizar:

- `AdminHeader`.

### 34.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- conteudo das abas;
- logica de carregamento ao trocar de aba;
- status global;
- layout do rodape;
- decomposicao das secoes internas.

### 34.3 Estado arquitetural apos a leva
`AdminScreen` ficou menor no bloco de renderizacao e deixou de montar diretamente a estrutura visual do cabecalho e das tabs.

A tela continua dona do estado `adminTab` e da decisao de qual conteudo renderizar.

### 34.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 35. Checkpoint da leva pequena de status global do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair o alerta global de status de `AdminScreen`.

### 35.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminStatusAlert.tsx
```

Esse componente centraliza:

- renderizacao visual de status de sucesso;
- renderizacao visual de status de erro;
- tipo `AdminStatus`.

`AdminScreen` passou a renderizar:

- `AdminStatusAlert`.

### 35.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- origem das mensagens de status;
- tempos de limpeza das mensagens;
- estados locais das abas;
- demais alertas internos de subcomponentes.

### 35.3 Estado arquitetural apos a leva
`AdminScreen` deixa de montar diretamente o alerta global de status no `main`.

A tela continua responsavel por definir e limpar o estado `status`.

### 35.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 36. Checkpoint da leva pequena de navegacao inferior do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair a navegacao inferior de `AdminScreen`.

### 36.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminBottomNav.tsx
```

Esse componente centraliza:

- botao de inicio;
- botao de regras;
- botao de historico;
- botao de perfil;
- botao de menu.

`AdminScreen` passou a renderizar:

- `AdminBottomNav`.

### 36.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- comportamento dos callbacks recebidos por props;
- navegacao principal do app;
- layout do conteudo das abas;
- estado ativo do rodape.

### 36.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente a barra inferior.

A tela continua apenas repassando os callbacks recebidos do shell/rota.

### 36.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 37. Checkpoint da leva pequena de inputs ocultos do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair os inputs ocultos de arquivo de `AdminScreen`.

### 37.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminHiddenFileInputs.tsx
```

Esse componente centraliza:

- input oculto de imagem usado pelos icones de categorias e esportes;
- input oculto de JSON usado pela importacao administrativa;
- leitura tecnica dos arquivos via `FileReader`.

Tambem foi criado o tipo compartilhado:

```text
src/modules/admin/types.ts
```

- `AdminIconUploadTarget`.

`AdminScreen` passou a renderizar:

- `AdminHiddenFileInputs`.

### 37.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- fluxo de upload generico para Storage;
- upload de banner de eventos;
- validacao de conteudo do JSON importado;
- reorganizacao das abas de icones e arquivos.

### 37.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente os inputs ocultos globais de arquivo.

A tela continua responsavel por aplicar o resultado lido nos estados de categorias, esportes e importacao externa.

### 37.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 38. Checkpoint da leva pequena de banner de evento do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para retirar a leitura do arquivo de banner de evento de `AdminScreen`.

### 38.1 Consolidado nesta leva
Foi ampliado:

```text
src/modules/admin/components/AdminHiddenFileInputs.tsx
```

Esse componente agora centraliza tambem:

- input oculto de imagem usado pelo banner de eventos;
- leitura tecnica do banner via `FileReader`;
- callback `onEventBannerLoaded`.

`AdminScreen` passou a repassar:

- `eventBannerInputRef`;
- `handleEventBannerLoaded`.

### 38.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- formulario visual de eventos;
- persistencia dos eventos;
- validacao ou compressao da imagem do banner;
- fluxo de upload generico para Storage.

### 38.3 Estado arquitetural apos a leva
`AdminScreen` nao contem mais inputs ocultos globais de arquivo.

A tela continua responsavel apenas por aplicar o `bannerUrl` carregado no evento em edicao.

### 38.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 39. Checkpoint da leva pequena de limpeza do storage admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para remover o fluxo tecnico de Storage que estava órfao em `AdminScreen`.

### 39.1 Consolidado nesta leva
Foram removidos de `AdminScreen`:

- estados internos de listagem/upload de arquivos de Storage;
- ref `genericFileInputRef`;
- handlers `fetchStorageFiles`, `handleUploadGenericFile` e `handleDeleteStorageFile`;
- branch de confirmacao para `file` e `bucket`;
- importacoes de `@infra/firebase/adminStorage`;
- dependencia direta de `getStorageInstance`.

Tambem foi removido:

```text
src/infrastructure/firebase/adminStorage.ts
```

Esse arquivo ficou sem consumidores depois da limpeza e era reportado como orfao pelo `dependency-cruiser`.

### 39.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- reintroducao de uma tela real de gerenciamento de Storage;
- desenho de uma nova experiencia para arquivos/buckets;
- migracao de dados de bucket em `system/config`.

### 39.3 Estado arquitetural apos a leva
`AdminScreen` nao carrega mais codigo tecnico inacessivel de Storage.

Se a gestao de arquivos voltar, ela deve entrar como fluxo completo e visivel, preferencialmente em componente/servico proprio.

### 39.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 40. Checkpoint da leva pequena de item de comando de voz do admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair a UI repetida de comandos de voz de `AdminScreen`.

### 40.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminVoiceCommandItem.tsx
```

Esse componente centraliza:

- estrutura visual de cada comando de voz;
- exibicao de condicao tecnica;
- textos de finalidade e uso;
- input editavel de termos separados por virgula.

`AdminScreen` manteve apenas o adaptador `renderCmdItem`, responsavel por ligar `VoiceCommands` ao componente extraido.

### 40.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- dados/listas dos comandos de voz;
- secao visual completa de regras de voz;
- persistencia dos comandos em `system/config`;
- ajuste textual dos exemplos existentes.

### 40.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente o card repetido de cada regra de voz.

A tela continua dona do estado `voiceCommands`, das secoes abertas e da persistencia da configuracao.

### 40.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 41. Checkpoint da leva pequena de card de migracao Supabase
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair o card visual de migracao Supabase de `AdminScreen`.

### 41.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminSupabaseMigrationCard.tsx
```

Esse componente centraliza:

- cabecalho visual da migracao;
- exibicao do resultado agregado;
- botao de disparo da migracao;
- tipo `AdminMigrationResult`.

`AdminScreen` passou a renderizar:

- `AdminSupabaseMigrationCard`.

### 41.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- execucao tecnica da migracao;
- servico `migrateFirebaseAdminDataToSupabase`;
- mensagens de erro/sucesso globais;
- demais secoes da aba de configuracoes.

### 41.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente o card de migracao Supabase.

A tela continua dona do estado `isMigrating`, do `migrationResult` e da chamada de orquestracao `executeMigrateToSupabase`.

### 41.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 42. Checkpoint da leva pequena de painel de usuarios admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair a UI da aba de usuarios de `AdminScreen`.

### 42.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminUsersPanel.tsx
```

Esse componente centraliza:

- campo de busca por e-mail;
- botao de busca com estado de carregamento;
- lista de usuarios encontrados;
- indicador visual de plano premium;
- botao de ativar/revogar premium.

`AdminScreen` passou a renderizar:

- `AdminUsersPanel`.

### 42.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- busca tecnica no Firestore;
- persistencia do plano do usuario;
- mensagens globais de status;
- regras de permissao administrativa.

### 42.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente a UI da aba de usuarios.

A tela continua dona de `userSearch`, `foundUsers`, `isSearchingUsers` e da orquestracao de busca/alteracao de plano.

### 42.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 43. Checkpoint da leva pequena de painel de eventos admin
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena para extrair a UI da aba de eventos de `AdminScreen`.

### 43.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminEventsPanel.tsx
```

Esse componente centraliza:

- cabecalho da gestao de eventos;
- formulario visual de edicao/criacao;
- acao visual de carregar banner;
- listagem dos eventos cadastrados;
- estados visuais de carregamento e lista vazia;
- botoes de editar e excluir evento.

`AdminScreen` passou a renderizar:

- `AdminEventsPanel`.

### 43.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- leitura do arquivo de banner;
- persistencia dos eventos no Firestore;
- carregamento tecnico da lista;
- confirmacao global de exclusao;
- validacao de campos do evento.

### 43.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente a UI da aba de eventos.

A tela continua dona de `eventList`, `editingEvent`, `isLoadingEvents`, `isSavingEvent` e da orquestracao de salvar/excluir eventos.

### 43.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 44. Proximos passos apos os checkpoints 31-43
Data de referencia: 22 de maio de 2026

Depois das levas 31-43, `AdminScreen` esta menor e atua mais como tela orquestradora.

Foram extraidos componentes estaveis para:

- modais de confirmacao;
- cabecalho e tabs;
- alerta global de status;
- navegacao inferior;
- inputs ocultos de arquivo;
- item de comando de voz;
- card de migracao Supabase;
- painel de usuarios;
- painel de eventos.

Tambem foi removido o fluxo tecnico orfao de Storage/admin.

### 44.1 Proximo passo recomendado
O proximo passo recomendado e extrair a secao visual completa de regras de voz da aba `configs`.

Motivo:

- ja existe `AdminVoiceCommandItem`;
- o bloco ainda concentra acordeoes, textos e lista de comandos dentro de `AdminScreen`;
- a persistencia dos comandos ja pode continuar no componente pai;
- e uma extracao visual de baixo risco.

Escopo sugerido:

```text
src/modules/admin/components/AdminVoiceRulesPanel.tsx
```

Responsabilidades do novo componente:

- renderizar os tres grupos de comandos de voz;
- controlar visualmente os blocos abertos via props;
- receber `voiceCommands`;
- receber `updateCommandField`;
- usar `AdminVoiceCommandItem`.

O que deve ficar em `AdminScreen` nesta leva:

- estado `voiceCommands`;
- estados `isOpenCVP`, `isOpenCVS`, `isOpenCVO`;
- persistencia em `handleSaveVoiceConfigs`;
- leitura de `system/config`.

### 44.2 Passos seguintes, em ordem sugerida
Depois da extracao das regras de voz:

1. Extrair o card de configuracoes gerais da aba `configs`.
2. Extrair o bloco tecnico de cache/live matches/partidas legadas, se ainda estiver visualmente acoplado na aba.
3. Extrair a UI de categorias para um componente proprio da aba `icons`.
4. Extrair a UI de esportes para um componente proprio da aba `icons`.
5. Avaliar se `handleSaveItem`, `handleAddNew` e `handleIdChange` devem virar servico/hook de catalogo admin.
6. Atualizar o estado consolidado do documento para substituir o resumo antigo dos checkpoints 15-29 por um resumo dos checkpoints 15-43.

### 44.3 Cuidados antes das proximas levas
Manter as proximas alteracoes pequenas.

Evitar nesta fase:

- redesenhar visualmente as abas;
- alterar contrato de dados de categorias/esportes;
- reintroduzir Storage/admin sem uma tela completa e visivel;
- mover persistencia para hooks antes de terminar a separacao visual mais obvia.

### 44.4 Validacao esperada para cada leva
Para cada proxima leva, manter a mesma bateria:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

## 45. Checkpoint da leva pequena de painel de regras de voz
Data de referencia: 22 de maio de 2026

Foi executada a leva recomendada no checkpoint 44 para extrair a secao visual completa de regras de voz de `AdminScreen`.

### 45.1 Consolidado nesta leva
Foi criado:

```text
src/modules/admin/components/AdminVoiceRulesPanel.tsx
```

Esse componente centraliza:

- cabecalho da secao de regras de voz;
- acordeao de comandos que alteram o placar;
- acordeao de comandos que nao alteram o placar;
- acordeao de comandos extras;
- renderizacao do item especial `cvp2`;
- uso de `AdminVoiceCommandItem` para os comandos editaveis.

`AdminScreen` passou a renderizar:

- `AdminVoiceRulesPanel`.

### 45.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- persistencia dos comandos em `system/config`;
- estado `voiceCommands`;
- estados `isOpenCVP`, `isOpenCVS` e `isOpenCVO`;
- acao `handleSaveVoiceConfigs`;
- textos e condicoes existentes dos comandos.

### 45.3 Estado arquitetural apos a leva
`AdminScreen` nao monta mais diretamente a secao visual de regras de voz.

A tela continua dona do estado dos comandos, dos blocos abertos e da persistencia da configuracao.

### 45.4 Validacao
Validado nesta leva:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Resultado:

- tipagem OK;
- 64 testes passando;
- 0 violacoes no dependency-cruiser;
- build concluido com sucesso.

## 46. Proximos passos apos o painel de regras de voz
Data de referencia: 22 de maio de 2026

Com a secao de regras de voz extraida, a proxima leva recomendada passa a ser a extracao do card de configuracoes gerais da aba `configs`.

Escopo sugerido:

```text
src/modules/admin/components/AdminGeneralConfigCard.tsx
```

Responsabilidades provaveis:

- estado visual da regra de ouro;
- seletor de som de erro;
- campo de versao remota;
- seletor de URL do sistema;
- botoes de exportar/importar;
- botao de salvar alteracoes.

O que deve permanecer em `AdminScreen` nessa proxima leva:

- estado `goldenRule`;
- estado `errorSound`;
- estado `remoteAppVersion`;
- estado `appUrl`;
- estado `isSavingVoice` e `isVoiceSaved`;
- handler `handleSaveVoiceConfigs`;
- refs/callbacks de importacao/exportacao.

Depois dessa leva, os proximos candidatos continuam sendo:

1. bloco tecnico de cache/live matches/partidas legadas;
2. painel de categorias da aba `icons`;
3. painel de esportes da aba `icons`;
4. revisao de servico/hook para catalogo admin;
5. consolidado atualizado dos checkpoints 15-45.
