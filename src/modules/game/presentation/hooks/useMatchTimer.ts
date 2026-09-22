import { useState, useEffect } from 'react';
import { GameState } from '../../../../types';

export const useMatchTimer = (gameState: GameState | null) => {
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    if (!gameState) return;
    
    // Se temos timer baseado em estado legado e não temos dados novos
    if (gameState.startTime === 0) {
      setDisplayTime(gameState.matchDuration || 0);
      return;
    }

    const isFinished = !!(gameState.isConfirmedFinished || gameState.isMatchOver);

    const calculateElapsed = () => {
      let elapsedMs: number;
      if (isFinished && gameState.matchEndedAt) {
        elapsedMs = gameState.matchEndedAt - gameState.startTime;
      } else if (gameState.isPaused && gameState.lastPauseTime) {
        elapsedMs = gameState.lastPauseTime - gameState.startTime;
      } else {
        elapsedMs = Date.now() - gameState.startTime;
      }
      const totalPaused = gameState.accumulatedPausedTime || 0;
      elapsedMs -= totalPaused;

      return Math.max(0, Math.floor(elapsedMs / 1000));
    };

    setDisplayTime(calculateElapsed());

    // Se a partida está finalizada ou confirmada, o cronômetro não deve continuar incrementando
    if (isFinished) {
      return;
    }

    const interval = setInterval(() => {
      setDisplayTime(calculateElapsed());
    }, 500); // 500ms for smooth updates
    
    return () => clearInterval(interval);
  }, [
    gameState?.startTime,
    gameState?.isPaused,
    gameState?.lastPauseTime,
    gameState?.accumulatedPausedTime,
    gameState?.isMatchOver,
    gameState?.isConfirmedFinished,
    gameState?.matchEndedAt,
    gameState?.matchDuration,
  ]);

  return displayTime;
};
