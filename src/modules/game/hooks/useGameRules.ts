import { useCallback, useMemo } from 'react';
import { useUI } from '@modules/ui/UIContext';
import { useLive } from '@modules/live/useLive';
import { getDeviceId } from '@shared/utils/device';
import { sanitizeForFirestore } from '@shared/utils/sanitize';
import { useGame } from '../useGame.ts';

/** Regras e persistência de `matchSettings` (local + sync live). */
export function useGameRules() {
  const { matchSettings, gameState, setGameState, userProfile } = useGame();
  const { setIsSettingsInicialSaved, setIsSettingsRegrasSaved } = useUI();
  const { resolveTargetPin } = useLive();
  const deviceId = getDeviceId();

  const canStartMatch = useMemo(() => {
    const s = matchSettings;
    if (!s.isDoubles) return s.p1Name.trim().length > 0 && s.p2Name.trim().length > 0;
    return (
      s.p1Name.trim().length > 0 &&
      (s.p1Partner || '').trim().length > 0 &&
      s.p2Name.trim().length > 0 &&
      (s.p2Partner || '').trim().length > 0
    );
  }, [matchSettings]);

  const persistMatchSettings = useCallback(() => {
    try {
      localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings));
      setIsSettingsInicialSaved(true);
      setIsSettingsRegrasSaved(true);

      const canApplyLocalSettingsToGame =
        gameState &&
        !gameState.isConfirmedFinished &&
        (!gameState.isMirroringActive || gameState.commandOwnerId === deviceId);

      if (canApplyLocalSettingsToGame) {
        setGameState(prevG => {
          if (!prevG) return prevG;
          return {
            ...prevG,
            p1: {
              ...prevG.p1,
              name: matchSettings.p1Name,
              partnerName: matchSettings.p1Partner,
              color: matchSettings.p1Color,
            },
            p2: {
              ...prevG.p2,
              name: matchSettings.p2Name,
              partnerName: matchSettings.p2Partner,
              color: matchSettings.p2Color,
            },
            matchConfig: {
              ...matchSettings,
              setsToWin: matchSettings.sets,
              isWatchMode: !!matchSettings.isWatchMode,
              isScoreboardMode: !!matchSettings.isScoreboardMode,
            }
          };
        });
      }

      if (
        gameState?.isMirroringActive &&
        userProfile.email &&
        navigator.onLine &&
        gameState.commandOwnerId === deviceId
      ) {
        const targetPin = resolveTargetPin('write');
        if (!targetPin) return;
        const stateToSync = sanitizeForFirestore({
            ...gameState,
            controllers: undefined,
            p1: {
              ...gameState.p1,
              name: matchSettings.p1Name,
              partnerName: matchSettings.p1Partner,
              color: matchSettings.p1Color,
            },
            p2: {
              ...gameState.p2,
              name: matchSettings.p2Name,
              partnerName: matchSettings.p2Partner,
              color: matchSettings.p2Color,
            },
            matchConfig: {
              ...matchSettings,
              setsToWin: matchSettings.sets,
              isWatchMode: !!matchSettings.isWatchMode,
              isScoreboardMode: !!matchSettings.isScoreboardMode,
            },
        });
        if (stateToSync && targetPin) {
          void Promise.all([
            import('@infra/firebase/client'),
            import('firebase/firestore'),
          ]).then(([{ getDb }, { doc, updateDoc }]) => {
            const db = getDb();
            if (db) return updateDoc(doc(db, 'live_matches', targetPin), stateToSync);
          }).catch(() => {});
        }
      }
    } catch {
      /* localStorage / firestore best-effort */
    }
  }, [matchSettings, gameState, setGameState, userProfile.email, deviceId, resolveTargetPin, setIsSettingsInicialSaved, setIsSettingsRegrasSaved]);

  return { canStartMatch, persistMatchSettings };
}
