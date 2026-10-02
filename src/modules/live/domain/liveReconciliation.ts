import type { GameState, MatchSettings } from '../../../types.ts';

export interface ReconcileIncomingParams {
  prevLocalState: GameState | null;
  cloudData: GameState;
  deviceId: string;
  localSettings: MatchSettings;
  isWatch: boolean;
}

/**
 * Verifica se um determinado PIN pertence ao juiz nomeado para a live.
 */
export const isJudgeForLive = (live: GameState, pin?: string | null): boolean => {
  const normalizedPin = pin?.toUpperCase();
  if (!normalizedPin) return false;
  return (
    live.judgePin?.toUpperCase() === normalizedPin ||
    live.judge?.pin?.toUpperCase() === normalizedPin
  );
};

/**
 * T4.2: Descarta write stale.
 * Retorna true se a versão vinda da nuvem for menor que a versão local já registrada,
 * indicando write de ex-controlador que chegou fora de ordem.
 */
export const shouldDiscardStaleWrite = (
  cloudVersion: number = 0,
  localVersion: number = 0
): boolean => {
  return cloudVersion > 0 && localVersion > 0 && cloudVersion < localVersion;
};

/**
 * Compara se houve alteração no estado ativo do jogo (pontos, games, sets, pausa, sacador).
 */
export const hasMatchStateChanged = (prev: GameState | null, next: GameState): boolean => {
  if (!prev) return true;
  return (
    prev.p1.score !== next.p1.score ||
    prev.p2.score !== next.p2.score ||
    prev.p1.games !== next.p1.games ||
    prev.p2.games !== next.p2.games ||
    prev.p1.sets.join(',') !== next.p1.sets.join(',') ||
    prev.p2.sets.join(',') !== next.p2.sets.join(',') ||
    prev.isPaused !== next.isPaused ||
    prev.isMatchOver !== next.isMatchOver ||
    prev.server !== next.server
  );
};

/**
 * Compara se houve alteração nas configurações da partida ou dados dos jogadores.
 */
export const hasConfigChanged = (prev: GameState | null, next: GameState): boolean => {
  if (!prev) return true;
  return (
    prev.p1.name !== next.p1.name ||
    prev.p2.name !== next.p2.name ||
    prev.p1.color !== next.p1.color ||
    prev.p2.color !== next.p2.color ||
    prev.matchConfig?.sportType !== next.matchConfig?.sportType ||
    prev.matchConfig?.sets !== next.matchConfig?.sets ||
    prev.matchConfig?.gamesPerSet !== next.matchConfig?.gamesPerSet ||
    prev.matchConfig?.noAd !== next.matchConfig?.noAd ||
    prev.matchConfig?.tieBreak !== next.matchConfig?.tieBreak ||
    prev.matchConfig?.tieBreakAt !== next.matchConfig?.tieBreakAt ||
    prev.matchConfig?.tieBreakPoints !== next.matchConfig?.tieBreakPoints ||
    prev.matchConfig?.tieBreakWinByTwo !== next.matchConfig?.tieBreakWinByTwo ||
    prev.matchConfig?.switchSidesOdd !== next.matchConfig?.switchSidesOdd ||
    prev.matchConfig?.tieBreakSideSwitchMode !== next.matchConfig?.tieBreakSideSwitchMode ||
    prev.matchConfig?.pickleballScoringMode !== next.matchConfig?.pickleballScoringMode ||
    prev.matchConfig?.pickleballServiceMode !== next.matchConfig?.pickleballServiceMode ||
    prev.matchConfig?.winnersStay !== next.matchConfig?.winnersStay ||
    prev.matchConfig?.isDoubles !== next.matchConfig?.isDoubles
  );
};

/**
 * Gera chave sintética única representando o placar para fins de detecção de deltas.
 */
export const computeScoreKey = (gameState: GameState): string => {
  return `${gameState.p1.score}_${gameState.p1.games}_${gameState.p2.score}_${gameState.p2.games}`;
};

/**
 * Detecta qual equipe marcou ponto comparando a chave de placar anterior com o estado atual.
 */
export const detectScoredTeamFromKeys = (
  prevScoreKey: string | null,
  currentGameState: GameState
): { team: 1 | 2; seq: number } | null => {
  if (!prevScoreKey) return null;
  const curScoreKey = computeScoreKey(currentGameState);
  if (curScoreKey === prevScoreKey) return null;

  const parts = prevScoreKey.split('_');
  const prevP1Games = parseInt(parts[1], 10) || 0;
  const prevP2Games = parseInt(parts[3], 10) || 0;
  const prevP1Score = parts[0];
  const prevP2Score = parts[2];

  const p1Scored =
    currentGameState.p1.games > prevP1Games ||
    (currentGameState.p1.games === prevP1Games && currentGameState.p1.score !== prevP1Score);
  const p2Scored =
    currentGameState.p2.games > prevP2Games ||
    (currentGameState.p2.games === prevP2Games && currentGameState.p2.score !== prevP2Score);

  const pointSeq = currentGameState.pointHistory?.length ?? 0;
  if (p1Scored && !p2Scored) return { team: 1, seq: pointSeq };
  if (p2Scored && !p1Scored) return { team: 2, seq: pointSeq };
  return null;
};

/**
 * Detecta qual equipe marcou ponto analisando o snapshot recebido da nuvem em relação ao estado local anterior.
 */
export const detectScoredTeamFromSnapshot = (
  prevGs: GameState | null,
  cloudData: GameState
): { team: 1 | 2; seq: number } | null => {
  if (!prevGs || prevGs.isLiveClosed) return null;
  const p1Scored =
    cloudData.p1.games > prevGs.p1.games ||
    (cloudData.p1.games === prevGs.p1.games && cloudData.p1.score !== prevGs.p1.score);
  const p2Scored =
    cloudData.p2.games > prevGs.p2.games ||
    (cloudData.p2.games === prevGs.p2.games && cloudData.p2.score !== prevGs.p2.score);
  const pointSeq = cloudData.pointHistory?.length ?? 0;
  if (p1Scored && !p2Scored) return { team: 1, seq: pointSeq };
  if (p2Scored && !p1Scored) return { team: 2, seq: pointSeq };
  return null;
};

/**
 * Reconcilia dados recebidos da nuvem com o estado local respeitando travas de proprietário
 * e preferências locais específicas do dispositivo observador.
 */
export const reconcileIncomingGameState = (params: ReconcileIncomingParams): GameState => {
  const { prevLocalState, cloudData, deviceId, localSettings, isWatch } = params;
  const baseConfig = prevLocalState?.matchConfig || localSettings;

  // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId NUNCA podem ser sobrescritos por dados vindos da nuvem
  const lockedOwnerPin = prevLocalState?.ownerPin || cloudData.ownerPin;
  const lockedOwnerDeviceId = prevLocalState?.ownerDeviceId || cloudData.ownerDeviceId;

  const justLostControl =
    prevLocalState?.commandOwnerId === deviceId && cloudData.commandOwnerId !== deviceId;
  const justGainedControl =
    prevLocalState?.commandOwnerId !== deviceId && cloudData.commandOwnerId === deviceId;

  const resolvedWatchMode = justLostControl
    ? false
    : justGainedControl && isWatch
    ? true
    : baseConfig.isWatchMode;

  const resolvedScoreboardMode = justLostControl
    ? false
    : justGainedControl && isWatch
    ? false
    : isWatch
    ? false
    : (baseConfig.isScoreboardMode ?? false);

  return {
    ...cloudData,
    matchDuration: Math.max(prevLocalState?.matchDuration || 0, cloudData.matchDuration || 0),
    ownerPin: lockedOwnerPin,
    ownerDeviceId: lockedOwnerDeviceId,
    isMirroringActive: true,
    isLiveClosed: false,
    isConfirmedFinished: cloudData.isConfirmedFinished,
    matchConfig: {
      ...cloudData.matchConfig,
      isWatchMode: resolvedWatchMode,
      isScoreboardMode: resolvedScoreboardMode,
      brightness: baseConfig.brightness ?? 100,
      volume: baseConfig.volume ?? 100,
      deviceLabel: baseConfig.deviceLabel,
      selectedVoiceURI: baseConfig.selectedVoiceURI,
      voiceEnabled: baseConfig.voiceEnabled,
      voiceScoring: isWatch ? false : baseConfig.voiceScoring,
      actionCooldown: baseConfig.actionCooldown,
      stateLockout: baseConfig.stateLockout,
    },
  };
};

/**
 * Reconcilia encerramento da live localmente quando a nuvem sinaliza isLiveClosed: true.
 */
export const reconcileClosedGameState = (
  prevLocalState: GameState | null,
  cloudData: GameState
): GameState => {
  const base = prevLocalState || cloudData;
  return {
    ...base,
    ...cloudData,
    isMirroringActive: false,
    isLiveClosed: true,
    isConfirmedFinished: cloudData.isConfirmedFinished ?? prevLocalState?.isConfirmedFinished ?? true,
    isMatchOver: cloudData.isMatchOver ?? prevLocalState?.isMatchOver ?? true,
    p1: cloudData.p1 || base.p1,
    p2: cloudData.p2 || base.p2,
    pointHistory: cloudData.pointHistory || base.pointHistory,
  };
};

/**
 * Extrai o vencedor da partida ao detectar encerramento definitivo.
 */
export const resolveMatchWinner = (
  cloudData: GameState
): { winner: string | null; isMatchDone: boolean } => {
  const isMatchDone = Boolean(cloudData.isConfirmedFinished || cloudData.isMatchOver);
  if (!isMatchDone) {
    return { winner: null, isMatchDone: false };
  }

  const p1Name = cloudData.p1?.name || 'Jogador 1';
  const p2Name = cloudData.p2?.name || 'Jogador 2';
  const p1SetsWon = (cloudData.p1?.sets || []).filter(
    (s: number, i: number) => s > (cloudData.p2?.sets?.[i] ?? 0)
  ).length;
  const p2SetsWon = (cloudData.p2?.sets || []).filter(
    (s: number, i: number) => s > (cloudData.p1?.sets?.[i] ?? 0)
  ).length;

  const winner = p1SetsWon > p2SetsWon ? p1Name : p2SetsWon > p1SetsWon ? p2Name : null;
  return { winner, isMatchDone: true };
};
