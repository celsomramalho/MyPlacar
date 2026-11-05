import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type SetOptions,
} from 'firebase/firestore';

export interface FirebaseUserProfile {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  pin: string;
  gender?: 'M' | 'F';
  isProfileComplete: boolean;
  emailVerified?: boolean;
  authMethod?: 'pin' | 'password';
  qrCodeData?: string;
  isAdmin?: boolean;
  planType?: 'free' | 'premium';
  premiumUntil?: string;
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  referredByPin?: string;
  uid?: string;
  mercadoPagoAccessToken?: string;
  mercadoPagoRefreshToken?: string;
  mercadoPagoUserId?: string;
  mercadoPagoConnectedAt?: number;
  mercadoPagoTokenExpiresAt?: number;
}

const normalizeUserEmail = (email: string) => email.toLowerCase().trim();

export const fetchUserProfile = async (
  db: Firestore,
  email: string,
): Promise<FirebaseUserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', normalizeUserEmail(email)));
  if (!snap.exists()) return null;
  return snap.data() as FirebaseUserProfile;
};

export const fetchUserProfileFromServer = async (
  db: Firestore,
  email: string,
): Promise<FirebaseUserProfile | null> => {
  const snap = await getDocFromServer(doc(db, 'users', normalizeUserEmail(email)));
  if (!snap.exists()) return null;
  return snap.data() as FirebaseUserProfile;
};

export const saveUserProfile = (
  db: Firestore,
  email: string,
  profile: FirebaseUserProfile,
  options?: SetOptions,
) => {
  const userRef = doc(db, 'users', normalizeUserEmail(email));
  return options ? setDoc(userRef, profile, options) : setDoc(userRef, profile);
};

export const saveNewUserProfile = (
  db: Firestore,
  email: string,
  profile: FirebaseUserProfile,
) => {
  const normalizedEmail = normalizeUserEmail(email);
  return setDoc(doc(db, 'users', normalizedEmail), {
    ...profile,
    createdAt: serverTimestamp(),
  }).then(async () => {
    try {
      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title: 'Novo Cadastro',
        content: `Novo usuário cadastrado: ${profile.name || profile.nickname || normalizedEmail} (${normalizedEmail}).`,
        authorId: 'system',
        authorName: 'MyPlacar',
        createdAt: Date.now(),
        targetUserId: 'admin',
        targetUserEmail: 'celsomramalho@gmail.com',
        isPinned: false,
        readBy: [],
        notificationType: 'new_user_registration',
      });
    } catch (error) {
      console.warn('Erro ao criar aviso de novo cadastro para o administrador:', error);
    }
  });
};

export const findUserProfileByPasskeyCredentialId = async (
  db: Firestore,
  credentialId: string,
): Promise<FirebaseUserProfile | null> => {
  const usersQuery = query(collection(db, 'users'), where('passkeyCredentialId', '==', credentialId));
  const snapshot = await getDocs(usersQuery);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as FirebaseUserProfile;
};

export { normalizeUserEmail };
