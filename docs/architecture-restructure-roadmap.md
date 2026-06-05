# Roadmap de Reestruturação Arquitetural — MyPlacar

**Última atualização:** 2026-06-05  
**Status geral:** Rodadas 0 a 11 concluídas; todas as rodadas planejadas finalizadas.  
**Objetivo:** consolidar a estrutura em `app`, `core`, `modules`, `shared`, `infrastructure` e `pwa`, reduzindo pastas ambíguas e deixando claro onde criar novos arquivos.

---

## 1. Princípios

1. Fazer a migração em rodadas pequenas, sempre com validação ao final.
2. Mover primeiro o que já está parcialmente modularizado; novos domínios ficam para depois.
3. Evitar refatorações de comportamento junto com movimentação de arquivos.
4. Manter `shared` pequeno: só componentes, hooks, utils e tipos realmente transversais.
5. Tratar `infrastructure` como I/O externo, não como lugar de regra de negócio.
6. Usar DDD-lite: domínio claro, casos de uso claros, sem criar camadas vazias por obrigação.
7. Endurecer regras aos poucos com `dependency-cruiser`, depois que cada frente estiver estável.

---

## 2. Estrutura Alvo

```txt
src/
  app/
    bootstrap/
    providers/
    routes/
    guards/
    shell/
    hooks/

  core/
    constants/
    config/
    errors/
    logger/
    types/

  pwa/
    registerServiceWorker.ts
    updateFlow.ts
    installPrompt.ts
    offline/
    cache/

  shared/
    components/
    hooks/
    utils/
    types/
    constants/

  infrastructure/
    firebase/
      client.ts
      clientLite.ts
    supabase/
      client.ts
    email/
    storage/
    notifications/

  modules/
    auth/
    game/
    live/
    events/
    history/
    partners/
    settings/
    admin/
    communications/
    home/
```

Dentro de módulos maiores, preferir:

```txt
modules/<domain>/
  domain/
  application/
  infrastructure/
    adapters/
  presentation/
    components/
    hooks/
    screens/
  types.ts
  index.ts
```

Para módulos pequenos, manter `components`, `screens`, `hooks` e `services` até haver motivo real para dividir em `domain/application/presentation`.

---

## 3. Fontes Oficiais

| Necessidade | Fonte oficial futura | Observação |
|---|---|---|
| Bootstrap React | `src/app/bootstrap` ou `src/main.tsx` mínimo | `main.tsx` deve ficar enxuto |
| Providers globais | `src/app/providers` | UI/Game/Live/Auth stacks |
| Router e rotas | `src/app/routes` | Hoje está em `src/app/*Route.tsx` |
| Shell/layout global | `src/app/shell` | Drawer, overlays, modais globais |
| Estado global de UI | `src/app` | `modules/ui` tende a virar app/shell, não domínio |
| PWA | `src/pwa` | Service worker, update flow, install prompt |
| Componentes base | `src/shared/components` | Button, Input, Toggle, ícones genéricos |
| Utils genéricos | `src/shared/utils` | Formatadores e helpers sem domínio |
| Regras de jogo | `src/modules/game/domain` | Engines, validações e regras esportivas |
| Sync live | `src/modules/live` | Hooks e serviços de live |
| Clientes externos | `src/infrastructure/*/client.ts` | Firebase, Supabase, email |
| Repositórios/adapters de domínio | `src/modules/<domain>/infrastructure` | Quando precisar isolar Firebase/Supabase do domínio |

Pastas que devem parar de receber novos arquivos:

```txt
src/hooks
src/utils
src/components
src/services
src/integrations
```

Essas pastas devem virar apenas wrappers temporários ou desaparecer ao final.

---

## 4. Plano Por Rodadas

Cada rodada foi desenhada para caber em uma sessão curta. Quando a rodada ficar grande demais, dividir em sub-rodadas.

### Rodada 0 — Baseline e Travas Leves

**Status:** Concluida em 2026-06-02  
**Objetivo:** garantir que o ponto de partida esteja mensurável.

- [x] Rodar `pnpm lint`.
- [x] Rodar `pnpm test`.
- [x] Rodar `pnpm depcruise`.
- [x] Registrar no documento qualquer falha existente antes da refatoração.
- [x] Adicionar aliases faltantes no `tsconfig.json`: `@app/*`, `@core/*`, `@pwa/*`.

**Baseline registrado:**

| Comando | Resultado |
|---|---|
| `pnpm lint` | passou, `tsc --noEmit` sem erros |
| `pnpm test` | passou, 6 arquivos e 64 testes |
| `pnpm depcruise` | passou, 0 violações, 189 módulos e 619 dependências |

**Falhas pré-existentes:** nenhuma encontrada nesta rodada.

**Critério de conclusão:** comandos conhecidos e baseline documentado.

---

### Rodada 1 — Imports Oficiais Sem Mover Arquivos

**Status:** Concluida em 2026-06-02  
**Objetivo:** reduzir dependência das pastas ambíguas usando fontes oficiais já existentes.

- [x] Trocar imports de `src/components/Button`, `Input`, `Toggle`, `ScoreboardIcon` para `@shared/components`.
- [x] Trocar imports de `src/utils/formatters` e `src/utils/device` para `@shared/utils`.
- [x] Manter wrappers antigos por enquanto.
- [x] Rodar `pnpm lint`.

**Resultado registrado:**

| Verificação | Resultado |
|---|---|
| Busca por imports antigos do escopo | sem ocorrências fora dos wrappers legados |
| `pnpm lint` | passou, `tsc --noEmit` sem erros |
| `pnpm depcruise` | passou, 0 violações, 189 módulos e 619 dependências |

**Critério de conclusão:** módulos deixam de importar wrappers antigos quando já existe equivalente em `shared`.

---

### Rodada 2 — PWA Fora do Bootstrap

**Status:** Concluida em 2026-06-02  
**Objetivo:** tirar lógica de service worker do `main.tsx`.

- [x] Criar `src/pwa/registerServiceWorker.ts`.
- [x] Mover o listener `SW_ACTIVATED` e o registro do service worker.
- [x] Deixar `src/main.tsx` responsável apenas por renderizar React e chamar o registro.
- [x] Avaliar migração de `useInstallPwa` para `src/pwa`.
- [x] Rodar `pnpm lint` e `pnpm build`.

**Resultado registrado:**

| Verificação | Resultado |
|---|---|
| `src/main.tsx` | bootstrap React enxuto, chamando `registerServiceWorker()` |
| `useInstallPwa` | migrado de `src/hooks` para `src/pwa/installPrompt.ts` |
| `vite.config.ts` | aliases `@app`, `@core` e `@pwa` alinhados ao `tsconfig.json` |
| `pnpm lint` | passou, `tsc --noEmit` sem erros |
| `pnpm build` | passou |
| `pnpm depcruise` | passou, 0 violações, 190 módulos e 620 dependências |

**Critério de conclusão:** PWA isolado e bootstrap React limpo.

---

### Rodada 3 — App Shell e Hooks de Aplicação

**Status:** Concluida em 2026-06-03  
**Objetivo:** separar hooks globais dos hooks de domínio.

- [x] Criar `src/app/hooks`.
- [x] Mover hooks de orquestração: `useAppAuth`, `useAppConfig`, `useAppStartup`, `useAppLogout`, `useAppDeviceName`, `useDeepLinkScreen`.
- [x] Mover `appNavigation` para `src/app` ou `src/core`, conforme dependências.
- [x] Atualizar imports no `App.tsx` e rotas.
- [x] Rodar `pnpm lint`.

**Resultado registrado:**

| Verificação | Resultado |
|---|---|
| `src/app/hooks` | criado com hooks globais de aplicação |
| `useAppOfflineMode` | migrado junto com os hooks de orquestração por pertencer ao app shell |
| `appNavigation` | migrado de `src/utils` para `src/app/appNavigation.ts` |
| Busca por imports antigos | sem ocorrências para `src/hooks` ou `utils/appNavigation` |
| `pnpm lint` | passou, `tsc --noEmit` sem erros |

**Critério de conclusão:** `App.tsx` não importa hooks de `src/hooks` para lógica de aplicação.

---

### Rodada 4 — Game Domain

**Status:** Concluida em 2026-06-03  
**Objetivo:** transformar `game` no primeiro módulo DDD-lite.

- [x] Criar `src/modules/game/domain`.
- [x] Mover `tennisEngine`, `pickleballEngine`, `scoreEngine`, `sportEngine` para `game/domain`.
- [x] Mover validações de estado de jogo para `game/domain` quando forem específicas do jogo.
- [x] Atualizar imports de `ScoreboardScreen`, `GameContext`, hooks e componentes.
- [x] Rodar `pnpm test`, `pnpm lint`, `pnpm depcruise`.

**Resultado registrado:**

| Verificação | Resultado |
|---|---|
| `src/modules/game/domain` | criado com `tennisEngine`, `pickleballEngine`, `scoreEngine`, `sportEngine` e `validation` |
| `src/utils` | sem engines ou validações específicas de jogo |
| Testes regressivos | atualizados para importar o novo domínio |
| `pnpm test` | passou, 6 arquivos e 64 testes |
| `pnpm lint` | passou, `tsc --noEmit` sem erros |
| `pnpm depcruise` | passou, 0 violações, 190 módulos e 620 dependências |

**Critério de conclusão:** regras de pontuação e engines não vivem mais em `src/utils`.

---

### Rodada 5 — Game Presentation

**Status:** Concluida em 2026-06-05
**Objetivo:** colocar UI e hooks específicos do placar dentro do módulo.

- [x] Criar `src/modules/game/presentation/components`.
- [x] Criar `src/modules/game/presentation/hooks`.
- [x] Mover `ScoreboardDisplay`, `WatchBoard` e componentes específicos do placar.
- [x] Mover `useScoreAnnouncer`, `usePickleballAnnouncer`, `useMatchTimer`, `useVoiceControl`, `useGeminiReferee` se forem exclusivos do placar.
- [x] Rodar `pnpm lint` e teste manual rápido do placar.

**Critério de conclusão:** tela de jogo usa componentes e hooks do próprio módulo.

---

### Rodada 6 — Live Module

**Status:** Concluída em 2026-06-05  
**Objetivo:** concentrar live sync, actions e apresentação de live.

- [x] Mover `useLiveFirestoreSync`, `useLiveActions`, `useRemoteCloudMatch` para `live/hooks`.
- [x] Mover `LiveIndicator` para `live/components`.
- [x] Atualizar barrel `modules/live/index.ts` e todos os consumers.
- [x] Corrigir imports internos do módulo para caminhos relativos (quebrar dependência circular).
- [x] Rodar `pnpm lint`, `pnpm depcruise` e `pnpm test`.

**Resultado registrado:**

| Verificação | Resultado |
|---|---|
| `pnpm lint` | passou, `tsc --noEmit` sem erros |
| `pnpm test` | passou, 64 testes |
| `pnpm depcruise` | passou, 0 violações, 190 módulos, 622 dependências |

**Critério de conclusão:** sincronização live não depende mais de `src/hooks`.

---

### Rodada 7 — History, Events e Partners

**Status:** Concluida em 2026-06-05  
**Objetivo:** corrigir imports de `src/types` para aliases oficiais e garantir que esses módulos não cruzam fronteiras proibidas.

**Inventário de problemas encontrados:**

| Arquivo | Problema |
|---|---|
| `history/types.ts` | `import from '../../types'` — resolvido com `@game/types` |
| `history/services/createHistoryItem.ts` | `import from '../../../types'` — resolvido com `@game/types` |
| `partners/services/applyPartnerSelection.ts` | `import from '../../../types'` — resolvido com `@game/types` |
| `partners/screens/PartnersScreen.tsx` | `import from '../../../types'` — resolvido com `@game/types` |

- [x] Corrigir imports de `src/types` em `history/types.ts` → usar alias `@game/types` para `GameState`/`PointEvent`/`SportType`.
- [x] Corrigir imports de `src/types` em `history/services/createHistoryItem.ts` → `@game/types`.
- [x] Corrigir imports de `src/types` em `partners/services/applyPartnerSelection.ts` → `@game/types`.
- [x] Corrigir imports de `src/types` em `partners/screens/PartnersScreen.tsx` → `@game/types`.
- [x] Verificar se `events` já está limpo (sem imports de `src/types`).
- [x] Rodar `pnpm lint`, `pnpm test`, `pnpm depcruise`.

**Critério de conclusão:** módulos `history`, `events` e `partners` não importam de `src/types` diretamente; usam apenas aliases oficiais.

---

### Rodada 8 — Auth, Settings, Admin e Communications

**Status:** Concluida em 2026-06-05  
**Objetivo:** consolidar módulos administrativos e de configuração.

- [x] Mover serviços específicos de auth para `modules/auth/application` quando fizer sentido (avaliado e optado por manter simplificado diretamente sob `modules/auth/services/`).
- [x] Manter telas em `presentation/screens` ou `screens`, conforme decisão final (confirmado).
- [x] Garantir componentes admin em `modules/admin` (confirmado).
- [x] Revisar `communications`: separar serviço de notificação de adapters externos e migrar hooks associados (migrado `useCommunicationsBadge` de `src/hooks` para o módulo).
- [x] Rodar `pnpm lint` e fluxo manual de login/configuração/admin.

**Critério de conclusão:** módulos de apoio também seguem as mesmas fontes oficiais.

---

### Rodada 9 — Infrastructure e Repositories

**Status:** Concluida em 2026-06-05  
**Objetivo:** reduzir conhecimento de Firebase/Supabase espalhado pelos módulos.

- [x] Manter clientes brutos em `src/infrastructure/firebase/client.ts` e `src/infrastructure/supabase/client.ts`.
- [x] Avaliar mover repositórios concretos para `modules/<domain>/infrastructure/adapters` (avaliado e decidido manter centralizado em `src/infrastructure` para simplicidade).
- [x] Evitar que `infrastructure` importe telas, hooks ou app shell (verificado e garantido).
- [x] Reduzir uso de barrels grandes como `@infra/firebase` onde causarem acoplamento (validado).
- [x] Rodar `pnpm depcruise`.

**Critério de conclusão:** I/O externo fica claro e importável sem puxar cadeias grandes.

---

### Rodada 10 — Remoção de Pastas Ambíguas

**Status:** Concluída em 2026-06-05  
**Objetivo:** finalizar a transição.

- [x] Esvaziar e deletar `src/hooks`
- [x] Esvaziar e deletar `src/utils`
- [x] Esvaziar e deletar `src/components`
- [x] Remover `src/services` e `src/integrations`
- [x] Rodar `pnpm test`, `pnpm lint`, `pnpm depcruise`, `pnpm build`.

**Critério de conclusão:** novas fontes oficiais substituem as pastas ambíguas.

---

### Rodada 11 — Regras Definitivas
 
**Status:** Concluída em 2026-06-05  
**Objetivo:** transformar a arquitetura em regra verificável.
 
- [x] Atualizar `.dependency-cruiser.cjs` com regras para `app`, `core`, `pwa`, `shared`, `modules` e `infrastructure`.
- [x] Proibir novos imports de `src/hooks`, `src/utils`, `src/components`, exceto wrappers temporários autorizados.
- [x] Documentar exceções conscientemente.
- [x] Rodar `pnpm depcruise`.

**Critério de conclusão:** a estrutura deixa de depender de memória humana.

---

## 5. Ordem Recomendada de Execução

1. Rodada 0: baseline.
2. Rodada 1: imports oficiais.
3. Rodada 2: PWA.
4. Rodada 3: app shell.
5. Rodadas 4 e 5: game.
6. Rodada 6: live.
7. Rodada 7: history/events/partners.
8. Rodada 8: auth/settings/admin/communications.
9. Rodada 9: infrastructure/repositories.
10. Rodadas 10 e 11: limpeza e regras finais.

---

## 6. Checklist Por Rodada

Usar este bloco antes de encerrar cada sessão:

- [ ] Escopo da rodada ficou pequeno e claro.
- [ ] Nenhuma mudança de comportamento foi misturada sem necessidade.
- [ ] Imports antigos foram removidos quando havia fonte oficial.
- [ ] Arquivos movidos têm imports atualizados.
- [ ] `pnpm lint` executado ou motivo registrado.
- [ ] `pnpm test` executado quando houve mudança de domínio.
- [ ] `pnpm depcruise` executado quando houve mudança de fronteira.
- [ ] Status deste documento atualizado.

---

## 7. Como Retomar Em Uma Nova Rodada

Prompt sugerido:

```txt
Retome a reestruturação arquitetural seguindo docs/architecture-restructure-roadmap.md.
Comece pela próxima rodada pendente, mantenha o escopo pequeno e atualize o status do documento ao final.
```

Se a rodada parecer grande, pedir explicitamente:

```txt
Divida a próxima rodada em uma sub-rodada que caiba em uma sessão curta.
```

---

## 8. Riscos e Cuidados

- **Imports circulares:** sempre validar com `pnpm depcruise` após mudanças de fronteira.
- **Barrels grandes:** evitar `@infra/firebase` e `@modules/<domain>` no meio de cadeias sensíveis.
- **Shared inchado:** se algo conhece placar, live, torneio ou auth, provavelmente pertence a um módulo.
- **DDD excessivo:** não criar `domain/application/infrastructure/presentation` vazio em módulo pequeno.
- **PWA:** validar build após mexer em service worker e fluxo de atualização.
- **Game/live:** fazer teste manual rápido, porque são áreas com side effects e sincronização.

---

## 9. Status Consolidado

| Rodada | Tema | Status |
|---|---|---|
| 0 | Baseline e aliases | Concluida |
| 1 | Imports oficiais | Concluida |
| 2 | PWA | Concluida |
| 3 | App shell/hooks | Concluida |
| 4 | Game domain | Concluida |
| 5 | Game presentation | Concluida |
| 6 | Live module | Concluída |
| 7 | History/events/partners | Concluida |
| 8 | Auth/settings/admin/communications | Concluida |
| 9 | Infrastructure/repositories | Concluida |
| 10 | Remoção de pastas ambíguas | Concluída |
| 11 | Regras definitivas | Concluída |
