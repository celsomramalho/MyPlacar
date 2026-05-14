// ─── src/modules/game/types.ts ───────────────────────────────────────────────
// Interface pública do GameContext.
// Define o contrato de tudo que o <GameProvider> expõe para os consumidores.
//
// RASTREABILIDADE:
//   Estados originais declarados no AppInner (App.tsx):
//     gameState / setGameState / gameStateRef  → linha ~328–342
//     matchSettings / setMatchSettings         → linha ~286
//     userProfile / setUserProfile             → linha ~256
//     matchHistory / matchHistoryRef           → linha ~536
//     partners / setPartners                   → linha ~564
// ─────────────────────────────────────────────────────────────────────────────

import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { GameState, MatchSettings, PointType } from '../../types.ts';
import type { UserProfile } from '@modules/auth';
import type { MatchHistoryItem } from '@modules/history';
import type { Partner } from '@modules/partners';
import type { TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events';

// ─── GameContextValue ─────────────────────────────────────────────────────────
// Todos os campos são obrigatórios. O contexto não é criado com um valor padrão
// vazio — um erro explícito é lançado se useGame() for chamado fora do provider.

export interface GameContextValue {
  // ── Estado central do jogo ────────────────────────────────────────────────
  /** Estado atual da partida em andamento. null = nenhuma partida ativa. */
  gameState: GameState | null;
  setGameState: Dispatch<SetStateAction<GameState | null>>;
  /**
   * Ref espelho de gameState.
   * Usado em closures estáveis (performExit, handlers com useCallback sem deps)
   * para evitar closure stale sem recriar callbacks a cada ponto marcado.
   */
  gameStateRef: MutableRefObject<GameState | null>;

  // ── Configurações da partida ──────────────────────────────────────────────
  /** Preferências da partida (esporte, sets, dispositivo, modo placar etc.). */
  matchSettings: MatchSettings;
  setMatchSettings: Dispatch<SetStateAction<MatchSettings>>;

  // ── Perfil do usuário ─────────────────────────────────────────────────────
  /** Perfil do usuário autenticado localmente. */
  userProfile: UserProfile;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;

  // ── Histórico de partidas ─────────────────────────────────────────────────
  /** Lista persistida de partidas encerradas. */
  matchHistory: MatchHistoryItem[];
  setMatchHistory: Dispatch<SetStateAction<MatchHistoryItem[]>>;
  /**
   * Ref espelho de matchHistory.
   * Usado em handlers que precisam ler o histórico sem disparar re-renders.
   */
  matchHistoryRef: MutableRefObject<MatchHistoryItem[]>;
  /**
   * Persiste uma nova lista de histórico no localStorage e atualiza estado + ref.
   * Usar sempre no lugar de `setMatchHistory` direto para manter ref sincronizada.
   */
  persistHistory: (newList: MatchHistoryItem[]) => void;

  // ── Parceiros ─────────────────────────────────────────────────────────────
  /** Lista de parceiros cadastrados pelo usuário. */
  partners: Partner[];
  setPartners: Dispatch<SetStateAction<Partner[]>>;
  
  finalizeMatchInternal: (state: GameState) => Promise<void>;
  handleLeaveLive: () => Promise<void>;
  handleCloseCloudLive: () => Promise<void>;
  handleDeleteJudge: () => Promise<void>;
  handleControlLive: () => Promise<void>;
  handleObserveLive: (targetPin?: string) => Promise<void>;
  handleSyncScoreboard: () => Promise<void>;
  handleAddJudge: (pin: string, nickname?: string) => Promise<void>;
  handleSaveProfile: () => Promise<void>;

  historyStack: GameState[];
  setHistoryStack: Dispatch<SetStateAction<GameState[]>>;
  handleScoreUpdate: (player: 1 | 2, type?: PointType, source?: string) => void;
  handleCorrectScore: (type: 'game' | 'gameSet' | 'matchSet', value: string) => void;
  handleUndo: () => void;
  startGame: (state: GameState) => void;
  handleResetMatch: () => void;
  initGameState: (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => Promise<void>;
  canStartMatch: boolean;
}
