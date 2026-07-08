import { useEffect, useMemo, useRef } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Trophy, WifiOff } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { useGame } from '@modules/game';
import { useLive } from '../useLive.ts';
import { useUI } from '@modules/ui';
import type { ControllerRecord, GameState } from '@game/types';
import { isValidGameState } from '@modules/game/domain/validation';
import { getDeviceType, isWatchDevice } from '@shared/utils/device';
import { sanitizeForFirestore } from '@shared/utils/sanitize';


export function useLiveFirestoreSync(params: {
  deviceId: string;
  currentFullDeviceName: string;
  initialSpectatorPin: string | null;
}) {
  const { deviceId, currentFullDeviceName, initialSpectatorPin } = params;

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
    fbSyncStatus,
    setFbSyncStatus,
    setLastFirebaseAckAt,
    tookControlAtRef,
    lostControlAtRef,
    isClosingLiveRef,
    lastFbScoreKeyRef,
    fbSyncTimerRef,
    isOriginalOwner,
    isCommandOwner,
    resolveTargetPin,
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

  const lastSentStateRef = useRef<string>('');
  const lastSeenUpdateRef = useRef<number>(0);
  const lastSyncTimeRef = useRef<number>(0);
  const lastObserverRegisterRef = useRef<number>(0);
  const overlayShownForLiveRef = useRef<string | null>(null);
  const autoJoinObserverRef = useRef<((pin: string) => void) | null>(null);
  const prevIsCommandOwner = useRef(isCommandOwner);
  const prevCommandOwnerIdWasSelf = useRef(gameState?.commandOwnerId === deviceId);
  const observerScoreboardAppliedKeyRef = useRef<string | null>(null);
  const lastConnectionAlertKeyRef = useRef<string | null>(null);
  const offlineAlertShownRef = useRef(false);
  const lastPointActivityAtRef = useRef(Date.now());
  const lastControllerHeartbeatAtRef = useRef(0);

  const isJudgeForLive = (live: GameState, pin?: string | null) => {
    const normalizedPin = pin?.toUpperCase();
    if (!normalizedPin) return false;
    return (
      live.judgePin?.toUpperCase() === normalizedPin ||
      live.judge?.pin?.toUpperCase() === normalizedPin
    );
  };

  useEffect(() => {
    autoJoinObserverRef.current = handleObserveLive;
  }, [handleObserveLive]);

  useEffect(() => {
    lastPointActivityAtRef.current = Date.now();
  }, [gameState?.matchId, gameState?.pointHistory?.length]);

  // ── Limpeza de estado stale no relógio ───────────────────────────────────────
  // Roda uma única vez na montagem. Se o relógio restaurou do localStorage um
  // gameState com isMirroringActive:true apontando para a live de OUTRO usuário
  // (ownerPin ≠ PIN logado e relógio não é juiz dessa live), limpa imediatamente.
  // Sem isso, o targetListenPin ficaria escutando um documento inexistente e o
  // onSnapshot dispararia !snap.exists() em loop até o documento correto aparecer.
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
      setGameState(prev => prev ? { ...prev, isMirroringActive: false, isLiveClosed: true } : null);
      setCloudLiveExists(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intencional: roda apenas na montagem

  // Ref espelho de matchSettings — permite que o callback do onSnapshot leia
  // config locais atualizadas sem precisar de matchSettings no dep array,
  // evitando o resubscribe do listener a cada mudança de setting.
  const matchSettingsRef = useRef(matchSettings);
  useEffect(() => {
    matchSettingsRef.current = matchSettings;
  }, [matchSettings]);

  // T3.1: PIN alvo do listener calculado de forma reativa (depende de activeLives).
  // Quando o judge é adicionado em tempo real, activeLives atualiza e o memo recalcula,
  // fazendo o useEffect do listener ser recriado com o PIN correto — sem closure stale.
  // Usa activeLives (state, não ref) para garantir reatividade.
  const targetListenPin = useMemo(() => {
    const myPin = userProfile.pin?.toUpperCase();
    if (!myPin) return null;

    // Judge: escuta o documento do owner da live em que é juiz
    const judgeInLive = activeLives.find(l => isJudgeForLive(l, myPin));
    if (judgeInLive?.ownerPin) return judgeInLive.ownerPin.toUpperCase();

    // Owner ou device secundário do mesmo usuário: só escuta live do próprio PIN logado.
    const ownerOfLive = activeLives.find(
      l =>
        l.ownerPin?.toUpperCase() === myPin ||
        l.ownerDeviceId === deviceId ||
        // Fallback para lives antigas sem ownerDeviceId gravado
        (!l.ownerDeviceId && l.ownerPin?.toUpperCase() === myPin),
    );
    if (ownerOfLive?.ownerPin?.toUpperCase() === myPin || ownerOfLive?.ownerDeviceId === deviceId) return myPin;

    // Fallback: ownerPin já gravado no gameState local (cobre latência do onSnapshot da collection).
    // Só usa se for o próprio PIN logado ou live onde o usuário logado é juiz.
    const localGs = gameStateRef.current;
    if (localGs?.ownerDeviceId === deviceId) return myPin;
    if (localGs?.ownerPin?.toUpperCase() === myPin) return myPin;
    if (localGs?.ownerPin && isJudgeForLive(localGs, myPin)) return localGs.ownerPin.toUpperCase();

    // Fallback específico para relógio: quando activeLives ainda não carregou do Firestore
    // mas o estado local restaurado tem uma live ativa com ownerPin do usuário logado,
    // usa esse PIN para manter o listener ativo durante a latência inicial.
    // Sem esse fallback, o relógio ficaria sem listener (targetListenPin = null) até o
    // onSnapshot da collection retornar, o que abre janela para desconexões.
    if (isWatchDevice() && localGs?.ownerPin && localGs.isMirroringActive && !localGs.isLiveClosed) {
      const localOwnerPinUpper = localGs.ownerPin.toUpperCase();
      if (localOwnerPinUpper === myPin || isJudgeForLive(localGs, myPin)) {
        return localOwnerPinUpper;
      }
    }

    return null;
  }, [activeLives, userProfile.pin, deviceId, gameStateRef]);

  // ── Listener dedicado para modo placar público (viewMode=scoreboard) ──────────
  // Visitantes sem login não têm userProfile.pin, então targetListenPin seria null.
  // Este useEffect escuta diretamente o PIN da URL e alimenta o gameState.
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
              isLiveClosed: !!cloudData.isLiveClosed,
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

  useEffect(() => {
    if (!targetListenPin) return;
    // Visitante público tem seu próprio listener dedicado — não usar o listener principal
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
          }

        if (cloudData.isLiveClosed) {
          // Guard: se este device é o owner ativo da live, ignora isLiveClosed: true
          // vindo do Firebase — é quase certamente um artefato do próprio reload/reconnect.
          // Usa ownerDeviceId (fixo) para identificar o dono, não commandOwnerId.
          const currentGs = gameStateRef.current;
          const thisDeviceIsActiveOwner =
            currentGs?.isMirroringActive &&
            (currentGs?.ownerDeviceId === deviceId ||
              // fallback para lives sem ownerDeviceId
              (currentGs?.commandOwnerId === deviceId &&
                currentGs?.ownerPin?.toUpperCase() === userProfile.pin?.toUpperCase()));

          // Só ignora o isLiveClosed se NÃO foi este device que iniciou o encerramento.
          // isClosingLiveRef é marcado true em handleCloseCloudLive antes do updateDoc,
          // garantindo que o owner não ignore o próprio sinal de encerramento.
          if (thisDeviceIsActiveOwner && !isClosingLiveRef.current) {
            console.log(
              '[Sync] isLiveClosed: true ignorado — owner ativo local, provável artefato de reload.',
            );
            return;
          }
          // Encerramento intencional confirmado — reset do ref.
          isClosingLiveRef.current = false;

          console.log('[Sync] Live fechada detected!');
          setCloudLiveExists(false);
          setGameState(prev => {
            if (!prev) return null;
            return {
              ...prev,
              isMirroringActive: false,
              isLiveClosed: true,
              isConfirmedFinished: cloudData.isConfirmedFinished || prev.isConfirmedFinished,
            };
          });

          // E1: notifica observers/juiz sobre encerramento da partida
          const isMatchDone = cloudData.isConfirmedFinished || cloudData.isMatchOver;
          if (isMatchDone) {
            const p1Name = cloudData.p1?.name || 'Jogador 1';
            const p2Name = cloudData.p2?.name || 'Jogador 2';
            const p1SetsWon = (cloudData.p1?.sets || []).filter(
              (s: number, i: number) => s > (cloudData.p2?.sets?.[i] ?? 0),
            ).length;
            const p2SetsWon = (cloudData.p2?.sets || []).filter(
              (s: number, i: number) => s > (cloudData.p1?.sets?.[i] ?? 0),
            ).length;
            const winner = p1SetsWon > p2SetsWon ? p1Name : p2SetsWon > p1SetsWon ? p2Name : null;
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
        if (cloudData.commandOwnerId !== deviceId) {
          // Grace period: se este device acabou de assumir o controle (últimos 15s),
          // ignora snapshots que ainda não refletem o novo commandOwnerId — são writes
          // intermediários chegando fora de ordem (Write 1 chegou, Write 3 ainda não).
          // Sobrescrever o gameState aqui reverteria o handleControlLive.
          const justTookControl = Date.now() - tookControlAtRef.current < 15000;
          if (justTookControl) {
            console.log(
              '[Sync] Snapshot com commandOwnerId antigo ignorado — grace period pós-takeControl.',
            );
            return;
          }

          // Reassunção automática: APENAS quando o controller não-owner saiu/perdeu conexão.
          // Regra: troca de controle nunca é automática, exceto neste caso específico.
          // Condições obrigatórias (todas devem ser verdadeiras):
          // 1. commandOwnerId está vazio na cloud (controller liberou o controle)
          // 2. Este device é o ownerDeviceId da live — por deviceId, NUNCA por PIN.
          //    PIN identifica o usuário; qualquer device do mesmo usuário tem o mesmo PIN.
          // 3. A live já estava ativa localmente — descarta o primeiro snapshot de live
          //    recém-criada onde commandOwnerId ainda não propagou para todos os devices.
          const controllerLeft = !cloudData.commandOwnerId;
          const currentGs = gameStateRef.current;
          const thisDeviceIsOwner = cloudData.ownerDeviceId === deviceId;
          const liveAlreadyActive = currentGs?.isMirroringActive === true;
          if (controllerLeft && thisDeviceIsOwner && liveAlreadyActive) {
            console.log(
              '[Sync] commandOwnerId liberado pelo controller — ownerDevice reassumindo controle.',
            );
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
            // Item 4: se o dono estava como observador em outra tela,
            // redireciona automaticamente para o placar ao reassumir controle.
            setCurrentScreen('scoreboard');
            return;
          }

          // Se este device era o controlador antes e agora não é mais:
          // marca o momento e notifica com um toast simples (sem modal bloqueante).
          if (currentGs?.commandOwnerId === deviceId) {
            lostControlAtRef.current = Date.now();
            const newControllerLabel = cloudData.commandOwner || 'outro dispositivo';
            // Notificação leve auto-dismiss (2s) — sem botão de confirmação
            setModalConfig({
              title: 'Controle transferido',
              message: `${newControllerLabel} assumiu o controle da partida.`,
              variant: 'info',
              onConfirm: () => setModalConfig(null),
            });
            setTimeout(() => setModalConfig(null), 2000);
          }
          // Lê matchSettings via ref para não forçar resubscribe do listener
          const localSettings = matchSettingsRef.current;

          // FB badge — observer: detecta qual time marcou ao receber snapshot
          const prevGs = gameStateRef.current;
          if (prevGs && !prevGs.isLiveClosed) {
            const p1Scored =
              cloudData.p1.games > prevGs.p1.games ||
              (cloudData.p1.games === prevGs.p1.games && cloudData.p1.score !== prevGs.p1.score);
            const p2Scored =
              cloudData.p2.games > prevGs.p2.games ||
              (cloudData.p2.games === prevGs.p2.games && cloudData.p2.score !== prevGs.p2.score);
            // seq = índice do último ponto no pointHistory (igual ao número visível no Firestore)
            const pointSeq = cloudData.pointHistory?.length ?? 0;
            if (p1Scored && !p2Scored) setFbSyncStatus({ team: 1, seq: pointSeq, isObserver: true });
            else if (p2Scored && !p1Scored)
              setFbSyncStatus({ team: 2, seq: pointSeq, isObserver: true });
          }

          setGameState(prev => {
            const baseConfig = prev?.matchConfig || localSettings;
            // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId NUNCA podem ser
            // sobrescritos por dados vindos da nuvem. O proprietário é fixado
            // no momento em que a live é criada (initGameStateInternal) e jamais
            // muda durante toda a sessão da live — independentemente do que o
            // Firestore enviar nos snapshots subsequentes.
            const lockedOwnerPin = prev?.ownerPin || cloudData.ownerPin;
            const lockedOwnerDeviceId = prev?.ownerDeviceId || cloudData.ownerDeviceId;
            // Se este device perdeu o controle (era controller, agora não é mais):
            // volta para ScoreboardDisplay por padrão.
            const justLostControl =
              prev?.commandOwnerId === deviceId && cloudData.commandOwnerId !== deviceId;
            const justGainedControl =
              prev?.commandOwnerId !== deviceId && cloudData.commandOwnerId === deviceId;
            const resolvedWatchMode = justLostControl
              ? false
              : justGainedControl && isWatchDevice()
              ? true
              : baseConfig.isWatchMode;
            const resolvedScoreboardMode = justLostControl
              ? true
              : justGainedControl && isWatchDevice()
              ? false
              : baseConfig.isScoreboardMode; // demais: preserva preferência local (inclui relógio em modo placar)
            return {
              ...cloudData,
              matchDuration: Math.max(prev?.matchDuration || 0, cloudData.matchDuration || 0),
              // Restaura os campos de proprietário travados após o spread do cloudData
              ownerPin: lockedOwnerPin,
              ownerDeviceId: lockedOwnerDeviceId,
              isMirroringActive: true,
              isLiveClosed: false,
              isConfirmedFinished: cloudData.isConfirmedFinished,
              matchConfig: {
                ...cloudData.matchConfig,
                isWatchMode: resolvedWatchMode,
                isScoreboardMode: resolvedScoreboardMode,
                brightness: baseConfig.brightness,
                volume: baseConfig.volume,
                deviceLabel: baseConfig.deviceLabel,
                selectedVoiceURI: baseConfig.selectedVoiceURI,
                voiceEnabled: baseConfig.voiceEnabled,
                voiceScoring: baseConfig.voiceScoring,
                actionCooldown: baseConfig.actionCooldown,
                stateLockout: baseConfig.stateLockout,
              },
            };
          });
          // Sincroniza matchSettings local quando device perde controle → volta a ser observer
          if (
            gameStateRef.current?.commandOwnerId === deviceId &&
            cloudData.commandOwnerId !== deviceId
          ) {
            setMatchSettings(prev => ({ ...prev, isScoreboardMode: true, isWatchMode: false }));
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
          // T4.2: Descarta write stale — versão cloud menor que a local indica ex-controller
          // ainda escrevendo após perder o controle (race condition entre dois controllers).
          const cloudVersion = cloudData.liveVersion || 0;
          const localVersion = gameStateRef.current?.liveVersion || 0;
          if (cloudVersion > 0 && localVersion > 0 && cloudVersion < localVersion) {
            console.log(
              `[Sync] Write stale ignorado — versão cloud: ${cloudVersion}, local: ${localVersion}`,
            );
            return;
          }
          setGameState(prev => {
            if (!prev) return null;
            return {
              ...prev,
              controllers: cloudData.controllers,
              judgePin: cloudData.judgePin,
              judgeNickname: cloudData.judgeNickname,
              // T4.3: sincroniza sub-objeto judge se presente na cloud
              ...(cloudData.judge ? { judge: cloudData.judge } : {}),
            };
          });
        }
      } else {
        // E1: snap não existe = live foi deletada após encerramento.
        // Guard: relógio não reage a snap.exists()===false — esse evento ocorre normalmente
        // durante reconexão de rede ou quando o targetListenPin muda e o listener antigo
        // dispara para um PIN que não existe mais. O encerramento real da live é sempre
        // sinalizado pelo campo isLiveClosed:true no documento, que é tratado acima.
        // Agir aqui desativaria o relógio prematuramente por latência de rede.
        if (isWatchDevice()) return;
        // Correção 4: limpa o estado de live SEMPRE, independente dos flags locais
        // (isMirroringActive, isLiveClosed). O estado anterior pode estar inconsistente
        // — por exemplo, quando o encerramento veio direto pelo console do Firebase
        // sem passar pelo fluxo normal do app, ou quando o owner ainda tinha
        // isMirroringActive: false localmente mas cloudLiveExists: true.
        const prevGs = gameStateRef.current;
        const wasActiveLocally = prevGs?.isMirroringActive && !prevGs?.isLiveClosed;
        // Notifica observers que ainda não receberam o isLiveClosed (só se relevante)
        if (wasActiveLocally) {
          setModalConfig({
            title: 'Live encerrada',
            message: 'A transmissão foi encerrada pelo proprietário.',
            icon: <WifiOff className="text-slate-400 w-16 h-16" />,
            confirmLabel: 'Ok',
            onConfirm: () => setModalConfig(null),
          });
        }
        // Sempre limpa — independente de wasActiveLocally
        isClosingLiveRef.current = false;
        setCloudLiveExists(false);
        setActiveLives([]);
        setGameState(prev => {
          if (!prev) return null;
          return { ...prev, isMirroringActive: false, isLiveClosed: true };
        });
      }
      });
    };

    let unsubscribe = subscribe();

    // Reconexão de rede (ex: Bluetooth volta após desconexão):
    // recria o listener para garantir que snapshots cheguem novamente.
    // Sem isso, se o device ficou offline após montar o componente,
    // targetListenPin não muda e o useEffect não reexecuta — o listener fica morto.
    const handleOnline = () => {
      unsubscribe();
      unsubscribe = subscribe();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
    // targetListenPin é reativo (useMemo sobre activeLives) — quando o PIN alvo muda
    // (ex: judge adicionado, live nova detectada), o listener é recriado automaticamente.
    // deviceId permanece para garantir que o guard de ownership funcione corretamente.
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
  ]);

  useEffect(() => {
    // Só dispara se este device REALMENTE tinha o commandOwnerId antes —
    // isCommandOwner é true também quando !isMirroringActive, o que causava
    // falso positivo quando o celular recebia a live pela primeira vez.
    const hadControl = prevCommandOwnerIdWasSelf.current;
    const hasControl = gameState?.commandOwnerId === deviceId;
    if (
      hadControl &&
      !hasControl &&
      gameState?.isMirroringActive &&
      !(gameState.isMirroringActive && gameState.isLiveClosed)
    ) {
      // Fecha o overlay IMEDIATAMENTE antes de mostrar a notificação
      setShowLiveControlOverlay(false);
      // Após fechar o overlay, exibe apenas a notificação com botão "Ok"
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

  useEffect(() => {
    const hasAnyLive = activeLives.length > 0;
    setCloudLiveExists(hasAnyLive);

    // Proteção contra latência do Firebase: quando activeLives fica vazio
    // momentaneamente (ex: reload do app, reconexão), aguardamos 3s antes
    // de concluir que não há mais live e desativar o mirroring local.
    // Se activeLives voltar a ter entradas dentro desse tempo, o timer é cancelado.
    // Guard extra: se este device acabou de assumir o controle (grace period de 15s),
    // não desativa — o Firebase ainda pode estar propagando o novo commandOwnerId.
    const justTookControlRecently = Date.now() - tookControlAtRef.current < 15000;

    // Guard: relógio NUNCA desativa isMirroringActive por ausência de activeLives.
    // O relógio é sempre um device secundário — deve esperar o onSnapshot do Firestore
    // confirmar o estado, não reagir à latência da collection.
    if (isWatchDevice()) return;

    if (!hasAnyLive && gameState?.isMirroringActive && !justTookControlRecently) {
      const debounceTimer = setTimeout(() => {
        // Re-verifica o grace period dentro do timeout — pode ter assumido controle nesse intervalo
        if (Date.now() - tookControlAtRef.current < 15000) return;
        setGameState(prev => {
          if (!prev || !prev.isMirroringActive) return prev;
          return { ...prev, isMirroringActive: false };
        });
      }, 3000);
      return () => clearTimeout(debounceTimer);
    }
  }, [activeLives, gameState?.isMirroringActive, setCloudLiveExists, setGameState, tookControlAtRef]);

  useEffect(() => {
    if (!userProfile.pin) return;
    const thisDeviceIsController = activeLives.some(l => l.commandOwnerId === deviceId);
    const hasLive = activeLives.length > 0;

    // Fix: owner nunca se registra como observer nos próprios controllers
    const thisDeviceIsOwner = activeLives.some(l => l.ownerDeviceId === deviceId);
    if (thisDeviceIsOwner) return;

    // Fix: device secundário do mesmo usuário (mesmo PIN, deviceId diferente) não
    // polui controllers com uma entrada de 'phone' extra — ele só observa silenciosamente.
    // Exceção: o relógio (watch device) deve se registrar e enviar batimentos normalmente.
    const myPin = userProfile.pin?.toUpperCase();
    const isSameUserSecondaryDevice = !isWatchDevice() && activeLives.some(
      l => l.ownerPin?.toUpperCase() === myPin && l.ownerDeviceId && l.ownerDeviceId !== deviceId,
    );
    if (isSameUserSecondaryDevice) return;

    // Registro automático como observador/juiz: quando há live E este dispositivo NÃO é o controller
    if (!thisDeviceIsController && hasLive && navigator.onLine && userProfile.email) {
      const now = Date.now();
      // Throttle: só registra/atualiza a cada 60s para não gerar writes excessivos
      if (now - lastObserverRegisterRef.current < 60000) return;
      const db = getDb();
      if (db) {
        const observerLive = activeLives.find(l =>
          l.ownerPin?.toUpperCase() === myPin || isJudgeForLive(l, myPin),
        );
        const ownerPin = observerLive?.ownerPin?.toUpperCase();
        if (ownerPin) {
          const myPinUpper = userProfile.pin?.toUpperCase();
          const myNickname =
            userProfile.nickname || userProfile.name?.split(' ')[0] || 'Observador';
          const isJudgeDevice = activeLives.some(l => isJudgeForLive(l, myPinUpper));
          const deviceRole: 'judge' | 'observer' = isJudgeDevice ? 'judge' : 'observer';
          lastObserverRegisterRef.current = now;
          // T4.1: field-path direto — sem getDoc, sem reescrita do objeto inteiro
          updateDoc(doc(db, 'live_matches', ownerPin), {
            [`controllers.${deviceId}`]: {
              label: currentFullDeviceName,
              nickname: myNickname,
              lastSeen: now,
              role: deviceRole,
              status: 'watcher',
              deviceType: getDeviceType(),
            },
          }).catch((err) => {
            console.error("Firebase observer reg error:", err);
            // Ignora erros de "No document to update", pois significam apenas encerramento natural da live.
            const errMsg = err?.message || String(err);
            if (!errMsg.includes("No document to update")) {
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

  // Detecta live disponível e exibe overlay automaticamente para dispositivos não-controller
  // Ref separado: marca liveId que o usuário já aceitou (observer ou controller).
  // Não é resetado ao trocar de tela — só quando a live realmente encerra.
  // Isso impede que o modal reabra após setCurrentScreen('scoreboard') no aceite.
  useEffect(() => {
    if (!userProfile.pin || !userProfile.email) return;
    const myPin = userProfile.pin.toUpperCase();

    // Guard 1: este device já é controller (cloud ou local)?
    const thisDeviceIsControllerInCloud = activeLives.some(l => l.commandOwnerId === deviceId);
    const thisDeviceIsControllerLocal = gameState?.commandOwnerId === deviceId;
    const thisDeviceIsController = thisDeviceIsControllerInCloud || thisDeviceIsControllerLocal;
    if (thisDeviceIsController) return;

    // Grace period pós-takeControl
    const justTookControl = Date.now() - tookControlAtRef.current < 15000;
    if (justTookControl) return;

    const authorizedLives = activeLives.filter(l =>
      l.ownerPin?.toUpperCase() === myPin || isJudgeForLive(l, myPin),
    );

    if (authorizedLives.length > 0) {
      const observerLive = authorizedLives.reduce((latest, l) =>
        (l.liveSessionCounter || 0) > (latest.liveSessionCounter || 0) ? l : latest,
      );
      const liveId = observerLive.ownerPin?.toUpperCase() || '';

      // Guard: já entrou nesta live como observer ou controller
      if (liveId && overlayAcceptedRef.current === liveId) return;
      if (liveId && overlayShownForLiveRef.current === liveId) return;
      overlayShownForLiveRef.current = liveId;

      // Guard: se este device é o owner da live, nunca entra como observer.
      // Usa ownerDeviceId quando disponível. Quando ownerDeviceId ainda não propagou
      // (latência do Firestore logo após criar a live), só trata como owner se este
      // device também é o commandOwnerId — confirmação que foi ele quem criou.
      const thisDeviceIsOwner =
        observerLive.ownerDeviceId === deviceId ||
        (!observerLive.ownerDeviceId &&
          observerLive.ownerPin?.toUpperCase() === myPin &&
          observerLive.commandOwnerId === deviceId);
      if (thisDeviceIsOwner) return;

      // Determina se este device deve entrar automaticamente como observador:
      // 1. Device secundário do mesmo usuário (mesmo ownerPin, ownerDeviceId diferente OU
      //    ownerDeviceId não propagado ainda mas commandOwnerId é de outro device)
      // 2. Judge nomeado pelo owner
      // Nesses casos: entra direto no scoreboard como observer, SEM modal.
      // O modal só aparece se o usuário clicar voluntariamente (LiveIndicator, menu, etc).
      const isSameUserOtherDevice =
        observerLive.ownerPin?.toUpperCase() === myPin &&
        // No relógio, se o PIN é o mesmo e o deviceId é diferente, entra direto (ignora latência do ownerDeviceId)
        (isWatchDevice()
          ? observerLive.ownerDeviceId !== deviceId
          : ((observerLive.ownerDeviceId && observerLive.ownerDeviceId !== deviceId) ||
             (!observerLive.ownerDeviceId &&
               observerLive.commandOwnerId &&
               observerLive.commandOwnerId !== deviceId)));

      const isNamedJudge = isJudgeForLive(observerLive, myPin);

      if (isSameUserOtherDevice || isNamedJudge) {
        // Entra automaticamente como observador — sem modal.
        // Aguarda 2s para que o documento recém-criado pelo Note estabilize no Firestore
        // antes de o celular fazer getDoc e gravar sua presença. Sem esse delay, o getDoc
        // pode retornar o doc com commandOwnerId ainda não propagado, causando a race que
        // faz o celular sobrescrever commandOwnerId como null e o Note virar observer.
        overlayAcceptedRef.current = liveId;
        setTimeout(() => autoJoinObserverRef.current?.(liveId), isSameUserOtherDevice ? 2000 : 0);
        return;
      }

      // Outros devices (observers externos): mostra o overlay normalmente
      setShowLiveControlOverlay(true);
    }

    // Guard: relógio não reseta os refs de overlay quando activeLives fica vazio.
    // Isso evita que o relógio chame handleObserveLive novamente a cada reconexão
    // da collection — o onSnapshot do documento individual já gerencia o estado.
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

  useEffect(() => {
    const showOfflineAlert = () => {
      if (offlineAlertShownRef.current) return;
      offlineAlertShownRef.current = true;
      setModalConfig({
        title: 'Conexão perdida',
        message: 'Este dispositivo ficou sem internet. A live pode parar de sincronizar até a conexão voltar.',
        icon: <WifiOff className="text-orange-500 w-16 h-16" />,
        variant: 'info',
        pulseAlert: true,
        onConfirm: () => setModalConfig(null),
      });
    };

    const clearOfflineAlert = () => {
      offlineAlertShownRef.current = false;
    };

    globalThis.addEventListener('offline', showOfflineAlert);
    globalThis.addEventListener('online', clearOfflineAlert);
    if (!navigator.onLine) showOfflineAlert();

    return () => {
      globalThis.removeEventListener('offline', showOfflineAlert);
      globalThis.removeEventListener('online', clearOfflineAlert);
    };
  }, [setModalConfig]);

  useEffect(() => {
    if (!userProfile.pin || !userProfile.email) return;
    if (!cloudLiveExists && !gameState?.isMirroringActive) {
      lastConnectionAlertKeyRef.current = null;
      return;
    }

    const checkRemotePresence = () => {
      const now = Date.now();
      const currentGs = gameStateRef.current;
      const live =
        activeLives.find(l => l.ownerPin?.toUpperCase() === currentGs?.ownerPin?.toUpperCase()) ||
        activeLives.find(l => l.ownerPin?.toUpperCase() === userProfile.pin?.toUpperCase()) ||
        currentGs;
      if (!live?.isMirroringActive || live.isLiveClosed) {
        lastConnectionAlertKeyRef.current = null;
        return;
      }

      const controllers = live.controllers || {};
      const entries = Object.entries(controllers).filter(([id, controller]) =>
        id !== deviceId && typeof controller?.lastSeen === 'number',
      ) as Array<[string, ControllerRecord]>;
      const staleAfterMs = 70000;

      const commandOwnerEntry = live.commandOwnerId && live.commandOwnerId !== deviceId
        ? entries.find(([id]) => id === live.commandOwnerId)
        : undefined;
      const staleCommandOwner = commandOwnerEntry && now - commandOwnerEntry[1].lastSeen > staleAfterMs
        ? commandOwnerEntry
        : undefined;
      const staleCounterpart = staleCommandOwner || (isWatchDevice()
        ? entries.find(([, controller]) =>
            (controller.isOwner || controller.role === 'owner') &&
            now - controller.lastSeen > staleAfterMs,
          )
        : entries.find(([, controller]) =>
            controller.deviceType === 'watch' &&
            now - controller.lastSeen > staleAfterMs,
          ));

      if (!staleCounterpart) {
        const hasExpectedCounterpart = isWatchDevice()
          ? entries.some(([, controller]) => controller.isOwner || controller.role === 'owner')
          : entries.some(([, controller]) => controller.deviceType === 'watch');
        if (hasExpectedCounterpart) lastConnectionAlertKeyRef.current = null;
        return;
      }

      const [staleDeviceId, controller] = staleCounterpart;
      const alertKey = `${live.ownerPin || 'live'}:${staleDeviceId}:${Math.floor(controller.lastSeen / staleAfterMs)}`;
      if (lastConnectionAlertKeyRef.current === alertKey) return;
      lastConnectionAlertKeyRef.current = alertKey;

      const deviceLabel = controller.nickname || controller.label || (isWatchDevice() ? 'celular' : 'relógio');
      setModalConfig({
        title: 'Conexão perdida',
        message: `${deviceLabel} parou de responder. Aproxime os dispositivos ou confira Bluetooth/internet antes de continuar a live.`,
        icon: <WifiOff className="text-orange-500 w-16 h-16" />,
        variant: 'info',
        pulseAlert: true,
        onConfirm: () => setModalConfig(null),
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

      // ── Controller heartbeat ─────────────────────────────────────────────────
      // Se o controlador fica mais de 15s sem pontuar, ainda assim renova presença.
      // Isso permite ao celular detectar que o relógio/controller segue vivo mesmo
      // durante rallies longos ou pausas entre pontos.
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
          const isFormalJudge = !!(
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

      // ── Judge heartbeat ──────────────────────────────────────────────────────
      // T4.1: usa field-path direto (sem getDoc) — zero leituras extras a cada 30s
      const judgeMatches = activeLives.filter(l => isJudgeForLive(l, myPin));
      for (const match of judgeMatches) {
        if (match.ownerPin) {
          const docRef = doc(db, 'live_matches', match.ownerPin.toUpperCase());
          // Judge heartbeat: mantém role:'judge' nos controllers.
          // O role reflete quem o usuário É (juiz designado), não o que faz agora.
          // O commandOwnerId já indica quem está controlando ativamente.
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
              // T4.3: mantém judge.isActive sincronizado
              'judge.isActive': judgeIsActive,
              lastActivityAt: now,
            });
          } catch {}
        }
      }

      // ── Owner heartbeat (quando NÃO é o controller ativo) ──────────────────
      const ownerMatch = activeLives.find(l =>
        l.ownerDeviceId === deviceId ||
        (!l.ownerDeviceId && !isWatchDevice() && l.ownerPin?.toUpperCase() === myPin)
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

      // ── Observer heartbeat ───────────────────────────────────────────────────
      // Devices secundários do mesmo usuário ou observers externos que estão no
      // scoreboard como observadores precisam renovar o lastSeen a cada 30s —
      // sem isso, o log do proprietário os remove após 60s (TTL do lastSeen).
      const isObserving =
        currentGs?.isMirroringActive &&
        !currentGs?.isLiveClosed &&
        currentGs?.commandOwnerId !== deviceId; // não é controller ativo

      if (isObserving) {
        const observerLivePin = currentGs?.ownerPin?.toUpperCase();
        // Não re-envia heartbeat se já foi coberto pelo judge ou owner heartbeat acima
        const alreadyCovered =
          judgeMatches.some(m => m.ownerPin?.toUpperCase() === observerLivePin) ||
          (ownerMatch && ownerMatch.ownerPin?.toUpperCase() === observerLivePin);

        if (observerLivePin && !alreadyCovered) {
          const docRef = doc(db, 'live_matches', observerLivePin);
          const isFormalJudge = !!(
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
    isOriginalOwner,
    livePapel,
    resolveTargetPin,
  ]);

  useEffect(() => {
    if (gameState) {
      try {
        localStorage.setItem('myPlacarActiveGameState', JSON.stringify(gameState));
      } catch {}

      if (
        gameState.isMirroringActive &&
        userProfile.email &&
        !(gameState.isMirroringActive && gameState.isLiveClosed) &&
        navigator.onLine
      ) {
        const db = getDb();
        if (db) {
          // ── Determina papel deste device ────────────────────────────────
          const isThisDeviceController = gameState.commandOwnerId === deviceId;

          // Guard duplo (escrita de estado de partida — apenas o controller):
          // Só escreve placar/histórico se AMBOS local e Firebase confirmam este
          // device como controller, ou se acabou de assumir (grace period).
          const isConfirmedControllerInCloud = activeLives.some(l => l.commandOwnerId === deviceId);
          const isConfirmedControllerLocal = isThisDeviceController;
          const justTookControl = Date.now() - tookControlAtRef.current < 15000;
          const controllerGuardOk =
            isConfirmedControllerInCloud || isConfirmedControllerLocal || justTookControl;

          // Owner sempre pode escrever mudanças de configuração/regras,
          // independentemente de ser ou não o controller atual.
          const now = Date.now();
          const prevStateStr = lastSentStateRef.current;
          const prevState = prevStateStr ? JSON.parse(prevStateStr) : null;

          const isMatchStateChange =
            !prevState ||
            prevState.p1.score !== gameState.p1.score ||
            prevState.p2.score !== gameState.p2.score ||
            prevState.p1.games !== gameState.p1.games ||
            prevState.p2.games !== gameState.p2.games ||
            prevState.p1.sets.join(',') !== gameState.p1.sets.join(',') ||
            prevState.p2.sets.join(',') !== gameState.p2.sets.join(',') ||
            prevState.isPaused !== gameState.isPaused ||
            prevState.isMatchOver !== gameState.isMatchOver ||
            prevState.server !== gameState.server;

          const isConfigChange =
            !prevState ||
            prevState.p1.name !== gameState.p1.name ||
            prevState.p2.name !== gameState.p2.name ||
            prevState.p1.color !== gameState.p1.color ||
            prevState.p2.color !== gameState.p2.color ||
            prevState.matchConfig?.sportType !== gameState.matchConfig?.sportType ||
            prevState.matchConfig?.sets !== gameState.matchConfig?.sets ||
            prevState.matchConfig?.gamesPerSet !== gameState.matchConfig?.gamesPerSet ||
            prevState.matchConfig?.noAd !== gameState.matchConfig?.noAd ||
            prevState.matchConfig?.tieBreak !== gameState.matchConfig?.tieBreak ||
            prevState.matchConfig?.tieBreakAt !== gameState.matchConfig?.tieBreakAt ||
            prevState.matchConfig?.tieBreakPoints !== gameState.matchConfig?.tieBreakPoints ||
            prevState.matchConfig?.tieBreakWinByTwo !== gameState.matchConfig?.tieBreakWinByTwo ||
            prevState.matchConfig?.switchSidesOdd !== gameState.matchConfig?.switchSidesOdd ||
            prevState.matchConfig?.tieBreakSideSwitchMode !==
              gameState.matchConfig?.tieBreakSideSwitchMode ||
            prevState.matchConfig?.pickleballScoringMode !==
              gameState.matchConfig?.pickleballScoringMode ||
            prevState.matchConfig?.pickleballServiceMode !==
              gameState.matchConfig?.pickleballServiceMode ||
            prevState.matchConfig?.winnersStay !== gameState.matchConfig?.winnersStay ||
            prevState.matchConfig?.isDoubles !== gameState.matchConfig?.isDoubles;

          // Owner OU controller ativo podem escrever mudanças de config (tela inicial e regras).
          // isOwnerByDeviceId: verificação direta via ownerDeviceId, sem depender da latência
          // do activeLives (que pode demorar segundos para confirmar isOriginalOwner).
          const isOwnerByDeviceId = gameState.ownerDeviceId === deviceId;
          const canWriteConfig = isOriginalOwner || isOwnerByDeviceId || controllerGuardOk;

          // Controller escreve mudanças de partida; owner ou controller ativo escrevem config.
          if (isMatchStateChange && !controllerGuardOk) return;
          if (!isMatchStateChange && isConfigChange && !canWriteConfig) return;
          if (!isMatchStateChange && !isConfigChange && !isThisDeviceController) return;

          const isCriticalChange = isMatchStateChange || isConfigChange;
          const timeSinceLastSync = now - lastSyncTimeRef.current;
          const shouldSync = isCriticalChange || timeSinceLastSync > 10000;

          if (shouldSync) {
            // T4.1: controllers são escritos SEPARADAMENTE do gameState via field-path.
            // Isso reduz o payload do write de placar em ~40% e elimina a race condition
            // onde dois controllers sobrescrevem o objeto controllers inteiro ao mesmo tempo.
            const controllerRole: 'owner' | 'judge' | 'observer' =
              livePapel === 'owner' ? 'owner' : (livePapel === 'judge' ? 'judge' : 'observer');
            const myDeviceType = getDeviceType();
            const shouldUpdateLastSeen = now - lastSeenUpdateRef.current > 30000;

            // T4.2: stateToSave não inclui controllers (gerenciados separadamente).
            // liveVersion é incrementado a cada write do controller ativo —
            // permite detectar e descartar writes stale no onSnapshot.
            // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId são campos imutáveis
            // da live — fixados na criação e nunca alterados por nenhum write posterior,
            // seja do owner, do judge ou de qualquer outro controller. Isso garante que
            // o proprietário da live é sempre quem a criou, sem possibilidade de mutação.
            const stateToSave = sanitizeForFirestore({
              ...gameState,
              controllers: undefined, // T4.1: presença gerenciada via field-path
              liveVersion: (gameState.liveVersion || 0) + 1, // T4.2: versionamento
              // Imutáveis: preserva os valores originais independente do estado corrente
              ownerPin: gameState.ownerPin,
              ownerDeviceId: gameState.ownerDeviceId,
            });

            if (stateToSave) {
              const strState = JSON.stringify(stateToSave);
              if (strState !== lastSentStateRef.current) {
                lastSentStateRef.current = strState;
                lastSyncTimeRef.current = now;
                const targetPin = resolveTargetPin('write');
                if (!targetPin) return;
                if (targetPin) {
                  // T4.1 — Write 1: placar + estado da partida (sem controllers)
                  // D1: lastActivityAt habilita TTL de 3h pelo Cloud Function scheduler
                  setDoc(
                    doc(db, 'live_matches', targetPin),
                    { ...stateToSave, lastActivityAt: Date.now() },
                    { merge: true },
                  ).catch(() => {});

                  // FB badge — detecta qual time marcou para exibir indicador verde no controller
                  const curScoreKey = `${gameState.p1.score}_${gameState.p1.games}_${gameState.p2.score}_${gameState.p2.games}`;
                  if (
                    isMatchStateChange &&
                    lastFbScoreKeyRef.current &&
                    lastFbScoreKeyRef.current !== curScoreKey
                  ) {
                    const parts = lastFbScoreKeyRef.current.split('_');
                    const prevP1Games = parseInt(parts[1]);
                    const prevP2Games = parseInt(parts[3]);
                    const p1Scored =
                      gameState.p1.games > prevP1Games ||
                      (gameState.p1.games === prevP1Games && gameState.p1.score !== parts[0]);
                    const p2Scored =
                      gameState.p2.games > prevP2Games ||
                      (gameState.p2.games === prevP2Games && gameState.p2.score !== parts[2]);
                    // seq = índice do último ponto no pointHistory (igual ao número visível no Firestore)
                    const pointSeq = gameState.pointHistory?.length ?? 0;
                    if (p1Scored && !p2Scored)
                      setFbSyncStatus({ team: 1, seq: pointSeq, isObserver: false });
                    else if (p2Scored && !p1Scored)
                      setFbSyncStatus({ team: 2, seq: pointSeq, isObserver: false });
                  }
                  lastFbScoreKeyRef.current = curScoreKey;

                  // T4.1 — Write 2 (presença): atualiza só o registro deste device via field-path.
                  // Não sobrescreve os registros de outros devices — elimina race condition.
                  if (shouldUpdateLastSeen) {
                    const presenceRecord = {
                      label: currentFullDeviceName,
                      lastSeen: now,
                      isOwner: isOriginalOwner,
                      role: controllerRole,
                      status: 'controller' as const,
                      deviceType: myDeviceType,
                    };
                    updateDoc(doc(db, 'live_matches', targetPin), {
                      [`controllers.${deviceId}`]: presenceRecord,
                      lastActivityAt: Date.now(), // D1: atualiza TTL a cada heartbeat
                    }).catch(() => {});
                    lastSeenUpdateRef.current = now;
                  }
                }
              }
            }
          }
        }
      }
    }
  }, [
    gameState,
    userProfile.pin,
    userProfile.email,
    currentFullDeviceName,
    deviceId,
    activeLives,
    isOriginalOwner,
    resolveTargetPin,
    tookControlAtRef,
    lastFbScoreKeyRef,
    setFbSyncStatus,
  ]);

  // ── Auto-clear do fbSyncStatus após 2.5s ──────────────────────────────────
  useEffect(() => {
    if (!fbSyncStatus) return;
    if (fbSyncTimerRef.current) clearTimeout(fbSyncTimerRef.current);
    fbSyncTimerRef.current = setTimeout(() => setFbSyncStatus(null), 2500);
    return () => {
      if (fbSyncTimerRef.current) clearTimeout(fbSyncTimerRef.current);
    };
  }, [fbSyncStatus, fbSyncTimerRef, setFbSyncStatus]);

  // ── Observer: entra em modo placar por padrão a cada nova live ───────────────
  // Aplica uma vez por live/entrada para não desfazer mudança manual do usuário.
  useEffect(() => {
    const observerLiveKey = targetListenPin || gameState?.ownerPin || null;
    const thisDeviceIsController =
      gameState?.commandOwnerId === deviceId || activeLives.some(l => l.commandOwnerId === deviceId);

    if (livePapel === 'observer' && !thisDeviceIsController && cloudLiveExists && observerLiveKey) {
      if (observerScoreboardAppliedKeyRef.current === observerLiveKey) return;
      observerScoreboardAppliedKeyRef.current = observerLiveKey;
      setMatchSettings(prev => ({
        ...prev,
        isWatchMode: false,
        isScoreboardMode: true,
      }));
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          matchConfig: {
            ...prev.matchConfig,
            isWatchMode: false,
            isScoreboardMode: true,
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
