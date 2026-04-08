import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore/lite';

const firebaseConfig = {
  apiKey: "AIzaSyADlTazVqqT6vyI-SBmG_PKI2jvdzAYhMg",
  authDomain: "myplacar-b4ccc.firebaseapp.com",
  projectId: "myplacar-b4ccc",
  storageBucket: "myplacar-b4ccc.firebasestorage.app",
  messagingSenderId: "244305581318",
  appId: "1:244305581318:web:ebd4846ca2509469f03a87"
};

let dbLiteInstance: Firestore | null = null;

export const getDbLite = (): Firestore | null => {
  if (dbLiteInstance) return dbLiteInstance;
  
  try {
    let app: FirebaseApp;
    const apps = getApps();
    
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    dbLiteInstance = getFirestore(app);
    console.log("MyPlacar: Firestore lite inicializado com sucesso.");
    return dbLiteInstance;
  } catch (e: any) {
    console.error("MyPlacar: Erro ao conectar com Firestore lite.");
    return null;
  }
};