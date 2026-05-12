import type { MatchHistoryItem } from '../types';

export const mergeDownloadedHistory = (
  downloaded: MatchHistoryItem[],
  currentHistory: MatchHistoryItem[],
): MatchHistoryItem[] => {
  const existingIds = new Set(currentHistory.map((m) => m.id));
  const newOnly = downloaded.filter((m) => !existingIds.has(m.id));
  return [...newOnly, ...currentHistory].sort((a, b) => b.id.localeCompare(a.id));
};
