import { collection, getDocs, query, where, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';

export interface FirebaseUserByPin {
  id: string;
  pin: string;
  name?: string;
  nickname: string;
  gender?: 'M' | 'F';
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

const mapUserDocByPin = (
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
  options?: FirebaseUserLookupOptions,
): FirebaseUserByPin => {
  const data = docSnapshot.data();
  const pin = normalizeUserPin(data.pin || docSnapshot.id);

  return {
    id: docSnapshot.id,
    pin,
    name: data.name,
    nickname: getResolvedNickname({ nickname: data.nickname, name: data.name, pin }, options?.fallbackNickname),
    gender: data.gender,
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

export { getResolvedNickname, normalizeUserPin };
