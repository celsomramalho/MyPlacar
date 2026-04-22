import type { MatchHistoryItem } from '../types';

const HISTORY_STORAGE_KEY = 'myPlacarHistory';
const BACKUP_STORAGE_PREFIX = 'myPlacar_Backup_';

interface PersistLocalHistoryOptions {
  limit?: number;
  fallbackLimit?: number;
}

export const persistLocalHistory = (
  newList: MatchHistoryItem[],
  options: PersistLocalHistoryOptions = {},
): MatchHistoryItem[] => {
  const { limit = 100, fallbackLimit = 50 } = options;
  const limitedList = newList.slice(0, limit);

  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(limitedList));
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(BACKUP_STORAGE_PREFIX)) localStorage.removeItem(key);
      });
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(limitedList.slice(0, fallbackLimit)));
      } catch {}
    }
  }

  return limitedList;
};
