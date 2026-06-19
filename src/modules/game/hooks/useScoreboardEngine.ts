import { useCallback, useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { getDb } from '@infra/firebase';
import { useLive } from '@modules/live/useLive';
import { useUI } from '@modules/ui/UIContext';
import type { GameState, MatchSettings } from '../../../types.ts';
import { getDeviceId } from '@shared/utils/device';
import { sanitizeForFirestore } from '@shared/utils/sanitize';
import { useGame } from '../useGame.ts';
import { useGameRules } from './useGameRules.ts';

/** Orquestração de placar no App: pausa, troca de saque, fim de partida → histórico. */
export function useScoreboardEngine() {
  const {
    gameState,
    setGameState,
    matchSettings,
    setMatchSettings,
    matchHistoryRef,
    finalizeMatchInternal,
    userProfile,
  } = useGame();
  const { isCommandOwner, resolveTargetPin } = useLive();
  const { setIsSettingsInicialSaved } = useUI();
  const { persistMatchSettings } = useGameRules();
  const deviceId = getDeviceId();
  const prevSettingsRef = useRef<MatchSettings | null>(null);

  useEffect(() => {
    if (
      gameState?.isConfirmedFinished &&
      !matchHistoryRef.current.some((m) => m.id === gameState.matchId)
    ) {
      finalizeMatchInternal(gameState);
    }
  }, [gameState?.isConfirmedFinished, gameState?.matchId, finalizeMatchInternal, matchHistoryRef]);

  const handleTogglePause = useCallback(() => {
    const mayCommand = !gameState?.isMirroringActive || gameState?.commandOwnerId === deviceId;
    if (
      !gameState ||
      gameState.isConfirmedFinished ||
      gameState.isMatchOver ||
      (gameState.isMirroringActive && gameState.isLiveClosed) ||
      !mayCommand
    ) {
      return;
    }
    setGameState((p) => {
      if (!p) return null;
      const isNowPaused = !p.isPaused;
      const now = Date.now();
      if (isNowPaused) {
        return { ...p, isPaused: true, lastPauseTime: now };
      }
      const pausedDuration = p.lastPauseTime ? now - p.lastPauseTime : 0;
      return {
        ...p,
        isPaused: false,
        accumulatedPausedTime: (p.accumulatedPausedTime || 0) + pausedDuration,
        lastPauseTime: undefined,
      };
    });
  }, [gameState, deviceId, setGameState]);

  const handleSmartSwitchServer = useCallback(
    (team: 1 | 2, isPartner: boolean) => {
      if (!gameState || !isCommandOwner || gameState.isMatchOver) return;
      setIsSettingsInicialSaved(true);
      persistMatchSettings();
      const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const nextSettings = { ...matchSettings };

      const isPickleballRally =
        nextState.matchConfig.sportType === 'pickleball' &&
        nextState.matchConfig.pickleballScoringMode === 'rally';

      if (isPickleballRally && nextState.pickleball) {
        const newOffset = (team === 1 ? 0 : 1) + (isPartner ? 2 : 0);
        const newServerNumber: 1 | 2 = isPartner ? 2 : 1;
        const sacadorScore =
          team === 1 ? nextState.pickleball.score.team1 : nextState.pickleball.score.team2;
        const newSide = sacadorScore % 2 === 0 ? 'even' : 'odd';

        nextState.pickleball.server.team = team;
        nextState.pickleball.server.serverNumber = newServerNumber;
        nextState.pickleball.server.rallyOffset = newOffset;
        nextState.pickleball.server.side = newSide;
        if (team === 1) {
          nextState.pickleball.server.serverName = isPartner
            ? nextState.p1.partnerName || nextState.p1.name
            : nextState.p1.name;
        } else {
          nextState.pickleball.server.serverName = isPartner
            ? nextState.p2.partnerName || nextState.p2.name
            : nextState.p2.name;
        }

        nextState.server = team;
        nextState.servingOrderOffset = newOffset;
        nextState.matchConfig = { ...nextState.matchConfig, ...nextSettings };
        setMatchSettings(nextSettings);
        prevSettingsRef.current = { ...nextSettings };
        setGameState(nextState);
        setIsSettingsInicialSaved(true);
        try {
          localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
          localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
        } catch {
          /* best-effort */
        }
        if (
          nextState.isMirroringActive &&
          userProfile.email &&
          navigator.onLine &&
          nextState.commandOwnerId === deviceId
        ) {
          const db = getDb();
          if (db) {
            const targetPin = resolveTargetPin('initSync');
            const stateToSync = sanitizeForFirestore({ ...nextState, controllers: undefined });
            if (stateToSync && targetPin) {
              setDoc(doc(db, 'live_matches', targetPin), stateToSync, { merge: true }).catch(() => {});
            }
          }
        }
        if (navigator.vibrate) navigator.vibrate(30);
        return;
      }

      const totalGames = gameState.p1.games + gameState.p2.games;
      const expectedServingTeam = totalGames % 2 === 0 ? 1 : 2;

      if (team !== expectedServingTeam) {
        const p1Tmp = { ...nextState.p1 };
        nextState.p1 = { ...nextState.p2 };
        nextState.p2 = p1Tmp;
        const tmpName = nextSettings.p1Name;
        const tmpPartner = nextSettings.p1Partner;
        const tmpV1 = nextSettings.p1Verified;
        const tmpPV1 = nextSettings.p1PartnerVerified;
        const tmpG1 = nextSettings.p1Gender;
        const tmpPG1 = nextSettings.p1PartnerGender;

        nextSettings.p1Name = nextSettings.p2Name;
        nextSettings.p1Partner = nextSettings.p2Partner;
        nextSettings.p1Verified = nextSettings.p2Verified;
        nextSettings.p1PartnerVerified = nextSettings.p2PartnerVerified;
        nextSettings.p1Gender = nextSettings.p2Gender;
        nextSettings.p1PartnerGender = nextSettings.p2PartnerGender;

        nextSettings.p2Name = tmpName;
        nextSettings.p2Partner = tmpPartner;
        nextSettings.p2Verified = tmpV1;
        nextSettings.p2PartnerVerified = tmpPV1;
        nextSettings.p2Gender = tmpG1;
        nextSettings.p2PartnerGender = tmpPG1;
      }

      const currentCycle = totalGames % 4;
      const expectedIsPartnerSlot = currentCycle === 2 || currentCycle === 3;
      if (isPartner !== expectedIsPartnerSlot) {
        if (expectedServingTeam === 1) {
          const tmpName = nextState.p1.name;
          const tmpPartnerName = nextState.p1.partnerName;
          nextState.p1.name = tmpPartnerName || '';
          nextState.p1.partnerName = tmpName;
          nextSettings.p1Name = nextState.p1.name;
          nextSettings.p1Partner = nextState.p1.partnerName;
          const vTmp = nextSettings.p1Verified;
          nextSettings.p1Verified = nextSettings.p1PartnerVerified;
          nextSettings.p1PartnerVerified = vTmp;
          const gTmp = nextState.p1.gender;
          nextState.p1.gender = nextState.p1.partnerGender;
          nextState.p1.partnerGender = gTmp;
          nextSettings.p1Gender = nextState.p1.gender;
          nextSettings.p1PartnerGender = nextState.p1.partnerGender;
        } else {
          const tmpName = nextState.p2.name;
          const tmpPartnerName = nextState.p2.partnerName;
          nextState.p2.name = tmpPartnerName || '';
          nextState.p2.partnerName = tmpName;
          nextSettings.p2Name = nextState.p2.name;
          nextSettings.p2Partner = nextState.p2.partnerName;
          const vTmp = nextSettings.p2Verified;
          nextSettings.p2Verified = nextSettings.p2PartnerVerified;
          nextSettings.p2PartnerVerified = vTmp;
          const gTmp = nextState.p2.gender;
          nextState.p2.gender = nextState.p2.partnerGender;
          nextState.p2.partnerGender = gTmp;
          nextSettings.p2Gender = nextState.p2.gender;
          nextSettings.p2PartnerGender = nextState.p2.partnerGender;
        }
      }
      nextState.servingOrderOffset = currentCycle;
      nextState.server = expectedServingTeam;
      nextState.matchConfig = { ...nextState.matchConfig, ...nextSettings };
      setMatchSettings(nextSettings);
      prevSettingsRef.current = { ...nextSettings };
      setGameState(nextState);
      setIsSettingsInicialSaved(true);
      try {
        localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
        localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
      } catch {
        /* best-effort */
      }

      if (
        nextState.isMirroringActive &&
        userProfile.email &&
        navigator.onLine &&
        nextState.commandOwnerId === deviceId
      ) {
        const db = getDb();
        if (db) {
          const targetPin = resolveTargetPin('confirmMatch');
          const stateToSync = sanitizeForFirestore({ ...nextState, controllers: undefined });
          if (stateToSync && targetPin) {
            setDoc(doc(db, 'live_matches', targetPin), stateToSync, { merge: true }).catch(() => {});
          }
        }
      }

      if (navigator.vibrate) navigator.vibrate(30);
    },
    [
      gameState,
      isCommandOwner,
      matchSettings,
      userProfile.email,
      deviceId,
      persistMatchSettings,
      resolveTargetPin,
      setGameState,
      setIsSettingsInicialSaved,
      setMatchSettings,
    ],
  );

  const handleSwapSides = useCallback(
    (team: 1 | 2) => {
      if (!gameState || !isCommandOwner || gameState.isMatchOver) return;
      setIsSettingsInicialSaved(true);
      persistMatchSettings();
      const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const nextSettings = { ...matchSettings };

      const isPickleballSideOut =
        nextState.matchConfig.sportType === 'pickleball' &&
        nextState.matchConfig.pickleballScoringMode !== 'rally' &&
        !!nextState.pickleball;

      if (isPickleballSideOut && nextState.pickleball) {
        const p = team === 1 ? nextState.p1 : nextState.p2;
        const pkl = nextState.pickleball;
        const rightName = team === 1
          ? (pkl.server.t1RightPlayer || p.name)
          : (pkl.server.t2RightPlayer || p.name);
        const newRight = rightName === p.name ? (p.partnerName || p.name) : p.name;
        if (team === 1) pkl.server.t1RightPlayer = newRight;
        else            pkl.server.t2RightPlayer = newRight;
      } else {
        if (team === 1) {
          const tmpName = nextState.p1.name;
          nextState.p1.name = nextState.p1.partnerName || '';
          nextState.p1.partnerName = tmpName;

          nextSettings.p1Name = nextState.p1.name;
          nextSettings.p1Partner = nextState.p1.partnerName;

          const tmpVerified = nextSettings.p1Verified;
          nextSettings.p1Verified = nextSettings.p1PartnerVerified;
          nextSettings.p1PartnerVerified = tmpVerified;

          const tmpGender = nextState.p1.gender;
          nextState.p1.gender = nextState.p1.partnerGender;
          nextState.p1.partnerGender = tmpGender;
          nextSettings.p1Gender = nextState.p1.gender;
          nextSettings.p1PartnerGender = nextState.p1.partnerGender;

          if (nextState.servingOrderOffset === 0) {
            nextState.servingOrderOffset = 2;
          } else if (nextState.servingOrderOffset === 2) {
            nextState.servingOrderOffset = 0;
          }

          if (nextState.pickleball && nextState.pickleball.server.team === 1) {
            const s = nextState.pickleball.server;
            s.serverNumber = s.serverNumber === 1 ? 2 : 1;
            s.rallyOffset = nextState.servingOrderOffset;
            s.serverName = s.serverNumber === 2 ? (nextState.p1.partnerName || nextState.p1.name) : nextState.p1.name;
          }
        } else {
          const tmpName = nextState.p2.name;
          nextState.p2.name = nextState.p2.partnerName || '';
          nextState.p2.partnerName = tmpName;

          nextSettings.p2Name = nextState.p2.name;
          nextSettings.p2Partner = nextState.p2.partnerName;

          const tmpVerified = nextSettings.p2Verified;
          nextSettings.p2Verified = nextSettings.p2PartnerVerified;
          nextSettings.p2PartnerVerified = tmpVerified;

          const tmpGender = nextState.p2.gender;
          nextState.p2.gender = nextState.p2.partnerGender;
          nextState.p2.partnerGender = tmpGender;
          nextSettings.p2Gender = nextState.p2.gender;
          nextSettings.p2PartnerGender = nextState.p2.partnerGender;

          if (nextState.servingOrderOffset === 1) {
            nextState.servingOrderOffset = 3;
          } else if (nextState.servingOrderOffset === 3) {
            nextState.servingOrderOffset = 1;
          }

          if (nextState.pickleball && nextState.pickleball.server.team === 2) {
            const s = nextState.pickleball.server;
            s.serverNumber = s.serverNumber === 1 ? 2 : 1;
            s.rallyOffset = nextState.servingOrderOffset;
            s.serverName = s.serverNumber === 2 ? (nextState.p2.partnerName || nextState.p2.name) : nextState.p2.name;
          }
        }
      }

      nextState.matchConfig = { ...nextState.matchConfig, ...nextSettings };
      setMatchSettings(nextSettings);
      prevSettingsRef.current = { ...nextSettings };
      setGameState(nextState);
      setIsSettingsInicialSaved(true);
      try {
        localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
        localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
      } catch {
        /* best-effort */
      }

      if (
        nextState.isMirroringActive &&
        userProfile.email &&
        navigator.onLine &&
        nextState.commandOwnerId === deviceId
      ) {
        const db = getDb();
        if (db) {
          const targetPin = resolveTargetPin('confirmMatch');
          const stateToSync = sanitizeForFirestore({ ...nextState, controllers: undefined });
          if (stateToSync && targetPin) {
            setDoc(doc(db, 'live_matches', targetPin), stateToSync, { merge: true }).catch(() => {});
          }
        }
      }

      if (navigator.vibrate) navigator.vibrate(30);
    },
    [
      gameState,
      isCommandOwner,
      matchSettings,
      userProfile.email,
      deviceId,
      persistMatchSettings,
      resolveTargetPin,
      setGameState,
      setIsSettingsInicialSaved,
      setMatchSettings,
    ],
  );
  const handleToggleGender = useCallback(
    (team: 1 | 2, isPartner: boolean) => {
      if (!gameState || !isCommandOwner) return;
      setIsSettingsInicialSaved(true);
      persistMatchSettings();
      const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
      const nextSettings = { ...matchSettings };

      if (team === 1) {
        if (!isPartner) {
          const newGender = nextState.p1.gender === 'M' ? 'F' : 'M';
          nextState.p1.gender = newGender;
          nextSettings.p1Gender = newGender;
        } else {
          const newGender = nextState.p1.partnerGender === 'M' ? 'F' : 'M';
          nextState.p1.partnerGender = newGender;
          nextSettings.p1PartnerGender = newGender;
        }
      } else {
        if (!isPartner) {
          const newGender = nextState.p2.gender === 'M' ? 'F' : 'M';
          nextState.p2.gender = newGender;
          nextSettings.p2Gender = newGender;
        } else {
          const newGender = nextState.p2.partnerGender === 'M' ? 'F' : 'M';
          nextState.p2.partnerGender = newGender;
          nextSettings.p2PartnerGender = newGender;
        }
      }

      nextState.matchConfig = { ...nextState.matchConfig, ...nextSettings };
      setMatchSettings(nextSettings);
      prevSettingsRef.current = { ...nextSettings };
      setGameState(nextState);
      setIsSettingsInicialSaved(true);
      try {
        localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
        localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
      } catch {
        /* best-effort */
      }

      if (
        nextState.isMirroringActive &&
        userProfile.email &&
        navigator.onLine &&
        nextState.commandOwnerId === deviceId
      ) {
        const db = getDb();
        if (db) {
          const targetPin = resolveTargetPin('confirmMatch');
          const stateToSync = sanitizeForFirestore({ ...nextState, controllers: undefined });
          if (stateToSync && targetPin) {
            setDoc(doc(db, 'live_matches', targetPin), stateToSync, { merge: true }).catch(() => {});
          }
        }
      }

      if (navigator.vibrate) navigator.vibrate(20);
    },
    [
      gameState,
      isCommandOwner,
      matchSettings,
      userProfile.email,
      deviceId,
      persistMatchSettings,
      resolveTargetPin,
      setGameState,
      setIsSettingsInicialSaved,
      setMatchSettings,
    ],
  );

  return { handleTogglePause, handleSmartSwitchServer, handleSwapSides, handleToggleGender };
}
