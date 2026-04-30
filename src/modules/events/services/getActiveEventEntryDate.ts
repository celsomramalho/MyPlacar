import type { Firestore } from 'firebase/firestore';
import { fetchEventEntry } from '@infra/firebase';

export const getActiveEventEntryDate = async (
  db: Firestore,
  eventPin: string,
  email: string,
): Promise<number | null> => {
  const entry = await fetchEventEntry(db, eventPin, email);
  return entry?.joinedAt ?? null;
};
