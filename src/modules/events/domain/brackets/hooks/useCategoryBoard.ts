import { useMemo } from 'react';
import type {
  EventCategory,
  PlayerStanding,
  TournamentEntry,
  TournamentEvent,
  TournamentMatch,
  TournamentPair,
} from '@modules/events/types';
import { calculateQueueState } from '@modules/events/domain/queue';
import { calculateSuper8PlayerStandings } from '@modules/events/services/matchProgression';
import {
  calculateBracketStandings,
  type TeamStanding,
} from '../engine/bracketProgressionEngine';
import {
  findPairForEntry,
  getCategoryEntries,
  getCategoryMatches,
  getCategoryPairs,
} from '../engine/categoryViewEngine';
import { isCategoryMixed } from '../engine/teamFormationEngine';

interface UseCategoryBoardOptions {
  event: TournamentEvent;
  categories: EventCategory[];
  selectedCategoryId: string | null;
  selectedEntries: Set<string>;
  sortBy: 'name' | 'team';
  isRanking: boolean;
  isIndividualRanking: boolean;
  totalSets: number;
}

export interface UseCategoryBoardResult {
  selectedCategory?: EventCategory;
  categoryEntries: TournamentEntry[];
  categoryPairs: TournamentPair[];
  categoryMatches: TournamentMatch[];
  pairsById: Record<string, TournamentPair>;
  orderedQueue: ReturnType<typeof calculateQueueState>['orderedQueue'];
  queuePosByMatchId: Map<string, number>;
  playerStandings: PlayerStanding[];
  playerStandingsMap: Map<string, PlayerStanding>;
  sortedCategoryEntries: TournamentEntry[];
  visibleCategoryEntries: TournamentEntry[];
  selectionFilterGender?: 'M' | 'F';
  pairForEntry: (entry: TournamentEntry) => TournamentPair | undefined;
  selectedPair: TournamentPair | null;
  bracketOnePairs: TournamentPair[];
  bracketTwoPairs: TournamentPair[];
  b1Matches: TournamentMatch[];
  b2Matches: TournamentMatch[];
  b1Standings: TeamStanding[];
  b2Standings: TeamStanding[];
  b1StandingsMap: Map<string, TeamStanding>;
  b2StandingsMap: Map<string, TeamStanding>;
  b1Finished: boolean;
  b2Finished: boolean;
  b1FinishedCount: number;
  b2FinishedCount: number;
}

const sortBracketPairs = (pairs: TournamentPair[]): TournamentPair[] =>
  [...pairs].sort((a, b) => {
    if (a.bracketOrder !== undefined && b.bracketOrder !== undefined) {
      return a.bracketOrder - b.bracketOrder;
    }
    if (a.bracketOrder !== undefined) return -1;
    if (b.bracketOrder !== undefined) return 1;
    return (a.teamNumber || 0) - (b.teamNumber || 0);
  });

export function useCategoryBoard({
  event,
  categories,
  selectedCategoryId,
  selectedEntries,
  sortBy,
  isRanking,
  isIndividualRanking,
  totalSets,
}: UseCategoryBoardOptions): UseCategoryBoardResult {
  const pairs = event.pairs || [];
  const entries = event.entries || [];
  const matches = event.matches || [];

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const pairsById = useMemo(() => {
    const map: Record<string, TournamentPair> = {};
    pairs.forEach((pair) => {
      map[pair.id] = pair;
    });
    return map;
  }, [pairs]);

  const categoryEntries = useMemo(
    () => getCategoryEntries(entries, selectedCategory),
    [entries, selectedCategory]
  );

  const categoryMatches = useMemo(
    () => getCategoryMatches(matches, pairs, selectedCategory),
    [matches, pairs, selectedCategory]
  );

  const categoryPairs = useMemo(
    () => getCategoryPairs(pairs, selectedCategory),
    [pairs, selectedCategory]
  );

  const orderedQueue = useMemo(() => {
    try {
      return calculateQueueState(event).orderedQueue;
    } catch {
      return [];
    }
  }, [event]);

  const queuePosByMatchId = useMemo(() => {
    const map = new Map<string, number>();
    orderedQueue.forEach((item, index) => {
      map.set(item.match.id, index + 1);
    });
    return map;
  }, [orderedQueue]);

  const playerStandings = useMemo(() => {
    if (!isIndividualRanking || !selectedCategory) return [];
    return calculateSuper8PlayerStandings(
      categoryEntries,
      categoryMatches,
      isRanking ? 'rankingPoints' : 'wins'
    );
  }, [isIndividualRanking, isRanking, selectedCategory, categoryEntries, categoryMatches]);

  const playerStandingsMap = useMemo(() => {
    const map = new Map<string, PlayerStanding>();
    playerStandings.forEach((standing) => {
      const emailKey = (standing.entry.email || '').toLowerCase().trim();
      const pinKey = (standing.entry.pin || '').toLowerCase().trim();
      if (emailKey) map.set(emailKey, standing);
      if (pinKey) map.set(pinKey, standing);
      if (standing.entry.registrationId) {
        map.set(`reg_${standing.entry.registrationId}`, standing);
      }
    });
    return map;
  }, [playerStandings]);

  const sortedCategoryEntries = useMemo(() => {
    if (isIndividualRanking) {
      return [...categoryEntries].sort((a, b) => {
        const keyA = (a.email || a.pin || '').toLowerCase().trim();
        const keyB = (b.email || b.pin || '').toLowerCase().trim();
        const stA = playerStandingsMap.get(keyA) || (a.registrationId ? playerStandingsMap.get(`reg_${a.registrationId}`) : undefined);
        const stB = playerStandingsMap.get(keyB) || (b.registrationId ? playerStandingsMap.get(`reg_${b.registrationId}`) : undefined);
        const rankA = stA?.rank ?? 9999;
        const rankB = stB?.rank ?? 9999;
        if (rankA !== rankB) return rankA - rankB;
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    if (sortBy === 'name') {
      return [...categoryEntries].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return [...categoryEntries].sort((a, b) => {
      const pairA = pairs.find(
        (pair) =>
          pair.categoryId === selectedCategory?.id &&
          (pair.p1.email === a.email ||
            pair.p2.email === a.email ||
            pair.p1.pin === a.pin ||
            pair.p2.pin === a.pin)
      );
      const pairB = pairs.find(
        (pair) =>
          pair.categoryId === selectedCategory?.id &&
          (pair.p1.email === b.email ||
            pair.p2.email === b.email ||
            pair.p1.pin === b.pin ||
            pair.p2.pin === b.pin)
      );

      if (pairA && pairB) {
        const numA = pairA.teamNumber || 0;
        const numB = pairB.teamNumber || 0;
        if (numA !== numB) return numA - numB;
      }
      if (pairA && !pairB) return -1;
      if (!pairA && pairB) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [isIndividualRanking, categoryEntries, sortBy, playerStandingsMap, pairs, selectedCategory?.id]);

  const selectedEntry =
    selectedEntries.size === 1
      ? categoryEntries.find((entry) => {
          const val = selectedEntries.values().next().value;
          return (
            (entry.email && (entry.email === val || selectedEntries.has(entry.email))) ||
            (entry.pin && (entry.pin === val || selectedEntries.has(entry.pin)))
          );
        })
      : undefined;

  const selectedEntryGender = selectedEntry?.gender;

  const selectionFilterGender =
    selectedCategory && isCategoryMixed(selectedCategory)
      ? selectedEntryGender === 'M'
        ? 'F'
        : selectedEntryGender === 'F'
          ? 'M'
          : undefined
      : undefined;

  const isEntrySelected = (entry: TournamentEntry) => {
    return Boolean(
      (entry.email && selectedEntries.has(entry.email)) ||
      (entry.pin && selectedEntries.has(entry.pin))
    );
  };

  const visibleCategoryEntries = useMemo(() => {
    if (!selectionFilterGender) {
      return sortedCategoryEntries;
    }

    const selectedList = sortedCategoryEntries.filter(isEntrySelected);
    const oppositeGenderList = sortedCategoryEntries.filter(
      (entry) => !isEntrySelected(entry) && entry.gender === selectionFilterGender
    );

    return [...selectedList, ...oppositeGenderList];
  }, [selectionFilterGender, sortedCategoryEntries, selectedEntries]);

  const pairForEntry = (entry: TournamentEntry) => findPairForEntry(entry, categoryPairs);

  const selectedPair = useMemo(() => {
    if (isRanking || selectedEntries.size !== 2) return null;
    const [first, second] = Array.from(selectedEntries);
    const found = categoryPairs.find(
      (pair) =>
        ((pair.p1.email === first || pair.p1.pin === first) && (pair.p2.email === second || pair.p2.pin === second)) ||
        ((pair.p1.email === second || pair.p1.pin === second) && (pair.p2.email === first || pair.p2.pin === first))
    );
    if (!found) return null;
    const isPairSelected =
      (selectedEntries.has(found.p1.email) || (found.p1.pin && selectedEntries.has(found.p1.pin))) &&
      (selectedEntries.has(found.p2.email) || (found.p2.pin && selectedEntries.has(found.p2.pin)));
    return isPairSelected ? found : null;
  }, [isRanking, categoryPairs, selectedEntries]);

  const bracketOnePairs = useMemo(
    () => sortBracketPairs(categoryPairs.filter((pair) => (pair.bracket ?? 1) === 1)),
    [categoryPairs]
  );

  const bracketTwoPairs = useMemo(
    () => sortBracketPairs(categoryPairs.filter((pair) => pair.bracket === 2)),
    [categoryPairs]
  );

  const b1Matches = useMemo(
    () => categoryMatches.filter((match) => match.phase === 'chave1'),
    [categoryMatches]
  );
  const b2Matches = useMemo(
    () => categoryMatches.filter((match) => match.phase === 'chave2'),
    [categoryMatches]
  );

  const b1Standings = useMemo(
    () => calculateBracketStandings(bracketOnePairs, b1Matches, totalSets),
    [bracketOnePairs, b1Matches, totalSets]
  );
  const b2Standings = useMemo(
    () => calculateBracketStandings(bracketTwoPairs, b2Matches, totalSets),
    [bracketTwoPairs, b2Matches, totalSets]
  );

  const b1StandingsMap = useMemo(
    () => new Map<string, TeamStanding>(b1Standings.map((standing) => [standing.pair.id, standing])),
    [b1Standings]
  );
  const b2StandingsMap = useMemo(
    () => new Map<string, TeamStanding>(b2Standings.map((standing) => [standing.pair.id, standing])),
    [b2Standings]
  );

  const b1Finished = b1Matches.length > 0 && b1Matches.every((match) => match.status === 'finished');
  const b2Finished = b2Matches.length > 0 && b2Matches.every((match) => match.status === 'finished');

  return {
    selectedCategory,
    categoryEntries,
    categoryPairs,
    categoryMatches,
    pairsById,
    orderedQueue,
    queuePosByMatchId,
    playerStandings,
    playerStandingsMap,
    sortedCategoryEntries,
    visibleCategoryEntries,
    selectionFilterGender,
    pairForEntry,
    selectedPair,
    bracketOnePairs,
    bracketTwoPairs,
    b1Matches,
    b2Matches,
    b1Standings,
    b2Standings,
    b1StandingsMap,
    b2StandingsMap,
    b1Finished,
    b2Finished,
    b1FinishedCount: b1Matches.filter((match) => match.status === 'finished').length,
    b2FinishedCount: b2Matches.filter((match) => match.status === 'finished').length,
  };
}
