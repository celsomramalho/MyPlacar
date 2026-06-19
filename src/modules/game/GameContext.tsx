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
import type { UserProfile } from '@modules/auth/types';
import { hasPartnerWithPin, addPartnerToState } from '@modules/partners/services/addPartnerToState';
import { autoRegisterPartnerByPin } from '@modules/partners/services/autoRegisterPartnerByPin';
import type { Partner } from '@modules/partners/types';
import type { MatchHistoryItem } from '@modules/history/types';
import { persistLocalHistory } from '@modules/history/services/persistLocalHistory';
import { safeJsonParse } from '@shared/utils/safeJsonParse';
import { isWatchDevice } from '@shared/utils/device';
import { DEFAULT_TENNIS_SETTINGS, APP_VERSION } from '../../constants.ts';
import type { GameState, MatchSettings, PointType } from '../../types.ts';
import { initPickleballState } from '@modules/game/domain/pickleballEngine';
import { getEngineForSport } from '@modules/game/domain/sportEngine';
import { incrementScore, undoPoint } from '@modules/game/domain/tennisEngine';
import { useUI } from '@modules/ui/UIContext';
import { useLive } from '@modules/live/useLive';
import { getDb } from '@infra/firebase/client';
import { findUserByPin } from '@infra/firebase/users';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import type { Firestore, FieldValue } from 'firebase/firestore';
import { mirrorUser } from '@infra/supabase';
import { markTournamentMatchFinished, markTournamentMatchLive } from '@modules/events/services/updateTournamentMatchProgress';
import type { TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events/types';
import { createHistoryItem } from '@modules/history/services/createHistoryItem';
import { clearLiveOwnerPin, persistLiveOwnerPin } from '../live/liveHelpers.ts';
import { getDeviceId, getDeviceType, resolveWatchMode } from '@shared/utils/device';
import { sanitizeForFirestore } from '@shared/utils/sanitize';
import { isValidGameState, isValidMatchSettings } from '@modules/game/domain/validation';


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
    const saved = safeJsonParse('myPlacarActiveGameState', null, {
      validate: isValidGameState,
      onInvalid: () => localStorage.removeItem('myPlacarActiveGameState')
    }) as GameState | null;
    // Se o estado restaurado é pickleball mas não tem o sub-objeto pickleball
    // (salvo por versão anterior), reinicializa para evitar bugs de serverNumber.
    if (saved && saved.matchConfig?.sportType === 'pickleball' && !saved.pickleball) {
      saved.pickleball = initPickleballState(saved);
    }
    if (saved?.matchConfig && isWatchDevice()) {
      saved.matchConfig = { ...saved.matchConfig, isWatchMode: true, isScoreboardMode: false };
    }
    return saved;
  });
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  const historyStackRef = useRef<GameState[]>([]);
  useEffect(() => { historyStackRef.current = historyStack; }, [historyStack]);

  // ── Passo 4.3: matchSettings migrado do App.tsx ─────────────────────────
  const [matchSettings, setMatchSettings] = useState<MatchSettings>(() => {
    const s = safeJsonParse('myPlacarSettings', { ...DEFAULT_TENNIS_SETTINGS, winnersStay: false }, {
      validate: isValidMatchSettings
    });

    try {
      s.deviceLabel = localStorage.getItem('myPlacar_LocalDeviceLabel') || '';
      s.brightness = parseInt(localStorage.getItem('myPlacar_LocalBrightness') || '100');
      s.volume = parseInt(localStorage.getItem('myPlacar_LocalVolume') || '100');
      if (isWatchDevice()) {
        s.isWatchMode = true;
        s.isScoreboardMode = false;
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

  const { currentScreen, setPlayerQueue, playerQueue, setModalConfig, setShowLiveControlOverlay, setCurrentScreen, isSettingsInicialSaved, setIsSettingsInicialSaved, setIsSettingsRegrasSaved, overlayAcceptedRef, setIsSavingJudge, isProfileSaved, setIsProfileSaved, setVoiceLogs, setIsRecoveryFromMatchOver, setIsWaitingSync } = useUI();
  const { isOriginalOwner, resolveTargetPin, activeLives, isClosingLiveRef, setCloudLiveExists, setActiveLives, livePapel, tookControlAtRef, setLiveLogs } = useLive();
  const deviceId = getDeviceId();

  const prevSettingsRef = useRef<MatchSettings | null>(null);
  const prevProfileRef = useRef<UserProfile | null>(null);

  const handleSaveProfile = useCallback(async () => {
    try {
      localStorage.setItem('myPlacarUserProfile', JSON.stringify(userProfile));
      prevProfileRef.current = { ...userProfile };
      setIsProfileSaved(true);
      if (navigator.onLine && userProfile.email) {
        const db = getDb();
        if (db) {
          const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
          await setDoc(doc(db as Firestore, "users", userProfile.email.toLowerCase().trim()), {
            name: userProfile.name,
            nickname: userProfile.nickname,
            phone: userProfile.phone || '',
            gender: userProfile.gender || 'M',
            pin: userProfile.pin,
            authMethod: userProfile.authMethod || 'pin',
            isProfileComplete: userProfile.isProfileComplete,
            passkeyCredentialId: userProfile.passkeyCredentialId || null,
            passkeyPublicKey: userProfile.passkeyPublicKey || null,
            updatedAt: serverTimestamp()
          }, { merge: true });
          mirrorUser(userProfile);
        }
      }
    } catch (e) {
      console.error("Erro ao salvar perfil:", e);
    }
  }, [userProfile, setIsProfileSaved]);

  useEffect(() => {
    if (!prevSettingsRef.current) { prevSettingsRef.current = { ...matchSettings }; return; }
    const prev = prevSettingsRef.current;
    const inicialChanged = prev.p1Name !== matchSettings.p1Name || prev.p1Partner !== matchSettings.p1Partner || prev.p2Name !== matchSettings.p2Name || prev.p2Partner !== matchSettings.p2Partner || prev.isDoubles !== matchSettings.isDoubles || prev.p1Color !== matchSettings.p1Color || prev.p2Color !== matchSettings.p2Color;
    const technicalFieldsChanged = prev.sportType !== matchSettings.sportType || prev.sets !== matchSettings.sets || prev.gamesPerSet !== matchSettings.gamesPerSet || prev.noAd !== matchSettings.noAd || prev.tieBreak !== matchSettings.tieBreak || prev.tieBreakAt !== matchSettings.tieBreakAt || prev.tieBreakPoints !== matchSettings.tieBreakPoints || prev.tieBreakWinByTwo !== matchSettings.tieBreakWinByTwo || prev.switchSidesOdd !== matchSettings.switchSidesOdd || prev.tieBreakSideSwitchMode !== matchSettings.tieBreakSideSwitchMode || prev.pickleballScoringMode !== matchSettings.pickleballScoringMode || prev.pickleballServiceMode !== matchSettings.pickleballServiceMode || prev.useGeminiVoice !== matchSettings.useGeminiVoice || prev.isWatchMode !== matchSettings.isWatchMode || prev.brightness !== matchSettings.brightness || prev.volume !== matchSettings.volume || prev.actionCooldown !== matchSettings.actionCooldown || prev.stateLockout !== matchSettings.stateLockout || prev.deviceLabel !== matchSettings.deviceLabel || prev.selectedVoiceURI !== matchSettings.selectedVoiceURI || prev.voiceEnabled !== matchSettings.voiceEnabled || prev.voiceScoring !== matchSettings.voiceScoring || prev.winnersStay !== matchSettings.winnersStay;
    if (inicialChanged) setIsSettingsInicialSaved(false);
    if (prev.sportType !== matchSettings.sportType) { setIsSettingsRegrasSaved(true); } else if (technicalFieldsChanged) { setIsSettingsRegrasSaved(false); }

    // ── Detecção de troca de motor de pontuação ───────────────────────────────
    // Disparada no momento em que o usuário troca o esporte nas regras.
    // Compara o motor da partida em andamento (scoringEngine, imutável) com o
    // motor do esporte recém-selecionado. Se forem diferentes e houver pontos,
    // exibe modal imediatamente. onCancel reverte o sportType para o anterior.
    const sportChanged = prev.sportType !== matchSettings.sportType;
    const matchHasStarted = gameState && !gameState.isConfirmedFinished && (
      gameState.p1.games > 0 || gameState.p2.games > 0 ||
      gameState.p1.sets.length > 0 ||
      gameState.p1.score !== '0' || gameState.p2.score !== '0'
    );
    if (sportChanged && matchHasStarted) {
      const previousEngine = gameState!.scoringEngine ?? getEngineForSport(prev.sportType);
      const nextEngine = getEngineForSport(matchSettings.sportType);
      if (previousEngine !== nextEngine) {
        const revertedSportType = prev.sportType;
        setModalConfig({
          title: "Sistema de pontuação diferente",
          message: "O esporte selecionado usa um sistema de pontuação diferente. A partida atual será zerada para iniciar com as novas regras. Deseja continuar?",
          confirmLabel: "Sim, zerar e iniciar",
          cancelLabel: "Não, manter esporte atual",
          onConfirm: () => { setModalConfig(null); initGameStateInternal(true); },
          onCancel: () => {
            setModalConfig(null);
            setMatchSettings(s => ({ ...s, sportType: revertedSportType }));
          },
        });
      }
    }

    try {
      localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings));
      localStorage.setItem('myPlacar_LocalDeviceLabel', matchSettings.deviceLabel || '');
      localStorage.setItem('myPlacar_LocalBrightness', matchSettings.brightness.toString());
      localStorage.setItem('myPlacar_LocalVolume', matchSettings.volume.toString());
      localStorage.setItem('myPlacar_LocalWatchMode', matchSettings.isWatchMode ? 'true' : 'false');
      localStorage.setItem('myPlacar_LocalVoiceURI', matchSettings.selectedVoiceURI || '');
      localStorage.setItem('myPlacar_LocalVoiceEnabled', matchSettings.voiceEnabled ? 'true' : 'false');
      localStorage.setItem('myPlacar_LocalVoiceScoring', matchSettings.voiceScoring ? 'true' : 'false');
      localStorage.setItem('myPlacar_LocalActionCooldown', matchSettings.actionCooldown.toString());
      localStorage.setItem('myPlacar_LocalStateLockout', matchSettings.stateLockout.toString());
      localStorage.setItem('myPlacar_LocalScreenDimTimeout', (matchSettings.screenDimTimeout || 10).toString());
    } catch {}

    if (gameState && !gameState.isConfirmedFinished) {
        setGameState(prevG => {
            if (!prevG) return prevG;
            return {
                ...prevG,
                p1: { ...prevG.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, gender: matchSettings.p1Gender, partnerGender: matchSettings.p1PartnerGender, color: matchSettings.p1Color },
                p2: { ...prevG.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, gender: matchSettings.p2Gender, partnerGender: matchSettings.p2PartnerGender, color: matchSettings.p2Color },
                matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode }
            };
        });
    }
    prevSettingsRef.current = { ...matchSettings };
    try { localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings)); } catch {}
  }, [matchSettings, gameState?.matchId, gameState?.isConfirmedFinished, setIsSettingsInicialSaved, setIsSettingsRegrasSaved, setGameState]);

  // ── BACK-SYNC OBSERVER SETTINGS FROM CLOUD GAME STATE ─────────────────────
  // Se o dispositivo não for o controlador ativo (gameState.commandOwnerId !== deviceId)
  // e a transmissão estiver ativa, sincroniza a configuração da nuvem (matchConfig e players)
  // de volta para o estado local matchSettings do observer. Isso garante que:
  // 1. O observer veja as alterações de regras e nomes em tempo real na tela.
  // 2. Se o observer assumir o controle (take control), não sobrescreva a nuvem com dados obsoletos.
  useEffect(() => {
    if (currentScreen === 'settings') {
      return;
    }
    if (!gameState || !gameState.isMirroringActive || !gameState.commandOwnerId || gameState.commandOwnerId === deviceId) {
      return;
    }

    const cloudConfig = gameState.matchConfig;
    if (!cloudConfig) return;

    setMatchSettings(prev => {
      // 1. Resolve os nomes e propriedades dos times a partir de gameState.p1 e gameState.p2
      const p1Name = gameState.p1?.name ?? prev.p1Name;
      const p1Partner = gameState.p1?.partnerName ?? prev.p1Partner;
      const p1Gender = gameState.p1?.gender ?? prev.p1Gender;
      const p1PartnerGender = gameState.p1?.partnerGender ?? prev.p1PartnerGender;
      const p1Color = gameState.p1?.color ?? prev.p1Color;

      const p2Name = gameState.p2?.name ?? prev.p2Name;
      const p2Partner = gameState.p2?.partnerName ?? prev.p2Partner;
      const p2Gender = gameState.p2?.gender ?? prev.p2Gender;
      const p2PartnerGender = gameState.p2?.partnerGender ?? prev.p2PartnerGender;
      const p2Color = gameState.p2?.color ?? prev.p2Color;

      // 2. Resolve as configurações de regras
      const sportType = cloudConfig.sportType ?? prev.sportType;
      const sets = (cloudConfig.sets ?? cloudConfig.setsToWin ?? prev.sets) as 1 | 3 | 5;
      const gamesPerSet = cloudConfig.gamesPerSet ?? prev.gamesPerSet;
      const isDoubles = cloudConfig.isDoubles ?? prev.isDoubles;
      const noAd = cloudConfig.noAd ?? prev.noAd;
      const tieBreak = cloudConfig.tieBreak ?? prev.tieBreak;
      const tieBreakAt = cloudConfig.tieBreakAt ?? prev.tieBreakAt;
      const tieBreakPoints = cloudConfig.tieBreakPoints ?? prev.tieBreakPoints;
      const tieBreakWinByTwo = cloudConfig.tieBreakWinByTwo ?? prev.tieBreakWinByTwo;
      const switchSidesOdd = cloudConfig.switchSidesOdd ?? prev.switchSidesOdd;
      const tieBreakSideSwitchMode = cloudConfig.tieBreakSideSwitchMode ?? prev.tieBreakSideSwitchMode;
      const pickleballScoringMode = cloudConfig.pickleballScoringMode ?? prev.pickleballScoringMode;
      const pickleballServiceMode = cloudConfig.pickleballServiceMode ?? prev.pickleballServiceMode;
      const useGeminiVoice = cloudConfig.useGeminiVoice ?? prev.useGeminiVoice;
      const voiceEnabled = cloudConfig.voiceEnabled ?? prev.voiceEnabled;
      const voiceScoring = cloudConfig.voiceScoring ?? prev.voiceScoring;
      const winnersStay = cloudConfig.winnersStay ?? prev.winnersStay;

      // 3. Compara com os valores atuais para evitar re-renders ou loops desnecessários
      const hasChanged =
        prev.p1Name !== p1Name ||
        prev.p1Partner !== p1Partner ||
        prev.p1Gender !== p1Gender ||
        prev.p1PartnerGender !== p1PartnerGender ||
        prev.p1Color !== p1Color ||
        prev.p2Name !== p2Name ||
        prev.p2Partner !== p2Partner ||
        prev.p2Gender !== p2Gender ||
        prev.p2PartnerGender !== p2PartnerGender ||
        prev.p2Color !== p2Color ||
        prev.sportType !== sportType ||
        prev.sets !== sets ||
        prev.gamesPerSet !== gamesPerSet ||
        prev.isDoubles !== isDoubles ||
        prev.noAd !== noAd ||
        prev.tieBreak !== tieBreak ||
        prev.tieBreakAt !== tieBreakAt ||
        prev.tieBreakPoints !== tieBreakPoints ||
        prev.tieBreakWinByTwo !== tieBreakWinByTwo ||
        prev.switchSidesOdd !== switchSidesOdd ||
        prev.tieBreakSideSwitchMode !== tieBreakSideSwitchMode ||
        prev.pickleballScoringMode !== pickleballScoringMode ||
        prev.pickleballServiceMode !== pickleballServiceMode ||
        prev.useGeminiVoice !== useGeminiVoice ||
        prev.voiceEnabled !== voiceEnabled ||
        prev.voiceScoring !== voiceScoring ||
        prev.winnersStay !== winnersStay;

      if (!hasChanged) {
        return prev;
      }

      // 4. Retorna as novas configurações mantendo os campos locais-only do observer intactos!
      const updated = {
        ...prev,
        p1Name,
        p1Partner,
        p1Gender,
        p1PartnerGender,
        p1Color,
        p2Name,
        p2Partner,
        p2Gender,
        p2PartnerGender,
        p2Color,
        sportType,
        sets,
        gamesPerSet,
        isDoubles,
        noAd,
        tieBreak,
        tieBreakAt,
        tieBreakPoints,
        tieBreakWinByTwo,
        switchSidesOdd,
        tieBreakSideSwitchMode,
        pickleballScoringMode,
        pickleballServiceMode,
        useGeminiVoice,
        voiceEnabled,
        voiceScoring,
        winnersStay,
      };

      // Sincroniza também o prevSettingsRef para evitar loops no outro useEffect
      prevSettingsRef.current = { ...updated };
      return updated;
    });
  }, [
    gameState?.isMirroringActive,
    gameState?.commandOwnerId,
    gameState?.matchConfig,
    gameState?.p1,
    gameState?.p2,
    deviceId,
    currentScreen
  ]);


  useEffect(() => {
    if (!prevProfileRef.current) { prevProfileRef.current = { ...userProfile }; return; }
    const prev = prevProfileRef.current;
    if (prev.name !== userProfile.name || prev.nickname !== userProfile.nickname || prev.gender !== userProfile.gender || prev.authMethod !== userProfile.authMethod) {
      setIsProfileSaved(false);
    }
    if (prev.authMethod === 'pin' && userProfile.authMethod === 'password') {
      handleSaveProfile();
    }
  }, [userProfile, setIsProfileSaved, handleSaveProfile]);

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
        const { doc, updateDoc } = await import('firebase/firestore');
        updateDoc(doc(db, "live_matches", targetPin), {
          isMatchOver: true,
          isConfirmedFinished: true,
          matchEndedAt: Date.now(),
          isLiveClosed: true,
          isMirroringActive: false,
          lastActivityAt: Date.now()
        }).catch(() => {});
        setTimeout(async () => {
          const { doc, deleteDoc } = await import('firebase/firestore');
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
      const { doc, updateDoc } = await import('firebase/firestore');
      updateDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), {
        isMatchOver: true,
        isConfirmedFinished: true,
        matchEndedAt: Date.now()
      }).catch(() => {});
    }
  }, [persistHistory, userProfile.pin, partners, setPlayerQueue, resolveTargetPin]);

  const handleLeaveLive = useCallback(async () => {
    if (!gameState?.isMirroringActive || !userProfile.email || !navigator.onLine) return;
    const db = getDb();
    if (!db) return;
    const targetPin = resolveTargetPin('handleLeaveLive');
    if (!targetPin) return;

    try {
      const isActiveController = gameState.commandOwnerId === deviceId;
      const { doc, updateDoc, deleteField } = await import('firebase/firestore');

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
  }, [gameState, userProfile.email, userProfile.pin, deviceId, isOriginalOwner, resolveTargetPin]);

  const handleCloseCloudLive = useCallback(async () => {
    const db = getDb();
    if (!db) { setModalConfig({ title: "Erro", message: "Banco de dados não disponível.", onConfirm: () => setModalConfig(null) }); return; }
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Sem conexão com a internet.", onConfirm: () => setModalConfig(null) }); return; }
    if (!userProfile.pin) { setModalConfig({ title: "Erro", message: "PIN não cadastrado.", onConfirm: () => setModalConfig(null) }); return; }
    
    const targetPin = resolveTargetPin('close');
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
      const { doc, updateDoc, deleteDoc } = await import('firebase/firestore');
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
  }, [userProfile.pin, gameState?.ownerPin, resolveTargetPin, isClosingLiveRef, setCloudLiveExists, setActiveLives, setShowLiveControlOverlay, setCurrentScreen, setModalConfig, deviceId, livePapel]);

  const handleDeleteJudge = useCallback(async () => {
    if (!userProfile.pin) return;
    const db = getDb();
    if (!db) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
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
    return `${label} (${nick})`;
  }, [matchSettings.deviceLabel, userProfile.nickname]);

  const handleControlLive = useCallback(async () => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para assumir o controle.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    if (db && userProfile.pin) {
      const targetPin = resolveTargetPin('write');
      if (!targetPin) return;
      try {
        const { doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudState = snap.data() as GameState;

          const currentControllerId = cloudState.commandOwnerId;

          const myCommandName = currentFullDeviceName;
          // Proprietário → 'owner'; juiz formal → 'judge'; qualquer outro → 'observer'
          const newControllerRole: 'owner' | 'judge' | 'observer' = isOriginalOwner ? 'owner' : livePapel === 'judge' ? 'judge' : 'observer';
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
              const demotedRole = prevEntry.isOwner || prevEntry.role === 'owner' ? 'owner' : (prevEntry.role === 'judge' ? 'judge' : 'observer');
              prevDemoteUpdate[`controllers.${currentControllerId}`] = { ...prevEntry, role: demotedRole, status: 'watcher' };
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
              [`controllers.${deviceId}`]: { label: myCommandName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: newControllerRole, status: 'controller', deviceType: getDeviceType() }
            }).catch(() => {});
            const localControllers: Record<string, unknown> = { ...(cloudState.controllers || {}) };
            if (currentControllerId && currentControllerId !== deviceId) {
              const prevEntry = (cloudState.controllers || {})[currentControllerId];
              if (prevEntry) {
                const demotedRole = prevEntry.isOwner || prevEntry.role === 'owner' ? 'owner' : (prevEntry.role === 'judge' ? 'judge' : 'observer');
                localControllers[currentControllerId] = { ...prevEntry, role: demotedRole, status: 'watcher' };
              }
            }
            localControllers[deviceId] = { label: myCommandName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: newControllerRole, status: 'controller', deviceType: getDeviceType() };

            tookControlAtRef.current = Date.now();
            const settingsAsController = {
              ...syncedSettings,
              isWatchMode: isWatchDevice() ? true : syncedSettings.isWatchMode,
              isScoreboardMode: false,
            };
            setMatchSettings(settingsAsController); 
            try { localStorage.setItem('myPlacarSettings', JSON.stringify(settingsAsController)); } catch {}
            setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true);
            setGameState({ ...updatedState, isMirroringActive: true, controllers: localControllers, matchConfig: { ...updatedState.matchConfig, isWatchMode: isWatchDevice() ? true : resolveWatchMode(matchSettings.isWatchMode ?? false), isScoreboardMode: false, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
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
  }, [userProfile.pin, gameState?.ownerPin, resolveTargetPin, setModalConfig, currentFullDeviceName, isOriginalOwner, livePapel, matchSettings, deviceId, setMatchSettings, setIsSettingsInicialSaved, setIsSettingsRegrasSaved, setGameState, overlayAcceptedRef, setShowLiveControlOverlay, setCurrentScreen, setCloudLiveExists, tookControlAtRef]);

  const handleObserveLive = useCallback(async (targetPin?: string) => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para observar.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    let pinToObserve = targetPin || userProfile.pin?.toUpperCase();
    const myPin = userProfile.pin?.toUpperCase();
    const isJudgeForLive = (live: GameState) =>
      !!myPin && (live.judgePin?.toUpperCase() === myPin || live.judge?.pin?.toUpperCase() === myPin);

    if (!targetPin && myPin) {
      const judgeMatch = activeLives.find(isJudgeForLive);
      if (judgeMatch && judgeMatch.ownerPin) {
        pinToObserve = judgeMatch.ownerPin;
      } else {
        const ownerLive = activeLives.find(l =>
          l.ownerPin?.toUpperCase() === myPin
        );
        if (ownerLive && ownerLive.ownerPin) {
          pinToObserve = ownerLive.ownerPin.toUpperCase();
        }
      }
    }

    if (db && pinToObserve) {
      const pinUpper = pinToObserve.toUpperCase();
      try {
        const { doc, getDoc, updateDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, "live_matches", pinUpper));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudData = snap.data() as GameState;
          const isAuthorizedLive =
            !!myPin &&
            (cloudData.ownerPin?.toUpperCase() === myPin ||
              cloudData.ownerDeviceId === deviceId ||
              isJudgeForLive(cloudData));
          if (!isAuthorizedLive) {
            overlayAcceptedRef.current = null;
            setCloudLiveExists(false);
            setShowLiveControlOverlay(false);
            setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
            setModalConfig({ title: "Atenção", message: "Live não encontrada ou não autorizada para o usuário logado.", onConfirm: () => setModalConfig(null) });
            return;
          }
          const myCommandName = currentFullDeviceName;
          const myNickname = userProfile.nickname || userProfile.name.split(' ')[0];
          const isSecondaryDevice = cloudData.ownerPin?.toUpperCase() === myPin && cloudData.ownerDeviceId && cloudData.ownerDeviceId !== deviceId;
          // joinRole: proprietário é determinado por ownerDeviceId (imutável), nunca pelo campo gravado.
          // Juiz só é reconhecido se foi formalmente convidado via judgePin — não por role gravado anteriormente.
          // Qualquer outro caso é sempre 'observer'.
          const isFormalJudge = !!(myPin && (cloudData.judge?.pin?.toUpperCase() === myPin || cloudData.judgePin?.toUpperCase() === myPin));
          const joinRole: 'owner' | 'judge' | 'observer' =
            (cloudData.ownerDeviceId && cloudData.ownerDeviceId === deviceId) ? 'owner'
            : isFormalJudge ? 'judge'
            : 'observer';

          const enterAsObserver = joinRole === 'observer';
          // Observadores preservam o commandOwnerId da cloud — não assumem controle ao entrar.
          // Apenas o proprietário (ou juiz em dispositivo primário) se torna controller imediatamente.
          const resolvedCommandOwnerId = (isSecondaryDevice || enterAsObserver) ? cloudData.commandOwnerId : deviceId;
          const isEnteringAsController = resolvedCommandOwnerId === deviceId;
          const initialStatus: 'controller' | 'watcher' = isEnteringAsController ? 'controller' : 'watcher';

          await updateDoc(doc(db, "live_matches", pinUpper), {
            [`controllers.${deviceId}`]: { label: myCommandName, nickname: myNickname, lastSeen: Date.now(), role: joinRole, status: initialStatus, deviceType: getDeviceType(), isOwner: joinRole === 'owner' }
          }).catch((err) => {
            console.error("Firebase join error:", err);
            localStorage.setItem('myPlacar_last_firebase_error', `join: ${err?.message || err}`);
          });
          
          if (cloudData.matchConfig) {
            setMatchSettings(prev => ({
              ...prev,
              ...cloudData.matchConfig,
              ...(enterAsObserver ? { isWatchMode: false, isScoreboardMode: true } : {}),
            }));
          }

          const nextControllers = {
            ...(cloudData.controllers || {}),
            [deviceId]: { label: myCommandName, nickname: myNickname, lastSeen: Date.now(), role: joinRole, status: initialStatus, deviceType: getDeviceType(), isOwner: joinRole === 'owner' }
          };
          const watchModeForEntry = enterAsObserver ? false : resolveWatchMode(matchSettings.isWatchMode ?? false);
          const scoreboardModeForEntry = enterAsObserver ? true : false;
          setGameState({ ...cloudData, isMirroringActive: true, isLiveClosed: false, commandOwnerId: resolvedCommandOwnerId, controllers: nextControllers, matchConfig: { ...cloudData.matchConfig, isWatchMode: watchModeForEntry, isScoreboardMode: scoreboardModeForEntry, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
          if (enterAsObserver || isWatchDevice()) setMatchSettings(prev => ({ ...prev, isScoreboardMode: scoreboardModeForEntry, isWatchMode: watchModeForEntry }));
          overlayAcceptedRef.current = pinUpper;
          setShowLiveControlOverlay(false); setCurrentScreen('scoreboard');
        } else {
          overlayAcceptedRef.current = null;
          if (!targetPin) setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Aten\u00e7\u00e3o", message: "A partida ao vivo n\u00e3o foi encontrada ou j\u00e1 foi encerrada.", onConfirm: () => setModalConfig(null) });
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
      const { doc, getDoc, setDoc } = await import('firebase/firestore');
      if (isController) {
        const stateToSync = sanitizeForFirestore({ ...gameState, controllers: undefined });
        if (stateToSync) {
          await setDoc(doc(db, "live_matches", targetPin), { ...stateToSync, lastActivityAt: Date.now() }, { merge: true });
        }
      } else {
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists()) {
          const cloudData = snap.data() as GameState;
          setGameState(prev => {
            if (!prev) return cloudData as GameState;
            // Merge conservador: mesma lógica do onSnapshot observer.
            // ownerPin e ownerDeviceId são imutáveis — nunca sobrescrever.
            // Preferências locais de matchConfig são preservadas.
            const lockedOwnerPin = prev.ownerPin || cloudData.ownerPin;
            const lockedOwnerDeviceId = prev.ownerDeviceId || cloudData.ownerDeviceId;
            const baseConfig = prev.matchConfig;
            return {
              ...cloudData,
              matchDuration: Math.max(prev.matchDuration || 0, cloudData.matchDuration || 0),
              ownerPin: lockedOwnerPin,
              ownerDeviceId: lockedOwnerDeviceId,
              isMirroringActive: true,
              isLiveClosed: false,
              commandOwnerId: cloudData.commandOwnerId ?? prev.commandOwnerId,
              matchConfig: {
                ...cloudData.matchConfig,
                brightness: baseConfig?.brightness,
                volume: baseConfig?.volume,
                deviceLabel: baseConfig?.deviceLabel,
                selectedVoiceURI: baseConfig?.selectedVoiceURI,
                voiceEnabled: baseConfig?.voiceEnabled,
                voiceScoring: baseConfig?.voiceScoring,
                actionCooldown: baseConfig?.actionCooldown,
                stateLockout: baseConfig?.stateLockout,
              },
            };
          });
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
          const { doc, setDoc } = await import('firebase/firestore');
          await setDoc(doc(db as Firestore, 'users', userProfile.pin.toUpperCase(), 'partners', pinUpper), {
            pin: pinUpper,
            nickname: finalNickname,
            addedAt: newPartner.addedAt,
            origin: 'manual'
          }).catch(err => console.error("Erro ao salvar parceiro no Firestore:", err));
        }
      }

      const { doc, updateDoc } = await import('firebase/firestore');
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

  const handleScoreUpdate = useCallback((player: 1 | 2, type: PointType = 'rally', source: string = 'cb') => {
    setGameState(prev => {
      if (!prev || prev.isConfirmedFinished || prev.isMatchOver || (prev.isMirroringActive && prev.isLiveClosed)) return prev;
      if (prev.isMirroringActive && prev.commandOwnerId !== deviceId) return prev;
      if (!prev.isMirroringActive && prev.judgePin && prev.commandOwnerId !== deviceId) return prev;
      
      const next = incrementScore(prev, player, type, source);
      next.isPaused = false;
      
      setHistoryStack(stack => {
        const updated = [...stack, JSON.parse(JSON.stringify(next))];
        historyStackRef.current = updated;
        return updated;
      });
      return { ...next };
    });
  }, [deviceId]);

  const handleCorrectScore = useCallback((type: 'game' | 'gameSet' | 'matchSet', value: string, options?: { forceLocal?: boolean }) => {
    const forceLocal = options?.forceLocal === true;
    if (!gameState || gameState.isMatchOver || (!forceLocal && gameState.isMirroringActive && gameState.isLiveClosed)) return;
    if (!forceLocal && gameState.isMirroringActive && gameState.commandOwnerId !== deviceId) return;
    
    const match = value.toLowerCase().match(/(\d+|ad)\s*[a-]\s*(\d+|ad)/);
    if (!match) return;
    const v1 = match[1]; const v2 = match[2];
    const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
    if (type === 'game') {
      const tennisMap: Record<string, number> = { '0': 0, '15': 1, '30': 2, '40': 3, 'ad': 4 };
      const p1Target = tennisMap[v1] ?? parseInt(v1); const p2Target = tennisMap[v2] ?? parseInt(v2);
      const lastFinalizedIdx = [...(nextState.pointHistory ?? [])].reverse().findIndex(p => !!p.resultingScore);
      const startIndex = lastFinalizedIdx === -1 ? 0 : (nextState.pointHistory ?? []).length - lastFinalizedIdx;
      nextState.pointHistory = (nextState.pointHistory ?? []).slice(0, startIndex);
      for (let i = 0; i < p1Target; i++) nextState.pointHistory.push({ winner: 1, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb' });
      for (let i = 0; i < p2Target; i++) nextState.pointHistory.push({ winner: 2, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb' });
      nextState.p1.score = v1.charAt(0).toUpperCase() + v1.slice(1); nextState.p2.score = v2.charAt(0).toUpperCase() + v2.slice(1);
    } else if (type === 'gameSet') {
      const g1 = parseInt(v1); const g2 = parseInt(v2);
      nextState.pointHistory = []; nextState.p1.games = g1; nextState.p2.games = g2; nextState.p1.score = '0'; nextState.p2.score = '0';
      for (let g = 0; g < g1; g++) { for (let b = 0; b < 4; b++) nextState.pointHistory.push({ winner: 1, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb', resultingScore: b === 3 ? `${g+1}-${nextState.p2.games}` : undefined }); }
      for (let g = 0; g < g2; g++) { for (let b = 0; b < 4; b++) nextState.pointHistory.push({ winner: 2, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb', resultingScore: b === 3 ? `${nextState.p1.games}-${g+1}` : undefined }); }
    } else if (type === 'matchSet') {
      const s1 = parseInt(v1); const s2 = parseInt(v2);
      const maxGames = nextState.matchConfig.gamesPerSet || 6;
      nextState.p1.sets = []; nextState.p2.sets = [];
      for (let i = 0; i < s1; i++) { nextState.p1.sets.push(maxGames); nextState.p2.sets.push(0); }
      for (let i = 0; i < s2; i++) { nextState.p1.sets.push(0); nextState.p2.sets.push(maxGames); }
      nextState.p1.games = 0; nextState.p2.games = 0;
      nextState.p1.score = '0'; nextState.p2.score = '0';
      nextState.currentSet = s1 + s2;
    }
    setGameState(nextState); setHistoryStack([JSON.parse(JSON.stringify(nextState))]);
  }, [gameState, deviceId, setGameState]);

  const handleUndo = useCallback(() => {
    const isCommandOwner = !gameState?.isMirroringActive || gameState?.commandOwnerId === deviceId;
    if (!gameState || !isCommandOwner) return;
    const stack = historyStackRef.current;
    const p = undoPoint(stack);
    if (p) {
      const s = gameState;
      const isFinishedPending = (s.isMatchOver && !s.isConfirmedFinished);
      if (isFinishedPending) {
        setHistoryStack(stack.slice(0, -1));
        setGameState({ ...p, isPaused: false, isMatchOver: false });
        return;
      }
      setHistoryStack(stack.slice(0, -1));
      setGameState({ ...p, isPaused: false, isMatchOver: false });
    }
  }, [gameState, deviceId, setGameState]);

  const handleSmartSwitchServer = useCallback(() => {
    const isCommandOwner = !gameState?.isMirroringActive || gameState?.commandOwnerId === deviceId;
    if (!gameState || !isCommandOwner) return;
    setGameState(prev => prev ? { ...prev, server: prev.server === 1 ? 2 : 1 } : null);
  }, [gameState, deviceId, setGameState]);

  const handleTogglePause = useCallback(() => {
    const isCommandOwner = !gameState?.isMirroringActive || gameState?.commandOwnerId === deviceId;
    if (!gameState || gameState.isConfirmedFinished || gameState.isMatchOver || (gameState.isMirroringActive && gameState.isLiveClosed) || !isCommandOwner) return;
    setGameState(p => {
      if (!p) return null;
      const isNowPaused = !p.isPaused;
      const now = Date.now();
      if (isNowPaused) {
        return { ...p, isPaused: true, lastPauseTime: now };
      } else {
        const pausedDuration = p.lastPauseTime ? now - p.lastPauseTime : 0;
        return {
          ...p,
          isPaused: false,
          accumulatedPausedTime: (p.accumulatedPausedTime || 0) + pausedDuration,
          lastPauseTime: undefined
        };
      }
    });
  }, [gameState, deviceId, setGameState]);

  const startGame = useCallback((state: GameState) => {
    setGameState(state);
    setHistoryStack([state]);
    setLiveLogs([]); // Zera logs ao iniciar nova partida
    setVoiceLogs([]); // Zera voice logs ao iniciar nova partida
    try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(state)); } catch {}
  }, [setGameState, setHistoryStack, setLiveLogs, setVoiceLogs]);

  const handleResetMatch = useCallback(() => {
    if (!gameState) return;
    setModalConfig({
      title: "Zerar partida",
      message: "Deseja zerar a partida? Esta ação não pode ser desfeita.",
      confirmLabel: "Sim, zerar",
      onConfirm: () => {
        const current = gameState;
        const initialServer = current.matchConfig.initialServer ?? 1;

        const resetState: GameState = {
          ...current,
          matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: Date.now(),
          p1: {
            ...current.p1,
            name: current.matchConfig.p1Name,
            partnerName: current.matchConfig.p1Partner,
            color: current.matchConfig.p1Color,
            score: '0',
            games: 0,
            sets: []
          },
          p2: {
            ...current.p2,
            name: current.matchConfig.p2Name,
            partnerName: current.matchConfig.p2Partner,
            color: current.matchConfig.p2Color,
            score: '0',
            games: 0,
            sets: []
          },
          server: initialServer,
          servingOrderOffset: initialServer === 1 ? 0 : 1,
          pointHistory: [],
          history: [],
          currentSet: 0,
          isMatchOver: false,
          isConfirmedFinished: false,
          matchDuration: 0,
          isPaused: false,
          isLiveClosed: false,
          pickleball: undefined,
          // Preserva o motor original — reset não muda de esporte
          scoringEngine: current.scoringEngine ?? getEngineForSport(current.matchConfig.sportType),
        };

        if (resetState.matchConfig.sportType === 'pickleball') {
          resetState.pickleball = initPickleballState(resetState);
          resetState.server = resetState.pickleball.server.team;
          resetState.servingOrderOffset =
            (resetState.pickleball.server.team === 1 ? 0 : 1) +
            (resetState.pickleball.server.serverNumber === 2 ? 2 : 0);
        }

        setIsRecoveryFromMatchOver(false);
        setIsWaitingSync(false);
        startGame(resetState);
        setModalConfig(null);
      },
      onCancel: () => setModalConfig(null)
    });
  }, [gameState, setModalConfig, setIsRecoveryFromMatchOver, setIsWaitingSync, startGame]);

  const canStartMatch = useMemo(() => {
    const s = matchSettings;
    if (!s.isDoubles) return s.p1Name.trim().length > 0 && s.p2Name.trim().length > 0;
    return s.p1Name.trim().length > 0 && (s.p1Partner || '').trim().length > 0 && s.p2Name.trim().length > 0 && (s.p2Partner || '').trim().length > 0;
  }, [matchSettings]);

  const finalizationTimerRef = useRef<any>(null);



  const initGameStateInternal = useCallback(async (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => {
    const savedSettings = safeJsonParse('myPlacarSettings', matchSettings);
    let configToUse = { ...savedSettings };
    let tournamentMeta: Partial<GameState> = {};

    if (tournamentOverride) {
       const { match, pair1, pair2, event } = tournamentOverride;
       configToUse = {
          ...matchSettings,
          p1Name: pair1.p1.nickname,
          p1Partner: pair1.p2.nickname,
          p2Name: pair2.p1.nickname,
          p2Partner: pair2.p2.nickname,
          isDoubles: true,
          p1Verified: true, p1PartnerVerified: true, p2Verified: true, p2PartnerVerified: true,
          ...(event.config || {})
       };
       tournamentMeta = {
          tournamentMatchId: match.id,
          tournamentPin: event.pin
       };
       forceNew = true;
        if (navigator.onLine) {
           const db = getDb();
           if (db) {
              markTournamentMatchLive(db as Firestore, event.pin, event.matches || [], match.id, userProfile.pin).catch(() => {});
           }
        }
    }

    if (isWatchDevice()) {
      configToUse = { ...configToUse, isWatchMode: true, isScoreboardMode: false };
    }

    if (gameState?.isMirroringActive && userProfile.email && navigator.onLine && gameState.commandOwnerId === deviceId) {
       const db = getDb();
       if (db) {
          const updatedMatchConfig = { ...configToUse, setsToWin: configToUse.sets, isWatchMode: !!configToUse.isWatchMode };
          const stateToSync = sanitizeForFirestore({
             ...gameState,
             controllers: undefined,
             p1: { ...gameState.p1, name: configToUse.p1Name, partnerName: configToUse.p1Partner, gender: configToUse.p1Gender, partnerGender: configToUse.p1PartnerGender, color: configToUse.p1Color },
             p2: { ...gameState.p2, name: configToUse.p2Name, partnerName: configToUse.p2Partner, gender: configToUse.p2Gender, partnerGender: configToUse.p2PartnerGender, color: configToUse.p2Color },
             matchConfig: updatedMatchConfig,
             isLiveClosed: false
          });
          const targetPin = resolveTargetPin('initSync');
          if (stateToSync && targetPin) await setDoc(doc(db, "live_matches", targetPin), stateToSync, { merge: true }).catch(() => {});
       }
    }

    if (forceNew && navigator.onLine) {
        const db = getDb();
        if (db && userProfile.pin) {
           const pinUpper = userProfile.pin.toUpperCase();
           try {
             const snap = await getDoc(doc(db, "live_matches", pinUpper));
             if (snap.exists()) {
               await deleteDoc(doc(db, "live_matches", pinUpper)).catch(() => {});
             }
           } catch {}
        }
    }
    if (gameState && gameState.isMatchOver && !gameState.isConfirmedFinished) finalizeMatchInternal({ ...gameState, isConfirmedFinished: true });
    
    setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true); setIsRecoveryFromMatchOver(false);
    if (!forceNew && navigator.onLine) {
        const db = getDb();
        if (db && userProfile.pin) {
           try {
             const snap = await getDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()));
             if (snap.exists() && snap.data().isLiveClosed !== true) { 
                if (gameState && gameState.ownerPin?.toUpperCase() === userProfile.pin.toUpperCase()) {
                   setCurrentScreen('scoreboard'); 
                   return; 
                }
                setIsWaitingSync(true); 
                setCurrentScreen('scoreboard'); 
                return; 
             }
           } catch {}
        }
    }
    if (!forceNew && gameState) {
      const updatedState: GameState = { 
        ...gameState, 
        isLiveClosed: false,
        matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: isWatchDevice() ? false : !!matchSettings.isScoreboardMode }, 
        p1: { ...gameState.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, gender: matchSettings.p1Gender, partnerGender: matchSettings.p1PartnerGender, color: matchSettings.p1Color }, 
        p2: { ...gameState.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, gender: matchSettings.p2Gender, partnerGender: matchSettings.p2PartnerGender, color: matchSettings.p2Color }, 
        isPaused: false 
      };
      // flushSync removido: causava interferência com o modal de partida em andamento.
      // O timing do anúncio é resolvido no useScoreAnnouncer via gameState.p1.gender dep.
      setGameState(updatedState);
      try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updatedState)); } catch {}
      setCurrentScreen('scoreboard'); return;
    }
    
    if (!tournamentOverride && !canStartMatch) return;
    const globalLiveCount = parseInt(localStorage.getItem('myPlacarLiveGlobalCount') || '0') + 1;
    try { localStorage.setItem('myPlacarLiveGlobalCount', globalLiveCount.toString()); } catch {}
    const db = getDb();
    if (db && userProfile.pin && navigator.onLine) { 
      try { 
        await deleteDoc(doc(db, "live_matches", userProfile.pin.toUpperCase())).catch(() => {}); 
      } catch {} 
    }
    
    const newGameState: GameState = {
      matchId: `match_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      startTime: Date.now(),
      p1: { name: configToUse.p1Name, partnerName: configToUse.p1Partner, gender: configToUse.p1Gender, partnerGender: configToUse.p1PartnerGender, score: '0', games: 0, sets: [], color: configToUse.p1Color },
      p2: { name: configToUse.p2Name, partnerName: configToUse.p2Partner, gender: configToUse.p2Gender, partnerGender: configToUse.p2PartnerGender, score: '0', games: 0, sets: [], color: configToUse.p2Color },
      server: configToUse.initialServer, servingOrderOffset: configToUse.initialServer === 1 ? 0 : 1,
      pointHistory: [], matchConfig: { ...configToUse, setsToWin: configToUse.sets, isWatchMode: !!configToUse.isWatchMode, isScoreboardMode: isWatchDevice() ? false : !!configToUse.isScoreboardMode }, history: [], currentSet: 0, isMatchOver: false, isConfirmedFinished: false, matchDuration: 0, isPaused: false, 
      isMirroringActive: false, isLiveClosed: false, ownerPin: userProfile.pin, ownerDeviceId: deviceId,
      liveSessionCounter: globalLiveCount, commandOwner: currentFullDeviceName, commandOwnerId: deviceId, 
      controllers: { [deviceId]: { label: currentFullDeviceName, lastSeen: Date.now(), isOwner: true, role: 'owner' } },
      ...tournamentMeta
    };
    
    if (configToUse.sportType === 'pickleball') {
      newGameState.pickleball = initPickleballState(newGameState);
      newGameState.servingOrderOffset =
        (newGameState.pickleball.server.team === 1 ? 0 : 1) +
        (newGameState.pickleball.server.serverNumber === 2 ? 2 : 0);
    }

    // Motor imutável: gravado uma única vez na criação. Nunca sobrescrito pelo useEffect
    // de matchSettings (que só atualiza p1, p2 e matchConfig, não a raiz do GameState).
    newGameState.scoringEngine = getEngineForSport(configToUse.sportType);
    
    setMatchSettings(configToUse);
    if (userProfile.pin) persistLiveOwnerPin(userProfile.pin);
    startGame(newGameState);
    setCurrentScreen('scoreboard');
  }, [
    canStartMatch, matchSettings, gameState, userProfile.pin, userProfile.email,
    deviceId, currentFullDeviceName, resolveTargetPin, finalizeMatchInternal, startGame,
    setMatchSettings, setGameState, setCurrentScreen, setIsSettingsInicialSaved,
    setIsSettingsRegrasSaved, setIsRecoveryFromMatchOver, setIsWaitingSync,
  ]);

  const initGameState = useCallback(async (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => {
    if (finalizationTimerRef.current) { clearTimeout(finalizationTimerRef.current); finalizationTimerRef.current = null; }
    if (forceNew && !tournamentOverride && gameState && (gameState.p1.games > 0 || gameState.p2.games > 0 || gameState.p1.sets.length > 0 || gameState.p1.score !== '0' || gameState.p2.score !== '0')) {
       setModalConfig({
         title: "Deseja iniciar uma nova partida?",
         message: "O placar atual está em andamento. Deseja realmente iniciar uma nova partida?",
         confirmLabel: "Sim, iniciar",
         cancelLabel: "Não, continuar a partida",
         onConfirm: () => { setModalConfig(null); initGameStateInternal(forceNew, tournamentOverride); },
         onCancel: () => { setModalConfig(null); setCurrentScreen('scoreboard'); }
       });
       return;
    }
    initGameStateInternal(forceNew, tournamentOverride);
  }, [gameState, setModalConfig, setCurrentScreen, initGameStateInternal]);

  // ── Passo 6.1.4: handleExportData migrado do AppInner ───────────────────
  // Gera e faz download de um arquivo JSON com backup completo dos dados.
  // Usa matchHistoryRef (ref do provider) para ler o histórico sem dep reativa.
  // playerQueue vive no UIContext e é consumido via useUI() neste provider.
  const handleExportData = useCallback(() => {
    const data = {
      profile: userProfile,
      history: matchHistoryRef.current,
      settings: matchSettings,
      partners,
      playerQueue,
      exportDate: new Date().toISOString(),
      appVersion: APP_VERSION,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myplacar_backup_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [userProfile, matchSettings, partners, playerQueue]);

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
    handleSaveProfile,
    historyStack,
    setHistoryStack,
    handleScoreUpdate,
    handleCorrectScore,
    handleUndo,
    startGame,
    handleResetMatch,
    initGameState,
    canStartMatch,
    handleExportData,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

// ─── Exportação do contexto bruto ─────────────────────────────────────────────
export { GameContext };
