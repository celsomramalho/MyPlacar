import type { MatchHistoryItem } from '../types';

export const markHistoryAsSynced = (
  history: MatchHistoryItem[],
  syncedIds: Set<string>,
): MatchHistoryItem[] => {
  return history.map((item) => (
    syncedIds.has(item.id)
      ? { ...item, isSynced: true }
      : item
  ));
};
