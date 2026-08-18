import React from 'react';
import { EventDetailScreen } from '@modules/events';
import { createManualPartner, addPartnerToState } from '@modules/partners';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import type { TournamentEvent } from '@modules/events';
import type { ModalConfig } from '@modules/ui/types';
import type { Dispatch, SetStateAction } from 'react';

interface EventDetailRouteProps {
  appUrl: string;
  event: TournamentEvent;
  handleExitTournament: () => void;
  setModalConfig: Dispatch<SetStateAction<ModalConfig | null>>;
  unreadCommsCount?: number;
}

export function EventDetailRoute({
  appUrl,
  event,
  handleExitTournament,
  setModalConfig,
  unreadCommsCount = 0,
}: EventDetailRouteProps) {
  const { userProfile, partners, setPartners, initGameState } = useGame();
  const { setCurrentScreen } = useUI();

  const handleAddTournamentPartner = (pin: string, nickname: string, gender: 'M' | 'F', name?: string) => {
    const partner = createManualPartner({ pin, nickname, gender, name });
    setPartners(prev => addPartnerToState(prev, partner));
  };

  return (
    <EventDetailScreen
      appUrl={appUrl}
      event={event}
      onBack={() => setCurrentScreen('tournaments')}
      userProfile={userProfile}
      onExitTournament={handleExitTournament}
      onAddPartner={handleAddTournamentPartner}
      partners={partners}
      onStartTournamentMatch={(match, pair1, pair2, ev) =>
        initGameState(true, { match, pair1, pair2, event: ev })
      }
      setModalConfig={setModalConfig}
      onOpenCommunications={() => setCurrentScreen('communications')}
      unreadCount={unreadCommsCount}
    />
  );
}
