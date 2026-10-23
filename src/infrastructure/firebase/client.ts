import {
  clearIndexedDbPersistence,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseApp } from './firebaseApp';

let dbInstance: Firestore | null = null;

const getDb = (): Firestore | null => {
  if (dbInstance) return dbInstance;

  try {
    const app = getFirebaseApp();

    // O erro QuotaExceededError no log indica que o firestore estava tentando usar WebStorage (LocalStorage)
    // Isso acontece como fallback quando o IndexedDB não está disponível (ex: em alguns iframes)
    // LocalStorage tem limite de apenas 5MB, o que causa o estouro facilmente.
    try {
      // Tentativa 1: cache persistente com múltiplas abas (ideal para PWA)
      dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        }),
        experimentalAutoDetectLongPolling: true
      });
      console.log("Myplacar: Firestore inicializado com cache persistente.");
    } catch (cacheError) {
      console.warn("Myplacar: Falha no cache persistente, tentando cache simples.", cacheError);
      try {
        // Tentativa 2: cache persistente sem múltiplas abas (funciona em Safari/privado)
        dbInstance = initializeFirestore(app, {
          localCache: persistentLocalCache(),
          experimentalAutoDetectLongPolling: true
        });
        console.log("Myplacar: Firestore inicializado com cache simples.");
      } catch (simpleCacheError) {
        console.warn("Myplacar: Falha no cache simples, usando memória (sem persistência).", simpleCacheError);
        // Tentativa 3: memória pura — garante que o app funciona offline sem IndexedDB
        dbInstance = initializeFirestore(app, {
          localCache: memoryLocalCache(),
          experimentalAutoDetectLongPolling: true
        });
        console.log("Myplacar: Firestore inicializado em memória.");
      }
    }

    return dbInstance;
  } catch (e: unknown) {
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
      globalThis.location.reload();
    } catch (e) {
      console.error("Myplacar: Erro ao limpar cache do firestore.", e);
      // Força reload mesmo com erro
      globalThis.location.reload();
    }
  }
};

export { getDb };
