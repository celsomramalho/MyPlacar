/**
 * Hook: useCourtQueue
 *
 * Orquestra o cálculo memoizado do estado da Fila de Quadras a partir
 * de um TournamentEvent reativo. Atualiza automaticamente as estimativas
 * de tempo a cada minuto via timer interno.
 *
 * Responsabilidades:
 *   - Calcular courtStates, orderedQueue, visibleMatches e métricas
 *   - Fornecer pairsById e lookup de nomes para componentes visuais
 *   - Re-calcular somente quando event.matches, event.interdictedCourts
 *     ou event.pairs mudam (deps granulares via useMemo)
 *
 * @see docs/PLANO_REFATORACAO_FILA_QUADRAS.md — Fase 3
 */

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import type { TournamentEvent, TournamentMatch, TournamentPair, MatchSetScore } from '@modules/events/types';
import { calculateQueueState } from '../engine/queueEngine';
import type { QueueCalculationResult } from '../types';

// ─── Tipos públicos do hook ───────────────────────────────────────────────────

export interface UseCourtQueueOptions {
  /** Intervalo em ms para re-calcular estimativas de tempo. Padrão: 60000 (1 min). */
  clockIntervalMs?: number;
}

export interface UseCourtQueueResult extends QueueCalculationResult {
  /** Mapa de duplas por id para resolução rápida em componentes visuais */
  pairsById: Record<string, TournamentPair>;
  /** Lookup de nicknames por email → nick */
  entriesByEmail: Map<string, string>;
  /** Lookup de nicknames por pin → nick */
  entriesByPin: Map<string, string>;
  /** Resolve o nome de exibição de um jogador usando os lookups do evento */
  getPlayerNick: (p?: { nickname?: string; name?: string; email?: string; pin?: string }) => string;
  /** Parseia os sets de uma partida retornando scores + setsWon */
  parseMatchSets: (
    match: TournamentMatch,
    totalSets: number
  ) => { scores: MatchSetScore[]; setsWon1: number; setsWon2: number };
  /** Nº de sets configurados para o evento */
  totalSets: number;
  /** Nº de games por set configurados para o evento */
  gamesPerSet: number;
}

// ─── Implementação ────────────────────────────────────────────────────────────

export function useCourtQueue(
  event: TournamentEvent,
  options: UseCourtQueueOptions = {}
): UseCourtQueueResult {
  const { clockIntervalMs = 60_000 } = options;

  // Ticker para re-calcular estimativas de tempo a cada minuto
  const [tick, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setTick((t) => t + 1), clockIntervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [clockIntervalMs]);

  // Deps estáveis para evitar re-cálculos desnecessários
  const matchesRef = event.matches;
  const pairsRef = event.pairs;
  const interdictedRef = event.interdictedCourts;
  const entriesRef = event.entries;

  // ─── Cálculo principal da fila ────────────────────────────────────────────
  const queueState = useMemo(
    () => calculateQueueState(event),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchesRef, pairsRef, interdictedRef, entriesRef, tick]
  );

  // ─── Mapa de duplas por id ────────────────────────────────────────────────
  const pairsById = useMemo<Record<string, TournamentPair>>(() => {
    const map: Record<string, TournamentPair> = {};
    (event.pairs || []).forEach((p) => { map[p.id] = p; });
    return map;
  }, [pairsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Lookups de nicknames ─────────────────────────────────────────────────
  const entriesByEmail = useMemo(() => {
    const map = new Map<string, string>();
    (event.entries || []).forEach((e) => {
      const nick = e.nickname?.trim() || e.name?.trim();
      if (nick && e.email) map.set(e.email.toLowerCase().trim(), nick);
    });
    return map;
  }, [entriesRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const entriesByPin = useMemo(() => {
    const map = new Map<string, string>();
    (event.entries || []).forEach((e) => {
      const nick = e.nickname?.trim() || e.name?.trim();
      if (nick && e.pin) map.set(e.pin.toLowerCase().trim(), nick);
    });
    return map;
  }, [entriesRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Helpers estáveis para componentes visuais ────────────────────────────
  const getPlayerNick = useCallback(
    (p?: { nickname?: string; name?: string; email?: string; pin?: string }): string => {
      if (!p) return '';
      if (p.email && entriesByEmail.has(p.email.toLowerCase().trim())) {
        return entriesByEmail.get(p.email.toLowerCase().trim())!;
      }
      if (p.pin && entriesByPin.has(p.pin.toLowerCase().trim())) {
        return entriesByPin.get(p.pin.toLowerCase().trim())!;
      }
      return p.nickname?.trim() || p.name?.trim() || 'Jogador';
    },
    [entriesByEmail, entriesByPin]
  );

  // ─── Configurações de sets/games ──────────────────────────────────────────
  const totalSets = (event.setsCount || event.config?.sets || 1) as number;
  const gamesPerSet = Number(
    event.gamesPerSet ||
    event.config?.gamesPerSet ||
    (event.eventType === 'Super 8' ? 4 : 6)
  );

  const parseMatchSets = useCallback(
    (match: TournamentMatch, sets: number) => {
      const gpS = Number(
        event.gamesPerSet ||
        event.config?.gamesPerSet ||
        (event.eventType === 'Super 8' ? 4 : 6)
      );
      const scores: MatchSetScore[] = Array.from({ length: sets }, (_, i) => {
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
          if (n1 >= gpS && n1 > n2) setsWon1++;
          else if (n2 >= gpS && n2 > n1) setsWon2++;
        }
      });

      return { scores, setsWon1, setsWon2 };
    },
    [event.gamesPerSet, event.config?.gamesPerSet, event.eventType]
  );

  return {
    ...queueState,
    pairsById,
    entriesByEmail,
    entriesByPin,
    getPlayerNick,
    parseMatchSets,
    totalSets,
    gamesPerSet,
  };
}
