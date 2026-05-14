import type { GameState, LiveLogEntry, LivePapel, LiveType, ControllerRecord } from '../../types.ts';
import type { UserProfile } from '@modules/auth';

// ─── Props de entrada do LiveProvider ────────────────────────────────────────
// Dados externos que o Provider precisa receber do App para funcionar.
export interface LiveProviderProps {
  children: React.ReactNode;
  deviceId: string;
  userProfile: UserProfile;
  gameState: GameState | null;
  gameStateRef: React.RefObject<GameState | null>;
}

// ─── Interface completa do contexto exposto via useLive() ────────────────────
export interface LiveContextValue {
  // ── Estados principais ──────────────────────────────────────────────────────
  activeLives: GameState[];
  setActiveLives: React.Dispatch<React.SetStateAction<GameState[]>>;
  cloudLiveExists: boolean;
  setCloudLiveExists: React.Dispatch<React.SetStateAction<boolean>>;
  liveLogs: LiveLogEntry[];
  setLiveLogs: React.Dispatch<React.SetStateAction<LiveLogEntry[]>>;
  fbSyncStatus: { team: 1 | 2; seq: number; isObserver: boolean } | null;
  setFbSyncStatus: React.Dispatch<React.SetStateAction<{ team: 1 | 2; seq: number; isObserver: boolean } | null>>;

  // ── Refs de ciclo de vida ───────────────────────────────────────────────────
  activeLivesRef: React.MutableRefObject<GameState[]>;
  tookControlAtRef: React.MutableRefObject<number>;
  lostControlAtRef: React.MutableRefObject<number>;
  isClosingLiveRef: React.MutableRefObject<boolean>;
  lastFbScoreKeyRef: React.MutableRefObject<string>;
  fbSyncTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  hasAutoEnabledScoreboardRef: React.MutableRefObject<boolean>;

  // ── Papéis e permissões (calculados) ───────────────────────────────────────
  /** Papel permanente do dispositivo na live: 'owner' | 'judge' | 'observer' | 'spectator' */
  livePapel: LivePapel;
  /** Status funcional atual: 'controller' (comandando) ou 'watcher' (observando) */
  liveStatus: LiveType;
  /** true se ESTE deviceId é o ownerDeviceId da live */
  isOriginalOwner: boolean;
  /** true se ESTE deviceId é o commandOwnerId atual */
  isActiveController: boolean;
  /** true se gameState.commandOwnerId === deviceId (alias de isActiveController para compatibilidade) */
  isCurrentController: boolean;
  /** true se não há live ativa OU se este device é o controller */
  isCommandOwner: boolean;
  /** Papel do indicador de presença: 'owner' | 'judge' | 'observer' */
  indicatorRole: 'owner' | 'judge' | 'observer';
  /** true se o juiz está online (lastSeen < 30s) */
  isJudgeOnline: boolean;
  /** true se o owner está online (lastSeen < 60s) */
  isOwnerOnline: boolean;

  // ── Funções utilitárias ─────────────────────────────────────────────────────
  /**
   * Resolve o PIN do owner para escrita no Firestore.
   * Retorna null e loga erro se não conseguir determinar.
   */
  resolveTargetPin: (context: string) => string | null;
}
