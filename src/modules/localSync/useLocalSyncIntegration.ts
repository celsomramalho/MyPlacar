// ─── src/modules/localSync/useLocalSyncIntegration.ts ────────────────────────
// Hook que integra o LocalSyncService com o estado do jogo no ScoreboardScreen.
//
// Responsabilidades:
//   • Quando role = 'controller': monitora mudancas no gameState e dispara
//     broadcastGameState() automaticamente a cada atualizacao.
//   • Expoe os estados e acoes de UI necessarios para o ScoreboardScreen.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useLocalSync } from './LocalSyncContext';
import type { GameState } from '../../types';

export type LocalSyncUiView = 'none' | 'pairing_modal' | 'controller' | 'mirror';

export interface LocalSyncIntegration {
  /** View de UI atualmente ativa no modo Lite */
  localSyncView: LocalSyncUiView;
  /** Abre o modal de escolha de papel */
  openPairingModal: () => void;
  /** Fecha todos os overlays do modo Lite */
  closePairingModal: () => void;
  /** Inicia como Controlador */
  handleChooseController: () => void;
  /** Inicia como Espelho */
  handleChooseMirror: () => void;
  /** Conecta o Espelho ao Controlador com o PIN fornecido */
  handleMirrorConnect: (pin: string, ip?: string) => void;
  /** Encerra o modo Lite */
  handleStopSync: () => void;
  /** Estado atual da sincronizacao */
  syncState: ReturnType<typeof useLocalSync>['syncState'];
  /** Se este dispositivo esta conectado como Espelho */
  isMirrorMode: boolean;
  /** GameState espelhado recebido do Controlador */
  mirroredGameState: GameState | null;
  /** true quando o badge de status deve ser exibido */
  showSyncBadge: boolean;
}

/**
 * Integra o LocalSyncService com o estado do jogo.
 *
 * @param gameState - Estado atual do jogo (para broadcast automatico pelo Controlador)
 */
export function useLocalSyncIntegration(gameState: GameState | null): LocalSyncIntegration {
  const {
    syncState,
    role,
    isConnected,
    isMirrorMode,
    mirroredGameState,
    startAsController,
    startAsMirror,
    broadcastGameState,
    stopSync,
  } = useLocalSync();

  const [localSyncView, setLocalSyncView] = useState<LocalSyncUiView>('none');

  // Broadcast automatico toda vez que o gameState mudar (apenas Controlador)
  useEffect(() => {
    if (role === 'controller' && isConnected && gameState) {
      broadcastGameState(gameState);
    }
  }, [gameState, role, isConnected, broadcastGameState]);

  // Quando o Espelho se conecta, muda a view para 'mirror'
  useEffect(() => {
    if (syncState.status === 'connected' && syncState.role === 'controller') {
      // Controlador conectado: continua mostrando a tela do controlador
      if (localSyncView === 'controller') return;
    }
    if (syncState.status === 'connected' && syncState.role === 'mirror') {
      setLocalSyncView('mirror');
    }
  }, [syncState.status, syncState.role, localSyncView]);

  const openPairingModal = useCallback(() => setLocalSyncView('pairing_modal'), []);
  const closePairingModal = useCallback(() => setLocalSyncView('none'), []);

  const handleChooseController = useCallback(() => {
    startAsController();
    setLocalSyncView('controller');
  }, [startAsController]);

  const handleChooseMirror = useCallback(() => {
    setLocalSyncView('mirror');
  }, []);

  const handleMirrorConnect = useCallback((pin: string, ip?: string) => {
    startAsMirror(pin, ip);
  }, [startAsMirror]);

  const handleStopSync = useCallback(() => {
    stopSync();
    setLocalSyncView('none');
  }, [stopSync]);

  const showSyncBadge =
    syncState.role !== 'none' &&
    syncState.status !== 'idle' &&
    localSyncView === 'none';

  return {
    localSyncView,
    openPairingModal,
    closePairingModal,
    handleChooseController,
    handleChooseMirror,
    handleMirrorConnect,
    handleStopSync,
    syncState,
    isMirrorMode,
    mirroredGameState,
    showSyncBadge,
  };
}
