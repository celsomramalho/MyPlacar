import { useCallback } from 'react';

import { CheckCircle } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { useGame } from '@modules/game';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import { DEFAULT_TENNIS_SETTINGS } from '../constants.ts';
import { getDeviceId } from '../utils/device.ts';
import type { UpdateData } from 'firebase/firestore';

type ClearTournamentSession = () => void;

/** Logout: fecha live, limpa LS e volta para auth. */
export function useAppLogout(
  clearTournamentSession: ClearTournamentSession,
  onCloseMenu?: () => void,
) {
  const {
    gameState,
    setGameState,
    userProfile,
    setUserProfile,
    setMatchSettings,
    setMatchHistory,
    setPartners,
  } = useGame();
  const { resolveTargetPin, setCloudLiveExists } = useLive();
  const {
    setCurrentScreen,
    setModalConfig,
    setIsWaitingSync,
    setIsRecoveryFromMatchOver,
  } = useUI();
  const deviceId = getDeviceId();

  const handleLogout = useCallback(async () => {
    if (gameState?.isMirroringActive && userProfile.email && navigator.onLine) {
      const db = getDb();
      if (db) {
        const targetPin = resolveTargetPin('write');
        if (!targetPin) return;
        const { doc, setDoc, updateDoc, deleteField } = await import('firebase/firestore');
        if (gameState.commandOwnerId === deviceId) {
          await setDoc(
            doc(db, 'live_matches', targetPin),
            { isLiveClosed: true, isMirroringActive: false },
            { merge: true },
          ).catch(() => {});
        } else {
          const logoutUpdate: UpdateData<unknown> = {
            [`controllers.${deviceId}`]: deleteField(),
          };
          if (gameState.commandOwnerId === deviceId) {
            logoutUpdate.commandOwnerId = null;
            logoutUpdate.commandOwner = null;
          }
          await updateDoc(doc(db, 'live_matches', targetPin), logoutUpdate).catch(() => {});
        }
      }
    }
    setGameState(null);
    setUserProfile({
      name: '',
      nickname: '',
      email: '',
      phone: '',
      pin: '',
      isProfileComplete: false,
    });
    setMatchSettings({ ...DEFAULT_TENNIS_SETTINGS, isHistoryEnabled: true });
    setMatchHistory([]);
    setPartners([]);
    setCloudLiveExists(false);
    setIsWaitingSync(false);
    clearTournamentSession();
    try {
      localStorage.removeItem('myPlacarUserProfile');
      localStorage.removeItem('myPlacarActiveGameState');
      localStorage.removeItem('myPlacarHistory');
      localStorage.removeItem('myPlacarPartners');
      localStorage.removeItem('myPlacarAssets');
      localStorage.removeItem('myPlacarSettings');
      localStorage.removeItem('myPlacar_DataVersion');
      localStorage.removeItem('myPlacarPendingReferral');
      localStorage.removeItem('myPlacarPendingReferralPin');
      localStorage.removeItem('myPlacarPlayerQueue');
      localStorage.removeItem('myPlacarActiveEvent');
      localStorage.removeItem('myPlacarRegisteredEvents');
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('myPlacar_SavedSettings_')) localStorage.removeItem(key);
      });
    } catch {
      /* best-effort */
    }
    setCurrentScreen('auth');
    setIsRecoveryFromMatchOver(false);
    onCloseMenu?.();
    globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
    setModalConfig({
      title: 'Sessão finalizada',
      message: 'Limpando dados da sessão anterior.',
      variant: 'success',
      icon: <CheckCircle className="text-green-500 w-16 h-16" />,
      onConfirm: () => setModalConfig(null),
    });
    setTimeout(() => setModalConfig(null), 2500);
  }, [
    gameState,
    userProfile.email,
    deviceId,
    resolveTargetPin,
    clearTournamentSession,
    setGameState,
    setUserProfile,
    setMatchSettings,
    setMatchHistory,
    setPartners,
    setCloudLiveExists,
    setIsWaitingSync,
    setCurrentScreen,
    setIsRecoveryFromMatchOver,
    setModalConfig,
    onCloseMenu,
  ]);

  return { handleLogout };
}
