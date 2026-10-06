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
    `${entry.name || ''} ${entry.nickname || ''}`.toLocaleLowerCase().includes(normalizedQuery)
  );
};
