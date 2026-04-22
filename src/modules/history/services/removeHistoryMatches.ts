import type { MatchHistoryItem } from '../types';

export const removeHistoryMatches = (
  history: MatchHistoryItem[],
  idsToRemove: Iterable<string>,
): MatchHistoryItem[] => {
  const ids = idsToRemove instanceof Set ? idsToRemove : new Set(idsToRemove);
  return history.filter((item) => !ids.has(item.id));
};
