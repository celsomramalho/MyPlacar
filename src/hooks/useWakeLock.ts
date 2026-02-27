
import { useEffect, useRef } from 'react';

export const useWakeLock = (enabled: boolean) => {
  const wakeLock = useRef<any>(null);

  useEffect(() => {
    if (!enabled) return;

    const requestWakeLock = async () => {
      try {
        // Verificando se a api existe e se o contexto é seguro para evitar erros de segurança
        if ('wakeLock' in navigator && window.isSecureContext) {
          if (document.visibilityState === 'visible') {
            // Capturando rejeição da promessa diretamente para silenciar o erro em ambientes inseguros
            wakeLock.current = await (navigator as any).wakeLock.request('screen').catch((e: any) => {
                console.debug("Ambiente inseguro detectado ou operação cancelada pelo navegador.");
                return null;
            });
          }
        }
      } catch (err) {
        // Erro de segurança ao solicitar bloqueio de tela silenciado de forma absoluta
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock.current) {
        try {
          wakeLock.current.release().catch(() => {});
        } catch(e) {}
        wakeLock.current = null;
      }
    };
  }, [enabled]);
};
