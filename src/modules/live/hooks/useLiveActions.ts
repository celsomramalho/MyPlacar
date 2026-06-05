import { getDb } from '@infra/firebase/client';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { assertOwnerPin, clearLiveOwnerPin } from '@modules/live/liveHelpers';
import { sanitizeForFirestore } from '@shared/utils/sanitize';
import { getDeviceType } from '@shared/utils/device';
import type { GameState, ControllerRecord } from '@game/types';

import type { UserProfile } from '@modules/auth/types';
import type { ModalConfig } from '@modules/ui/types';

interface UseLiveActionsParams {
  gameState: GameState | null;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;
  userProfile: UserProfile;
  deviceId: string;
  currentFullDeviceName: string;
  isOriginalOwner: boolean;
  isCommandOwner: boolean;
  livePapel: string;
  resolveTargetPin: (mode: 'read' | 'write') => string | null;
  setModalConfig: React.Dispatch<React.SetStateAction<ModalConfig | null>>;
  setCloudLiveExists: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveLives: React.Dispatch<React.SetStateAction<any[]>>;
  setMatchSettings: React.Dispatch<React.SetStateAction<any>>;
}

interface UseLiveActionsReturn {
  handleToggleMirroring: (active: boolean) => Promise<void>;
  handleConfirmMatch: () => Promise<void>;
}

export function useLiveActions({
  gameState,
  setGameState,
  userProfile,
  deviceId,
  currentFullDeviceName,
  isOriginalOwner,
  isCommandOwner,
  livePapel,
  resolveTargetPin,
  setModalConfig,
  setCloudLiveExists,
  setActiveLives,
  setMatchSettings,
}: UseLiveActionsParams): UseLiveActionsReturn {

  const handleToggleMirroring = async (active: boolean) => {
    if (active) {
      const isStarted = gameState && (
        (gameState.pointHistory?.length ?? 0) > 0 ||
        gameState.p1.games > 0 ||
        gameState.p2.games > 0 ||
        (gameState.p1.score !== '0' && gameState.p1.score !== '') ||
        (gameState.p2.score !== '0' && gameState.p2.score !== '')
      );
      if (isStarted) {
        setModalConfig({
          title: 'Atenção',
          message: 'Não é possível iniciar a live com a partida em andamento.',
          confirmLabel: 'Ok',
          onConfirm: () => setModalConfig(null),
        });
        return;
      }
      const db = getDb();
      if (db && navigator.onLine && userProfile.pin) {
        const myPin = userProfile.pin.toUpperCase();
        const targetPin = resolveTargetPin('write');
        if (!targetPin) return;

        // Guard: consulta o Firestore diretamente pelo pin (não depende de activeLives
        // estar populado em memória — cobre o caso de reload/latência do onSnapshot).
        const pinsToCheck = Array.from(new Set([targetPin, myPin].filter(Boolean))) as string[];
        let foundActiveLive = false;
        for (const pin of pinsToCheck) {
          try {
            const existingSnap = await getDoc(doc(db, 'live_matches', pin));
            if (existingSnap.exists() && existingSnap.data().isLiveClosed !== true) {
              const existingData = existingSnap.data() as GameState;
              const hasActiveController = Object.values(existingData.controllers || {}).some(
                (c: ControllerRecord) => c.lastSeen && (Date.now() - c.lastSeen) < 30000
              );
              if (hasActiveController) {
                foundActiveLive = true;
                break;
              }
            }
          } catch {}
        }
        if (foundActiveLive) {
          setModalConfig({
            title: 'Live já ativa',
            message: 'Já existe uma transmissão ativa para esta partida. Deseja assumir o controle?',
            confirmLabel: 'Sim',
            onConfirm: () => {
              setGameState(p => p ? { ...p, isMirroringActive: true, commandOwnerId: deviceId } : null);
              setModalConfig(null);
            },
            onCancel: () => setModalConfig(null),
          });
          return;
        }
      }
    }

    const db = getDb();
    if (active && db && navigator.onLine && gameState) {
      const myPin = userProfile.pin?.toUpperCase();
      const targetPin = resolveTargetPin('write');
      if (!targetPin) return;
      const nextControllers = {
        [deviceId]: {
          label: currentFullDeviceName,
          lastSeen: Date.now(),
          isOwner: isOriginalOwner,
          role: livePapel === 'owner' ? 'owner' : (livePapel === 'judge' ? 'judge' : 'observer'),
          status: 'controller' as const,
          deviceType: getDeviceType(),
        },
      };
      // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId são imutáveis — NUNCA
      // sobrescrever com o deviceId de quem está ativando o mirroring (pode ser
      // um judge ou device secundário). Preserva os valores já gravados no gameState.
      const lockedOwnerDeviceId = gameState.ownerDeviceId || (isOriginalOwner ? deviceId : undefined);
      const lockedOwnerPin = gameState.ownerPin || userProfile.pin;
      const stateToSave = sanitizeForFirestore({
        ...gameState,
        isMirroringActive: true,
        commandOwner: currentFullDeviceName,
        commandOwnerId: deviceId,
        ownerDeviceId: lockedOwnerDeviceId,
        ownerPin: lockedOwnerPin,
        controllers: nextControllers,
        isLiveClosed: false,
      });
      if (stateToSave && targetPin && assertOwnerPin(targetPin, lockedOwnerPin?.toUpperCase(), 'toggleMirroring')) {
        setDoc(doc(db, 'live_matches', targetPin), stateToSave).catch(() => {});
      }
      void myPin;
    }

    // Owner que abre a live entra sempre em ScoreboardScreen (isScoreboardMode: false).
    if (active) {
      setMatchSettings(prev => ({ ...prev, isScoreboardMode: false }));
    }
    setGameState(p => p ? {
      ...p,
      isMirroringActive: active,
      isLiveClosed: false,
      commandOwnerId: active ? deviceId : p.commandOwnerId,
      matchConfig: { ...p.matchConfig, isScoreboardMode: active ? false : p.matchConfig.isScoreboardMode },
    } : null);
  };

  const handleConfirmMatch = async () => {
    // Ação remota — SOMENTE se live ativa
    if (gameState?.isMirroringActive) {
      const db = getDb();
      const targetPin = resolveTargetPin('write');
      if (db && targetPin && navigator.onLine) {
        try {
          await updateDoc(doc(db, 'live_matches', targetPin), {
            isConfirmedFinished: true,
            isMatchOver: true,
            matchEndedAt: Date.now(),
            isLiveClosed: true,
            isMirroringActive: false,
          });
          setTimeout(() => {
            deleteDoc(doc(db, 'live_matches', targetPin)).catch(() => {});
          }, 4000);
        } catch {}
      }
      setCloudLiveExists(false);
      setActiveLives(prev => prev.filter(l => l.ownerPin?.toUpperCase() !== targetPin));
      try { clearLiveOwnerPin(); } catch {}
    }

    // Ação local — SEMPRE executa (offline ou não)
    setGameState(p => p ? {
      ...p,
      isConfirmedFinished: true,
      isPaused: false,
      isMirroringActive: false,
      isLiveClosed: true,
    } : null);
    try { localStorage.removeItem('myPlacarActiveGameState'); } catch {}
  };

  return { handleToggleMirroring, handleConfirmMatch };
}
