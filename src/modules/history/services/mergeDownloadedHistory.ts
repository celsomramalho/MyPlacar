import type { MatchHistoryItem } from '../types';

export const mergeDownloadedHistory = (
  downloaded: MatchHistoryItem[],
  currentHistory: MatchHistoryItem[],
): MatchHistoryItem[] => {
  const seenIds = new Set<string>();
  const merged: MatchHistoryItem[] = [];

  for (const match of [...downloaded, ...currentHistory]) {
    if (match?.id && !seenIds.has(match.id)) {
      seenIds.add(match.id);
      merged.push(match);
    }
  }

  return merged.sort((a, b) => b.id.localeCompare(a.id));
};
