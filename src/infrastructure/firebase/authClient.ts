import { getAuth, type Auth } from 'firebase/auth';
import { getFirebaseApp } from './firebaseApp';

let authInstance: Auth | null = null;

export const getAuthInstance = (): Auth | null => {
  if (authInstance) return authInstance;
  try {
    authInstance = getAuth(getFirebaseApp());
    return authInstance;
  } catch (_e) {
    console.error("Myplacar: Erro ao conectar com auth.");
    return null;
  }
};
