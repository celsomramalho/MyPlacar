import React, { useEffect, useMemo, useRef } from 'react';
import { doc, onSnapshot, collection, query, where, updateDoc } from 'firebase/firestore';
import { Laptop, Smartphone, Tablet, Trophy, Watch, WifiOff } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { useGame } from '@modules/game';
import { useLive } from '../useLive.ts';
import { useUI } from '@modules/ui';
import type { ControllerRecord, GameState } from '../../../types.ts';
import type { LiveSubscriberParams } from '../types.ts';
import { isValidGameState } from '@modules/game/domain/validation';
import { getDeviceType, isWatchDevice } from '@shared/utils/device';
import {
  isJudgeForLive,
  shouldDiscardStaleWrite,
  reconcileIncomingGameState,
  reconcileClosedGameState,
  resolveMatchWinner,
  detectScoredTeamFromSnapshot,
} from '../domain/liveReconciliation.ts';

const CONNECTION_LOST_TITLE = 'Conexão perdida';
const LOCAL_CONNECTION_LOST_MESSAGE =
  'Este dispositivo ficou sem internet. A live pode parar de sincronizar até a conexão voltar.';

const renderDeviceIcon = (deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop') => {
  switch (deviceType) {
    case 'watch':
      return <Watch size={22} />;
    case 'tablet':
      return <Tablet size={22} />;
    case 'laptop':
      return <Laptop size={22} />;
    case 'phone':
    default:
      return <Smartphone size={22} />;
  }
};

/**
 * useLiveSubscriber
 * 
 * Responsável exclusivamente pelo CANAL DE ENTRADA (leitura/consumo) do Firestore:
 * 1. Ouvintes onSnapshot para o documento da partida e coleção de lives ativas.
 * 2. Suporte a visitantes em modo espectador / placar público (public-scoreboard).
 * 3. Reconciliação de estado recebido via snapshot com travas de segurança.
 * 4. Watchdog de presença remota e tolerância offline.
 * 5. Registro automático de observadores e overlay de entrada.
 */
export function useLiveSubscriber(params: LiveSubscriberParams): void {
  const { deviceId, currentFullDeviceName, initialSpectatorPin, markStateAsSent } = params;

  const {
    userProfile,
    matchSettings,
    setMatchSettings,
    gameState,
    setGameState,
    gameStateRef,
    handleObserveLive,
  } = useGame();

  const {
    activeLives,
    setActiveLives,
    cloudLiveExists,
    setCloudLiveExists,
    setFbSyncStatus,
    setLastFirebaseAckAt,
    tookControlAtRef,
    lostControlAtRef,
    isClosingLiveRef,
    isCommandOwner,
    livePapel,
  } = useLive();

  const {
    currentScreen,
    setCurrentScreen,
    setModalConfig,
    setShowLiveControlOverlay,
    setIsWaitingSync,
    overlayAcceptedRef,
  } = useUI();

  const lastObserverRegisterRef = useRef<number>(0);
  const overlayShownForLiveRef = useRef<string | null>(null);
  const autoJoinObserverRef = useRef<((pin: string) => void) | null>(null);
  const prevIsCommandOwner = useRef(isCommandOwner);
  const prevCommandOwnerIdWasSelf = useRef(gameState?.commandOwnerId === deviceId);
  const observerScoreboardAppliedKeyRef = useRef<string | null>(null);
  const lastConnectionAlertKeyRef = useRef<string | null>(null);
  const offlineAlertShownRef = useRef(false);

  useEffect(() => {
    autoJoinObserverRef.current = handleObserveLive;
  }, [handleObserveLive]);

  // ── Limpeza de estado stale no relógio na montagem ─────────────────────────
  useEffect(() => {
    if (!isWatchDevice()) return;
    const myPin = userProfile.pin?.toUpperCase();
    if (!myPin) return;
    const currentGs = gameStateRef.current;
    if (!currentGs?.isMirroringActive || currentGs.isLiveClosed) return;
    const ownerPinUpper = currentGs.ownerPin?.toUpperCase();
    const isMyLive = ownerPinUpper === myPin;
    const isJudge = isJudgeForLive(currentGs, myPin);
    if (!isMyLive && !isJudge) {
      console.log('[Watch] Estado stale de outra live detectado no início — limpando.', ownerPinUpper);
      setGameState(prev => (prev ? { ...prev, isMirroringActive: false, isLiveClosed: true } : null));
      setCloudLiveExists(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchSettingsRef = useRef(matchSettings);
  useEffect(() => {
    matchSettingsRef.current = matchSettings;
  }, [matchSettings]);

  // ── Cálculo reativo do PIN alvo do ouvinte ─────────────────────────────────
  const targetListenPin = useMemo(() => {
    const myPin = userProfile.pin?.toUpperCase();
    if (!myPin) return null;

    // Judge: escuta o documento do owner da live em que é juiz
    const judgeInLive = activeLives.find(l => isJudgeForLive(l, myPin));
    if (judgeInLive?.ownerPin) return judgeInLive.ownerPin.toUpperCase();

    // Owner ou device secundário do mesmo usuário
    const ownerOfLive = activeLives.find(
      l =>
        l.ownerPin?.toUpperCase() === myPin ||
        l.ownerDeviceId === deviceId ||
        (!l.ownerDeviceId && l.ownerPin?.toUpperCase() === myPin),
    );
    if (ownerOfLive?.ownerPin?.toUpperCase() === myPin || ownerOfLive?.ownerDeviceId === deviceId) {
      return myPin;
    }

    // Fallbacks locais
    const localGs = gameStateRef.current;
    if (localGs?.ownerDeviceId === deviceId) return myPin;
    if (localGs?.ownerPin?.toUpperCase() === myPin) return myPin;
    if (localGs?.ownerPin && isJudgeForLive(localGs, myPin)) return localGs.ownerPin.toUpperCase();

    // Fallback específico para relógio
    if (isWatchDevice() && localGs?.ownerPin && localGs.isMirroringActive && !localGs.isLiveClosed) {
      const localOwnerPinUpper = localGs.ownerPin.toUpperCase();
      if (localOwnerPinUpper === myPin || isJudgeForLive(localGs, myPin)) {
        return localOwnerPinUpper;
      }
    }

    return null;
  }, [activeLives, userProfile.pin, deviceId, gameStateRef]);

  // ── Listener dedicado para modo placar público (viewMode=scoreboard) ───────
  useEffect(() => {
    if (currentScreen !== 'public-scoreboard' || !initialSpectatorPin) return;
    const db = getDb();
    if (!db) return;
    const pin = initialSpectatorPin.toUpperCase();
    setIsWaitingSync(true);
    const unsubscribe = onSnapshot(doc(db, 'live_matches', pin), snap => {
      if (snap.exists()) {
        const cloudData = snap.data() as GameState;
        if (!isValidGameState(cloudData)) return;
        setCloudLiveExists(!cloudData.isLiveClosed);
        setGameState(
          prev =>
            ({
              ...(prev || {}),
              ...cloudData,
              isMirroringActive: true,
              isLiveClosed: Boolean(cloudData.isLiveClosed),
              matchConfig: {
                ...(prev?.matchConfig || {}),
                ...cloudData.matchConfig,
                isScoreboardMode: true,
              },
            }) as GameState,
        );
        setIsWaitingSync(false);
      } else {
        setCloudLiveExists(false);
        setIsWaitingSync(false);
      }
    });
    return () => unsubscribe();
  }, [currentScreen, initialSpectatorPin, setCloudLiveExists, setGameState, setIsWaitingSync]);

  // ── Listener principal do documento da live ativa ──────────────────────────
  useEffect(() => {
    if (!targetListenPin) return;
    if (currentScreen === 'public-scoreboard') return;
    const db = getDb();
    if (!db) return;

    const listenPin = targetListenPin;

    const subscribe = () => {
      if (!navigator.onLine) return () => {};
      return onSnapshot(doc(db, 'live_matches', listenPin), { includeMetadataChanges: true }, snap => {
        if (currentScreen === 'settings') return;
        if (snap.exists()) {
          const cloudData = snap.data() as GameState;

          if (!isValidGameState(cloudData)) {
            return;
          }
          if (!snap.metadata.hasPendingWrites && !snap.metadata.fromCache) {
            setLastFirebaseAckAt(Date.now());
            offlineAlertShownRef.current = false;
            setModalConfig(prev => {
              if (
                prev?.title === CONNECTION_LOST_TITLE &&
                prev.pulseAlert &&
                prev.message === LOCAL_CONNECTION_LOST_MESSAGE
              ) {
                return null;
              }
              return prev;
            });
          }

          if (cloudData.isLiveClosed) {
            isClosingLiveRef.current = false;

            console.log('[Sync] Live fechada detectada pelo Firestore!');
            setCloudLiveExists(false);
            setActiveLives(prev => prev.filter(l => (l.ownerPin?.toUpperCase() || '') !== listenPin));
            setGameState(prev => {
              const updated = reconcileClosedGameState(prev, cloudData);
              try {
                localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updated));
              } catch {}
              return updated;
            });

            const { winner, isMatchDone } = resolveMatchWinner(cloudData);
            if (isMatchDone) {
              setModalConfig({
                title: 'Partida encerrada 🏆',
                message: winner
                  ? `Vencedor: ${winner}\nA transmissão foi encerrada.`
                  : 'A partida foi encerrada e a transmissão foi finalizada.',
                icon: <Trophy className="text-yellow-500 w-16 h-16" />,
                confirmLabel: 'Ok',
                onConfirm: () => setModalConfig(null),
              });
            }
            return;
          }

          setCloudLiveExists(true);
          setActiveLives(prev => {
            const liveKey = cloudData.ownerPin?.toUpperCase() || listenPin;
            const nextLive = { ...cloudData, isMirroringActive: true, isLiveClosed: false };
            const existingIndex = prev.findIndex(
              live => (live.ownerPin?.toUpperCase() || '') === liveKey,
            );
            if (existingIndex === -1) return [...prev, nextLive];
            const next = [...prev];
            next[existingIndex] = nextLive;
            return next;
          });

          if (cloudData.commandOwnerId !== deviceId) {
            const justTookControl = Date.now() - tookControlAtRef.current < 15000;
            if (justTookControl) {
              console.log('[Sync] Snapshot com commandOwnerId antigo ignorado — grace period pós-takeControl.');
              return;
            }

            const controllerLeft = !cloudData.commandOwnerId;
            const currentGs = gameStateRef.current;
            const thisDeviceIsOwner = cloudData.ownerDeviceId === deviceId;
            const liveAlreadyActive = currentGs?.isMirroringActive === true;

            if (controllerLeft && thisDeviceIsOwner && liveAlreadyActive) {
              console.log('[Sync] commandOwnerId liberado pelo controller — ownerDevice reassumindo controle.');
              tookControlAtRef.current = Date.now();
              const db2 = getDb();
              if (db2) {
                updateDoc(doc(db2, 'live_matches', listenPin), {
                  commandOwnerId: deviceId,
                  commandOwner: matchSettingsRef.current.deviceLabel
                    ? `${matchSettingsRef.current.deviceLabel} - ${userProfile.nickname || userProfile.name?.split(' ')[0] || 'Dono'}`
                    : userProfile.nickname || userProfile.name?.split(' ')[0] || 'Dono',
                  [`controllers.${deviceId}`]: {
                    label: currentGs?.controllers?.[deviceId]?.label || deviceId,
                    nickname: userProfile.nickname || userProfile.name?.split(' ')[0],
                    lastSeen: Date.now(),
                    isOwner: true,
                    role: 'owner',
                    status: 'controller',
                    deviceType: getDeviceType(),
                  },
                }).catch(() => {});
              }
              setGameState(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  commandOwnerId: deviceId,
                  isMirroringActive: true,
                  isLiveClosed: false,
                };
              });
              setCurrentScreen('scoreboard');
              return;
            }

            if (currentGs?.commandOwnerId === deviceId) {
              lostControlAtRef.current = Date.now();
              const newControllerLabel = cloudData.commandOwner || 'outro dispositivo';
              setModalConfig({
                title: 'Controle transferido',
                message: `${newControllerLabel} assumiu o controle da partida.`,
                variant: 'info',
                onConfirm: () => setModalConfig(null),
              });
              setTimeout(() => setModalConfig(null), 2000);
            }

            const prevGs = gameStateRef.current;
            const scoreDelta = detectScoredTeamFromSnapshot(prevGs, cloudData);
            if (scoreDelta) {
              setFbSyncStatus({ ...scoreDelta, isObserver: true });
            }

            const localSettings = matchSettingsRef.current;
            setGameState(prev =>
              reconcileIncomingGameState({
                prevLocalState: prev,
                cloudData,
                deviceId,
                localSettings,
                isWatch: isWatchDevice(),
              })
            );

            markStateAsSent?.(cloudData);

            if (
              gameStateRef.current?.commandOwnerId === deviceId &&
              cloudData.commandOwnerId !== deviceId
            ) {
              setMatchSettings(prev => ({
                ...prev,
                isScoreboardMode: false,
                isWatchMode: isWatchDevice(),
              }));
            }
            if (
              isWatchDevice() &&
              gameStateRef.current?.commandOwnerId !== deviceId &&
              cloudData.commandOwnerId === deviceId
            ) {
              setMatchSettings(prev => ({ ...prev, isScoreboardMode: false, isWatchMode: true }));
            }
            setIsWaitingSync(false);
          } else {
            const cloudVersion = cloudData.liveVersion || 0;
            const localVersion = gameStateRef.current?.liveVersion || 0;
            if (shouldDiscardStaleWrite(cloudVersion, localVersion)) {
              console.log(`[Sync] Write stale ignorado — versão cloud: ${cloudVersion}, local: ${localVersion}`);
              return;
            }
            setGameState(prev => {
              if (!prev) return null;
              return {
                ...prev,
                controllers: cloudData.controllers,
                controllerHeartbeatAt: cloudData.controllerHeartbeatAt,
                controllerIdleMs: cloudData.controllerIdleMs,
                liveVersion: cloudData.liveVersion,
                judgePin: cloudData.judgePin,
                judgeNickname: cloudData.judgeNickname,
                ...(cloudData.judge ? { judge: cloudData.judge } : {}),
              };
            });
          }
        } else {
          const prevGs = gameStateRef.current;
          const wasActiveLocally = prevGs?.isMirroringActive && !prevGs?.isLiveClosed;

          isClosingLiveRef.current = false;
          setCloudLiveExists(false);
          setActiveLives(prev => prev.filter(l => (l.ownerPin?.toUpperCase() || '') !== listenPin));
          setGameState(prev => {
            if (!prev) return null;
            return { ...prev, isMirroringActive: false, isLiveClosed: true };
          });

          if (wasActiveLocally && !isWatchDevice()) {
            setModalConfig({
              title: 'Live encerrada',
              message: 'A transmissão foi encerrada pelo proprietário.',
              icon: <WifiOff className="text-slate-400 w-16 h-16" />,
              confirmLabel: 'Ok',
              onConfirm: () => setModalConfig(null),
            });
          }
        }
      });
    };

    let unsubscribe = subscribe();

    const handleOnline = () => {
      unsubscribe();
      unsubscribe = subscribe();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, [
    targetListenPin,
    deviceId,
    currentScreen,
    gameStateRef,
    isClosingLiveRef,
    setCloudLiveExists,
    setGameState,
    setModalConfig,
    setFbSyncStatus,
    setLastFirebaseAckAt,
    setMatchSettings,
    setIsWaitingSync,
    setActiveLives,
    tookControlAtRef,
    lostControlAtRef,
    userProfile.pin,
    userProfile.nickname,
    userProfile.name,
    markStateAsSent,
  ]);

  // ── Notificação ao perder controle ──────────────────────────────────────────
  useEffect(() => {
    const hadControl = prevCommandOwnerIdWasSelf.current;
    const hasControl = gameState?.commandOwnerId === deviceId;
    if (
      hadControl &&
      !hasControl &&
      gameState?.isMirroringActive &&
      !(gameState.isMirroringActive && gameState.isLiveClosed)
    ) {
      setShowLiveControlOverlay(false);
      setTimeout(() => {
        setModalConfig({
          title: 'Controle alterado',
          message:
            'Outro dispositivo assumiu o controle da transmissão. Você agora está no modo de observador.',
          confirmLabel: 'Ok',
          onConfirm: () => setModalConfig(null),
        });
      }, 100);
    }
    prevIsCommandOwner.current = isCommandOwner;
    prevCommandOwnerIdWasSelf.current = hasControl;
  }, [
    isCommandOwner,
    gameState?.commandOwnerId,
    gameState?.isMirroringActive,
    gameState?.isLiveClosed,
    deviceId,
    setShowLiveControlOverlay,
    setModalConfig,
  ]);

  // ── Listener de coleção: live_matches ativas ────────────────────────────────
  useEffect(() => {
    const db = getDb();
    if (!db) return;

    const subscribeToLives = () => {
      if (!navigator.onLine) {
        setActiveLives([]);
        return () => {};
      }
      const q = query(collection(db, 'live_matches'), where('isLiveClosed', '==', false));
      return onSnapshot(
        q,
        snap => {
          const lives: GameState[] = [];
          snap.forEach(d => lives.push(d.data() as GameState));
          setActiveLives(lives);
        },
        error => {
          console.error('Live listener error:', error);
        },
      );
    };

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToLives();
    } catch (e) {
      console.error('Failed to subscribe to lives:', e);
    }

    const handleOnline = () => {
      unsubscribe();
      unsubscribe = subscribeToLives();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, [setActiveLives]);

  // ── Debounce de 3s antes de desativar espelhamento se activeLives fica vazio ─
  useEffect(() => {
    const hasAnyLive = activeLives.length > 0;
    setCloudLiveExists(hasAnyLive);

    const justTookControlRecently = Date.now() - tookControlAtRef.current < 15000;

    if (!hasAnyLive && gameState?.isMirroringActive && !justTookControlRecently) {
      const debounceTimer = setTimeout(() => {
        if (Date.now() - tookControlAtRef.current < 15000) return;
        setGameState(prev => {
          if (!prev || !prev.isMirroringActive) return prev;
          return { ...prev, isMirroringActive: false, isLiveClosed: true };
        });
      }, 3000);
      return () => clearTimeout(debounceTimer);
    }
  }, [activeLives, gameState?.isMirroringActive, setCloudLiveExists, setGameState, tookControlAtRef]);

  // ── Registro automático como observador/juiz nos controllers ────────────────
  useEffect(() => {
    if (!userProfile.pin) return;
    const thisDeviceIsController = activeLives.some(l => l.commandOwnerId === deviceId);
    const hasLive = activeLives.length > 0;

    const thisDeviceIsOwner = activeLives.some(l => l.ownerDeviceId === deviceId);
    if (thisDeviceIsOwner) return;

    const myPin = userProfile.pin?.toUpperCase();
    const isSameUserSecondaryDevice =
      !isWatchDevice() &&
      activeLives.some(
        l => l.ownerPin?.toUpperCase() === myPin && l.ownerDeviceId && l.ownerDeviceId !== deviceId,
      );
    if (isSameUserSecondaryDevice) return;

    if (!thisDeviceIsController && hasLive && navigator.onLine && userProfile.email) {
      const now = Date.now();
      if (now - lastObserverRegisterRef.current < 60000) return;
      const db = getDb();
      if (db) {
        const observerLive = activeLives.find(
          l => l.ownerPin?.toUpperCase() === myPin || isJudgeForLive(l, myPin),
        );
        const ownerPin = observerLive?.ownerPin?.toUpperCase();
        if (ownerPin) {
          const myPinUpper = userProfile.pin?.toUpperCase();
          const myNickname = userProfile.nickname || userProfile.name?.split(' ')[0] || 'Observador';
          const isJudgeDevice = activeLives.some(l => isJudgeForLive(l, myPinUpper));
          const deviceRole: 'judge' | 'observer' = isJudgeDevice ? 'judge' : 'observer';
          lastObserverRegisterRef.current = now;

          updateDoc(doc(db, 'live_matches', ownerPin), {
            [`controllers.${deviceId}`]: {
              label: currentFullDeviceName,
              nickname: myNickname,
              lastSeen: now,
              role: deviceRole,
              status: 'watcher',
              deviceType: getDeviceType(),
            },
          }).catch(err => {
            const errMsg = err?.message || String(err);
            if (!errMsg.includes('No document to update')) {
              localStorage.setItem('myPlacar_last_firebase_error', `reg: ${errMsg}`);
            }
          });
        }
      }
    }
  }, [
    activeLives,
    userProfile.pin,
    userProfile.email,
    userProfile.nickname,
    userProfile.name,
    gameState?.isMirroringActive,
    deviceId,
    currentFullDeviceName,
  ]);

  // ── Auto-overlay / auto-join para dispositivos autorizados ──────────────────
  useEffect(() => {
    if (!userProfile.pin || !userProfile.email) return;
    const myPin = userProfile.pin.toUpperCase();

    const thisDeviceIsControllerInCloud = activeLives.some(l => l.commandOwnerId === deviceId);
    const thisDeviceIsControllerLocal = gameState?.commandOwnerId === deviceId;
    if (thisDeviceIsControllerInCloud || thisDeviceIsControllerLocal) return;

    const justTookControl = Date.now() - tookControlAtRef.current < 15000;
    if (justTookControl) return;

    const authorizedLives = activeLives.filter(
      l => l.ownerPin?.toUpperCase() === myPin || isJudgeForLive(l, myPin),
    );

    if (authorizedLives.length > 0) {
      const observerLive = authorizedLives.reduce((latest, l) =>
        (l.liveSessionCounter || 0) > (latest.liveSessionCounter || 0) ? l : latest,
      );
      const liveId = observerLive.ownerPin?.toUpperCase() || '';

      if (liveId && overlayAcceptedRef.current === liveId) return;
      if (liveId && overlayShownForLiveRef.current === liveId) return;
      overlayShownForLiveRef.current = liveId;

      const thisDeviceIsOwner =
        observerLive.ownerDeviceId === deviceId ||
        (!observerLive.ownerDeviceId &&
          observerLive.ownerPin?.toUpperCase() === myPin &&
          observerLive.commandOwnerId === deviceId);
      if (thisDeviceIsOwner) return;

      const isSameUserOtherDevice =
        observerLive.ownerPin?.toUpperCase() === myPin &&
        (isWatchDevice()
          ? observerLive.ownerDeviceId !== deviceId
          : (observerLive.ownerDeviceId && observerLive.ownerDeviceId !== deviceId) ||
            (!observerLive.ownerDeviceId &&
              observerLive.commandOwnerId &&
              observerLive.commandOwnerId !== deviceId));

      const isNamedJudge = isJudgeForLive(observerLive, myPin);

      if (isSameUserOtherDevice || isNamedJudge) {
        overlayAcceptedRef.current = liveId;
        setTimeout(() => autoJoinObserverRef.current?.(liveId), isSameUserOtherDevice ? 2000 : 0);
        return;
      }

      setShowLiveControlOverlay(true);
    }

    if (authorizedLives.length === 0 && !isWatchDevice()) {
      overlayShownForLiveRef.current = null;
      overlayAcceptedRef.current = null;
      setShowLiveControlOverlay(false);
    }
  }, [
    activeLives,
    userProfile.pin,
    userProfile.email,
    deviceId,
    gameState?.commandOwnerId,
    currentScreen,
    overlayAcceptedRef,
    setShowLiveControlOverlay,
    tookControlAtRef,
  ]);

  // ── Alerta de tolerância offline (60s) ───────────────────────────────────────
  useEffect(() => {
    let offlineTimeout: ReturnType<typeof setTimeout> | null = null;

    const showOfflineAlert = () => {
      if (!gameStateRef.current?.isMirroringActive) return;
      if (offlineAlertShownRef.current) return;
      offlineAlertShownRef.current = true;
      setModalConfig({
        title: CONNECTION_LOST_TITLE,
        message: LOCAL_CONNECTION_LOST_MESSAGE,
        icon: <WifiOff className="text-orange-500 w-16 h-16" />,
        variant: 'info',
        pulseAlert: true,
        onConfirm: () => setModalConfig(null),
      });
    };

    const handleOffline = () => {
      if (offlineTimeout) clearTimeout(offlineTimeout);
      offlineTimeout = setTimeout(showOfflineAlert, 60000);
    };

    const clearOfflineAlert = () => {
      if (offlineTimeout) {
        clearTimeout(offlineTimeout);
        offlineTimeout = null;
      }
      offlineAlertShownRef.current = false;
      setModalConfig(prev => {
        if (
          prev?.title === CONNECTION_LOST_TITLE &&
          prev.pulseAlert &&
          prev.message === LOCAL_CONNECTION_LOST_MESSAGE
        ) {
          return null;
        }
        return prev;
      });
    };

    globalThis.addEventListener('offline', handleOffline);
    globalThis.addEventListener('online', clearOfflineAlert);
    if (!navigator.onLine) handleOffline();

    return () => {
      if (offlineTimeout) clearTimeout(offlineTimeout);
      globalThis.removeEventListener('offline', handleOffline);
      globalThis.removeEventListener('online', clearOfflineAlert);
    };
  }, [setModalConfig, gameStateRef]);

  // ── Watchdog de presença remota (alerta se controller parar de responder) ───
  useEffect(() => {
    const clearConnectionAlert = () => {
      setModalConfig(prev => {
        if (
          prev?.title === CONNECTION_LOST_TITLE &&
          prev.pulseAlert &&
          typeof prev.message === 'string' &&
          prev.message.includes('parou de responder')
        ) {
          return null;
        }
        return prev;
      });
    };

    if (!userProfile.pin || !userProfile.email) return;
    if (!cloudLiveExists && !gameState?.isMirroringActive) {
      lastConnectionAlertKeyRef.current = null;
      clearConnectionAlert();
      return;
    }
    if (gameState?.isLiveClosed) {
      lastConnectionAlertKeyRef.current = null;
      clearConnectionAlert();
      return;
    }

    const checkRemotePresence = () => {
      const now = Date.now();
      const currentGs = gameStateRef.current;
      if (currentGs?.isLiveClosed) {
        lastConnectionAlertKeyRef.current = null;
        clearConnectionAlert();
        return;
      }

      const activeLiveEntries = activeLives.filter(
        liveEntry => liveEntry.isMirroringActive && !liveEntry.isLiveClosed,
      );
      if (activeLiveEntries.length === 0) {
        lastConnectionAlertKeyRef.current = null;
        clearConnectionAlert();
        return;
      }

      const live =
        currentGs?.isMirroringActive &&
        !currentGs.isLiveClosed &&
        activeLiveEntries.some(
          liveEntry => liveEntry.ownerPin?.toUpperCase() === currentGs.ownerPin?.toUpperCase(),
        )
          ? currentGs
          : activeLiveEntries.find(
              l => l.ownerPin?.toUpperCase() === currentGs?.ownerPin?.toUpperCase(),
            ) ||
            activeLiveEntries.find(
              l => l.ownerPin?.toUpperCase() === userProfile.pin?.toUpperCase(),
            );

      if (!live?.isMirroringActive || live.isLiveClosed) {
        lastConnectionAlertKeyRef.current = null;
        clearConnectionAlert();
        return;
      }

      const controllers = live.controllers || {};
      const entries = Object.entries(controllers).filter(
        ([id, controller]) => id !== deviceId && typeof controller?.lastSeen === 'number',
      ) as Array<[string, ControllerRecord]>;
      const staleAfterMs = 70000;

      const commandOwnerEntry =
        live.commandOwnerId && live.commandOwnerId !== deviceId
          ? entries.find(([id]) => id === live.commandOwnerId)
          : undefined;

      const staleCommandOwner =
        commandOwnerEntry && now - commandOwnerEntry[1].lastSeen > staleAfterMs
          ? commandOwnerEntry
          : undefined;

      const staleCounterpart =
        staleCommandOwner ||
        (isWatchDevice()
          ? entries.find(
              ([, controller]) =>
                (controller.isOwner || controller.role === 'owner') &&
                now - controller.lastSeen > staleAfterMs,
            )
          : entries.find(
              ([, controller]) =>
                controller.deviceType === 'watch' && now - controller.lastSeen > staleAfterMs,
            ));

      if (!staleCounterpart) {
        lastConnectionAlertKeyRef.current = null;
        clearConnectionAlert();
        return;
      }

      const [staleDeviceId, controller] = staleCounterpart;
      const alertKey = `${live.ownerPin || 'live'}:${staleDeviceId}:${Math.floor(controller.lastSeen / staleAfterMs)}`;
      if (lastConnectionAlertKeyRef.current === alertKey) return;

      if (globalThis.sessionStorage.getItem(`confirmed_lost_presence_${alertKey}`)) return;

      lastConnectionAlertKeyRef.current = alertKey;
      const deviceLabel =
        controller.nickname || controller.label || (isWatchDevice() ? 'celular' : 'relógio');

      setModalConfig({
        title: CONNECTION_LOST_TITLE,
        message: (
          <span className="flex flex-wrap items-center justify-center gap-2">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-slate-100 shadow-sm"
              title={controller.deviceType || 'phone'}
            >
              {renderDeviceIcon(controller.deviceType)}
            </span>
            <span>
              {deviceLabel} parou de responder. Aproxime os dispositivos ou confira Bluetooth/internet antes de continuar a live.
            </span>
          </span>
        ),
        icon: <WifiOff className="text-orange-500 w-16 h-16" />,
        variant: 'info',
        pulseAlert: true,
        onConfirm: () => {
          try {
            globalThis.sessionStorage.setItem(`confirmed_lost_presence_${alertKey}`, '1');
          } catch {}
          setModalConfig(null);
        },
      });
    };

    checkRemotePresence();
    const interval = setInterval(checkRemotePresence, 5000);
    return () => clearInterval(interval);
  }, [
    activeLives,
    cloudLiveExists,
    deviceId,
    gameState?.isMirroringActive,
    gameState?.isLiveClosed,
    gameStateRef,
    setModalConfig,
    userProfile.email,
    userProfile.pin,
  ]);

  // ── Observer: entra em modo placar por padrão a cada nova live ───────────────
  useEffect(() => {
    const observerLiveKey = targetListenPin || gameState?.ownerPin || null;
    const thisDeviceIsController =
      gameState?.commandOwnerId === deviceId || activeLives.some(l => l.commandOwnerId === deviceId);

    if (livePapel === 'observer' && !thisDeviceIsController && cloudLiveExists && observerLiveKey) {
      if (observerScoreboardAppliedKeyRef.current === observerLiveKey) return;
      observerScoreboardAppliedKeyRef.current = observerLiveKey;
      const watchObserver = isWatchDevice();
      setMatchSettings(prev => ({
        ...prev,
        isWatchMode: watchObserver,
        isScoreboardMode: false,
      }));
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          matchConfig: {
            ...prev.matchConfig,
            isWatchMode: watchObserver,
            isScoreboardMode: false,
          },
        };
      });
    }

    if (livePapel !== 'observer' || thisDeviceIsController || !cloudLiveExists) {
      observerScoreboardAppliedKeyRef.current = null;
    }
  }, [
    activeLives,
    cloudLiveExists,
    deviceId,
    gameState?.commandOwnerId,
    gameState?.ownerPin,
    livePapel,
    setMatchSettings,
    setGameState,
    targetListenPin,
  ]);
}
