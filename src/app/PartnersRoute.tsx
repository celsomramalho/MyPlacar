import React from 'react';
import { PartnersScreen, applyPartnerSelection, addPartnerToState } from '@modules/partners';
import { useGame } from '@modules/game';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import type { Partner } from '@modules/partners/types';
import type { TournamentEvent } from '@modules/events/types';

interface PartnersRouteProps {
  appUrl: string;
  authReady: boolean;
  activeEvent: TournamentEvent | null;
  setSpectatorPin: React.Dispatch<React.SetStateAction<string | null>>;
}

export function PartnersRoute({
  appUrl,
  authReady,
  activeEvent,
  setSpectatorPin,
}: PartnersRouteProps) {
  const { userProfile, setPartners, matchSettings, setMatchSettings, handleObserveLive } = useGame();
  const { activeLives } = useLive();
  const {
    setCurrentScreen,
    setModalConfig,
    playerQueue,
    setPlayerQueue,
    isSelectingJudge,
    setIsSelectingJudge,
    setJudgePinInput,
    setJudgeNicknameLookup,
  } = useUI();

  const handleSelectJudgeFromPartners = (partner: Partner) => {
    setJudgePinInput(partner.pin || '');
    setJudgeNicknameLookup(partner.nickname);
    setIsSelectingJudge(false);
    setCurrentScreen('scoreboard');
  };

  const handleConfirmPartners = (team1: Partner[], team2: Partner[]) => {
    setMatchSettings(prev => applyPartnerSelection(prev, team1, team2));
  };

  return (
    <PartnersScreen
      appUrl={appUrl}
      isAuthReady={authReady}
      playerQueue={playerQueue}
      setPlayerQueue={setPlayerQueue}
      onBack={() => {
        if (isSelectingJudge) {
          setIsSelectingJudge(false);
          setCurrentScreen('scoreboard');
        } else {
          setCurrentScreen('settings');
        }
      }}
      isDoubles={matchSettings.isDoubles}
      onUpdateSettings={updates => setMatchSettings(prev => ({ ...prev, ...updates }))}
      onConfirmSelection={handleConfirmPartners}
      onSelectPartner={isSelectingJudge ? handleSelectJudgeFromPartners : undefined}
      p1Color={matchSettings.p1Color}
      p2Color={matchSettings.p2Color}
      activeLives={activeLives}
      onWatchLive={pin => {
        const isJudge =
          activeLives
            .find(l => l.ownerPin?.toUpperCase() === pin.toUpperCase())
            ?.judgePin?.toUpperCase() === userProfile.pin.toUpperCase();
        if (isJudge) {
          handleObserveLive(pin);
        } else {
          setSpectatorPin(pin);
          setCurrentScreen('spectator');
        }
      }}
      onDeletePartners={ids =>
        setModalConfig({
          title: 'Excluir jogadores?',
          message: 'Deseja excluir os jogadores selecionados?',
          confirmLabel: 'Excluir',
          variant: 'danger',
          onConfirm: () => {
            setPartners(prev => prev.filter(p => !ids.has(p.id)));
            setPlayerQueue(prev => {
              const filtered = prev.filter(p => !p.isSelected);
              const diff = prev.length - filtered.length;
              const padding = Array.from({ length: diff }, (_, i) => ({
                id: `q_${Date.now()}_pad_${i}`,
                name: '',
                gender: 'M' as const,
              }));
              return [...filtered, ...padding];
            });
          },
          onCancel: () => setModalConfig(null),
        })
      }
      activeEvent={activeEvent}
    />
  );
}
