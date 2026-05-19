// ─── src/modules/game/types.ts ───────────────────────────────────────────────
// Interface pública do GameContext.
// Define o contrato de tudo que o <GameProvider> expõe para os consumidores.
// ─────────────────────────────────────────────────────────────────────────────

import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { GameState, MatchSettings, PointType } from '../../types.ts';
import type { UserProfile } from '@modules/auth';
import type { MatchHistoryItem } from '@modules/history/types';
import type { Partner } from '@modules/partners/types';
import type { TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events/types';

// ─── GameContextValue ─────────────────────────────────────────────────────────
// Todos os campos são obrigatórios. O contexto não é criado com um valor padrão
// vazio — um erro explícito é lançado se useGame() for chamado fora do provider.

export interface GameContextValue {
  // ── Estado central do jogo ────────────────────────────────────────────────

  /** Estado atual da partida em andamento. `null` = nenhuma partida ativa. */
  gameState: GameState | null;

  /**
   * Setter direto do gameState. Usar com cuidado — prefira os handlers
   * específicos (`handleScoreUpdate`, `handleUndo`, etc.) para garantir
   * que o `historyStack` e o Firebase sejam mantidos em sincronia.
   */
  setGameState: Dispatch<SetStateAction<GameState | null>>;

  /**
   * Ref espelho de `gameState`.
   * Usado em closures estáveis (onSnapshot, performExit) para evitar
   * closure stale sem adicionar `gameState` ao dep array do `useEffect`.
   */
  gameStateRef: MutableRefObject<GameState | null>;

  // ── Configurações da partida ──────────────────────────────────────────────

  /**
   * Preferências da partida: esporte, sets, configurações de dispositivo,
   * modo placar, voz, etc. Persistidas no localStorage automaticamente
   * pelo `useEffect` interno do `GameContext`.
   */
  matchSettings: MatchSettings;
  setMatchSettings: Dispatch<SetStateAction<MatchSettings>>;

  // ── Perfil do usuário ─────────────────────────────────────────────────────

  /** Perfil do usuário autenticado localmente (nome, PIN, email, etc.). */
  userProfile: UserProfile;
  setUserProfile: Dispatch<SetStateAction<UserProfile>>;

  // ── Histórico de partidas ─────────────────────────────────────────────────

  /** Lista de partidas encerradas, limitada pelo `persistLocalHistory`. */
  matchHistory: MatchHistoryItem[];
  setMatchHistory: Dispatch<SetStateAction<MatchHistoryItem[]>>;

  /**
   * Ref espelho de `matchHistory`.
   * Usado em closures de handlers (`finalizeMatchInternal`,
   * `downloadHistoryFromFirebase`, etc.) para leitura sem dep reativa.
   */
  matchHistoryRef: MutableRefObject<MatchHistoryItem[]>;

  /**
   * Persiste uma nova lista de histórico no localStorage e atualiza
   * o estado + o ref atomicamente.
   * **Sempre usar no lugar de `setMatchHistory` direto** para garantir
   * que `matchHistoryRef` permaneça sincronizado.
   */
  persistHistory: (newList: MatchHistoryItem[]) => void;

  // ── Parceiros ─────────────────────────────────────────────────────────────

  /** Lista de parceiros cadastrados pelo usuário. */
  partners: Partner[];
  setPartners: Dispatch<SetStateAction<Partner[]>>;

  // ── Histórico de jogadas (undo stack) ─────────────────────────────────────

  /**
   * Pilha de snapshots de `GameState` usada pelo `handleUndo`.
   * Cada entrada é uma cópia profunda do estado após cada ponto marcado.
   */
  historyStack: GameState[];
  setHistoryStack: Dispatch<SetStateAction<GameState[]>>;

  // ── Handlers de pontuação ─────────────────────────────────────────────────

  /**
   * Registra um ponto para o jogador 1 ou 2.
   * - `type`: tipo de ponto ('rally', 'ace', 'doubleFault', etc.)
   * - `source`: origem do comando ('cb' = click button, 'voice', etc.)
   * Ignorado se a partida estiver encerrada, pausada ou se este device
   * não for o controller ativo em modo live.
   */
  handleScoreUpdate: (player: 1 | 2, type?: PointType, source?: string) => void;

  /**
   * Corrige manualmente o placar para um valor específico.
   * - `'game'`: placar do game atual (ex: '40-15')
   * - `'gameSet'`: games no set atual (ex: '3-2')
   * - `'matchSet'`: sets da partida (ex: '1-0')
   */
  handleCorrectScore: (type: 'game' | 'gameSet' | 'matchSet', value: string) => void;

  /**
   * Desfaz o último ponto marcado revertendo o `historyStack`.
   * Ignorado se este device não for o controller ativo.
   */
  handleUndo: () => void;

  // ── Handlers de controle de partida ──────────────────────────────────────

  /**
   * Inicia ou reinicia a partida com o `GameState` fornecido.
   * Persiste no localStorage, zera os logs de voz e live, e
   * inicializa o `historyStack` com o estado inicial.
   */
  startGame: (state: GameState) => void;

  /**
   * Exibe modal de confirmação e, se aceito, reseta o placar para zero
   * mantendo as configurações e o `matchId` atuais.
   */
  handleResetMatch: () => void;

  /**
   * Ponto de entrada principal para iniciar ou retomar uma partida.
   * - Se `forceNew = false` e há partida em andamento no Firebase, redireciona para ela.
   * - Se `forceNew = true`, exibe modal de confirmação se houver pontos,
   *   depois apaga a live anterior e cria uma nova.
   * - `tournamentOverride`: inicia a partida pré-configurada para uma chave de torneio.
   */
  initGameState: (
    forceNew: boolean,
    tournamentOverride?: {
      match: TournamentMatch;
      pair1: TournamentPair;
      pair2: TournamentPair;
      event: TournamentEvent;
    }
  ) => Promise<void>;

  /**
   * `true` se os campos mínimos de `matchSettings` estão preenchidos
   * para permitir o início de uma partida (nomes dos jogadores e
   * parceiros quando é duplas).
   */
  canStartMatch: boolean;

  // ── Handlers de finalização ───────────────────────────────────────────────

  /**
   * Finaliza a partida localmente: persiste no histórico, faz upload
   * para o Firebase (se online), registra geolocalização e libera a live.
   * Chamado automaticamente pelo `useEffect` de `isConfirmedFinished`.
   */
  finalizeMatchInternal: (state: GameState) => Promise<void>;

  /**
   * Gera e faz download de um arquivo `.json` com backup completo dos dados:
   * perfil, histórico, configurações, parceiros e fila de jogadores.
   */
  handleExportData: () => void;

  // ── Handlers de live ──────────────────────────────────────────────────────

  /**
   * Sai voluntariamente da live: remove a presença deste device no Firebase.
   * Se este device era o controller ativo, libera o `commandOwnerId`.
   * Owner nunca fecha a live ao chamar este método — apenas remove presença.
   */
  handleLeaveLive: () => Promise<void>;

  /**
   * Encerra a transmissão ao vivo para todos os participantes.
   * Marca `isLiveClosed: true` no Firebase e agenda exclusão do documento.
   * Apenas o owner ou o juiz têm permissão real (verificada pelo Firestore).
   */
  handleCloseCloudLive: () => Promise<void>;

  /**
   * Assume o controle da live: lê o estado atual do Firebase, sincroniza
   * `matchSettings`, atualiza `commandOwnerId` e navega para o placar.
   * Rebaixa o controller anterior para o seu papel original.
   */
  handleControlLive: () => Promise<void>;

  /**
   * Entra na live como observer (ou owner/juiz em dispositivo secundário).
   * - `targetPin`: PIN do owner da live. Se omitido, tenta descobrir via
   *   `activeLives` (judge match, owner com outro device, ou qualquer live ativa).
   */
  handleObserveLive: (targetPin?: string) => Promise<void>;

  /**
   * Sincroniza o placar manualmente:
   * - Controller: envia `gameState` local para o Firebase.
   * - Observer/Judge: puxa o `gameState` do Firebase para o local.
   * Registra a ação nos `liveLogs`.
   */
  handleSyncScoreboard: () => Promise<void>;

  // ── Handlers de juiz ──────────────────────────────────────────────────────

  /**
   * Adiciona um juiz à live pelo PIN. Registra o parceiro localmente e
   * no Firestore (coleção `users/<ownerPin>/partners`) e atualiza o
   * documento da live com `judgePin` e `judgeNickname`.
   */
  handleAddJudge: (pin: string, nickname?: string) => Promise<void>;

  /**
   * Remove o juiz atual da live, limpando `judgePin`, `judgeNickname`
   * e `judge` do documento Firebase.
   */
  handleDeleteJudge: () => Promise<void>;

  // ── Handlers de perfil ────────────────────────────────────────────────────

  /**
   * Salva o `userProfile` no localStorage e, se online, faz upsert no
   * Firestore (`users/<email>`) e espelha no Supabase via `mirrorUser`.
   */
  handleSaveProfile: () => Promise<void>;
}
