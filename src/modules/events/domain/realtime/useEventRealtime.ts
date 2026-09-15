import { useState, useEffect, useCallback } from 'react';
import type { Firestore } from 'firebase/firestore';
import { getDb } from '@infra/firebase';
import {
  subscribeEventByPin,
  subscribeEventEntries,
  subscribeTournamentLiveScores,
  fetchEventEntries,
  ensureEventEntriesRegistrationIds,
  type FirebaseTournamentLiveScore,
} from '@infra/firebase';
import type { TournamentEvent, TournamentEntry } from '../../types';

export interface UseEventRealtimeResult {
  event: TournamentEvent;
  setEvent: React.Dispatch<React.SetStateAction<TournamentEvent>>;
  entries: TournamentEntry[];
  setEntries: React.Dispatch<React.SetStateAction<TournamentEntry[]>>;
  liveScores: Record<string, FirebaseTournamentLiveScore>;
  isLoadingEntries: boolean;
  refreshEntries: () => Promise<void>;
}

/**
 * Hook centralizado de sincronização em tempo real para um evento, suas inscrições e placares ao vivo.
 */
export function useEventRealtime(initialEvent: TournamentEvent): UseEventRealtimeResult {
  const [event, setEvent] = useState<TournamentEvent>(initialEvent);
  const [entries, setEntries] = useState<TournamentEntry[]>(initialEvent.entries || []);
  const [liveScores, setLiveScores] = useState<Record<string, FirebaseTournamentLiveScore>>({});
  const [isLoadingEntries, setIsLoadingEntries] = useState<boolean>(false);

  // Sincroniza dados gerais do evento
  useEffect(() => {
    const db = getDb();
    if (!db || !initialEvent.pin) return;

    const unsubscribe = subscribeEventByPin(db as Firestore, initialEvent.pin, (nextEvent) => {
      if (nextEvent) {
        setEvent((prev) => ({
          ...prev,
          ...(nextEvent as TournamentEvent),
        }));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [initialEvent.pin]);

  // Sincroniza placares ao vivo
  useEffect(() => {
    const db = getDb();
    if (!db || !event.pin) return;

    const unsubscribe = subscribeTournamentLiveScores(db as Firestore, event.pin, setLiveScores);

    return () => {
      unsubscribe();
    };
  }, [event.pin]);

  // Sincroniza lista de participantes inscritos em tempo real
  useEffect(() => {
    const db = getDb();
    if (!db || !event.pin) return;

    const unsubscribe = subscribeEventEntries(db as Firestore, event.pin, (liveEntries) => {
      void ensureEventEntriesRegistrationIds(db as Firestore, event.pin, liveEntries).then((withIds) => {
        setEntries(withIds as TournamentEntry[]);
      });
    });

    return () => {
      unsubscribe();
    };
  }, [event.pin]);

  // Recarrega manualmente os participantes
  const refreshEntries = useCallback(async () => {
    const db = getDb();
    if (!db || !event.pin) return;
    setIsLoadingEntries(true);
    try {
      const list = await fetchEventEntries(db as Firestore, event.pin);
      const withIds = await ensureEventEntriesRegistrationIds(db as Firestore, event.pin, list);
      setEntries(withIds as TournamentEntry[]);
    } catch (e) {
      console.error('Erro ao sincronizar participantes do evento:', e);
    } finally {
      setIsLoadingEntries(false);
    }
  }, [event.pin]);

  return {
    event,
    setEvent,
    entries,
    setEntries,
    liveScores,
    isLoadingEntries,
    refreshEntries,
  };
}
