import { useCallback } from 'react';

import { CheckCircle } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { useGame } from '@modules/game';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import { DEFAULT_TENNIS_SETTINGS } from '../../constants.ts';
import { getDeviceId } from '@shared/utils/device';
import { clearAllAuthSessions } from '@modules/auth/services/authSession';

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
    // 1. Fecha live no Firestore (best-effort — não bloqueia o logout)
    if (gameState?.isMirroringActive && userProfile.email && navigator.onLine) {
      try {
        const db = getDb();
        if (db) {
          const targetPin = resolveTargetPin('write');
          if (targetPin) {
            const { doc, updateDoc, deleteField } = await import('firebase/firestore');
            if (gameState.commandOwnerId === deviceId) {
              await updateDoc(
                doc(db, 'live_matches', targetPin),
                { isLiveClosed: true, isMirroringActive: false },
              ).catch(() => {});
            } else {
              const logoutUpdate = {
                [`controllers.${deviceId}`]: deleteField(),
                ...(gameState.commandOwnerId === deviceId
                  ? { commandOwnerId: null, commandOwner: null }
                  : {}),
              };
              await updateDoc(doc(db, 'live_matches', targetPin), logoutUpdate).catch(() => {});
            }
          }
        }
      } catch {
        // best-effort: continua o logout mesmo se Firestore falhar
      }
    }

    // 2. Sign-out do Firebase Auth para invalidar a sessão de autenticação
    try {
      const { getAuthInstance } = await import('@infra/firebase');
      const auth = getAuthInstance();
      if (auth) {
        const { signOut } = await import('firebase/auth');
        await signOut(auth).catch(() => {});
      }
    } catch {
      // best-effort
    }

    // 3. Limpa estado React
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
    // 4. Limpa localStorage — clearAllAuthSessions remove TODAS as variantes de chaves de sessão
    //    (maiúsculas e minúsculas) que poderiam causar re-login ao reabrir o app.
    try {
      clearAllAuthSessions();
      localStorage.removeItem('myPlacarActiveGameState');
      localStorage.removeItem('myPlacarHistory');
      localStorage.removeItem('myPlacarPartners');
      localStorage.removeItem('myPlacarAssets');
      localStorage.removeItem('myPlacarSettings');
      localStorage.removeItem('myPlacar_DataVersion');
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
