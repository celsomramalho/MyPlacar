import { collection, deleteDoc, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import type { TournamentEvent } from '@modules/events/types';

export type FirebaseAdminTournamentEvent = TournamentEvent;

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
) => setDoc(doc(db, 'events', event.pin), {
  ...event,
  createdAt: event.createdAt || Date.now(),
}, { merge: true });

export const deleteAdminEvent = (
  db: Firestore,
  eventPin: string,
) => deleteDoc(doc(db, 'events', eventPin));
