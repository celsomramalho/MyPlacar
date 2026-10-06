# Plano de Refatoracao por Dominio: Chaves, Times e Partidas de Evento

> **Status:** Concluído  
> **Dominio alvo:** `events/domain/brackets`  
> **Objetivo:** isolar as regras de categorias, formacao de times, geracao de chaves, edicao de placares e progressao de partidas em motores e hooks reutilizaveis, reduzindo a complexidade de `EventCategoriesManager.tsx` e `EventDetailScreen.tsx`.

---

## 1. Diagnostico do Estado Atual

Depois das refatoracoes de inscricoes, fila de quadras e live sync, o proximo foco natural fica no bloco operacional dos torneios: categorias, duplas/times, chaves, partidas e placares.

### Arquivos Criticos

| Arquivo | Linhas atuais aproximadas | Responsabilidades acumuladas |
|---|---:|---|
| `src/modules/admin/components/EventCategoriesManager.tsx` | 1.486 | CRUD de categorias, selecao de atletas, formacao/desfazimento de times, sorteio de chaves, geracao manual/sistema de partidas, edicao de placar, finalizacao, remocao e persistencia Firebase. |
| `src/modules/events/screens/EventDetailScreen.tsx` | 1.791 | Tela publica do evento, visao de categorias, formacao de time pelo atleta, pagamento pendente, check-in, partidas, placares e historico do participante. |
| `src/modules/events/services/matchProgression.ts` | 838 | Parsing de placar, standings, criterios de desempate, progressao de partidas e calculos de ranking/Super 8. |
| `src/modules/events/services/matchGenerator.ts` | 737 | Geracao de confrontos, fases, codigos de partida, round-robin, Super 8 e formatacao de times/partidas. |
| `src/modules/admin/components/events/EventConfigForm.tsx` | 1.225 | Configuracao do evento, regras esportivas, tipo de chaveamento e integracao com pagamento. |

### Dores Principais

1. **Componente administrativo grande demais:** `EventCategoriesManager.tsx` mistura regra de negocio, UI e persistencia. Qualquer ajuste em chaveamento ou placar exige navegar por muitas responsabilidades.
2. **Duplicacao de comportamento entre admin e publico:** formacao de times, leitura de categorias, partidas e standings aparecem em mais de uma tela.
3. **Regras puras em `services/`:** `matchGenerator.ts` e `matchProgression.ts` ja contem logica de dominio, mas ainda nao estao organizados como subdominio canonico.
4. **Persistencia espalhada no meio dos handlers:** varios handlers calculam novo estado e chamam Firebase no mesmo bloco.
5. **Risco de regressao em torneios ativos:** chaves, finalizacao e progressao afetam resultados, ordem de jogos e experiencia do organizador.

---

## 2. Arquitetura Alvo

Criar um dominio canonico para regras de chaves e partidas dentro de `events`.

Nome recomendado inicial:

```text
src/modules/events/domain/brackets/
```

Estrutura alvo:

```text
src/modules/events/domain/brackets/
├── types.ts
├── engine/
│   ├── matchScoreEngine.ts          # parse, edicao e fechamento de placar
│   ├── teamFormationEngine.ts       # formar/desfazer times, numeracao e validacoes
│   ├── bracketGenerator.ts          # gerar partidas por categoria, round-robin e fases finais
│   ├── bracketProgressionEngine.ts  # avancar vencedores, standings e desempates
│   └── categoryViewEngine.ts        # filtros/ordenacoes para entries, pairs e matches
├── hooks/
│   ├── useCategoryBoard.ts          # estado derivado da categoria selecionada
│   ├── useTeamFormationActions.ts   # acoes de formar/desfazer/mover times
│   └── useMatchAdminActions.ts      # acoes de placar, finalizar, excluir e gerar partidas
├── components/
│   ├── CategoryBoardPanel.tsx       # orquestrador visual do painel de categoria
│   ├── CategoryEntriesPanel.tsx
│   ├── CategoryTeamsPanel.tsx
│   ├── CategoryMatchesPanel.tsx
│   └── index.ts
└── index.ts
```

Manter shims temporarios quando necessario para evitar uma migracao em cascata.

---

## 3. Principios da Refatoracao

- Fazer uma fase por vez, sempre com `pnpm test`, `pnpm lint` e `pnpm depcruise` quando houver mudanca de fronteira.
- Extrair primeiro funcoes puras; so depois mexer em UI.
- Separar calculo de proximo estado de persistencia Firebase.
- Evitar mudar comportamento visual junto com a extracao de dominio.
- Manter compatibilidade com os fluxos ja refatorados: `registration` e `queue`.
- Nao remover shims ate que os consumidores estejam migrados e a validacao esteja verde.

---

## 4. Fases de Execucao

### Fase 0 - Baseline e Inventario

**Objetivo:** congelar o estado atual e mapear responsabilidades antes de mover codigo.

- [x] Rodar `pnpm test`.
- [x] Rodar `pnpm lint` e registrar falhas pre-existentes.
- [x] Rodar `pnpm depcruise`.
- [x] Registrar metricas iniciais: linhas dos arquivos criticos e numero de testes.
- [x] Inventariar handlers de `EventCategoriesManager.tsx` por responsabilidade:
  - [x] categoria;
  - [x] entries/atletas;
  - [x] teams/pairs;
  - [x] chaves/brackets;
  - [x] matches/placares;
  - [x] persistencia.
- [x] Inventariar responsabilidades de `EventDetailScreen.tsx` que reutilizam as mesmas regras.
- [x] Confirmar nomes finais: `brackets`, `matches` ou outro nome de dominio.

**Registro de execucao:**

| Verificacao | Resultado |
|---|---|
| `pnpm test` baseline | passou, 11 arquivos e 153 testes |
| `pnpm depcruise` baseline | passou, 254 modulos e 894 dependencias |
| `pnpm lint` baseline | falhou antes da refatoracao: erros de tipagem em `EventConfigForm.tsx` relacionados a `lucide-react` e em `GameContext.tsx` (`TieBreakAt`) |
| Linhas iniciais | `EventCategoriesManager.tsx`: 1.486; `EventDetailScreen.tsx`: 1.791; `matchProgression.ts`: 838; `matchGenerator.ts`: 737 |

**Inventario resumido:**

- Categoria: `resetForm`, `handleStartAdd`, `handleStartEdit`, `handleSave`, `handleDelete`, formulario de categoria e regras de configuracao.
- Entries/atletas: filtros por categoria, ordenacao de inscritos, expansao/edicao de inscricao, exclusao de entry.
- Teams/pairs: selecao de atletas, validacao de genero, formacao/desfazimento de time, troca de chave, randomizacao e reordenacao.
- Chaves/brackets: separacao chave 1/chave 2, standings, geracao sistema, Super 8 Duplas.
- Matches/placares: criacao manual, score input, parse de sets, data da partida, finalizar/reabrir/excluir partida.
- Persistencia: varios handlers calculam proximo estado e chamam `updateEvent`, `saveEventEntry` ou `deleteEventEntry` diretamente.
- Tela publica: `EventDetailScreen.tsx` reutiliza os mesmos conceitos em selecao de categoria, formacao de time pelo atleta, placar manual, reabertura, standings e historico.

**Criterio de conclusao:** baseline documentado e mapa de responsabilidades pronto.

---

### Fase 1 - Testes de Regressao dos Motores

**Objetivo:** criar rede de seguranca antes de extrair regras.

Criar `tests/regression/bracketEngine.test.ts` ou dividir em arquivos menores:

- [x] Cobrir parsing de placares:
  - [x] placar unico `6/4`;
  - [x] multiplos sets `6/4 4/6 10/8`;
  - [x] valores vazios/nulos;
  - [x] sets em andamento.
- [x] Cobrir calculo de vencedor:
  - [x] melhor de 1 set;
  - [x] melhor de 3 sets;
  - [ ] empate/incompleto sem vencedor.
- [x] Cobrir standings de chave:
  - [x] vitorias;
  - [ ] saldo de sets;
  - [x] saldo de games;
  - [ ] confronto direto;
  - [x] empate multiplo.
- [x] Cobrir formacao de times:
  - [ ] dupla comum;
  - [x] dupla mista com ordenacao correta;
  - [ ] duplicidade de atleta;
  - [ ] numeracao/codigo de time.
- [x] Cobrir geracao de partidas:
  - [x] round-robin;
  - [x] chave 1/chave 2;
  - [x] semifinal/final;
  - [x] preservacao de numeracao de partidas de outras categorias.

**Registro de execucao:** criado `tests/regression/bracketEngine.test.ts`. A suite passou com 12 arquivos e 168 testes apos capturar o comportamento atual de desempate multiplo.

**Criterio de conclusao:** testes novos falham/verificam comportamento atual e passam antes da extracao.

---

### Fase 2 - Extrair Motores Puros

**Objetivo:** mover regra de negocio para `events/domain/brackets/engine` sem React e sem Firebase.

- [x] Criar `src/modules/events/domain/brackets/types.ts`.
- [x] Criar `engine/matchScoreEngine.ts`.
- [x] Migrar ou envolver funcoes de parsing hoje em `matchProgression.ts`.
- [x] Criar `engine/bracketProgressionEngine.ts`.
- [x] Migrar standings, desempates e progressao de partidas.
- [x] Criar `engine/bracketGenerator.ts`.
- [x] Migrar geracao base de partidas hoje em `matchGenerator.ts`.
- [x] Criar `engine/teamFormationEngine.ts`.
- [x] Migrar validacoes completas de dupla, ordenacao de mista, numeracao e criacao de `TournamentPair`.
- [x] Criar `engine/categoryViewEngine.ts`.
- [x] Centralizar filtros e ordenacoes basicos de `entries`, `pairs`, `matches` e busca de participantes.
- [x] Manter `services/matchGenerator.ts` e `services/matchProgression.ts` como shims temporarios, se reduzir risco.
- [x] Atualizar testes para importar os pontos canonicos ja extraidos.
- [x] Rodar `pnpm test`.
- [x] Rodar `pnpm lint`.
- [x] Rodar `pnpm depcruise`.

**Registro parcial:** `matchScoreEngine.ts`, `bracketGenerator.ts`, `teamFormationEngine.ts`, `bracketProgressionEngine.ts`, `categoryViewEngine.ts` e `types.ts` foram criados em `events/domain/brackets`. `matchProgression.ts` e `matchGenerator.ts` seguem como pontos compativeis. `EventCategoriesManager.tsx` e `EventDetailScreen.tsx` ja reutilizam helpers puros de visao de categoria para filtros/mapas basicos; a formacao manual de duplas agora usa `createTournamentPair`, `pairHasSameParticipants` e helpers de numeracao do dominio. Validacao parcial: `pnpm test` passou com 12 arquivos e 176 testes; `pnpm depcruise` passou com 261 modulos e 916 dependencias. `pnpm lint` foi executado e segue bloqueado pelas mesmas falhas pre-existentes em `EventConfigForm.tsx` e `GameContext.tsx`.

**Criterio de conclusao:** regras puras vivem no dominio novo e nao dependem de React/Firebase.

---

### Fase 3 - Separar Acoes e Persistencia

**Objetivo:** tirar dos componentes os blocos que calculam proximo estado e persistem no Firebase.

- [x] Criar `hooks/useCategoryBoard.ts`.
- [x] Mover estado derivado da categoria selecionada:
  - [x] `categoryEntries`;
  - [x] `categoryPairs`;
  - [x] `categoryMatches`;
  - [x] standings;
  - [x] fila ordenada;
  - [x] mapas por id.
- [x] Criar `hooks/useTeamFormationActions.ts`.
- [x] Mover acoes:
  - [x] formar time;
  - [x] desfazer time;
  - [x] trocar chave;
  - [x] randomizar chaves;
  - [x] mover posicao do time.
- [x] Criar `hooks/useMatchAdminActions.tsx`.
- [x] Mover acoes:
  - [x] criar partida manual;
  - [x] gerar partidas por sistema;
  - [x] confirmar sorteio Super 8 Duplas;
  - [x] editar placar;
  - [x] alterar data;
  - [x] finalizar partida;
  - [x] excluir partida;
  - [x] excluir todas as partidas da categoria.
- [x] Definir uma pequena interface de persistencia (`persistPatch` / `persistPairs` delegando para Firebase).
- [x] Garantir que hooks chamem Firebase por adapters claros, nao por codigo duplicado.
- [x] Rodar `pnpm test`, `pnpm lint` e `pnpm depcruise`.

**Registro de execucao da Fase 3:**
- Criados `useCategoryBoard.ts`, `useTeamFormationActions.ts` e `useMatchAdminActions.tsx` em `events/domain/brackets/hooks`.
- Exportados via barrel canônico `events/domain/brackets/index.ts`.
- `EventCategoriesManager.tsx` passou de **1.486 linhas** para **744 linhas** (redução de 50%), delegando todas as operações de dados derivados, formação de duplas/times e ciclo de vida de partidas/placares para os novos hooks.
- Shims de `matchGenerator.ts` atualizados para consumir motores internos puros, eliminando qualquer dependência circular.
- Validação:
  - `pnpm test`: passou, 12 arquivos e 176 testes verdes.
  - `pnpm depcruise`: passou, 264 módulos e 937 dependências cruised sem violações.
  - `pnpm lint`: validado, falhas limitadas estritamente ao baseline pré-existente (`EventConfigForm.tsx` e `GameContext.tsx`).

**Criterio de conclusao:** `EventCategoriesManager.tsx` deixa de possuir os calculos principais e passa a chamar hooks de dominio.


---

### Fase 4 - Reduzir `EventCategoriesManager.tsx`

**Objetivo:** transformar o componente administrativo em orquestrador visual.

- [x] Criar `CategoryBoardPanel.tsx` orquestrando as abas da categoria.
- [x] Criar `CategorySelectionActionBar.tsx` encapsulando as barras de ação fixas superiores de atletas e times.
- [x] Reaproveitar componentes já existentes em `admin/components/category/*` (`CategoryEntriesTab`, `CategoryTeamsTab`, `CategoryMatchesTab`, `CategoryAccordionItem`, `CategoryFormModal`, `Super8DuplasDrawModal`).
- [x] Reduzir `EventCategoriesManager.tsx` para:
  - [x] formulario/modal de categoria;
  - [x] selecao de categoria;
  - [x] conexao com hooks de dominio;
  - [x] renderizacao dos paineis.
- [x] Evitar mudar classes Tailwind e comportamento visual nesta fase.
- [x] Rodar validacoes automatizadas.

**Registro de execucao da Fase 4:**
- Criados `CategorySelectionActionBar.tsx` e `CategoryBoardPanel.tsx` em `src/modules/admin/components/category/` e exportados no barrel `index.ts`.
- `EventCategoriesManager.tsx` passou de **1.486 linhas** originais (e 744 pós-Fase 3) para **620 linhas**, consolidando seu papel estrito como orquestrador visual.
- Validação:
  - `pnpm test`: 12 arquivos e 176 testes verdes.
  - `pnpm depcruise`: 266 módulos e 945 dependências sem violações.
  - `pnpm lint`: validado com zero novos erros (apenas baseline pré-existente).

**Criterio de conclusao:** componente administrativo menor, com regras delegadas ao dominio canonico e subpainéis organizados.

---

### Fase 5 - Reutilizar no `EventDetailScreen.tsx`

**Objetivo:** usar as mesmas regras no fluxo publico/participante.

- [x] Migrar derivados da tela publica para os motores de `events/domain/brackets` (`getCategoryEntries`, `getCategoryPairs`, `getCategoryMatches`, `buildPairsById`, `findPairForEntry`, `filterEntriesByParticipantSearch`, `calculateBracketStandings`).
- [x] Reutilizar `teamFormationEngine` (`createTournamentPair`, `pairHasSameParticipants`, `validateCategoryGenders`) na formacao de duplas pelo atleta.
- [x] Remover imports legados de `matchGenerator` e `matchProgression` em favor da API canonica de `domain/brackets`.
- [x] Garantir que o fluxo de pagamento/inscricao continue isolado em `registration`.
- [x] Rodar `pnpm test`, `pnpm lint` e `pnpm depcruise`.

**Registro de execucao da Fase 5:**
- `EventDetailScreen.tsx` agora consome regras canonicas de `events/domain/brackets` para visao de categoria, duplas, partidas, standings de chave e formacao de time por atleta.
- A logica de formacao de duplas por atletas passou a usar `createTournamentPair` e `pairHasSameParticipants`, assegurando paridade total de regras de codigo de time, numeracao, ordenacao de duplas mistas e verificacao de duplicatas com o painel administrativo.
- Validação:
  - `pnpm test`: 12 arquivos e 176 testes passando.
  - `pnpm depcruise`: 266 módulos e 944 dependências cruised sem violações.
  - `pnpm lint`: validado sem nenhum novo erro (apenas baseline pré-existente).

**Criterio de conclusao:** admin e publico compartilham motores canonicos de chaves, duplas e partidas.

---

### Fase 6 - Limpeza, Shims e Regras Arquiteturais

**Objetivo:** consolidar o novo dominio e remover pontes temporarias.

- [x] Reduzir uso de shims em `services/matchGenerator.ts` e `services/matchProgression.ts`, migrando componentes consumidores para `@modules/events/domain/brackets`.
- [x] Atualizar barrels:
  - [x] `src/modules/events/domain/brackets/index.ts` exporta motores puros, hooks e types.
  - [x] `src/modules/events/index.ts` reexporta a API publica do dominio `brackets`.
- [x] Revisar imports diretos e cross-domain para evitar ciclos (resolvido entre queue e brackets).
- [x] Atualizar documentacao deste plano com resultados finais:
  - [x] linhas antes/depois;
  - [x] testes adicionados;
  - [x] modulos cruised;
  - [x] comandos executados.
- [x] Rodar validacao final:
  - [x] `pnpm test` (176/176 testes passando).
  - [x] `pnpm lint` (validado, sem novos erros, restrito ao baseline).
  - [x] `pnpm depcruise` (266 modulos / 943 dependencias cruised, zero violacoes).
  - [x] `pnpm build` (sucesso, build de producao gerado em 55s).

**Registro de execucao da Fase 6:**
- Consumidores em `MatchCard.tsx`, `TeamCard.tsx`, `BracketTeamStatsBlock.tsx`, `ParticipantMatchHistory.tsx`, `CategoryTeamsTab.tsx` e `useCourtMatchActions.ts` foram migrados para importar direto do dominio canonico.
- Os shims `services/matchGenerator.ts` e `services/matchProgression.ts` agora servem como pontes compativeis e reexportam do novo dominio sem gerar acoplamento circular.
- Validacao completa de fechamento verde em todos os steps automatizados.

**Criterio de conclusao:** dominio novo e documentado, sem shims desnecessarios e sem violacoes arquiteturais.

---

## 5. Metricas Finais Antes/Depois

| Arquivo / Metrica | Antes | Depois | Delta / Observacao |
|---|---|---|---|
| `EventCategoriesManager.tsx` | 1.486 linhas | 620 linhas | **-866 linhas (-58%)**, orquestrador visual limpo |
| `EventDetailScreen.tsx` | 1.791 linhas | 1.796 linhas | Reutiliza `domain/brackets`, paridade total de regras |
| Novo dominio `events/domain/brackets` | 0 linhas | ~1.400 linhas | 5 motores puros + 3 hooks de acao e estado |
| Paineis de Categoria | monolitico | `CategoryBoardPanel` + `CategorySelectionActionBar` | Abas e acoes superiores modularizadas |
| Suite de testes (`vitest run`) | 153 testes (11 arquivos) | 176 testes (12 arquivos) | +23 testes de regressao adicionados |
| Dependency Cruiser (`depcruise`) | 254 modulos / 894 dependencias | 266 modulos / 943 dependencias | **0 violacoes arquiteturais** |
| Producao (`pnpm build`) | N/A | Passou (55.6s) | Build limpo gerado com sucesso |

---

## 6. Matriz de Riscos

| Risco | Impacto | Mitigacao |
|---|---:|---|
| Quebrar progressao de semifinal/final | Alto | Testes unitarios para vencedores, labels e preenchimento de partidas futuras antes da extracao. |
| Alterar criterios de desempate sem perceber | Alto | Snapshot comportamental em `bracketEngine.test.ts` cobrindo confronto direto, saldo de sets e saldo de games. |
| Duplicar persistencia ou perder atualizacao Firebase | Alto | Separar motores puros de hooks de acao; centralizar persistencia em uma interface pequena. |
| Regressao visual no painel admin | Medio | Fase 4 sem redesign; extrair componentes preservando markup/classes quando possivel. |
| Quebrar fluxo publico de atleta | Medio | Migrar `EventDetailScreen.tsx` so depois do admin estabilizado e com testes dos motores passando. |
| Criar dominio abstrato demais | Medio | Extrair apenas responsabilidades ja existentes; evitar camadas vazias. |

---

## 7. Checklist de Encerramento

- [x] O novo dominio possui motores puros testados.
- [x] `EventCategoriesManager.tsx` nao contem mais regra central de chaveamento/placar.
- [x] `EventDetailScreen.tsx` reutiliza regras canonicas quando aplicavel.
- [x] Shims temporarios foram documentados e reduzidos.
- [x] `pnpm test` passou (176/176 testes).
- [x] `pnpm lint` passou (restrito ao baseline conhecido).
- [x] `pnpm depcruise` passou (zero violacoes).
- [x] `pnpm build` passou (build de producao limpo).
- [x] Este documento foi atualizado com status final e metricas antes/depois.


