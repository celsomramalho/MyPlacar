
export type Screen = 'new-game' | 'scoreboard' | 'settings' | 'location' | 'profile' | 'auth' | 'admin' | 'help' | 'spectator' | 'partners' | 'tournaments' | 'event-detail' | 'communications';
export type Tab = 'config' | 'history' | 'help' | 'profile';
export type AdminTab = 'configs' | 'users' | 'icons' | 'events' | 'comms';

export interface ControllerRecord {
  label: string;
  lastSeen: number;
  isOwner?: boolean;
  nickname?: string;
}
export type SportGroup = 'raquetes' | 'coletivos' | 'mesa' | 'cartas' | 'outros';
export type SportType = string;
export type PlanType = 'free' | 'premium';

export interface TournamentPair {
  id: string;
  p1: TournamentEntry;
  p2: TournamentEntry;
}

export interface TournamentMatch {
  id: string;
  pair1Id: string;
  pair2Id: string;
  status: 'waiting' | 'live' | 'finished';
  result?: string;
  winnerPairId?: string;
  ownerPin?: string;
  matchId?: string;
}

export interface TournamentConfig {
  sportType: string;
  sets: 1 | 3 | 5;
  gamesPerSet: number;
  noAd: boolean;
  isLocked: boolean;
}

export interface TournamentEvent {
  pin: string;
  name: string;
  bannerUrl?: string;
  active: boolean;
  createdAt: number;
  config?: TournamentConfig;
  pairs?: TournamentPair[];
  matches?: TournamentMatch[];
  coAdminPins?: string[];
}

export interface TournamentEntry {
  email: string;
  name: string;
  nickname: string;
  pin: string;
  joinedAt: number;
  gender?: 'M' | 'F';
  checkedIn?: boolean;
}

export interface Partner {
  id: string;
  name?: string;
  nickname: string;
  pin: string;
  origin: 'referral' | 'qrcode' | 'manual';
  addedAt: number;
  isSelected?: boolean;
  gender?: 'M' | 'F';
}

export interface QueuePlayer {
  id: string;
  name: string;
  gender: 'M' | 'F';
  verified?: boolean;
  isSelected?: boolean;
}

export interface SportDefinition {
  id: SportType;
  group: SportGroup;
  name: string;
  defaultIcon: string;
  engine: 'tennis' | 'rally' | 'points-fixed';
}

export type ErrorSoundType = 'baixo' | 'agudo' | 'duplo' | 'discreto';
export type PickleballScoringMode = 'side-out' | 'rally';
export type PickleballServiceMode = 'switch-side' | 'alternate-server';
export type TieBreakSideSwitchMode = '1_2' | '1_4' | '1_6' | null;
export type TieBreakAt = '3-3' | '5-5' | '6-6';
export type PointType = 'rally' | 'ace' | 'fault';
export type GeminiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
export type GeminiPersona = 'Esportivo' | 'Waze' | 'Amigável' | 'Sério' | 'Robótico';

export interface UserProfile {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  pin: string;
  gender?: 'M' | 'F';
  isProfileComplete: boolean;
  emailVerified?: boolean;
  qrCodeData?: string; 
  isAdmin?: boolean;
  planType?: PlanType;
  premiumUntil?: string; // ISO Date string
}

export interface PointEvent {
  winner: 1 | 2;
  type: PointType;
  server: 1 | 2;
  scoreBefore: string;
  resultingScore?: string;
  source?: string; // cb, cv, wb, wv
}

export interface VoiceCommands {
  scoreStatus: string[];
  undo: string[];
  switchServer: string[];
  pointTerm: string[]; 
  serverTerm: string[]; 
  receiverTerm: string[];
  ace: string[];
  fault: string[];
  partnerTerm: string[];
}

export interface Player {
  name: string;
  partnerName?: string; 
  score: string; 
  games: number; 
  sets: number[]; 
  color?: string; 
}

export interface GameState {
  matchId: string; 
  startTime: number; 
  p1: Player;
  p2: Player;
  server: 1 | 2;
  servingOrderOffset: number; 
  pointHistory: PointEvent[];
  matchConfig: MatchSettings & { setsToWin: number };
  history: Array<{ p1: string; p2: string; setScores: string }>; 
  currentSet: number;
  isMatchOver: boolean;
  isConfirmedFinished?: boolean;
  matchDuration: number; 
  isPaused: boolean;
  isMirroringActive?: boolean;
  remoteCommand?: { action: string; timestamp: number };
  lastRemotePing?: number;
  ownerPin?: string;
  liveSessionCounter?: number;
  commandOwner?: string;
  commandOwnerId?: string;
  controllers?: Record<string, ControllerRecord>;
  pingTimestamp?: number;
  pingConfirmed?: boolean;
  isLiveClosed?: boolean;
  tournamentMatchId?: string;
  tournamentPin?: string;
}

export interface MatchHistoryItem {
  id: string;
  date: string; 
  time: string;
  sportType: SportType;
  p1Name: string;
  p1Partner?: string;
  p2Name: string;
  p2Partner?: string;
  p1Color: string;
  p2Color: string;
  scoreSummary: string; 
  p1Sets: number[]; 
  p2Sets: number[]; 
  winner: string;
  winnerTeam: 1 | 2;
  duration: number; 
  isSynced: boolean; 
  ownerEmail?: string;
  ownerPin?: string;
  location?: {
    lat: number;
    lng: number;
  };
  stats: {
    p1Aces: number;
    p2Aces: number;
    p1Faults: number;
    p2Faults: number;
    totalPoints: number;
  };
  pointHistory: PointEvent[];
  involvedPins?: string[];
}

export interface MatchSettings {
  sportType: SportType;
  customSportIcon?: string;
  customSportIcons?: Record<string, string>;
  customCategoryIcons?: Record<string, string>;
  cloudSportIcons?: Record<string, string>;
  cloudCategoryIcons?: Record<string, string>;
  pickleballScoringMode?: PickleballScoringMode;
  pickleballServiceMode?: PickleballServiceMode;
  p1Name: string;
  p1Partner: string;
  p2Name: string;
  p2Partner: string;
  p1Color: string;
  p2Color: string;
  p1Verified?: boolean;
  p1PartnerVerified?: boolean;
  p2Verified?: boolean;
  p2PartnerVerified?: boolean;
  sets: 1 | 3 | 5;
  gamesPerSet: number;
  isDoubles: boolean;
  voiceEnabled: boolean;
  voiceScoring: boolean;
  useGeminiVoice: boolean;
  geminiVoiceName: GeminiVoiceName;
  geminiPersona: GeminiPersona;
  selectedVoiceURI?: string;
  cloudSync: boolean;
  actionCooldown: number;
  stateLockout: number;
  goldenRuleEnabled: boolean;
  errorSoundType: ErrorSoundType;
  isWatchMode?: boolean;
  deviceLabel?: string;
  isHistoryEnabled: boolean;
  initialServer: 1 | 2;
  noAd: boolean;
  tieBreak: boolean;
  tieBreakAt: TieBreakAt;
  tieBreakPoints: number;
  tieBreakWinByTwo: boolean;
  switchSidesOdd: boolean;
  tieBreakSideSwitchMode: TieBreakSideSwitchMode;
  voiceCommands: VoiceCommands; 
  brightness: number;
  volume: number;
  narratorGender: 'Masculina' | 'Feminina';
  winnersStay?: boolean;
}
