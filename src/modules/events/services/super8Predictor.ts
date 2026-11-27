import type {
  EventCategory,
  PlayerStanding,
  Super8StandingsOptions,
  TournamentEntry,
  TournamentEvent,
  TournamentMatch,
  TournamentPair,
} from '../types';
import { calculateSuper8PlayerStandings, parseScoresFromMatch } from './matchProgression';
import { isSuper8Event } from './eventTypeHelpers';

const INITIAL_MU = 25;
const INITIAL_SIGMA = 8.333;
const BETA = 8.333;
const TAU = 0.083;
const WEAK_PARTNER_PENALTY = 0.15;
const SIMULATIONS = 1_000;

// Frequencies in the 126 matches from the nine historical 8-player Super 8s.
const WINNING_SCORE_COUNTS = [64, 39, 19, 4] as const;
const WINNING_SCORES = [4, 5, 6, 7] as const;

interface Rating {
  mu: number;
  sigma: number;
}

interface Matchup {
  match: TournamentMatch;
  round: number;
  pair1: TournamentPair;
  pair2: TournamentPair;
  keys1: [string, string];
  keys2: [string, string];
}

export interface Super8MatchPrediction {
  match: TournamentMatch;
  pair1: TournamentPair;
  pair2: TournamentPair;
  completed: boolean;
  actualGames1: number;
  actualGames2: number;
  chance1: number;
  chance2: number;
  estimatedGames1: number;
  estimatedGames2: number;
  effectiveStrength1: number;
  effectiveStrength2: number;
  skills1: [number, number];
  skills2: [number, number];
}

export interface Super8Prediction {
  eligible: boolean;
  currentRound: number;
  completedMatches: number;
  remainingMatches: number;
  nextMatches: Super8MatchPrediction[];
  podiumChanceByEntry: Map<string, number>;
  skillByEntry: Map<string, number>;
}

interface PredictorInput {
  entries: TournamentEntry[];
  matches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  standingsOptions: Super8StandingsOptions;
  isSevenGamesFormat: boolean;
  seedKey: string;
}

const normalize = (value?: string | number) => String(value ?? '').trim().toLowerCase();

const entryIdentity = (entry: Partial<TournamentEntry>): string => {
  if (entry.registrationId) return `reg:${normalize(entry.registrationId)}`;
  if (entry.email) return `email:${normalize(entry.email)}`;
  if (entry.pin) return `pin:${normalize(entry.pin)}`;
  const name = normalize(entry.name || entry.nickname).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return name ? `name:${name}` : '';
};

const aliasesFor = (entry: Partial<TournamentEntry>) => [
  entry.registrationId ? `reg:${normalize(entry.registrationId)}` : '',
  entry.email ? `email:${normalize(entry.email)}` : '',
  entry.pin ? `pin:${normalize(entry.pin)}` : '',
  entry.name ? `name:${normalize(entry.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')}` : '',
  entry.nickname ? `name:${normalize(entry.nickname).normalize('NFD').replace(/[\u0300-\u036f]/g, '')}` : '',
].filter(Boolean);

const normalCdf = (x: number) => {
  const absolute = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * absolute);
  const density = 0.3989423 * Math.exp(-(absolute * absolute) / 2);
  const tail = density * t * (
    0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))
  );
  return x >= 0 ? 1 - tail : tail;
};

const normalPdf = (x: number) => Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);

const effectiveStrength = (a: Rating, b: Rating) =>
  a.mu + b.mu - WEAK_PARTNER_PENALTY * Math.abs(a.mu - b.mu);

const winProbability = (
  pair1: [string, string],
  pair2: [string, string],
  ratings: Map<string, Rating>
) => {
  const a = ratings.get(pair1[0])!;
  const b = ratings.get(pair1[1])!;
  const c = ratings.get(pair2[0])!;
  const d = ratings.get(pair2[1])!;
  const variance = a.sigma ** 2 + b.sigma ** 2 + c.sigma ** 2 + d.sigma ** 2 + 4 * BETA ** 2;
  return normalCdf((effectiveStrength(a, b) - effectiveStrength(c, d)) / Math.sqrt(variance));
};

const updateRatings = (
  pair1: [string, string],
  pair2: [string, string],
  winner: 1 | 2,
  ratings: Map<string, Rating>
) => {
  const allKeys = [...pair1, ...pair2];
  const teamMean = (keys: [string, string]) => keys.reduce((sum, key) => sum + ratings.get(key)!.mu, 0);
  const delta = teamMean(pair1) - teamMean(pair2);
  const variances = allKeys.map((key) => ratings.get(key)!.sigma ** 2 + TAU ** 2);
  const teamVariance = variances.reduce((sum, variance) => sum + variance, 0) + 4 * BETA ** 2;
  const c = Math.sqrt(teamVariance);
  const direction = winner === 1 ? 1 : -1;
  const t = direction * delta / c;
  const v = normalPdf(t) / Math.max(normalCdf(t), 1e-12);
  const w = v * (v + t);

  allKeys.forEach((key, index) => {
    const rating = ratings.get(key)!;
    const variance = variances[index];
    const sign = index < 2 ? direction : -direction;
    const nextVariance = Math.max(1e-6, variance * (1 - (variance / teamVariance) * w));
    ratings.set(key, {
      mu: rating.mu + sign * (variance / c) * v,
      sigma: Math.sqrt(nextVariance),
    });
  });
};

const seededRandom = (seedText: string) => {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleWinnerGames = (random: () => number) => {
  const value = random() * WINNING_SCORE_COUNTS.reduce((sum, count) => sum + count, 0);
  let cumulative = 0;
  for (let index = 0; index < WINNING_SCORES.length; index += 1) {
    cumulative += WINNING_SCORE_COUNTS[index];
    if (value < cumulative) return WINNING_SCORES[index];
  }
  return 4;
};

const scoreWinner = (match: TournamentMatch): 1 | 2 => {
  const scores = parseScoresFromMatch(match);
  if (match.winnerPairId) {
    if (match.winnerPairId === match.pair1Id || match.winnerPairId === match.pair1?.id) return 1;
    if (match.winnerPairId === match.pair2Id || match.winnerPairId === match.pair2?.id) return 2;
  }
  return scores.g1 > scores.g2 ? 1 : 2;
};

const getMatchPair = (match: TournamentMatch, side: 1 | 2, pairsById: Record<string, TournamentPair>) => {
  const pairId = side === 1 ? match.pair1Id : match.pair2Id;
  return (side === 1 ? match.pair1 : match.pair2) || (pairId ? pairsById[pairId] : undefined);
};

const getRound = (match: TournamentMatch) => {
  const phase = match.phase?.match(/^rodada(\d+)$/i);
  return phase ? Number(phase[1]) : 0;
};

const sortMatchups = (a: Matchup, b: Matchup) =>
  a.round - b.round || (a.match.matchNumber ?? 0) - (b.match.matchNumber ?? 0) || a.match.id.localeCompare(b.match.id);

const makeSimulationMatch = (
  matchup: Matchup,
  games1: number,
  games2: number,
  winner: 1 | 2
): TournamentMatch => ({
  ...matchup.match,
  status: 'finished',
  scores: [{ p1: games1, p2: games2 }],
  result: `${games1}x${games2}`,
  winnerPairId: winner === 1
    ? matchup.match.pair1Id || matchup.pair1.id
    : matchup.match.pair2Id || matchup.pair2.id,
});

const makeIneligibleResult = (): Super8Prediction => ({
  eligible: false,
  currentRound: 0,
  completedMatches: 0,
  remainingMatches: 0,
  nextMatches: [],
  podiumChanceByEntry: new Map(),
  skillByEntry: new Map(),
});

export const calculateSuper8Prediction = ({
  entries,
  matches,
  pairsById,
  standingsOptions,
  isSevenGamesFormat,
  seedKey,
}: PredictorInput): Super8Prediction => {
  if (!isSevenGamesFormat || entries.length !== 8 || matches.length !== 14) return makeIneligibleResult();

  const entryKeys = entries.map(entryIdentity);
  if (entryKeys.some((key) => !key) || new Set(entryKeys).size !== 8) return makeIneligibleResult();

  const entryKeyByAlias = new Map<string, string>();
  entries.forEach((entry, index) => aliasesFor(entry).forEach((alias) => entryKeyByAlias.set(alias, entryKeys[index])));
  const getKey = (entry?: TournamentEntry) => {
    if (!entry) return '';
    for (const alias of aliasesFor(entry)) {
      const canonical = entryKeyByAlias.get(alias);
      if (canonical) return canonical;
    }
    return '';
  };

  const matchups: Matchup[] = [];
  for (const match of matches) {
    const round = getRound(match);
    const pair1 = getMatchPair(match, 1, pairsById);
    const pair2 = getMatchPair(match, 2, pairsById);
    if (!round || round > 7 || !pair1?.p1 || !pair1.p2 || !pair2?.p1 || !pair2.p2) return makeIneligibleResult();
    const keys1 = [getKey(pair1.p1), getKey(pair1.p2)] as [string, string];
    const keys2 = [getKey(pair2.p1), getKey(pair2.p2)] as [string, string];
    if ([...keys1, ...keys2].some((key) => !key) || new Set([...keys1, ...keys2]).size !== 4) return makeIneligibleResult();
    if (match.status === 'finished') {
      const { g1, g2 } = parseScoresFromMatch(match);
      if (g1 + g2 !== 7 || g1 === g2) return makeIneligibleResult();
    }
    matchups.push({ match, round, pair1, pair2, keys1, keys2 });
  }
  matchups.sort(sortMatchups);

  const rounds = new Map<number, Matchup[]>();
  for (const matchup of matchups) {
    const group = rounds.get(matchup.round) || [];
    group.push(matchup);
    rounds.set(matchup.round, group);
  }
  if (rounds.size !== 7) return makeIneligibleResult();
  for (let round = 1; round <= 7; round += 1) {
    const roundMatches = rounds.get(round);
    if (!roundMatches || roundMatches.length !== 2) return makeIneligibleResult();
    const roundPlayers = roundMatches.flatMap((matchup) => [...matchup.keys1, ...matchup.keys2]);
    if (roundPlayers.length !== 8 || new Set(roundPlayers).size !== 8 || entryKeys.some((key) => !roundPlayers.includes(key))) {
      return makeIneligibleResult();
    }
  }

  const ratings = new Map<string, Rating>(
    entryKeys.map((key) => [key, { mu: INITIAL_MU, sigma: INITIAL_SIGMA }] as const)
  );
  const completed = matchups.filter((matchup) => matchup.match.status === 'finished');
  for (const matchup of completed) {
    updateRatings(matchup.keys1, matchup.keys2, scoreWinner(matchup.match), ratings);
  }

  const nextRound = matchups.find((matchup) => matchup.match.status !== 'finished')?.round ?? 0;
  const nextMatches = nextRound
    ? (rounds.get(nextRound) || [])
    : [];
  const seed = `${seedKey}|${completed.map(({ match }) => `${match.id}:${parseScoresFromMatch(match).g1}-${parseScoresFromMatch(match).g2}`).join('|')}`;
  const random = seededRandom(seed);
  const podiumCounts = new Map<string, number>(entryKeys.map((key) => [key, 0] as const));

  for (let simulation = 0; simulation < SIMULATIONS; simulation += 1) {
    const simulatedRatings = new Map<string, Rating>(
      entryKeys.map((key) => [key, { ...ratings.get(key)! }] as const)
    );
    const simulatedMatches = completed.map(({ match }) => match);

    for (const matchup of matchups) {
      if (matchup.match.status === 'finished') continue;
      const chance1 = winProbability(matchup.keys1, matchup.keys2, simulatedRatings);
      const winner: 1 | 2 = random() < chance1 ? 1 : 2;
      const winnerGames = sampleWinnerGames(random);
      const games1 = winner === 1 ? winnerGames : 7 - winnerGames;
      const games2 = 7 - games1;
      updateRatings(matchup.keys1, matchup.keys2, winner, simulatedRatings);
      simulatedMatches.push(makeSimulationMatch(matchup, games1, games2, winner));
    }

    const projectedStandings = calculateSuper8PlayerStandings(entries, simulatedMatches, standingsOptions);
    projectedStandings.forEach((standing) => {
      if (standing.rank !== undefined && standing.rank <= 3) {
        const key = entryIdentity(standing.entry);
        podiumCounts.set(key, (podiumCounts.get(key) || 0) + 1);
      }
    });
  }

  const podiumChanceByEntry = new Map<string, number>();
  entryKeys.forEach((key) => podiumChanceByEntry.set(key, (podiumCounts.get(key)! / SIMULATIONS) * 100));
  const skillByEntry = new Map<string, number>();
  entryKeys.forEach((key) => skillByEntry.set(key, ratings.get(key)!.mu));

  const predictMatch = (matchup: Matchup): Super8MatchPrediction => {
    const a = ratings.get(matchup.keys1[0])!;
    const b = ratings.get(matchup.keys1[1])!;
    const c = ratings.get(matchup.keys2[0])!;
    const d = ratings.get(matchup.keys2[1])!;
    const chance1 = winProbability(matchup.keys1, matchup.keys2, ratings);
    const actual = parseScoresFromMatch(matchup.match);
    const favoriteChance = Math.max(chance1, 1 - chance1);
    const winnerGames = Math.max(4, Math.min(7, Math.round(favoriteChance * 7)));
    const favorsPair1 = chance1 >= 0.5;
    return {
      match: matchup.match,
      pair1: matchup.pair1,
      pair2: matchup.pair2,
      completed: matchup.match.status === 'finished',
      actualGames1: actual.g1,
      actualGames2: actual.g2,
      chance1: chance1 * 100,
      chance2: (1 - chance1) * 100,
      estimatedGames1: favorsPair1 ? winnerGames : 7 - winnerGames,
      estimatedGames2: favorsPair1 ? 7 - winnerGames : winnerGames,
      effectiveStrength1: effectiveStrength(a, b),
      effectiveStrength2: effectiveStrength(c, d),
      skills1: [a.mu, b.mu],
      skills2: [c.mu, d.mu],
    };
  };

  return {
    eligible: true,
    currentRound: nextRound,
    completedMatches: completed.length,
    remainingMatches: matches.length - completed.length,
    nextMatches: nextMatches.map(predictMatch),
    podiumChanceByEntry,
    skillByEntry,
  };
};

export const canUseSuper8Predictor = (
  event: TournamentEvent,
  category: EventCategory,
  isSevenGamesFormat: boolean
) => {
  const scoreTarget = category.scoreTarget || event.scoreTarget || 'Inscrito';
  return isSuper8Event(event) && scoreTarget === 'Inscrito' && isSevenGamesFormat;
};

export const getPredictorEntryKey = (entry: Partial<TournamentEntry>) => entryIdentity(entry);

