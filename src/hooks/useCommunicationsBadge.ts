import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { getDb } from '@infra/firebase';

/** Contagem de comunicações não lidas para o badge no menu. */
export function useCommunicationsBadge(userPin: string) {
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  useEffect(() => {
    const db = getDb();
    if (!db || !userPin || !navigator.onLine) return;

    const q = query(
      collection(db as Firestore, 'communications'),
      where('targetUserId', 'in', ['all', userPin]),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unread = snapshot.docs.filter((d) => {
        const data = d.data();
        return !data.readBy?.includes(userPin);
      }).length;
      setUnreadCommsCount(unread);
    });

    return () => unsubscribe();
  }, [userPin]);

  return { unreadCommsCount };
}
