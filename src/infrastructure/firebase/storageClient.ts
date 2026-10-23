import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirebaseApp } from './firebaseApp';

let storageInstance: FirebaseStorage | null = null;

export const getStorageInstance = (): FirebaseStorage | null => {
  if (storageInstance) return storageInstance;
  try {
    storageInstance = getStorage(getFirebaseApp());
    return storageInstance;
  } catch (_e) {
    console.error("Myplacar: Erro ao conectar com storage.");
    return null;
  }
};
