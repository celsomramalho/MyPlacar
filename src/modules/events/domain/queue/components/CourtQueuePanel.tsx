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
import type { TournamentEntry, TournamentEvent, TournamentMatch } from '@modules/events/types';
import { saveAdminEventCheckIn } from '@infra/firebase/events';
import { entryHasFinishedMatchOnDate, getTodayDateStr, isEntryCheckedInToday, isTournamentPeriodActive } from '@modules/events/services/eventRegistrationPeriod';
import { useCourtQueue } from '../hooks/useCourtQueue';
import { useCourtMatchActions } from '../hooks/useCourtMatchActions';
import { QueueHeaderStats } from './QueueHeaderStats';
import { CourtCard } from './CourtCard';
import { QueueMatchCard } from './QueueMatchCard';
import { getQueueCategoryColors } from '../utils/queueCategoryColors';

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
  canCheckInParticipants?: boolean;
  adminEmail?: string;
  adminPin?: string;
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
  canCheckInParticipants = false,
  adminEmail,
  adminPin,
}) => {
  const [activeSelectMatchId, setActiveSelectMatchId] = useState<string | null>(null);
  const [checkInOverrides, setCheckInOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [savingCheckInKeys, setSavingCheckInKeys] = useState<Set<string>>(() => new Set());

  // Hook de leitura e estado reativo
  const queue = useCourtQueue(event);
  const today = getTodayDateStr();
  const pairsById = React.useMemo(() => new Map((event.pairs || []).map((pair) => [pair.id, pair])), [event.pairs]);
  const categoryColors = React.useMemo(() => getQueueCategoryColors(event.categories || []), [event.categories]);

  const getCanonicalEntry = (entry: TournamentEntry) => {
    const entries = event.entries || [];
    const email = entry.email?.toLowerCase().trim();
    const pin = entry.pin?.toUpperCase().trim();
    const registrationId = entry.registrationId;
    const normalizeName = (name?: string) => name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR') || '';
    const names = new Set([normalizeName(entry.nickname), normalizeName(entry.name)].filter(Boolean));
    const sameName = (candidate: TournamentEntry) => names.has(normalizeName(candidate.nickname)) || names.has(normalizeName(candidate.name));

    // Match the displayed athlete first. Pair snapshots can carry stale or partner-linked identifiers.
    const byNameAndEmail = entries.find((candidate) => sameName(candidate) && email && candidate.email?.toLowerCase().trim() === email);
    if (byNameAndEmail) return byNameAndEmail;
    const byNameAndPin = entries.find((candidate) => sameName(candidate) && pin && candidate.pin?.toUpperCase().trim() === pin);
    if (byNameAndPin) return byNameAndPin;
    const byName = entries.find(sameName);
    if (byName) return byName;

    if (email) {
      const byEmail = entries.find((candidate) => candidate.email?.toLowerCase().trim() === email);
      if (byEmail) return byEmail;
    }
    if (pin) {
      const byPin = entries.find((candidate) => candidate.pin?.toUpperCase().trim() === pin);
      if (byPin) return byPin;
    }
    if (registrationId != null) {
      const byRegistrationId = entries.find((candidate) => candidate.registrationId === registrationId);
      if (byRegistrationId) return byRegistrationId;
    }
    return entry;
  };
  const getEntryKey = (entry: TournamentEntry) => entry.email?.toLowerCase().trim() || entry.pin?.toUpperCase().trim() || entry.name;
  const getEntryCheckedIn = (entry: TournamentEntry) => {
    const canonicalEntry = getCanonicalEntry(entry);
    const key = getEntryKey(canonicalEntry);
    return checkInOverrides.has(key)
      ? Boolean(checkInOverrides.get(key))
      : isEntryCheckedInToday(canonicalEntry, event.matches, pairsById, today);
  };
  const isCheckInDisabled = (entry: TournamentEntry) => {
    const canonicalEntry = getCanonicalEntry(entry);
    const checked = getEntryCheckedIn(canonicalEntry);
    return !canCheckInParticipants
      || !canonicalEntry.email
      || event.active !== true
      || !isTournamentPeriodActive(event)
      || savingCheckInKeys.has(getEntryKey(canonicalEntry))
      || (checked && entryHasFinishedMatchOnDate(canonicalEntry, event.matches, pairsById, today));
  };

  React.useEffect(() => {
    setCheckInOverrides((current) => {
      if (current.size === 0) return current;
      const next = new Map(current);
      current.forEach((checkedIn, key) => {
        const currentEntry = (event.entries || []).find((entry) => getEntryKey(entry) === key);
        if (currentEntry && isEntryCheckedInToday(currentEntry, event.matches, pairsById, today) === checkedIn) {
          next.delete(key);
        }
      });
      return next.size === current.size ? current : next;
    });
  }, [event.entries, event.matches, pairsById, today]);

  const handleToggleCheckIn = async (queueEntry: TournamentEntry) => {
    const entry = getCanonicalEntry(queueEntry);
    if (!canCheckInParticipants || !adminEmail || !entry.email || isCheckInDisabled(entry)) return;
    const key = getEntryKey(entry);
    const checkedIn = !getEntryCheckedIn(entry);
    const updatedEntry: TournamentEntry = {
      ...entry,
      checkedIn,
      checkInDate: checkedIn ? today : undefined,
      checkInDates: checkedIn
        ? Array.from(new Set([...(entry.checkInDates || []), today]))
        : (entry.checkInDates || []).filter((date) => date !== today),
    };
    setSavingCheckInKeys((current) => new Set(current).add(key));
    try {
      await saveAdminEventCheckIn(event.pin, adminEmail, adminPin || '', updatedEntry);
      setCheckInOverrides((current) => new Map(current).set(key, checkedIn));
    } catch (error) {
      console.error('Erro ao atualizar check-in pela fila:', error);
      window.alert('Não foi possível salvar o check-in. Tente novamente.');
    } finally {
      setSavingCheckInKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

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
          <h3 className="text-sm font-black text-slate-700 tracking-wider px-1">
            Quadras ({queue.totalCourtsCount})
          </h3>
          <div className="grid grid-cols-1 gap-3.5">
            {queue.courtStates.map((court, idx) => (
              <CourtCard
                key={court.courtName || idx}
                court={court}
                index={idx}
                isReadOnly={isReadOnly}
                categoryColor={court.activeMatchCategory ? categoryColors.get(court.activeMatchCategory.id) : undefined}
                pairsById={queue.pairsById}
                totalSets={queue.totalSets}
                gamesPerSet={queue.gamesPerSet}
                isTotalGamesSet={queue.isTotalGamesSet}
                sportId={event.sportId || event.config?.sportType}
                sportRules={event.sportRules}
                tieBreak={queue.tieBreak}
                tieBreakAt={queue.tieBreakAt}
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
                onScoreUndoChange={actions.handleScoreUndoChange}
                onServeSettingsChange={actions.handleServeSettingsChange}
                onScoreBlur={actions.handleScoreBlur}
                onMatchDateChange={actions.handleMatchDateChange}
                onFinishCourtMatch={actions.finishCourtMatch}
                onResetCourtMatch={actions.resetCourtMatch}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. Lista da Fila Dinâmica */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-black text-slate-700 tracking-wider">
            Fila de espera ({queue.totalPendingCount})
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
                canCheckInParticipants={canCheckInParticipants}
                isEntryCheckedIn={getEntryCheckedIn}
                isCheckInDisabled={isCheckInDisabled}
                onToggleCheckIn={handleToggleCheckIn}
                categoryColor={item.category ? categoryColors.get(item.category.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
