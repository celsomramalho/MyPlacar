import React, { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import type { TournamentEvent } from '@modules/events/types';
import { EventFormedTeamsView } from '@modules/admin/components/EventFormedTeamsView';
import { isCoAdminOfEvent, isJudgeOfEvent, isPrimaryAdminEmail } from '@modules/events/services/eventAdminAccess';
import { getDb, subscribeEventByPin } from '@infra/firebase';
import type { UserProfile } from '@modules/auth/types';
import { useGame } from '@modules/game';

interface QueueOnlyRouteProps {
  event: TournamentEvent;
  userProfile: UserProfile;
  onOpenMenu: () => void;
}

export function QueueOnlyRoute({ event, userProfile, onOpenMenu }: QueueOnlyRouteProps) {
  const { matchSettings, setMatchSettings, gameState, setGameState } = useGame();
  const { setCurrentScreen, setModalConfig } = useUI();
  const [currentEvent, setCurrentEvent] = useState(event);
  useEffect(() => {
    setCurrentEvent(event);
    const db = getDb();
    if (!db || !event.pin) return;
    return subscribeEventByPin(db, event.pin, (updatedEvent) => {
      setCurrentEvent((current) => ({
        ...(updatedEvent as TournamentEvent),
        entries: current.entries,
      } as TournamentEvent));
    });
  }, [event]);
  const isPrimaryAdmin = isPrimaryAdminEmail(userProfile.email);
  const isCoAdmin = isCoAdminOfEvent(currentEvent, userProfile.pin);
  const isJudge = isJudgeOfEvent(currentEvent, userProfile.pin);

  return (
    <main className="min-h-screen bg-slate-50 px-3 pt-2 pb-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
        className="mb-2 w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95"
      >
        <Menu size={20} />
      </button>
      <EventFormedTeamsView
        event={currentEvent}
        onUpdateEvent={setCurrentEvent}
        isReadOnly={currentEvent.active !== true && !isPrimaryAdmin}
        canCheckInParticipants={currentEvent.active === true && (isPrimaryAdmin || isCoAdmin || isJudge)}
        adminEmail={userProfile.email}
        adminPin={userProfile.pin}
        compact
        isWatchModeEnabled={!!matchSettings.isWatchMode}
        onToggleWatchMode={(matchId) => {
          const eventPin = currentEvent.pin.toUpperCase();
          const isMatchingGame = gameState?.tournamentPin?.toUpperCase() === eventPin
            && gameState.tournamentMatchId === matchId;

          if (!isMatchingGame) {
            setModalConfig({
              title: 'Placar não vinculado',
              message: 'Esta partida da fila ainda não tem um placar aberto para o modo relógio. Abra a partida pelo botão Play para vinculá-la ao evento.',
              onConfirm: () => setModalConfig(null),
            });
            return;
          }

          setMatchSettings((current) => ({ ...current, isWatchMode: true, isScoreboardMode: false }));
          setGameState((current) => current ? {
            ...current,
            matchConfig: { ...current.matchConfig, isWatchMode: true, isScoreboardMode: false },
          } : current);
          setCurrentScreen('scoreboard');
        }}
      />
    </main>
  );
}
