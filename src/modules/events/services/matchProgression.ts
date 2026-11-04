import type {
  PlayerStanding,
  Super8StandingsOptions,
  TechnicalTieBreakOption,
  TournamentEntry,
  TournamentMatch,
  TournamentPair,
} from '../types';
import { minifyPairForStorage, minifyEntryForPair } from '../types';
import {
  parseMatchSets,
  parseScoresFromMatch,
} from '../domain/brackets/engine/matchScoreEngine';

export {
  parseMatchSets,
  parseScoresFromMatch,
} from '../domain/brackets/engine/matchScoreEngine';

export {
  calculateBracketStandings,
  updatePlayoffProgression,
  type TeamStanding,
} from '../domain/brackets/engine/bracketProgressionEngine';

/**
 * Normaliza chave de identificação do atleta (email prioritário, fallback PIN ou nome)
 */
const getEntryKey = (e?: Partial<TournamentEntry>): string => {
  if (!e) return '';
  return (e.email || e.pin || e.name || '').toLowerCase().trim();
};

const matchesPlayer = (player: TournamentEntry, candidate?: Partial<TournamentEntry>): boolean => {
  if (!candidate) return false;
  if (player.registrationId && candidate.registrationId) {
    return player.registrationId === candidate.registrationId;
  }
  if (player.email && candidate.email) {
    return player.email.toLowerCase().trim() === candidate.email.toLowerCase().trim();
  }
  if (player.pin && candidate.pin) {
    return player.pin.toLowerCase().trim() === candidate.pin.toLowerCase().trim();
  }
  const k1 = getEntryKey(player);
  const k2 = getEntryKey(candidate);
  return Boolean(k1 && k2 && k1 === k2);
};

interface PlayerH2H {
  matchesCount: number;
  p1Wins: number;
  p2Wins: number;
  p1Games: number;
  p2Games: number;
}

const getPlayersHeadToHead = (
  p1: TournamentEntry,
  p2: TournamentEntry,
  matches: TournamentMatch[]
): PlayerH2H => {
  let matchesCount = 0;
  let p1Wins = 0;
  let p2Wins = 0;
  let p1Games = 0;
  let p2Games = 0;

  matches.forEach((m) => {
    if (m.status !== 'finished') return;

    const team1 = [m.pair1?.p1, m.pair1?.p2].filter(Boolean) as TournamentEntry[];
    const team2 = [m.pair2?.p1, m.pair2?.p2].filter(Boolean) as TournamentEntry[];

    const p1InT1 = team1.some((a) => matchesPlayer(p1, a));
    const p1InT2 = team2.some((a) => matchesPlayer(p1, a));
    const p2InT1 = team1.some((a) => matchesPlayer(p2, a));
    const p2InT2 = team2.some((a) => matchesPlayer(p2, a));

    // Devem ter jogado em lados opostos na partida
    const isOpposite = (p1InT1 && p2InT2) || (p1InT2 && p2InT1);
    if (!isOpposite) return;

    matchesCount += 1;
    const { g1, g2 } = parseScoresFromMatch(m);
    const isTeam1Winner = m.winnerPairId
      ? m.winnerPairId === m.pair1Id || m.winnerPairId === m.pair1?.id
      : g1 > g2;

    if (p1InT1 && p2InT2) {
      if (isTeam1Winner) p1Wins += 1;
      else p2Wins += 1;
      p1Games += g1;
      p2Games += g2;
    } else {
      if (!isTeam1Winner) p1Wins += 1;
      else p2Wins += 1;
      p1Games += g2;
      p2Games += g1;
    }
  });

  return { matchesCount, p1Wins, p2Wins, p1Games, p2Games };
};

const isDrawWinner = (entry: TournamentEntry, drawWinners: string[]): boolean => {
  if (!drawWinners || drawWinners.length === 0) return false;
  return drawWinners.some((dw) => {
    const val = String(dw || '').toLowerCase().trim();
    if (!val) return false;
    if (entry.registrationId && String(entry.registrationId).toLowerCase().trim() === val) return true;
    if (entry.email && entry.email.toLowerCase().trim() === val) return true;
    if (entry.pin && entry.pin.toLowerCase().trim() === val) return true;
    if (entry.name && entry.name.toLowerCase().trim() === val) return true;
    if (entry.nickname && entry.nickname.toLowerCase().trim() === val) return true;
    return false;
  });
};

const getDrawWinnerIndex = (entry: TournamentEntry, drawWinners: string[]): number => {
  if (!drawWinners || drawWinners.length === 0) return 999;
  for (let i = 0; i < drawWinners.length; i++) {
    const val = String(drawWinners[i] || '').toLowerCase().trim();
    if (!val) continue;
    if (entry.registrationId && String(entry.registrationId).toLowerCase().trim() === val) return i;
    if (entry.email && entry.email.toLowerCase().trim() === val) return i;
    if (entry.pin && entry.pin.toLowerCase().trim() === val) return i;
    if (entry.name && entry.name.toLowerCase().trim() === val) return i;
    if (entry.nickname && entry.nickname.toLowerCase().trim() === val) return i;
  }
  return 999;
};

const resolveTechnicalTieSubgroup = (
  subgroup: PlayerStanding[],
  technicalTieBreak: TechnicalTieBreakOption = 'Rank compartilhado',
  drawWinners: string[] = []
): PlayerStanding[] => {
  if (subgroup.length <= 1) return subgroup;

  if (technicalTieBreak === 'Alfabético') {
    const sorted = [...subgroup].sort((a, b) =>
      (a.entry.name || a.entry.nickname || '').localeCompare(b.entry.name || b.entry.nickname || '')
    );
    sorted.forEach((st) => {
      st.isTechnicalTie = false;
      st.tieBreakNote = 'Desempate por ordem alfabética';
    });
    return sorted;
  }

  if (technicalTieBreak === 'Sorteio') {
    const winners = subgroup.filter((st) => isDrawWinner(st.entry, drawWinners));
    const nonWinners = subgroup.filter((st) => !isDrawWinner(st.entry, drawWinners));

    if (winners.length > 0) {
      // Ordena os ganhadores pela ordem em que foram indicados no sorteio
      winners.sort((a, b) => {
        const idxA = getDrawWinnerIndex(a.entry, drawWinners);
        const idxB = getDrawWinnerIndex(b.entry, drawWinners);
        return idxA - idxB;
      });

      winners.forEach((st, idx) => {
        st.isTechnicalTie = false;
        st.tieBreakNote =
          idx === 0
            ? 'Desempate por sorteio (ganhador do sorteio)'
            : 'Desempate por sorteio';
      });

      nonWinners.sort((a, b) => (a.entry.name || '').localeCompare(b.entry.name || ''));
      nonWinners.forEach((st) => {
        // Se sobrou mais de 1 não sorteado, continuam em empate técnico aguardando definição
        st.isTechnicalTie = nonWinners.length > 1;
        st.tieBreakNote =
          nonWinners.length > 1
            ? 'Empate técnico (aguardando sorteio)'
            : 'Desempate por sorteio';
      });

      return [...winners, ...nonWinners];
    } else {
      subgroup.forEach((st) => {
        st.isTechnicalTie = true;
        st.tieBreakNote = 'Empate técnico (aguardando sorteio)';
      });
      return [...subgroup].sort((a, b) => (a.entry.name || '').localeCompare(b.entry.name || ''));
    }
  }

  // Padrão: Rank compartilhado
  subgroup.forEach((st) => {
    st.isTechnicalTie = true;
    st.tieBreakNote = 'Empate técnico (critérios matemáticos iguais)';
  });
  return [...subgroup].sort((a, b) => (a.entry.name || '').localeCompare(b.entry.name || ''));
};

/**
 * Desempate recursivo de atletas no Super 8:
 * 1º Critério: Saldo de Games (SG = Games Pró - Games Contra) -> Classificação simples/direta
 * 2º Critério: Games Pró (GP) -> Classificação simples/direta
 * 3º Critério: Confronto Direto (apenas quando SG e GP forem rigorosamente iguais entre 2 atletas)
 * 4º Critério: % de Games
 * 5º Critério: Empate Técnico (conforme configuração: Rank Compartilhado / Alfabético / Sorteio)
 */
const resolvePlayerTies = (
  group: PlayerStanding[],
  matches: TournamentMatch[],
  technicalTieBreak: TechnicalTieBreakOption = 'Rank Compartilhado',
  drawWinners: string[] = []
): PlayerStanding[] => {
  if (group.length <= 1) return group;

  group.forEach((st) => {
    st.isTiedWithOthers = true;
  });

  // CASO 1: Exatamente 2 atletas empatados em vitórias
  if (group.length === 2) {
    const [p1, p2] = group;

    // 1º Critério: Saldo de Games (SG) -> Classificação simples sem nota de desempate
    if (p1.gamesDiff !== p2.gamesDiff) {
      const higher = p1.gamesDiff > p2.gamesDiff ? p1 : p2;
      const lower = p1.gamesDiff > p2.gamesDiff ? p2 : p1;
      higher.tieBreakNote = undefined;
      lower.tieBreakNote = undefined;
      return [higher, lower];
    }

    // 2º Critério: Games Pró (GP) -> Classificação simples sem nota de desempate
    if (p1.gamesWon !== p2.gamesWon) {
      const higher = p1.gamesWon > p2.gamesWon ? p1 : p2;
      const lower = p1.gamesWon > p2.gamesWon ? p2 : p1;
      higher.tieBreakNote = undefined;
      lower.tieBreakNote = undefined;
      return [higher, lower];
    }

    // 3º Critério: Confronto Direto (apenas quando Vitórias, SG e GP forem rigorosamente iguais)
    const h2h = getPlayersHeadToHead(p1.entry, p2.entry, matches);
    if (h2h.matchesCount > 0) {
      if (h2h.p1Wins !== h2h.p2Wins) {
        const winner = h2h.p1Wins > h2h.p2Wins ? p1 : p2;
        const loser = h2h.p1Wins > h2h.p2Wins ? p2 : p1;
        winner.tieBreakNote = 'Desempate por confronto direto';
        loser.tieBreakNote = 'Desempate por confronto direto';
        return [winner, loser];
      }
      if (h2h.p1Games !== h2h.p2Games) {
        const winner = h2h.p1Games > h2h.p2Games ? p1 : p2;
        const loser = h2h.p1Games > h2h.p2Games ? p2 : p1;
        winner.tieBreakNote = 'Desempate por confronto direto (saldo no confronto)';
        loser.tieBreakNote = 'Desempate por confronto direto (saldo no confronto)';
        return [winner, loser];
      }
    }

    // 4º Critério: % de Games
    const pct1 = (p1.gamesWon + p1.gamesLost) > 0 ? p1.gamesWon / (p1.gamesWon + p1.gamesLost) : 0;
    const pct2 = (p2.gamesWon + p2.gamesLost) > 0 ? p2.gamesWon / (p2.gamesWon + p2.gamesLost) : 0;
    if (Math.abs(pct1 - pct2) > 0.0001) {
      const higher = pct1 > pct2 ? p1 : p2;
      const lower = pct1 > pct2 ? p2 : p1;
      higher.tieBreakNote = `Desempate por maior % de games: ${(Math.max(pct1, pct2) * 100).toFixed(1)}%`;
      lower.tieBreakNote = `Desempate por maior % de games: ${(Math.min(pct1, pct2) * 100).toFixed(1)}%`;
      return [higher, lower];
    }

    // 5º Critério: Empate Técnico (todos os critérios matemáticos iguais)
    return resolveTechnicalTieSubgroup([p1, p2], technicalTieBreak, drawWinners);
  }

  // CASO 2: 3 ou mais atletas empatados em vitórias
  // Separa subgrupos por Saldo de Games (SG)
  const gamesDiffMap = new Map<number, PlayerStanding[]>();
  group.forEach((st) => {
    const list = gamesDiffMap.get(st.gamesDiff) || [];
    list.push(st);
    gamesDiffMap.set(st.gamesDiff, list);
  });

  if (gamesDiffMap.size > 1) {
    const sortedDiffs = Array.from(gamesDiffMap.keys()).sort((a, b) => b - a);
    const result: PlayerStanding[] = [];

    sortedDiffs.forEach((diff) => {
      const subgroup = gamesDiffMap.get(diff)!;
      if (subgroup.length === 1) {
        const st = subgroup[0];
        st.tieBreakNote = undefined;
        result.push(st);
      } else {
        const resolved = resolvePlayerTies(subgroup, matches, technicalTieBreak, drawWinners);
        result.push(...resolved);
      }
    });

    return result;
  }

  // Se todos tiverem o mesmo Saldo de Games, separa por Games Pró (GP)
  const gamesWonMap = new Map<number, PlayerStanding[]>();
  group.forEach((st) => {
    const list = gamesWonMap.get(st.gamesWon) || [];
    list.push(st);
    gamesWonMap.set(st.gamesWon, list);
  });

  if (gamesWonMap.size > 1) {
    const sortedWon = Array.from(gamesWonMap.keys()).sort((a, b) => b - a);
    const result: PlayerStanding[] = [];

    sortedWon.forEach((won) => {
      const subgroup = gamesWonMap.get(won)!;
      if (subgroup.length === 1) {
        const st = subgroup[0];
        st.tieBreakNote = undefined;
        result.push(st);
      } else {
        const resolved = resolvePlayerTies(subgroup, matches, technicalTieBreak, drawWinners);
        result.push(...resolved);
      }
    });

    return result;
  }

  // Se todos tiverem o mesmo GP, separa por % de Games
  const pctKey = (st: PlayerStanding) => {
    const total = st.gamesWon + st.gamesLost;
    return total > 0 ? (st.gamesWon / total).toFixed(4) : '0';
  };

  const pctMap = new Map<string, PlayerStanding[]>();
  group.forEach((st) => {
    const k = pctKey(st);
    const list = pctMap.get(k) || [];
    list.push(st);
    pctMap.set(k, list);
  });

  if (pctMap.size > 1) {
    const sortedPcts = Array.from(pctMap.keys()).sort((a, b) => Number(b) - Number(a));
    const result: PlayerStanding[] = [];

    sortedPcts.forEach((pct) => {
      const subgroup = pctMap.get(pct)!;
      if (subgroup.length === 1) {
        const st = subgroup[0];
        st.tieBreakNote = `Desempate por maior % de games: ${(Number(pct) * 100).toFixed(1)}%`;
        result.push(st);
      } else {
        const resolved = resolvePlayerTies(subgroup, matches, technicalTieBreak, drawWinners);
        result.push(...resolved);
      }
    });

    return result;
  }

  // Todos os atletas têm estatísticas idênticas -> Empate Técnico
  return resolveTechnicalTieSubgroup(group, technicalTieBreak, drawWinners);
};

/**
 * Calcula a classificação individual dos atletas no Super 8 de acordo com os critérios oficiais:
 * 1º Critério: Número de Vitórias (ou Pontos no Ranking)
 * 2º Critério: Confronto Direto (em caso de 2 atletas)
 * 3º Critério: Saldo de Games (SG = Games a Favor - Games Sofridos)
 * 4º Critério: Games Pró (GP = total de Games a Favor)
 * 5º Critério: % de Games (Games Pró / Total de Games)
 * 6º Critério: Empate Técnico (critérios matemáticos iguais)
 */
export const calculateSuper8PlayerStandings = (
  entries: TournamentEntry[],
  categoryMatches: TournamentMatch[],
  optionsOrMode: Super8StandingsOptions | 'wins' | 'rankingPoints' = 'wins'
): PlayerStanding[] => {
  const options: Super8StandingsOptions =
    typeof optionsOrMode === 'string'
      ? { scoringMode: optionsOrMode }
      : optionsOrMode || {};
  const scoringMode = options.scoringMode || 'wins';
  const technicalTieBreak = options.technicalTieBreak || 'Rank compartilhado';
  const drawWinners = options.drawWinners || [];

  const playerMap = new Map<string, PlayerStanding>();
  const uniqueStandings: PlayerStanding[] = [];

  entries.forEach((entry) => {
    const standing: PlayerStanding = {
      entry,
      played: 0,
      wins: 0,
      losses: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      rank: 1,
      isTiedWithOthers: false,
      isTechnicalTie: false,
      tieBreakNote: undefined,
    };
    uniqueStandings.push(standing);

    const key = getEntryKey(entry);
    if (key) playerMap.set(key, standing);
    if (entry.email) playerMap.set(entry.email.toLowerCase().trim(), standing);
    if (entry.pin) playerMap.set(entry.pin.toLowerCase().trim(), standing);
    if (entry.registrationId) playerMap.set(`reg_${entry.registrationId}`, standing);
  });

  const findStanding = (athlete?: Partial<TournamentEntry>): PlayerStanding | undefined => {
    if (!athlete) return undefined;
    const key = getEntryKey(athlete);
    if (key && playerMap.has(key)) return playerMap.get(key);
    if (athlete.registrationId && playerMap.has(`reg_${athlete.registrationId}`)) {
      return playerMap.get(`reg_${athlete.registrationId}`);
    }
    if (athlete.email && playerMap.has(athlete.email.toLowerCase().trim())) {
      return playerMap.get(athlete.email.toLowerCase().trim());
    }
    if (athlete.pin && playerMap.has(athlete.pin.toLowerCase().trim())) {
      return playerMap.get(athlete.pin.toLowerCase().trim());
    }
    return undefined;
  };

  categoryMatches.forEach((match) => {
    if (match.status !== 'finished') return;

    const { g1, g2 } = parseScoresFromMatch(match);
    const gameDiff = Math.abs(g1 - g2);
    const isPair1Winner = match.winnerPairId
      ? match.winnerPairId === match.pair1Id || match.winnerPairId === match.pair1?.id
      : g1 > g2;

    const pair1Athletes = [match.pair1?.p1, match.pair1?.p2].filter(Boolean) as TournamentEntry[];
    const pair2Athletes = [match.pair2?.p1, match.pair2?.p2].filter(Boolean) as TournamentEntry[];

    pair1Athletes.forEach((athlete) => {
      const st = findStanding(athlete);
      if (st) {
        st.played += 1;
        st.gamesWon += g1;
        st.gamesLost += g2;
        if (isPair1Winner) {
          st.wins += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 5 + gameDiff : 1);
        } else {
          st.losses += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 2 : 0);
        }
      }
    });

    pair2Athletes.forEach((athlete) => {
      const st = findStanding(athlete);
      if (st) {
        st.played += 1;
        st.gamesWon += g2;
        st.gamesLost += g1;
        if (!isPair1Winner) {
          st.wins += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 5 + gameDiff : 1);
        } else {
          st.losses += 1;
          st.points = (st.points || 0) + (scoringMode === 'rankingPoints' ? 2 : 0);
        }
      }
    });
  });

  // Atualiza saldo de games para cada atleta
  const standingsList = uniqueStandings.map((st) => ({
    ...st,
    gamesDiff: st.gamesWon - st.gamesLost,
  }));

  const hasAnyPlayed = standingsList.some((st) => st.played > 0);
  if (!hasAnyPlayed) {
    // Se nenhuma partida foi jogada/finalizada (ou todas foram excluídas), não há classificação nem rank atribuído
    return standingsList.map((st) => ({
      ...st,
      rank: undefined,
      tieBreakNote: undefined,
      isTiedWithOthers: false,
      isTechnicalTie: false,
    }));
  }

  // Agrupa os atletas pelo critério principal: pontos no Ranking, vitórias no Super 8.
  const winsGroups: Record<number, PlayerStanding[]> = {};
  standingsList.forEach((st) => {
    const primaryScore = scoringMode === 'rankingPoints' ? (st.points || 0) : st.wins;
    if (!winsGroups[primaryScore]) {
      winsGroups[primaryScore] = [];
    }
    winsGroups[primaryScore].push(st);
  });

  const sortedWinKeys = Object.keys(winsGroups)
    .map(Number)
    .sort((a, b) => b - a);

  const finalSortedStandings: PlayerStanding[] = [];

  sortedWinKeys.forEach((winCount) => {
    const group = winsGroups[winCount];

    if (group.length === 1) {
      finalSortedStandings.push(group[0]);
      return;
    }

    const hasAnyPlayedInGroup = group.some((st) => st.played > 0);
    if (!hasAnyPlayedInGroup) {
      group.sort((a, b) => (a.entry.name || '').localeCompare(b.entry.name || ''));
      finalSortedStandings.push(...group);
      return;
    }

    const resolved = resolvePlayerTies(group, categoryMatches, technicalTieBreak, drawWinners);
    finalSortedStandings.push(...resolved);
  });

  // Atribui posições finais (rank) com suporte oficial a empate técnico compartilhado
  finalSortedStandings.forEach((st, idx) => {
    if (idx === 0) {
      st.rank = 1;
      return;
    }

    const prev = finalSortedStandings[idx - 1];
    const areEqualTechnicalTie =
      Boolean(st.isTechnicalTie) &&
      Boolean(prev.isTechnicalTie) &&
      st.wins === prev.wins &&
      st.gamesDiff === prev.gamesDiff &&
      st.gamesWon === prev.gamesWon &&
      st.gamesLost === prev.gamesLost &&
      (st.points ?? 0) === (prev.points ?? 0);

    if (areEqualTechnicalTie) {
      st.rank = prev.rank;
    } else {
      st.rank = idx + 1;
    }
  });

  return finalSortedStandings;
};

/**
 * Atualiza automaticamente as duplas das Fases 2 e 3 do Super 8 duplas
 * conforme os resultados da Fase 1 ficam disponíveis.
 *
 * Lógica:
 * - Para cada grupo da Fase 1, calcula standings individuais.
 * - 1° e 2° colocados do grupo → dupla da Chave Ouro.
 * - 3° e 4° colocados do grupo → dupla da Chave Prata.
 * - Quando ambos os grupos de uma semi estão finalizados, preenche os pares da semi.
 * - Quando a semi está finalizada, preenche a final e o 3° lugar correspondentes.
 */
export const updateSuper8DuplasProgression = (
  entries: TournamentEntry[],
  matches: TournamentMatch[]
): TournamentMatch[] => {
  const updatedMatches = matches.map((m) => ({ ...m }));

  // Agrupa as partidas de Fase 1 por grupo (super8dGroup metadata)
  const groupToMatches: Record<string, TournamentMatch[]> = {};
  updatedMatches.forEach((m) => {
    if (m.phase?.startsWith('super8d_fase1_')) {
      // phase format: super8d_fase1_A1_r1
      const parts = m.phase.replace('super8d_fase1_', '').split('_r');
      const groupKey = parts[0]?.toUpperCase() || '';
      if (groupKey) {
        if (!groupToMatches[groupKey]) groupToMatches[groupKey] = [];
        groupToMatches[groupKey].push(m);
      }
    }
  });

  // Calcula standings de cada grupo
  const groupStandings: Record<string, TournamentEntry[]> = {};
  Object.entries(groupToMatches).forEach(([groupKey, groupMatches]) => {
    const allFinished = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished');
    if (!allFinished) return;

    // Identifica jogadores que participaram deste grupo
    const groupPlayerKeys = new Set<string>();
    groupMatches.forEach((m) => {
      [m.pair1, m.pair2].forEach((pair) => {
        [pair?.p1, pair?.p2].forEach((p) => {
          if (p) {
            const key = (p.email || p.pin || p.name || '').toLowerCase().trim();
            if (key) groupPlayerKeys.add(key);
          }
        });
      });
    });

    const groupEntries = entries.filter((e) => {
      const key = (e.email || e.pin || e.name || '').toLowerCase().trim();
      return groupPlayerKeys.has(key);
    });

    const standings = calculateSuper8PlayerStandings(groupEntries, groupMatches, 'wins');
    groupStandings[groupKey] = standings.map((s) => s.entry);
  });

  // Função auxiliar: cria TournamentPair com 2 entries (dupla do Super 8 duplas)
  const makeSuper8DuplasPair = (e1: TournamentEntry, e2: TournamentEntry, groupKey: string, rank: string): TournamentPair => {
    return minifyPairForStorage({
      id: `s8d_pair_${groupKey}_${rank}_${e1.email || e1.pin}_${e2.email || e2.pin}`,
      p1: minifyEntryForPair(e1),
      p2: minifyEntryForPair(e2),
      categoryId: '',
    });
  };

  // ── Atualizar Semifinais Ouro ────────────────────────────────────────────────
  const semiOuroMatches = updatedMatches.filter((m) => m.phase?.startsWith('super8d_semi_ouro'));
  semiOuroMatches.forEach((semi) => {
    // Extrai os grupos que alimentam essa semi a partir do pair1Label/pair2Label
    // pair1Label ex: "Dupla Ouro A1 (1°+2°)"
    const extractGroup = (label?: string) => {
      if (!label) return null;
      const match = label.match(/([A-B]\d+)/);
      return match ? match[1] : null;
    };
    const g1Key = extractGroup(semi.pair1Label);
    const g2Key = extractGroup(semi.pair2Label);
    if (!g1Key || !g2Key) return;

    const standings1 = groupStandings[g1Key];
    const standings2 = groupStandings[g2Key];

    if (standings1 && standings1.length >= 2 && standings2 && standings2.length >= 2) {
      // Dupla Ouro: 1° e 2° de cada grupo
      const pair1 = makeSuper8DuplasPair(standings1[0], standings1[1], g1Key, 'ouro');
      const pair2 = makeSuper8DuplasPair(standings2[0], standings2[1], g2Key, 'ouro');

      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        updatedMatches[idx].pair1Id = pair1.id;
        updatedMatches[idx].pair2Id = pair2.id;
        updatedMatches[idx].pair1 = pair1;
        updatedMatches[idx].pair2 = pair2;
        delete updatedMatches[idx].pair1Label;
        delete updatedMatches[idx].pair2Label;
      }
    } else {
      // Fase 1 incompleta — limpa duplas da semi
      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        delete updatedMatches[idx].pair1Id;
        delete updatedMatches[idx].pair2Id;
        delete updatedMatches[idx].pair1;
        delete updatedMatches[idx].pair2;
        updatedMatches[idx].pair1Label = g1Key ? `Dupla Ouro ${g1Key} (1°+2°)` : 'A definir';
        updatedMatches[idx].pair2Label = g2Key ? `Dupla Ouro ${g2Key} (1°+2°)` : 'A definir';
      }
    }
  });

  // ── Atualizar Semifinais Prata ───────────────────────────────────────────────
  const semiPrataMatches = updatedMatches.filter((m) => m.phase?.startsWith('super8d_semi_prata'));
  semiPrataMatches.forEach((semi) => {
    const extractGroup = (label?: string) => {
      if (!label) return null;
      const match = label.match(/([A-B]\d+)/);
      return match ? match[1] : null;
    };
    const g1Key = extractGroup(semi.pair1Label);
    const g2Key = extractGroup(semi.pair2Label);
    if (!g1Key || !g2Key) return;

    const standings1 = groupStandings[g1Key];
    const standings2 = groupStandings[g2Key];

    if (standings1 && standings1.length >= 4 && standings2 && standings2.length >= 4) {
      // Dupla Prata: 3° e 4° de cada grupo
      const pair1 = makeSuper8DuplasPair(standings1[2], standings1[3], g1Key, 'prata');
      const pair2 = makeSuper8DuplasPair(standings2[2], standings2[3], g2Key, 'prata');

      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        updatedMatches[idx].pair1Id = pair1.id;
        updatedMatches[idx].pair2Id = pair2.id;
        updatedMatches[idx].pair1 = pair1;
        updatedMatches[idx].pair2 = pair2;
        delete updatedMatches[idx].pair1Label;
        delete updatedMatches[idx].pair2Label;
      }
    } else {
      const idx = updatedMatches.findIndex((m) => m.id === semi.id);
      if (idx !== -1) {
        delete updatedMatches[idx].pair1Id;
        delete updatedMatches[idx].pair2Id;
        delete updatedMatches[idx].pair1;
        delete updatedMatches[idx].pair2;
        updatedMatches[idx].pair1Label = g1Key ? `Dupla Prata ${g1Key} (3°+4°)` : 'A definir';
        updatedMatches[idx].pair2Label = g2Key ? `Dupla Prata ${g2Key} (3°+4°)` : 'A definir';
      }
    }
  });

  // ── Atualizar Finais a partir de Semis ──────────────────────────────────────
  const fillFinalFromSemis = (
    semi1Phase: string,
    semi2Phase: string,
    finalPhase: string,
    thirdPhase: string
  ) => {
    const s1 = updatedMatches.find((m) => m.phase === semi1Phase);
    const s2 = updatedMatches.find((m) => m.phase === semi2Phase);
    const finalMatch = updatedMatches.find((m) => m.phase === finalPhase);
    const thirdMatch = updatedMatches.find((m) => m.phase === thirdPhase);

    if (s1?.status === 'finished' && s1.winnerPairId && s2?.status === 'finished' && s2.winnerPairId) {
      // Final: ganhadores das semis
      if (finalMatch) {
        const fIdx = updatedMatches.findIndex((m) => m.id === finalMatch.id);
        if (fIdx !== -1) {
          const p1 = s1.pair1Id === s1.winnerPairId ? s1.pair1 : s1.pair2;
          const p2 = s2.pair1Id === s2.winnerPairId ? s2.pair1 : s2.pair2;
          if (p1 && p2) {
            updatedMatches[fIdx].pair1Id = p1.id;
            updatedMatches[fIdx].pair2Id = p2.id;
            updatedMatches[fIdx].pair1 = p1;
            updatedMatches[fIdx].pair2 = p2;
            delete updatedMatches[fIdx].pair1Label;
            delete updatedMatches[fIdx].pair2Label;
          }
        }
      }
      // 3° Lugar: perdedores das semis
      if (thirdMatch) {
        const tIdx = updatedMatches.findIndex((m) => m.id === thirdMatch.id);
        if (tIdx !== -1) {
          const p1 = s1.pair1Id !== s1.winnerPairId ? s1.pair1 : s1.pair2;
          const p2 = s2.pair1Id !== s2.winnerPairId ? s2.pair1 : s2.pair2;
          if (p1 && p2) {
            updatedMatches[tIdx].pair1Id = p1.id;
            updatedMatches[tIdx].pair2Id = p2.id;
            updatedMatches[tIdx].pair1 = p1;
            updatedMatches[tIdx].pair2 = p2;
            delete updatedMatches[tIdx].pair1Label;
            delete updatedMatches[tIdx].pair2Label;
          }
        }
      }
    } else {
      // Semis não concluídas — limpa finais
      [{ m: finalMatch, l1: 'Ganhador Semi 1', l2: 'Ganhador Semi 2' }, { m: thirdMatch, l1: 'Perdedor Semi 1', l2: 'Perdedor Semi 2' }].forEach(({ m, l1, l2 }) => {
        if (!m) return;
        const idx = updatedMatches.findIndex((x) => x.id === m.id);
        if (idx !== -1) {
          delete updatedMatches[idx].pair1Id;
          delete updatedMatches[idx].pair2Id;
          delete updatedMatches[idx].pair1;
          delete updatedMatches[idx].pair2;
          updatedMatches[idx].pair1Label = l1;
          updatedMatches[idx].pair2Label = l2;
        }
      });
    }
  };

  fillFinalFromSemis('super8d_semi_ouro_1', 'super8d_semi_ouro_2', 'super8d_final_ouro', 'super8d_3lugar_ouro');
  fillFinalFromSemis('super8d_semi_prata_1', 'super8d_semi_prata_2', 'super8d_final_prata', 'super8d_3lugar_prata');

  return updatedMatches;
};
