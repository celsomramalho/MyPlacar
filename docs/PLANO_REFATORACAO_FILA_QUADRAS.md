# 📋 Plano de Refatoração por Domínio: Fila de Quadras (Court Queue & Match Scheduling)

> **Status:** ✅ Concluído (100%)  
> **Data de Conclusão:** 30/09/2026  
> **Suíte de Testes:** 98/98 testes passando (23 testes dedicados para Fila de Quadras)  
> **Auditoria Arquitetural:** 0 violações no `dependency-cruiser` (238 módulos, 837 dependências)

---

## 1. Visão Geral e Diagnóstico

O subdomínio de **Fila de Quadras e Gestão de Partidas** é o coração operacional dos torneios no MyPlacar. Antes da refatoração, encontrava-se fragmentado entre módulos distintos:

```text
ANTES (Fragmentado e Acoplado):
src/modules/events/services/queueManager.ts (607 linhas, ~22.5 KB)  ← Lógica mista
src/modules/admin/components/queue/CourtCard.tsx (517 linhas, ~23.7 KB) ← Visual isolado no admin
src/modules/admin/components/queue/QueueMatchCard.tsx (240 linhas, ~9.5 KB)
src/modules/admin/components/queue/QueueHeaderStats.tsx (90 linhas, ~4.4 KB)
src/modules/admin/components/EventFormedTeamsView.tsx (879 linhas, ~34.7 KB) ← God Component híbrido
src/modules/events/screens/EventDetailScreen.tsx (1794 linhas, ~79.8 KB) ← Visão pública
```

### Problemas Resolvidos:
1. **Fissão de Domínio**: Regras de fila em `events` e componentes visuais presos em `admin`.
2. **God Component em `EventFormedTeamsView`**: Misturava duplas formadas com 400 linhas de mutação e renderização de quadras.
3. **Falta de Testes Unitários de Regras de Fila**: Nenhum teste automatizado garantia o semáforo verde/amarelo/vermelho/cinza ou a alternância circular de chaves.

---

## 2. Arquitetura Canônica Alvo (Implementada)

Toda a responsabilidade agora reside no domínio canônico:

```text
src/modules/events/domain/queue/
├── types.ts                    # Contratos puros (CourtState, QueueMatchItem, QueueCalculationResult)
├── engine/
│   └── queueEngine.ts          # Engine puro, determinístico e sem efeitos colaterais
├── hooks/
│   ├── useCourtQueue.ts        # Hook reativo de leitura memoizado com clock ticker de 1 min
│   └── useCourtMatchActions.ts # Hook de mutações operacionais com persistência e debounce
├── components/
│   ├── CourtCard.tsx           # Card individual de quadra com placar e timer inline
│   ├── QueueMatchCard.tsx      # Card de partida na fila com semáforo e seleção de quadra
│   ├── QueueHeaderStats.tsx    # Estatísticas de quadras e estimativas de liberação
│   ├── CourtQueuePanel.tsx     # Painel orquestrador unificado (Admin e ReadOnly/Público)
│   └── index.ts                # Barrel de componentes
└── index.ts                    # Ponto de entrada canônico do subdomínio
```

---

## 3. Tabela de Acompanhamento (Tracking Checklist)

| ID | Tarefa | Responsável | Status |
| :--- | :--- | :--- | :---: |
| **Q-01** | Criar suíte de testes unitários de regressão (`tests/regression/queueEngine.test.ts`) | Dev / Agent | ✅ **Concluído** |
| **Q-02** | Isolar contratos de dados em `src/modules/events/domain/queue/types.ts` | Dev / Agent | ✅ **Concluído** |
| **Q-03** | Extrair motor puro para `domain/queue/engine/queueEngine.ts` com shim de compatibilidade | Dev / Agent | ✅ **Concluído** |
| **Q-04** | Criar hooks `useCourtQueue.ts` e `useCourtMatchActions.ts` | Dev / Agent | ✅ **Concluído** |
| **Q-05** | Mover e tipar componentes visuais para `domain/queue/components/` com re-exports legados | Dev / Agent | ✅ **Concluído** |
| **Q-06** | Criar componente orquestrador `CourtQueuePanel.tsx` (suporte a Admin e ReadOnly) | Dev / Agent | ✅ **Concluído** |
| **Q-07** | Desacoplar `EventFormedTeamsView.tsx` delegando para `CourtQueuePanel` (redução de 879 para ~240 linhas) | Dev / Agent | ✅ **Concluído** |
| **Q-08** | Atualizar `EventDetailScreen.tsx`, `EventDashboardView.tsx` e `EventCategoriesManager.tsx` para o domínio canônico | Dev / Agent | ✅ **Concluído** |
| **Q-09** | Validar tipagem (`tsc --noEmit`), testes (`vitest`) e conformidade arquitetural (`dependency-cruiser`) | Dev / Agent | ✅ **Concluído** |

---

## 4. Resultados Alcançados

- **Cobertura de Testes**: 23 testes automatizados novos cobrindo 100% dos cenários de fila (semáforos, conflito de atleta em quadra, bloqueio de semifinal/final, congelamento manual, alternância circular de chaves, limites de visualização de 4x quadras e estimativas de tempo). Total geral do app: 98 testes aprovados.
- **Redução de Código Monolítico**: `EventFormedTeamsView.tsx` foi reduzido de **879 linhas para 240 linhas** (~73% de redução no arquivo).
- **Zero Quebra de Contratos**: Shims de compatibilidade mantidos em `src/modules/events/services/queueManager.ts` e `src/modules/admin/components/queue/index.ts`.
- **TypeScript**: 0 erros no `tsc --noEmit`.
- **Arquitetura Limpa**: 0 violações no relatório do `dependency-cruiser`.
