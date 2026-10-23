// Barrel export — Firebase infrastructure
export { getDb, clearFirestoreCache } from './client';
export { getAuthInstance } from './authClient';
export { getStorageInstance } from './storageClient';
export { getDbLite } from './clientLite';
export { subscribeTournamentLiveScores } from './liveMatches';
export type { FirebaseTournamentLiveScore } from './liveMatches';
export { countCloudMatches, syncMatchesToFirebase, downloadMatchesFromFirebase, deleteCloudMatch, deleteCloudMatches, deleteAllCloudMatches, fetchAllCloudMatches } from './matches';
export { deleteAdminEventEntry, deleteEventEntry, deleteUserEventRegistration, ensureEventEntriesRegistrationIds, fetchEventByPin, fetchEventByPinFromServer, fetchEventEntries, fetchEventEntry, fetchUserEventRegistrations, saveAdminEventEntry, saveEventEntry, saveUserEventRegistration, subscribeEventByPin, subscribeEventEntries, updateEvent, updateEventEntry, updateEventMatches } from './events';
export { fetchUserProfile, fetchUserProfileFromServer, findUserProfileByPasskeyCredentialId, normalizeUserEmail, saveUserProfile, saveNewUserProfile } from './userProfiles';
export type { FirebaseUserProfile } from './userProfiles';
export { findUserByPin, findUsersByPins, findUsersReferredByPin, getResolvedNickname, getUserAddedAt, normalizeUserPin, updateUserProfileFields } from './users';
export type { FirebaseReferredUser, FirebaseUserByPin } from './users';
export { createWatchLoginToken, deleteWatchLoginToken, subscribeWatchLoginToken } from './watchTokens';
export type { FirebaseWatchLoginToken } from './watchTokens';
