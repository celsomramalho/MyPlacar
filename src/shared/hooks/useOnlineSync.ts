import { useEffect, useRef } from 'react';

interface UseOnlineSyncOptions {
  onOnline: () => void;
  onOffline?: () => void;
}

export function useOnlineSync({ onOnline, onOffline }: UseOnlineSyncOptions) {
  const onOnlineRef = useRef(onOnline);
  const onOfflineRef = useRef(onOffline);

  useEffect(() => { onOnlineRef.current = onOnline; }, [onOnline]);
  useEffect(() => { onOfflineRef.current = onOffline; }, [onOffline]);

  useEffect(() => {
    const handleOnline = () => onOnlineRef.current?.();
    const handleOffline = () => onOfflineRef.current?.();
    globalThis.addEventListener('online', handleOnline);
    globalThis.addEventListener('offline', handleOffline);
    return () => {
      globalThis.removeEventListener('online', handleOnline);
      globalThis.removeEventListener('offline', handleOffline);
    };
  }, []);
}
