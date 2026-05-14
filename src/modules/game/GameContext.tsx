// ─── src/modules/game/GameContext.tsx ────────────────────────────────────────
// Provider — recebe a maioria dos valores como props e os distribui via contexto.
//
// ESTRATÉGIA ATUAL (Fase 4 — em progresso):
//   Os estados são migrados um a um do App.tsx para dentro deste provider.
//   À medida que cada estado é migrado, sua prop correspondente é removida.
//
//   Migrados até agora:
//     ✅ Passo 4.1: userProfile / setUserProfile
//     ✅ Passo 4.2: partners / setPartners
//     ✅ Passo 4.3: matchSettings / setMatchSettings
//     ✅ Passo 4.4: gameState / setGameState / gameStateRef
//     ✅ Passo 4.5: matchHistory / setMatchHistory / matchHistoryRef / persistHistory
//     ✅ Passo 4.6: limpeza de GameProviderProps (Omit removido, só children)
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { GameContextValue } from './types.ts';
import type { UserProfile } from '@modules/auth';
import { autoRegisterPartnerByPin, hasPartnerWithPin, addPartnerToState, type Partner } from '@modules/partners';
import type { MatchHistoryItem } from '@modules/history';
import { persistLocalHistory } from '@modules/history';
import { safeJsonParse } from '../../utils/safeJsonParse.ts';
import { isWatchDevice } from '../../utils/device.ts';
import { DEFAULT_TENNIS_SETTINGS } from '../../constants.ts';
import type { GameState, MatchSettings } from '../../types.ts';
import { initPickleballState } from '../../utils/pickleballEngine.ts';
import { useUI } from '@modules/ui';
import { useLive } from '@modules/live';
import { findUserByPin, getDb } from '@infra/firebase';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, deleteField, Firestore, FieldValue } from 'firebase/firestore';
import { markTournamentMatchFinished } from '@modules/events';
import { createHistoryItem } from '@modules/history';
import { clearLiveOwnerPin } from '../live/liveHelpers.ts';
import { getDeviceId, getDeviceType, resolveWatchMode } from '../../utils/device.ts';
import { sanitizeForFirestore } from '../../utils/sanitize.ts';

// ─── Contexto ─────────────────────────────────────────────────────────────────
const GameContext = createContext<GameContextValue | undefined>(undefined);

// ─── GameProvider ─────────────────────────────────────────────────────────────
// Fase 4 concluída: todos os estados migrados. O provider não recebe mais
// nenhuma prop de estado — somente `children`.
export type GameProviderProps = { children: React.ReactNode };

export const GameProvider: React.FC<GameProviderProps> = ({
  children,
}) => {
  // ── Passo 4.5: matchHistory migrado do App.tsx ─────────────────────────
  const matchHistoryRef = useRef<MatchHistoryItem[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>(() => {
    const list = safeJsonParse('myPlacarHistory', []);
    matchHistoryRef.current = list;
    return list;
  });
  useEffect(() => { matchHistoryRef.current = matchHistory; }, [matchHistory]);
  const persistHistory = useCallback((newList: MatchHistoryItem[]) => {
    const limitedList = persistLocalHistory(newList);
    matchHistoryRef.current = limitedList;
    setMatchHistory(limitedList);
  }, []);

  // ── Passo 4.4: gameState migrado do App.tsx ──────────────────────────────
  const [gameState, setGameState] = useState<GameState | null>(() => {
    const saved = safeJsonParse('myPlacarActiveGameState', null) as GameState | null;
    // Se o estado restaurado é pickleball mas não tem o sub-objeto pickleball
    // (salvo por versão anterior), reinicializa para evitar bugs de serverNumber.
    if (saved && saved.matchConfig?.sportType === 'pickleball' && !saved.pickleball) {
      saved.pickleball = initPickleballState(saved);
    }
    return saved;
  });
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── Passo 4.3: matchSettings migrado do App.tsx ─────────────────────────
  const [matchSettings, setMatchSettings] = useState<MatchSettings>(() => {
    const s = safeJsonParse('myPlacarSettings', { ...DEFAULT_TENNIS_SETTINGS, winnersStay: false });
    try {
      s.deviceLabel = localStorage.getItem('myPlacar_LocalDeviceLabel') || '';
      s.brightness = parseInt(localStorage.getItem('myPlacar_LocalBrightness') || '100');
      s.volume = parseInt(localStorage.getItem('myPlacar_LocalVolume') || '100');
      if (isWatchDevice()) {
        s.isWatchMode = true;
        localStorage.setItem('myPlacar_LocalWatchMode', 'true');
      } else {
        const savedWatchMode = localStorage.getItem('myPlacar_LocalWatchMode');
        if (savedWatchMode !== null) {
          s.isWatchMode = savedWatchMode === 'true';
        } else {
          s.isWatchMode = false;
          localStorage.setItem('myPlacar_LocalWatchMode', 'false');
        }
      }
      s.selectedVoiceURI = localStorage.getItem('myPlacar_LocalVoiceURI') || s.selectedVoiceURI;
      s.voiceEnabled = localStorage.getItem('myPlacar_LocalVoiceEnabled') !== 'false';
      s.voiceScoring = localStorage.getItem('myPlacar_LocalVoiceScoring') !== 'false';
      s.actionCooldown = parseInt(localStorage.getItem('myPlacar_LocalActionCooldown') || '5');
      s.stateLockout = parseInt(localStorage.getItem('myPlacar_LocalStateLockout') || '10');
      s.screenDimTimeout = (parseInt(localStorage.getItem('myPlacar_LocalScreenDimTimeout') || '10') as 10 | 15 | 20);
      if (!s.deviceLabel) {
        if (isWatchDevice()) {
          s.deviceLabel = 'Relógio';
        } else {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          s.deviceLabel = isMobile ? 'Celular' : 'Note';
        }
        localStorage.setItem('myPlacar_LocalDeviceLabel', s.deviceLabel);
      }
    } catch {}
    return s;
  });

  // ── Passo 4.2: partners migrado do App.tsx ──────────────────────────────
  const [partners, setPartners] = useState<Partner[]>(() => safeJsonParse('myPlacarPartners', []));

  // ── Passo 4.1: userProfile migrado do App.tsx ────────────────────────────
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const profile = safeJsonParse('myPlacarUserProfile', { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' as const });
    return (profile && profile.email) ? profile : { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' };
  });

  const { setPlayerQueue, setModalConfig, setShowLiveControlOverlay, setCurrentScreen, isSettingsInicialSaved, setIsSettingsInicialSaved, setIsSettingsRegrasSaved, overlayAcceptedRef, setIsSavingJudge } = useUI();
  const { isOriginalOwner, resolveTargetPin, activeLives, isClosingLiveRef, setCloudLiveExists, setActiveLives, livePapel, tookControlAtRef, setLiveLogs } = useLive();
  const deviceId = getDeviceId();

  const finalizeMatchInternal = useCallback(async (state: GameState) => {
    const p1SetsWon = state.p1.sets.filter((s, i) => s > state.p2.sets[i]).length;
    const p2SetsWon = state.p2.sets.filter((s, i) => s > state.p1.sets[i]).length;
    const winnerTeam = p1SetsWon > p2SetsWon ? 1 : 2;
    const winnersStay = state.matchConfig.winnersStay;

    if (state.tournamentPin && state.tournamentMatchId && navigator.onLine) {
       const db = getDb();
       if (db) {
          const res = `${state.p1.sets.join('/')}-${state.p2.sets.join('/')}`;
          markTournamentMatchFinished(db as Firestore, state.tournamentPin, state.tournamentMatchId, res, winnerTeam).catch(() => {});
       }
    }

    const exitingPlayers: string[] = [];
    if (!winnersStay) {
        exitingPlayers.push(state.p1.name, state.p1.partnerName || '', state.p2.name, state.p2.partnerName || '');
    } else {
        if (winnerTeam === 1) {
            exitingPlayers.push(state.p2.name, state.p2.partnerName || '');
        } else {
            exitingPlayers.push(state.p1.name, state.p1.partnerName || '');
        }
    }

    const cleanExiting = exitingPlayers.filter(n => !!n && n.trim() !== "");
    setPlayerQueue(prev => {
        const next = [...prev];
        cleanExiting.forEach(name => {
            const partnerInfo = partners.find(p => p.nickname === name);
            const gender = partnerInfo?.gender || (name.toLowerCase().endsWith('a') ? 'F' : 'M');
            const emptyIdx = next.findIndex(p => !p.name);
            if (emptyIdx !== -1) { next[emptyIdx] = { ...next[emptyIdx], name, gender }; }
            else { next.push({ id: `q_${Date.now()}_${next.length}`, name, gender }); }
        });
        return next;
    });

    if (!state.matchConfig.isHistoryEnabled) {
      try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {}
      const db = getDb();
      if (!db) return;
      const targetPin = resolveTargetPin('write');
      if (!targetPin) return;
      if (targetPin && navigator.onLine) {
        updateDoc(doc(db, "live_matches", targetPin), {
          isMatchOver: true,
          isConfirmedFinished: true,
          matchEndedAt: Date.now(),
          isLiveClosed: true,
          isMirroringActive: false,
          lastActivityAt: Date.now()
        }).catch(() => {});
        setTimeout(() => {
          deleteDoc(doc(db, "live_matches", targetPin)).catch(() => {});
        }, 4000);
      }
      return;
    }

    if (matchHistoryRef.current.some(m => m.id === state.matchId)) return;
    let location: { lat: number, lng: number } | undefined = undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => { 
          if (!navigator.geolocation) return reject(new Error("Indisponível"));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, enableHighAccuracy: true }); 
      });
      location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {}
    const historyItem = createHistoryItem(state, userProfile, partners, location);
    persistHistory([historyItem, ...matchHistoryRef.current]);
    try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {}
    const db = getDb();
    if (db && userProfile.pin && navigator.onLine) {
      updateDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), {
        isMatchOver: true,
        isConfirmedFinished: true,
        matchEndedAt: Date.now()
      }).catch(() => {});
    }
  }, [persistHistory, userProfile.email, userProfile.pin, partners, setPlayerQueue, resolveTargetPin]);

  const handleLeaveLive = useCallback(async () => {
    if (!gameState?.isMirroringActive || !userProfile.email || !navigator.onLine) return;
    const db = getDb();
    if (!db) return;
    const targetPin = resolveTargetPin('handleLeaveLive');
    if (!targetPin) return;

    try {
      const isActiveController = gameState.commandOwnerId === deviceId;

      if (isOriginalOwner) {
        if (isActiveController) {
          await updateDoc(doc(db, "live_matches", targetPin), {
            commandOwnerId: null,
            commandOwner: null
          });
        }
        return;
      }

      const leaveUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
        [`controllers.${deviceId}`]: deleteField()
      };
      if (isActiveController) {
        leaveUpdate.commandOwnerId = null;
        leaveUpdate.commandOwner = null;
      }
      await updateDoc(doc(db, "live_matches", targetPin), leaveUpdate);
    } catch {}
  }, [gameState, userProfile.email, userProfile.pin, deviceId, isOriginalOwner, resolveTargetPin, activeLives]);

  const handleCloseCloudLive = useCallback(async () => {
    const db = getDb();
    if (!db) { setModalConfig({ title: "Erro", message: "Banco de dados não disponível.", onConfirm: () => setModalConfig(null) }); return; }
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Sem conexão com a internet.", onConfirm: () => setModalConfig(null) }); return; }
    if (!userProfile.pin) { setModalConfig({ title: "Erro", message: "PIN não cadastrado.", onConfirm: () => setModalConfig(null) }); return; }
    
    const targetPin = resolveTargetPin('write');
    if (!targetPin) { setModalConfig({ title: "Erro", message: "PIN da transmissão não encontrado.", onConfirm: () => setModalConfig(null) }); return; }

    isClosingLiveRef.current = true;

    setGameState(prev => { if (!prev) return null; return { ...prev, isMirroringActive: false, isLiveClosed: true }; });

    const safetyTimer = setTimeout(() => {
      isClosingLiveRef.current = false;
      setCloudLiveExists(false);
      setActiveLives(prev => prev.filter(l => l.ownerPin?.toUpperCase() !== targetPin));
      try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {}
      setShowLiveControlOverlay(false);
    }, 6000);

    try {
      const liveRef = doc(db, "live_matches", targetPin);
      await updateDoc(liveRef, {
        isLiveClosed: true,
        isMirroringActive: false,
        closedAt: Date.now(),
        closedBy: deviceId,
        closedByRole: livePapel
      });
      setTimeout(() => deleteDoc(liveRef).catch(() => {}), 4000);

      clearTimeout(safetyTimer);
      isClosingLiveRef.current = false;
      setCloudLiveExists(false); 
      setActiveLives(prev => prev.filter(l => l.ownerPin?.toUpperCase() !== targetPin));
      try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {}
      setShowLiveControlOverlay(false); 
      setCurrentScreen('settings');
      // @ts-ignore
      setModalConfig({ title: "Transmissão encerrada", message: "Todos os participantes foram desconectados.", variant: 'success', onConfirm: () => setModalConfig(null) });
      setTimeout(() => setModalConfig(null), 3000);
    } catch (_e) { 
      clearTimeout(safetyTimer);
      isClosingLiveRef.current = false;
      setGameState(prev => { if (!prev) return null; return { ...prev, isMirroringActive: true, isLiveClosed: false }; });
      console.error("Erro ao encerrar live:", _e);
      setModalConfig({ title: "Erro", message: `Erro ao encerrar: ${_e instanceof Error ? _e.message : 'Tente novamente'}`, onConfirm: () => setModalConfig(null) }); 
    }
  }, [userProfile.pin, resolveTargetPin, isClosingLiveRef, setCloudLiveExists, setActiveLives, setShowLiveControlOverlay, setCurrentScreen, setModalConfig, deviceId, livePapel]);

  const handleDeleteJudge = useCallback(async () => {
    if (!userProfile.pin) return;
    const db = getDb();
    if (!db) return;
    try {
      await updateDoc(doc(db as Firestore, "live_matches", userProfile.pin.toUpperCase()), { 
        judgePin: null,
        judgeNickname: null,
        judge: null
      });
      setShowLiveControlOverlay(false);
      setModalConfig({ title: "Sucesso", message: "Juiz removido.", onConfirm: () => setModalConfig(null) });
    } catch (_e) {
      setModalConfig({ title: "Erro", message: "Erro ao remover juiz.", onConfirm: () => setModalConfig(null) });
    }
  }, [userProfile.pin, setShowLiveControlOverlay, setModalConfig]);

  const currentFullDeviceName = useMemo(() => {
    const label = matchSettings.deviceLabel || 'Aparelho';
    const nick = userProfile.nickname || 'Usuário';
    return `${nick} • ${label}`;
  }, [matchSettings.deviceLabel, userProfile.nickname]);

  const handleControlLive = useCallback(async () => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para assumir o controle.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    if (db && userProfile.pin) {
      const targetPin = resolveTargetPin('write');
      if (!targetPin) return;
      try {
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudState = snap.data() as GameState;

          const currentControllerId = cloudState.commandOwnerId;

          const myCommandName = currentFullDeviceName;
          const newControllerRole: 'owner' | 'judge' = isOriginalOwner ? 'owner' : 'judge';
          const syncedSettings: MatchSettings = { 
            ...matchSettings, 
            p1Name: cloudState.p1.name, 
            p1Partner: cloudState.p1.partnerName || '', 
            p2Name: cloudState.p2.name, 
            p2Partner: cloudState.p2.partnerName || '', 
            p1Color: cloudState.p1.color || 'azul', 
            p2Color: cloudState.p2.color || 'vermelho', 
            isDoubles: cloudState.matchConfig.isDoubles, 
            sets: cloudState.matchConfig.sets, 
            gamesPerSet: cloudState.matchConfig.gamesPerSet, 
            noAd: cloudState.matchConfig.noAd, 
            tieBreak: cloudState.matchConfig.tieBreak, 
            tieBreakAt: cloudState.matchConfig.tieBreakAt, 
            tieBreakPoints: cloudState.matchConfig.tieBreakPoints, 
            tieBreakWinByTwo: cloudState.matchConfig.tieBreakWinByTwo, 
            switchSidesOdd: cloudState.matchConfig.switchSidesOdd,
            tieBreakSideSwitchMode: cloudState.matchConfig.tieBreakSideSwitchMode,
            pickleballScoringMode: cloudState.matchConfig.pickleballScoringMode,
            pickleballServiceMode: cloudState.matchConfig.pickleballServiceMode,
            winnersStay: cloudState.matchConfig.winnersStay,
            isHistoryEnabled: cloudState.matchConfig.isHistoryEnabled,
            sportType: cloudState.matchConfig.sportType, 
            isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode 
          };

          const prevDemoteUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {};
          if (currentControllerId && currentControllerId !== deviceId) {
            const prevEntry = (cloudState.controllers || {})[currentControllerId];
            if (prevEntry) {
              const demotedRole = prevEntry.isOwner || prevEntry.role === 'owner' ? 'owner' : 'observer';
              prevDemoteUpdate[`controllers.${currentControllerId}`] = { ...prevEntry, role: demotedRole };
            }
          }

          const updatedStateRaw = { ...cloudState, commandOwner: myCommandName, commandOwnerId: deviceId, isLiveClosed: false, matchConfig: { ...syncedSettings, setsToWin: syncedSettings.sets, isWatchMode: !!syncedSettings.isWatchMode } };
          const { controllers: _controllers, ...stateWithoutControllers } = updatedStateRaw as typeof updatedStateRaw & { controllers?: unknown };
          const updatedState = sanitizeForFirestore(stateWithoutControllers);
          if (updatedState) {
            await setDoc(doc(db, "live_matches", targetPin), updatedState, { merge: true }).catch(() => {});
            if (Object.keys(prevDemoteUpdate).length > 0) {
              await updateDoc(doc(db, "live_matches", targetPin), prevDemoteUpdate).catch(() => {});
            }
            await updateDoc(doc(db, "live_matches", targetPin), {
              [`controllers.${deviceId}`]: { label: myCommandName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: newControllerRole, deviceType: getDeviceType() }
            }).catch(() => {});
            const localControllers: Record<string, unknown> = { ...(cloudState.controllers || {}) };
            if (currentControllerId && currentControllerId !== deviceId) {
              const prevEntry = (cloudState.controllers || {})[currentControllerId];
              if (prevEntry) {
                const demotedRole = prevEntry.isOwner || prevEntry.role === 'owner' ? 'owner' : 'observer';
                localControllers[currentControllerId] = { ...prevEntry, role: demotedRole };
              }
            }
            localControllers[deviceId] = { label: myCommandName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: newControllerRole, deviceType: getDeviceType() };

            tookControlAtRef.current = Date.now();
            const settingsAsController = { ...syncedSettings, isScoreboardMode: false };
            setMatchSettings(settingsAsController); 
            try { localStorage.setItem('myPlacarSettings', JSON.stringify(settingsAsController)); } catch {}
            setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true);
            setGameState({ ...updatedState, isMirroringActive: true, controllers: localControllers, matchConfig: { ...updatedState.matchConfig, isWatchMode: resolveWatchMode(matchSettings.isWatchMode ?? false), isScoreboardMode: false, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
            try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updatedState)); } catch {}

            overlayAcceptedRef.current = targetPin;
            setShowLiveControlOverlay(false);
            setModalConfig(null); 
            // Only way we know current screen is via `useUI`. Wait, `setCurrentScreen('scoreboard')` is unconditionally safe except when public.
            setCurrentScreen('scoreboard');
          }
        } else {
          setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Atenção", message: "A partida ao vivo não foi encontrada ou já foi encerrada.", onConfirm: () => setModalConfig(null) });
        }
      } catch {}
    }
  }, [userProfile.pin, resolveTargetPin, setModalConfig, currentFullDeviceName, isOriginalOwner, matchSettings, deviceId, setMatchSettings, setIsSettingsInicialSaved, setIsSettingsRegrasSaved, setGameState, overlayAcceptedRef, setShowLiveControlOverlay, setCurrentScreen, setCloudLiveExists, tookControlAtRef]);

  const handleObserveLive = useCallback(async (targetPin?: string) => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para observar.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    let pinToObserve = targetPin || userProfile.pin?.toUpperCase();

    if (!targetPin && userProfile.pin) {
      const myPin = userProfile.pin.toUpperCase();
      const judgeMatch = activeLives.find(l => l.judgePin?.toUpperCase() === myPin);
      if (judgeMatch && judgeMatch.ownerPin) {
        pinToObserve = judgeMatch.ownerPin;
      } else {
        const ownerLive = activeLives.find(l =>
          l.ownerPin?.toUpperCase() === myPin && l.ownerDeviceId && l.ownerDeviceId !== deviceId
        );
        if (ownerLive && ownerLive.ownerPin) {
          pinToObserve = ownerLive.ownerPin.toUpperCase();
        } else {
          const latestLive = activeLives.reduce((latest, l) =>
            (l.liveSessionCounter || 0) > (latest.liveSessionCounter || 0) ? l : latest
            , activeLives[0]);
          if (latestLive?.ownerPin) pinToObserve = latestLive.ownerPin.toUpperCase();
        }
      }
    }

    if (db && pinToObserve) {
      const pinUpper = pinToObserve.toUpperCase();
      try {
        const snap = await getDoc(doc(db, "live_matches", pinUpper));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudData = snap.data() as GameState;
          const myCommandName = currentFullDeviceName;
          const myNickname = userProfile.nickname || userProfile.name.split(' ')[0];
          const existingEntry = (cloudData.controllers || {})[deviceId];
          const joinRole = existingEntry?.role === 'owner' || existingEntry?.role === 'judge' ? existingEntry.role : 'observer';

          const myPin = userProfile.pin?.toUpperCase();
          const isSecondaryDevice = cloudData.ownerPin?.toUpperCase() === myPin && cloudData.ownerDeviceId && cloudData.ownerDeviceId !== deviceId;

          await updateDoc(doc(db, "live_matches", pinUpper), {
            [`controllers.${deviceId}`]: { label: myCommandName, nickname: myNickname, lastSeen: Date.now(), role: joinRole, deviceType: getDeviceType(), isOwner: false }
          }).catch(() => {});
          
          if (cloudData.matchConfig) {
            setMatchSettings(prev => ({ ...prev, ...cloudData.matchConfig }));
          }

          const nextControllers = {
            ...(cloudData.controllers || {}),
            [deviceId]: { label: myCommandName, nickname: myNickname, lastSeen: Date.now(), role: joinRole, deviceType: getDeviceType(), isOwner: false }
          };
          const resolvedCommandOwnerId = isSecondaryDevice ? cloudData.commandOwnerId : deviceId;
          const enterAsObserver = joinRole === 'observer';
          const watchModeForEntry = resolveWatchMode(matchSettings.isWatchMode ?? false);
          setGameState({ ...cloudData, isMirroringActive: true, isLiveClosed: false, commandOwnerId: resolvedCommandOwnerId, controllers: nextControllers, matchConfig: { ...cloudData.matchConfig, isWatchMode: watchModeForEntry, isScoreboardMode: watchModeForEntry ? false : (enterAsObserver ? true : false), brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
          if (enterAsObserver) setMatchSettings(prev => ({ ...prev, isScoreboardMode: watchModeForEntry ? false : true, isWatchMode: watchModeForEntry }));
          overlayAcceptedRef.current = pinUpper;
          setShowLiveControlOverlay(false); setCurrentScreen('scoreboard');
        } else {
          if (!targetPin) setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Atenção", message: "A partida ao vivo não foi encontrada ou já foi encerrada.", onConfirm: () => setModalConfig(null) });
        }
      } catch {}
    }
  }, [userProfile.pin, userProfile.name, userProfile.nickname, activeLives, deviceId, currentFullDeviceName, setMatchSettings, matchSettings, setGameState, overlayAcceptedRef, setShowLiveControlOverlay, setCurrentScreen, setCloudLiveExists, setModalConfig]);

  const handleSyncScoreboard = useCallback(async () => {
    if (!gameState || !gameState.isMirroringActive || (gameState.isMirroringActive && gameState.isLiveClosed)) return;
    if (!navigator.onLine) {
      setModalConfig({ title: "Sem conexão", message: "Verifique sua conexão com a internet e tente novamente.", onConfirm: () => setModalConfig(null) });
      return;
    }
    const db = getDb();
    if (!db) return;
    const targetPin = resolveTargetPin('liveControl');
    if (!targetPin) return;

    const isController = gameState.commandOwnerId === deviceId;

    try {
      if (isController) {
        const stateToSync = sanitizeForFirestore({ ...gameState, controllers: undefined });
        if (stateToSync) {
          await setDoc(doc(db, "live_matches", targetPin), { ...stateToSync, lastActivityAt: Date.now() }, { merge: true });
        }
      } else {
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists()) {
          const cloudData = snap.data() as GameState;
          setGameState(prev => prev ? {
            ...prev,
            ...cloudData,
            commandOwnerId: cloudData.commandOwnerId ?? prev.commandOwnerId,
          } : cloudData);
        }
      }

      setLiveLogs(prev => {
        const entry = {
          id: Math.random().toString(36).substr(2, 9),
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          timestamp: Date.now(),
          type: 'score' as const,
          text: `↺ Placar sincronizado (${isController ? 'enviado' : 'recebido'}) — ${gameState.p1.name} ${gameState.p1.score} × ${gameState.p2.score} ${gameState.p2.name}`,
          ok: true,
          isController,
        };
        return [entry, ...(prev || [])].slice(0, 60);
      });
      setShowLiveControlOverlay(false);
    } catch (_e) {
      setModalConfig({ title: "Erro ao sincronizar", message: "Não foi possível sincronizar o placar. Tente novamente.", onConfirm: () => setModalConfig(null) });
    }
  }, [gameState, setModalConfig, resolveTargetPin, deviceId, setGameState, setLiveLogs, setShowLiveControlOverlay]);

  const handleAddJudge = useCallback(async (pin: string, nickname?: string) => {
    if (!pin || pin.length < 5 || !gameState || !userProfile.pin) return;
    setIsSavingJudge(true);
    const db = getDb();
    if (!db) return;
    try {
      const pinUpper = pin.toUpperCase().trim();
      const judgeResult = await autoRegisterPartnerByPin(db as Firestore, pinUpper, { origin: 'manual', fallbackNickname: 'Juiz' });
      const finalNickname = nickname || judgeResult?.nickname || 'Juiz';

      if (pinUpper && !hasPartnerWithPin(partners, pinUpper)) {
        const newPartner: Partner = judgeResult?.partner || {
          id: `p_${Date.now()}`,
          pin: pinUpper,
          nickname: finalNickname,
          addedAt: Date.now(),
          origin: 'manual'
        };
        setPartners(prev => addPartnerToState(prev, newPartner));

        if (db && userProfile.pin) {
          await setDoc(doc(db as Firestore, 'users', userProfile.pin.toUpperCase(), 'partners', pinUpper), {
            pin: pinUpper,
            nickname: finalNickname,
            addedAt: newPartner.addedAt,
            origin: 'manual'
          }).catch(err => console.error("Erro ao salvar parceiro no Firestore:", err));
        }
      }

      await updateDoc(doc(db as Firestore, "live_matches", userProfile.pin.toUpperCase()), { 
        judgePin: pinUpper,
        judgeNickname: finalNickname,
        judge: {
          pin: pinUpper,
          nickname: finalNickname,
          addedAt: Date.now(),
          isActive: false
        }
      });
      setModalConfig({ title: "Sucesso", message: "Juiz adicionado com sucesso!", onConfirm: () => setModalConfig(null) });
    } catch (_e) {
      setModalConfig({ title: "Erro", message: "Erro ao adicionar juiz.", onConfirm: () => setModalConfig(null) });
    } finally {
      setIsSavingJudge(false);
    }
  }, [gameState, userProfile.pin, setIsSavingJudge, partners, setPartners, setModalConfig]);

  const value: GameContextValue = {
    gameState,
    setGameState,
    gameStateRef,
    matchSettings,
    setMatchSettings,
    userProfile,
    setUserProfile,
    matchHistory,
    setMatchHistory,
    matchHistoryRef,
    persistHistory,
    partners,
    setPartners,
    finalizeMatchInternal,
    handleLeaveLive,
    handleCloseCloudLive,
    handleDeleteJudge,
    handleControlLive,
    handleObserveLive,
    handleSyncScoreboard,
    handleAddJudge,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

// ─── Exportação do contexto bruto ─────────────────────────────────────────────
export { GameContext };
