// ─── src/modules/game/GameContext.tsx ────────────────────────────────────────
// Provider mínimo da Fase 1: cria o contexto e o <GameProvider>.
//
// ESTRATÉGIA DA FASE 1:
//   O provider não declara nenhum estado próprio ainda — apenas recebe os
//   valores como props e os distribui via contexto.
//   O App.tsx não é modificado nesta fase.
//
// PRÓXIMO PASSO (Fase 2):
//   Envolver o <AppInner> com <GameProvider> no App.tsx, passando os estados
//   que ainda residem no AppInner.
//
// PRÓXIMO PASSO (Fase 4):
//   Mover os useState/useRef para dentro deste provider e eliminar as props.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext } from 'react';
import type { GameContextValue } from './types.ts';

// ─── Contexto ─────────────────────────────────────────────────────────────────
// Inicializado com undefined para detectar usos fora do provider.
const GameContext = createContext<GameContextValue | undefined>(undefined);

// ─── GameProvider ─────────────────────────────────────────────────────────────
// Fase 1: recebe todos os valores como props e os repassa ao contexto.
// Fase 4: os props serão removidos quando o provider passar a gerenciar o estado.

export type GameProviderProps = GameContextValue & {
  children: React.ReactNode;
};

export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  gameState,
  setGameState,
  gameStateRef,
  matchSettings,
  setMatchSettings,
  userProfile,
  setUserProfile,
  matchHistory,
  matchHistoryRef,
  partners,
  setPartners,
}) => {
  const value: GameContextValue = {
    gameState,
    setGameState,
    gameStateRef,
    matchSettings,
    setMatchSettings,
    userProfile,
    setUserProfile,
    matchHistory,
    matchHistoryRef,
    partners,
    setPartners,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

// ─── Exportação do contexto bruto ─────────────────────────────────────────────
// Exportado para casos que precisem do contexto sem o hook (raro).
export { GameContext };
