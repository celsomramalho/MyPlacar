import { useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@infra/firebase';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import type { GameState } from '../types.ts';

/** Convite para conectar a uma partida remota já existente na nuvem. */
export function useRemoteCloudMatch() {
  const { matchSettings, setMatchSettings, setGameState } = useGame();
  const { setCurrentScreen } = useUI();
  const [activeCloudMatch, setActiveCloudMatch] = useState<{ id: string; sport: string } | null>(
    null,
  );

  const handleConnectRemote = useCallback(async () => {
    if (!activeCloudMatch || !navigator.onLine) return;
    const db = getDb();
    if (!db) return;
    try {
      const snap = await getDoc(doc(db, 'live_matches', activeCloudMatch.id));
      if (snap.exists() && snap.data().isLiveClosed !== true) {
        const cloudData = snap.data() as GameState;
        const updatedData = {
          ...cloudData,
          isMirroringActive: true,
          isLiveClosed: false,
          matchConfig: {
            ...cloudData.matchConfig,
            isWatchMode: !!matchSettings.isWatchMode,
            isScoreboardMode: !!matchSettings.isScoreboardMode,
            brightness: matchSettings.brightness,
            volume: matchSettings.volume,
            deviceLabel: matchSettings.deviceLabel,
            selectedVoiceURI: matchSettings.selectedVoiceURI,
            voiceEnabled: matchSettings.voiceEnabled,
            voiceScoring: matchSettings.voiceScoring,
            actionCooldown: matchSettings.actionCooldown,
            stateLockout: matchSettings.stateLockout,
          },
        };
        setGameState(updatedData);
        setMatchSettings((prev) => ({
          ...prev,
          isWatchMode: !!prev.isWatchMode,
          sportType: cloudData.matchConfig.sportType,
        }));
        setCurrentScreen('scoreboard');
        setActiveCloudMatch(null);
      }
    } catch {
      /* best-effort */
    }
  }, [activeCloudMatch, matchSettings, setGameState, setMatchSettings, setCurrentScreen]);

  const handleRejectRemote = useCallback(() => setActiveCloudMatch(null), []);

  return {
    activeCloudMatch,
    setActiveCloudMatch,
    handleConnectRemote,
    handleRejectRemote,
  };
}
