/**
 * Domínio: Fila de Quadras (Court Queue)
 *
 * Contratos de dados do subdomínio de fila única e estado das quadras.
 * Extraído de src/modules/events/services/queueManager.ts na Fase 2 da
 * refatoração por domínio — ver docs/PLANO_REFATORACAO_FILA_QUADRAS.md
 */

import type { TournamentMatch, EventCategory } from '../../types';

// ─── Estado de uma Quadra ────────────────────────────────────────────────────

export interface CourtState {
  courtName: string;
  status: 'free' | 'busy' | 'interdicted';
  activeMatch?: TournamentMatch;
  activeMatchCategory?: EventCategory;
  startedAt?: string;
  estimatedRemainingMinutes?: number;
  estimatedFinishTimeStr?: string;
}

// ─── Item da Fila de Partidas ────────────────────────────────────────────────

export interface QueueMatchItem {
  match: TournamentMatch;
  category?: EventCategory;
  /** Semáforo de prontidão da partida na fila */
  queueStatus: 'green' | 'yellow' | 'red' | 'gray';
  conflictReason?: string;
  isFrozen: boolean;
  pair1Name: string;
  pair2Name: string;
  pair1Code?: string;
  pair2Code?: string;
  phaseLabel: string;
  estimatedWaitMinutes?: number;
  estimatedCallTimeStr?: string;
}

// ─── Resultado Completo do Cálculo de Fila ───────────────────────────────────

export interface QueueCalculationResult {
  /** Lista de nomes de todas as quadras do evento */
  courtList: string[];
  /** Estado individual de cada quadra */
  courtStates: CourtState[];
  /** Nomes das quadras livres */
  freeCourts: string[];
  totalCourtsCount: number;
  interdictedCourtsCount: number;
  busyCourtsCount: number;
  freeCourtsCount: number;
  /** Fila completa ordenada (verde → amarela → cinza → vermelha) */
  orderedQueue: QueueMatchItem[];
  /** Subconjunto visível limitado a 4 × quadras_efetivas */
  visibleMatches: QueueMatchItem[];
  totalPendingCount: number;
  visibleLimit: number;
  averageMatchDurationMinutes: number;
  isDurationEstimated: boolean;
  finishedMatchesCountWithDuration: number;
  /** Tempo até a próxima quadra ficar livre */
  nextCourtFreeWaitMinutes?: number;
  nextCourtFreeTimeStr?: string;
}

// ─── Estatísticas de Duração ─────────────────────────────────────────────────

export interface MatchDurationStats {
  averageMinutes: number;
  sampleCount: number;
  /** true quando não há histórico suficiente e usou valor padrão por formato */
  isEstimated: boolean;
}
