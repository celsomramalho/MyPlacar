/**
 * usePickleballAnnouncer.ts — Announcer dedicado ao Pickleball
 * Separado de useScoreAnnouncer.ts (que permanece apenas para tênis/beach tênis)
 *
 * Formato oficial de anúncio + nome do sacador:
 *   Simples:     "cinco a três — João"
 *   Duplas:      "cinco a três, servidor dois — João"
 *   Game point:  "game point João! cinco a três, servidor dois — João"
 *   Match point: "match point João! cinco a três, servidor dois — João"
 *   Fim do game: "game encerrado! onze a sete. Próximo game, zero a zero — Ana"
 *   Fim partida: "fim da partida! onze a sete. Vencedores: João e Ana."
 *   Undo:        "ponto desfeito. cinco a três, servidor dois — João"
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { GameState, PickleballState } from '../../../../types.ts';
import {
  whoHasPickleballGamePoint,
  whoHasPickleballMatchPoint,
  shouldSwitchSidesMidGame,
  isPickleballTieBreak,
} from '@modules/game/domain/pickleballEngine';
import { speakSystem, speakGemini, unlockAudio, TIE_BREAK_TTS, ACE_TTS } from './useScoreAnnouncer.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários de texto
// ─────────────────────────────────────────────────────────────────────────────

const NUM_WORDS: Record<number, string> = {
  0: 'zero', 1: 'um', 2: 'dois', 3: 'três', 4: 'quatro',
  5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove',
  10: 'dez', 11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze',
  15: 'quinze', 16: 'dezesseis', 17: 'dezessete', 18: 'dezoito',
  19: 'dezenove', 20: 'vinte', 21: 'vinte e um',
};
const numWord = (n: number): string => NUM_WORDS[n] ?? n.toString();

/** Texto por extenso do número do servidor — facilita futura i18n. */
const SERVER_NUMBER_TEXT: Record<1 | 2, string> = {
  1: 'um',
  2: 'dois',
};

/**
 * Formata o placar no padrão oficial do pickleball + nome do sacador.
 *
 * Simples:          "cinco a três, João"
 * Duplas server 1:  "cinco a três, servidor um, João"
 * Duplas server 2:  "cinco a três, servidor dois, João"
 *
 * Convenção: placar sempre na perspectiva do sacador (sacador a recebedor).
 * Separador: vírgula — gera pausa natural no TTS sem ambiguidade.
 */
const formatScore = (pkl: PickleballState, isDoubles: boolean): string => {
  const { score, server } = pkl;
  const srvScore = server.team === 1 ? score.team1 : score.team2;
  const rcvScore = server.team === 1 ? score.team2 : score.team1;
  const scoreStr = `${numWord(srvScore)} a ${numWord(rcvScore)}`;
  const serverStr = isDoubles
    ? `, servidor ${SERVER_NUMBER_TEXT[server.serverNumber]},`
    : ',';
  return `${scoreStr}${serverStr} ${server.serverName}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Builder de anúncios — função pura (testável sem React)
// ─────────────────────────────────────────────────────────────────────────────

interface AnnounceContext {
  prevPointCount: number;
  prevSet: number;
  isMatchStart: boolean;
}

export const buildAnnouncementPickleball = (
  pkl: PickleballState,
  state: GameState,
  ctx: AnnounceContext
): string | null => {
  const { prevPointCount, prevSet, isMatchStart } = ctx;
  const currentPointCount = state.pointHistory?.length ?? 0;
  const isDoubles = state.matchConfig.isDoubles;
  const score = formatScore(pkl, isDoubles);

  // A) Início da partida
  if (isMatchStart) {
    const serverStr = isDoubles
      ? `, servidor ${SERVER_NUMBER_TEXT[pkl.server.serverNumber]},`
      : ',';
    return `Partida iniciada. Zero a zero${serverStr} ${pkl.server.serverName}.`;
  }

  // Undo
  if (currentPointCount < prevPointCount) {
    return `Ponto desfeito. ${score}.`;
  }

  // G) Fim da partida
  if (pkl.isMatchOver && pkl.winner) {
    const lastIdx   = state.p1.sets.length - 1;
    const s1        = state.p1.sets[lastIdx] ?? 0;
    const s2        = state.p2.sets[lastIdx] ?? 0;
    const [win, los] = pkl.winner.team === 1 ? [s1, s2] : [s2, s1];
    const plural    = pkl.winner.names.includes(' e ') ? 'es' : '';
    return (
      `Fim da partida! ${numWord(win)} a ${numWord(los)}. ` +
      `Vencedor${plural}: ${pkl.winner.names}.`
    );
  }

  // F) Fim do game / início do próximo (capturado via mudança de currentSet)
  if (state.currentSet !== prevSet) {
    const finishedIdx = state.currentSet - 1;
    const s1 = state.p1.sets[finishedIdx] ?? 0;
    const s2 = state.p2.sets[finishedIdx] ?? 0;
    const gameEndPrefix = `Game encerrado! ${numWord(s1)} a ${numWord(s2)}. `;

    // Se após o game os sets ficaram empatados e tie-break está habilitado,
    // anuncia início do tie-break em vez de "próximo game"
    if (isPickleballTieBreak(state)) {
      const serverStr = isDoubles
        ? `, servidor ${SERVER_NUMBER_TEXT[pkl.server.serverNumber]},`
        : ',';
      return (
        gameEndPrefix +
        `${TIE_BREAK_TTS}! Zero a zero${serverStr} ${pkl.server.serverName}.`
      );
    }

    return gameEndPrefix + `Próximo game, ${score}.`;
  }

  // C) Troca de lado no meio do game decisivo
  if (shouldSwitchSidesMidGame(pkl, state)) {
    return `Troca de lado. ${score}.`;
  }

  // E) Match point (prioridade sobre game point)
  const matchPointTeam = whoHasPickleballMatchPoint(pkl, state);
  if (matchPointTeam !== null) {
    const name = matchPointTeam === 1 ? state.p1.name : state.p2.name;
    return `Match point ${name}! ${score}.`;
  }

  // D) Game point
  const gamePointTeam = whoHasPickleballGamePoint(pkl, state);
  if (gamePointTeam !== null) {
    const name = gamePointTeam === 1 ? state.p1.name : state.p2.name;
    return `Game point ${name}! ${score}.`;
  }

  // B) Ponto normal — com detecção de ace/erro de saque
  const lastPoint = state.pointHistory?.[state.pointHistory.length - 1];
  if (lastPoint?.type === 'ace')   return `${ACE_TTS}! ${score}.`;
  if (lastPoint?.type === 'fault') return `Erro de saque. ${score}.`;
  return `${score}.`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook React
// ─────────────────────────────────────────────────────────────────────────────

let hardwareInitialized = false;

export const usePickleballAnnouncer = (gameState: GameState) => {
  const [isAnnouncing, setIsAnnouncing] = useState(false);

  const prevPointCount     = useRef(gameState?.pointHistory?.length ?? 0);
  const prevSet            = useRef(gameState.currentSet);
  const announcedStartFor  = useRef<string | null>(null);
  const announcedFinishFor = useRef<string | null>(null);
  const lastAnnouncedText  = useRef<string>('');

  const lastChangeTime = useRef<number>(0);
  const debounceTimer  = useRef<NodeJS.Timeout | null>(null);

  const {
    voiceScoring, useGeminiVoice, geminiVoiceName,
    geminiPersona, selectedVoiceURI, volume,
  } = gameState.matchConfig;

  const announce = useCallback(async (text: string) => {
    if (!text || !voiceScoring) return;
    if (text === lastAnnouncedText.current) return;
    lastAnnouncedText.current = text;
    setIsAnnouncing(true);
    if (!hardwareInitialized) { await unlockAudio(); hardwareInitialized = true; }
    try {
      if (useGeminiVoice) {
        try { await speakGemini(text, geminiVoiceName, geminiPersona, volume); }
        catch { await speakSystem(text, selectedVoiceURI, volume); }
      } else {
        await speakSystem(text, selectedVoiceURI, volume);
      }
    } finally {
      setIsAnnouncing(false);
    }
  }, [voiceScoring, useGeminiVoice, geminiVoiceName, geminiPersona, selectedVoiceURI, volume]);

  // Anúncio manual do placar completo
  const announceFullScore = useCallback(() => {
    const pkl = gameState.pickleball;
    if (!pkl) return;
    lastAnnouncedText.current = ''; // força re-anúncio mesmo que texto igual
    announce(`Placar: ${formatScore(pkl, gameState.matchConfig.isDoubles)}.`);
  }, [gameState, announce]);

  // Limpa o timer de debounce se o componente for desmontado
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    // Guard: apenas pickleball — tênis usa useScoreAnnouncer
    if (gameState.matchConfig.sportType !== 'pickleball') return;

    const pkl = gameState.pickleball;
    if (!pkl) return;

    const currentPointCount = gameState?.pointHistory?.length ?? 0;

    // Início da partida
    if (currentPointCount === 0 && announcedStartFor.current !== gameState.matchId) {
      announcedStartFor.current = gameState.matchId;
      const text = buildAnnouncementPickleball(pkl, gameState, {
        prevPointCount: 0,
        prevSet: gameState.currentSet,
        isMatchStart: true,
      });
      if (text) announce(text);
      prevPointCount.current = 0;
      prevSet.current        = gameState.currentSet;
      return;
    }

    const pointChanged = currentPointCount !== prevPointCount.current;
    const setChanged   = gameState.currentSet !== prevSet.current;
    if (!pointChanged && !setChanged) return;

    // Controle de anúncios em rajada (reconexão / perda de sincronismo)
    const now = Date.now();
    const elapsed = now - lastChangeTime.current;
    lastChangeTime.current = now;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }

    const isBatchUpdate = (currentPointCount - prevPointCount.current) > 1;
    const isRapidSequence = elapsed < 2000 && gameState.isMirroringActive;

    if (isBatchUpdate || isRapidSequence) {
      // Sincroniza referências para evitar que o próximo ponto síncrono dispare anúncios velhos
      prevPointCount.current = currentPointCount;
      prevSet.current        = gameState.currentSet;

      // Agenda o anúncio do placar final consolidado
      debounceTimer.current = setTimeout(() => {
        announceFullScore();
      }, 1500);
      return;
    }

    // Fim da partida
    if (pkl.isMatchOver && announcedFinishFor.current !== gameState.matchId) {
      announcedFinishFor.current = gameState.matchId;
      const text = buildAnnouncementPickleball(pkl, gameState, {
        prevPointCount: prevPointCount.current,
        prevSet: prevSet.current,
        isMatchStart: false,
      });
      if (text) announce(text);
      prevPointCount.current = currentPointCount;
      prevSet.current        = gameState.currentSet;
      return;
    }

    // Todos os outros eventos
    const text = buildAnnouncementPickleball(pkl, gameState, {
      prevPointCount: prevPointCount.current,
      prevSet: prevSet.current,
      isMatchStart: false,
    });
    if (text) announce(text);

    prevPointCount.current = currentPointCount;
    prevSet.current        = gameState.currentSet;

  }, [
    // Gatilhos mínimos — evitam anúncios duplicados
    gameState?.pointHistory?.length,
    gameState.currentSet,
    gameState.pickleball?.isMatchOver,
    gameState.matchId,
    announce,
    announceFullScore,
  ]);

  return { announceFullScore, isAnnouncing };
};
