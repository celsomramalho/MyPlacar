import type { TournamentMatch, TournamentPair, EventCategory, TournamentEntry } from '../types';
import { minifyPairForStorage, minifyEntryForPair, orderPairEntriesForMixed } from '../types';
import {
  createManualMatch,
  formatMatchDisplayString,
  formatMatchNumber,
  generateRoundRobinPairs,
  generateSystemMatchesForCategory,
  getNextMatchNumber,
  getPairDisplayName,
  getPairFormattedWithCode,
  getPhaseLabel,
} from '../domain/brackets/engine/bracketGenerator';
import {
  isCategoryMixed,
  validateCategoryGenders,
} from '../domain/brackets/engine/teamFormationEngine';

export {
  createManualMatch,
  formatMatchDisplayString,
  formatMatchNumber,
  generateRoundRobinPairs,
  generateSystemMatchesForCategory,
  getNextMatchNumber,
  getPairDisplayName,
  getPairFormattedWithCode,
  getPhaseLabel,
} from '../domain/brackets/engine/bracketGenerator';
export {
  isCategoryMixed,
  validateCategoryGenders,
} from '../domain/brackets/engine/teamFormationEngine';

const SUPER_8_ROUNDS: Array<Array<[[number, number], [number, number]]>> = [
  // Round 1
  [
    [[0, 1], [2, 3]],
    [[4, 5], [6, 7]],
  ],
  // Round 2
  [
    [[0, 2], [4, 6]],
    [[1, 3], [5, 7]],
  ],
  // Round 3
  [
    [[0, 3], [5, 6]],
    [[1, 2], [4, 7]],
  ],
  // Round 4
  [
    [[0, 4], [1, 5]],
    [[2, 6], [3, 7]],
  ],
  // Round 5
  [
    [[0, 5], [2, 7]],
    [[1, 4], [3, 6]],
  ],
  // Round 6
  [
    [[0, 6], [3, 4]],
    [[1, 7], [2, 5]],
  ],
  // Round 7
  [
    [[0, 7], [1, 6]],
    [[2, 4], [3, 5]],
  ],
];

const SUPER_4_ROUNDS: Array<Array<[[number, number], [number, number]]>> = [
  // Round 1
  [
    [[0, 1], [2, 3]],
  ],
  // Round 2
  [
    [[0, 2], [1, 3]],
  ],
  // Round 3
  [
    [[0, 3], [1, 2]],
  ],
];

// Grade para Super 8 Misto Puro (4 Homens e 4 Mulheres):
// 4 rodadas, 2 jogos por rodada = 8 partidas no total.
// Cada atleta disputa exatamente 4 partidas (uma com cada parceiro do sexo oposto).
// Cada tupla [hIdx, mIdx] define a dupla formada pelo homem hIdx e mulher mIdx.
const SUPER_8_MIXED_ROUNDS: Array<Array<[[number, number], [number, number]]>> = [
  // Rodada 1:
  // Jogo 1: H0+M0 vs H1+M1
  // Jogo 2: H2+M2 vs H3+M3
  [
    [[0, 0], [1, 1]],
    [[2, 2], [3, 3]],
  ],
  // Rodada 2:
  // Jogo 1: H0+M1 vs H2+M3
  // Jogo 2: H1+M0 vs H3+M2
  [
    [[0, 1], [2, 3]],
    [[1, 0], [3, 2]],
  ],
  // Rodada 3:
  // Jogo 1: H0+M2 vs H3+M1
  // Jogo 2: H1+M3 vs H2+M0
  [
    [[0, 2], [3, 1]],
    [[1, 3], [2, 0]],
  ],
  // Rodada 4:
  // Jogo 1: H0+M3 vs H1+M2
  // Jogo 2: H2+M1 vs H3+M0
  [
    [[0, 3], [1, 2]],
    [[2, 1], [3, 0]],
  ],
];

// Grade para Super 4 Misto (2 Homens e 2 Mulheres):
// 2 rodadas, 1 jogo por rodada = 2 partidas no total.
const SUPER_4_MIXED_ROUNDS: Array<Array<[[number, number], [number, number]]>> = [
  // Rodada 1: H0+M0 vs H1+M1
  [
    [[0, 0], [1, 1]],
  ],
  // Rodada 2: H0+M1 vs H1+M0
  [
    [[0, 1], [1, 0]],
  ],
];

/**
 * Gera a grade de partidas para evento Super 8:
 * - Para Misto Puro (4 homens e 4 mulheres): 4 rodadas, 8 partidas (2 por rodada).
 * - Para Tradicional 8 atletas (mesmo gênero): 7 rodadas, 14 partidas (2 por rodada).
 * - Para 4 atletas misto (2 homens, 2 mulheres): 2 rodadas, 2 partidas.
 * - Para 4 atletas tradicional: 3 rodadas, 3 partidas.
 */
export const generateSuper8MatchesForCategory = (
  category: EventCategory,
  categoryEntries: TournamentEntry[],
  existingMatches: TournamentMatch[] = []
): TournamentMatch[] => {
  const matchesFromOtherCategories = existingMatches.filter(
    (m) => m.categoryId && m.categoryId !== category.id
  );
  let currentMatchNum = getNextMatchNumber(matchesFromOtherCategories);

  const generatedMatches: TournamentMatch[] = [];

  const makePair = (entryA: TournamentEntry, entryB: TournamentEntry, roundNum: number, pairIndex: number): TournamentPair => {
    const [e1, e2] = (category.gender1 && category.gender2 && category.gender1 !== category.gender2) || (entryA.gender && entryB.gender && entryA.gender !== entryB.gender)
      ? orderPairEntriesForMixed(entryA, entryB)
      : [entryA, entryB];

    return minifyPairForStorage({
      id: `pair_${category.id}_r${roundNum}_p${pairIndex}_${entryA.email || entryA.pin}_${entryB.email || entryB.pin}`,
      p1: minifyEntryForPair(e1),
      p2: minifyEntryForPair(e2),
      categoryId: category.id,
    });
  };

  const isMixed = isCategoryMixed(category);
  const men = categoryEntries.filter((e) => e.gender === 'M');
  const women = categoryEntries.filter((e) => e.gender === 'F');

  // Super 8 Misto Puro (4 homens e 4 mulheres ou 2 homens e 2 mulheres)
  if (isMixed || (men.length >= 4 && women.length >= 4) || (men.length >= 2 && women.length >= 2 && categoryEntries.length < 8)) {
    const is8 = men.length >= 4 && women.length >= 4;
    const is4 = !is8 && men.length >= 2 && women.length >= 2;

    if (is8 || is4) {
      const mixedTemplate = is8 ? SUPER_8_MIXED_ROUNDS : SUPER_4_MIXED_ROUNDS;

      mixedTemplate.forEach((roundMatches, roundIdx) => {
        const roundNum = roundIdx + 1;
        roundMatches.forEach((matchup, matchIdx) => {
          const [[h1Idx, m1Idx], [h2Idx, m2Idx]] = matchup;
          const man1 = men[h1Idx];
          const woman1 = women[m1Idx];
          const man2 = men[h2Idx];
          const woman2 = women[m2Idx];

          if (!man1 || !woman1 || !man2 || !woman2) return;

          const pair1 = makePair(man1, woman1, roundNum, matchIdx * 2 + 1);
          const pair2 = makePair(man2, woman2, roundNum, matchIdx * 2 + 2);

          const matchNum = currentMatchNum++;
          const matchCode = formatMatchNumber(matchNum);

          generatedMatches.push({
            id: `match_${Date.now()}_${matchNum}`,
            matchNumber: matchNum,
            matchCode,
            categoryId: category.id,
            phase: `rodada${roundNum}`,
            pair1Id: pair1.id,
            pair2Id: pair2.id,
            pair1,
            pair2,
            status: 'waiting',
          });
        });
      });

      return generatedMatches;
    }
  }

  // Super 8 tradicional (mesmo gênero / todos contra todos rotativo)
  const players = [...categoryEntries];
  if (players.length < 4) return [];

  const roundsTemplate = players.length >= 8 ? SUPER_8_ROUNDS : SUPER_4_ROUNDS;

  roundsTemplate.forEach((roundMatches, roundIdx) => {
    const roundNum = roundIdx + 1;
    roundMatches.forEach((matchup, matchIdx) => {
      const [pair1Indices, pair2Indices] = matchup;
      const p1 = players[pair1Indices[0]];
      const p2 = players[pair1Indices[1]];
      const p3 = players[pair2Indices[0]];
      const p4 = players[pair2Indices[1]];

      if (!p1 || !p2 || !p3 || !p4) return;

      const pair1 = makePair(p1, p2, roundNum, matchIdx * 2 + 1);
      const pair2 = makePair(p3, p4, roundNum, matchIdx * 2 + 2);

      const matchNum = currentMatchNum++;
      const matchCode = formatMatchNumber(matchNum);

      generatedMatches.push({
        id: `match_${Date.now()}_${matchNum}`,
        matchNumber: matchNum,
        matchCode,
        categoryId: category.id,
        phase: `rodada${roundNum}`,
        pair1Id: pair1.id,
        pair2Id: pair2.id,
        pair1,
        pair2,
        status: 'waiting',
      });
    });
  });

  return generatedMatches;
};

/**
 * Gera TODAS as partidas do Super 8 duplas de uma vez:
 *
 * Fase 1 — round-robin individual por grupo (SUPER_4_ROUNDS = 3 partidas por grupo)
 * Fase 2 — Semifinais chave Ouro + chave Prata (4 partidas de duplas)
 * Fase 3 — Finais chave Ouro + chave Prata, mais 3º lugar de cada (4 partidas)
 *
 * O evento tem 2 chaves fixas (A, B). O admin configura quantos grupos por chave
 * (groupsPerBracket, padrão 2). Ex: A1, A2, B1, B2 com 4 jogadores cada.
 *
 * Os jogadores são passados em `orderedPlayers` já na ordem desejada
 * (definida pelo admin via UI de sorteio antes de confirmar a geração).
 *
 * As partidas de fase 2 e 3 são criadas com pair1Label/pair2Label (A definir)
 * e preenchidas automaticamente por updateSuper8DuplasProgression.
 */
export const generateSuper8DuplasMatchesForCategory = (
  category: EventCategory,
  orderedPlayers: TournamentEntry[],  // players in group order: [A1p1,A1p2,A1p3,A1p4, A2p1,..., B1p1,..., B2p1,...]
  groupsPerBracket: number = 2,
  existingMatches: TournamentMatch[] = []
): TournamentMatch[] => {
  const matchesFromOtherCategories = existingMatches.filter(
    (m) => m.categoryId && m.categoryId !== category.id
  );
  let currentMatchNum = getNextMatchNumber(matchesFromOtherCategories);

  const generatedMatches: TournamentMatch[] = [];
  const now = Date.now();

  // ── Fase 1: grupos ──────────────────────────────────────────────────────────
  // 2 chaves (A, B) × groupsPerBracket grupos × 4 jogadores
  // Groups: A1, A2, ... An, B1, B2, ... Bn
  const BRACKETS = ['A', 'B'] as const;
  const playersPerGroup = 4;
  const totalGroups = BRACKETS.length * groupsPerBracket;

  // Fase 1 match IDs por grupo para usar como referência nas fases 2 e 3
  // groupKey → array of matchIds gerados na fase 1
  const groupMatchIds: Record<string, string[]> = {};

  let playerIndex = 0;
  for (const bracket of BRACKETS) {
    for (let g = 1; g <= groupsPerBracket; g++) {
      const groupKey = `${bracket}${g}`; // e.g. "A1", "A2", "B1", "B2"
      const groupPlayers = orderedPlayers.slice(playerIndex, playerIndex + playersPerGroup);
      playerIndex += playersPerGroup;

      groupMatchIds[groupKey] = [];

      if (groupPlayers.length < 2) continue;

      // Round-robin individual dentro do grupo (SUPER_4_ROUNDS se 4 jogadores)
      const makePlayerPair = (eA: TournamentEntry, eB: TournamentEntry, roundNum: number, pairIdx: number): TournamentPair => {
        const [e1, e2] = (eA.gender && eB.gender && eA.gender !== eB.gender)
          ? orderPairEntriesForMixed(eA, eB)
          : [eA, eB];
        return minifyPairForStorage({
          id: `pair_${category.id}_${groupKey}_r${roundNum}_p${pairIdx}_${eA.email || eA.pin}_${eB.email || eB.pin}`,
          p1: minifyEntryForPair(e1),
          p2: minifyEntryForPair(e2),
          categoryId: category.id,
        });
      };

      SUPER_4_ROUNDS.forEach((roundMatches, roundIdx) => {
        const roundNum = roundIdx + 1;
        roundMatches.forEach((matchup, matchIdx) => {
          const [pair1Indices, pair2Indices] = matchup;
          const p1 = groupPlayers[pair1Indices[0]];
          const p2 = groupPlayers[pair1Indices[1]];
          const p3 = groupPlayers[pair2Indices[0]];
          const p4 = groupPlayers[pair2Indices[1]];

          if (!p1 || !p2 || !p3 || !p4) return;

          const pair1 = makePlayerPair(p1, p2, roundNum, matchIdx * 2 + 1);
          const pair2 = makePlayerPair(p3, p4, roundNum, matchIdx * 2 + 2);

          const matchNum = currentMatchNum++;
          const matchCode = formatMatchNumber(matchNum);
          const matchId = `match_${now}_${matchNum}`;

          groupMatchIds[groupKey].push(matchId);

          generatedMatches.push({
            id: matchId,
            matchNumber: matchNum,
            matchCode,
            categoryId: category.id,
            phase: `super8d_fase1_${groupKey}_r${roundNum}`,
            pair1Id: pair1.id,
            pair2Id: pair2.id,
            pair1,
            pair2,
            status: 'waiting',
            // Metadata for progression logic
            super8dGroup: groupKey,
            super8dBracket: bracket,
          } as TournamentMatch & { super8dGroup: string; super8dBracket: string });
        });
      });
    }
  }

  // ── Fase 2: Semifinais ──────────────────────────────────────────────────────
  // Chave Ouro:  Semi 1: A1(1°+2°) vs A2(1°+2°),  Semi 2: B1(1°+2°) vs B2(1°+2°)
  // Chave Prata: Semi 3: A1(3°+4°) vs A2(3°+4°),  Semi 4: B1(3°+4°) vs B2(3°+4°)

  const semiMatchIds: {
    ouro: string[];   // [semi_ouro_1_id, semi_ouro_2_id]
    prata: string[];  // [semi_prata_1_id, semi_prata_2_id]
  } = { ouro: [], prata: [] };

  // Semis Ouro: A1xA2, B1xB2
  for (let i = 0; i < BRACKETS.length; i++) {
    const bracket = BRACKETS[i];
    const g1Key = `${bracket}1`;
    const g2Key = `${bracket}2`;
    const semiNum = i + 1;

    const matchNum = currentMatchNum++;
    const matchCode = formatMatchNumber(matchNum);
    const matchId = `match_${now}_${matchNum}`;
    semiMatchIds.ouro.push(matchId);

    generatedMatches.push({
      id: matchId,
      matchNumber: matchNum,
      matchCode,
      categoryId: category.id,
      phase: `super8d_semi_ouro_${semiNum}`,
      pair1Label: `Dupla Ouro ${g1Key} (1°+2°)`,
      pair2Label: `Dupla Ouro ${g2Key} (1°+2°)`,
      status: 'waiting',
      super8dSemiOuro: semiNum,
      super8dGroup1: g1Key,
      super8dGroup2: g2Key,
    } as TournamentMatch & { super8dSemiOuro: number; super8dGroup1: string; super8dGroup2: string });
  }

  // Semis Prata: A1xA2, B1xB2
  for (let i = 0; i < BRACKETS.length; i++) {
    const bracket = BRACKETS[i];
    const g1Key = `${bracket}1`;
    const g2Key = `${bracket}2`;
    const semiNum = i + 1;

    const matchNum = currentMatchNum++;
    const matchCode = formatMatchNumber(matchNum);
    const matchId = `match_${now}_${matchNum}`;
    semiMatchIds.prata.push(matchId);

    generatedMatches.push({
      id: matchId,
      matchNumber: matchNum,
      matchCode,
      categoryId: category.id,
      phase: `super8d_semi_prata_${semiNum}`,
      pair1Label: `Dupla Prata ${g1Key} (3°+4°)`,
      pair2Label: `Dupla Prata ${g2Key} (3°+4°)`,
      status: 'waiting',
      super8dSemiPrata: semiNum,
      super8dGroup1: g1Key,
      super8dGroup2: g2Key,
    } as TournamentMatch & { super8dSemiPrata: number; super8dGroup1: string; super8dGroup2: string });
  }

  // ── Fase 3: Finais ──────────────────────────────────────────────────────────
  const [semiOuro1Id, semiOuro2Id] = semiMatchIds.ouro;
  const [semiPrata1Id, semiPrata2Id] = semiMatchIds.prata;

  // Final Ouro
  const finalOuroNum = currentMatchNum++;
  generatedMatches.push({
    id: `match_${now}_${finalOuroNum}`,
    matchNumber: finalOuroNum,
    matchCode: formatMatchNumber(finalOuroNum),
    categoryId: category.id,
    phase: 'super8d_final_ouro',
    pair1Label: `Ganhador ${formatMatchNumber(semiOuro1Id ? generatedMatches.find(m => m.id === semiOuro1Id)?.matchNumber || 0 : 0)}`,
    pair2Label: `Ganhador ${formatMatchNumber(semiOuro2Id ? generatedMatches.find(m => m.id === semiOuro2Id)?.matchNumber || 0 : 0)}`,
    status: 'waiting',
    super8dSemiRef1: semiOuro1Id,
    super8dSemiRef2: semiOuro2Id,
  } as TournamentMatch & { super8dSemiRef1: string; super8dSemiRef2: string });

  // 3° Lugar Ouro
  const tercOuroNum = currentMatchNum++;
  generatedMatches.push({
    id: `match_${now}_${tercOuroNum}`,
    matchNumber: tercOuroNum,
    matchCode: formatMatchNumber(tercOuroNum),
    categoryId: category.id,
    phase: 'super8d_3lugar_ouro',
    pair1Label: `Perdedor Semi Ouro 1`,
    pair2Label: `Perdedor Semi Ouro 2`,
    status: 'waiting',
    super8dSemiRef1: semiOuro1Id,
    super8dSemiRef2: semiOuro2Id,
  } as TournamentMatch & { super8dSemiRef1: string; super8dSemiRef2: string });

  // Final Prata
  const finalPrataNum = currentMatchNum++;
  generatedMatches.push({
    id: `match_${now}_${finalPrataNum}`,
    matchNumber: finalPrataNum,
    matchCode: formatMatchNumber(finalPrataNum),
    categoryId: category.id,
    phase: 'super8d_final_prata',
    pair1Label: `Ganhador Semi Prata 1`,
    pair2Label: `Ganhador Semi Prata 2`,
    status: 'waiting',
    super8dSemiRef1: semiPrata1Id,
    super8dSemiRef2: semiPrata2Id,
  } as TournamentMatch & { super8dSemiRef1: string; super8dSemiRef2: string });

  // 3° Lugar Prata
  const tercPrataNum = currentMatchNum++;
  generatedMatches.push({
    id: `match_${now}_${tercPrataNum}`,
    matchNumber: tercPrataNum,
    matchCode: formatMatchNumber(tercPrataNum),
    categoryId: category.id,
    phase: 'super8d_3lugar_prata',
    pair1Label: `Perdedor Semi Prata 1`,
    pair2Label: `Perdedor Semi Prata 2`,
    status: 'waiting',
    super8dSemiRef1: semiPrata1Id,
    super8dSemiRef2: semiPrata2Id,
  } as TournamentMatch & { super8dSemiRef1: string; super8dSemiRef2: string });

  // Suppress unused variable warning
  void totalGroups;
  void groupMatchIds;

  return generatedMatches;
};
