/**
 * Componente: CourtQueuePanel
 *
 * Painel completo de Fila de Quadras do evento.
 * Orquestra o cálculo via `useCourtQueue`, as ações via `useCourtMatchActions`,
 * e renderiza o cabeçalho de estatísticas, as quadras em tempo real e a fila dinâmica.
 *
 * Pode ser utilizado tanto no painel de administração quanto na visualização pública
 * de participantes (`isReadOnly={true}`).
 *
 * @see docs/PLANO_REFATORACAO_FILA_QUADRAS.md — Fase 4
 */

import React, { useState } from 'react';
import type { TournamentEvent, TournamentMatch } from '@modules/events/types';
import { useCourtQueue } from '../hooks/useCourtQueue';
import { useCourtMatchActions } from '../hooks/useCourtMatchActions';
import { QueueHeaderStats } from './QueueHeaderStats';
import { CourtCard } from './CourtCard';
import { QueueMatchCard } from './QueueMatchCard';

export interface CourtQueuePanelProps {
  event: TournamentEvent;
  isReadOnly?: boolean;
  onUpdateEvent?: (updated: TournamentEvent) => void;
  onOpenMatchRules?: (match: TournamentMatch) => void;
  onRefreshEventScore?: (matchId: string) => void;
  refreshingMatchId?: string | null;
  /** Título customizado do header (opcional) */
  title?: string;
  /** Subtítulo customizado do header (opcional) */
  subtitle?: string;
}

export const CourtQueuePanel: React.FC<CourtQueuePanelProps> = ({
  event,
  isReadOnly = false,
  onUpdateEvent,
  onOpenMatchRules,
  onRefreshEventScore,
  refreshingMatchId = null,
  title,
  subtitle,
}) => {
  const [activeSelectMatchId, setActiveSelectMatchId] = useState<string | null>(null);

  // Hook de leitura e estado reativo
  const queue = useCourtQueue(event);

  // Hook de mutações operacionais
  const actions = useCourtMatchActions({
    event,
    isReadOnly,
    onUpdateEvent,
  });

  const handleToggleSelectCourt = (matchId: string) => {
    setActiveSelectMatchId((curr) => (curr === matchId ? null : matchId));
  };

  const handleAssignAndClose = async (matchId: string, courtName: string) => {
    setActiveSelectMatchId(null);
    await actions.assignMatchToCourt(matchId, courtName);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header com Métricas da Fila */}
      <QueueHeaderStats
        visibleMatchesCount={queue.visibleMatches.length}
        totalPendingCount={queue.totalPendingCount}
        freeCourtsCount={queue.freeCourtsCount}
        busyCourtsCount={queue.busyCourtsCount}
        interdictedCourtsCount={queue.interdictedCourtsCount}
        totalCourtsCount={queue.totalCourtsCount}
        averageMatchDurationMinutes={queue.averageMatchDurationMinutes}
        isDurationEstimated={queue.isDurationEstimated}
        finishedMatchesCountWithDuration={queue.finishedMatchesCountWithDuration}
        nextCourtFreeWaitMinutes={queue.nextCourtFreeWaitMinutes}
        nextCourtFreeTimeStr={queue.nextCourtFreeTimeStr}
        title={title}
        subtitle={subtitle}
      />

      {/* 2. Grid de Quadras */}
      {queue.courtStates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider px-1">
            Quadras ({queue.totalCourtsCount})
          </h3>
          <div className="grid grid-cols-1 gap-3.5">
            {queue.courtStates.map((court, idx) => (
              <CourtCard
                key={court.courtName || idx}
                court={court}
                index={idx}
                isReadOnly={isReadOnly}
                pairsById={queue.pairsById}
                totalSets={queue.totalSets}
                gamesPerSet={queue.gamesPerSet}
                averageMatchDurationMinutes={queue.averageMatchDurationMinutes}
                refreshingMatchId={refreshingMatchId}
                getPlayerNick={queue.getPlayerNick}
                parseMatchSets={queue.parseMatchSets}
                onFreeCourtMatch={(matchId, isFinished) =>
                  isFinished ? actions.finishCourtMatch(matchId) : actions.freeCourtMatch(matchId)
                }
                onOpenMatchRules={(m) => onOpenMatchRules?.(m)}
                onToggleInterdictCourt={actions.toggleInterdictCourt}
                onRefreshEventScore={(matchId) => onRefreshEventScore?.(matchId)}
                onScoreInputChange={actions.handleScoreInputChange}
                onScoreBlur={actions.handleScoreBlur}
                onMatchDateChange={actions.handleMatchDateChange}
                onFinishCourtMatch={actions.finishCourtMatch}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. Lista da Fila Dinâmica */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">
            Fila de Espera ({queue.totalPendingCount})
          </h3>
          {queue.totalPendingCount > queue.visibleLimit && (
            <span className="text-xs font-bold text-slate-400">
              Exibindo as primeiras {queue.visibleLimit} partidas
            </span>
          )}
        </div>

        {queue.visibleMatches.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-100 shadow-sm text-slate-400 font-bold text-sm">
            Nenhuma partida aguardando na fila.
          </div>
        ) : (
          <div className="space-y-3">
            {queue.visibleMatches.map((item, idx) => (
              <QueueMatchCard
                key={item.match.id || idx}
                item={item}
                queueIndex={idx}
                freeCourts={queue.freeCourts}
                isReadOnly={isReadOnly}
                isSelectingCourt={activeSelectMatchId === item.match.id}
                onToggleFreezeMatch={actions.toggleFreezeMatch}
                onToggleSelectCourt={handleToggleSelectCourt}
                onAssignMatchToCourt={handleAssignAndClose}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
