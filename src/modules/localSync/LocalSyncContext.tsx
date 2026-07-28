// ─── src/modules/localSync/LocalSyncContext.tsx ───────────────────────────────
// Contexto React para o modo Lite Offline (sincronismo local sem internet).
//
// Disponibiliza o estado e as acoes do LocalSyncService para toda a arvore
// de componentes, sem poluir o GameContext ou o LiveContext.
// ─────────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { LocalSyncService, generatePin } from '@infra/network/LocalSyncService';
import type { LocalSyncState, LocalSyncRole } from '@infra/network/LocalSyncService';
import type { GameState } from '../../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LocalSyncContextValue {
  /** Estado atual da sincronizacao local */
  syncState: LocalSyncState;
  /** Papel deste dispositivo na sessao atual */
  role: LocalSyncRole;
  /** true quando a conexao esta estabelecida */
  isConnected: boolean;
  /** true quando e o espelho recebendo dados */
  isMirrorMode: boolean;
  /** GameState recebido do controlador (somente no Espelho) */
  mirroredGameState: GameState | null;
  /** Inicia este dispositivo como Controlador com um PIN gerado automaticamente */
  startAsController: () => void;
  /** Inicia este dispositivo como Espelho com o PIN e IP fornecidos */
  startAsMirror: (pin: string, controllerIp?: string) => void;
  /** Envia o estado atual do jogo para o Espelho (apenas o Controlador chama) */
  broadcastGameState: (gameState: GameState) => void;
  /** Encerra a sessao local */
  stopSync: () => void;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const LocalSyncContext = createContext<LocalSyncContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const LocalSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [syncState, setSyncState] = useState<LocalSyncState>({
    role: 'none',
    status: 'idle',
    pin: null,
    controllerIp: null,
    error: null,
  });
  const [mirroredGameState, setMirroredGameState] = useState<GameState | null>(null);

  const serviceRef = useRef<LocalSyncService | null>(null);

  // Garante que o servico seja criado apenas uma vez
  const getService = useCallback((): LocalSyncService => {
    if (!serviceRef.current) {
      serviceRef.current = new LocalSyncService(
        (state) => setSyncState(state),
        (gs) => setMirroredGameState(gs as GameState)
      );
    }
    return serviceRef.current;
  }, []);

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      serviceRef.current?.stop();
    };
  }, []);

  const startAsController = useCallback(() => {
    const pin = generatePin();
    getService().startAsController(pin);
    setMirroredGameState(null);
  }, [getService]);

  const startAsMirror = useCallback((pin: string, controllerIp?: string) => {
    getService().startAsMirror(pin, controllerIp);
    setMirroredGameState(null);
  }, [getService]);

  const broadcastGameState = useCallback((gameState: GameState) => {
    getService().broadcastGameState(gameState);
  }, [getService]);

  const stopSync = useCallback(() => {
    getService().stop();
    setMirroredGameState(null);
  }, [getService]);

  const isConnected = syncState.status === 'connected';
  const isMirrorMode = syncState.role === 'mirror' && isConnected;

  const value: LocalSyncContextValue = {
    syncState,
    role: syncState.role,
    isConnected,
    isMirrorMode,
    mirroredGameState,
    startAsController,
    startAsMirror,
    broadcastGameState,
    stopSync,
  };

  return (
    <LocalSyncContext.Provider value={value}>
      {children}
    </LocalSyncContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocalSync(): LocalSyncContextValue {
  const ctx = useContext(LocalSyncContext);
  if (!ctx) {
    throw new Error('useLocalSync() deve ser usado dentro de <LocalSyncProvider>');
  }
  return ctx;
}
