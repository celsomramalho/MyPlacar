import type { MatchHistoryItem } from '../types';

export const groupHistoryByDate = (history: MatchHistoryItem[]): Record<string, MatchHistoryItem[]> => {
  return history.reduce<Record<string, MatchHistoryItem[]>>((groups, item) => {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
    return groups;
  }, {});
};
