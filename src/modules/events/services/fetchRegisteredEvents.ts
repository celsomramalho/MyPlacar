import type { Firestore } from 'firebase/firestore';
import { fetchUserEventRegistrations } from '@infra/firebase';

export const fetchRegisteredEvents = (db: Firestore, email: string) => {
  return fetchUserEventRegistrations(db, email);
};
