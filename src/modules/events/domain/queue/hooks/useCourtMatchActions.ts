/**
 * Hook: useCourtMatchActions
 *
 * Abstrai todas as ações operacionais de mutação da Fila de Quadras:
 * alocação de quadra, liberação, interdição, edição de placar e data.
 *
 * Cada ação:
 *   1. Valida a permissão (isReadOnly)
 *   2. Calcula o próximo estado local e notifica via onUpdateEvent (otimista)
 *   3. Persiste no Firestore via updateEvent (lazy import para evitar bundle inicial)
 *   4. Erros de persistência são logados sem reverter o estado otimista
 *
 * Responsabilidades separadas do useCourtQueue (que é somente leitura).
 *
 * @see docs/PLANO_REFATORACAO_FILA_QUADRAS.md — Fase 3
 */

import { useRef, useCallback, useState } from 'react';
import type { TournamentEvent, TournamentMatch, MatchSetScore } from '@modules/events/types';
import { updatePlayoffProgression } from '@modules/events/domain/brackets/engine/bracketProgressionEngine';
import { isSetScoreComplete } from '@modules/events/domain/brackets/engine/matchScoreEngine';
import { resolveMatchRules } from '../../rules/eventMatchRules';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseTournamentEvent } from '@infra/firebase/events';
import { isWatchDevice } from '@shared/utils/device';

// ─── Tipos públicos do hook ───────────────────────────────────────────────────

export interface UseCourtMatchActionsOptions {
  event: TournamentEvent;
  isReadOnly: boolean;
  onUpdateEvent?: (updated: TournamentEvent) => void;
  adminEmail?: string;
  adminPin?: string;
  /** Debounce em ms para persistência de placar/data. Padrão: 600ms */
  saveDebounceMs?: number;
}

export interface ParseMatchSetsResult {
  scores: MatchSetScore[];
  setsWon1: number;
  setsWon2: number;
}

export interface UseCourtMatchActionsResult {
  saveStatusByMatch: Record<string, 'saved' | 'saving' | 'error'>;
  /** Vincula uma partida a uma quadra livre (status → live, startedAt definido) */
  assignMatchToCourt: (matchId: string, courtName: string) => Promise<void>;
  advanceCourtMatchStage: (matchId: string, stage: 'serve_draw' | 'match') => Promise<void>;
  startCourtWarmup: (matchId: string) => Promise<void>;
  /** Libera a quadra: volta a partida para 'waiting' sem finalizar */
  freeCourtMatch: (matchId: string) => Promise<void>;
  /** Finaliza a partida na quadra, calculando vencedor e durationMinutes */
  finishCourtMatch: (matchId: string) => Promise<void>;
  /** Zera o placar da partida em andamento sem liberar a quadra. */
  resetCourtMatch: (matchId: string) => Promise<void>;
  /** Alterna o status de interdição de uma quadra */
  toggleInterdictCourt: (courtName: string) => Promise<void>;
  /** Alterna o congelamento manual de uma partida na fila */
  toggleFreezeMatch: (matchId: string) => Promise<void>;
  /** Atualiza o placar de um set com debounce de persistência */
  handleScoreInputChange: (
    matchId: string,
    setIndex: number,
    player: 'p1' | 'p2',
    rawVal: string
  ) => void;
  /**
   * Restaura p1 e p2 de um set atomicamente (usado pelo undo do tap-to-score).
   * Evita race condition de duas chamadas consecutivas ao handleScoreInputChange.
   */
  handleScoreUndoChange: (
    matchId: string,
    setIndex: number,
    p1Val: string,
    p2Val: string,
    gameP1?: string,
    gameP2?: string,
    servingOrderOffset?: number | null
  ) => void;
  /** Salva quem saca e a ordem dos parceiros na rotação do saque. */
  handleServeSettingsChange: (matchId: string, settings: Partial<Pick<TournamentMatch, 'servingOrderOffset' | 'serveOrderP1Reversed' | 'serveOrderP2Reversed'>>) => void;
  /** Persiste o placar imediatamente ao perder o foco */
  handleScoreBlur: (matchId?: string) => Promise<void>;
  /** Salva a data da partida com debounce de persistência */
  handleMatchDateChange: (matchId: string, dateVal: string) => void;
  /** Parseia os sets de uma partida retornando scores + setsWon */
  parseMatchSets: (match: TournamentMatch, totalSets: number) => ParseMatchSetsResult;
}

// ─── Implementação ────────────────────────────────────────────────────────────

export function useCourtMatchActions({
  event,
  isReadOnly,
  onUpdateEvent,
  adminEmail,
  adminPin,
  saveDebounceMs = 600,
}: UseCourtMatchActionsOptions): UseCourtMatchActionsResult {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatusByMatch, setSaveStatusByMatch] = useState<Record<string, 'saved' | 'saving' | 'error'>>({});
  const markMatchSaveStatus = useCallback((matchId: string, status: 'saved' | 'saving' | 'error') => {
    setSaveStatusByMatch((current) => current[matchId] === status ? current : { ...current, [matchId]: status });
  }, []);

  // ─── Persistência no Firestore ─────────────────────────────────────────────

  const persistToFirestore = useCallback(
    async (payload: Partial<FirebaseTournamentEvent>, matchId?: string) => {
      if (!event.pin) return;
      if (matchId) markMatchSaveStatus(matchId, 'saving');
      try {
        if (isWatchDevice()) {
          if (!adminEmail || !adminPin) {
            throw new Error('O relógio não tem a identificação necessária para salvar a fila. Saia e entre novamente pelo celular.');
          }
          const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
          const response = await fetch(`${baseUrl}/api/admin-save-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'queue-update', eventPin: event.pin, adminEmail, adminPin, queue: payload }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || 'Não foi possível sincronizar a fila do relógio.');
          }
          if (matchId) markMatchSaveStatus(matchId, 'saved');
          return;
        }
        const db = getDb();
        if (!db) throw new Error('Não foi possível conectar ao Firestore.');
        const { updateEvent } = await import('@infra/firebase/events');
        await updateEvent(db as Firestore, event.pin, payload);
        if (matchId) markMatchSaveStatus(matchId, 'saved');
      } catch (err) {
        if (matchId) markMatchSaveStatus(matchId, 'error');
        console.error('[useCourtMatchActions] Erro ao persistir no Firestore:', err);
        if (isWatchDevice() && typeof window !== 'undefined') {
          window.alert(err instanceof Error ? err.message : 'Não foi possível sincronizar a fila. Tente novamente.');
        }
      }
    },
    [event.pin, adminEmail, adminPin, markMatchSaveStatus]
  );

  const persistEventChanges = useCallback(
    async (updatedMatches?: TournamentMatch[], updatedInterdictedCourts?: string[]) => {
      if (isReadOnly) return;
      const nextEvent: TournamentEvent = {
        ...event,
        matches: updatedMatches ?? event.matches,
        interdictedCourts: updatedInterdictedCourts ?? event.interdictedCourts,
      };
      onUpdateEvent?.(nextEvent);

      const payload: Partial<FirebaseTournamentEvent> = {};
      if (updatedMatches !== undefined) payload.matches = updatedMatches;
      if (updatedInterdictedCourts !== undefined) payload.interdictedCourts = updatedInterdictedCourts;
      await persistToFirestore(payload);
    },
    [event, isReadOnly, onUpdateEvent, persistToFirestore]
  );

  // ─── Parsing de Sets ───────────────────────────────────────────────────────

  const parseMatchSets = useCallback(
    (match: TournamentMatch, customTotalSets?: number): ParseMatchSetsResult => {
      const resolved = resolveMatchRules(
        event.sportRules,
        match.phase,
        (event.setsCount || event.config?.sets || 1) as 1 | 3 | 5,
        Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6)),
        event.sportId || event.config?.sportType
      );
      const totalSets = customTotalSets ?? resolved.setsCount;
      const gamesPerSet = resolved.gamesPerSet;

      const scores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => {
        if (match.scores?.[i]) return match.scores[i];
        if (match.result) {
          const parts = match.result.trim().split(/[\s,]+/);
          if (parts[i]) {
            const m = parts[i].match(/(\d+)[\/xX\-](\d+)/);
            if (m) return { p1: Number(m[1]), p2: Number(m[2]) };
          }
        }
        return { p1: null, p2: null };
      });

      let setsWon1 = 0;
      let setsWon2 = 0;
      scores.forEach((s) => {
        if (s.inProgress && match.status !== 'finished') return;
        if (s.p1 != null && s.p2 != null) {
          const n1 = Number(s.p1);
          const n2 = Number(s.p2);
          const isTotalGamesRule = (event.sportId || event.config?.sportType) === 'beach-tennis' && gamesPerSet === 7;
          const setComplete = isSetScoreComplete(n1, n2, gamesPerSet, { isTotalGamesSet: isTotalGamesRule, tieBreak: resolved.tieBreak, tieBreakAt: resolved.tieBreakAt });
          if (setComplete && n1 > n2) setsWon1++;
          else if (setComplete && n2 > n1) setsWon2++;
        }
      });

      return { scores, setsWon1, setsWon2 };
    },
    [event.gamesPerSet, event.config?.gamesPerSet, event.eventType, event.setsCount, event.config?.sets, event.sportRules]
  );

  // ─── Ação: Vincular partida a uma quadra ───────────────────────────────────

  const assignMatchToCourt = useCallback(
    async (matchId: string, courtName: string) => {
      if (isReadOnly) return;
      const nowIso = new Date().toISOString();
      const todayDate = new Date().toLocaleDateString('en-CA');
      const nextMatches = (event.matches || []).map((m) =>
        m.id !== matchId
          ? m
          : {
              ...m,
              status: 'live' as const,
              court: courtName,
              frozen: false,
              startedAt: m.startedAt || nowIso,
              courtStartedAt: nowIso,
              courtDurationMinutes: undefined,
              warmupStartedAt: undefined,
              courtStage: 'warmup' as const,
              scoreStartedAt: undefined,
              scoreFinishedAt: undefined,
              servingOrderOffset: undefined,
              initialServingOrderOffset: undefined,
              initialServeOrderP1Reversed: undefined,
              initialServeOrderP2Reversed: undefined,
              matchDate: m.matchDate || todayDate,
            }
      );
      await persistEventChanges(nextMatches);
    },
    [event, isReadOnly, persistEventChanges]
  );

  const advanceCourtMatchStage = useCallback(async (matchId: string, stage: 'serve_draw' | 'match') => {
    if (isReadOnly) return;
    const nowIso = new Date().toISOString();
    const nextMatches = (event.matches || []).map((m) => m.id !== matchId ? m : {
      ...m,
      courtStage: stage,
      ...(stage === 'match' ? {
        startedAt: nowIso,
        initialServingOrderOffset: m.servingOrderOffset,
        initialServeOrderP1Reversed: m.serveOrderP1Reversed,
        initialServeOrderP2Reversed: m.serveOrderP2Reversed,
      } : {}),
    });
    await persistEventChanges(nextMatches);
  }, [event, isReadOnly, persistEventChanges]);

  const startCourtWarmup = useCallback(async (matchId: string) => {
    if (isReadOnly) return;
    const nowIso = new Date().toISOString();
    const nextMatches = (event.matches || []).map((m) => m.id !== matchId || m.warmupStartedAt ? m : {
      ...m,
      warmupStartedAt: nowIso,
    });
    await persistEventChanges(nextMatches);
  }, [event, isReadOnly, persistEventChanges]);

  // ─── Ação: Liberar quadra (sem finalizar) ──────────────────────────────────

  const freeCourtMatch = useCallback(
    async (matchId: string) => {
      if (isReadOnly) return;
      const nextMatches = (event.matches || []).map((m) =>
        m.id !== matchId
          ? m
          : { ...m, status: 'waiting' as const, court: undefined, startedAt: undefined, courtStartedAt: undefined, courtDurationMinutes: undefined, warmupStartedAt: undefined, scoreStartedAt: undefined, scoreFinishedAt: undefined, courtStage: undefined }
      );
      await persistEventChanges(nextMatches);
    },
    [event, isReadOnly, persistEventChanges]
  );

  // ─── Ação: Finalizar partida na quadra ────────────────────────────────────

  const finishCourtMatch = useCallback(
    async (matchId: string) => {
      if (isReadOnly) return;
      const totalSets = (event.setsCount || event.config?.sets || 1) as number;
      const nowIso = new Date().toISOString();

      const nextMatches = (event.matches || []).map((m) => {
        if (m.id !== matchId) return m;

        const { setsWon1, setsWon2, scores } = parseMatchSets(m);
        let winnerPairId = m.winnerPairId;
        let loserPairId = m.loserPairId;

        if (setsWon1 > setsWon2) {
          winnerPairId = m.pair1Id;
          loserPairId = m.pair2Id;
        } else if (setsWon2 > setsWon1) {
          winnerPairId = m.pair2Id;
          loserPairId = m.pair1Id;
        } else if (scores[0]?.p1 != null && scores[0]?.p2 != null) {
          const n1 = Number(scores[0].p1);
          const n2 = Number(scores[0].p2);
          if (n1 > n2) { winnerPairId = m.pair1Id; loserPairId = m.pair2Id; }
          else if (n2 > n1) { winnerPairId = m.pair2Id; loserPairId = m.pair1Id; }
        }

        let durationMinutes: number | undefined;
        if (m.startedAt) {
          const startMs = new Date(m.startedAt).getTime();
          const endMs = new Date(nowIso).getTime();
          if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
            durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
          }
        }

        let courtDurationMinutes: number | undefined;
        if (m.courtStartedAt || m.startedAt) {
          const startMs = new Date(m.courtStartedAt || m.startedAt!).getTime();
          const endMs = new Date(nowIso).getTime();
          if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
            courtDurationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
          }
        }

        return {
          ...m,
          status: 'finished' as const,
          winnerPairId: winnerPairId || m.pair1Id,
          loserPairId: loserPairId || m.pair2Id,
          court: m.court,
          finishedAt: nowIso,
          durationMinutes: durationMinutes ?? m.durationMinutes,
          courtDurationMinutes: courtDurationMinutes ?? m.courtDurationMinutes,
          scoreFinishedAt: m.scoreStartedAt ? nowIso : m.scoreFinishedAt,
        };
      });

      const progressed = updatePlayoffProgression(event.pairs || [], nextMatches);
      await persistEventChanges(progressed);
    },
    [event, isReadOnly, parseMatchSets, persistEventChanges]
  );

  const resetCourtMatch = useCallback(async (matchId: string) => {
    if (isReadOnly) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const nowIso = new Date().toISOString();
    const nextMatches = (event.matches || []).map((m) => {
      if (m.id !== matchId) return m;
      const rules = resolveMatchRules(
        event.sportRules,
        m.phase,
        (event.setsCount || event.config?.sets || 1) as 1 | 3 | 5,
        Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6)),
        event.sportId || event.config?.sportType
      );
      const scores: MatchSetScore[] = Array.from({ length: rules.setsCount }, () => ({ p1: 0, p2: 0, gameP1: '0', gameP2: '0' }));
      return {
        ...m,
        scores,
        result: '',
        status: 'live' as const,
        courtStage: 'match' as const,
        startedAt: nowIso,
        servingOrderOffset: m.initialServingOrderOffset ?? m.servingOrderOffset,
        serveOrderP1Reversed: m.initialServeOrderP1Reversed ?? m.serveOrderP1Reversed,
        serveOrderP2Reversed: m.initialServeOrderP2Reversed ?? m.serveOrderP2Reversed,
        finishedAt: undefined,
        durationMinutes: undefined,
        scoreStartedAt: undefined,
        scoreFinishedAt: undefined,
        winnerPairId: undefined,
        loserPairId: undefined,
      };
    });
    await persistEventChanges(nextMatches);
  }, [event, isReadOnly, persistEventChanges]);

  // ─── Ação: Interditar / Liberar quadra ────────────────────────────────────

  const toggleInterdictCourt = useCallback(
    async (courtName: string) => {
      if (isReadOnly) return;
      const current = new Set<string>(event.interdictedCourts || []);
      if (current.has(courtName)) current.delete(courtName);
      else current.add(courtName);
      await persistEventChanges(undefined, Array.from(current));
    },
    [event, isReadOnly, persistEventChanges]
  );

  // ─── Ação: Congelar / Descongelar partida ─────────────────────────────────

  const toggleFreezeMatch = useCallback(
    async (matchId: string) => {
      if (isReadOnly) return;
      const nextMatches = (event.matches || []).map((m) =>
        m.id !== matchId ? m : { ...m, frozen: !m.frozen }
      );
      await persistEventChanges(nextMatches);
    },
    [event, isReadOnly, persistEventChanges]
  );

  // ─── Ação: Editar placar (com debounce) ───────────────────────────────────

  const handleScoreInputChange = useCallback(
    (matchId: string, setIndex: number, player: 'p1' | 'p2', rawVal: string) => {
      if (isReadOnly) return;
      const nextMatches = (event.matches || []).map((m) => {
        if (m.id !== matchId) return m;

        const resolved = resolveMatchRules(
          event.sportRules,
          m.phase,
          (event.setsCount || event.config?.sets || 1) as 1 | 3 | 5,
          Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6)),
          event.sportId || event.config?.sportType
        );
        const totalSets = resolved.setsCount;
        const gamesPerSet = resolved.gamesPerSet;

        const currentScores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => ({
          ...m.scores?.[i],
          p1: m.scores?.[i]?.p1 !== undefined ? m.scores[i].p1 : null,
          p2: m.scores?.[i]?.p2 !== undefined ? m.scores[i].p2 : null,
        }));

        const parsedNum = rawVal.trim() === '' ? null : parseInt(rawVal, 10);
        const val = isNaN(parsedNum as number) ? null : parsedNum;
        currentScores[setIndex] = { ...currentScores[setIndex], [player]: val };

        let setsWon1 = 0;
        let setsWon2 = 0;
        const resultParts: string[] = [];
        let hasAnyScore = false;

        currentScores.forEach((s) => {
          if (s.p1 != null && s.p2 != null) {
            resultParts.push(`${s.p1}/${s.p2}`);
            hasAnyScore = true;
            const n1 = Number(s.p1);
            const n2 = Number(s.p2);
            const isTotalGamesRule = (event.sportId || event.config?.sportType) === 'beach-tennis' && gamesPerSet === 7;
            const setComplete = isSetScoreComplete(n1, n2, gamesPerSet, { isTotalGamesSet: isTotalGamesRule, tieBreak: resolved.tieBreak, tieBreakAt: resolved.tieBreakAt });
            if (setComplete && n1 > n2) setsWon1++;
            else if (setComplete && n2 > n1) setsWon2++;
          } else if (s.p1 != null || s.p2 != null) {
            hasAnyScore = true;
          }
        });

        const hasStartedScoring = currentScores.some((s) =>
          Number(s.p1 || 0) > 0 || Number(s.p2 || 0) > 0 || (s.gameP1 && s.gameP1 !== '0') || (s.gameP2 && s.gameP2 !== '0')
        );
        const scoreStartedAt = hasStartedScoring ? m.scoreStartedAt || new Date().toISOString() : undefined;
        let status: 'waiting' | 'live' | 'finished' = m.status || 'live';
        if (status !== 'finished') {
          status = m.court || hasAnyScore ? 'live' : m.status || 'waiting';
        }

        return { ...m, scores: currentScores, result: resultParts.join(' '), status, court: m.court, scoreStartedAt };
      });

      const progressed = updatePlayoffProgression(event.pairs || [], nextMatches);
      onUpdateEvent?.({ ...event, matches: progressed });
      markMatchSaveStatus(matchId, 'saving');

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        void persistToFirestore({ matches: progressed }, matchId);
      }, saveDebounceMs);
    },
    [event, isReadOnly, onUpdateEvent, persistToFirestore, saveDebounceMs, markMatchSaveStatus]
  );

  // ─── Ação: Restaurar placar atomicamente (undo do tap-to-score) ───────────
  // Atualiza p1 e p2 de um set em uma única operação para evitar race condition
  // quando dois onScoreChange sequenciais leriam o mesmo snapshot de event.

  const handleScoreUndoChange = useCallback(
    (matchId: string, setIndex: number, p1Val: string, p2Val: string, gameP1 = '0', gameP2 = '0', servingOrderOffset?: number | null) => {
      if (isReadOnly) return;
      const nextMatches = (event.matches || []).map((m) => {
        if (m.id !== matchId) return m;

        const resolved = resolveMatchRules(
          event.sportRules,
          m.phase,
          (event.setsCount || event.config?.sets || 1) as 1 | 3 | 5,
          Number(event.gamesPerSet || event.config?.gamesPerSet || (event.eventType === 'Super 8' ? 4 : 6)),
          event.sportId || event.config?.sportType
        );
        const totalSets = resolved.setsCount;
        const gamesPerSet = resolved.gamesPerSet;

        const currentScores: MatchSetScore[] = Array.from({ length: totalSets }, (_, i) => ({
          ...m.scores?.[i],
          p1: m.scores?.[i]?.p1 !== undefined ? m.scores[i].p1 : null,
          p2: m.scores?.[i]?.p2 !== undefined ? m.scores[i].p2 : null,
        }));

        // Converte string para número ou null
        const toVal = (raw: string) => {
          const n = parseInt(raw, 10);
          return isNaN(n) ? null : n;
        };
        currentScores[setIndex] = { ...currentScores[setIndex], p1: toVal(p1Val), p2: toVal(p2Val), gameP1, gameP2 };

        let setsWon1 = 0;
        let setsWon2 = 0;
        const resultParts: string[] = [];
        let hasAnyScore = false;

        currentScores.forEach((s) => {
          if (s.p1 != null && s.p2 != null) {
            resultParts.push(`${s.p1}/${s.p2}`);
            hasAnyScore = true;
            const n1 = Number(s.p1);
            const n2 = Number(s.p2);
            const isTotalGamesRule = (event.sportId || event.config?.sportType) === 'beach-tennis' && gamesPerSet === 7;
            const setComplete = isSetScoreComplete(n1, n2, gamesPerSet, { isTotalGamesSet: isTotalGamesRule, tieBreak: resolved.tieBreak, tieBreakAt: resolved.tieBreakAt });
            if (setComplete && n1 > n2) setsWon1++;
            else if (setComplete && n2 > n1) setsWon2++;
          } else if (s.p1 != null || s.p2 != null) {
            hasAnyScore = true;
          }
        });

        const hasStartedScoring = currentScores.some((s) =>
          Number(s.p1 || 0) > 0 || Number(s.p2 || 0) > 0 || (s.gameP1 && s.gameP1 !== '0') || (s.gameP2 && s.gameP2 !== '0')
        );
        const scoreStartedAt = hasStartedScoring ? m.scoreStartedAt || new Date().toISOString() : undefined;
        let status: 'waiting' | 'live' | 'finished' = m.status || 'live';
        if (status !== 'finished') {
          status = m.court || hasAnyScore ? 'live' : m.status || 'waiting';
        }

        return { ...m, scores: currentScores, result: resultParts.join(' '), status, court: m.court, scoreStartedAt, servingOrderOffset: servingOrderOffset === null ? undefined : servingOrderOffset ?? m.servingOrderOffset };
      });

      const progressed = updatePlayoffProgression(event.pairs || [], nextMatches);
      onUpdateEvent?.({ ...event, matches: progressed });
      markMatchSaveStatus(matchId, 'saving');

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        void persistToFirestore({ matches: progressed }, matchId);
      }, saveDebounceMs);
    },
    [event, isReadOnly, onUpdateEvent, persistToFirestore, saveDebounceMs, markMatchSaveStatus]
  );

  const handleServeSettingsChange = useCallback(
    async (matchId: string, settings: Partial<Pick<TournamentMatch, 'servingOrderOffset' | 'serveOrderP1Reversed' | 'serveOrderP2Reversed'>>) => {
      if (isReadOnly) return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const nextMatches = (event.matches || []).map((m) => m.id === matchId ? { ...m, ...settings } : m);
      await persistEventChanges(nextMatches);
    },
    [event, isReadOnly, persistEventChanges]
  );

  // ─── Ação: Flush do placar ao perder o foco ───────────────────────────────

  const handleScoreBlur = useCallback(async (matchId?: string) => {
    if (isReadOnly) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    await persistToFirestore({ matches: event.matches }, matchId);
  }, [isReadOnly, event.matches, persistToFirestore]);

  // ─── Ação: Salvar data da partida (com debounce) ──────────────────────────

  const handleMatchDateChange = useCallback(
    (matchId: string, dateVal: string) => {
      if (isReadOnly) return;
      const nextMatches = (event.matches || []).map((m) =>
        m.id !== matchId ? m : { ...m, matchDate: dateVal || undefined }
      );
      onUpdateEvent?.({ ...event, matches: nextMatches });

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        persistToFirestore({ matches: nextMatches });
      }, saveDebounceMs);
    },
    [event, isReadOnly, onUpdateEvent, persistToFirestore, saveDebounceMs]
  );

  return {
    saveStatusByMatch,
    assignMatchToCourt,
    advanceCourtMatchStage,
    startCourtWarmup,
    freeCourtMatch,
    finishCourtMatch,
    resetCourtMatch,
    toggleInterdictCourt,
    toggleFreezeMatch,
    handleScoreInputChange,
    handleScoreUndoChange,
    handleServeSettingsChange,
    handleScoreBlur,
    handleMatchDateChange,
    parseMatchSets,
  };
}
