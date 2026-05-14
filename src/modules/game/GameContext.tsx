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

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import type { GameContextValue } from './types.ts';
import type { UserProfile } from '@modules/auth';
import type { Partner } from '@modules/partners';
import type { MatchHistoryItem } from '@modules/history';
import { persistLocalHistory } from '@modules/history';
import { safeJsonParse } from '../../utils/safeJsonParse.ts';
import { isWatchDevice } from '../../utils/device.ts';
import { DEFAULT_TENNIS_SETTINGS } from '../../constants.ts';
import type { GameState, MatchSettings } from '../../types.ts';
import { initPickleballState } from '../../utils/pickleballEngine.ts';
import { useUI } from '@modules/ui';
import { useLive } from '@modules/live';
import { getDb } from '@infra/firebase';
import { doc, updateDoc, deleteDoc, deleteField, Firestore, FieldValue } from 'firebase/firestore';
import { markTournamentMatchFinished } from '@modules/events';
import { createHistoryItem } from '@modules/history';
import { clearLiveOwnerPin } from '../live/liveHelpers.ts';
import { getDeviceId } from '../../utils/device.ts';

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

  const { setPlayerQueue, setModalConfig, setShowLiveControlOverlay, setCurrentScreen } = useUI();
  const { isOriginalOwner, resolveTargetPin, activeLives, isClosingLiveRef, setCloudLiveExists, setActiveLives, livePapel } = useLive();
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
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

// ─── Exportação do contexto bruto ─────────────────────────────────────────────
export { GameContext };
