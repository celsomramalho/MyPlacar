# Checkpoint Arquitetural - Fase 2 - Modulo Auth

Projeto: MyPlacar PWA  
Data de referencia: 7 de maio de 2026

## 1. Objetivo
Registrar a primeira leva da fase 2 para o dominio `auth`, consolidando a fronteira inicial do modulo sem abrir a migracao estrutural de `settings`, `scoreboard`, `events` ou `admin`.

Este documento nao redefine a arquitetura do projeto.
Ele registra o estado atual do modulo `auth` apos a consolidacao inicial.

## 2. Escopo desta leva
Esta leva teve como foco consolidar:

- tela principal do fluxo de autenticacao
- tipos oficiais do dominio de autenticacao/perfil
- API publica minima do modulo
- servicos puros iniciais de senha, codigos e sessao local
- infraestrutura Firebase tecnica para perfis de usuario e tokens de login por relogio
- compatibilidade temporaria dos caminhos legados

Esta leva nao teve como objetivo:

- quebrar estruturalmente o `App.tsx`
- migrar `ProfileScreen` ou `SettingsScreen`
- mover toda a logica de logout/live para dentro de `auth`
- migrar `emailService` ou `supabaseMirror` para `infrastructure`
- redesenhar o fluxo visual de login/cadastro

## 3. Estrutura consolidada do modulo
O modulo `auth` passa a ter conteudo real em:

```text
src/modules/auth/
  screens/
    AuthScreen.tsx
    Login.tsx
  services/
    authCodes.ts
    authSession.ts
    passwordPolicy.ts
  index.ts
  types.ts
```

## 4. Itens efetivamente consolidados
Os itens abaixo passam a ser considerados parte consolidada do dominio `auth`:

### 4.1 UI principal do dominio
- `src/modules/auth/screens/AuthScreen.tsx`
- `src/modules/auth/screens/Login.tsx`

Observacao:
- `AuthScreen` e a tela usada pelo fluxo principal do app.
- `Login` ja existia no modulo e segue exposto pela API publica, mas representa um fluxo paralelo baseado em Supabase.

### 4.2 Tipos oficiais do dominio
- `UserProfile`
- `PlanType`

Fonte oficial atual:
- `src/modules/auth/types.ts`

`src/types.ts` passou a reexportar esses tipos a partir de `@modules/auth`, mantendo compatibilidade temporaria para consumidores legados.

### 4.3 API publica do modulo
Fonte oficial atual:
- `src/modules/auth/index.ts`

Essa API publica expoe:

- `AuthScreen`
- `Login`
- `UserProfile`
- `PlanType`

### 4.4 Servicos de dominio extraidos
Foram consolidados no modulo:

- politica de validacao de senha
- geracao de codigo de verificacao por e-mail
- geracao de PIN de usuario
- geracao de codigo de login por relogio
- leitura e escrita de dados locais de sessao usados pelo fluxo de auth
- limpeza de dados pendentes de cadastro/reset

## 5. Ajustes de fronteira feitos
### 5.1 O que ficou no modulo
Permanecem em `modules/auth`:

- tela principal de autenticacao
- tipo `UserProfile`
- tipo `PlanType`
- regra de validacao de senha
- geracao de codigos/PINs usados pelo fluxo de autenticacao
- coordenacao local de sessao e pendencias do fluxo de cadastro/verificacao

### 5.2 O que ficou em infrastructure
As operacoes tecnicas de Firebase foram consolidadas ou consumidas a partir de:

- `src/infrastructure/firebase/userProfiles.ts`
- `src/infrastructure/firebase/watchTokens.ts`
- `src/infrastructure/firebase/events.ts`
- `src/infrastructure/firebase/users.ts`

Esses arquivos concentram acesso tecnico a:

- documentos de `users` por e-mail
- busca de usuario por PIN
- busca de usuario por `passkeyCredentialId`
- criacao de perfil novo com timestamp tecnico
- leitura de evento por PIN para deep link `joinEvent`
- criacao, assinatura e remocao de `watch_tokens`

Com isso, `AuthScreen` deixou de montar queries Firestore diretamente para `users`, `events` e `watch_tokens`.

### 5.3 O que foi para shared
Foram consolidados em `shared` apenas apoios transversais:

- `src/shared/components/Button.tsx`
- `src/shared/utils/device.ts`

Tambem passaram a ser consumidos diretamente por `AuthScreen` os itens compartilhados ja existentes:

- `src/shared/components/Input.tsx`
- `src/shared/components/ScoreboardIcon.tsx`
- `src/shared/components/Toggle.tsx`
- `src/shared/utils/formatters.ts`

Nenhuma regra de negocio de `auth` foi movida para `shared`.

## 6. Compatibilidade temporaria mantida
Continuam como compat layers:

- `src/screens/AuthScreen.tsx`
- `src/components/Button.tsx`
- `src/utils/device.ts`
- reexport temporario de `UserProfile` e `PlanType` em `src/types.ts`

Essas camadas so reexportam e existem para reduzir risco enquanto consumidores legados ainda sao esvaziados.

## 7. Impacto pratico no App.tsx
`App.tsx` continua centralizador, mas passou a consumir `auth` pela API publica:

- `AuthScreen` vem de `@modules/auth`
- `UserProfile` vem de `@modules/auth`

O `App.tsx` ainda centraliza:

- estado raiz de `userProfile`
- decisao inicial de tela
- persistencia global de perfil em alguns fluxos
- logout completo da aplicacao
- efeitos cruzados com live, historico, eventos e settings

Isso ficou fora desta leva para manter a migracao incremental e evitar misturar `auth` com responsabilidades de `scoreboard/live`.

## 8. Limpezas pequenas consolidadas
Nesta leva tambem foram feitas limpezas pequenas:

- `AuthScreen` saiu de `src/screens` e virou tela real do modulo
- `src/screens/AuthScreen.tsx` virou compat layer
- `UserProfile` deixou de ter definicao duplicada em `src/types.ts`
- `Button` e `device` sairam do legado como fontes oficiais e foram para `shared`
- `AuthScreen` passou a consumir apoios transversais por `@shared`
- `AuthScreen` passou a consumir Firebase tecnico por `@infra/firebase`

## 9. Estado atual dos consumidores legados
Ainda existem consumidores legados do dominio `auth` ou de `UserProfile`, o que neste momento e aceitavel.

Principais consumidores atuais:

- `src/App.tsx`
- `src/screens/SettingsScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/ScoreboardScreen.tsx`
- `src/screens/AdminScreen.tsx`
- `src/screens/CommunicationsScreen.tsx`
- `src/types.ts` como reexport temporario

Porem, o consumo ja esta mais alinhado com a arquitetura porque:

- o fluxo principal de autenticacao e importado por `@modules/auth`
- `UserProfile` e `PlanType` tem fonte oficial no modulo
- consumidores legados ainda podem funcionar por compatibilidade temporaria

## 10. Pendencias conscientes
### 10.1 `ProfileScreen` continua fora do modulo
`ProfileScreen` ainda contem fluxo de migracao de PIN para senha, cadastro de passkey e edicao de perfil.

Esse arquivo ficou fora desta leva porque hoje pertence ao contorno operacional de `settings/profile`, e move-lo junto abriria uma frente maior que `auth`.

### 10.2 `emailService` continua em pasta legada
`src/services/emailService.ts` continua fora de `infrastructure`.

Arquiteturalmente, esse arquivo parece integracao externa e deve ser migrado futuramente para `infrastructure`, mas isso foi mantido fora desta leva para reduzir risco.

### 10.3 `supabaseMirror` continua em pasta legada
`src/services/supabaseMirror.ts` continua fora de `infrastructure`.

Esse arquivo tambem parece infraestrutura tecnica, mas sua migracao deve ser tratada em uma leva propria porque pode afetar mais de um dominio.

### 10.4 Logout completo continua no App
O logout ainda mistura sessao, limpeza de estado raiz e encerramento/limpeza de live.

Isso nao deve ser movido integralmente para `auth` enquanto `scoreboard/live` ainda nao estiver consolidado.

### 10.5 Fluxos manuais ainda precisam de validacao funcional
Foram validados build e tipagem.
Os fluxos manuais ainda devem ser conferidos no navegador conforme disponibilidade de ambiente:

- login por senha
- login com Google
- cadastro novo
- recuperacao/reset de senha
- login offline
- PIN legado
- biometria/passkey
- login por relogio

## 11. Avaliacao arquitetural
Esta leva pode ser considerada bem-sucedida porque:

- `auth` deixou de expor apenas `Login` e passou a concentrar a tela principal do dominio
- a API publica do modulo passou a ser o ponto oficial de consumo
- os tipos do dominio passaram a ter fonte oficial em `modules/auth`
- a tela principal deixou de montar queries Firestore diretamente
- infraestrutura tecnica nova nasceu em `src/infrastructure/firebase`
- `shared` recebeu apenas apoios transversais
- os caminhos legados foram mantidos como compat layers

## 12. O que ainda nao vale fazer por inercia
Mesmo com o modulo mais maduro, ainda nao e recomendavel fazer automaticamente:

- mover `ProfileScreen` inteiro para `auth` sem decidir a fronteira com `settings`
- colocar regras de perfil/senha em `shared`
- mover logout completo para `auth` enquanto ele ainda fecha live e limpa estado global
- misturar o fluxo Supabase de `Login` com o fluxo Firebase principal sem decisao propria
- quebrar `App.tsx` nesta mesma frente

## 13. Criterio de encerramento desta leva
Esta leva da fase 2 para `auth` pode ser considerada encerrada quando:

- build e tipagem estiverem validados no estado atual
- nao houver regressao funcional nos fluxos principais de autenticacao
- o time reconhecer `src/modules/auth` como fronteira oficial do dominio
- pendencias de `emailService`, `supabaseMirror` e `ProfileScreen` estiverem registradas como conscientes

## 14. Proximo passo recomendado
O proximo passo recomendado nao e continuar expandindo `auth` indefinidamente.

A recomendacao e:

1. validar manualmente os fluxos principais de autenticacao
2. manter apenas correcoes pontuais se aparecerem
3. tratar `emailService`/`supabaseMirror` como migracoes pequenas de infraestrutura, ou seguir para o proximo dominio da fase 2
