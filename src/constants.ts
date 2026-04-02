
import { MatchSettings, VoiceCommands, SportDefinition } from './types';

// ATENÇÃO: Esta é a versão deste arquivo de código. 
// Se você mudar no Admin para um número DIFERENTE deste, todos os usuários serão forçados a atualizar.
export const APP_VERSION = '2.5.11'; 

export const SPORT_GROUPS = [
  { id: 'raquetes', name: 'Raquetes', icon: '🎾' },
  { id: 'coletivos', name: 'Coletivos', icon: '🏐' },
  { id: 'mesa', name: 'Mesa', icon: '🏓' },
  { id: 'cartas', name: 'Cartas', icon: '🃏' },
  { id: 'outros', name: 'Outros', icon: '🎯' }
];

export const SPORT_LIST: SportDefinition[] = [
  { id: 'tennis', group: 'raquetes', name: 'Tênis', defaultIcon: '🎾', engine: 'tennis' },
  { id: 'beach-tennis', group: 'raquetes', name: 'Beach tênis', defaultIcon: '🏓', engine: 'tennis' },
  { id: 'pickleball', group: 'raquetes', name: 'Pickleball', defaultIcon: '🟡', engine: 'rally' },
  { id: 'voley', group: 'coletivos', name: 'Vôlei', defaultIcon: '🏐', engine: 'rally' },
  { id: 'voley-praia', group: 'coletivos', name: 'Vôlei de praia', defaultIcon: '🏐', engine: 'rally' },
  { id: 'pingpong', group: 'mesa', name: 'Tênis de mesa', defaultIcon: '🏓', engine: 'rally' },
  { id: 'truco', group: 'cartas', name: 'Truco', defaultIcon: '🃏', engine: 'points-fixed' }
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
