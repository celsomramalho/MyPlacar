import { countCloudMatches, deleteAllCloudMatches, downloadMatchesFromFirebase, syncMatchesToFirebase } from '@infra/firebase/matches';
import { deleteAllSupabaseMatches, mirrorMatches } from '@infra/supabase';
import type { Firestore, FieldValue } from 'firebase/firestore';
import type { MatchHistoryItem } from '../types';
import { getUnsyncedHistory } from './getUnsyncedHistory';
import { markHistoryAsSynced } from './markHistoryAsSynced';
import { mergeDownloadedHistory } from './mergeDownloadedHistory';

interface FetchCloudMatchesCountParams {
  db: Firestore | null;
  ownerEmail: string;
  history: MatchHistoryItem[];
  excludeIds?: Set<string>;
}

export const fetchCloudHistoryCount = async ({
  db,
  ownerEmail,
  history,
  excludeIds = new Set(),
}: FetchCloudMatchesCountParams): Promise<number> => {
  if (!db || !ownerEmail) return 0;
  const localIds = new Set(history.map((match) => match.id));
  return countCloudMatches(db, ownerEmail, localIds, excludeIds);
};

interface SyncHistoryParams {
  db: Firestore | null;
  history: MatchHistoryItem[];
  ownerEmail: string;
  ownerPin: string;
  forceAll?: boolean;
  serializeMatch: (match: MatchHistoryItem) => Record<string, unknown> | null;
  syncedAt: FieldValue;
}

export const syncHistoryBatch = async ({
  db,
  history,
  ownerEmail,
  ownerPin,
  forceAll = false,
  serializeMatch,
  syncedAt,
}: SyncHistoryParams): Promise<{ updatedHistory: MatchHistoryItem[]; syncedCount: number }> => {
  if (!db || !ownerEmail) return { updatedHistory: history, syncedCount: 0 };

  const unsynced = forceAll ? history : getUnsyncedHistory(history);
  if (unsynced.length === 0) return { updatedHistory: history, syncedCount: 0 };

  const validUnsynced = await syncMatchesToFirebase(
    db,
    unsynced,
    ownerEmail,
    ownerPin,
    (match) => {
      const serialized = serializeMatch(match);
      if (!serialized) return null;
      return { ...serialized, syncedAt };
    },
  );

  if (validUnsynced.length === 0) return { updatedHistory: history, syncedCount: 0 };

  mirrorMatches(validUnsynced, ownerEmail, ownerPin);
  const syncedIds = new Set(validUnsynced.map((match) => match.id));
  return {
    updatedHistory: markHistoryAsSynced(history, syncedIds),
    syncedCount: validUnsynced.length,
  };
};

interface DownloadHistoryParams {
  db: Firestore | null;
  ownerEmail: string;
  history: MatchHistoryItem[];
}

export const downloadHistoryBatch = async ({
  db,
  ownerEmail,
  history,
}: DownloadHistoryParams): Promise<{ updatedHistory: MatchHistoryItem[]; downloadedCount: number }> => {
  if (!db || !ownerEmail) return { updatedHistory: history, downloadedCount: 0 };

  const localIds = new Set(history.map((match) => match.id));
  const downloaded = await downloadMatchesFromFirebase(db, ownerEmail, localIds);
  if (downloaded.length === 0) return { updatedHistory: history, downloadedCount: 0 };

  return {
    updatedHistory: mergeDownloadedHistory(downloaded, history),
    downloadedCount: downloaded.length,
  };
};

interface ClearHistoryParams {
  db: Firestore | null;
  ownerEmail: string;
}

export const clearCloudHistory = async ({
  db,
  ownerEmail,
}: ClearHistoryParams): Promise<void> => {
  if (!db || !ownerEmail) return;
  await deleteAllCloudMatches(db, ownerEmail);
  deleteAllSupabaseMatches(ownerEmail);
};
