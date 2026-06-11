# Plano Login Rapido

## Objetivo

Melhorar o desempenho mobile no PageSpeed, principalmente FCP e LCP, removendo Firebase Auth, Firestore e Live da cadeia critica da navegacao inicial.

Regra principal:

```text
Antes do login:
- nao carregar Firebase Auth
- nao carregar Firestore
- nao carregar Live
- nao iniciar listeners remotos
- renderizar apenas UI local
```

Depois:

```text
No clique de login/criar conta:
- carregar Firebase Auth sob demanda
```

Depois do login finalizado:

```text
- carregar Firestore quando necessario
- iniciar Live apenas nos fluxos que realmente precisam
```

## Contexto Do Relatorio

O PageSpeed mobile indicou gargalo em FCP e LCP, com TBT e CLS bons.

Leitura inicial:

```text
FCP: ~3.6s
LCP: ~4.9s
TBT: ~20ms
CLS: 0
```

Isso sugere que o app nao esta sofrendo principalmente por CPU bloqueada, mas por carregar dependencias remotas cedo demais.

A cadeia critica mostrou recursos como:

```text
firebase auth iframe.js
getProjectConfig
liveMatches
firebaseLite
```

Hipotese principal:

```text
O app esta leve em execucao, mas acorda Firebase/Auth/Live cedo demais para mobile.
```

## Plano De Acao

### 1. Auditar O Boot Inicial

Objetivo: descobrir tudo que entra antes da primeira tela aparecer.

Arquivos a revisar:

```text
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\main.tsx
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\App.tsx
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\infra\firebase\client.ts
```

Procurar por:

```ts
import { getAuth } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
```

Resultado esperado:

```text
Identificar imports, providers ou effects que carregam Firebase/Auth/Live no carregamento inicial.
```

### 2. Remover Firebase Auth Do Boot

Firebase Auth so deve carregar quando o usuario tentar:

```text
- logar
- criar conta
- recuperar senha
- usar login social, se existir
```

Arquivos provaveis:

```text
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\auth\
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\infra\firebase\
```

Direcao da correcao:

```ts
async function login() {
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  // login real aqui
}
```

O que evitar:

```ts
import { getAuth } from 'firebase/auth';
```

em arquivos carregados no boot inicial.

### 3. Remover Listener Global De Auth

Se existir `onAuthStateChanged` no inicio do app, ele deve sair da navegacao inicial.

Nova logica:

```text
- render inicial usa localStorage
- Firebase so valida sessao depois de uma acao explicita ou fluxo que realmente precise
- nenhuma validacao remota deve bloquear a primeira pintura
```

Arquivos provaveis:

```text
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\App.tsx
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\auth\
```

### 4. Separar Tela Visual De Login Do Servico Firebase

A tela de login deve renderizar leve, sem importar servico Firebase no topo.

Modelo desejado:

```text
AuthScreen/AuthRoute renderiza formulario
handleSubmit importa authService
authService importa firebase/auth sob demanda
```

Beneficio:

```text
O usuario ve a tela de login sem pagar o custo do Firebase Auth iframe.
```

### 5. Bloquear Live Antes Do Login Finalizado

Live nao precisa iniciar antes do login finalizado.

Condicao esperada:

```ts
if (!userProfile?.isProfileComplete) return null;
```

ou equivalente no ponto certo.

Arquivos provaveis:

```text
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\components\LiveSyncManager.tsx
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\GameContext.tsx
```

### 6. Remover Imports Indiretos De Live No Bundle Inicial

Mesmo que a execucao esteja protegida por `if`, um import de topo ainda pode entrar no bundle inicial.

Revisar barrel files:

```text
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\live\index.ts
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\game\index.ts
C:\Users\Celso Ramalho\Documents\GitHub\MyPlacar\src\modules\auth\index.ts
```

Objetivo:

```text
Evitar que App.tsx, providers globais ou rotas iniciais importem modulos que puxam Firestore/Live.
```

### 7. Carregar Live Sob Demanda Apos Login

Depois do login/perfil completo, Live pode ser carregado por rota, componente lazy ou import dinamico.

Direcao possivel:

```ts
const LiveSyncManager = lazy(() => import('./components/LiveSyncManager'));
```

Observacao:

```text
Aplicar apenas se a estrutura atual permitir sem quebrar contexto ou ordem de providers.
```

### 8. Revisar O Elemento LCP

Identificar qual elemento esta sendo contado como LCP no Lighthouse/DevTools.

Se for imagem/logo:

```text
- otimizar dimensoes
- conferir formato
- considerar preload apenas se for realmente o maior elemento visivel
```

Se for texto/card/tela principal:

```text
- garantir render antes de Firebase/Auth/Live
- evitar spinner grande como conteudo principal
```

### 9. Validar Build E Typecheck

Comandos:

```text
pnpm build
npx tsc --noEmit
```

Conferir tambem os chunks gerados no build.

Resultado esperado:

```text
No carregamento inicial, nao devem aparecer chunks relacionados a:
- firebase/auth
- auth/iframe.js
- relyingparty/getProjectConfig
- liveMatches
```

### 10. Rodar PageSpeed Mobile Novamente

Comparar antes/depois.

Metas iniciais:

```text
FCP: sair de ~3.6s para perto de 2s
LCP: sair de ~4.9s para perto de 3s ou menos
TBT: manter baixo
CLS: manter 0
```

## Ordem Recomendada

```text
1. Auditar imports iniciais
2. Tirar Firebase Auth do boot
3. Tirar onAuthStateChanged/listeners globais do boot
4. Impedir Live antes de login finalizado
5. Ajustar imports indiretos/barrels
6. Build + tsc
7. PageSpeed mobile
```

## Criterio De Sucesso

O carregamento inicial mobile deve ser praticamente:

```text
HTML + CSS essencial + React + tela inicial local
```

Firebase Auth deve acordar apenas quando o usuario tentar login/cadastro.

Live/Firestore devem acordar apenas depois de login finalizado e somente nos fluxos que precisam deles.

