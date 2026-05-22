import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { ErrorSoundType, VoiceCommands } from '../../types';

export interface FirebaseSystemConfig {
  appUrl?: string;
  appVersion?: string;
  buckets?: string[];
  errorSoundType?: ErrorSoundType;
  goldenRuleEnabled?: boolean;
  voiceCommands?: VoiceCommands;
}

const SYSTEM_CONFIG_COLLECTION = 'system';
const SYSTEM_CONFIG_DOCUMENT = 'config';

const getSystemConfigRef = (db: Firestore) => doc(db, SYSTEM_CONFIG_COLLECTION, SYSTEM_CONFIG_DOCUMENT);

export const fetchSystemConfig = async (db: Firestore): Promise<FirebaseSystemConfig | null> => {
  const snapshot = await getDoc(getSystemConfigRef(db));
  if (!snapshot.exists()) return null;
  return snapshot.data() as FirebaseSystemConfig;
};

export const saveSystemConfigPatch = (
  db: Firestore,
  patch: FirebaseSystemConfig,
) => setDoc(getSystemConfigRef(db), patch, { merge: true });
