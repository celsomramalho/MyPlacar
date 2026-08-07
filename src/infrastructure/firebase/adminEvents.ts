import { collection, deleteDoc, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import type { TournamentEvent } from '@modules/events/types';

export type FirebaseAdminTournamentEvent = TournamentEvent;

/**
 * Remove recursivamente campos `undefined` de um objeto antes de salvar no Firestore.
 * O Firestore não aceita valores `undefined` e lança erro ao encontrá-los.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value.map(sanitizeForFirestore) as any;
  }
  if (value !== null && typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

export const fetchAdminEvents = async (db: Firestore): Promise<FirebaseAdminTournamentEvent[]> => {
  const snapshot = await getDocs(collection(db, 'events'));
  const events: FirebaseAdminTournamentEvent[] = [];

  snapshot.forEach(docSnapshot => {
    events.push({ pin: docSnapshot.id, ...docSnapshot.data() } as FirebaseAdminTournamentEvent);
  });

  return events;
};

export const saveAdminEvent = (
  db: Firestore,
  event: FirebaseAdminTournamentEvent,
) => {
  const sanitized = sanitizeForFirestore({
    ...event,
    createdAt: event.createdAt || Date.now(),
  });
  return setDoc(doc(db, 'events', event.pin), sanitized, { merge: true });
};

export const deleteAdminEvent = (
  db: Firestore,
  eventPin: string,
) => deleteDoc(doc(db, 'events', eventPin));

