import React from 'react';
import { NewGameScreen } from '@modules/game/screens/NewGameScreen';
import { useGame } from '@modules/game';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import { useGameRules } from '@modules/game/hooks/useGameRules';
import { DEFAULT_TENNIS_SETTINGS } from '../constants';
import type { TournamentEvent } from '@modules/events';
import type { Tab } from '../types';

interface NewGameRouteProps {
  activeEvent: TournamentEvent | null;
  handleExitTournament: () => void;
  isOfflineMode: boolean;
  onExitOffline: () => void;
  onOpenMenu: () => void;
  setActiveTab: (tab: Tab) => void;
  onVersionTap: () => void;
}

export function NewGameRoute({
  activeEvent,
  handleExitTournament,
  isOfflineMode,
  onExitOffline,
  onOpenMenu,
  setActiveTab,
  onVersionTap,
}: NewGameRouteProps) {
  const { setCurrentScreen, setShowLiveControlOverlay, isSettingsInicialSaved, isSettingsRegrasSaved } =
    useUI();
  const { gameState, initGameState } = useGame();
  const { cloudLiveExists, isActiveController } = useLive();
  const { canStartMatch, persistMatchSettings } = useGameRules();

  return (
    <NewGameScreen
      baseSettings={DEFAULT_TENNIS_SETTINGS}
      onBack={() => { persistMatchSettings(); setCurrentScreen('settings'); }}
      onHome={() => { persistMatchSettings(); setCurrentScreen('settings'); }}
      onGoToScoreboard={() => { persistMatchSettings(); initGameState(false); }}
      onNavigateToTab={t => { persistMatchSettings(); setActiveTab(t); setCurrentScreen('settings'); }}
      gameState={gameState}
      onStartMatch={() => { persistMatchSettings(); initGameState(true); }}
      onPlayShortcut={() => { persistMatchSettings(); initGameState(false); }}
      isSettingsRegrasSaved={isSettingsRegrasSaved}
      isSettingsInicialSaved={isSettingsInicialSaved}
      canStartMatch={canStartMatch}
      onSportChange={() => {}}
      cloudLiveExists={cloudLiveExists}
      onOpenLiveControl={() => setShowLiveControlOverlay(true)}
      isController={isActiveController}
      activeEvent={activeEvent}
      onJoinTournament={() => setCurrentScreen('tournaments')}
      onExitTournament={handleExitTournament}
      onOpenMenu={() => { persistMatchSettings(); onOpenMenu(); }}
      isOfflineMode={isOfflineMode}
      onExitOffline={onExitOffline}
      onVersionTap={onVersionTap}
    />
  );
}
