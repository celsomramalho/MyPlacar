// Barrel export — Firebase infrastructure
export { getDb, getAuthInstance, getStorageInstance, clearFirestoreCache } from './client';
export { getDbLite } from './clientLite';
export { findUserByPin, findUsersByPins, getResolvedNickname, normalizeUserPin } from './users';
