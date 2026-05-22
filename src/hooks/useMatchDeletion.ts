import { getDb } from '@infra/firebase/client';
import { deleteCloudMatch, deleteCloudMatches } from '@infra/firebase/matches';
import { deleteSupabaseMatch, deleteSupabaseMatches } from '@infra/supabase';
import { removeHistoryMatches } from '@modules/history/services/removeHistoryMatches';
import type { Firestore } from 'firebase/firestore';
import type { MatchHistoryItem } from '@modules/history/types';
import type { UserProfile } from '@modules/auth/types';
import type { ModalConfig } from '@modules/ui/types';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';

interface UseMatchDeletionParams {
  matchHistoryRef: MutableRefObject<MatchHistoryItem[]>;
  persistHistory: (items: MatchHistoryItem[]) => void;
  setModalConfig: Dispatch<SetStateAction<ModalConfig | null>>;
  userProfile: UserProfile;
}

interface UseMatchDeletionReturn {
  handleDeleteMatch: (id: string) => void;
  handleDeleteManyMatches: (ids: Set<string>) => void;
}

export function useMatchDeletion({
  matchHistoryRef,
  persistHistory,
  setModalConfig,
  userProfile,
}: UseMatchDeletionParams): UseMatchDeletionReturn {

  const handleDeleteMatch = (id: string) => {
    setModalConfig({
      title: 'Excluir partida?',
      message: 'Apagar registro permanentemente?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        persistHistory(removeHistoryMatches(matchHistoryRef.current, [id]));
        setModalConfig(null);
        const db = getDb();
        const cleanEmail = userProfile.email?.toLowerCase().trim();
        if (db && cleanEmail && navigator.onLine) {
          deleteCloudMatch(db as Firestore, id).catch(() => {});
          deleteSupabaseMatch(id);
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  const handleDeleteManyMatches = (ids: Set<string>) => {
    setModalConfig({
      title: `Excluir ${ids.size} partidas?`,
      message: 'Apagar registros permanentemente?',
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => {
        persistHistory(removeHistoryMatches(matchHistoryRef.current, ids));
        setModalConfig(null);
        const db = getDb();
        const cleanEmail = userProfile.email?.toLowerCase().trim();
        if (db && cleanEmail && navigator.onLine) {
          deleteCloudMatches(db as Firestore, ids).catch(() => {});
          deleteSupabaseMatches([...ids]);
        }
      },
      onCancel: () => setModalConfig(null),
    });
  };

  return { handleDeleteMatch, handleDeleteManyMatches };
}
