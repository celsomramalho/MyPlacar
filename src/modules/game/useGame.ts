// ─── src/modules/game/useGame.ts ─────────────────────────────────────────────
// Hook público para consumir o GameContext.
// Análogo ao useLive() do módulo live.
//
// USO:
//   const { gameState, matchSettings, userProfile } = useGame();
//
// ERRO EXPLÍCITO:
//   Lança um erro descritivo se chamado fora do <GameProvider>.
//   Isso evita bugs silenciosos de contexto undefined.
// ─────────────────────────────────────────────────────────────────────────────

import { useContext } from 'react';
import { GameContext } from './GameContext.tsx';
import type { GameContextValue } from './types.ts';

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (ctx === undefined) {
    throw new Error(
      '[useGame] deve ser chamado dentro de um <GameProvider>. ' +
      'Verifique se o componente está na árvore abaixo do provider.'
    );
  }
  return ctx;
}
