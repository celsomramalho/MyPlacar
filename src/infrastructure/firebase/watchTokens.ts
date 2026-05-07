import {
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

export interface FirebaseWatchLoginToken {
  code: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: number;
  createdAt: number;
  email?: string;
  pin?: string;
  rememberMe?: boolean;
  profile?: unknown;
}

const getWatchTokenRef = (db: Firestore, code: string) => doc(db, 'watch_tokens', code);

export const createWatchLoginToken = (
  db: Firestore,
  code: string,
  expiresAt: number,
) => setDoc(getWatchTokenRef(db, code), {
  code,
  status: 'pending',
  expiresAt,
  createdAt: Date.now(),
});

export const subscribeWatchLoginToken = (
  db: Firestore,
  code: string,
  onToken: (token: FirebaseWatchLoginToken | null) => void | Promise<void>,
): Unsubscribe => {
  return onSnapshot(getWatchTokenRef(db, code), (snap) => {
    void onToken(snap.exists() ? snap.data() as FirebaseWatchLoginToken : null);
  });
};

export const deleteWatchLoginToken = (
  db: Firestore,
  code: string,
) => deleteDoc(getWatchTokenRef(db, code));
