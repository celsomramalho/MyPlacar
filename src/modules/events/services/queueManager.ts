/**
 * @deprecated
 * Este arquivo é uma ponte de retrocompatibilidade.
 *
 * A lógica de negócio da Fila de Quadras foi migrada para o domínio canônico:
 *   src/modules/events/domain/queue/
 *
 * Importe diretamente de '@modules/events/domain/queue' em código novo.
 * Este arquivo será removido ao final da Fase 4 da refatoração.
 *
 * @see docs/PLANO_REFATORACAO_FILA_QUADRAS.md — Fase 2
 */

// Re-exporta todos os tipos do novo local canônico
export type {
  CourtState,
  QueueMatchItem,
  QueueCalculationResult,
  MatchDurationStats,
} from '../domain/queue/types';

// Re-exporta todas as funções do engine puro
export {
  calculateQueueState,
  calculateAverageMatchDuration,
  getPairDisplayName,
  isMatchBlockedByPreviousPhase,
} from '../domain/queue/engine/queueEngine';
