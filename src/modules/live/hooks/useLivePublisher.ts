import { useCallback, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { getDb } from '@infra/firebase';
import { useGame } from '@modules/game';
import { useLive } from '../useLive.ts';
import type { GameState } from '../../../types.ts';
import type { LivePublisherParams, LivePublisherReturn } from '../types.ts';
import { getDeviceType } from '@shared/utils/device';
import { sanitizeForFirestore } from '@shared/utils/sanitize';
import {
  hasMatchStateChanged,
  hasConfigChanged,
  isJudgeForLive,
} from '../domain/liveReconciliation.ts';

/**
 * useLivePublisher
 * 
 * Responsável exclusivamente pelo CANAL DE SAÍDA (escrita) para o Firestore:
 * 1. Envio de deltas de placar e configurações pelo controlador ativo (juiz/dono).
 * 2. Controle de versão incremental (liveVersion) para proteção anti-concorrência.
 * 3. Heartbeats periódicos de presença (controlador, juiz, dono e observador).
 * 4. Detecção e notificação de pontuação para o indicador visual FB Sync.
 * 5. Persistência local no localStorage.
 */
export function useLivePublisher(params: LivePublisherParams): LivePublisherReturn {
  const { deviceId, currentFullDeviceName, lastSentStateRef: externalLastSentStateRef } = params;

  const {
    userProfile,
    gameState,
    setGameState,
    gameStateRef,
  } = useGame();

  const {
    activeLives,
    setActiveLives,
    setCloudLiveExists,
    fbSyncStatus,
    setFbSyncStatus,
    lastFbScoreKeyRef,
    fbSyncTimerRef,
    isOriginalOwner,
    resolveTargetPin,
    livePapel,
  } = useLive();

  const internalLastSentStateRef = useRef<string>('');
  const lastSentStateRef = externalLastSentStateRef || internalLastSentStateRef;

  const lastSyncTimeRef = useRef<number>(0);
  const lastSeenUpdateRef = useRef<number>(0);
  const lastPointActivityAtRef = useRef<number>(Date.now());
  const lastControllerHeartbeatAtRef = useRef<number>(0);

  const markStateAsSent = useCallback((state: GameState) => {
    try {
      lastSentStateRef.current = JSON.stringify(sanitizeForFirestore(state));
    } catch {}
  }, [lastSentStateRef]);

  // Atualiza timestamp da última atividade de pontuação
  useEffect(() => {
    lastPointActivityAtRef.current = Date.now();
  }, [gameState?.matchId, gameState?.pointHistory?.length]);

  // ── Heartbeats periódicos de presença (a cada 15s) ──────────────────────────
  useEffect(() => {
    if (!userProfile.pin || !navigator.onLine) return;
    const db = getDb();
    if (!db) return;
    const myPin = userProfile.pin.toUpperCase();
    const myNickname = userProfile.nickname || userProfile.name?.split(' ')[0];

    const interval = setInterval(async () => {
      const now = Date.now();
      const myDeviceType = getDeviceType();
      const currentGs = gameStateRef.current;

      // 1. Controller heartbeat
      // Se o controlador fica mais de 15s sem pontuar, ainda assim renova presença
      const isControllerLive =
        currentGs?.isMirroringActive &&
        !currentGs.isLiveClosed &&
        currentGs.commandOwnerId === deviceId;
      const controllerIdleMs = now - lastPointActivityAtRef.current;
      const canSendControllerHeartbeat =
        isControllerLive &&
        controllerIdleMs >= 15000 &&
        now - lastControllerHeartbeatAtRef.current >= 15000;

      if (canSendControllerHeartbeat) {
        const targetPin = resolveTargetPin('controller-heartbeat');
        if (targetPin) {
          const isFormalJudge = Boolean(
            currentGs &&
            myPin &&
            (currentGs.judge?.pin?.toUpperCase() === myPin || currentGs.judgePin?.toUpperCase() === myPin)
          );
          const controllerRole: 'owner' | 'judge' | 'observer' =
            currentGs?.ownerDeviceId === deviceId ? 'owner' : isFormalJudge ? 'judge' : 'observer';
          try {
            await updateDoc(doc(db, 'live_matches', targetPin), {
              [`controllers.${deviceId}`]: {
                label: currentFullDeviceName,
                nickname: myNickname,
                lastSeen: now,
                isOwner: controllerRole === 'owner',
                role: controllerRole,
                status: 'controller',
                deviceType: myDeviceType,
              },
              controllerHeartbeatAt: now,
              controllerIdleMs,
              lastActivityAt: now,
            });
            lastControllerHeartbeatAtRef.current = now;
            lastSeenUpdateRef.current = now;
          } catch {}
        }
      }

      // 2. Judge heartbeat
      const judgeMatches = activeLives.filter(l => isJudgeForLive(l, myPin));
      for (const match of judgeMatches) {
        if (match.ownerPin) {
          const docRef = doc(db, 'live_matches', match.ownerPin.toUpperCase());
          const judgeIsActive = match.commandOwnerId === deviceId;
          try {
            await updateDoc(docRef, {
              [`controllers.${deviceId}`]: {
                label: currentFullDeviceName,
                nickname: myNickname,
                lastSeen: now,
                role: 'judge',
                status: judgeIsActive ? 'controller' : 'watcher',
                deviceType: myDeviceType,
              },
              'judge.isActive': judgeIsActive,
              lastActivityAt: now,
            });
          } catch {}
        }
      }

      // 3. Owner heartbeat (quando NÃO é o controller ativo)
      const ownerMatch = activeLives.find(l =>
        l.ownerDeviceId === deviceId ||
        (!l.ownerDeviceId && l.ownerPin?.toUpperCase() === myPin)
      );
      const isOwnerControlling = ownerMatch?.commandOwnerId === deviceId;
      if (ownerMatch && !isOwnerControlling) {
        const docRef = doc(db, 'live_matches', myPin);
        try {
          await updateDoc(docRef, {
            [`controllers.${deviceId}`]: {
              label: currentFullDeviceName,
              nickname: myNickname,
              lastSeen: now,
              isOwner: true,
              role: 'owner',
              status: 'watcher',
              deviceType: myDeviceType,
            },
            ownerHeartbeatAt: now,
            lastActivityAt: now,
          });
        } catch {}
      }

      // 4. Observer heartbeat
      const isObserving =
        currentGs?.isMirroringActive &&
        !currentGs?.isLiveClosed &&
        currentGs?.commandOwnerId !== deviceId;

      if (isObserving) {
        const observerLivePin = currentGs?.ownerPin?.toUpperCase();
        const alreadyCovered =
          judgeMatches.some(m => m.ownerPin?.toUpperCase() === observerLivePin) ||
          (ownerMatch && ownerMatch.ownerPin?.toUpperCase() === observerLivePin);

        if (observerLivePin && !alreadyCovered) {
          const docRef = doc(db, 'live_matches', observerLivePin);
          const isFormalJudge = Boolean(
            myPin &&
            (currentGs.judge?.pin?.toUpperCase() === myPin || currentGs.judgePin?.toUpperCase() === myPin)
          );
          const heartbeatRole: 'owner' | 'judge' | 'observer' =
            currentGs.ownerDeviceId === deviceId ? 'owner' : isFormalJudge ? 'judge' : 'observer';
          try {
            await updateDoc(docRef, {
              [`controllers.${deviceId}`]: {
                label: currentFullDeviceName,
                nickname: myNickname,
                lastSeen: now,
                isOwner: heartbeatRole === 'owner',
                role: heartbeatRole,
                status: 'watcher',
                deviceType: myDeviceType,
              },
              observerHeartbeatAt: now,
              lastActivityAt: now,
            });
          } catch {}
        }
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [
    activeLives,
    userProfile.pin,
    userProfile.name,
    userProfile.nickname,
    deviceId,
    currentFullDeviceName,
    gameStateRef,
    resolveTargetPin,
  ]);

  // ── Envio de deltas do controlador para o Firestore ─────────────────────────
  useEffect(() => {
    if (!gameState) return;

    try {
      localStorage.setItem('myPlacarActiveGameState', JSON.stringify(gameState));
    } catch {}

    if (
      !gameState.isMirroringActive ||
      !userProfile.email ||
      (gameState.isMirroringActive && gameState.isLiveClosed) ||
      !navigator.onLine
    ) {
      return;
    }

    const isThisDeviceController = gameState.commandOwnerId === deviceId;
    if (!isThisDeviceController) {
      return;
    }

    const db = getDb();
    if (!db) return;

    const now = Date.now();
    const prevStateStr = lastSentStateRef.current;
    const prevState: GameState | null = prevStateStr ? JSON.parse(prevStateStr) : null;

    const isMatchStateChange = hasMatchStateChanged(prevState, gameState);
    const isConfigChange = hasConfigChanged(prevState, gameState);
    const isCriticalChange = isMatchStateChange || isConfigChange;
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    const shouldSync = isCriticalChange || timeSinceLastSync > 10000;

    if (!shouldSync) return;

    const controllerRole: 'owner' | 'judge' | 'observer' =
      livePapel === 'owner' ? 'owner' : (livePapel === 'judge' ? 'judge' : 'observer');
    const myDeviceType = getDeviceType();
    const shouldUpdateLastSeen = isMatchStateChange || now - lastSeenUpdateRef.current > 30000;

    const stateToSave = sanitizeForFirestore({
      ...gameState,
      controllers: undefined, // T4.1: presença gerenciada via field-path
      liveVersion: (gameState.liveVersion || 0) + 1, // T4.2: versionamento
      ...(isMatchStateChange ? { controllerHeartbeatAt: now, controllerIdleMs: 0 } : {}),
      // Imutáveis: preserva os valores originais independente do estado corrente
      ownerPin: gameState.ownerPin,
      ownerDeviceId: gameState.ownerDeviceId,
    });

    if (!stateToSave) return;

    const strState = JSON.stringify(stateToSave);
    if (strState === lastSentStateRef.current) return;

    lastSentStateRef.current = strState;
    lastSyncTimeRef.current = now;

    const targetPin = resolveTargetPin('write');
    if (!targetPin) return;

    const presenceRecord = shouldUpdateLastSeen
      ? {
          label: currentFullDeviceName,
          nickname: userProfile.nickname || userProfile.name?.split(' ')[0],
          lastSeen: now,
          isOwner: isOriginalOwner,
          role: controllerRole,
          status: 'controller' as const,
          deviceType: myDeviceType,
        }
      : null;

    // Write principal: placar + presença do controlador
    updateDoc(doc(db, 'live_matches', targetPin), {
      ...stateToSave,
      ...(presenceRecord ? { [`controllers.${deviceId}`]: presenceRecord } : {}),
      lastActivityAt: Date.now(),
    }).catch((err: any) => {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('No document to update') || err?.code === 'not-found') {
        console.log('[Publisher] Live não existe mais no Firestore — limpando estado local.');
        setCloudLiveExists(false);
        setActiveLives(prev => prev.filter(l => (l.ownerPin?.toUpperCase() || '') !== targetPin));
        setGameState(prev => (prev ? { ...prev, isMirroringActive: false, isLiveClosed: true } : null));
      }
    });

    // FB badge — detecta qual time marcou para exibir indicador verde no controller
    const curScoreKey = `${gameState.p1.score}_${gameState.p1.games}_${gameState.p2.score}_${gameState.p2.games}`;
    if (
      isMatchStateChange &&
      lastFbScoreKeyRef.current &&
      lastFbScoreKeyRef.current !== curScoreKey
    ) {
      const parts = lastFbScoreKeyRef.current.split('_');
      const prevP1Games = parseInt(parts[1], 10);
      const prevP2Games = parseInt(parts[3], 10);
      const p1Scored =
        gameState.p1.games > prevP1Games ||
        (gameState.p1.games === prevP1Games && gameState.p1.score !== parts[0]);
      const p2Scored =
        gameState.p2.games > prevP2Games ||
        (gameState.p2.games === prevP2Games && gameState.p2.score !== parts[2]);

      const pointSeq = gameState.pointHistory?.length ?? 0;
      if (p1Scored && !p2Scored) {
        setFbSyncStatus({ team: 1, seq: pointSeq, isObserver: false });
      } else if (p2Scored && !p1Scored) {
        setFbSyncStatus({ team: 2, seq: pointSeq, isObserver: false });
      }
    }
    lastFbScoreKeyRef.current = curScoreKey;

    // T4.1 — Atualização de presença via field-path
    if (presenceRecord) {
      updateDoc(doc(db, 'live_matches', targetPin), {
        [`controllers.${deviceId}`]: presenceRecord,
        ...(isMatchStateChange ? { controllerHeartbeatAt: now, controllerIdleMs: 0 } : {}),
        lastActivityAt: Date.now(),
      }).catch(() => {});
      lastSeenUpdateRef.current = now;
    }
  }, [
    gameState,
    userProfile.pin,
    userProfile.email,
    userProfile.name,
    userProfile.nickname,
    currentFullDeviceName,
    deviceId,
    activeLives,
    isOriginalOwner,
    resolveTargetPin,
    lastFbScoreKeyRef,
    lastSentStateRef,
    setFbSyncStatus,
    setActiveLives,
    setCloudLiveExists,
    setGameState,
    livePapel,
  ]);

  // ── Auto-clear do fbSyncStatus após 2.5s ────────────────────────────────────
  useEffect(() => {
    if (!fbSyncStatus) return;
    if (fbSyncTimerRef.current) clearTimeout(fbSyncTimerRef.current);
    fbSyncTimerRef.current = setTimeout(() => setFbSyncStatus(null), 2500);
    return () => {
      if (fbSyncTimerRef.current) clearTimeout(fbSyncTimerRef.current);
    };
  }, [fbSyncStatus, fbSyncTimerRef, setFbSyncStatus]);

  return {
    lastSentStateRef,
    markStateAsSent,
  };
}
