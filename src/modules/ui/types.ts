import { ReactNode, Dispatch, SetStateAction } from 'react';
import { Screen } from '../../types';
import type { QueuePlayer } from '../partners';

export interface VoiceLog {
  id: string;
  startTime: string;
  before: string;
  after: string;
  text: string;
  latency: number;
  timestamp: number;
  isError?: boolean;
  winner?: 1 | 2;
  isRemote?: boolean;
  liveSequence?: number;
  liveId?: number;
  source: string;
}

export interface ModalConfig {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'info' | 'danger' | 'success';
  icon?: ReactNode;
}

export interface UIContextValue {
  currentScreen: Screen;
  setCurrentScreen: (screen: Screen) => void;
  
  modalConfig: ModalConfig | null;
  setModalConfig: Dispatch<SetStateAction<ModalConfig | null>>;
  
  showLiveControlOverlay: boolean;
  setShowLiveControlOverlay: Dispatch<SetStateAction<boolean>>;
  
  playerQueue: QueuePlayer[];
  setPlayerQueue: Dispatch<SetStateAction<QueuePlayer[]>>;

  isSettingsInicialSaved: boolean;
  setIsSettingsInicialSaved: Dispatch<SetStateAction<boolean>>;

  isSettingsRegrasSaved: boolean;
  setIsSettingsRegrasSaved: Dispatch<SetStateAction<boolean>>;

  isProfileSaved: boolean;
  setIsProfileSaved: Dispatch<SetStateAction<boolean>>;

  overlayAcceptedRef: React.MutableRefObject<string | null>;

  judgePinInput: string;
  setJudgePinInput: Dispatch<SetStateAction<string>>;
  judgeNicknameLookup: string;
  setJudgeNicknameLookup: Dispatch<SetStateAction<string>>;
  isSearchingJudgePin: boolean;
  setIsSearchingJudgePin: Dispatch<SetStateAction<boolean>>;
  isSavingJudge: boolean;
  setIsSavingJudge: Dispatch<SetStateAction<boolean>>;
  isSelectingJudge: boolean;
  setIsSelectingJudge: Dispatch<SetStateAction<boolean>>;

  isRecoveryFromMatchOver: boolean;
  setIsRecoveryFromMatchOver: Dispatch<SetStateAction<boolean>>;

  isWaitingSync: boolean;
  setIsWaitingSync: Dispatch<SetStateAction<boolean>>;

  voiceLogs: VoiceLog[];
  setVoiceLogs: Dispatch<SetStateAction<VoiceLog[]>>;
}
