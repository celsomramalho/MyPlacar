import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { UIContextValue, ModalConfig } from './types';
import { Screen } from '../../types';
import type { QueuePlayer } from '../partners';
import { safeJsonParse } from '../../utils/safeJsonParse.ts';

const UIContext = createContext<UIContextValue | undefined>(undefined);

interface UIProviderProps {
  children: React.ReactNode;
  initialScreen?: Screen;
}

export const UIProvider: React.FC<UIProviderProps> = ({ children, initialScreen = 'auth' }) => {
  const [currentScreen, setCurrentScreenRaw] = useState<Screen>(initialScreen);
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
  const [showLiveControlOverlay, setShowLiveControlOverlay] = useState<boolean>(false);
  const [playerQueue, setPlayerQueue] = useState<QueuePlayer[]>(() => {
    const defaultQueue = Array.from({ length: 4 }, (_, i) => ({
      id: `q_default_${i}`,
      name: '',
      gender: 'M' as const
    }));
    return safeJsonParse('myPlacarPlayerQueue', defaultQueue);
  });

  const [isSettingsInicialSaved, setIsSettingsInicialSaved] = useState<boolean>(true);
  const [isSettingsRegrasSaved, setIsSettingsRegrasSaved] = useState<boolean>(true);
  const overlayAcceptedRef = useRef<string | null>(null);

  // Salvar playerQueue no localStorage quando mudar
  useEffect(() => {
    try {
      localStorage.setItem('myPlacarPlayerQueue', JSON.stringify(playerQueue));
    } catch {}
  }, [playerQueue]);

  // Proteção: se currentScreen foi inicializado como 'public-scoreboard', nunca permite sair.
  const setCurrentScreen = useCallback((screen: Screen) => {
    setCurrentScreenRaw(prev => {
      if (prev === 'public-scoreboard') return prev;
      return screen;
    });
  }, []);

  return (
    <UIContext.Provider
      value={{
        currentScreen,
        setCurrentScreen,
        modalConfig,
        setModalConfig,
        showLiveControlOverlay,
        setShowLiveControlOverlay,
        playerQueue,
        setPlayerQueue,
        isSettingsInicialSaved,
        setIsSettingsInicialSaved,
        isSettingsRegrasSaved,
        setIsSettingsRegrasSaved,
        overlayAcceptedRef,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextValue => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
