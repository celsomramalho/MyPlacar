import { useState, useEffect, useCallback } from 'react';

import {
  clearCloudHistory,
  downloadHistoryBatch,
  fetchCloudHistoryCount,
  syncHistoryBatch,
} from '@modules/history/services/historySync';
import { getUnsyncedHistory } from '@modules/history/services/getUnsyncedHistory';
import type { MatchHistoryItem } from '@modules/history/types';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { getDb } from '@infra/firebase';
import { sanitizeForFirestore } from '@shared/utils/sanitize';
import { useOnlineSync } from '@shared/hooks/useOnlineSync';

/** Sync/download/contagem do histórico na nuvem. */
export function useHistoryCloud(authReady: boolean) {
  const { userProfile, matchHistory, matchHistoryRef, persistHistory } = useGame();
  const { setModalConfig } = useUI();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [cloudMatchesCount, setCloudMatchesCount] = useState(0);

  const fetchCloudMatchesCount = useCallback(
    async (_isSilent = false, excludeIds: Set<string> = new Set()) => {
      if (!navigator.onLine) return;
      const db = getDb();
      const cleanEmail = userProfile.email?.toLowerCase().trim();
      if (!db || !cleanEmail) return;
      try {
        setCloudMatchesCount(
          await fetchCloudHistoryCount({
            db,
            ownerEmail: cleanEmail,
            history: matchHistoryRef.current,
            excludeIds,
          }),
        );
      } catch (e) {
        console.warn('[sync] fetchCloudHistoryCount falhou:', e);
      }
    },
    [userProfile.email, matchHistoryRef],
  );

  useEffect(() => {
    if (authReady && userProfile.email) fetchCloudMatchesCount(true);
  }, [authReady, userProfile.email, matchHistory.length, fetchCloudMatchesCount]);

  useEffect(() => {
    if (!authReady || !userProfile.email || !navigator.onLine) return;
    if (cloudMatchesCount === 0) {
      const timer = setTimeout(() => fetchCloudMatchesCount(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [authReady, userProfile.email, cloudMatchesCount, fetchCloudMatchesCount]);

  const syncHistoryToFirebase = useCallback(
    async (forcedHistory?: MatchHistoryItem[], forceAll = false) => {
      if (!navigator.onLine) return;
      const db = getDb();
      const cleanEmail = userProfile.email?.toLowerCase().trim();
      if (!db || !cleanEmail) return;
      const baseList = forcedHistory || [...matchHistoryRef.current];
      const currentList = forceAll
        ? baseList.map((item) => ({ ...item, isSynced: false }))
        : baseList;
      if ((forceAll ? currentList : getUnsyncedHistory(currentList)).length === 0) {
        fetchCloudMatchesCount(true);
        return;
      }
      setIsSyncing(true);
      const safetyTimeout = setTimeout(() => setIsSyncing(false), 15000);
      try {
        const { serverTimestamp } = await import('firebase/firestore');
        const { updatedHistory, syncedCount } = await syncHistoryBatch({
          db,
          history: currentList,
          ownerEmail: cleanEmail,
          ownerPin: userProfile.pin || '',
          forceAll,
          serializeMatch: (match) => {
            const sanitized = sanitizeForFirestore(match);
            if (!sanitized) return null;
            return sanitized;
          },
          syncedAt: serverTimestamp(),
        });
        if (syncedCount === 0) {
          fetchCloudMatchesCount(true);
          return;
        }
        persistHistory(updatedHistory);
        await fetchCloudMatchesCount(true);
      } catch (e) {
        console.warn('[sync] syncHistoryToFirebase falhou:', e);
      } finally {
        clearTimeout(safetyTimeout);
        setIsSyncing(false);
      }
    },
    [userProfile.email, userProfile.pin, fetchCloudMatchesCount, persistHistory, matchHistoryRef],
  );

  useEffect(() => {
    const unsyncedCount = getUnsyncedHistory(matchHistory).length;
    if (unsyncedCount > 0 && userProfile.email && !isSyncing) syncHistoryToFirebase();
  }, [matchHistory.length, userProfile.email, isSyncing, syncHistoryToFirebase, matchHistory]);

  useOnlineSync({
    onOnline: () => {
      const unsynced = getUnsyncedHistory(matchHistoryRef.current);
      if (unsynced.length > 0) syncHistoryToFirebase();
    },
  });

  const downloadHistoryFromFirebase = useCallback(async () => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    setIsDownloading(true);
    try {
      const { updatedHistory, downloadedCount } = await downloadHistoryBatch({
        db,
        ownerEmail: cleanEmail,
        history: matchHistoryRef.current,
      });
      if (downloadedCount > 0) {
        persistHistory(updatedHistory);
      }
      await fetchCloudMatchesCount(true);
    } catch (e) {
      console.warn('[sync] downloadHistoryFromFirebase falhou:', e);
    } finally {
      setIsDownloading(false);
    }
  }, [userProfile.email, persistHistory, fetchCloudMatchesCount, matchHistoryRef]);

  const handleClearAllHistory = useCallback(async () => {
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (navigator.onLine && cleanEmail) {
      setIsSyncing(true);
      const db = getDb();
      try {
        await clearCloudHistory({ db, ownerEmail: cleanEmail });
        persistHistory([]);
        setCloudMatchesCount(0);
        setModalConfig({
          title: 'Sucesso',
          message: 'Todo o histórico foi removido com sucesso.',
          onConfirm: () => setModalConfig(null),
        });
      } catch {
        persistHistory([]);
      } finally {
        setIsSyncing(false);
      }
    } else {
      persistHistory([]);
      setCloudMatchesCount(0);
      setModalConfig({
        title: 'Sucesso',
        message: 'Histórico local removido. Sem internet para limpar a nuvem.',
        onConfirm: () => setModalConfig(null),
      });
    }
  }, [userProfile.email, persistHistory, setModalConfig]);

  const handleImportData = useCallback(
    (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        if (!data.profile && !data.history && !data.settings) throw new Error('Inválido');
        if (data.profile) localStorage.setItem('myPlacarUserProfile', JSON.stringify(data.profile));
        if (data.history) localStorage.setItem('myPlacarHistory', JSON.stringify(data.history));
        if (data.settings) localStorage.setItem('myPlacarSettings', JSON.stringify(data.settings));
        if (data.partners) localStorage.setItem('myPlacarPartners', JSON.stringify(data.partners));

        setModalConfig({
          title: 'Backup restaurado',
          message: 'O aplicativo será reiniciado.',
          onConfirm: () => globalThis.location.reload(),
        });
      } catch {
        setModalConfig({
          title: 'Erro',
          message: 'Falha ao processar arquivo.',
          onConfirm: () => setModalConfig(null),
        });
      }
    },
    [setModalConfig],
  );

  return {
    isSyncing,
    isDownloading,
    cloudMatchesCount,
    fetchCloudMatchesCount,
    syncHistoryToFirebase,
    downloadHistoryFromFirebase,
    handleClearAllHistory,
    handleImportData,
  };
}
