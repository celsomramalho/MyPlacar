import { useContext } from 'react';
import { LiveContext } from './LiveContext.tsx';
import type { LiveContextValue } from './types.ts';

/**
 * Hook para consumir o LiveContext de qualquer tela ou componente.
 *
 * @example
 * const { livePapel, isActiveController, resolveTargetPin } = useLive();
 *
 * @throws Error se chamado fora do <LiveProvider>
 */
export const useLive = (): LiveContextValue => {
  const context = useContext(LiveContext);
  if (context === undefined) {
    throw new Error('useLive() deve ser chamado dentro de um <LiveProvider>.');
  }
  return context;
};
