/**
 * Factory de GameState para testes de regressão.
 * Cria estados mínimos válidos para testar os engines de pontuação
 * sem depender de Firebase, React ou qualquer módulo de UI.
 */
import type { GameState, MatchSettings } from '../../src/types';

const defaultMatchConfig: MatchSettings & { setsToWin: number } = {
  sportType: 'tennis',
  sets: 3,
  setsToWin: 3,
  gamesPerSet: 6,
  isDoubles: false,
  tieBreak: true,
  tieBreakAt: '6-6',
  tieBreakPoints: 7,
  tieBreakWinByTwo: true,
  noAd: false,
  goldenRuleEnabled: false,
  switchSidesOdd: false,
  tieBreakSideSwitchMode: null,
  p1Name: 'Player 1',
  p1Partner: '',
  p2Name: 'Player 2',
  p2Partner: '',
  p1Color: '#fff',
  p2Color: '#000',
  voiceEnabled: false,
  voiceScoring: false,
  useGeminiVoice: false,
  geminiVoiceName: 'Puck',
  geminiPersona: 'Esportivo',
  cloudSync: false,
  actionCooldown: 0,
  stateLockout: 0,
  errorSoundType: 'baixo',
  isHistoryEnabled: false,
  initialServer: 1,
  brightness: 100,
  volume: 50,
  narratorGender: 'Masculina',
  voiceCommands: {
    scoreStatus: [],
    undo: [],
    switchServer: [],
    pointTerm: [],
    serverTerm: [],
    receiverTerm: [],
    ace: [],
    fault: [],
    partnerTerm: [],
  },
  pickleballScoringMode: 'side-out',
  pickleballServiceMode: 'switch-side',
};

export function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    matchId: 'test-match-001',
    startTime: Date.now(),
    server: 1,
    servingOrderOffset: 0,
    currentSet: 0,
    isMatchOver: false,
    isPaused: false,
    matchDuration: 0,
    pointHistory: [],
    history: [],
    matchConfig: { ...defaultMatchConfig },
    p1: {
      name: 'Player 1',
      score: '0',
      games: 0,
      sets: [],
      color: '#fff',
    },
    p2: {
      name: 'Player 2',
      score: '0',
      games: 0,
      sets: [],
      color: '#000',
    },
    ...overrides,
  };
}

/** Estado com placar 40-40 (Deuce) */
export function createDeuceState(): GameState {
  return createGameState({
    p1: { name: 'P1', score: '40', games: 0, sets: [], color: '#fff' },
    p2: { name: 'P2', score: '40', games: 0, sets: [], color: '#000' },
  });
}

/** Estado com o set prestes a terminar: P1 tem 5 games, P2 tem 4 */
export function createNearSetEndState(): GameState {
  return createGameState({
    p1: { name: 'P1', score: '40', games: 5, sets: [], color: '#fff' },
    p2: { name: 'P2', score: '0',  games: 4, sets: [], color: '#000' },
  });
}

/** Estado em tie-break (6-6) */
export function createTieBreakState(): GameState {
  return createGameState({
    p1: { name: 'P1', score: '0', games: 6, sets: [], color: '#fff' },
    p2: { name: 'P2', score: '0', games: 6, sets: [], color: '#000' },
  });
}

/** Estado com partida já encerrada (P1 venceu) */
export function createMatchOverState(): GameState {
  return createGameState({
    isMatchOver: true,
    p1: { name: 'P1', score: '0', games: 0, sets: [6, 6], color: '#fff' },
    p2: { name: 'P2', score: '0', games: 0, sets: [3, 4], color: '#000' },
  });
}

/** Estado de pickleball */
export function createPickleballState(): GameState {
  return createGameState({
    matchConfig: {
      ...defaultMatchConfig,
      sportType: 'pickleball',
      pickleballScoringMode: 'side-out',
      pickleballServiceMode: 'switch-side',
      gamesPerSet: 11,
      sets: 1,
      setsToWin: 1,
      tieBreak: false,
    },
    p1: { name: 'P1', score: '0', games: 0, sets: [], color: '#fff' },
    p2: { name: 'P2', score: '0', games: 0, sets: [], color: '#000' },
    pickleball: {
      score: { team1: 0, team2: 0 },
      server: { team: 1, serverNumber: 1, serverName: 'P1', side: 'even', rallyOffset: 0 },
      isGameOver: false,
      isMatchOver: false,
      winner: null,
      isFirstServerActive: true,
    },
  });
}
