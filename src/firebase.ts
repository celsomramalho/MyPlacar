import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCV5E7vvTw4W8sYi0bOb633yZF02ZLjr_M",
  authDomain: "myplacar-b4ccc.firebaseapp.com",
  projectId: "myplacar-b4ccc", 
  storageBucket: "myplacar-b4ccc.firebasestorage.app",
  messagingSenderId: "244305581318",
  appId: "1:244305581318:android:323af0d4b306b6c5f03a87"
};

let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

export const getDb = (): Firestore | null => {
  if (dbInstance) return dbInstance;
  
  try {
    let app: FirebaseApp;
    const apps = getApps();
    
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    // Inicializa com cache persistente para suporte offline aprimorado
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
    
    console.log("MyPlacar: Firestore inicializado com cache persistente.");
    return dbInstance;
  } catch (e: any) {
    console.error("MyPlacar: Erro ao inicializar Firestore.");
    return null;
  }
};

export const getStorageInstance = (): FirebaseStorage | null => {
  if (storageInstance) return storageInstance;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    storageInstance = getStorage(app);
    return storageInstance;
  } catch (e) {
    console.error("MyPlacar: Erro ao conectar com Storage.");
    return null;
  }
};