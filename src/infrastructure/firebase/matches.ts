import { collection, deleteDoc, doc, getDocs, orderBy, query, QueryConstraint, where, writeBatch, type Firestore } from 'firebase/firestore';
import type { MatchHistoryItem } from '@modules/history';

const matchesCollection = (db: Firestore) => collection(db, 'matches');

const ownerEmailQuery = (ownerEmail: string): QueryConstraint => where('ownerEmail', '==', ownerEmail.toLowerCase().trim());

export const countCloudMatches = async (
  db: Firestore,
  ownerEmail: string,
  localIds: Set<string>,
  excludeIds: Set<string> = new Set(),
): Promise<number> => {
  const snap = await getDocs(query(matchesCollection(db), ownerEmailQuery(ownerEmail)));
  let count = 0;
  snap.forEach((docSnap) => {
    if (!localIds.has(docSnap.id) && !excludeIds.has(docSnap.id)) count++;
  });
  return count;
};

export const syncMatchesToFirebase = async (
  db: Firestore,
  matches: MatchHistoryItem[],
  ownerEmail: string,
  ownerPin: string,
  serializeMatch: (match: MatchHistoryItem) => Record<string, unknown> | null,
): Promise<MatchHistoryItem[]> => {
  const batch = writeBatch(db);
  const validMatches: MatchHistoryItem[] = [];

  matches.forEach((match) => {
    const serialized = serializeMatch(match);
    if (!serialized) return;

    batch.set(doc(db, 'matches', match.id), {
      ...serialized,
      ownerEmail: ownerEmail.toLowerCase().trim(),
      ownerPin,
      isSynced: true,
    }, { merge: true });
    validMatches.push(match);
  });

  if (validMatches.length === 0) return [];
  await batch.commit();
  return validMatches;
};

export const downloadMatchesFromFirebase = async (
  db: Firestore,
  ownerEmail: string,
  localIds: Set<string>,
): Promise<MatchHistoryItem[]> => {
  const snap = await getDocs(query(matchesCollection(db), ownerEmailQuery(ownerEmail)));
  const downloaded: MatchHistoryItem[] = [];
  snap.forEach((docSnap) => {
    if (!localIds.has(docSnap.id)) downloaded.push({ id: docSnap.id, ...docSnap.data(), isSynced: true } as MatchHistoryItem);
  });
  return downloaded;
};

export const deleteCloudMatch = (db: Firestore, id: string) => deleteDoc(doc(db, 'matches', id));

export const deleteCloudMatches = async (db: Firestore, ids: Iterable<string>) => {
  const batch = writeBatch(db);
  for (const id of ids) batch.delete(doc(db, 'matches', id));
  await batch.commit();
};

export const deleteAllCloudMatches = async (db: Firestore, ownerEmail: string) => {
  const snap = await getDocs(query(matchesCollection(db), ownerEmailQuery(ownerEmail)));
  const batch = writeBatch(db);
  snap.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
};

export const fetchAllCloudMatches = async (db: Firestore): Promise<MatchHistoryItem[]> => {
  const snap = await getDocs(query(matchesCollection(db), orderBy('date', 'desc')));
  const matches: MatchHistoryItem[] = [];
  snap.forEach((docSnap) => matches.push({ id: docSnap.id, ...docSnap.data() } as MatchHistoryItem));
  return matches;
};
