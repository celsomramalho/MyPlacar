import type { EventCategory, TournamentEntry, TournamentPair } from '@modules/events/types';

export type BracketNumber = 1 | 2;

export interface CategoryPairFilterOptions {
  includeEntryCategoryFallback?: boolean;
}

export interface CategoryMatchFilterOptions {
  includePairCategoryFallback?: boolean;
}

export interface CreateTournamentPairInput {
  first: TournamentEntry;
  second: TournamentEntry;
  category: Pick<EventCategory, 'id' | 'abbreviation'>;
  pairs: TournamentPair[];
  categoryPairs: TournamentPair[];
  id?: string;
  bracket?: BracketNumber;
}
