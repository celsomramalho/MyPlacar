// Barrel export — Firebase infrastructure
export { getDb, getAuthInstance, getStorageInstance, clearFirestoreCache } from './client';
export { getDbLite } from './clientLite';
export { subscribeTournamentLiveScores } from './liveMatches';
export type { FirebaseTournamentLiveScore } from './liveMatches';
export { countCloudMatches, syncMatchesToFirebase, downloadMatchesFromFirebase, deleteCloudMatch, deleteCloudMatches, deleteAllCloudMatches, fetchAllCloudMatches } from './matches';
export { deleteEventEntry, deleteUserEventRegistration, fetchEventByPin, fetchEventEntries, fetchEventEntry, fetchUserEventRegistrations, saveEventEntry, saveUserEventRegistration, subscribeEventByPin, updateEvent, updateEventEntry, updateEventMatches } from './events';
export { findUserByPin, findUsersByPins, findUsersReferredByPin, getResolvedNickname, getUserAddedAt, normalizeUserPin, updateUserProfileFields } from './users';
export type { FirebaseReferredUser, FirebaseUserByPin } from './users';
