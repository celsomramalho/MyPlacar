import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

interface FirebaseEventRegistration {
  pin: string;
  name: string;
  joinedAt: number;
  bannerUrl?: string | null;
}

interface FirebaseTournamentEntry {
  email: string;
  name: string;
  nickname: string;
  pin: string;
  joinedAt: number;
  gender?: 'M' | 'F';
  checkedIn?: boolean;
}

interface FirebaseTournamentMatch {
  id: string;
  pair1Id: string;
  pair2Id: string;
  status: 'waiting' | 'live' | 'finished';
  result?: string;
  winnerPairId?: string;
  ownerPin?: string;
  matchId?: string;
}

interface FirebaseTournamentEvent {
  pin: string;
  name: string;
  bannerUrl?: string;
  active: boolean;
  createdAt: number;
  config?: Record<string, unknown>;
  pairs?: unknown[];
  matches?: FirebaseTournamentMatch[];
  coAdminPins?: string[];
}

export const fetchEventByPin = async (db: Firestore, pin: string): Promise<FirebaseTournamentEvent | null> => {
  const snap = await getDoc(doc(db, 'events', pin));
  if (!snap.exists()) return null;
  return { pin: snap.id, ...snap.data() } as FirebaseTournamentEvent;
};

export const subscribeEventByPin = (
  db: Firestore,
  pin: string,
  onEvent: (event: FirebaseTournamentEvent) => void,
): Unsubscribe => {
  return onSnapshot(doc(db, 'events', pin), (snap) => {
    if (snap.exists()) onEvent({ pin: snap.id, ...snap.data() } as FirebaseTournamentEvent);
  });
};

export const fetchEventEntries = async (db: Firestore, eventPin: string): Promise<FirebaseTournamentEntry[]> => {
  const snap = await getDocs(query(collection(db, 'events', eventPin, 'entries')));
  const entries: FirebaseTournamentEntry[] = [];
  const batchToRemove = writeBatch(db);
  let ghostCount = 0;

  for (const entryDoc of snap.docs) {
    const entryData = entryDoc.data() as FirebaseTournamentEntry;
    const userRef = doc(db, 'users', entryData.email);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      entries.push({
        ...entryData,
        name: userData.name,
        nickname: userData.nickname,
      });
    } else {
      batchToRemove.delete(entryDoc.ref);
      ghostCount++;
    }
  }

  if (ghostCount > 0) await batchToRemove.commit();
  return entries;
};

export const fetchEventEntry = async (
  db: Firestore,
  eventPin: string,
  email: string,
): Promise<FirebaseTournamentEntry | null> => {
  const snap = await getDoc(doc(db, 'events', eventPin, 'entries', email.toLowerCase().trim()));
  if (!snap.exists()) return null;
  return snap.data() as FirebaseTournamentEntry;
};

export const fetchUserEventRegistrations = async (
  db: Firestore,
  email: string,
): Promise<FirebaseEventRegistration[]> => {
  const snap = await getDocs(query(collection(db, 'user_registrations', email.toLowerCase().trim(), 'events')));
  const registrations: FirebaseEventRegistration[] = [];
  snap.forEach((registrationDoc) => registrations.push(registrationDoc.data() as FirebaseEventRegistration));
  return registrations.sort((a, b) => b.joinedAt - a.joinedAt);
};

export const saveEventEntry = (
  db: Firestore,
  eventPin: string,
  entry: FirebaseTournamentEntry,
) => setDoc(doc(db, 'events', eventPin, 'entries', entry.email.toLowerCase().trim()), entry);

export const saveUserEventRegistration = (
  db: Firestore,
  email: string,
  eventPin: string,
  registration: FirebaseEventRegistration,
) => setDoc(doc(db, 'user_registrations', email.toLowerCase().trim(), 'events', eventPin), registration);

export const deleteEventEntry = (
  db: Firestore,
  eventPin: string,
  email: string,
) => deleteDoc(doc(db, 'events', eventPin, 'entries', email.toLowerCase().trim()));

export const deleteUserEventRegistration = (
  db: Firestore,
  email: string,
  eventPin: string,
) => deleteDoc(doc(db, 'user_registrations', email.toLowerCase().trim(), 'events', eventPin));

export const updateEventEntry = (
  db: Firestore,
  eventPin: string,
  email: string,
  data: Partial<FirebaseTournamentEntry>,
) => updateDoc(doc(db, 'events', eventPin, 'entries', email.toLowerCase().trim()), data);

export const updateEvent = (
  db: Firestore,
  eventPin: string,
  data: Partial<FirebaseTournamentEvent>,
) => updateDoc(doc(db, 'events', eventPin), data);

export const updateEventMatches = (
  db: Firestore,
  eventPin: string,
  matches: FirebaseTournamentMatch[],
) => updateDoc(doc(db, 'events', eventPin), { matches });
