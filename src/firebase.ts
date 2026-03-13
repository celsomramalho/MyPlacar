import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyADlTazVqqT6vyI-SBmG_PKI2jvdzAYhMg",
  authDomain: "myplacar-b4ccc.firebaseapp.com",
  projectId: "myplacar-b4ccc",
  storageBucket: "myplacar-b4ccc.firebasestorage.app",
  messagingSenderId: "244305581318",
  appId: "1:244305581318:web:ebd4846ca2509469f03a87"
};

let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let authInstance: Auth | null = null;

const getDb = (): Firestore | null => {
  if (dbInstance) return dbInstance;
  
  try {
    let app: FirebaseApp;
    const apps = getApps();
    
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    // O erro QuotaExceededError no log indica que o firestore estava tentando usar WebStorage (LocalStorage)
    // Isso acontece como fallback quando o IndexedDB não está disponível (ex: em alguns iframes)
    // LocalStorage tem limite de apenas 5MB, o que causa o estouro facilmente.
    try {
      dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        }),
        experimentalForceLongPolling: true
      });
      console.log("Myplacar: Firestore inicializado com cache persistente.");
    } catch (cacheError) {
      console.warn("Myplacar: Falha ao inicializar cache persistente, tentando sem persistência.", cacheError);
      dbInstance = initializeFirestore(app, {
        experimentalForceLongPolling: true
      });
    }
    
    return dbInstance;
  } catch (e: any) {
    console.error("Myplacar: Erro fatal ao inicializar firestore.", e);
    return null;
  }
};

export const clearFirestoreCache = async () => {
  const db = getDb();
  if (db) {
    try {
      await terminate(db);
      // Tenta limpar tanto IndexedDB quanto LocalStorage (fallback do Firestore)
      await clearIndexedDbPersistence(db);
      
      // Limpa chaves do Firestore no LocalStorage manualmente se necessário
      Object.keys(localStorage).forEach(key => {
        if (key.includes('firestore')) localStorage.removeItem(key);
      });
      
      console.log("Myplacar: Cache do firestore limpo com sucesso.");
      window.location.reload();
    } catch (e) {
      console.error("Myplacar: Erro ao limpar cache do firestore.", e);
      // Força reload mesmo com erro
      window.location.reload();
    }
  }
};

const getAuthInstance = (): Auth | null => {
  if (authInstance) return authInstance;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(app);
    return authInstance;
  } catch (e) {
    console.error("Myplacar: Erro ao conectar com auth.");
    return null;
  }
};

const getStorageInstance = (): FirebaseStorage | null => {
  if (storageInstance) return storageInstance;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    storageInstance = getStorage(app);
    return storageInstance;
  } catch (e) {
    console.error("Myplacar: Erro ao conectar com storage.");
    return null;
  }
};

export { getDb, getAuthInstance, getStorageInstance };