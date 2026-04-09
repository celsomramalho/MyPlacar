/**
 * @deprecated Caminho legado. Importe de '@infra/firebase' nos novos modulos.
 * Este arquivo reexporta de src/infrastructure/firebase para manter
 * compatibilidade durante a migracao modular.
 */
export {
  getDb,
  getAuthInstance,
  getStorageInstance,
  clearFirestoreCache,
} from './src/infrastructure/firebase';
