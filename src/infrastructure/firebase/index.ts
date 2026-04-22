// Barrel export — Firebase infrastructure
export { getDb, getAuthInstance, getStorageInstance, clearFirestoreCache } from './client';
export { getDbLite } from './clientLite';
export { countCloudMatches, syncMatchesToFirebase, downloadMatchesFromFirebase, deleteCloudMatch, deleteCloudMatches, deleteAllCloudMatches, fetchAllCloudMatches } from './matches';
export { findUserByPin, findUsersByPins, findUsersReferredByPin, getResolvedNickname, getUserAddedAt, normalizeUserPin } from './users';
export type { FirebaseReferredUser, FirebaseUserByPin } from './users';
