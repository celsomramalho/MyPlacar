import type { TournamentEvent, TournamentMatch, EventCategory } from '../types';

export interface QueueMatchItem {
  match: TournamentMatch;
  category?: EventCategory;
  queueStatus: 'green' | 'yellow' | 'red' | 'gray';
  conflictReason?: string;
  isFrozen: boolean;
  pair1Name: string;
  pair2Name: string;
  pair1Code?: string;
  pair2Code?: string;
  phaseLabel: string;
}

export interface CourtState {
  courtName: string;
  status: 'free' | 'busy' | 'interdicted';
  activeMatch?: TournamentMatch;
  activeMatchCategory?: EventCategory;
}

export interface QueueCalculationResult {
  courtList: string[];
  courtStates: CourtState[];
  freeCourts: string[];
  totalCourtsCount: number;
  interdictedCourtsCount: number;
  busyCourtsCount: number;
  freeCourtsCount: number;
  orderedQueue: QueueMatchItem[];
  visibleMatches: QueueMatchItem[];
  totalPendingCount: number;
  visibleLimit: number;
}

/**
 * Normaliza o identificador de uma chave para ordenação circular (chave1 -> 1, chave2 -> 2, etc.)
 */
function getChaveNumber(phase?: string): number | null {
  if (!phase) return null;
  const lower = phase.toLowerCase().trim();
  const match = lower.match(/^chave\s*(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Extrai nomes dos jogadores de uma partida
 */
function getMatchPlayerKeys(match: TournamentMatch): { key: string; name: string }[] {
  const players: { key: string; name: string }[] = [];

  const addPair = (pair?: typeof match.pair1) => {
    if (!pair) return;
    if (pair.p1) {
      const name = pair.p1.name || pair.p1.nickname || 'Jogador';
      if (pair.p1.email) players.push({ key: pair.p1.email.toLowerCase().trim(), name });
      if (pair.p1.pin) players.push({ key: pair.p1.pin.toLowerCase().trim(), name });
      if (!pair.p1.email && !pair.p1.pin && name) players.push({ key: name.toLowerCase().trim(), name });
    }
    if (pair.p2) {
      const name = pair.p2.name || pair.p2.nickname || 'Jogador';
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
 * Obtém o nome legível de um time
 */
export function getPairDisplayName(pair?: typeof TournamentMatch.prototype.pair1, fallback = 'Time'): string {
  if (!pair) return fallback;
  const p1Name = pair.p1?.name || pair.p1?.nickname || 'Jogador 1';
  const p2Name = pair.p2?.name || pair.p2?.nickname;
  return p2Name ? `${p1Name} & ${p2Name}` : p1Name;
}

/**
 * Calcula todo o estado da fila única e das quadras de acordo com as regras:
 * A. Status das Quadras (Verde/Livre, Amarela/Ocupada, Vermelha/Interditada)
 * B. Regra de Ordenação da Fila (Prioridade de Categoria + Alternância Circular de Chaves + Ordenação por Cor)
 * C. Quantidade de Partidas Visíveis (4 x (Q_total - Q_interditadas))
 * D. Status das Partidas na Fila (Verde, Amarela, Vermelha, Cinza)
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

  // 1. Mapeia partidas ao vivo por quadra e jogadores ocupados
  const busyPlayersMap = new Map<string, { court: string; name: string }>();
  const courtLiveMatchMap = new Map<string, TournamentMatch>();

  for (const m of allMatches) {
    if (m.status === 'live' && m.court) {
      courtLiveMatchMap.set(m.court, m);
      const players = getMatchPlayerKeys(m);
      for (const p of players) {
        busyPlayersMap.set(p.key, { court: m.court, name: p.name });
      }
    }
  }

  // 2. Monta o estado de cada quadra
  const courtStates: CourtState[] = courtList.map((courtName) => {
    if (interdictedSet.has(courtName)) {
      return {
        courtName,
        status: 'interdicted',
      };
    }
    const liveMatch = courtLiveMatchMap.get(courtName);
    if (liveMatch) {
      return {
        courtName,
        status: 'busy',
        activeMatch: liveMatch,
        activeMatchCategory: liveMatch.categoryId ? categoryMap.get(liveMatch.categoryId) : undefined,
      };
    }
    return {
      courtName,
      status: 'free',
    };
  });

  const freeCourts = courtStates.filter((c) => c.status === 'free').map((c) => c.courtName);
  const interdictedCourtsCount = courtStates.filter((c) => c.status === 'interdicted').length;
  const busyCourtsCount = courtStates.filter((c) => c.status === 'busy').length;
  const freeCourtsCount = freeCourts.length;

  // 3. Filtra partidas pendentes (status 'waiting' ou não iniciadas/não finalizadas)
  const pendingMatches = allMatches.filter((m) => m.status === 'waiting' || (!m.status && m.pair1Id && m.pair2Id));

  // 4. Ordenação da Fila Única Inicial:
  // Critério 1: Prioridade da Categoria (menor número = maior prioridade)
  // Critério 2: Alternância Circular de Chaves dentro da mesma categoria
  const matchesByCategory = new Map<string, TournamentMatch[]>();
  for (const m of pendingMatches) {
    const catId = m.categoryId || '__no_category__';
    if (!matchesByCategory.has(catId)) {
      matchesByCategory.set(catId, []);
    }
    matchesByCategory.get(catId)!.push(m);
  }

  // Ordena categorias por prioridade
  const sortedCategoryIds = Array.from(matchesByCategory.keys()).sort((a, b) => {
    const catA = categoryMap.get(a);
    const catB = categoryMap.get(b);
    const prioA = catA?.priority !== undefined && catA.priority !== null ? catA.priority : 9999;
    const prioB = catB?.priority !== undefined && catB.priority !== null ? catB.priority : 9999;
    if (prioA !== prioB) return prioA - prioB;
    return (catA?.name || '').localeCompare(catB?.name || '');
  });

  const orderedMatches: TournamentMatch[] = [];

  for (const catId of sortedCategoryIds) {
    const catMatches = matchesByCategory.get(catId) || [];

    // Separa partidas de chaves daquelas de fases finais/outras
    const chaveMatchesMap = new Map<number, TournamentMatch[]>();
    const otherMatches: TournamentMatch[] = [];

    for (const m of catMatches) {
      const chNum = getChaveNumber(m.phase);
      if (chNum !== null) {
        if (!chaveMatchesMap.has(chNum)) {
          chaveMatchesMap.set(chNum, []);
        }
        chaveMatchesMap.get(chNum)!.push(m);
      } else {
        otherMatches.push(m);
      }
    }

    // Ordena partidas dentro de cada chave por matchNumber ou order
    const sortedChaveKeys = Array.from(chaveMatchesMap.keys()).sort((a, b) => a - b);
    for (const k of sortedChaveKeys) {
      chaveMatchesMap.get(k)!.sort((a, b) => (a.order ?? a.matchNumber ?? 0) - (b.order ?? b.matchNumber ?? 0));
    }

    // Alternância Circular de Chaves (Chave 1 -> 2 -> 3 -> ... -> 1)
    if (sortedChaveKeys.length > 0) {
      const queues = sortedChaveKeys.map((k) => [...chaveMatchesMap.get(k)!]);
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        for (let i = 0; i < queues.length; i++) {
          if (queues[i].length > 0) {
            const nextMatch = queues[i].shift()!;
            orderedMatches.push(nextMatch);
            hasMore = true;
          }
        }
      }
    }

    // Ordena outras fases da categoria (semifinais, finais, etc.)
    otherMatches.sort((a, b) => (a.order ?? a.matchNumber ?? 0) - (b.order ?? b.matchNumber ?? 0));
    orderedMatches.push(...otherMatches);
  }

  // 5. Calcula elegibilidade e status de cada partida na fila
  let eligibleCount = 0;
  const evaluatedQueue: QueueMatchItem[] = orderedMatches.map((m) => {
    const cat = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
    const players = getMatchPlayerKeys(m);

    // Verifica conflito de jogador em quadra ativa
    let conflictReason: string | undefined;
    for (const p of players) {
      const busyInfo = busyPlayersMap.get(p.key);
      if (busyInfo) {
        conflictReason = `Aguardando: ${busyInfo.name} (jogando na ${busyInfo.court})`;
        break;
      }
    }

    const isFrozen = Boolean(m.frozen || conflictReason);
    let queueStatus: 'green' | 'yellow' | 'red' | 'gray' = 'gray';

    if (isFrozen) {
      queueStatus = 'red'; // Bloqueada/Conflito ou Congelada
    } else {
      // Elegível: status baseado na posição relativa ao número de quadras livres
      if (eligibleCount < freeCourtsCount) {
        queueStatus = 'green'; // Pronta para Quadra
      } else if (eligibleCount < freeCourtsCount + 4) {
        queueStatus = 'yellow'; // Aguardando Chamada
      } else {
        queueStatus = 'gray';
      }
      eligibleCount++;
    }

    const p1Name = getPairDisplayName(m.pair1, 'Time 1');
    const p2Name = getPairDisplayName(m.pair2, 'Time 2');

    let phaseLabel = m.phase || '';
    if (m.phase === 'chave1') phaseLabel = 'Chave 1';
    else if (m.phase === 'chave2') phaseLabel = 'Chave 2';
    else if (m.phase === 'semifinal') phaseLabel = 'Semifinal';
    else if (m.phase === 'final') phaseLabel = 'Final';
    else if (m.phase === '3lugar') phaseLabel = '3º Lugar';

    return {
      match: m,
      category: cat,
      queueStatus,
      conflictReason,
      isFrozen,
      pair1Name: p1Name,
      pair2Name: p2Name,
      pair1Code: m.pair1?.teamCode,
      pair2Code: m.pair2?.teamCode,
      phaseLabel,
    };
  });

  // 6. Ordenação final da fila também por cor: Verde (1) -> Amarela (2) -> Cinza (3) -> Vermelha (4)
  const colorOrder: Record<string, number> = {
    green: 1,
    yellow: 2,
    gray: 3,
    red: 4,
  };

  const orderedQueue = [...evaluatedQueue].sort((a, b) => {
    const colorDiff = colorOrder[a.queueStatus] - colorOrder[b.queueStatus];
    return colorDiff;
  });

  // 7. Limite de partidas visíveis: 4 * (Q_total - Q_interditadas)
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
  };
}
