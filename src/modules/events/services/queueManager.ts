import type { TournamentEvent, TournamentMatch, TournamentPair, EventCategory } from '../types';

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
 * Obtém o nome de exibição do jogador, priorizando o nickname ("Como quer ser chamado")
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
 * Extrai nomes e chaves dos jogadores de uma partida
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
 * Obtém o nome legível de um time priorizando nickname ("Como quer ser chamado")
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

  // Mapa de inscrições para obter o nickname ("Como quer ser chamado")
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
  for (const p of event.pairs || []) {
    pairsById.set(p.id, p);
  }

  // 1. Mapeia partidas ao vivo por quadra e jogadores ocupados
  const busyPlayersMap = new Map<string, { court: string; name: string }>();
  const courtLiveMatchMap = new Map<string, TournamentMatch>();

  for (const rawM of allMatches) {
    if (rawM.status === 'live' && rawM.court) {
      const court = rawM.court;
      const p1 = rawM.pair1 || (rawM.pair1Id ? pairsById.get(rawM.pair1Id) : undefined);
      const p2 = rawM.pair2 || (rawM.pair2Id ? pairsById.get(rawM.pair2Id) : undefined);
      const m = { ...rawM, pair1: p1, pair2: p2, court };
      courtLiveMatchMap.set(court, m);
      const players = getMatchPlayerKeys(m, entriesLookup);
      for (const p of players) {
        busyPlayersMap.set(p.key, { court, name: p.name });
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

/**
 * Verifica se uma partida de fase avançada (semifinal, final, 3º lugar, etc.)
 * ou uma partida sem times definidos está bloqueada aguardando o término da fase anterior.
 */
function isMatchBlockedByPreviousPhase(match: TournamentMatch, allMatches: TournamentMatch[]): string | null {
  // Se os times ainda não foram definidos, está bloqueada aguardando fase anterior
  if (!match.pair1Id || !match.pair2Id || !match.pair1 || !match.pair2) {
    return 'Aguardando término da fase anterior';
  }

  const catMatches = allMatches.filter((m) =>
    match.categoryId ? m.categoryId === match.categoryId : true
  );

  const phase = match.phase?.toLowerCase().trim() || '';

  // Semifinal: requer que todos os jogos da fase de grupos na mesma categoria estejam finalizados
  if (phase === 'semifinal') {
    const groupMatches = catMatches.filter(
      (m) => m.phase === 'chave1' || m.phase === 'chave2' || (m.phase && m.phase.toLowerCase().startsWith('chave'))
    );
    const allGroupFinished = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished');
    if (!allGroupFinished) {
      return 'Aguardando término da fase anterior';
    }
  }

  // Final e 3º Lugar: requer que as semifinais (ou grupos, caso não haja semifinais) estejam finalizadas
  if (phase === 'final' || phase === '3lugar') {
    const semiMatches = catMatches.filter((m) => m.phase === 'semifinal');
    if (semiMatches.length > 0) {
      const allSemiFinished = semiMatches.every((m) => m.status === 'finished');
      if (!allSemiFinished) {
        return 'Aguardando término da fase anterior';
      }
    } else {
      const groupMatches = catMatches.filter(
        (m) => m.phase === 'chave1' || m.phase === 'chave2' || (m.phase && m.phase.toLowerCase().startsWith('chave'))
      );
      const allGroupFinished = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished');
      if (!allGroupFinished) {
        return 'Aguardando término da fase anterior';
      }
    }
  }

  // Quartas de final / Oitavas
  if (phase === 'quartas' || phase === 'oitavas') {
    const groupMatches = catMatches.filter(
      (m) => m.phase === 'chave1' || m.phase === 'chave2' || (m.phase && m.phase.toLowerCase().startsWith('chave'))
    );
    if (groupMatches.length > 0 && !groupMatches.every((m) => m.status === 'finished')) {
      return 'Aguardando término da fase anterior';
    }
  }

  return null;
}

  // 3. Filtra partidas pendentes (não finalizadas e não ao vivo na quadra)
  const pendingMatches = allMatches.filter((m) => m.status !== 'finished' && m.status !== 'live');

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
  const evaluatedQueue: QueueMatchItem[] = orderedMatches.map((rawMatch) => {
    const p1 = rawMatch.pair1 || (rawMatch.pair1Id ? pairsById.get(rawMatch.pair1Id) : undefined);
    const p2 = rawMatch.pair2 || (rawMatch.pair2Id ? pairsById.get(rawMatch.pair2Id) : undefined);
    const m = { ...rawMatch, pair1: p1, pair2: p2 };

    const cat = m.categoryId ? categoryMap.get(m.categoryId) : undefined;
    const players = getMatchPlayerKeys(m, entriesLookup);

    // 1. Verifica se a partida depende de fase anterior ou não tem times definidos
    const phaseBlockedReason = isMatchBlockedByPreviousPhase(m, allMatches);

    // 2. Verifica conflito de jogador em quadra ativa
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
      queueStatus = 'red'; // Bloqueada (fase anterior ou conflito de jogador ou congelada manualmente)
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

    const p1Name = getPairDisplayName(m.pair1, m.pair1Label || 'Time 1', entriesLookup);
    const p2Name = getPairDisplayName(m.pair2, m.pair2Label || 'Time 2', entriesLookup);

    let phaseLabel = m.phase || '';
    if (m.phase === 'chave1') phaseLabel = 'Chave 1';
    else if (m.phase === 'chave2') phaseLabel = 'Chave 2';
    else if (m.phase === 'semifinal') phaseLabel = 'Semifinal';
    else if (m.phase === 'final') phaseLabel = 'Final';
    else if (m.phase === '3lugar') phaseLabel = '3º Lugar';
    else if (m.phase?.toLowerCase().startsWith('rodada')) {
      const num = m.phase.replace(/\D/g, '');
      phaseLabel = num ? `Rodada ${num}` : m.phase;
    }

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
