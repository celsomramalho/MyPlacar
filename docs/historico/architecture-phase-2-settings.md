# Planejamento Arquitetural - Fase 2 - Modulo Settings/Profile

Projeto: MyPlacar PWA  
Data de referencia: 15 de maio de 2026

## 1. Objetivo
Registrar o planejamento inicial da fase 2 para o dominio `settings/profile`, antes de qualquer migracao de codigo.

Este documento nao redefine a arquitetura do projeto.
Ele registra a fronteira recomendada para iniciar a consolidacao do modulo `settings` com baixo risco, considerando o estado atual apos as levas de `partners`, `history`, `events`, `auth`, `emailService` e `supabaseMirror`.

## 2. Contexto atual
A arquitetura oficial do frontend continua sendo modular por dominio:

- `src/modules`
- `src/shared`
- `src/infrastructure`
- `src/routes`

O modulo `settings` ja existe, mas ainda nao tem implementacao real:

```text
src/modules/settings/
  index.ts
```

Atualmente, o fluxo real de settings/profile permanece no legado:

```text
src/screens/SettingsScreen.tsx
src/screens/ProfileScreen.tsx
src/screens/settings/SettingsHeader.tsx
src/screens/settings/SettingsTabs.tsx
src/screens/settings/TeamSection.tsx
```

## 3. Avaliacao do dominio
`settings/profile` e um dominio maior e mais sensivel que `auth` na primeira aparencia, porque mistura:

- shell de abas de configuracao
- perfil do usuario
- migracao de PIN para senha
- biometria/passkey
- permissao de camera, microfone e localizacao
- controle de atualizacao/cache/service worker
- configuracao de partida
- composicao de times
- historico
- ajuda
- comunicacoes
- eventos/torneios
- dependencias com `App.tsx`, `game`, `history`, `partners`, `auth`, `live` e `events`

Por isso, a recomendacao e nao migrar tudo em uma unica leva.

## 4. Fronteira recomendada para a primeira leva
A primeira leva deve consolidar apenas o shell de settings e os componentes diretos de navegacao visual:

- `SettingsScreen`
- `SettingsHeader`
- `SettingsTabs`
- API publica do modulo `settings`

Essa leva deve ter como objetivo trocar o consumo do `App.tsx` para `@modules/settings`, mantendo o comportamento funcional atual.

## 5. O que deve ir para `src/modules/settings`
Recomendacao para a primeira leva:

```text
src/modules/settings/
  components/
    SettingsHeader.tsx
    SettingsTabs.tsx
  screens/
    SettingsScreen.tsx
  index.ts
```

Responsabilidade dessa primeira leva:

- renderizar o shell de abas de settings
- coordenar a aba ativa
- compor `ProfileScreen`, `HistorySection`, `HelpScreen` e `TeamSection`
- expor `SettingsScreen` pela API publica do modulo
- manter `SettingsHeader` e `SettingsTabs` como componentes internos do modulo, exceto se ainda houver consumidor externo temporario

## 6. O que nao deve entrar na primeira leva
### 6.1 `ProfileScreen`
`ProfileScreen` nao deve ser movida na primeira leva.

Motivo:

- cria senha via Firebase Auth
- faz login com senha durante migracao
- cadastra e recadastra passkey
- atualiza Firestore diretamente
- gerencia permissao de camera, microfone e localizacao
- limpa service worker e caches no fluxo de atualizacao manual
- mistura perfil, seguranca, dispositivo e versionamento

Esse arquivo deve ser tratado em uma segunda leva propria, depois que o shell de settings estiver consolidado.

### 6.2 `TeamSection`
`TeamSection` tambem nao deve ser movida na primeira leva.

Motivo:

- e mais proxima de configuracao de partida do que de settings puro
- depende de `MatchSettings`
- usa parceiros e fila de jogadores
- consulta icones de esporte no Firebase
- toca eventos/torneios
- tende a se conectar futuramente com `game`, `partners` ou `scoreboard`

Mover `TeamSection` junto abriria uma frente maior do que o necessario para consolidar o shell.

## 7. O que deve continuar em `infrastructure`
As integracoes tecnicas externas devem continuar fora do modulo:

- Firebase Auth
- Firestore
- Supabase
- service worker/cache apenas quando encapsulado tecnicamente em helpers futuros

Na primeira leva, nao e obrigatorio extrair novas funcoes para infrastructure.
Se alguma query tecnica for tocada apenas por mover o shell, a preferencia e manter o comportamento existente e adiar a extracao.

Na segunda leva de `ProfileScreen`, devem ser avaliadas extracoes pontuais para:

- atualizacao tecnica de campos simples do usuario
- operacoes tecnicas de passkey
- operacoes de migracao de auth method
- helpers tecnicos de permissao/dispositivo apenas se ficarem realmente transversais

## 8. O que deve ir para `shared`
Na primeira leva, nada novo precisa ir para `shared`.

Itens como `SettingsHeader` e `SettingsTabs` podem parecer reutilizaveis, mas ainda representam navegacao especifica do fluxo de settings.

Caso `SettingsTabs` continue sendo usado por `NewGameScreen`, a opcao mais segura e:

- manter uma compat layer temporaria no caminho legado
- ou atualizar `NewGameScreen` para consumir pela API publica de `@modules/settings`, se isso nao criar dependencia indevida

Nao mover para `shared` apenas por reutilizacao pontual.

## 9. O que deve permanecer temporariamente no legado
Na primeira leva, devem permanecer temporariamente no legado:

- `src/screens/ProfileScreen.tsx`
- `src/screens/settings/TeamSection.tsx`
- `src/screens/HelpScreen.tsx`, se ainda nao houver decisao de dominio propria
- consumidores legados que ainda dependem de `SettingsTabs`

Devem virar compat layers, se forem movidos:

- `src/screens/SettingsScreen.tsx`
- `src/screens/settings/SettingsHeader.tsx`
- `src/screens/settings/SettingsTabs.tsx`

Compat layers so podem reexportar.

## 10. Ordem mais segura de migracao
Ordem recomendada para a proxima leva:

1. criar `src/modules/settings/screens`
2. criar `src/modules/settings/components`
3. mover `SettingsHeader` para `src/modules/settings/components`
4. mover `SettingsTabs` para `src/modules/settings/components`
5. mover `SettingsScreen` para `src/modules/settings/screens`
6. ajustar imports internos de `SettingsScreen`
7. expor `SettingsScreen` em `src/modules/settings/index.ts`
8. atualizar `App.tsx` para importar `SettingsScreen` de `@modules/settings`
9. manter compat layers nos caminhos legados movidos
10. rodar `npm run lint`
11. rodar `npm run build`
12. registrar checkpoint pequeno

## 11. Riscos e dependencias cruzadas
### 11.1 `SettingsTabs` usado fora de SettingsScreen
`SettingsTabs` tambem e importado por `src/screens/NewGameScreen.tsx`.

Isso exige cuidado para nao quebrar o fluxo de nova partida.

### 11.2 `SettingsScreen` compoe dominios ja migrados
`SettingsScreen` ja compoe:

- `HistorySection` de `@modules/history`
- dados de `@modules/game`
- tipos de `@modules/partners`

A migracao deve preservar consumo por API publica e evitar import interno de modulo.

### 11.3 `ProfileScreen` tem logica sensivel
Mover `ProfileScreen` cedo demais pode misturar:

- `auth`
- `settings`
- `profile`
- `infrastructure`
- versionamento/cache

A decisao sobre ele deve ser explicita, nao por arrasto.

### 11.4 `TeamSection` pode pertencer a outro contorno
`TeamSection` talvez seja mais bem tratado depois, junto de `game`, `scoreboard` ou um subdominio de configuracao de partida.

## 12. Pequenos passos de implementacao sugeridos
Para o proximo chat, os pequenos passos devem ser:

1. confirmar status limpo do repositorio
2. reler este documento e os checkpoints anteriores
3. mapear imports atuais de `SettingsScreen`, `SettingsHeader`, `SettingsTabs` e `TeamSection`
4. mover somente shell/header/tabs
5. criar compat layers
6. atualizar `App.tsx` para `@modules/settings`
7. validar se `NewGameScreen` continua resolvendo `SettingsTabs`
8. rodar lint/build
9. documentar o checkpoint da primeira leva de settings

## 13. Criterio de pronto da primeira leva
A primeira leva de `settings` deve ser considerada pronta quando:

- `src/modules/settings` tiver implementacao real
- `SettingsScreen` for consumido por `@modules/settings`
- caminhos legados movidos forem apenas compat layers
- `ProfileScreen` e `TeamSection` continuarem fora do modulo por decisao documentada
- nao houver nova logica em diretorios legados
- `npm run lint` passar
- `npm run build` passar

## 14. Recomendacao final
O proximo passo nao deve ser mover `ProfileScreen` inteiro.

A recomendacao e consolidar primeiro o shell do modulo `settings`, criando uma base segura para, em seguida, decidir se `ProfileScreen` deve ser:

- parte de `settings`
- subdominio `profile` dentro de `settings`
- ou uma frente propria coordenada com `auth`

## 15. Checkpoint da primeira leva curta
Data de referencia: 15 de maio de 2026

Foi executada a primeira leva curta do modulo `settings`, limitada ao shell visual e de navegacao.

### 15.1 Consolidado nesta leva
Foram movidos para `src/modules/settings`:

```text
src/modules/settings/
  components/
    SettingsHeader.tsx
    SettingsTabs.tsx
  screens/
    SettingsScreen.tsx
  index.ts
```

O `App.tsx` passou a consumir `SettingsScreen` pela API publica:

- `@modules/settings`

`SettingsTabs` tambem foi exposto pela API publica do modulo porque ainda existe consumidor externo temporario:

- `src/screens/NewGameScreen.tsx`

Foram mantidas compat layers nos caminhos legados movidos:

- `src/screens/SettingsScreen.tsx`
- `src/screens/settings/SettingsHeader.tsx`
- `src/screens/settings/SettingsTabs.tsx`

Essas compat layers apenas reexportam e nao receberam logica nova.

### 15.2 O que permaneceu fora desta leva
Permaneceram no legado por decisao consciente:

- `src/screens/ProfileScreen.tsx`
- `src/screens/settings/TeamSection.tsx`

`SettingsScreen` ainda compoe esses arquivos por import legado temporario, sem migrar suas responsabilidades internas.

### 15.3 Validacao
Validado nesta leva:

- `npm run lint`
- `npm run build`

### 15.4 Proximo passo recomendado
O proximo passo nao deve ser mover `TeamSection` por arrasto.

A proxima frente recomendada e planejar uma leva propria para `ProfileScreen`, separando primeiro responsabilidades de perfil, seguranca, dispositivo e versionamento antes de qualquer movimentacao estrutural maior.

## 16. Planejamento da leva propria de `ProfileScreen`
Data de referencia: 15 de maio de 2026

Esta secao registra o planejamento da proxima leva possivel para `ProfileScreen`.
Ela nao representa migracao executada.

### 16.1 Objetivo da leva
Consolidar `ProfileScreen` dentro do modulo `settings` sem puxar `TeamSection` e sem reestruturar o fluxo principal de autenticacao.

O objetivo principal deve ser reduzir o acoplamento tecnico direto da tela, mantendo o comportamento funcional atual.

### 16.2 Fronteira recomendada
Destino recomendado:

```text
src/modules/settings/
  screens/
    ProfileScreen.tsx
  services/
    profileDevice.ts
    profilePermissions.ts
    profilePasskey.ts
    profilePasswordMigration.ts
    profileVersionUpdate.ts
```

Observacao:
- os arquivos de `services` devem ser criados apenas se forem necessarios durante a implementacao;
- a estrutura deve crescer por necessidade real, nao por cerimonia.

Compat layer esperada:

```text
src/screens/ProfileScreen.tsx
```

Essa compat layer deve apenas reexportar e nao receber logica nova.

### 16.3 O que pode entrar nesta leva
Podem ser considerados parte desta leva:

- mover `ProfileScreen` para `src/modules/settings/screens/ProfileScreen.tsx`
- atualizar `SettingsScreen` para consumir `ProfileScreen` pelo caminho interno do modulo
- manter `ProfileScreen` como item interno do modulo, sem expor na API publica, se nao houver consumidor externo real
- trocar imports legados por aliases oficiais quando ja houver fonte consolidada
- reaproveitar a politica de senha existente em `auth`
- encapsular atualizacoes tecnicas simples de usuario em `src/infrastructure/firebase/userProfiles.ts`
- encapsular operacoes tecnicas de passkey em infraestrutura ou servico de settings, conforme a fronteira concreta
- isolar helpers de permissao, dispositivo e atualizacao manual se isso reduzir complexidade sem mudar comportamento

### 16.4 O que nao deve entrar nesta leva
Nao devem ser movidos ou reestruturados nesta leva:

- `src/screens/settings/TeamSection.tsx`
- estado raiz de `userProfile` em `App.tsx` ou `GameContext`
- fluxo principal de login/cadastro de `AuthScreen`
- logout completo da aplicacao
- regras globais de versionamento em `App.tsx`
- reorganizacao visual ampla da tela de perfil
- consolidacao funcional maior de `routes`

### 16.5 Decisoes de fronteira esperadas
`ProfileScreen` deve pertencer ao modulo `settings` nesta etapa porque e acessada como aba de configuracao do usuario.

As operacoes tecnicas externas nao devem permanecer dentro da tela se forem tocadas durante a migracao:

- Firebase Auth deve ser acessado por `@infra/firebase` ou helper tecnico apropriado
- Firestore deve ser acessado por helpers de `src/infrastructure/firebase`
- service worker/cache deve ficar em helper tecnico se a logica for extraida

Regras de negocio especificas da tela podem permanecer em `settings` inicialmente.
Se uma regra se mostrar claramente de autenticacao, ela deve ser consumida por API publica de `auth` ou planejada em uma leva coordenada com `auth`.

### 16.6 Ordem sugerida de implementacao
Ordem recomendada para a leva:

1. confirmar status do repositorio
2. mapear imports e responsabilidades atuais de `ProfileScreen`
3. identificar duplicacoes ja existentes em `auth`, `shared` e `infrastructure`
4. criar apenas helpers tecnicos pequenos necessarios
5. ajustar imports de `ProfileScreen` para aliases oficiais quando seguro
6. mover `ProfileScreen` para `src/modules/settings/screens`
7. atualizar `SettingsScreen` para importar `ProfileScreen` dentro do modulo
8. criar compat layer em `src/screens/ProfileScreen.tsx`
9. rodar `npm run lint`
10. rodar `npm run build`
11. registrar checkpoint da leva executada

### 16.7 Criterio de pronto
A leva de `ProfileScreen` deve ser considerada pronta quando:

- `ProfileScreen` estiver em `src/modules/settings/screens`
- o caminho legado `src/screens/ProfileScreen.tsx` for apenas compat layer
- `SettingsScreen` nao importar mais `ProfileScreen` do legado
- `TeamSection` continuar fora do modulo por decisao documentada
- acessos tecnicos tocados durante a migracao estiverem em `infrastructure` ou helpers apropriados
- nao houver nova logica em diretorios legados
- `npm run lint` passar
- `npm run build` passar

### 16.8 Risco principal
O maior risco desta leva e misturar, por conveniencia, perfil, autenticacao, dispositivo e versionamento em uma refatoracao grande demais.

Por isso, a recomendacao permanece:

- mover a tela com extrações tecnicas minimas;
- nao redesenhar o fluxo;
- nao puxar `TeamSection`;
- nao mover responsabilidades globais de `App.tsx` nesta mesma leva.

## 17. Checkpoint pos dependency-cruiser e DDD/router
Data de referencia: 22 de maio de 2026

Esta secao registra o estado real encontrado apos a refatoracao de `dependency-cruiser` e a reorganizacao DDD/router descritas em `docs/refatoracao_dependency-cruiser.md`.

O codigo atual avancou alem do planejamento original deste documento. Portanto, as secoes anteriores continuam validas como historico de decisao, mas nao representam mais fielmente a arvore atual.

### 17.1 Estado real atual
O modulo `settings` contem hoje:

```text
src/modules/settings/
  components/
    SettingsHeader.tsx
    SettingsTabs.tsx
    TeamSection.tsx
  screens/
    AdminScreen.tsx
    HelpScreen.tsx
    ProfileScreen.tsx
    SettingsScreen.tsx
  index.ts
```

A pasta legada `src/screens` nao existe mais no estado atual.

`SettingsScreen` ja compoe internamente:

- `ProfileScreen`
- `HelpScreen`
- `TeamSection`
- `HistorySection` de `@modules/history/components/HistorySection`

`SettingsTabs` continua sendo usado fora do fluxo principal de settings por `NewGameScreen`. Por isso, ele permanece exposto pela API publica de `@modules/settings` enquanto esse acoplamento existir.

### 17.2 Validacao tecnica do estado atual
Validado neste checkpoint:

- `pnpm lint`
- `pnpm test`
- `pnpm depcruise`
- `pnpm build`

Observacao operacional:
- `pnpm test` e `pnpm build` precisaram rodar fora do sandbox porque o `esbuild` falhou com `spawn EPERM` dentro do sandbox.

### 17.3 Avaliacao arquitetural
O modulo `settings` esta fisicamente consolidado, mas ainda nao deve ser considerado conceitualmente encerrado.

O estado atual e aceitavel como ponto de retomada porque:

- nao ha violacoes no `dependency-cruiser`;
- a tipagem passa;
- os testes passam;
- o build passa;
- nao ha mais `src/screens`;
- o fluxo principal de settings ja consome arquivos internos do proprio modulo.

Porem, ainda existem dividas conscientes:

- `ProfileScreen` mistura perfil, senha, passkey, permissao, dispositivo, versao/cache e Firebase Auth;
- `TeamSection` continua parecendo mais proximo de configuracao de partida/game do que de settings puro;
- `AdminScreen` esta fisicamente dentro de `settings`, mas o dominio `admin` ainda precisa de decisao propria;
- algumas telas ainda consomem barrels de infraestrutura ou componentes/utilitarios legados como manutencao transitoria;
- `SettingsTabs` ainda e compartilhado com `game`, o que deve ser reduzido ou formalizado depois.

### 17.4 Decisao operacional
Para retomar a fase 2, `settings` nao deve receber novas funcionalidades nem novas responsabilidades ate que as dividas acima sejam reduzidas ou documentadas como excecoes temporarias.

A proxima leva recomendada e pequena:

1. manter `SettingsScreen`, `ProfileScreen` e `HelpScreen` em `settings`;
2. tratar `ProfileScreen` com extracoes tecnicas minimas, sem redesenhar fluxo;
3. decidir explicitamente o destino de `TeamSection`;
4. decidir explicitamente o destino de `AdminScreen`, preferencialmente abrindo uma frente propria de `admin`;
5. manter `SettingsTabs` na API publica apenas enquanto houver consumidor externo real.

### 17.5 Criterio atualizado de pronto para Settings
`settings` so deve ser considerado encerrado quando:

- `ProfileScreen` nao concentrar acesso tecnico externo desnecessario;
- `TeamSection` tiver fronteira decidida e documentada;
- `AdminScreen` tiver fronteira decidida e documentada;
- consumidores externos usarem apenas a API publica do modulo, salvo excecoes documentadas em rotas de borda;
- `pnpm lint`, `pnpm test`, `pnpm depcruise` e `pnpm build` continuarem passando.

## 18. Checkpoint da leva pequena de ProfileScreen
Data de referencia: 22 de maio de 2026

Foi executada uma leva pequena e conservadora em `ProfileScreen`, sem redesenhar o fluxo visual e sem mexer na migracao sensivel de passkey/auth.

### 18.1 Consolidado nesta leva
`ProfileScreen` continuou em:

```text
src/modules/settings/screens/ProfileScreen.tsx
```

Foram reduzidas responsabilidades tecnicas diretas da tela:

- validacao de senha passou a reutilizar `validatePassword` de `@modules/auth/services/passwordPolicy`;
- icones de genero passaram a reutilizar `@shared/components/GenderIcons`;
- atualizacoes simples de perfil no Firestore passaram por `updateUserProfileFields` em `@infra/firebase`;
- leitura, gravacao e deteccao do label local do dispositivo foram isoladas em `src/modules/settings/services/profileDevice.ts`;
- checagem e solicitacao de permissoes de microfone, camera e localizacao foram isoladas em `src/modules/settings/services/profilePermissions.ts`;
- teste de latencia do perfil tambem ficou em `profilePermissions.ts`;
- limpeza best-effort de service workers/caches e reload com versao foram isolados em `src/modules/settings/services/profileVersionUpdate.ts`.

### 18.2 O que permaneceu propositalmente fora
Nao foram tratados nesta leva:

- fluxo de criacao/migracao de senha no Firebase Auth alem do reaproveitamento da politica de senha;
- criacao, recadastro e persistencia de passkey;
- redesenho visual de `ProfileScreen`;
- reorganizacao de estado raiz de perfil;
- decisao de fronteira de `TeamSection`;
- decisao de fronteira de `AdminScreen`.

Esses pontos continuam exigindo levas proprias e revisao cuidadosa.

### 18.3 Estado arquitetural apos a leva
`ProfileScreen` ficou mais proxima de uma tela de composicao e estado local, enquanto detalhes tecnicos de navegador e atualizacao passaram para services do proprio modulo `settings`.

A decisao de manter esses helpers dentro de `settings` e intencional:

- eles ainda nascem de necessidades especificas da tela de perfil;
- ainda nao ha prova suficiente de transversalidade para move-los para `shared`;
- promover `profileVersionUpdate` para helper transversal pode ser avaliado depois, ja que existe logica parecida em `useAppConfig`.

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

### 18.5 Proximo passo recomendado
Nao continuar com passkey/auth migration por arrasto.

A proxima decisao recomendada e abrir uma frente propria para `admin`, porque `AdminScreen` esta fisicamente dentro de `settings`, mas representa um dominio maior e mais tecnico que ainda nao tem fronteira documentada.
