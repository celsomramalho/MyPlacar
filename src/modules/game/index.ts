// ─── src/modules/game/index.ts ───────────────────────────────────────────────
// Barrel de exportações públicas do módulo game.
// Importar sempre por '@modules/game' (alias configurado no tsconfig/vite).
//
// Exportações privadas (ex: GameContext bruto) são importadas diretamente
// do arquivo de origem quando necessário.
// ─────────────────────────────────────────────────────────────────────────────

export { GameProvider } from './GameContext.tsx';
export { useGame } from './useGame.ts';
export type { GameContextValue } from './types.ts';
