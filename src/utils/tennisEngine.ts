
import { GameState, PointType, CourtSide } from '../types.ts';
import { incrementScorePickleball } from './pickleballEngine.ts';

export const incrementScore = (state: GameState, rallyWinner: 1 | 2, pointType: PointType = 'rally', source: string = 'cb'): GameState => {
  if (state.isMatchOver) return state;

  const newState = JSON.parse(JSON.stringify(state)) as GameState;
  
  newState.pointHistory.push({
      winner: rallyWinner,
      type: pointType,
      server: newState.server,
      scoreBefore: `${newState.p1.score}-${newState.p2.score}`,
      source
  });

  if (newState.matchConfig.sportType === 'pickleball') {
    return incrementScorePickleball(newState, rallyWinner);
  } else {
    return incrementScoreTennis(newState, rallyWinner);
  }
};

// Pickleball: lógica movida para src/utils/pickleballEngine.ts

export const isTennisTieBreak = (state: GameState): boolean => {
    if (state.matchConfig.sportType !== 'tennis' && state.matchConfig.sportType !== 'beach-tennis') return false;
    if (!state.matchConfig.tieBreak) return false;
    
    const gamesLimit = Number(state.matchConfig.gamesPerSet) || 6;
    const configTieBreakAt = state.matchConfig.tieBreakAt;
    
    // Fallback inteligente baseado no tamanho do set
    const tieBreakAt = configTieBreakAt || (gamesLimit === 4 ? '3-3' : '6-6');
    const [t1, t2] = tieBreakAt.split('-').map(Number);
    
    return state.p1.games === t1 && state.p2.games === t2;
};

export const incrementScoreTennis = (state: GameState, player: 1 | 2): GameState => {
  const scorer = player === 1 ? state.p1 : state.p2;
  const opponent = player === 1 ? state.p2 : state.p1;

  if (isTennisTieBreak(state)) {
      const currentScore = parseInt(scorer.score) || 0;
      const newScore = currentScore + 1;
      scorer.score = newScore.toString();
      const opponentScore = parseInt(opponent.score) || 0;
      const target = Number(state.matchConfig.tieBreakPoints) || 7;
      const winByTwo = state.matchConfig.tieBreakWinByTwo;
      
      let tieBreakFinished = false;
      if (winByTwo) {
          if (newScore >= target && newScore >= (opponentScore + 2)) tieBreakFinished = true;
      } else {
          if (newScore >= target) tieBreakFinished = true;
      }

      if (tieBreakFinished) {
          scorer.games++;
          winSet(state);
      } else {
          const totalPoints = newScore + opponentScore;
          if (totalPoints % 2 === 1) {
              const maxOffset = state.matchConfig.isDoubles ? 4 : 2;
              state.servingOrderOffset = (state.servingOrderOffset + 1) % maxOffset;
              state.server = (state.servingOrderOffset % 2 === 0) ? 1 : 2;
          }
      }
  } else {
      if (scorer.score === '0') scorer.score = '15';
      else if (scorer.score === '15') scorer.score = '30';
      else if (scorer.score === '30') scorer.score = '40';
      else if (scorer.score === '40') {
        if (opponent.score === '40') {
          if (state.matchConfig.noAd) winGame(state, player);
          else scorer.score = 'Ad';
        } else if (opponent.score === 'Ad') {
          opponent.score = '40';
        } else {
          winGame(state, player);
        }
      } else if (scorer.score === 'Ad') {
        winGame(state, player);
      }
  }
  return state;
};

const winGame = (state: GameState, winner: 1 | 2) => {
  const winnerObj = winner === 1 ? state.p1 : state.p2;
  const loserObj = winner === 1 ? state.p2 : state.p1;
  const gamesLimit = Number(state.matchConfig.gamesPerSet) || 6;
  
  state.p1.score = '0';
  state.p2.score = '0';
  winnerObj.games += 1;
  
  const lastPoint = state.pointHistory[state.pointHistory.length - 1];
  if (lastPoint) lastPoint.resultingScore = `${state.p1.games}-${state.p2.games}`;

  // VERIFICAÇÃO DE TIE-BREAK: Antes de encerrar o set, checa se chegamos no gatilho de empate
  if (state.matchConfig.tieBreak) {
      const configTieBreakAt = state.matchConfig.tieBreakAt;
      const tieBreakAt = configTieBreakAt || (gamesLimit === 4 ? '3-3' : '6-6');
      const [t1, t2] = tieBreakAt.split('-').map(Number);
      
      if (state.p1.games === t1 && state.p2.games === t2) {
          rotateServer(state);
          return; // Entra no modo Tie-break, não encerra o set
      }
  }

  // LÓGICA DE VITÓRIA DO SET
  const reachedTarget = winnerObj.games >= gamesLimit;
  const hasLeadOfTwo = winnerObj.games >= (loserObj.games + 2);
  
  // No Beach Tennis ou Tênis com games=4 (Fast 4), se não houver regra de 2 games de vantagem configurada ou se atingiu o teto
  // Beach Tennis normalmente encerra em 6 games direto ou Tie-break em 6-6.
  if (reachedTarget) {
      if (gamesLimit === 4) {
          // Em set de 4, ganha quem fizer 4 primeiro (exceto o 3-3 já tratado acima)
          winSet(state);
      } else {
          // Em set de 6, precisa de 2 de vantagem (ex: 6-4) ou ganhar o 7º game (ex: 7-5)
          if (hasLeadOfTwo || winnerObj.games > gamesLimit) {
              winSet(state);
          } else {
              rotateServer(state);
          }
      }
  } else {
      rotateServer(state);
  }
};

const rotateServer = (state: GameState) => {
    const maxOffset = state.matchConfig.isDoubles ? 4 : 2;
    state.servingOrderOffset = (state.servingOrderOffset + 1) % maxOffset;
    state.server = (state.servingOrderOffset % 2 === 0) ? 1 : 2;
};

const winSet = (state: GameState) => {
  const isPickle = state.matchConfig.sportType === 'pickleball';
  const p1Final = isPickle ? (parseInt(state.p1.score) || 0) : state.p1.games;
  const p2Final = isPickle ? (parseInt(state.p2.score) || 0) : state.p2.games;
  
  const lastPoint = state.pointHistory[state.pointHistory.length - 1];
  if (lastPoint) lastPoint.resultingScore = `${p1Final}-${p2Final}`;
  
  state.p1.sets = [...state.p1.sets, p1Final];
  state.p2.sets = [...state.p2.sets, p2Final];
  state.p1.games = 0;
  state.p2.games = 0;
  state.p1.score = '0';
  state.p2.score = '0';
  
  const p1SetsWon = state.p1.sets.filter((s, i) => s > state.p2.sets[i]).length;
  const p2SetsWon = state.p2.sets.filter((s, i) => s > state.p1.sets[i]).length;
  
  const setsToWinConfig = Number(state.matchConfig.setsToWin) || 1;
  const setsNeeded = Math.ceil(setsToWinConfig / 2);
  
  if (p1SetsWon >= setsNeeded || p2SetsWon >= setsNeeded) {
    state.isMatchOver = true;
  } else {
    state.currentSet += 1;
    rotateServer(state);
  }
};

export const undoPoint = (historyStack: GameState[]): GameState | null => {
    if (historyStack.length > 1) return historyStack[historyStack.length - 2];
    return null;
};

/**
 * Calcula o lado da quadra do sacador para tênis e beach tennis.
 * Regra: o lado alterna a cada ponto disputado no game atual.
 * Placar 0-0 (início do game) → direita ('even').
 * Cada ponto adicional inverte o lado.
 *
 * Funciona tanto no game normal (pontos: 0/15/30/40/Ad)
 * quanto no tie-break (pontos numéricos).
 */
export const getTennisServerSide = (state: GameState): CourtSide => {
  const scoreToPoints = (s: string): number => {
    if (s === '15') return 1;
    if (s === '30') return 2;
    if (s === '40') return 3;
    if (s === 'Ad') return 4;
    // '0' ou numérico (tie-break)
    return parseInt(s) || 0;
  };
  const total = scoreToPoints(state.p1.score) + scoreToPoints(state.p2.score);
  return total % 2 === 0 ? 'even' : 'odd';
};
