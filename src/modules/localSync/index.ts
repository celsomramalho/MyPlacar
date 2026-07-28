// ─── src/modules/localSync/index.ts ──────────────────────────────────────────
// Exports publicos do modulo localSync.
// ─────────────────────────────────────────────────────────────────────────────

export { LocalSyncProvider, useLocalSync } from './LocalSyncContext';
export type { LocalSyncContextValue } from './LocalSyncContext';
export { LocalPairingModal } from './components/LocalPairingModal';
export { LocalControllerView } from './components/LocalControllerView';
export { LocalMirrorInput } from './components/LocalMirrorInput';
export { LocalSyncBadge } from './components/LocalSyncBadge';
export { useLocalSyncIntegration } from './useLocalSyncIntegration';
export type { LocalSyncIntegration, LocalSyncUiView } from './useLocalSyncIntegration';
