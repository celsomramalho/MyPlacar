import type { MatchHistoryItem } from '../types';

export const filterHistory = (history: MatchHistoryItem[], searchQuery: string): MatchHistoryItem[] => {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return history;

  return history.filter((item) =>
    item.p1Name.toLowerCase().includes(query) ||
    item.p2Name.toLowerCase().includes(query) ||
    item.winner.toLowerCase().includes(query),
  );
};
