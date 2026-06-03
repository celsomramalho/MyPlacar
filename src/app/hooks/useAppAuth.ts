import { useState, useEffect } from 'react';

/** Firebase Auth restaurado antes de queries que exigem `request.auth`. */
export function useAppAuth() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let unsub: (() => void) | null = null;

    const initAuth = async () => {
      try {
        if (isCancelled) return;

        // Importação dinâmica para tirar o SDK do Firebase Auth do caminho crítico de renderização inicial
        const { onAuthStateChanged } = await import('firebase/auth');
        const { getAuthInstance } = await import('@infra/firebase');

        if (isCancelled) return;

        const auth = getAuthInstance();
        if (!auth) {
          setAuthReady(true);
          return;
        }

        unsub = onAuthStateChanged(auth, () => {
          setAuthReady(true);
        });
      } catch (err) {
        console.error("MyPlacar: Erro ao inicializar Firebase Auth de forma diferida:", err);
        setAuthReady(true); // Garante que o app inicialize mesmo se o carregamento falhar
      }
    };

    if ('requestIdleCallback' in globalThis) {
      const idleId = (globalThis as any).requestIdleCallback(initAuth);
      return () => {
        isCancelled = true;
        (globalThis as any).cancelIdleCallback(idleId);
        if (unsub) unsub();
      };
    } else {
      const timeoutId = setTimeout(initAuth, 0);
      return () => {
        isCancelled = true;
        clearTimeout(timeoutId);
        if (unsub) unsub();
      };
    }
  }, []);

  useEffect(() => {
    globalThis.dispatchEvent(new CustomEvent('app-ready'));
  }, []);

  return { authReady };
}
