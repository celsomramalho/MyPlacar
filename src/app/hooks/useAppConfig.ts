import { useState, useEffect, useCallback } from 'react';

import { useUI } from '@modules/ui/UIContext';
import { APP_VERSION as LOCAL_CODE_VERSION } from '../../constants.ts';

/** `appUrl` remoto + verificação de nova versão PWA. */
export function useAppConfig(authReady: boolean, hasUserProfile: boolean) {
  const { setModalConfig } = useUI();

  const [appUrl, setAppUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      if (
        window.location.hostname.includes('run.app') ||
        window.location.hostname.includes('localhost')
      ) {
        return window.location.origin;
      }
    }
    return 'https://myplacar.app.br/';
  });
  const [newAppUrl, setNewAppUrl] = useState('');
  const [isServiceInterrupted, setIsServiceInterrupted] = useState(false);

  useEffect(() => {
    if (!authReady || !hasUserProfile) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    Promise.all([
      import('@infra/firebase/client'),
      import('firebase/firestore'),
    ]).then(([{ getDb }, { doc, onSnapshot }]) => {
      if (cancelled) return;
      const db = getDb();
      if (!db) return;
      unsubscribe = onSnapshot(doc(db, 'system', 'config'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.appUrl) {
            const isDev =
              window.location.hostname.includes('run.app') ||
              window.location.hostname.includes('localhost');
            if (!isDev) {
              setAppUrl(data.appUrl);
            }
          }
        }
      });
    }).catch((error: unknown) => {
      console.warn('MyPlacar: Configuração remota indisponível; usando padrões locais.', error);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [authReady, hasUserProfile]);

  const handleCheckUpdate = useCallback(async (isManual = false) => {
    if (!navigator.onLine) return false;
    try {
      const [{ getDb }, { doc, getDoc }] = await Promise.all([
        import('@infra/firebase/client'),
        import('firebase/firestore'),
      ]);
      const db = getDb();
      if (!db) return false;
      const snap = await getDoc(doc(db, 'system', 'config'));
      if (snap.exists()) {
        const remoteVersion = (snap.data().appVersion || '').toString().trim().replace(/^v/, '');
        const localVersion = LOCAL_CODE_VERSION.trim().replace(/^v/, '');

        const isNewer = (remote: string, local: string) => {
          const r = remote.split('.').map(Number);
          const l = local.split('.').map(Number);
          const maxLength = Math.max(r.length, l.length);
          for (let i = 0; i < maxLength; i++) {
            const vRemote = r[i] || 0;
            const vLocal = l[i] || 0;
            if (vRemote > vLocal) return true;
            if (vRemote < vLocal) return false;
          }
          return false;
        };

        const deprecatedVersions = snap.data().deprecatedVersions || [];
        const minVersion = snap.data().minVersion || '';
        const serviceMovedTo = snap.data().serviceMovedTo || '';

        const isTooOld = !isNewer(localVersion, '2.3.04') || localVersion === '2.3.04';

        if (
          isTooOld ||
          deprecatedVersions.includes(LOCAL_CODE_VERSION) ||
          (minVersion &&
            !isNewer(localVersion, minVersion.replace(/^v/, '')) &&
            localVersion !== minVersion.replace(/^v/, ''))
        ) {
          if (serviceMovedTo) {
            setNewAppUrl(serviceMovedTo);
            setIsServiceInterrupted(true);
            return true;
          }
        }

        if (!remoteVersion || remoteVersion === localVersion) return false;

        if (!isManual) {
          const alreadyTriggered = sessionStorage.getItem('myPlacarUpdateTriggered');
          if (alreadyTriggered === remoteVersion) return false;
        }

        if (isNewer(remoteVersion, localVersion)) {
          setModalConfig({
            title: 'Nova versão disponível',
            message: `Uma nova versão (${remoteVersion}) está disponível. Deseja atualizar agora?`,
            confirmLabel: 'Sim, atualizar',
            onConfirm: async () => {
              sessionStorage.setItem('myPlacarUpdateTriggered', remoteVersion);
              setModalConfig(null);

              if ('serviceWorker' in navigator) {
                try {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map((r) => r.unregister()));
                } catch {
                  /* best-effort */
                }
              }

              if ('caches' in window) {
                try {
                  const keys = await caches.keys();
                  await Promise.all(keys.map((k) => caches.delete(k)));
                } catch {
                  /* best-effort */
                }
              }

              try {
                sessionStorage.setItem('myPlacar_pwa_updating', '1');
              } catch {
                /* best-effort */
              }
              const cleanUrl =
                globalThis.location.origin +
                globalThis.location.pathname +
                '?v=' +
                remoteVersion;
              globalThis.location.replace(cleanUrl);
            },
            onCancel: () => setModalConfig(null),
          });
          return remoteVersion;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  }, [setModalConfig]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleCheckUpdate();
    }, hasUserProfile ? 3000 : 8000);
    return () => clearTimeout(timer);
  }, [handleCheckUpdate, hasUserProfile]);

  return {
    appUrl,
    newAppUrl,
    isServiceInterrupted,
    handleCheckUpdate,
  };
}
