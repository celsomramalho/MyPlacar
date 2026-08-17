import type { Firestore } from 'firebase/firestore';
import { fetchAdminEvents } from '@infra/firebase/adminEvents';
import type { TournamentEvent } from '../types';

export const fetchActiveEvents = async (db: Firestore): Promise<TournamentEvent[]> => {
  try {
    const allEvents = await fetchAdminEvents(db);
    return allEvents.filter((ev) => Boolean(ev.active));
  } catch (error) {
    console.error('Erro ao buscar torneios ativos:', error);
    return [];
  }
};
