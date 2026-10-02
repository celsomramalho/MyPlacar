// Barrel de exportações do módulo Live.
// Importar daqui em vez dos arquivos internos garante encapsulamento.

export { LiveContext, LiveProvider } from './LiveContext.tsx';
export { useLive } from './useLive.ts';
export type { LiveContextValue, LiveProviderProps } from './types.ts';
export {
  persistLiveOwnerPin,
  getPersistedLiveOwnerPin,
  clearLiveOwnerPin,
  assertOwnerPin,
} from './liveHelpers.ts';

// Novos hooks e componente expostos pelo módulo
export { useLiveFirestoreSync } from './hooks/useLiveFirestoreSync.tsx';
export { useLivePublisher } from './hooks/useLivePublisher.ts';
export { useLiveSubscriber } from './hooks/useLiveSubscriber.tsx';
export { useLiveActions } from './hooks/useLiveActions.ts';
export { useRemoteCloudMatch } from './hooks/useRemoteCloudMatch.ts';
export { useJudgeLookup } from './hooks/useJudgeLookup.ts';
export { LiveIndicator } from './components/LiveIndicator.tsx';

// Funções puras de reconciliação e resolução de conflito de live
export {
  isJudgeForLive,
  shouldDiscardStaleWrite,
  hasMatchStateChanged,
  hasConfigChanged,
  computeScoreKey,
  detectScoredTeamFromKeys,
  detectScoredTeamFromSnapshot,
  reconcileIncomingGameState,
  reconcileClosedGameState,
  resolveMatchWinner,
} from './domain/liveReconciliation.ts';
export type { ReconcileIncomingParams } from './domain/liveReconciliation.ts';

// Teardown e saída segura de transmissão
export { performSafeLiveExit } from './domain/liveTeardown.ts';
export type { SafeLiveExitParams } from './domain/liveTeardown.ts';



