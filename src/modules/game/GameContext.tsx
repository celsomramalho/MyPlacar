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
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

// ─── Exportação do contexto bruto ─────────────────────────────────────────────
export { GameContext };
