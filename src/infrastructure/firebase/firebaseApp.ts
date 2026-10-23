import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyADlTazVqqT6vyI-SBmG_PKI2jvdzAYhMg",
  authDomain: "myplacar-b4ccc.firebaseapp.com",
  projectId: "myplacar-b4ccc",
  storageBucket: "myplacar-b4ccc.firebasestorage.app",
  messagingSenderId: "244305581318",
  appId: "1:244305581318:web:ebd4846ca2509469f03a87"
};

let appInstance: FirebaseApp | null = null;

export const getFirebaseApp = (): FirebaseApp => {
  if (appInstance) return appInstance;
  appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  return appInstance;
};
