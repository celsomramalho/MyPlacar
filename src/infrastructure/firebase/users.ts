import { Timestamp, collection, doc, getCountFromServer, getDoc, getDocs, getDocsFromServer, orderBy, query, setDoc, updateDoc, where, writeBatch, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { PlanType, UserProfile } from '@modules/auth/types';

export interface FirebaseUserByPin {
  id: string;
  pin: string;
  email?: string;
  name?: string;
  nickname: string;
  gender?: 'M' | 'F';
  phone?: string;
  shirtSize?: 'P' | 'M' | 'G';
}

export interface FirebaseReferredUser extends FirebaseUserByPin {
  addedAt: number;
}

interface FirebaseUserLookupOptions {
  fallbackNickname?: string;
}

const USERS_BATCH_LIMIT = 30;

export const countUserProfiles = async (db: Firestore): Promise<number> => {
  const snapshot = await getCountFromServer(collection(db, 'users'));
  return snapshot.data().count;
};

const normalizeUserPin = (pin: string) => pin.toUpperCase().trim();

const getResolvedNickname = (
  data: { nickname?: string; name?: string; pin?: string },
  fallbackNickname?: string,
) => data.nickname || data.name?.split(' ')[0] || fallbackNickname || data.pin || '';

const getUserAddedAt = (data: DocumentData) => data.createdAt?.toMillis?.() || data.joinedAt || data.addedAt || 0;

const mapUserDocByPin = (
  docSnapshot: QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData },
  options?: FirebaseUserLookupOptions,
): FirebaseUserByPin => {
  const data = docSnapshot.data();
  const pin = normalizeUserPin(data.pin || docSnapshot.id);
  const email = data.email || (docSnapshot.id.includes('@') ? docSnapshot.id : undefined);

  return {
    id: docSnapshot.id,
    pin,
    email,
    name: data.name,
    nickname: getResolvedNickname({ nickname: data.nickname, name: data.name, pin }, options?.fallbackNickname),
    gender: data.gender,
    phone: data.phone,
    shirtSize: data.shirtSize,
  };
};

export const findUserByPin = async (
  db: Firestore,
  pin: string,
  options?: FirebaseUserLookupOptions,
): Promise<FirebaseUserByPin | null> => {
  const normalizedPin = normalizeUserPin(pin);
  if (!normalizedPin) return null;
  const usersQuery = query(collection(db, 'users'), where('pin', '==', normalizedPin));
  const snapshot = await getDocs(usersQuery);

  if (snapshot.empty) {
    return null;
  }

  return mapUserDocByPin(snapshot.docs[0], options);
};

export const findUserByEmail = async (
  db: Firestore,
  email: string,
  options?: FirebaseUserLookupOptions,
): Promise<FirebaseUserByPin | null> => {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return null;

  try {
    const userDocRef = doc(db, 'users', normalizedEmail);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      return mapUserDocByPin(userSnap, options);
    }
  } catch {
    // Continua para query
  }

  const usersQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail));
  const snapshot = await getDocs(usersQuery);

  if (snapshot.empty) {
    return null;
  }

  return mapUserDocByPin(snapshot.docs[0], options);
};

export const findUserByPinOrEmail = async (
  db: Firestore,
  term: string,
  options?: FirebaseUserLookupOptions,
): Promise<FirebaseUserByPin | null> => {
  const clean = term.trim();
  if (!clean) return null;

  if (clean.includes('@')) {
    return findUserByEmail(db, clean, options);
  }

  const userByPin = await findUserByPin(db, clean, options);
  if (userByPin) return userByPin;

  // Tenta por email caso não tenha @ mas seja email ou doc ID
  return findUserByEmail(db, clean, options);
};

export const findUsersByPins = async (
  db: Firestore,
  pins: string[],
  options?: FirebaseUserLookupOptions,
): Promise<Map<string, FirebaseUserByPin>> => {
  const normalizedPins = Array.from(
    new Set(
      pins
        .map(pin => normalizeUserPin(pin))
        .filter(Boolean),
    ),
  );

  const usersByPin = new Map<string, FirebaseUserByPin>();

  for (let index = 0; index < normalizedPins.length; index += USERS_BATCH_LIMIT) {
    const chunk = normalizedPins.slice(index, index + USERS_BATCH_LIMIT);
    if (chunk.length === 0) continue;

    const usersQuery = query(collection(db, 'users'), where('pin', 'in', chunk));
    const snapshot = await getDocs(usersQuery);

    snapshot.forEach(docSnapshot => {
      const user = mapUserDocByPin(docSnapshot, options);
      usersByPin.set(user.pin, user);
    });
  }

  return usersByPin;
};

export const findUsersReferredByPin = async (
  db: Firestore,
  pin: string,
  options?: FirebaseUserLookupOptions,
): Promise<FirebaseReferredUser[]> => {
  const normalizedPin = normalizeUserPin(pin);
  const usersQuery = query(collection(db, 'users'), where('referredByPin', '==', normalizedPin));
  const snapshot = await getDocsFromServer(usersQuery);
  const referredUsersByPin = new Map<string, FirebaseReferredUser>();

  snapshot.docs.forEach(docSnapshot => {
    const user = mapUserDocByPin(docSnapshot, options);
    const userPin = normalizeUserPin(user.pin);

    // Um usuário não deve contar como indicado de si mesmo.
    if (!userPin || userPin === normalizedPin) {
      return;
    }

    referredUsersByPin.set(userPin, {
      ...user,
      addedAt: getUserAddedAt(docSnapshot.data()),
    });
  });

  return Array.from(referredUsersByPin.values());
};

export const updateUserProfileFields = (
  db: Firestore,
  email: string,
  data: {
    authMethod?: 'pin' | 'password';
    gender?: 'M' | 'F';
    nickname?: string;
    passkeyCredentialId?: string;
    passkeyPublicKey?: string;
  },
) => updateDoc(doc(db, 'users', email.toLowerCase().trim()), data);

export const searchUserProfilesByEmailPrefix = async (
  db: Firestore,
  emailPrefix: string,
): Promise<UserProfile[]> => {
  const normalizedPrefix = emailPrefix.toLowerCase().trim();
  if (!normalizedPrefix) return [];

  const usersQuery = query(
    collection(db, 'users'),
    where('email', '>=', normalizedPrefix),
    where('email', '<=', `${normalizedPrefix}\uf8ff`),
  );
  const snapshot = await getDocs(usersQuery);

  return snapshot.docs.map(docSnapshot => docSnapshot.data() as UserProfile);
};

export const updateUserPlanType = (
  db: Firestore,
  email: string,
  planType: PlanType,
) => setDoc(doc(db, 'users', email), { planType }, { merge: true });

export interface FirebaseUserWithCreatedAt extends FirebaseUserByPin {
  createdAt: number; // milliseconds since epoch
}

export const fetchUsersByDateRange = async (
  db: Firestore,
  from: Date,
  to: Date,
): Promise<FirebaseUserWithCreatedAt[]> => {
  const fromMs = from.getTime();
  const toMs = to.getTime();

  const snapshot = await getDocsFromServer(collection(db, 'users'));
  const results: FirebaseUserWithCreatedAt[] = [];

  snapshot.docs.forEach(docSnapshot => {
    const data = docSnapshot.data();
    let userDateMs = 0;

    if (data.createdAt?.toMillis) {
      userDateMs = data.createdAt.toMillis();
    } else if (typeof data.createdAt === 'number') {
      userDateMs = data.createdAt;
    } else if (typeof data.createdAt === 'string') {
      const parsed = Date.parse(data.createdAt);
      if (!isNaN(parsed)) userDateMs = parsed;
    } else if (data.updatedAt?.toMillis) {
      userDateMs = data.updatedAt.toMillis();
    } else if (typeof data.updatedAt === 'number') {
      userDateMs = data.updatedAt;
    } else if (typeof data.updatedAt === 'string') {
      const parsed = Date.parse(data.updatedAt);
      if (!isNaN(parsed)) userDateMs = parsed;
    } else {
      userDateMs = getUserAddedAt(data);
    }

    if (userDateMs >= fromMs && userDateMs <= toMs) {
      const user = mapUserDocByPin(docSnapshot);
      results.push({
        ...user,
        createdAt: userDateMs,
      });
    }
  });

  return results.sort((a, b) => b.createdAt - a.createdAt);
};

export interface MigrationResult {
  total: number;
  migrated: number;
  alreadyTimestamp: number;
  errors: number;
}

export const migrateUsersCreatedAtToTimestamp = async (
  db: Firestore,
): Promise<MigrationResult> => {
  console.log('[migrateUsers] Iniciando varredura da coleção users no Firestore...');
  const snapshot = await getDocsFromServer(collection(db, 'users'));
  console.log(`[migrateUsers] ${snapshot.size} documentos de usuários obtidos.`);
  let migrated = 0;
  let alreadyTimestamp = 0;
  let skipped = 0;

  const updates: { ref: any; timestamp: Timestamp; id: string; oldVal: unknown }[] = [];

  snapshot.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    const rawCreatedAt = data.createdAt;

    // Se já é Timestamp do Firestore
    if (rawCreatedAt instanceof Timestamp || (rawCreatedAt && typeof rawCreatedAt.toMillis === 'function')) {
      alreadyTimestamp++;
      return;
    }

    let parsedMs: number | null = null;

    if (typeof rawCreatedAt === 'number' && !isNaN(rawCreatedAt) && rawCreatedAt > 0) {
      parsedMs = rawCreatedAt;
    } else if (typeof rawCreatedAt === 'string') {
      const parsed = Date.parse(rawCreatedAt);
      if (!isNaN(parsed) && parsed > 0) parsedMs = parsed;
    } else if (data.joinedAt) {
      const parsed = typeof data.joinedAt === 'number' ? data.joinedAt : Date.parse(data.joinedAt);
      if (!isNaN(parsed) && parsed > 0) parsedMs = parsed;
    } else if (data.addedAt) {
      const parsed = typeof data.addedAt === 'number' ? data.addedAt : Date.parse(data.addedAt);
      if (!isNaN(parsed) && parsed > 0) parsedMs = parsed;
    } else if (data.updatedAt?.toMillis) {
      parsedMs = data.updatedAt.toMillis();
    } else if (typeof data.updatedAt === 'number' && !isNaN(data.updatedAt) && data.updatedAt > 0) {
      parsedMs = data.updatedAt;
    } else if (typeof data.updatedAt === 'string') {
      const parsed = Date.parse(data.updatedAt);
      if (!isNaN(parsed) && parsed > 0) parsedMs = parsed;
    }

    if (parsedMs && !isNaN(parsedMs) && parsedMs > 0) {
      updates.push({
        ref: docSnapshot.ref,
        timestamp: Timestamp.fromMillis(parsedMs),
        id: docSnapshot.id,
        oldVal: rawCreatedAt ?? data.joinedAt ?? data.addedAt,
      });
    } else {
      console.warn(`[migrateUsers] Usuário ${docSnapshot.id} sem data identificável:`, data);
      skipped++;
    }
  });

  console.log(`[migrateUsers] Análise: ${alreadyTimestamp} já são Timestamp, ${updates.length} para atualizar, ${skipped} sem data.`);

  const BATCH_SIZE = 400;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = updates.slice(i, i + BATCH_SIZE);
    chunk.forEach((u) => {
      console.log(`[migrateUsers] Atualizando ${u.id}:`, u.oldVal, '->', u.timestamp.toDate().toISOString());
      batch.update(u.ref, { createdAt: u.timestamp });
    });
    await batch.commit();
    migrated += chunk.length;
  }

  console.log(`[migrateUsers] Finalizado: ${migrated} migrados com sucesso.`);
  return {
    total: snapshot.size,
    migrated,
    alreadyTimestamp,
    errors: skipped,
  };
};

export { getResolvedNickname, getUserAddedAt, normalizeUserPin };
