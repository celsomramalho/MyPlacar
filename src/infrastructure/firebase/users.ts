import { collection, doc, getDocs, getDocsFromServer, query, setDoc, updateDoc, where, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
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

const normalizeUserPin = (pin: string) => pin.toUpperCase().trim();

const getResolvedNickname = (
  data: { nickname?: string; name?: string; pin?: string },
  fallbackNickname?: string,
) => data.nickname || data.name?.split(' ')[0] || fallbackNickname || data.pin || '';

const getUserAddedAt = (data: DocumentData) => data.createdAt?.toMillis?.() || data.joinedAt || data.addedAt || 0;

const mapUserDocByPin = (
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
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
  const usersQuery = query(collection(db, 'users'), where('pin', '==', normalizedPin));
  const snapshot = await getDocs(usersQuery);

  if (snapshot.empty) {
    return null;
  }

  return mapUserDocByPin(snapshot.docs[0], options);
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

export { getResolvedNickname, getUserAddedAt, normalizeUserPin };
