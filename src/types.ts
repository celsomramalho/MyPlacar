
export type Screen = 'new-game' | 'scoreboard' | 'settings' | 'location' | 'profile' | 'auth' | 'admin' | 'help' | 'spectator' | 'partners' | 'tournaments' | 'event-detail' | 'communications' | 'public-scoreboard';
export type Tab = 'config' | 'history' | 'help' | 'profile';
export type AdminTab = 'configs' | 'users' | 'icons' | 'events' | 'comms';
export type SportGroup = 'raquetes' | 'coletivos' | 'mesa' | 'cartas' | 'outros';
export type SportType = string;

/**
 * B1 — Papel permanente do usuário na live.
 * Não muda durante a live — apenas quem abriu (owner), quem foi convidado (judge) ou demais (observer).
 * 'spectator' = sem live ativa.
 */
export type LivePapel = 'owner' | 'judge' | 'observer' | 'spectator';

/**
 * B1 — Tipo temporário: o que o dispositivo está fazendo no momento.
 * 'controller' = está comandando o placar agora.
 * 'watcher' = está apenas observando.
 */
export type LiveType = 'controller' | 'watcher';

export type LiveLogType =
  | 'live_created'
  | 'control_taken'
  | 'match_started'
  | 'score'
  | 'participant_join'
  | 'participant_leave'
  | 'match_over'
  | 'match_confirmed'
  | 'fb_ack'
  | 'observers_ack'
  | 'live_closed'
  | 'judge_added'
  | 'judge_removed'
  | 'new_match'
  | 'match_reset';

export interface LiveLogEntry {
  id: string;
  time: string;
  timestamp: number;
  type: LiveLogType;
  text: string;
  ok?: boolean;
  deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop';
  participantRole?: 'owner' | 'judge' | 'observer';
  isController?: boolean;
}

export interface ControllerRecord {
  label: string;
  lastSeen: number;
  isOwner?: boolean;
  nickname?: string;
  role?: 'owner' | 'judge' | 'observer';
  status?: 'controller' | 'watcher';
  deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop';
}

/**
 * T4.3 — Sub-objeto centralizado do juiz.
 * Preferido sobre os campos legados `judgePin` / `judgeNickname`.
 * Backward-compatible: campos legados mantidos para leitura de documentos antigos.
 */
export interface JudgeInfo {
  pin: string;
  nickname: string;
  addedAt: number;
  /** true quando este juiz é o commandOwnerId atual */
  isActive: boolean;
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
  isActive?: boolean;
}

export type ErrorSoundType = 'baixo' | 'agudo' | 'duplo' | 'discreto';
export type PickleballScoringMode = 'side-out' | 'rally';
export type PickleballServiceMode = 'switch-side' | 'alternate-server';
export type TieBreakSideSwitchMode = '1_2' | '1_4' | '1_6' | null;
export type TieBreakAt = '3-3' | '5-5' | '6-6';
export type PointType = 'rally' | 'ace' | 'fault';
export type GeminiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
export type GeminiPersona = 'Esportivo' | 'Waze' | 'Amigável' | 'Sério' | 'Robótico';

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
  gender?: 'M' | 'F';
  partnerGender?: 'M' | 'F';
  score: string; 
  games: number; 
  sets: number[]; 
  color?: string; 
}

// ─────────────────────────────────────────────────────────────────────────────
// Pickleball — tipos isolados
// ─────────────────────────────────────────────────────────────────────────────

/** Lado da quadra do sacador: par → direita (even), ímpar → esquerda (odd) */
export type CourtSide = 'even' | 'odd';

export interface PickleballServerState {
  team: 1 | 2;
  /** Qual jogador do time está sacando. Em simples sempre 1. */
  serverNumber: 1 | 2;
  /** Nome já resolvido do sacador atual */
  serverName: string;
  /** Lado da quadra onde o sacador está posicionado */
  side: CourtSide;
  /**
   * Posição na sequência circular de sacadores para rally scoring duplas.
   * 0=J1(p1), 1=J2(p2), 2=J3(p1.partner), 3=J4(p2.partner)
   * Avança a cada rally perdido pelo sacador atual.
   * Ignorado em simples e em side-out scoring.
   */
  rallyOffset: number;
}

export interface PickleballWinner {
  team: 1 | 2;
  /** Nomes formatados prontos para exibição e anúncio (ex: "João e Ana") */
  names: string;
}

/**
 * Estado isolado do pickleball.
 * Não duplica campos de matchConfig (scoringMode, isDoubles) —
 * esses são sempre lidos via state.matchConfig.
 */
export interface PickleballState {
  score: {
    team1: number;
    team2: number;
  };
  server: PickleballServerState;
  /** Transitório: true apenas durante o batch de encerramento do game.
   *  O announcer captura o evento e o motor já reseta para false
   *  antes do próximo render. */
  isGameOver: boolean;
  /** Permanente: true até reset da partida. */
  isMatchOver: boolean;
  winner: PickleballWinner | null;
  /**
   * Flag explícito: true enquanto a first-server rule ainda está ativa
   * (primeiro time ainda não cedeu o saque pela primeira vez).
   * Persiste no localStorage — não é inferido pelo pointHistory.length,
   * que falharia após restauração de sessão.
   * Setado false no primeiro side-out ou no início do segundo game.
   */
  isFirstServerActive: boolean;
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
  accumulatedPausedTime?: number;
  lastPauseTime?: number;
  isMirroringActive?: boolean;
  remoteCommand?: { action: string; timestamp: number };
  lastRemotePing?: number;
  ownerPin?: string;
  /** DeviceId fixo de quem criou a live. Nunca muda durante a sessão. */
  ownerDeviceId?: string;
  liveSessionCounter?: number;
  commandOwner?: string;
  commandOwnerId?: string;
  controllers?: Record<string, ControllerRecord>;
  pingTimestamp?: number;
  pingConfirmed?: boolean;
  isLiveClosed?: boolean;
  /** Encerramento da partida com data (T2.1) — a live permanece aberta */
  matchEndedAt?: number;
  tournamentMatchId?: string;
  tournamentPin?: string;
  /** @deprecated — usar `judge.pin`. Mantido para retrocompatibilidade com documentos antigos. */
  judgePin?: string;
  /** @deprecated — usar `judge.nickname`. Mantido para retrocompatibilidade com documentos antigos. */
  judgeNickname?: string;
  /** T4.3 — Sub-objeto do juiz. Fonte primária de dados do juiz a partir desta versão. */
  judge?: JudgeInfo;
  /**
   * T4.2 — Versão incremental do documento: incrementada a cada write do controller ativo.
   * Permite detectar e descartar writes stale do ex-controller durante troca de posse.
   */
  liveVersion?: number;
  /** Estado isolado do pickleball. Presente apenas quando sportType === 'pickleball'. */
  pickleball?: PickleballState;
  /**
   * Motor de pontuação com que esta partida foi iniciada. Imutável após criação.
   * Usado para detectar trocas de motor durante partida em andamento (ex: tênis → pickleball).
   * Optional para retrocompatibilidade com partidas salvas sem o campo.
   */
  scoringEngine?: 'tennis' | 'pickleball';
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
  p1Gender?: 'M' | 'F';
  p1PartnerGender?: 'M' | 'F';
  p2Gender?: 'M' | 'F';
  p2PartnerGender?: 'M' | 'F';
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
  isScoreboardMode?: boolean;
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
  screenDimTimeout?: 10 | 15 | 20;
}
