import type { TournamentMatch, TournamentPair, EventCategory, TournamentEntry } from '../types';
import { minifyPairForStorage, minifyEntryForPair, orderPairEntriesForMixed } from '../types';

export const formatMatchNumber = (num: number): string => {
  return String(num).padStart(2, '0');
};

export const getPairDisplayName = (pair?: TournamentPair | null): string => {
  if (!pair) return 'A definir';
  const name1 = pair.p1?.nickname || pair.p1?.name || 'Atleta 1';
  const name2 = pair.p2?.nickname || pair.p2?.name || 'Atleta 2';
  return `${name1} & ${name2}`;
};

export const getPairFormattedWithCode = (pair?: TournamentPair | null): string => {
  if (!pair) return 'A definir';
  const names = getPairDisplayName(pair);
  const code = pair.teamCode || (pair.teamNumber ? `Time ${pair.teamNumber}` : '');
  return code ? `${names} [${code}]` : names;
};

export const getPhaseLabel = (phase?: string): string => {
  if (!phase) return '';
  const lower = phase.toLowerCase().trim();
  if (lower === 'chave1' || lower === 'chave 1') return 'chave1';
  if (lower === 'chave2' || lower === 'chave 2') return 'chave2';
  if (lower === 'semifinal' || lower === 'semi') return 'semifinal';
  if (lower === 'final') return 'final';
  if (lower === '3lugar' || lower === '3º lugar' || lower === 'terceiro_lugar') return '3lugar';
  if (lower.startsWith('rodada')) {
    const num = lower.replace(/\D/g, '');
    return num ? `Rodada ${num}` : phase;
  }
  return phase;
};

export const formatMatchDisplayString = (
  match: TournamentMatch,
  pairsMap?: Record<string, TournamentPair>
): string => {
  const code = match.matchCode || formatMatchNumber(match.matchNumber || 1);
  const phase = getPhaseLabel(match.phase);
  const phaseStr = phase ? `[${phase}]` : '';

  const p1 = match.pair1 || (match.pair1Id && pairsMap ? pairsMap[match.pair1Id] : undefined);
  const p2 = match.pair2 || (match.pair2Id && pairsMap ? pairsMap[match.pair2Id] : undefined);

  const team1Text = p1 ? getPairFormattedWithCode(p1) : match.pair1Label || 'A definir';
  const team2Text = p2 ? getPairFormattedWithCode(p2) : match.pair2Label || 'A definir';

  return `[${code}]${phaseStr} ${team1Text} x ${team2Text}`;
};

export const getNextMatchNumber = (existingMatches: TournamentMatch[]): number => {
  if (!existingMatches || existingMatches.length === 0) return 1;
  const maxNum = Math.max(
    0,
    ...existingMatches.map((m, idx) => m.matchNumber || Number(m.matchCode) || idx + 1)
  );
  return maxNum + 1;
};

/**
 * Gera confrontos de todos contra todos (Round-Robin) para uma lista de duplas.
 */
export const generateRoundRobinPairs = (pairsList: TournamentPair[]): Array<[TournamentPair, TournamentPair]> => {
  const matchups: Array<[TournamentPair, TournamentPair]> = [];
  const n = pairsList.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matchups.push([pairsList[i], pairsList[j]]);
    }
  }
  return matchups;
};

/**
 * Gera a grade completa de partidas por Sistema para uma Categoria:
 * - Chave 1: todos contra todos (ex: 4 times -> 6 jogos)
 * - Chave 2: todos contra todos (ex: 4 times -> 6 jogos)
 * - Semifinal 1: 1º chave1 x 2º chave2
 * - Semifinal 2: 2º chave1 x 1º chave2
 * - Final: Ganhador Semifinal 1 x Ganhador Semifinal 2
 * - 3º Lugar: Perdedor Semifinal 1 x Perdedor Semifinal 2
 */
export const generateSystemMatchesForCategory = (
  category: EventCategory,
  allPairs: TournamentPair[],
  existingMatches: TournamentMatch[] = []
): TournamentMatch[] => {
  // Filtra as duplas da categoria
  const catPairs = allPairs.filter(
    (p) =>
      p.categoryId === category.id ||
      (!p.categoryId && (p.p1?.categoryIds?.includes(category.id) || p.p2?.categoryIds?.includes(category.id)))
  );

  const bracket1Pairs = catPairs
    .filter((p) => (p.bracket ?? 1) === 1)
    .sort((a, b) => {
      if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
        return a.bracketOrder - b.bracketOrder;
      }
      if (a.bracketOrder !== undefined) return -1;
      if (b.bracketOrder !== undefined) return 1;
      return (a.teamNumber || 0) - (b.teamNumber || 0);
    });

  const bracket2Pairs = catPairs
    .filter((p) => p.bracket === 2)
    .sort((a, b) => {
      if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
        return a.bracketOrder - b.bracketOrder;
      }
      if (a.bracketOrder !== undefined) return -1;
      if (b.bracketOrder !== undefined) return 1;
      return (a.teamNumber || 0) - (b.teamNumber || 0);
    });

  // Determina o número inicial da partida mantendo sequencial único do evento
  // Se for regerar a categoria, remove as partidas anteriores da categoria para calcular o offset
  const matchesFromOtherCategories = existingMatches.filter(
    (m) => m.categoryId && m.categoryId !== category.id
  );
  let currentMatchNum = getNextMatchNumber(matchesFromOtherCategories);

  const generatedMatches: TournamentMatch[] = [];

  // 1. Jogos da Chave 1
  const b1Matchups = generateRoundRobinPairs(bracket1Pairs);
  for (const [t1, t2] of b1Matchups) {
    const matchNum = currentMatchNum++;
    const matchCode = formatMatchNumber(matchNum);
    generatedMatches.push({
      id: `match_${Date.now()}_${matchNum}`,
      matchNumber: matchNum,
      matchCode,
      categoryId: category.id,
      phase: 'chave1',
      pair1Id: t1.id,
      pair2Id: t2.id,
      pair1: minifyPairForStorage(t1),
      pair2: minifyPairForStorage(t2),
      status: 'waiting',
    });
  }

  // 2. Jogos da Chave 2
  const b2Matchups = generateRoundRobinPairs(bracket2Pairs);
  for (const [t1, t2] of b2Matchups) {
    const matchNum = currentMatchNum++;
    const matchCode = formatMatchNumber(matchNum);
    generatedMatches.push({
      id: `match_${Date.now()}_${matchNum}`,
      matchNumber: matchNum,
      matchCode,
      categoryId: category.id,
      phase: 'chave2',
      pair1Id: t1.id,
      pair2Id: t2.id,
      pair1: minifyPairForStorage(t1),
      pair2: minifyPairForStorage(t2),
      status: 'waiting',
    });
  }

  // 3. Semifinais (se houver times nas duas chaves)
  let semi1Num: number | null = null;
  let semi2Num: number | null = null;

  if (bracket1Pairs.length > 0 && bracket2Pairs.length > 0) {
    // Semifinal 1: 1º chave1 x 2º chave2
    semi1Num = currentMatchNum++;
    generatedMatches.push({
      id: `match_${Date.now()}_${semi1Num}`,
      matchNumber: semi1Num,
      matchCode: formatMatchNumber(semi1Num),
      categoryId: category.id,
      phase: 'semifinal',
      pair1Label: '1º chave1',
      pair2Label: '2º chave2',
      status: 'waiting',
    });

    // Semifinal 2: 2º chave1 x 1º chave2
    semi2Num = currentMatchNum++;
    generatedMatches.push({
      id: `match_${Date.now()}_${semi2Num}`,
      matchNumber: semi2Num,
      matchCode: formatMatchNumber(semi2Num),
      categoryId: category.id,
      phase: 'semifinal',
      pair1Label: '2º chave1',
      pair2Label: '1º chave2',
      status: 'waiting',
    });

    // 4. Final e 3º Lugar
    const finalNum = currentMatchNum++;
    generatedMatches.push({
      id: `match_${Date.now()}_${finalNum}`,
      matchNumber: finalNum,
      matchCode: formatMatchNumber(finalNum),
      categoryId: category.id,
      phase: 'final',
      pair1Label: `Ganhador ${formatMatchNumber(semi1Num)}`,
      pair2Label: `Ganhador ${formatMatchNumber(semi2Num)}`,
      status: 'waiting',
    });

    const thirdNum = currentMatchNum++;
    generatedMatches.push({
      id: `match_${Date.now()}_${thirdNum}`,
      matchNumber: thirdNum,
      matchCode: formatMatchNumber(thirdNum),
      categoryId: category.id,
      phase: '3lugar',
      pair1Label: `Perdedor ${formatMatchNumber(semi1Num)}`,
      pair2Label: `Perdedor ${formatMatchNumber(semi2Num)}`,
      status: 'waiting',
    });
  }

  return generatedMatches;
};

/**
 * Cria uma partida manual entre duas duplas selecionadas.
 */
export const createManualMatch = (
  pair1: TournamentPair,
  pair2: TournamentPair,
  category: EventCategory,
  existingMatches: TournamentMatch[] = []
): TournamentMatch => {
  const matchNum = getNextMatchNumber(existingMatches);
  const matchCode = formatMatchNumber(matchNum);
  const phase = (pair1.bracket === pair2.bracket)
    ? `chave${pair1.bracket || 1}`
    : 'eliminatoria';

  return {
    id: `match_${Date.now()}_${matchNum}`,
    matchNumber: matchNum,
    matchCode,
    categoryId: category.id,
    phase,
    pair1Id: pair1.id,
    pair2Id: pair2.id,
    pair1: minifyPairForStorage(pair1),
    pair2: minifyPairForStorage(pair2),
    status: 'waiting',
  };
};

export const isCategoryMixed = (category: EventCategory): boolean => {
  const catNameLower = (category.name || '').toLowerCase();
  const catDescLower = (category.description || '').toLowerCase();
  const isExplicitMixed =
    (category.gender1 === 'M' && category.gender2 === 'F') ||
    (category.gender1 === 'F' && category.gender2 === 'M');
  const isTextMixed =
    catNameLower.includes('misto') ||
    catNameLower.includes('mista') ||
    catNameLower.includes('mix') ||
    catDescLower.includes('misto') ||
    catDescLower.includes('mista');

  return Boolean(isExplicitMixed || isTextMixed);
};

export const validateCategoryGenders = (
  cat: EventCategory,
  selectedPlayers: TournamentEntry[]
): { valid: boolean; message?: string } => {
  if (selectedPlayers.length !== 2) {
    return { valid: false, message: 'Selecione exatamente 2 jogadores.' };
  }

  const mCount = selectedPlayers.filter((p) => p.gender === 'M').length;
  const fCount = selectedPlayers.filter((p) => p.gender === 'F').length;

  const catNameLower = (cat.name || '').toLowerCase();
  const catDescLower = (cat.description || '').toLowerCase();
  const isExplicitMixed =
    (cat.gender1 === 'M' && cat.gender2 === 'F') ||
    (cat.gender1 === 'F' && cat.gender2 === 'M');
  const isTextMixed =
    catNameLower.includes('misto') ||
    catNameLower.includes('mista') ||
    catNameLower.includes('mix') ||
    catDescLower.includes('misto') ||
    catDescLower.includes('mista');

  if (isExplicitMixed || isTextMixed) {
    if (mCount !== 1 || fCount !== 1) {
      return {
        valid: false,
        message: `A categoria "${cat.name}" é mista e exige 1 atleta masculino e 1 jogadora feminina.`,
      };
    }
    return { valid: true };
  }

  const isExplicitFemale = cat.gender1 === 'F' && cat.gender2 === 'F';
  const isTextFemale =
    (catNameLower.includes('fem') || catDescLower.includes('fem')) &&
    !isTextMixed;

  if (isExplicitFemale || isTextFemale) {
    if (fCount !== 2) {
      return {
        valid: false,
        message: `A categoria "${cat.name}" é feminina e exige 2 atletas do gênero feminino.`,
      };
    }
    return { valid: true };
  }

  const isExplicitMale = cat.gender1 === 'M' && cat.gender2 === 'M';
  const isTextMale =
    (catNameLower.includes('masc') || catDescLower.includes('masc')) &&
    !isTextMixed;

  if (isExplicitMale || isTextMale) {
    if (mCount !== 2) {
      return {
        valid: false,
        message: `A categoria "${cat.name}" é masculina e exige 2 atletas do gênero masculino.`,
      };
    }
    return { valid: true };
  }

  if (cat.gender1 && cat.gender2) {
    const requiredM = (cat.gender1 === 'M' ? 1 : 0) + (cat.gender2 === 'M' ? 1 : 0);
    const requiredF = (cat.gender1 === 'F' ? 1 : 0) + (cat.gender2 === 'F' ? 1 : 0);
    if (mCount !== requiredM || fCount !== requiredF) {
      return {
        valid: false,
        message: `Os atletas selecionados (${mCount} masc / ${fCount} fem) não correspondem à categoria "${cat.name}".`,
      };
    }
  }

  return { valid: true };
};

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
