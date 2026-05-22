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
