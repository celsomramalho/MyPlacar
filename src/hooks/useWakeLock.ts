import { useEffect, useRef } from 'react';

/**
 * Hook para manter a tela do dispositivo ativa.
 * Utiliza a Screen Wake Lock API.
 */
export const useWakeLock = (enabled: boolean) => {
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      console.warn('MyPlacar: Screen Wake Lock API não suportada neste navegador.');
      return;
    }

    try {
      // Solicita o bloqueio da tela
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      console.log('MyPlacar: Bloqueio de tela ativado com sucesso.');

      // Ouve o evento de liberação (ex: quando o sistema precisa economizar energia ou o app é minimizado)
      wakeLockRef.current.addEventListener('release', () => {
        console.log('MyPlacar: Bloqueio de tela foi liberado.');
      });
    } catch (err: any) {
      console.error(`MyPlacar: Erro ao solicitar Wake Lock: ${err.name}, ${err.message}`);
    }
  };

  useEffect(() => {
    if (enabled) {
      requestWakeLock();

      // Re-solicita o bloqueio se o app voltar a ficar visível (o navegador libera automaticamente ao minimizar)
      const handleVisibilityChange = async () => {
        if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
          await requestWakeLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) {
          wakeLockRef.current.release().then(() => {
            wakeLockRef.current = null;
          });
        }
      };
    }
  }, [enabled]);
};