import type { EventCategory, TournamentEntry, TournamentMatch, TournamentPair } from '@modules/events/types';
import type { CategoryMatchFilterOptions, CategoryPairFilterOptions } from '../types';

const normalizeEmail = (value?: string) => (value || '').toLowerCase().trim();
const normalizePin = (value?: string) => (value || '').toUpperCase().trim();

export const getCategoryEntries = (
  entries: TournamentEntry[],
  category?: Pick<EventCategory, 'id'> | null
): TournamentEntry[] => {
  if (!category) return [];
  return entries.filter((entry) => entry.categoryIds?.includes(category.id));
};

export const getCategoryPairs = (
  pairs: TournamentPair[],
  category?: Pick<EventCategory, 'id'> | null,
  options: CategoryPairFilterOptions = {}
): TournamentPair[] => {
  if (!category) return [];
  const includeEntryCategoryFallback = options.includeEntryCategoryFallback ?? true;
  return pairs.filter(
    (pair) =>
      pair.categoryId === category.id ||
      (includeEntryCategoryFallback &&
        !pair.categoryId &&
        (pair.p1.categoryIds?.includes(category.id) || pair.p2.categoryIds?.includes(category.id)))
  );
};

export const getCategoryMatches = (
  matches: TournamentMatch[],
  pairs: TournamentPair[],
  category?: Pick<EventCategory, 'id'> | null,
  options: CategoryMatchFilterOptions = {}
): TournamentMatch[] => {
  if (!category) return [];
  const includePairCategoryFallback = options.includePairCategoryFallback ?? true;
  return matches.filter(
    (match) =>
      match.categoryId === category.id ||
      (includePairCategoryFallback &&
        !match.categoryId &&
        pairs.some(
          (pair) =>
            (pair.id === match.pair1Id || pair.id === match.pair2Id) &&
            pair.categoryId === category.id
        ))
  );
};

export const buildPairsById = (pairs: TournamentPair[]): Map<string, TournamentPair> => {
  const map = new Map<string, TournamentPair>();
  pairs.forEach((pair) => map.set(pair.id, pair));
  return map;
};

export const findPairForEntry = (
  entry: TournamentEntry,
  pairs: TournamentPair[]
): TournamentPair | undefined => {
  const email = normalizeEmail(entry.email);
  const pin = normalizePin(entry.pin);

  return pairs.find((pair) => {
    const p1Email = normalizeEmail(pair.p1.email);
    const p2Email = normalizeEmail(pair.p2.email);
    const p1Pin = normalizePin(pair.p1.pin);
    const p2Pin = normalizePin(pair.p2.pin);

    return Boolean(
      (email && (p1Email === email || p2Email === email)) ||
      (pin && (p1Pin === pin || p2Pin === pin))
    );
  });
};

export const filterEntriesByParticipantSearch = (
  entries: TournamentEntry[],
  query: string
): TournamentEntry[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return entries;
  return entries.filter((entry) =>
    `${entry.name || ''} ${entry.nickname || ''} ${entry.pin || ''}`.toLocaleLowerCase().includes(normalizedQuery)
  );
};

export const filterPairsBySearch = (
  pairs: TournamentPair[],
  query: string
): TournamentPair[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return pairs;
  return pairs.filter((pair) => {
    const p1Text = `${pair.p1?.name || ''} ${pair.p1?.nickname || ''} ${pair.p1?.pin || ''}`.toLocaleLowerCase();
    const p2Text = `${pair.p2?.name || ''} ${pair.p2?.nickname || ''} ${pair.p2?.pin || ''}`.toLocaleLowerCase();
    return p1Text.includes(normalizedQuery) || p2Text.includes(normalizedQuery);
  });
};

export const filterMatchesBySearch = (
  matches: TournamentMatch[],
  query: string,
  pairsById?: Record<string, TournamentPair> | Map<string, TournamentPair>
): TournamentMatch[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return matches;
  const getPair = (id?: string): TournamentPair | undefined => {
    if (!id || !pairsById) return undefined;
    if (pairsById instanceof Map) return pairsById.get(id);
    return (pairsById as Record<string, TournamentPair>)[id];
  };
  return matches.filter((match) => {
    const p1 = match.pair1 || getPair(match.pair1Id);
    const p2 = match.pair2 || getPair(match.pair2Id);
    const p1Text = `${p1?.p1?.name || ''} ${p1?.p1?.nickname || ''} ${p1?.p2?.name || ''} ${p1?.p2?.nickname || ''} ${p1?.p1?.pin || ''} ${p1?.p2?.pin || ''}`.toLocaleLowerCase();
    const p2Text = `${p2?.p1?.name || ''} ${p2?.p1?.nickname || ''} ${p2?.p2?.name || ''} ${p2?.p2?.nickname || ''} ${p2?.p1?.pin || ''} ${p2?.p2?.pin || ''}`.toLocaleLowerCase();
    return p1Text.includes(normalizedQuery) || p2Text.includes(normalizedQuery);
  });
};

export const getMatchDateKey = (m: TournamentMatch): string => {
  if (m.matchDate && /^\d{4}-\d{2}-\d{2}$/.test(m.matchDate)) {
    return m.matchDate;
  }
  if (m.startedAt) {
    try {
      const d = new Date(m.startedAt);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {}
  }
  if (m.finishedAt) {
    try {
      const d = new Date(m.finishedAt);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {}
  }
  return '';
};

export const sortMatchesByDateDesc = (matches: TournamentMatch[]): TournamentMatch[] => {
  return [...matches].sort((a, b) => {
    const dateA = getMatchDateKey(a);
    const dateB = getMatchDateKey(b);
    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA); // Mais atual para mais antiga
    }

    const timeA = a.startedAt
      ? new Date(a.startedAt).getTime()
      : a.finishedAt
      ? new Date(a.finishedAt).getTime()
      : 0;
    const timeB = b.startedAt
      ? new Date(b.startedAt).getTime()
      : b.finishedAt
      ? new Date(b.finishedAt).getTime()
      : 0;

    if (timeA !== timeB && timeA > 0 && timeB > 0) {
      return timeB - timeA;
    }

    return (b.matchNumber || 0) - (a.matchNumber || 0);
  });
};
