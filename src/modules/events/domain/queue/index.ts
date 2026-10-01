/**
 * Ponto de entrada público do subdomínio de Fila de Quadras (Court Queue).
 *
 * Exporta os tipos, engine puro e hooks React para uso em componentes
 * e telas dos módulos events e admin.
 *
 * @see docs/PLANO_REFATORACAO_FILA_QUADRAS.md — Fase 2 e 3
 */

// Tipos de domínio
export type {
  CourtState,
  QueueMatchItem,
  QueueCalculationResult,
  MatchDurationStats,
} from './types';

// Engine puro (sem React, sem Firebase)
export {
  calculateQueueState,
  calculateAverageMatchDuration,
  getPairDisplayName,
  isMatchBlockedByPreviousPhase,
} from './engine/queueEngine';

// Hooks React
export type { UseCourtQueueOptions, UseCourtQueueResult } from './hooks/useCourtQueue';
export { useCourtQueue } from './hooks/useCourtQueue';

export type {
  UseCourtMatchActionsOptions,
  UseCourtMatchActionsResult,
  ParseMatchSetsResult,
} from './hooks/useCourtMatchActions';
export { useCourtMatchActions } from './hooks/useCourtMatchActions';

// Componentes Visuais
export * from './components';

