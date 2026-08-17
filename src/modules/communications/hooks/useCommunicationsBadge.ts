import { useState, useEffect } from 'react';
import { getDb } from '@infra/firebase';
import { subscribeUnreadCommunicationsCount } from '@infra/firebase/communications';

/** Contagem de comunicações não lidas para o badge no menu. */
export function useCommunicationsBadge(userIdentifier: { pin?: string; email?: string } | string) {
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  const pin = typeof userIdentifier === 'string' ? userIdentifier : (userIdentifier?.pin || '');
  const email = typeof userIdentifier === 'string' ? '' : (userIdentifier?.email || '');

  useEffect(() => {
    const db = getDb();
    if (!db || (!pin && !email) || !navigator.onLine) return;

    return subscribeUnreadCommunicationsCount(db, { pin, email }, setUnreadCommsCount);
  }, [pin, email]);

  return { unreadCommsCount };
}
