# Plano de Refatoracao por Dominio: Chaves, Times e Partidas de Evento

> **Status:** Planejado  
> **Dominio alvo:** `events/domain/brackets` ou `events/domain/matches`  
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

- [ ] Rodar `pnpm test`.
- [ ] Rodar `pnpm lint`.
- [ ] Rodar `pnpm depcruise`.
- [ ] Registrar metricas iniciais: linhas dos arquivos criticos e numero de testes.
- [ ] Inventariar handlers de `EventCategoriesManager.tsx` por responsabilidade:
  - [ ] categoria;
  - [ ] entries/atletas;
  - [ ] teams/pairs;
  - [ ] chaves/brackets;
  - [ ] matches/placares;
  - [ ] persistencia.
- [ ] Inventariar responsabilidades de `EventDetailScreen.tsx` que reutilizam as mesmas regras.
- [ ] Confirmar nomes finais: `brackets`, `matches` ou outro nome de dominio.

**Criterio de conclusao:** baseline documentado e mapa de responsabilidades pronto.

---

### Fase 1 - Testes de Regressao dos Motores

**Objetivo:** criar rede de seguranca antes de extrair regras.

Criar `tests/regression/bracketEngine.test.ts` ou dividir em arquivos menores:

- [ ] Cobrir parsing de placares:
  - [ ] placar unico `6/4`;
  - [ ] multiplos sets `6/4 4/6 10/8`;
  - [ ] valores vazios/nulos;
  - [ ] sets em andamento.
- [ ] Cobrir calculo de vencedor:
  - [ ] melhor de 1 set;
  - [ ] melhor de 3 sets;
  - [ ] empate/incompleto sem vencedor.
- [ ] Cobrir standings de chave:
  - [ ] vitorias;
  - [ ] saldo de sets;
  - [ ] saldo de games;
  - [ ] confronto direto;
  - [ ] empate multiplo.
- [ ] Cobrir formacao de times:
  - [ ] dupla comum;
  - [ ] dupla mista com ordenacao correta;
  - [ ] duplicidade de atleta;
  - [ ] numeracao/codigo de time.
- [ ] Cobrir geracao de partidas:
  - [ ] round-robin;
  - [ ] chave 1/chave 2;
  - [ ] semifinal/final;
  - [ ] preservacao de numeracao de partidas de outras categorias.

**Criterio de conclusao:** testes novos falham/verificam comportamento atual e passam antes da extracao.

---

### Fase 2 - Extrair Motores Puros

**Objetivo:** mover regra de negocio para `events/domain/brackets/engine` sem React e sem Firebase.

- [ ] Criar `src/modules/events/domain/brackets/types.ts`.
- [ ] Criar `engine/matchScoreEngine.ts`.
- [ ] Migrar ou envolver funcoes de parsing hoje em `matchProgression.ts`.
- [ ] Criar `engine/bracketProgressionEngine.ts`.
- [ ] Migrar standings, desempates e progressao de partidas.
- [ ] Criar `engine/bracketGenerator.ts`.
- [ ] Migrar geracao de partidas hoje em `matchGenerator.ts`.
- [ ] Criar `engine/teamFormationEngine.ts`.
- [ ] Migrar validacoes de dupla, ordenacao de mista, numeracao e criacao de `TournamentPair`.
- [ ] Criar `engine/categoryViewEngine.ts`.
- [ ] Centralizar filtros e ordenacoes de `entries`, `pairs`, `matches` e fila derivada.
- [ ] Manter `services/matchGenerator.ts` e `services/matchProgression.ts` como shims temporarios, se reduzir risco.
- [ ] Atualizar testes para importar os pontos canonicos.
- [ ] Rodar `pnpm test`.
- [ ] Rodar `pnpm lint`.
- [ ] Rodar `pnpm depcruise`.

**Criterio de conclusao:** regras puras vivem no dominio novo e nao dependem de React/Firebase.

---

### Fase 3 - Separar Acoes e Persistencia

**Objetivo:** tirar dos componentes os blocos que calculam proximo estado e persistem no Firebase.

- [ ] Criar `hooks/useCategoryBoard.ts`.
- [ ] Mover estado derivado da categoria selecionada:
  - [ ] `categoryEntries`;
  - [ ] `categoryPairs`;
  - [ ] `categoryMatches`;
  - [ ] standings;
  - [ ] fila ordenada;
  - [ ] mapas por id.
- [ ] Criar `hooks/useTeamFormationActions.ts`.
- [ ] Mover acoes:
  - [ ] formar time;
  - [ ] desfazer time;
  - [ ] trocar chave;
  - [ ] randomizar chaves;
  - [ ] mover posicao do time.
- [ ] Criar `hooks/useMatchAdminActions.ts`.
- [ ] Mover acoes:
  - [ ] criar partida manual;
  - [ ] gerar partidas por sistema;
  - [ ] confirmar sorteio Super 8 Duplas;
  - [ ] editar placar;
  - [ ] alterar data;
  - [ ] finalizar partida;
  - [ ] excluir partida;
  - [ ] excluir todas as partidas da categoria.
- [ ] Definir uma pequena interface de persistencia, por exemplo `persistEventPatch`.
- [ ] Garantir que hooks chamem Firebase por adapters claros, nao por codigo duplicado.
- [ ] Rodar `pnpm test`, `pnpm lint` e `pnpm depcruise`.

**Criterio de conclusao:** `EventCategoriesManager.tsx` deixa de possuir os calculos principais e passa a chamar hooks de dominio.

---

### Fase 4 - Reduzir `EventCategoriesManager.tsx`

**Objetivo:** transformar o componente administrativo em orquestrador visual.

- [ ] Criar `components/CategoryBoardPanel.tsx`.
- [ ] Criar `components/CategoryEntriesPanel.tsx`.
- [ ] Criar `components/CategoryTeamsPanel.tsx`.
- [ ] Criar `components/CategoryMatchesPanel.tsx`.
- [ ] Reaproveitar componentes ja existentes em `admin/components/category/*` quando fizer sentido.
- [ ] Reduzir `EventCategoriesManager.tsx` para:
  - [ ] formulario/modal de categoria;
  - [ ] selecao de categoria;
  - [ ] conexao com hooks;
  - [ ] renderizacao dos paineis.
- [ ] Evitar mudar classes Tailwind e comportamento visual nesta fase, salvo ajustes necessarios.
- [ ] Rodar validacoes automatizadas.
- [ ] Fazer smoke manual do admin:
  - [ ] criar categoria;
  - [ ] editar categoria;
  - [ ] formar dupla/time;
  - [ ] gerar partidas;
  - [ ] editar placar;
  - [ ] finalizar partida;
  - [ ] excluir partida.

**Criterio de conclusao:** componente administrativo menor, com regras delegadas ao dominio canonico.

---

### Fase 5 - Reutilizar no `EventDetailScreen.tsx`

**Objetivo:** usar as mesmas regras no fluxo publico/participante.

- [ ] Migrar derivados da tela publica para `useCategoryBoard`.
- [ ] Reutilizar `teamFormationEngine` na formacao de times pelo atleta.
- [ ] Reutilizar `matchScoreEngine` quando houver placar/resultado na tela publica.
- [ ] Remover duplicacoes simples de filtros e mapas de pairs/matches.
- [ ] Garantir que o fluxo de pagamento/inscricao continue isolado em `registration`.
- [ ] Rodar `pnpm test`, `pnpm lint` e `pnpm depcruise`.
- [ ] Fazer smoke manual:
  - [ ] abrir detalhe de evento;
  - [ ] alternar categorias;
  - [ ] ver times;
  - [ ] ver partidas;
  - [ ] formar time pelo atleta quando permitido;
  - [ ] conferir historico do participante.

**Criterio de conclusao:** admin e publico compartilham motores/hooks de chaves e partidas.

---

### Fase 6 - Limpeza, Shims e Regras Arquiteturais

**Objetivo:** consolidar o novo dominio e remover pontes temporarias.

- [ ] Remover ou reduzir shims em `services/matchGenerator.ts`, se todos os consumidores tiverem migrado.
- [ ] Remover ou reduzir shims em `services/matchProgression.ts`, se todos os consumidores tiverem migrado.
- [ ] Atualizar barrels:
  - [ ] `src/modules/events/domain/brackets/index.ts`;
  - [ ] `src/modules/events/index.ts`, somente se for API publica do modulo.
- [ ] Revisar imports diretos para evitar que telas importem arquivos internos profundos sem necessidade.
- [ ] Avaliar adicionar regra `dependency-cruiser` se surgir uma fronteira clara.
- [ ] Atualizar documentacao deste plano com resultados finais:
  - [ ] linhas antes/depois;
  - [ ] testes adicionados;
  - [ ] modulos cruised;
  - [ ] comandos executados.
- [ ] Rodar validacao final:
  - [ ] `pnpm test`;
  - [ ] `pnpm lint`;
  - [ ] `pnpm depcruise`;
  - [ ] `pnpm build`.

**Criterio de conclusao:** dominio novo e documentado, sem shims desnecessarios e sem violacoes arquiteturais.

---

## 5. Ordem Recomendada de Trabalho

1. Fase 0: baseline e inventario.
2. Fase 1: testes de regressao.
3. Fase 2: motores puros.
4. Fase 3: hooks e persistencia.
5. Fase 4: reducao do admin.
6. Fase 5: reaproveitamento na tela publica.
7. Fase 6: limpeza final e build.

Se uma fase ficar grande, dividir em sub-rodadas menores. A sequencia mais segura e: testar comportamento atual, extrair regra pura, depois trocar UI.

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

- [ ] O novo dominio possui motores puros testados.
- [ ] `EventCategoriesManager.tsx` nao contem mais regra central de chaveamento/placar.
- [ ] `EventDetailScreen.tsx` reutiliza regras canonicas quando aplicavel.
- [ ] Shims temporarios foram removidos ou documentados.
- [ ] `pnpm test` passou.
- [ ] `pnpm lint` passou.
- [ ] `pnpm depcruise` passou.
- [ ] `pnpm build` passou.
- [ ] Este documento foi atualizado com status final e metricas antes/depois.

