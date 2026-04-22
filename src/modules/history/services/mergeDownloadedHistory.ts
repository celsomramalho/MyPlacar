import type { MatchHistoryItem } from '../types';

export const mergeDownloadedHistory = (
  downloaded: MatchHistoryItem[],
  currentHistory: MatchHistoryItem[],
): MatchHistoryItem[] => {
  return [...downloaded, ...currentHistory].sort((a, b) => b.id.localeCompare(a.id));
};
