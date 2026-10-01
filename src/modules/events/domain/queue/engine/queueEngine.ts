/**
 * Domínio: Fila de Quadras — Engine Puro (sem React, sem Firebase)
 *
 * Contém toda a lógica de negócio para calcular:
 *   A. Estado das quadras (livre / ocupada / interditada)
 *   B. Ordenação circular por chave e prioridade de categoria
 *   C. Status semáforo de cada partida (verde / amarelo / cinza / vermelho)
 *   D. Estimativas de tempo de chamada e duração
 *
 * Extraído de src/modules/events/services/queueManager.ts na Fase 2 da
 * refatoração por domínio — ver docs/PLANO_REFATORACAO_FILA_QUADRAS.md
 *
 * @pure — todas as funções exportadas são determinísticas e sem efeitos colaterais.
 */

import type { TournamentEvent, TournamentMatch, TournamentPair, EventCategory } from '@modules/events/types';
import type {
  CourtState,
  QueueMatchItem,
  QueueCalculationResult,
  MatchDurationStats,
} from '../types';

// ─── Helpers Internos ────────────────────────────────────────────────────────

/**
 * Normaliza o identificador de uma chave para ordenação circular
 * (chave1 → 1, chave2 → 2, etc.)
 */
function getChaveNumber(phase?: string): number | null {
  if (!phase) return null;
  const lower = phase.toLowerCase().trim();
  const match = lower.match(/^chave\s*(\d+)$/);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Obtém o nome de exibição do jogador, priorizando o nickname
 * registrado nas inscrições do evento.
 */
function getPlayerDisplayName(
  player?: { nickname?: string; name?: string; email?: string; pin?: string },
  entriesLookup?: { byEmail: Map<string, string>; byPin: Map<string, string> }
): string {
  if (!player) return '';
  if (player.email && entriesLookup?.byEmail.has(player.email.toLowerCase().trim())) {
    const nick = entriesLookup.byEmail.get(player.email.toLowerCase().trim());
    if (nick) return nick;
  }
  if (player.pin && entriesLookup?.byPin.has(player.pin.toLowerCase().trim())) {
    const nick = entriesLookup.byPin.get(player.pin.toLowerCase().trim());
    if (nick) return nick;
  }
  return player.nickname?.trim() || player.name?.trim() || 'Jogador';
}

/**
 * Extrai as chaves de identificação dos jogadores de uma partida
 * (email e pin) para detecção de conflito de atletas em quadra.
 */
function getMatchPlayerKeys(
  match: TournamentMatch,
  entriesLookup?: { byEmail: Map<string, string>; byPin: Map<string, string> }
): { key: string; name: string }[] {
  const players: { key: string; name: string }[] = [];

  const addPair = (pair?: typeof match.pair1) => {
    if (!pair) return;
    if (pair.p1) {
      const name = getPlayerDisplayName(pair.p1, entriesLookup);
      if (pair.p1.email) players.push({ key: pair.p1.email.toLowerCase().trim(), name });
      if (pair.p1.pin) players.push({ key: pair.p1.pin.toLowerCase().trim(), name });
      if (!pair.p1.email && !pair.p1.pin && name) players.push({ key: name.toLowerCase().trim(), name });
    }
    if (pair.p2) {
      const name = getPlayerDisplayName(pair.p2, entriesLookup);
      if (pair.p2.email) players.push({ key: pair.p2.email.toLowerCase().trim(), name });
      if (pair.p2.pin) players.push({ key: pair.p2.pin.toLowerCase().trim(), name });
      if (!pair.p2.email && !pair.p2.pin && name) players.push({ key: name.toLowerCase().trim(), name });
    }
  };

  addPair(match.pair1);
  addPair(match.pair2);

  return players;
}

/**
 * Resolve o label de fase de uma partida para exibição amigável.
 */
function resolvePhaseLabel(phase?: string): string {
  if (!phase) return '';
  if (phase === 'chave1') return 'Chave 1';
  if (phase === 'chave2') return 'Chave 2';
  if (phase === 'semifinal') return 'Semifinal';
  if (phase === 'final') return 'Final';
  if (phase === '3lugar') return '3º Lugar';
  if (phase.toLowerCase().startsWith('rodada')) {
    const num = phase.replace(/\D/g, '');
    return num ? `Rodada ${num}` : phase;
  }
  if (phase.startsWith('super8d_fase1_')) {
    const parts = phase.replace('super8d_fase1_', '').split('_r');
    const group = parts[0]?.toUpperCase() || '';
    const round = parts[1] || '';
    return `Grupo ${group}${round ? ` R${round}` : ''}`;
  }
  if (phase.startsWith('super8d_semi_ouro')) return `Semi Ouro ${phase.replace('super8d_semi_ouro_', '')}`;
  if (phase.startsWith('super8d_semi_prata')) return `Semi Prata ${phase.replace('super8d_semi_prata_', '')}`;
  if (phase === 'super8d_final_ouro') return 'Final Ouro';
  if (phase === 'super8d_3lugar_ouro') return '3º Ouro';
  if (phase === 'super8d_final_prata') return 'Final Prata';
  if (phase === 'super8d_3lugar_prata') return '3º Prata';
  return phase;
}

// ─── API Pública ─────────────────────────────────────────────────────────────

/**
 * Obtém o nome de exibição completo de uma dupla, priorizando os
 * nicknames registrados nas inscrições.
 */
export function getPairDisplayName(
  pair?: TournamentPair,
  fallback = 'Time',
  entriesLookup?: { byEmail: Map<string, string>; byPin: Map<string, string> }
): string {
  if (!pair) return fallback;
  const p1Name = getPlayerDisplayName(pair.p1, entriesLookup) || 'Jogador 1';
  const p2Name = pair.p2 ? getPlayerDisplayName(pair.p2, entriesLookup) : undefined;
  return p2Name ? `${p1Name} & ${p2Name}` : p1Name;
}

/**
 * Calcula a duração média real das partidas finalizadas do evento.
 * Usa durationMinutes quando disponível, ou startedAt/finishedAt.
 * Se não houver histórico, retorna estimativa com base no formato do evento.
 */
export function calculateAverageMatchDuration(
  matches: TournamentMatch[],
  event?: Pick<TournamentEvent, 'setsCount' | 'config' | 'eventType'>
): MatchDurationStats {
  const finishedWithDuration = matches.filter((m) => {
    if (m.status !== 'finished') return false;
    if (typeof m.durationMinutes === 'number' && m.durationMinutes > 0) return true;
    if (m.startedAt && m.finishedAt) {
      const s = new Date(m.startedAt).getTime();
      const f = new Date(m.finishedAt).getTime();
      return !isNaN(s) && !isNaN(f) && f > s;
    }
    return false;
  });

  if (finishedWithDuration.length > 0) {
    const totalMinutes = finishedWithDuration.reduce((acc, m) => {
      if (typeof m.durationMinutes === 'number' && m.durationMinutes > 0) {
        return acc + m.durationMinutes;
      }
      const s = new Date(m.startedAt!).getTime();
      const f = new Date(m.finishedAt!).getTime();
      return acc + Math.max(1, Math.round((f - s) / 60000));
    }, 0);

    return {
      averageMinutes: Math.max(5, Math.round(totalMinutes / finishedWithDuration.length)),
      sampleCount: finishedWithDuration.length,
      isEstimated: false,
    };
  }

  // Fallback: duração estimada por formato
  const sets = event?.setsCount || event?.config?.sets || 1;
  const isSuper8 =
    event?.eventType === 'Super 8' ||
    event?.eventType === 'Super 8 individual' ||
    event?.config?.sportType === 'Super 8';

  let defaultDuration = 25;
  if (isSuper8) defaultDuration = 20;
  else if (sets === 1) defaultDuration = 25;
  else if (sets === 3) defaultDuration = 45;
  else if (sets >= 5) defaultDuration = 75;

  return {
    averageMinutes: defaultDuration,
    sampleCount: 0,
    isEstimated: true,
  };
}

/**
 * Verifica se uma partida de fase avançada está bloqueada aguardando
 * o término da fase anterior na mesma categoria.
 *
 * @returns string com o motivo do bloqueio, ou null se liberada.
 */
export function isMatchBlockedByPreviousPhase(
  match: TournamentMatch,
  allMatches: TournamentMatch[]
): string | null {
  // Times ainda não definidos — aguardando fase anterior
  if (!match.pair1Id || !match.pair2Id || !match.pair1 || !match.pair2) {
    return 'Aguardando término da fase anterior';
  }

  const catMatches = allMatches.filter((m) =>
    match.categoryId ? m.categoryId === match.categoryId : true
  );

  const phase = match.phase?.toLowerCase().trim() || '';

  const isGroupPhase = (p?: string) =>
    p === 'chave1' || p === 'chave2' || (p != null && p.toLowerCase().startsWith('chave'));

  const groupMatches = catMatches.filter((m) => isGroupPhase(m.phase));
  const allGroupFinished =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished');

  // Semifinal: todos os grupos devem ter terminado
  if (phase === 'semifinal') {
    if (!allGroupFinished) return 'Aguardando término da fase anterior';
  }

  // Final / 3º Lugar: semifinais (ou grupos se não houver semifinais) devem ter terminado
  if (phase === 'final' || phase === '3lugar') {
    const semiMatches = catMatches.filter((m) => m.phase === 'semifinal');
    if (semiMatches.length > 0) {
      if (!semiMatches.every((m) => m.status === 'finished')) {
        return 'Aguardando término da fase anterior';
      }
    } else if (!allGroupFinished) {
      return 'Aguardando término da fase anterior';
    }
  }

  // Quartas / Oitavas: grupos devem ter terminado
  if (phase === 'quartas' || phase === 'oitavas') {
    if (groupMatches.length > 0 && !groupMatches.every((m) => m.status === 'finished')) {
      return 'Aguardando término da fase anterior';
    }
  }

  return null;
}

/**
 * Calcula o estado completo da fila única e das quadras do evento.
 *
 * Regras de negócio:
 *   A. Estado das Quadras (Livre / Ocupada / Interditada)
 *   B. Ordenação da Fila (Prioridade de Categoria + Alternância Circular de Chaves)
 *   C. Limite de Partidas Visíveis: 4 × (quadras_efetivas)
 *   D. Semáforo de Partidas na Fila (Verde / Amarela / Cinza / Vermelha)
 *   E. Estimativas de tempo de chamada e liberação de quadra
 */
export function calculateQueueState(event: TournamentEvent): QueueCalculationResult {
  const courtsCount = event.courtsCount ?? event.courtNames?.length ?? 0;
  const courtList: string[] =
    event.courtNames && event.courtNames.length > 0
      ? event.courtNames
      : courtsCount > 0
      ? Array.from({ length: courtsCount }, (_, i) => `Quadra ${i + 1}`)
      : [];

  const interdictedSet = new Set(event.interdictedCourts || []);
  const allMatches = event.matches || [];
  const categories = event.categories || [];
  const categoryMap = new Map<string, EventCategory>(categories.map((c) => [c.id, c]));

  // Lookup de nicknames a partir das inscrições
  const entries = event.entries || [];
  const entriesByEmail = new Map<string, string>();
  const entriesByPin = new Map<string, string>();
  for (const e of entries) {
    const nick = e.nickname?.trim() || e.name?.trim();
    if (nick) {
      if (e.email) entriesByEmail.set(e.email.toLowerCase().trim(), nick);
      if (e.pin) entriesByPin.set(e.pin.toLowerCase().trim(), nick);
    }
  }
  const entriesLookup = { byEmail: entriesByEmail, byPin: entriesByPin };

  const pairsById = new Map<string, TournamentPair>();
  for (const p of event.pairs || []) pairsById.set(p.id, p);

  // ─── 1. Mapeia partidas ao vivo e jogadores ocupados ──────────────────────

  const busyPlayersMap = new Map<string, { court: string; name: string }>();
  const courtLiveMatchMap = new Map<string, TournamentMatch>();

  for (const rawM of allMatches) {
    if (rawM.status === 'live' && rawM.court) {
      const court = rawM.court;
      const p1 = rawM.pair1 || (rawM.pair1Id ? pairsById.get(rawM.pair1Id) : undefined);
      const p2 = rawM.pair2 || (rawM.pair2Id ? pairsById.get(rawM.pair2Id) : undefined);
      const m = { ...rawM, pair1: p1, pair2: p2, court };
      courtLiveMatchMap.set(court, m);
      for (const p of getMatchPlayerKeys(m, entriesLookup)) {
        busyPlayersMap.set(p.key, { court, name: p.name });
      }
    }
  }

  const now = new Date();
  const durationStats = calculateAverageMatchDuration(allMatches, event);

  // ─── 2. Estado de cada quadra ─────────────────────────────────────────────

  const courtStates: CourtState[] = courtList.map((courtName) => {
    if (interdictedSet.has(courtName)) {
      return { courtName, status: 'interdicted' };
    }
    const liveMatch = courtLiveMatchMap.get(courtName);
    if (liveMatch) {
      let remainingMinutes = durationStats.averageMinutes;
      const startedAt = liveMatch.startedAt;
      if (startedAt) {
        const startMs = new Date(startedAt).getTime();
        if (!isNaN(startMs)) {
          const elapsedMins = Math.floor((now.getTime() - startMs) / 60000);
          remainingMinutes = Math.max(2, durationStats.averageMinutes - elapsedMins);
        }
      }
      const finishDate = new Date(now.getTime() + remainingMinutes * 60000);
      return {
        courtName,
        status: 'busy',
        activeMatch: liveMatch,
        activeMatchCategory: liveMatch.categoryId ? categoryMap.get(liveMatch.categoryId) : undefined,
        startedAt,
        estimatedRemainingMinutes: remainingMinutes,
        estimatedFinishTimeStr: finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }
    return { courtName, status: 'free' };
  });

  const freeCourts = courtStates.filter((c) => c.status === 'free').map((c) => c.courtName);
  const interdictedCourtsCount = courtStates.filter((c) => c.status === 'interdicted').length;
  const busyCourtsCount = courtStates.filter((c) => c.status === 'busy').length;
  const freeCourtsCount = freeCourts.length;

  // ─── 3. Partidas pendentes ────────────────────────────────────────────────

  const pendingMatches = allMatches.filter((m) => m.status !== 'finished' && m.status !== 'live');

  // ─── 4. Ordenação por categoria e alternância circular de chaves ──────────

  const matchesByCategory = new Map<string, TournamentMatch[]>();
  for (const m of pendingMatches) {
    const catId = m.categoryId || '__no_category__';
    if (!matchesByCategory.has(catId)) matchesByCategory.set(catId, []);
    matchesByCategory.get(catId)!.push(m);
  }

  const sortedCategoryIds = Array.from(matchesByCategory.keys()).sort((a, b) => {
    const catA = categoryMap.get(a);
    const catB = categoryMap.get(b);
    const prioA = catA?.priority != null ? catA.priority : 9999;
    const prioB = catB?.priority != null ? catB.priority : 9999;
    if (prioA !== prioB) return prioA - prioB;
    return (catA?.name || '').localeCompare(catB?.name || '');
  });

  const orderedMatches: TournamentMatch[] = [];

  for (const catId of sortedCategoryIds) {
    const catMatches = matchesByCategory.get(catId) || [];
    const chaveMatchesMap = new Map<number, TournamentMatch[]>();
    const otherMatches: TournamentMatch[] = [];

    for (const m of catMatches) {
      const chNum = getChaveNumber(m.phase);
      if (chNum !== null) {
        if (!chaveMatchesMap.has(chNum)) chaveMatchesMap.set(chNum, []);
        chaveMatchesMap.get(chNum)!.push(m);
      } else {
        otherMatches.push(m);
      }
    }

    const sortedChaveKeys = Array.from(chaveMatchesMap.keys()).sort((a, b) => a - b);
    for (const k of sortedChaveKeys) {
      chaveMatchesMap.get(k)!.sort((a, b) => (a.order ?? a.matchNumber ?? 0) - (b.order ?? b.matchNumber ?? 0));
    }

    // Alternância circular: Chave 1 → 2 → 3 → … → 1
    if (sortedChaveKeys.length > 0) {
      const queues = sortedChaveKeys.map((k) => [...chaveMatchesMap.get(k)!]);
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        for (const q of queues) {
          if (q.length > 0) {
            orderedMatches.push(q.shift()!);
            hasMore = true;
          }
        }
      }
    }

    otherMatches.sort((a, b) => (a.order ?? a.matchNumber ?? 0) - (b.order ?? b.matchNumber ?? 0));
    orderedMatches.push(...otherMatches);
  }

  // ─── 5. Elegibilidade e semáforo de cada partida ──────────────────────────

  let eligibleCount = 0;
  const evaluatedQueue: QueueMatchItem[] = orderedMatches.map((rawMatch) => {
    const p1 = rawMatch.pair1 || (rawMatch.pair1Id ? pairsById.get(rawMatch.pair1Id) : undefined);
    const p2 = rawMatch.pair2 || (rawMatch.pair2Id ? pairsById.get(rawMatch.pair2Id) : undefined);
    const m = { ...rawMatch, pair1: p1, pair2: p2 };

    const cat = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
    const players = getMatchPlayerKeys(m, entriesLookup);

    const phaseBlockedReason = isMatchBlockedByPreviousPhase(m, allMatches);

    let playerConflictReason: string | undefined;
    if (!phaseBlockedReason) {
      for (const p of players) {
        const busyInfo = busyPlayersMap.get(p.key);
        if (busyInfo) {
          playerConflictReason = `Aguardando: ${busyInfo.name} (jogando na ${busyInfo.court})`;
          break;
        }
      }
    }

    const conflictReason = phaseBlockedReason || playerConflictReason;
    const isFrozen = Boolean(m.frozen || conflictReason);
    let queueStatus: 'green' | 'yellow' | 'red' | 'gray' = 'gray';

    if (isFrozen) {
      queueStatus = 'red';
    } else {
      if (eligibleCount < freeCourtsCount) {
        queueStatus = 'green';
      } else if (eligibleCount < freeCourtsCount + 4) {
        queueStatus = 'yellow';
      } else {
        queueStatus = 'gray';
      }
      eligibleCount++;
    }

    return {
      match: m,
      category: cat,
      queueStatus,
      conflictReason,
      isFrozen,
      pair1Name: getPairDisplayName(m.pair1, m.pair1Label || 'Time 1', entriesLookup),
      pair2Name: getPairDisplayName(m.pair2, m.pair2Label || 'Time 2', entriesLookup),
      pair1Code: m.pair1?.teamCode,
      pair2Code: m.pair2?.teamCode,
      phaseLabel: resolvePhaseLabel(m.phase),
    };
  });

  // ─── 6. Ordenação final por cor: Verde → Amarela → Cinza → Vermelha ───────

  const colorOrder: Record<string, number> = { green: 1, yellow: 2, gray: 3, red: 4 };
  const orderedQueue = [...evaluatedQueue].sort(
    (a, b) => colorOrder[a.queueStatus] - colorOrder[b.queueStatus]
  );

  // ─── 7. Simulação de estimativas de tempo de chamada ─────────────────────

  interface CourtSimSlot { courtName: string; availableAt: Date }

  const courtSimSlots: CourtSimSlot[] = [];
  courtStates.forEach((cs) => {
    if (cs.status === 'interdicted') return;
    if (cs.status === 'free') {
      courtSimSlots.push({ courtName: cs.courtName, availableAt: new Date(now.getTime()) });
    } else if (cs.status === 'busy') {
      const remaining = cs.estimatedRemainingMinutes ?? durationStats.averageMinutes;
      courtSimSlots.push({ courtName: cs.courtName, availableAt: new Date(now.getTime() + remaining * 60000) });
    }
  });

  let nextCourtFreeWaitMinutes: number | undefined;
  let nextCourtFreeTimeStr: string | undefined;

  if (courtSimSlots.length > 0) {
    const nextSlot = [...courtSimSlots].sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime())[0];
    nextCourtFreeWaitMinutes = Math.max(0, Math.round((nextSlot.availableAt.getTime() - now.getTime()) / 60000));
    nextCourtFreeTimeStr = nextSlot.availableAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const simSlots = courtSimSlots.map((s) => ({ ...s, availableAt: new Date(s.availableAt.getTime()) }));

  orderedQueue.forEach((item) => {
    if (simSlots.length === 0 || item.queueStatus === 'red') return;
    simSlots.sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());
    const earliest = simSlots[0];
    const callDate = new Date(earliest.availableAt.getTime());
    item.estimatedWaitMinutes = Math.max(0, Math.round((callDate.getTime() - now.getTime()) / 60000));
    item.estimatedCallTimeStr = callDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    earliest.availableAt = new Date(callDate.getTime() + durationStats.averageMinutes * 60000);
  });

  // ─── 8. Limite de visibilidade: 4 × quadras_efetivas ─────────────────────

  const effectiveCourts = Math.max(1, courtList.length - interdictedCourtsCount);
  const visibleLimit = 4 * effectiveCourts;
  const visibleMatches = orderedQueue.slice(0, visibleLimit);

  return {
    courtList,
    courtStates,
    freeCourts,
    totalCourtsCount: courtList.length,
    interdictedCourtsCount,
    busyCourtsCount,
    freeCourtsCount,
    orderedQueue,
    visibleMatches,
    totalPendingCount: orderedQueue.length,
    visibleLimit,
    averageMatchDurationMinutes: durationStats.averageMinutes,
    isDurationEstimated: durationStats.isEstimated,
    finishedMatchesCountWithDuration: durationStats.sampleCount,
    nextCourtFreeWaitMinutes,
    nextCourtFreeTimeStr,
  };
}
