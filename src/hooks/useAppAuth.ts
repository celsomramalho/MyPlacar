import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuthInstance } from '@infra/firebase';

/** Firebase Auth restaurado antes de queries que exigem `request.auth`. */
export function useAppAuth() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) {
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, () => {
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    globalThis.dispatchEvent(new CustomEvent('app-ready'));
  }, []);

  return { authReady };
}
