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

    const interval = setInterval(() => {
      let elapsedMs = Date.now() - gameState.startTime;
      if (gameState.isPaused && gameState.lastPauseTime) {
        elapsedMs = gameState.lastPauseTime - gameState.startTime;
      }
      const totalPaused = gameState.accumulatedPausedTime || 0;
      elapsedMs -= totalPaused;
      
      const newSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      setDisplayTime(newSeconds);
    }, 500); // 500ms for smooth updates
    
    return () => clearInterval(interval);
  }, [gameState?.startTime, gameState?.isPaused, gameState?.lastPauseTime, gameState?.accumulatedPausedTime]);

  return displayTime;
};
