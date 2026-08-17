import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Communication, PollOption, Reply } from '@modules/communications/types';

export type FirebaseCommunication = Communication;
export type FirebaseCommunicationDraft = Omit<Communication, 'id'>;

export interface FirebaseCommunicationRecipient {
  email: string;
  pushToken?: string;
}

const communicationsCollection = (db: Firestore) => collection(db, 'communications');
const communicationDocument = (db: Firestore, communicationId: string) =>
  doc(db, 'communications', communicationId);

const mapCommunicationDoc = (docSnapshot: { id: string; data: () => unknown }): FirebaseCommunication => ({
  id: docSnapshot.id,
  ...(docSnapshot.data() as Omit<Communication, 'id'>),
});

export const subscribeRecentCommunications = (
  db: Firestore,
  maxItems: number,
  onCommunications: (communications: FirebaseCommunication[]) => void,
): Unsubscribe => {
  const communicationsQuery = query(
    communicationsCollection(db),
    orderBy('createdAt', 'desc'),
    limit(maxItems),
  );

  return onSnapshot(communicationsQuery, snapshot => {
    onCommunications(snapshot.docs.map(mapCommunicationDoc));
  });
};

export const subscribeUserCommunications = (
  db: Firestore,
  userIdentifier: { pin?: string; email?: string } | string,
  onCommunications: (communications: FirebaseCommunication[]) => void,
): Unsubscribe => {
  const pin = (typeof userIdentifier === 'string' ? userIdentifier : (userIdentifier.pin || '')).trim();
  const email = (typeof userIdentifier === 'string' ? '' : (userIdentifier.email || '')).trim().toLowerCase();

  const communicationsQuery = query(
    communicationsCollection(db),
    orderBy('createdAt', 'desc'),
    limit(100),
  );

  return onSnapshot(
    communicationsQuery,
    snapshot => {
      const allDocs = snapshot.docs.map(mapCommunicationDoc);
      const filtered = allDocs.filter(comm => {
        const t = (comm.targetUserId || '').trim();
        const tEmail = ((comm as unknown as { targetUserEmail?: string }).targetUserEmail || '').trim().toLowerCase();
        const tPin = ((comm as unknown as { targetUserPin?: string }).targetUserPin || '').trim();
        if (t === 'all') return true;
        if (pin && (t.toUpperCase() === pin.toUpperCase() || tPin.toUpperCase() === pin.toUpperCase())) return true;
        if (email && (t.toLowerCase() === email || tEmail === email)) return true;
        return false;
      });
      onCommunications(filtered);
    },
    error => {
      console.warn('subscribeUserCommunications error:', error);
    }
  );
};

export const subscribeUnreadCommunicationsCount = (
  db: Firestore,
  userIdentifier: { pin?: string; email?: string } | string,
  onCount: (count: number) => void,
): Unsubscribe => {
  const pin = (typeof userIdentifier === 'string' ? userIdentifier : (userIdentifier.pin || '')).trim();
  const email = (typeof userIdentifier === 'string' ? '' : (userIdentifier.email || '')).trim().toLowerCase();

  const communicationsQuery = query(
    communicationsCollection(db),
    orderBy('createdAt', 'desc'),
    limit(100),
  );

  return onSnapshot(
    communicationsQuery,
    snapshot => {
      const unreadCount = snapshot.docs.filter(docSnapshot => {
        const comm = docSnapshot.data() as Partial<Communication> & { targetUserEmail?: string; targetUserPin?: string };
        const t = (comm.targetUserId || '').trim();
        const tEmail = (comm.targetUserEmail || '').trim().toLowerCase();
        const tPin = (comm.targetUserPin || '').trim();
        
        const isForUser = 
          t === 'all' || 
          (pin && (t.toUpperCase() === pin.toUpperCase() || tPin.toUpperCase() === pin.toUpperCase())) ||
          (email && (t.toLowerCase() === email || tEmail === email));

        if (!isForUser) return false;
        const readList = comm.readBy || [];
        const isRead = (pin && readList.includes(pin)) || (email && readList.includes(email));
        return !isRead;
      }).length;

      onCount(unreadCount);
    },
    error => {
      console.warn('subscribeUnreadCommunicationsCount error:', error);
    }
  );
};

export const fetchCommunicationTargetPinByEmail = async (
  db: Firestore,
  email: string,
): Promise<string | null> => {
  const usersQuery = query(
    collection(db, 'users'),
    where('email', '==', email.toLowerCase().trim()),
  );
  const snapshot = await getDocs(usersQuery);

  if (snapshot.empty) return null;
  return snapshot.docs[0].data().pin || null;
};

export const fetchAllCommunicationRecipients = async (
  db: Firestore,
): Promise<FirebaseCommunicationRecipient[]> => {
  const snapshot = await getDocs(collection(db, 'users'));
  const recipients: FirebaseCommunicationRecipient[] = [];

  snapshot.forEach(docSnapshot => {
    const user = docSnapshot.data();
    if (user.email) {
      recipients.push({ email: user.email, pushToken: user.pushToken });
    }
  });

  return recipients;
};

export const addCommunication = (
  db: Firestore,
  communication: FirebaseCommunicationDraft,
) => addDoc(communicationsCollection(db), communication);

export const deleteCommunication = (
  db: Firestore,
  communicationId: string,
) => deleteDoc(communicationDocument(db, communicationId));

export const markCommunicationAsRead = (
  db: Firestore,
  communicationId: string,
  userPin: string,
) => updateDoc(communicationDocument(db, communicationId), {
  readBy: arrayUnion(userPin),
});

export const appendCommunicationReply = (
  db: Firestore,
  communicationId: string,
  reply: Reply,
) => updateDoc(communicationDocument(db, communicationId), {
  replies: arrayUnion(reply),
});

export const updateCommunicationPoll = (
  db: Firestore,
  communicationId: string,
  options: PollOption[],
  totalVotes: number,
) => updateDoc(communicationDocument(db, communicationId), {
  'poll.options': options,
  'poll.totalVotes': totalVotes,
});

export const updateCommunicationReactions = (
  db: Firestore,
  communicationId: string,
  reactions: Record<string, string[]>,
) => updateDoc(communicationDocument(db, communicationId), { reactions });
