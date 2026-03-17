
import { useEffect, useRef } from 'react';

export const useWakeLock = (enabled: boolean) => {
  // Desativado por padrão para evitar violações de política de permissão
  // quando a permissão screen-wake-lock não está presente no metadata.json
  useEffect(() => {
    return () => {};
  }, [enabled]);
};
