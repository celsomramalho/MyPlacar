
import { MatchSettings, VoiceCommands, SportDefinition } from './types.ts';

// ATENÇÃO: Esta é a versão deste arquivo de código. 
// Se você mudar no Admin para um número DIFERENTE deste, todos os usuários serão forçados a atualizar.
export const APP_VERSION = '2.5.24'; 

export const SPORT_GROUPS = [
  { id: 'raquetes',  name: 'Raquetes',  icon: '🎾', isActive: true  },
  { id: 'coletivos', name: 'Coletivos', icon: '🏐', isActive: false },
  { id: 'mesa',      name: 'Mesa',      icon: '🏓', isActive: false },
  { id: 'cartas',    name: 'Cartas',    icon: '🃏', isActive: false },
  { id: 'outros',    name: 'Outros',    icon: '🎯', isActive: false },
];

export const SPORT_LIST: SportDefinition[] = [
  { id: 'tennis',      group: 'raquetes',  name: 'Tênis',          defaultIcon: '🎾', engine: 'tennis',       isActive: true  },
  { id: 'beach-tennis',group: 'raquetes',  name: 'Beach tênis',    defaultIcon: '🏓', engine: 'tennis',       isActive: true  },
  { id: 'pickleball',  group: 'raquetes',  name: 'Pickleball',     defaultIcon: '🟡', engine: 'rally',        isActive: true  },
  { id: 'voley',       group: 'coletivos', name: 'Vôlei',          defaultIcon: '🏐', engine: 'rally',        isActive: false },
  { id: 'voley-praia', group: 'coletivos', name: 'Vôlei de praia', defaultIcon: '🏐', engine: 'rally',        isActive: false },
  { id: 'pingpong',    group: 'mesa',      name: 'Tênis de mesa',  defaultIcon: '🏓', engine: 'rally',        isActive: false },
  { id: 'truco',       group: 'cartas',    name: 'Truco',           defaultIcon: '🃏', engine: 'points-fixed', isActive: false },
];

export const DEFAULT_VOICE_COMMANDS: VoiceCommands = {
  scoreStatus: ['placar', 'quanto tá', 'score'],
  pointTerm: ['ponto'],
  serverTerm: ['ponto sacador'],
  receiverTerm: ['ponto contra'],
  ace: ['ponto ace', 'ponto de saque'],
  fault: ['saque errado', 'erro de saque'],
  switchServer: ['trocar sacador', 'inverter saque'],
  undo: ['desfazer', 'voltar ponto'],
  partnerTerm: ['mais', 'com', 'e'],
};

export const DEFAULT_TENNIS_SETTINGS: MatchSettings = {
  sportType: 'tennis',
  p1Name: '',
  p1Partner: '',
  p2Name: '',
  p2Partner: '',
  p1Color: 'azul',
  p2Color: 'vermelho',
  sets: 1,
  gamesPerSet: 6,
  isDoubles: false,
  voiceEnabled: true,
  voiceScoring: true,
  useGeminiVoice: false,
  geminiVoiceName: 'Puck',
  geminiPersona: 'Esportivo',
  initialServer: 1,
  noAd: false,
  tieBreak: true,
  tieBreakAt: '6-6',
  tieBreakPoints: 7,
  tieBreakWinByTwo: true,
  switchSidesOdd: true, 
  tieBreakSideSwitchMode: null, 
  voiceCommands: DEFAULT_VOICE_COMMANDS,
  brightness: 100,
  volume: 100,
  narratorGender: 'Masculina',
  cloudSync: true,
  actionCooldown: 5,
  stateLockout: 10,
  screenDimTimeout: 10,
  customSportIcons: {},
  customCategoryIcons: {},
  goldenRuleEnabled: true,
  errorSoundType: 'baixo',
  isHistoryEnabled: true
};

export const DEFAULT_PICKLEBALL_SETTINGS: MatchSettings = {
  sportType: 'pickleball',
  pickleballScoringMode: 'rally', 
  pickleballServiceMode: 'switch-side',
  p1Name: '',
  p1Partner: '',
  p2Name: '',
  p2Partner: '',
  p1Color: 'azul',
  p2Color: 'vermelho',
  sets: 1,
  gamesPerSet: 21,
  isDoubles: false,
  voiceEnabled: true,
  voiceScoring: true,
  useGeminiVoice: false,
  geminiVoiceName: 'Kore',
  geminiPersona: 'Amigável',
  initialServer: 1,
  noAd: false, 
  tieBreak: false, 
  tieBreakAt: '3-3',
  tieBreakPoints: 7,
  tieBreakWinByTwo: true,
  switchSidesOdd: false, 
  tieBreakSideSwitchMode: null, 
  voiceCommands: DEFAULT_VOICE_COMMANDS,
  brightness: 100,
  volume: 100,
  narratorGender: 'Masculina',
  cloudSync: true,
  actionCooldown: 5,
  stateLockout: 10,
  screenDimTimeout: 10,
  customSportIcons: {},
  customCategoryIcons: {},
  goldenRuleEnabled: true,
  errorSoundType: 'baixo',
  isHistoryEnabled: true
};

export const INITIAL_PLAYER_STATE = {
  score: '0',
  games: 0,
  sets: [],
};

export const COURT_COLOR_PAIRS = [
  { p1Color: 'azul', p2Color: 'vermelho' },   // Quadra 1, 5, 9...
  { p1Color: 'amarelo', p2Color: 'lilas' },    // Quadra 2, 6, 10...
  { p1Color: 'laranja', p2Color: 'verde' },    // Quadra 3, 7, 11...
  { p1Color: 'marrom', p2Color: 'roxo' },      // Quadra 4, 8, 12...
];

export const getCourtColors = (courtNameOrIndex: string | number): { p1Color: string; p2Color: string } => {
  let courtNum = 1;
  if (typeof courtNameOrIndex === 'number') {
    courtNum = courtNameOrIndex + 1;
  } else if (typeof courtNameOrIndex === 'string') {
    const match = courtNameOrIndex.match(/\d+/);
    if (match) {
      courtNum = parseInt(match[0], 10);
    }
  }
  const colorIndex = Math.max(0, (courtNum - 1) % COURT_COLOR_PAIRS.length);
  return COURT_COLOR_PAIRS[colorIndex];
};

