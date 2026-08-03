import { useState, useCallback } from 'react';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import type { GameState, MatchSettings } from '../../types.ts';
import { initPickleballState } from '@modules/game/domain/pickleballEngine';
import { getEngineForSport } from '@modules/game/domain/sportEngine';
import { isWatchDevice } from '@shared/utils/device';

/** Modo offline local (sem histórico na nuvem). */
export function useAppOfflineMode() {
  const { matchSettings, setMatchSettings, setGameState, startGame } = useGame();
  const { setCurrentScreen, setIsRecoveryFromMatchOver, setIsWaitingSync } = useUI();
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);

  const handleOfflineMode = useCallback(() => {
    setIsOfflineMode(true);
    setIsRecoveryFromMatchOver(false);
    setIsWaitingSync(false);

    const p1Name = 'Jogador 1';
    const p2Name = 'Jogador 2';

    const offlineSettings: MatchSettings = {
      ...matchSettings,
      p1Name,
      p2Name,
      isDoubles: false,
      isHistoryEnabled: false,
      cloudSync: false,
      useGeminiVoice: false,
      isWatchMode: true,
      isScoreboardMode: isWatchDevice() ? false : matchSettings.isScoreboardMode,
    };
    setMatchSettings(offlineSettings);

    const matchId = `offline_${Date.now()}`;
    const initialGameState: GameState = {
      matchId,
      startTime: Date.now(),
      p1: { name: p1Name, score: '0', games: 0, sets: [], color: offlineSettings.p1Color },
      p2: { name: p2Name, score: '0', games: 0, sets: [], color: offlineSettings.p2Color },
      server: 1,
      servingOrderOffset: 0,
      pointHistory: [],
      matchConfig: { ...offlineSettings, setsToWin: offlineSettings.sets },
      history: [],
      currentSet: 0,
      isMatchOver: false,
      isConfirmedFinished: false,
      matchDuration: 0,
      isPaused: false,
      isMirroringActive: false,
      isLiveClosed: false,
      ownerPin: '',
      ownerDeviceId: '',
      commandOwnerId: '',
      scoringEngine: getEngineForSport(offlineSettings.sportType),
    };

    if (offlineSettings.sportType === 'pickleball') {
      initialGameState.pickleball = initPickleballState(initialGameState);
      initialGameState.servingOrderOffset =
        (initialGameState.pickleball.server.team === 1 ? 0 : 1) +
        (initialGameState.pickleball.server.serverNumber === 2 ? 2 : 0);
    }
    startGame(initialGameState);
    setCurrentScreen('scoreboard');
    setTimeout(() => startGame(initialGameState), 100);
  }, [matchSettings, startGame, setMatchSettings, setCurrentScreen, setIsRecoveryFromMatchOver, setIsWaitingSync]);

  const handleExitOffline = useCallback(() => {
    setIsOfflineMode(false);
    setGameState(null);
    setCurrentScreen('auth');
  }, [setGameState, setCurrentScreen]);

  return { isOfflineMode, setIsOfflineMode, handleOfflineMode, handleExitOffline };
}
