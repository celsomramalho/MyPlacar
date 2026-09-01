import type { PlayerStanding, TournamentEntry, TournamentMatch, TournamentPair } from '../types';
import { minifyPairForStorage } from '../types';
import { formatMatchNumber } from './matchGenerator';

export interface TeamStanding {
  pair: TournamentPair;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setsDiff: number;
  gamesWon: number;
  gamesLost: number;
  gamesDiff: number;
  gamesPct: number;
  rank: number;
  isTiedWithOthers?: boolean;
  tieBreakNote?: string;
}

export const parseScoresFromMatch = (match: TournamentMatch) => {
  let g1 = 0;
  let g2 = 0;
  let s1 = 0;
  let s2 = 0;

  if (match.scores && Array.isArray(match.scores) && match.scores.length > 0) {
    match.scores.forEach((s) => {
      if (s && s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
        const score1 = Number(s.p1);
        const score2 = Number(s.p2);
        if (!isNaN(score1) && !isNaN(score2)) {
          g1 += score1;
          g2 += score2;
          if (score1 > score2) s1 += 1;
          else if (score2 > score1) s2 += 1;
        }
      }
    });
  } else if (match.result) {
    const parts = match.result.trim().split(/[\s,]+/);
    parts.forEach((part) => {
      const matchScores = part.match(/(\d+)[\/xX\-](\d+)/);
      if (matchScores) {
        const score1 = Number(matchScores[1]);
        const score2 = Number(matchScores[2]);
        if (!isNaN(score1) && !isNaN(score2)) {
          g1 += score1;
          g2 += score2;
          if (score1 > score2) s1 += 1;
          else if (score2 > score1) s2 += 1;
        }
      }
    });
  }

  return { g1, g2, s1, s2 };
};

/**
 * Calcula a classificação de uma chave com base nos confrontos finalizados,
 * aplicando os critérios oficiais de desempate:
 * - Empate entre 2 times: Confronto Direto
 * - Empate entre 3+ times: Saldo de Sets (se multi-set) -> Saldo de Games -> % Games -> Sorteio
 */
export const calculateBracketStandings = (
  pairs: TournamentPair[],
  matches: TournamentMatch[],
  totalSetsConfig?: number
): TeamStanding[] => {
  const standingsMap: Record<string, TeamStanding> = {};

  pairs.forEach((pair) => {
    standingsMap[pair.id] = {
      pair,
      played: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      setsDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
      gamesPct: 0,
      rank: 1,
      isTiedWithOthers: false,
      tieBreakNote: undefined,
    };
  });

  let detectedMultiSet = totalSetsConfig ? totalSetsConfig > 1 : false;

  matches.forEach((match) => {
    if (match.status !== 'finished' || !match.winnerPairId) return;

    const p1Id = match.pair1Id;
    const p2Id = match.pair2Id;
    if (!p1Id || !p2Id || !standingsMap[p1Id] || !standingsMap[p2Id]) return;

    standingsMap[p1Id].played += 1;
    standingsMap[p2Id].played += 1;

    if (match.winnerPairId === p1Id) {
      standingsMap[p1Id].wins += 1;
      standingsMap[p2Id].losses += 1;
    } else if (match.winnerPairId === p2Id) {
      standingsMap[p2Id].wins += 1;
      standingsMap[p1Id].losses += 1;
    }

    const { g1, g2, s1, s2 } = parseScoresFromMatch(match);
    if (s1 + s2 > 1) {
      detectedMultiSet = true;
    }

    standingsMap[p1Id].gamesWon += g1;
    standingsMap[p1Id].gamesLost += g2;
    standingsMap[p2Id].gamesWon += g2;
    standingsMap[p2Id].gamesLost += g1;

    standingsMap[p1Id].setsWon += s1;
    standingsMap[p1Id].setsLost += s2;
    standingsMap[p2Id].setsWon += s2;
    standingsMap[p2Id].setsLost += s1;
  });

  const isMultiSet = detectedMultiSet;

  const standingsList = Object.values(standingsMap).map((st) => {
    const gamesTotal = st.gamesWon + st.gamesLost;
    return {
      ...st,
      gamesDiff: st.gamesWon - st.gamesLost,
      gamesPct: gamesTotal > 0 ? st.gamesWon / gamesTotal : 0,
      setsDiff: st.setsWon - st.setsLost,
    };
  });

  // Agrupa os times pelo número de vitórias
  const winsGroups: Record<number, TeamStanding[]> = {};
  standingsList.forEach((st) => {
    if (!winsGroups[st.wins]) {
      winsGroups[st.wins] = [];
    }
    winsGroups[st.wins].push(st);
  });

  // Ordena os grupos do maior número de vitórias para o menor
  const sortedWinKeys = Object.keys(winsGroups)
    .map(Number)
    .sort((a, b) => b - a);

  const finalSortedStandings: TeamStanding[] = [];

  sortedWinKeys.forEach((winCount) => {
    const group = winsGroups[winCount];

    if (group.length === 1) {
      // Sem empate de vitórias
      finalSortedStandings.push(group[0]);
      return;
    }

    // Se ninguém do grupo jogou ainda, mantém ordem padrão por número/inscrição
    const hasAnyPlayed = group.some((st) => st.played > 0);
    if (!hasAnyPlayed) {
      group.sort((a, b) => (a.pair.teamNumber ?? 999) - (b.pair.teamNumber ?? 999));
      finalSortedStandings.push(...group);
      return;
    }

    // Marca que estão empatados em vitórias
    group.forEach((st) => {
      st.isTiedWithOthers = true;
    });

    // 1. Caso de empate entre exatamente 2 times -> Confronto Direto
    if (group.length === 2) {
      const [t1, t2] = group;
      const directMatch = matches.find(
        (m) =>
          m.status === 'finished' &&
          m.winnerPairId &&
          ((m.pair1Id === t1.pair.id && m.pair2Id === t2.pair.id) ||
            (m.pair1Id === t2.pair.id && m.pair2Id === t1.pair.id))
      );

      if (directMatch && directMatch.winnerPairId) {
        const winner = directMatch.winnerPairId === t1.pair.id ? t1 : t2;
        const loser = directMatch.winnerPairId === t1.pair.id ? t2 : t1;

        winner.tieBreakNote = 'Desempate por Confronto Direto';
        loser.tieBreakNote = 'Desempate por Confronto Direto';

        finalSortedStandings.push(winner, loser);
        return;
      }
    }

    // 2. Empate entre 3 ou mais times (ou 2 sem confronto direto finalizado):
    // Cascata: Saldo de Sets (se multi-set) -> Saldo de Games -> % Games -> Sorteio
    group.sort((a, b) => {
      if (isMultiSet && b.setsDiff !== a.setsDiff) {
        return b.setsDiff - a.setsDiff;
      }
      if (b.gamesDiff !== a.gamesDiff) {
        return b.gamesDiff - a.gamesDiff;
      }
      if (Math.abs(b.gamesPct - a.gamesPct) > 0.00001) {
        return b.gamesPct - a.gamesPct;
      }
      return (a.pair.teamNumber ?? 999) - (b.pair.teamNumber ?? 999);
    });

    // Atribui notas explicativas do desempate para os times do grupo
    const setsDiffVaries = isMultiSet && group.some((st) => st.setsDiff !== group[0].setsDiff);
    const gamesDiffVaries = group.some((st) => st.gamesDiff !== group[0].gamesDiff);
    const gamesPctVaries = group.some((st) => Math.abs(st.gamesPct - group[0].gamesPct) > 0.00001);

    group.forEach((st) => {
      if (setsDiffVaries) {
        st.tieBreakNote = `Desempate por Maior Saldo de Sets: ${st.setsDiff > 0 ? '+' : ''}${st.setsDiff} (${st.setsWon} - ${st.setsLost})`;
      } else if (gamesDiffVaries) {
        st.tieBreakNote = `Desempate por Maior Saldo de Games: ${st.gamesDiff > 0 ? '+' : ''}${st.gamesDiff} (${st.gamesWon} - ${st.gamesLost})`;
      } else if (gamesPctVaries) {
        st.tieBreakNote = `Desempate por Maior % Games: ${(st.gamesPct * 100).toFixed(1)}% (${st.gamesWon}/${st.gamesWon + st.gamesLost})`;
      } else {
        st.tieBreakNote = `Desempate por Sorteio da comissão (critérios matemáticos iguais)`;
      }
    });

    finalSortedStandings.push(...group);
  });

  // Atribui posições finais (rank)
  finalSortedStandings.forEach((st, idx) => {
    st.rank = idx + 1;
  });

  return finalSortedStandings;
};

/**
 * Atualiza automaticamente os slots de semifinais, final e 3º lugar
 * conforme as partidas das fases anteriores vão sendo concluídas.
 * Se o placar for zerado ou a fase anterior não estiver completa,
 * limpa os times dos confrontos seguintes e restaura as legendas genéricas.
 */
export const updatePlayoffProgression = (
  allPairs: TournamentPair[],
  matches: TournamentMatch[]
): TournamentMatch[] => {
  const pairsById: Record<string, TournamentPair> = {};
  allPairs.forEach((p) => {
    pairsById[p.id] = p;
  });

  const updatedMatches = matches.map((m) => ({ ...m }));

  // Agrupa e processa por categoria
  const categoryIds = new Set<string>();
  matches.forEach((m) => {
    if (m.categoryId) categoryIds.add(m.categoryId);
  });
  allPairs.forEach((p) => {
    if (p.categoryId) categoryIds.add(p.categoryId);
  });

  if (categoryIds.size === 0) {
    categoryIds.add('');
  }

  categoryIds.forEach((catId) => {
    const catMatches = updatedMatches.filter((m) =>
      catId ? m.categoryId === catId : true
    );
    const catPairs = allPairs.filter((p) =>
      catId
        ? p.categoryId === catId || (!p.categoryId && (p.p1?.categoryIds?.includes(catId) || p.p2?.categoryIds?.includes(catId)))
        : true
    );

    const b1Matches = catMatches.filter((m) => m.phase === 'chave1');
    const b2Matches = catMatches.filter((m) => m.phase === 'chave2');
    const semiMatches = catMatches.filter((m) => m.phase === 'semifinal');
    const finalMatch = catMatches.find((m) => m.phase === 'final');
    const thirdPlaceMatch = catMatches.find((m) => m.phase === '3lugar');

    const b1Pairs = catPairs.filter((p) => (p.bracket ?? 1) === 1);
    const b2Pairs = catPairs.filter((p) => p.bracket === 2);

    // Calcula classificação se todos os jogos de grupo estiverem finalizados
    const b1Finished = b1Matches.length > 0 && b1Matches.every((m) => m.status === 'finished');
    const b2Finished = b2Matches.length > 0 && b2Matches.every((m) => m.status === 'finished');

    // 1. Atualizar Semifinais
    if (b1Finished && b2Finished && semiMatches.length === 2) {
      const s1Rank = calculateBracketStandings(b1Pairs, b1Matches);
      const s2Rank = calculateBracketStandings(b2Pairs, b2Matches);

      const b1_1st = s1Rank[0]?.pair;
      const b1_2nd = s1Rank[1]?.pair;
      const b2_1st = s2Rank[0]?.pair;
      const b2_2nd = s2Rank[1]?.pair;

      // Semifinal 1: 1º chave1 x 2º chave2
      const s1Index = updatedMatches.findIndex((m) => m.id === semiMatches[0].id);
      if (s1Index !== -1 && b1_1st && b2_2nd) {
        updatedMatches[s1Index].pair1Id = b1_1st.id;
        updatedMatches[s1Index].pair2Id = b2_2nd.id;
        updatedMatches[s1Index].pair1 = minifyPairForStorage(b1_1st);
        updatedMatches[s1Index].pair2 = minifyPairForStorage(b2_2nd);
      }

      // Semifinal 2: 2º chave1 x 1º chave2
      const s2Index = updatedMatches.findIndex((m) => m.id === semiMatches[1].id);
      if (s2Index !== -1 && b1_2nd && b2_1st) {
        updatedMatches[s2Index].pair1Id = b1_2nd.id;
        updatedMatches[s2Index].pair2Id = b2_1st.id;
        updatedMatches[s2Index].pair1 = minifyPairForStorage(b1_2nd);
        updatedMatches[s2Index].pair2 = minifyPairForStorage(b2_1st);
      }
    } else if (semiMatches.length === 2) {
      // Se a 1ª fase não está finalizada, limpa os times das semifinais
      const s1Index = updatedMatches.findIndex((m) => m.id === semiMatches[0].id);
      if (s1Index !== -1) {
        delete updatedMatches[s1Index].pair1Id;
        delete updatedMatches[s1Index].pair2Id;
        delete updatedMatches[s1Index].pair1;
        delete updatedMatches[s1Index].pair2;
        if (!updatedMatches[s1Index].pair1Label) updatedMatches[s1Index].pair1Label = '1º chave1';
        if (!updatedMatches[s1Index].pair2Label) updatedMatches[s1Index].pair2Label = '2º chave2';
      }
      const s2Index = updatedMatches.findIndex((m) => m.id === semiMatches[1].id);
      if (s2Index !== -1) {
        delete updatedMatches[s2Index].pair1Id;
        delete updatedMatches[s2Index].pair2Id;
        delete updatedMatches[s2Index].pair1;
        delete updatedMatches[s2Index].pair2;
        if (!updatedMatches[s2Index].pair1Label) updatedMatches[s2Index].pair1Label = '2º chave1';
        if (!updatedMatches[s2Index].pair2Label) updatedMatches[s2Index].pair2Label = '1º chave2';
      }
    }

    // 2. Atualizar Final e 3º Lugar
    const s1Updated = updatedMatches.find((m) => semiMatches[0] && m.id === semiMatches[0].id);
    const s2Updated = updatedMatches.find((m) => semiMatches[1] && m.id === semiMatches[1].id);

    if (
      s1Updated &&
      s2Updated &&
      s1Updated.status === 'finished' &&
      s2Updated.status === 'finished' &&
      s1Updated.winnerPairId &&
      s2Updated.winnerPairId
    ) {
      const s1WinnerId = s1Updated.winnerPairId;
      const s1LoserId = s1Updated.loserPairId || (s1WinnerId === s1Updated.pair1Id ? s1Updated.pair2Id : s1Updated.pair1Id);

      const s2WinnerId = s2Updated.winnerPairId;
      const s2LoserId = s2Updated.loserPairId || (s2WinnerId === s2Updated.pair1Id ? s2Updated.pair2Id : s2Updated.pair1Id);

      // Final: Winner S1 x Winner S2
      if (finalMatch && s1WinnerId && s2WinnerId) {
        const fIndex = updatedMatches.findIndex((m) => m.id === finalMatch.id);
        if (fIndex !== -1) {
          const p1 = pairsById[s1WinnerId];
          const p2 = pairsById[s2WinnerId];
          if (p1 && p2) {
            updatedMatches[fIndex].pair1Id = p1.id;
            updatedMatches[fIndex].pair2Id = p2.id;
            updatedMatches[fIndex].pair1 = minifyPairForStorage(p1);
            updatedMatches[fIndex].pair2 = minifyPairForStorage(p2);
          }
        }
      }

      // 3º Lugar: Loser S1 x Loser S2
      if (thirdPlaceMatch && s1LoserId && s2LoserId) {
        const tIndex = updatedMatches.findIndex((m) => m.id === thirdPlaceMatch.id);
        if (tIndex !== -1) {
          const p1 = pairsById[s1LoserId];
          const p2 = pairsById[s2LoserId];
          if (p1 && p2) {
            updatedMatches[tIndex].pair1Id = p1.id;
            updatedMatches[tIndex].pair2Id = p2.id;
            updatedMatches[tIndex].pair1 = minifyPairForStorage(p1);
            updatedMatches[tIndex].pair2 = minifyPairForStorage(p2);
          }
        }
      }
    } else {
      // Se as semifinais não estão finalizadas, limpa os times da final e do 3º lugar
      if (finalMatch) {
        const fIndex = updatedMatches.findIndex((m) => m.id === finalMatch.id);
        if (fIndex !== -1) {
          delete updatedMatches[fIndex].pair1Id;
          delete updatedMatches[fIndex].pair2Id;
          delete updatedMatches[fIndex].pair1;
          delete updatedMatches[fIndex].pair2;
          if (!updatedMatches[fIndex].pair1Label && semiMatches[0]) {
            updatedMatches[fIndex].pair1Label = `Ganhador ${formatMatchNumber(semiMatches[0].matchNumber || 1)}`;
          }
          if (!updatedMatches[fIndex].pair2Label && semiMatches[1]) {
            updatedMatches[fIndex].pair2Label = `Ganhador ${formatMatchNumber(semiMatches[1].matchNumber || 2)}`;
          }
        }
      }
      if (thirdPlaceMatch) {
        const tIndex = updatedMatches.findIndex((m) => m.id === thirdPlaceMatch.id);
        if (tIndex !== -1) {
          delete updatedMatches[tIndex].pair1Id;
          delete updatedMatches[tIndex].pair2Id;
          delete updatedMatches[tIndex].pair1;
          delete updatedMatches[tIndex].pair2;
          if (!updatedMatches[tIndex].pair1Label && semiMatches[0]) {
            updatedMatches[tIndex].pair1Label = `Perdedor ${formatMatchNumber(semiMatches[0].matchNumber || 1)}`;
          }
          if (!updatedMatches[tIndex].pair2Label && semiMatches[1]) {
            updatedMatches[tIndex].pair2Label = `Perdedor ${formatMatchNumber(semiMatches[1].matchNumber || 2)}`;
          }
        }
      }
    }
  });

  return updatedMatches;
};

/**
 * Normaliza chave de identificação do atleta (email prioritário, fallback PIN ou nome)
 */
const getEntryKey = (e?: Partial<TournamentEntry>): string => {
  if (!e) return '';
  return (e.email || e.pin || e.name || '').toLowerCase().trim();
};

/**
 * Calcula a classificação individual dos atletas no Super 8 de acordo com os critérios:
 * 1º Critério: Número de Vitórias (Pontos)
 * 2º Critério: Saldo de Games (SG = Games a Favor - Games Sofridos)
 * 3º Critério: Games Pró (GP = total de Games a Favor)
 * 4º Critério: Confronto Direto (caso 2 jogadores continuem empatados, verifica quem venceu em lados opostos)
 */
export const calculateSuper8PlayerStandings = (
  entries: TournamentEntry[],
  categoryMatches: TournamentMatch[]
): PlayerStanding[] => {
  const playerMap = new Map<string, PlayerStanding>();

  entries.forEach((entry) => {
    const key = getEntryKey(entry);
    if (key) {
      playerMap.set(key, {
        entry,
        played: 0,
        wins: 0,
        losses: 0,
        gamesWon: 0,
        gamesLost: 0,
        gamesDiff: 0,
        rank: 1,
        isTiedWithOthers: false,
        tieBreakNote: undefined,
      });
    }
  });

  categoryMatches.forEach((match) => {
    if (match.status !== 'finished') return;

    const { g1, g2 } = parseScoresFromMatch(match);
    const isPair1Winner = match.winnerPairId
      ? match.winnerPairId === match.pair1Id || match.winnerPairId === match.pair1?.id
      : g1 > g2;

    const pair1Athletes = [match.pair1?.p1, match.pair1?.p2].filter(Boolean) as TournamentEntry[];
    const pair2Athletes = [match.pair2?.p1, match.pair2?.p2].filter(Boolean) as TournamentEntry[];

    pair1Athletes.forEach((athlete) => {
      const key = getEntryKey(athlete);
      const st = playerMap.get(key);
      if (st) {
        st.played += 1;
        st.gamesWon += g1;
        st.gamesLost += g2;
        if (isPair1Winner) st.wins += 1;
        else st.losses += 1;
      }
    });

    pair2Athletes.forEach((athlete) => {
      const key = getEntryKey(athlete);
      const st = playerMap.get(key);
      if (st) {
        st.played += 1;
        st.gamesWon += g2;
        st.gamesLost += g1;
        if (!isPair1Winner) st.wins += 1;
        else st.losses += 1;
      }
    });
  });

  // Atualiza saldo de games para cada atleta
  const standingsList = Array.from(playerMap.values()).map((st) => ({
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
    }));
  }

  // Agrupa os atletas pelo número de vitórias
  const winsGroups: Record<number, PlayerStanding[]> = {};
  standingsList.forEach((st) => {
    if (!winsGroups[st.wins]) {
      winsGroups[st.wins] = [];
    }
    winsGroups[st.wins].push(st);
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

    const hasAnyPlayed = group.some((st) => st.played > 0);
    if (!hasAnyPlayed) {
      group.sort((a, b) => (a.entry.name || '').localeCompare(b.entry.name || ''));
      finalSortedStandings.push(...group);
      return;
    }

    group.forEach((st) => {
      st.isTiedWithOthers = true;
    });

    // 1. Caso de empate entre exatamente 2 atletas -> Saldo de Games -> Games Pró -> Confronto Direto
    if (group.length === 2) {
      const [p1, p2] = group;
      if (p1.gamesDiff !== p2.gamesDiff) {
        const higher = p1.gamesDiff > p2.gamesDiff ? p1 : p2;
        const lower = p1.gamesDiff > p2.gamesDiff ? p2 : p1;
        higher.tieBreakNote = `Desempate por Saldo de Games: ${higher.gamesDiff > 0 ? '+' : ''}${higher.gamesDiff} (${higher.gamesWon} - ${higher.gamesLost})`;
        lower.tieBreakNote = `Desempate por Saldo de Games: ${lower.gamesDiff > 0 ? '+' : ''}${lower.gamesDiff} (${lower.gamesWon} - ${lower.gamesLost})`;
        finalSortedStandings.push(higher, lower);
        return;
      }

      if (p1.gamesWon !== p2.gamesWon) {
        const higher = p1.gamesWon > p2.gamesWon ? p1 : p2;
        const lower = p1.gamesWon > p2.gamesWon ? p2 : p1;
        higher.tieBreakNote = `Desempate por Games Pró: ${higher.gamesWon} games`;
        lower.tieBreakNote = `Desempate por Games Pró: ${lower.gamesWon} games`;
        finalSortedStandings.push(higher, lower);
        return;
      }

      // Se empatados em SG e GP, verifica confronto direto
      const key1 = getEntryKey(p1.entry);
      const key2 = getEntryKey(p2.entry);

      const directMatch = categoryMatches.find((m) => {
        if (m.status !== 'finished') return false;
        const p1Athletes = [m.pair1?.p1, m.pair1?.p2].map(getEntryKey);
        const p2Athletes = [m.pair2?.p1, m.pair2?.p2].map(getEntryKey);
        const inOppositeTeams =
          (p1Athletes.includes(key1) && p2Athletes.includes(key2)) ||
          (p1Athletes.includes(key2) && p2Athletes.includes(key1));
        return inOppositeTeams;
      });

      if (directMatch) {
        const { g1, g2 } = parseScoresFromMatch(directMatch);
        const isPair1Winner = directMatch.winnerPairId
          ? directMatch.winnerPairId === directMatch.pair1Id || directMatch.winnerPairId === directMatch.pair1?.id
          : g1 > g2;

        const p1Athletes = [directMatch.pair1?.p1, directMatch.pair1?.p2].map(getEntryKey);
        const p1Won = p1Athletes.includes(key1) ? isPair1Winner : !isPair1Winner;

        const winner = p1Won ? p1 : p2;
        const loser = p1Won ? p2 : p1;
        winner.tieBreakNote = 'Desempate por Confronto Direto';
        loser.tieBreakNote = 'Desempate por Confronto Direto';
        finalSortedStandings.push(winner, loser);
        return;
      }
    }

    // 2. Empate entre 3 ou mais atletas (ou 2 sem confronto direto finalizado):
    group.sort((a, b) => {
      // 2º Critério: Saldo de Games (SG)
      if (b.gamesDiff !== a.gamesDiff) {
        return b.gamesDiff - a.gamesDiff;
      }
      // 3º Critério: Games Pró (GP)
      if (b.gamesWon !== a.gamesWon) {
        return b.gamesWon - a.gamesWon;
      }
      // 4º Critério: Confronto Direto caso sobrem 2
      const keyA = getEntryKey(a.entry);
      const keyB = getEntryKey(b.entry);
      const direct = categoryMatches.find((m) => {
        if (m.status !== 'finished') return false;
        const team1 = [m.pair1?.p1, m.pair1?.p2].map(getEntryKey);
        const team2 = [m.pair2?.p1, m.pair2?.p2].map(getEntryKey);
        return (team1.includes(keyA) && team2.includes(keyB)) || (team1.includes(keyB) && team2.includes(keyA));
      });
      if (direct) {
        const { g1, g2 } = parseScoresFromMatch(direct);
        const pair1Won = direct.winnerPairId
          ? direct.winnerPairId === direct.pair1Id || direct.winnerPairId === direct.pair1?.id
          : g1 > g2;
        const team1 = [direct.pair1?.p1, direct.pair1?.p2].map(getEntryKey);
        const aWon = team1.includes(keyA) ? pair1Won : !pair1Won;
        return aWon ? -1 : 1;
      }
      return (a.entry.name || '').localeCompare(b.entry.name || '');
    });

    const gamesDiffVaries = group.some((st) => st.gamesDiff !== group[0].gamesDiff);
    const gamesWonVaries = group.some((st) => st.gamesWon !== group[0].gamesWon);

    group.forEach((st) => {
      if (gamesDiffVaries) {
        st.tieBreakNote = `Desempate por Saldo de Games: ${st.gamesDiff > 0 ? '+' : ''}${st.gamesDiff} (${st.gamesWon} - ${st.gamesLost})`;
      } else if (gamesWonVaries) {
        st.tieBreakNote = `Desempate por Games Pró (GP): ${st.gamesWon} games`;
      } else {
        st.tieBreakNote = 'Desempate por Sorteio / Comissão';
      }
    });

    finalSortedStandings.push(...group);
  });

  // Atribui posições finais (rank)
  finalSortedStandings.forEach((st, idx) => {
    st.rank = idx + 1;
  });

  return finalSortedStandings;
};
