import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { UIContextValue, ModalConfig, VoiceLog } from './types';
import { Screen } from '../../types';
import type { QueuePlayer } from '@modules/partners/types';
import { safeJsonParse } from '../../utils/safeJsonParse.ts';

const UIContext = createContext<UIContextValue>({} as UIContextValue);

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
  const [isProfileSaved, setIsProfileSaved] = useState<boolean>(true);
  const overlayAcceptedRef = useRef<string | null>(null);

  const [judgePinInput, setJudgePinInput] = useState<string>('');
  const [judgeNicknameLookup, setJudgeNicknameLookup] = useState<string>('');
  const [isSearchingJudgePin, setIsSearchingJudgePin] = useState<boolean>(false);
  const [isSavingJudge, setIsSavingJudge] = useState<boolean>(false);
  const [isSelectingJudge, setIsSelectingJudge] = useState<boolean>(false);

  const [isRecoveryFromMatchOver, setIsRecoveryFromMatchOver] = useState<boolean>(false);
  const [isWaitingSync, setIsWaitingSync] = useState<boolean>(false);

  const [voiceLogs, setVoiceLogs] = useState<VoiceLog[]>([]);

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
        isProfileSaved,
        setIsProfileSaved,
        overlayAcceptedRef,
        judgePinInput, setJudgePinInput,
        judgeNicknameLookup, setJudgeNicknameLookup,
        isSearchingJudgePin, setIsSearchingJudgePin,
        isSavingJudge, setIsSavingJudge,
        isSelectingJudge, setIsSelectingJudge,
        isRecoveryFromMatchOver, setIsRecoveryFromMatchOver,
        isWaitingSync, setIsWaitingSync,
        voiceLogs, setVoiceLogs,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextValue => {
  const context = useContext(UIContext);
  return context;
};
