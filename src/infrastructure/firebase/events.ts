import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
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
  categoryIds?: string[];
  dueAmount?: number;
  paidAmount?: number;
  paymentStatus?: 'Pendente' | 'Pago' | 'Isento';
  payments?: Array<{ id: string; amount: number; date: number; receiptUrl?: string; receiptName?: string }>;
  phone: string;
  shirtSize: 'P' | 'M' | 'G';
  partnerName?: string;
  partnerEmail?: string;
  information?: string;
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
  regulationUrl?: string;
  regulationFileName?: string;
  information?: string;
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

export const subscribeEventEntries = (
  db: Firestore,
  eventPin: string,
  onEntries: (entries: FirebaseTournamentEntry[]) => void,
): Unsubscribe => {
  return onSnapshot(collection(db, 'events', eventPin, 'entries'), (snap) => {
    const list: FirebaseTournamentEntry[] = [];
    snap.forEach((docSnap) => {
      list.push(docSnap.data() as FirebaseTournamentEntry);
    });
    onEntries(list);
  });
};

export const fetchEventEntries = async (db: Firestore, eventPin: string): Promise<FirebaseTournamentEntry[]> => {
  const snap = await getDocsFromServer(query(collection(db, 'events', eventPin, 'entries')));
  const entries: FirebaseTournamentEntry[] = [];

  for (const entryDoc of snap.docs) {
    const entryData = entryDoc.data() as FirebaseTournamentEntry;
    const userRef = doc(db, 'users', entryData.email);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      entries.push({
        ...entryData,
        name: userData.name || entryData.name,
        nickname: userData.nickname || entryData.nickname,
      });
    } else {
      // Usuário não existe em 'users' (inscrição manual ou temporária) — manter a entrada com seus próprios dados
      entries.push(entryData);
    }
  }

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

/**
 * Salva uma inscrição feita pelo painel administrativo. Em instalações onde
 * a sessão Firebase ainda não recebeu o claim de administrador, usa o mesmo
 * fallback server-side do salvamento do evento.
 */
export const saveAdminEventEntry = async (
  db: Firestore,
  eventPin: string,
  entry: FirebaseTournamentEntry,
  adminEmail?: string,
) => {
  try {
    await saveEventEntry(db, eventPin, entry);
    return;
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    const isPermissionError = firebaseErr?.code === 'permission-denied' || firebaseErr?.message?.includes('Missing or insufficient permissions');
    if (!isPermissionError || !adminEmail) throw err;

    const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
    const response = await fetch(`${baseUrl}/api/admin-save-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventPin, entry, adminEmail }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Não foi possível salvar a inscrição no servidor.');
    }
  }
};

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
