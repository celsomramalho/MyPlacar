import type { TournamentMatch, TournamentPair } from '../types';
import { minifyPairForStorage } from '../types';

export interface TeamStanding {
  pair: TournamentPair;
  played: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  gamesDiff: number;
}

/**
 * Calcula a classificação de uma chave com base nos confrontos finalizados.
 */
export const calculateBracketStandings = (
  pairs: TournamentPair[],
  matches: TournamentMatch[]
): TeamStanding[] => {
  const standingsMap: Record<string, TeamStanding> = {};

  pairs.forEach((pair) => {
    standingsMap[pair.id] = {
      pair,
      played: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDiff: 0,
    };
  });

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

    // Parse games se houver placar no formato "6x4", "6/4", "6-4", etc.
    if (match.result) {
      const matchScores = match.result.match(/(\d+)[\s/xX\-](\d+)/);
      if (matchScores) {
        const score1 = Number(matchScores[1]);
        const score2 = Number(matchScores[2]);
        if (!isNaN(score1) && !isNaN(score2)) {
          standingsMap[p1Id].gamesWon += score1;
          standingsMap[p1Id].gamesLost += score2;
          standingsMap[p2Id].gamesWon += score2;
          standingsMap[p2Id].gamesLost += score1;
        }
      }
    }
  });

  Object.values(standingsMap).forEach((st) => {
    st.gamesDiff = st.gamesWon - st.gamesLost;
  });

  return Object.values(standingsMap).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    return (a.pair.teamNumber ?? 999) - (b.pair.teamNumber ?? 999);
  });
};

/**
 * Atualiza automaticamente os slots de semifinais, final e 3º lugar
 * conforme as partidas das fases anteriores vão sendo concluídas.
 */
export const updatePlayoffProgression = (
  allPairs: TournamentPair[],
  matches: TournamentMatch[]
): TournamentMatch[] => {
  const pairsById: Record<string, TournamentPair> = {};
  allPairs.forEach((p) => {
    pairsById[p.id] = p;
  });

  // Agrupa partidas por fase
  const b1Matches = matches.filter((m) => m.phase === 'chave1');
  const b2Matches = matches.filter((m) => m.phase === 'chave2');
  const semiMatches = matches.filter((m) => m.phase === 'semifinal');
  const finalMatch = matches.find((m) => m.phase === 'final');
  const thirdPlaceMatch = matches.find((m) => m.phase === '3lugar');

  const b1Pairs = allPairs.filter((p) => (p.bracket ?? 1) === 1);
  const b2Pairs = allPairs.filter((p) => p.bracket === 2);

  // Calcula classificação se todos os jogos de grupo estiverem finalizados
  const b1Finished = b1Matches.length > 0 && b1Matches.every((m) => m.status === 'finished');
  const b2Finished = b2Matches.length > 0 && b2Matches.every((m) => m.status === 'finished');

  const updatedMatches = matches.map((m) => ({ ...m }));

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
  }

  // 2. Atualizar Final e 3º Lugar
  const s1Updated = updatedMatches.find((m) => semiMatches[0] && m.id === semiMatches[0].id);
  const s2Updated = updatedMatches.find((m) => semiMatches[1] && m.id === semiMatches[1].id);

  if (s1Updated && s2Updated && s1Updated.status === 'finished' && s2Updated.status === 'finished') {
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
  }

  return updatedMatches;
};
