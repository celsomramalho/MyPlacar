import { useState, useEffect } from 'react';
import { getDb } from '@infra/firebase';
import { subscribeUnreadCommunicationsCount } from '@infra/firebase/communications';

/** Contagem de comunicações não lidas para o badge no menu. */
export function useCommunicationsBadge(userPin: string) {
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  useEffect(() => {
    const db = getDb();
    if (!db || !userPin || !navigator.onLine) return;

    return subscribeUnreadCommunicationsCount(db, userPin, setUnreadCommsCount);
  }, [userPin]);

  return { unreadCommsCount };
}
