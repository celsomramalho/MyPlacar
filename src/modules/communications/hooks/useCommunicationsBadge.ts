import { useState, useEffect } from 'react';

/** Contagem de comunicações não lidas para o badge no menu. */
export function useCommunicationsBadge(userIdentifier: { pin?: string; email?: string; isAdmin?: boolean } | string) {
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);

  const pin = typeof userIdentifier === 'string' ? userIdentifier : (userIdentifier?.pin || '');
  const email = typeof userIdentifier === 'string' ? '' : (userIdentifier?.email || '');
  const isAdmin = typeof userIdentifier === 'string' ? false : (userIdentifier?.isAdmin ?? false);

  useEffect(() => {
    if ((!pin && !email) || !navigator.onLine) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void Promise.all([
      import('@infra/firebase/client'),
      import('@infra/firebase/communications'),
    ]).then(([{ getDb }, { subscribeUnreadCommunicationsCount }]) => {
      if (cancelled) return;
      const db = getDb();
      if (db) {
        unsubscribe = subscribeUnreadCommunicationsCount(db, { pin, email, isAdmin }, setUnreadCommsCount);
      }
    }).catch((error: unknown) => {
      console.warn('[communications] Não foi possível iniciar a contagem de avisos:', error);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [pin, email, isAdmin]);

  return { unreadCommsCount };
}
