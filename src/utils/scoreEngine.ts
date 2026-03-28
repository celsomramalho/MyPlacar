/**
 * scoreEngine.ts — Dispatcher central de pontuação
 *
 * Único ponto de entrada para qualquer atualização de placar.
 * Decide qual motor chamar com base em `matchConfig.sportType`,
 * usando o campo `engine` definido em SPORT_LIST (constants.ts).
 *
 * Responsabilidades exclusivas deste módulo:
 *   1. Guardar de re-entrar se a partida já terminou.
 *   2. Deep-clone do estado (imutabilidade).
 *   3. Registrar o ponto no pointHistory.
 *   4. Rotear para o motor correto.
 *
 * tennisEngine e pickleballEngine NÃO se importam mutuamente.
 */

import { GameState, PointType } from '../types';
import { SPORT_LIST } from '../constants';
import { incrementScoreTennis, undoPoint as undoPointTennis } from './tennisEngine';
import { incrementScorePickleball, initPickleballState } from './pickleballEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const getEngine = (sportType: string): string => {
  const def = SPORT_LIST.find(s => s.id === sportType);
  return def?.engine ?? 'tennis';
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry point público
// ─────────────────────────────────────────────────────────────────────────────

export const incrementScore = (
  state: GameState,
  rallyWinner: 1 | 2,
  pointType: PointType = 'rally',
  source: string = 'cb'
): GameState => {
  if (state.isMatchOver) return state;

  const newState = JSON.parse(JSON.stringify(state)) as GameState;

  // Registro do ponto no histórico — feito aqui, uma única vez, antes de despachar
  newState.pointHistory.push({
    winner: rallyWinner,
    type: pointType,
    server: newState.server,
    scoreBefore: `${newState.p1.score}-${newState.p2.score}`,
    source,
  });

  const engine = getEngine(newState.matchConfig.sportType);

  if (engine === 'rally' && newState.matchConfig.sportType === 'pickleball') {
    // Garante sub-estado inicializado (restauração de sessão antiga sem pickleball)
    if (!newState.pickleball) {
      newState.pickleball = initPickleballState(newState);
    }
    return incrementScorePickleball(newState, rallyWinner);
  }

  // Motores 'tennis' e futuros 'points-fixed' caem aqui
  return incrementScoreTennis(newState, rallyWinner);
};

// Re-exporta undoPoint para que App.tsx só precise importar deste módulo
export { undoPointTennis as undoPoint };
