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
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}
