import type { TournamentMatch, TournamentPair, EventCategory } from '../types';
import { minifyPairForStorage } from '../types';

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
  const lower = phase.toLowerCase();
  if (lower === 'chave1' || lower === 'chave 1') return 'chave1';
  if (lower === 'chave2' || lower === 'chave 2') return 'chave2';
  if (lower === 'semifinal' || lower === 'semi') return 'semifinal';
  if (lower === 'final') return 'final';
  if (lower === '3lugar' || lower === '3º lugar' || lower === 'terceiro_lugar') return '3lugar';
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

  const bracket1Pairs = catPairs.filter((p) => (p.bracket ?? 1) === 1);
  const bracket2Pairs = catPairs.filter((p) => p.bracket === 2);

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
