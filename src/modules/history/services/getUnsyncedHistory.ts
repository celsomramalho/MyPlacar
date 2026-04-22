import type { MatchHistoryItem } from '../types';

export const getUnsyncedHistory = (history: MatchHistoryItem[]): MatchHistoryItem[] => {
  return history.filter((item) => !item.isSynced);
};
