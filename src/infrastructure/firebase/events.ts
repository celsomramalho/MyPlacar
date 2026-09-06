import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { minifyPairForStorage, type TournamentPair } from '@modules/events/types';

interface FirebaseEventRegistration {
  pin: string;
  name: string;
  joinedAt: number;
  bannerUrl?: string | null;
}

interface FirebaseTournamentEntry {
  registrationId?: number;
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
  paymentStatus?: 'Pendente' | 'Confirmado' | 'Pago' | 'Isento';
  payments?: Array<{ id: string; amount: number; date: number; receiptUrl?: string; receiptName?: string }>;
  phone: string;
  shirtSize: 'P' | 'M' | 'G';
  partnerName?: string;
  partnerEmail?: string;
  partnerPhone?: string;
  categoryPartners?: Record<string, { name: string; email: string; phone: string }>;
  information?: string;
}

export interface FirebaseTournamentMatch {
  id: string;
  pair1Id?: string;
  pair2Id?: string;
  status: 'waiting' | 'live' | 'finished';
  result?: string;
  winnerPairId?: string;
  ownerPin?: string;
  matchId?: string;
  round?: number;
  stage?: string;
  categoryId?: string;
}

export interface FirebaseTournamentEvent {
  pin: string;
  name: string;
  bannerUrl?: string;
  active: boolean;
  createdAt: number;
  config?: Record<string, unknown>;
  pairs?: unknown[];
  matches?: FirebaseTournamentMatch[];
  interdictedCourts?: string[];
  coAdminPins?: string[];
  regulationUrl?: string;
  regulationFileName?: string;
  information?: string;
  eventType?: string;
  setsCount?: number;
  gamesPerSet?: number;
  teamDrawType?: string;
  bracketDrawType?: string;
  matchDrawType?: string;
  rankingMatchesPerTeam?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return undefined as any;
  if (value === null) return null as any;

  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value.map(sanitizeForFirestore).filter((v) => v !== undefined) as any;
  }

  if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined && typeof v !== 'function') {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }

  return value;
}

export const fetchEventByPin = async (db: Firestore, pin: string): Promise<FirebaseTournamentEvent | null> => {
  const snap = await getDoc(doc(db, 'events', pin));
  if (!snap.exists()) return null;
  return { pin: snap.id, ...snap.data() } as FirebaseTournamentEvent;
};

export const fetchEventByPinFromServer = async (db: Firestore, pin: string): Promise<FirebaseTournamentEvent | null> => {
  const snap = await getDocFromServer(doc(db, 'events', pin));
  if (!snap.exists()) return null;
  return { pin: snap.id, ...snap.data() } as FirebaseTournamentEvent;
};

export const subscribeEventByPin = (
  db: Firestore,
  pin: string,
  onEvent: (event: FirebaseTournamentEvent) => void,
): Unsubscribe => {
  return onSnapshot(
    doc(db, 'events', pin),
    (snap) => {
      if (snap.exists()) onEvent({ pin: snap.id, ...snap.data() } as FirebaseTournamentEvent);
    },
    (error) => {
      console.warn('subscribeEventByPin listener error (fallback to fetch):', error);
      fetchEventByPin(db, pin).then((ev) => ev && onEvent(ev)).catch(() => {});
    }
  );
};

export const subscribeEventEntries = (
  db: Firestore,
  eventPin: string,
  onEntries: (entries: FirebaseTournamentEntry[]) => void,
): Unsubscribe => {
  // Usar metadata.hasPendingWrites + fromCache para distinguir snapshot real de cache
  return onSnapshot(
    collection(db, 'events', eventPin, 'entries'),
    { includeMetadataChanges: false },
    (snap) => {
      const list: FirebaseTournamentEntry[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as FirebaseTournamentEntry);
      });
      // Honrar lista vazia: se a subcoleção não tem documentos, a lista real é vazia
      onEntries(list);
    },
    (error) => {
      console.warn('subscribeEventEntries listener error (fallback to fetch):', error);
      fetchEventEntries(db, eventPin).then(onEntries).catch(() => {});
    }
  );
};

export const fetchEventEntries = async (db: Firestore, eventPin: string): Promise<FirebaseTournamentEntry[]> => {
  const entries: FirebaseTournamentEntry[] = [];
  try {
    // Usa getDocsFromServer para garantir dados frescos do servidor, sem cache local
    const snap = await getDocsFromServer(query(collection(db, 'events', eventPin, 'entries')));
    for (const entryDoc of snap.docs) {
      const entryData = entryDoc.data() as FirebaseTournamentEntry;
      entries.push(entryData);
    }
  } catch (e) {
    console.warn('fetchEventEntries subcollection warning:', e);
  }

  // Não fazer fallback para data.entries[] ou data.pairs do doc raiz:
  // esses dados podem estar desatualizados e ressuscitariam participantes já deletados.
  // A subcoleção /events/{pin}/entries é a fonte de verdade.
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
  const cleanEmail = email.toLowerCase().trim();
  const snap = await getDocs(query(collection(db, 'user_registrations', cleanEmail, 'events')));
  const registrations: FirebaseEventRegistration[] = [];
  const registeredPins = new Set<string>();

  snap.forEach((registrationDoc) => {
    const reg = registrationDoc.data() as FirebaseEventRegistration;
    registrations.push(reg);
    registeredPins.add(reg.pin);
  });

  // Reconciliação: se o usuário foi inscrito manualmente pelo admin, busca os eventos e reconhece a inscrição
  try {
    const eventsSnap = await getDocs(query(collection(db, 'events')));
    for (const eventDoc of eventsSnap.docs) {
      const eventPin = eventDoc.id;
      if (registeredPins.has(eventPin)) continue;

      const entrySnap = await getDoc(doc(db, 'events', eventPin, 'entries', cleanEmail));
      if (entrySnap.exists()) {
        const entryData = entrySnap.data() as FirebaseTournamentEntry;
        const eventData = eventDoc.data() as FirebaseTournamentEvent;
        const autoReg: FirebaseEventRegistration = {
          pin: eventPin,
          name: eventData.name || eventPin,
          joinedAt: entryData.joinedAt || Date.now(),
          bannerUrl: eventData.bannerUrl || null,
        };
        registrations.push(autoReg);
        registeredPins.add(eventPin);

        // Salva na subcoleção do usuário para agilizar próximas consultas
        try {
          await saveUserEventRegistration(db, cleanEmail, eventPin, autoReg);
        } catch {}
      }
    }
  } catch (err) {
    console.warn('Reconciliação de inscrições:', err);
  }

  return registrations.sort((a, b) => b.joinedAt - a.joinedAt);
};

export const saveEventEntry = (
  db: Firestore,
  eventPin: string,
  entry: FirebaseTournamentEntry,
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(entry)));
  return setDoc(doc(db, 'events', eventPin, 'entries', entry.email.toLowerCase().trim()), sanitized);
};

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
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(entry)));
  try {
    await saveEventEntry(db, eventPin, sanitized);
    return;
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    const isPermissionError = firebaseErr?.code === 'permission-denied' || firebaseErr?.message?.includes('Missing or insufficient permissions');
    if (!isPermissionError || !adminEmail) throw err;

    const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
    const response = await fetch(`${baseUrl}/api/admin-save-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventPin, entry: sanitized, adminEmail }),
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
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(registration)));
  return setDoc(doc(db, 'user_registrations', email.toLowerCase().trim(), 'events', eventPin), sanitized);
};

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
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(data)));
  return updateDoc(doc(db, 'events', eventPin, 'entries', email.toLowerCase().trim()), sanitized);
};

export const updateEvent = async (
  db: Firestore,
  eventPin: string,
  data: Partial<FirebaseTournamentEvent>,
) => {
  const toSave = { ...data };
  if (Array.isArray(toSave.pairs)) {
    toSave.pairs = (toSave.pairs as TournamentPair[]).map(minifyPairForStorage);
  }
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(toSave)));
  try {
    return await updateDoc(doc(db, 'events', eventPin), {
      ...sanitized,
      entries: deleteField(),
    });
  } catch (_e) {
    return await updateDoc(doc(db, 'events', eventPin), sanitized);
  }
};

export const updateEventMatches = (
  db: Firestore,
  eventPin: string,
  matches: FirebaseTournamentMatch[],
) => updateDoc(doc(db, 'events', eventPin), { matches: sanitizeForFirestore(JSON.parse(JSON.stringify(matches))) });

/**
 * Garante que todas as inscrições existentes de um evento tenham Inscrição_ID sequencial único.
 * Para inscrições que ainda não possuem Inscrição_ID (ex: os 16 inscritos legados), atribui
 * automaticamente em ordem cronológica de inscrição (joinedAt) e persiste no Firestore.
 */
export const ensureEventEntriesRegistrationIds = async (
  db: Firestore,
  eventPin: string,
  entries: FirebaseTournamentEntry[],
): Promise<FirebaseTournamentEntry[]> => {
  if (!entries || entries.length === 0) return entries;

  let hasChanges = false;
  // Ordena por joinedAt para manter a ordem cronológica de inscrição
  const sorted = [...entries].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

  const existingIds = new Set<number>(
    sorted
      .map((e) => Number(e.registrationId))
      .filter((n) => !isNaN(n) && n > 0)
  );

  let nextSeq = 1;
  const getNextAvailableId = () => {
    while (existingIds.has(nextSeq)) {
      nextSeq++;
    }
    existingIds.add(nextSeq);
    return nextSeq;
  };

  const updatedEntries = sorted.map((entry) => {
    if (!entry.registrationId || isNaN(Number(entry.registrationId)) || Number(entry.registrationId) <= 0) {
      hasChanges = true;
      const assignedId = getNextAvailableId();
      return { ...entry, registrationId: assignedId };
    }
    return entry;
  });

  if (hasChanges && db && eventPin) {
    for (const entry of updatedEntries) {
      const original = entries.find((e) => e.email === entry.email);
      if (!original?.registrationId && entry.registrationId && entry.email) {
        try {
          void updateEventEntry(db, eventPin, entry.email, { registrationId: entry.registrationId });
        } catch (err) {
          console.warn('Erro ao auto-atribuir Inscrição_ID para', entry.email, err);
        }
      }
    }
  }

  return updatedEntries;
};
