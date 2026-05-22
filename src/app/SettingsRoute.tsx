import React, { useEffect } from 'react';
import { SettingsScreen } from '@modules/settings';
import { useGame } from '@modules/game';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import { useGameRules } from '@modules/game/hooks/useGameRules';
import { useMatchDeletion } from '../hooks/useMatchDeletion';
import { getDb } from '@infra/firebase/client';
import { autoRegisterPartnerByPin, addPartnerToState } from '@modules/partners';
import type { Firestore } from 'firebase/firestore';
import type { MatchHistoryItem } from '@modules/history/types';
import type { TournamentEvent } from '@modules/events/types';
import type { Tab } from '../types';

interface SettingsRouteProps {
  appUrl: string;
  isSyncing: boolean;
  isDownloading: boolean;
  cloudMatchesCount: number;
  syncHistoryToFirebase: (forcedHistory?: MatchHistoryItem[], forceAll?: boolean) => Promise<void>;
  downloadHistoryFromFirebase: () => void;
  handleLogout: () => void;
  handleCheckUpdate: () => Promise<string | null>;
  unreadCommsCount: number;
  activeEvent: TournamentEvent | null;
  userEntryDate: number | null;
  handleExitTournament: () => void;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onViewMap: (matchId: string | null) => void;
  setIsUpdatingVersion: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenMenu: () => void;
  setShowInstallPwa: React.Dispatch<React.SetStateAction<boolean>>;
  installPromptShownSession: boolean;
  setInstallPromptShownSession: React.Dispatch<React.SetStateAction<boolean>>;
}

export function SettingsRoute({
  appUrl,
  isSyncing,
  isDownloading,
  cloudMatchesCount,
  syncHistoryToFirebase,
  downloadHistoryFromFirebase,
  handleLogout,
  handleCheckUpdate,
  unreadCommsCount,
  activeEvent,
  userEntryDate,
  handleExitTournament,
  activeTab,
  setActiveTab,
  onViewMap,
  setIsUpdatingVersion,
  onOpenMenu,
  setShowInstallPwa,
  installPromptShownSession,
  setInstallPromptShownSession,
}: SettingsRouteProps) {
  const {
    setCurrentScreen,
    setModalConfig,
    setShowLiveControlOverlay,
    playerQueue,
    isSettingsInicialSaved,
    isSettingsRegrasSaved,
    isProfileSaved,
  } = useUI();

  const {
    userProfile,
    setPartners,
    gameState,
    matchHistoryRef,
    persistHistory,
    handleSaveProfile,
    initGameState,
    setMatchSettings,
  } = useGame();

  const { cloudLiveExists, livePapel } = useLive();
  const { canStartMatch, persistMatchSettings } = useGameRules();

  const { handleDeleteMatch, handleDeleteManyMatches } = useMatchDeletion({
    matchHistoryRef,
    persistHistory,
    setModalConfig,
    userProfile,
  });

  useEffect(() => {
    if (userProfile.email && !installPromptShownSession) {
      const isStandalone =
        globalThis.matchMedia('(display-mode: standalone)').matches ||
        (globalThis.navigator as Navigator & { standalone?: boolean }).standalone === true;
      try {
        const isHidden = localStorage.getItem('myPlacarHideInstallPrompt') === 'true';
        if (!isStandalone && !isHidden) {
          setInstallPromptShownSession(true);
          const timer = setTimeout(() => setShowInstallPwa(true), 3000);
          return () => clearTimeout(timer);
        }
      } catch {}
    }
  }, [userProfile.email, installPromptShownSession, setInstallPromptShownSession, setShowInstallPwa]);

  const handleAutoRegisterPartner = async (pin: string, field: string): Promise<string | null> => {
    if (!navigator.onLine) return null;
    const db = getDb();
    if (!db) return null;
    try {
      const result = await autoRegisterPartnerByPin(db as Firestore, pin);
      if (!result) return null;
      setPartners(prev => addPartnerToState(prev, result.partner));
      if (field) setMatchSettings(prev => ({ ...prev, [`${field}Verified`]: true }));
      return result.nickname;
    } catch {
      return null;
    }
  };

  return (
    <SettingsScreen
      appUrl={appUrl}
      onDeleteMatch={handleDeleteMatch}
      onDeleteManyMatches={handleDeleteManyMatches}
      onBack={() => { persistMatchSettings(); setCurrentScreen('settings'); }}
      onNewGame={() => { persistMatchSettings(); setCurrentScreen('new-game'); }}
      gameState={gameState}
      onStart={() => { persistMatchSettings(); initGameState(true); }}
      onPlayShortcut={() => { persistMatchSettings(); initGameState(false); }}
      onOpenRules={() => { persistMatchSettings(); setCurrentScreen('new-game'); }}
      activeTab={activeTab}
      setActiveTab={t => { persistMatchSettings(); setActiveTab(t); }}
      onViewMap={onViewMap}
      onSaveProfile={handleSaveProfile}
      onLogout={handleLogout}
      onGoAdmin={() => setCurrentScreen('admin')}
      onGoToScoreboard={() => { persistMatchSettings(); initGameState(false); }}
      isSettingsInicialSaved={isSettingsInicialSaved}
      isSettingsRegrasSaved={isSettingsRegrasSaved}
      isProfileSaved={isProfileSaved}
      canStartMatch={canStartMatch}
      onSyncAll={force => syncHistoryToFirebase(undefined, force)}
      onDownloadHistory={downloadHistoryFromFirebase}
      cloudMatchesCount={cloudMatchesCount}
      isSyncingAll={isSyncing}
      isDownloading={isDownloading}
      onOpenPartners={() => setCurrentScreen('partners')}
      playerQueue={playerQueue}
      onAutoRegisterPartner={handleAutoRegisterPartner}
      onDeletePartners={ids =>
        setModalConfig({
          title: 'Excluir parceiros?',
          message: 'Apagar registro permanentemente?',
          confirmLabel: 'Excluir',
          variant: 'danger',
          onConfirm: () => {
            setPartners(prev => prev.filter(p => !ids.has(p.id)));
            setModalConfig(null);
          },
          onCancel: () => setModalConfig(null),
        })
      }
      cloudLiveExists={cloudLiveExists}
      onCheckUpdate={() => handleCheckUpdate().then(v => v ?? false)}
      setIsUpdatingVersion={setIsUpdatingVersion}
      onOpenLiveControl={() => setShowLiveControlOverlay(true)}
      role={livePapel}
      activeEvent={activeEvent}
      userEntryDate={userEntryDate}
      onJoinTournament={() => setCurrentScreen('tournaments')}
      onExitTournament={handleExitTournament}
      onOpenCommunications={() => setCurrentScreen('communications')}
      unreadCount={unreadCommsCount}
      onOpenMenu={onOpenMenu}
    />
  );
}
