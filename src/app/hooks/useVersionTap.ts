import { useState, useRef } from 'react';

interface UseVersionTapReturn {
  handleVersionTap: () => void;
}

/**
 * Detecta 5 toques rápidos consecutivos (dentro de 2s) e chama `onUnlock`.
 * Usado para abrir o LogViewer oculto na tela de versão.
 */
export function useVersionTap(onUnlock: () => void): UseVersionTapReturn {
  const [, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVersionTap = () => {
    setCount(prev => {
      const next = prev + 1;
      if (next >= 5) { onUnlock(); return 0; }
      return next;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCount(0), 2000);
  };

  return { handleVersionTap };
}
