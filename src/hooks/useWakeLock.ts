import { useEffect, useRef } from 'react';

export const useWakeLock = (enabled: boolean) => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!('wakeLock' in navigator)) return;

    let released = false;

    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          // O sistema liberou o wake lock (ex: app foi para background)
          // Tenta readquirir quando a página voltar ao foco
          if (!released) acquire();
        });
      } catch (e) {
        // Permissão negada ou API indisponível — falha silenciosa
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [enabled]);
};
