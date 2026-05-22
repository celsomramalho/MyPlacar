import React, { useState } from 'react';
import { ScoreboardRoute } from './ScoreboardRoute.tsx';
import { SettingsRoute } from './SettingsRoute.tsx';
import { PartnersRoute } from './PartnersRoute.tsx';
import { NewGameRoute } from './NewGameRoute.tsx';
import { AdminRoute } from './AdminRoute.tsx';
import { AuthRoute } from './AuthRoute.tsx';
import { PublicScoreboardRoute } from './PublicScoreboardRoute.tsx';
import { EventDetailRoute } from './EventDetailRoute.tsx';
import { SpectatorScreen } from '@modules/live/screens/SpectatorScreen.tsx';
import { LocationScreen } from '@modules/history/screens/LocationScreen';
import { TournamentsScreen } from '@modules/events';
import { CommunicationsScreen } from '@modules/communications';
import { useLive } from '@modules/live';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { LiveControlOverlay } from '@modules/live/components/LiveControlOverlay.tsx';
import { InstallPwaModal } from '../components/InstallPwaModal.tsx';
import { NavigationDrawer } from '../components/NavigationDrawer.tsx';
import { LogViewer } from '../components/LogViewer.tsx';
import { AppModal } from '../components/AppModal.tsx';
import type { UserProfile } from '@modules/auth';
import type { TournamentEvent, EventRegistration } from '@modules/events';
import type { MatchHistoryItem } from '@modules/history/types';
import { type AdminTab, type Tab } from '../types.ts';
import { useAppLogger } from '../hooks/useAppLogger.ts';
import { useInstallPwa } from '../hooks/useInstallPwa.ts';
import { useGameRules } from '@modules/game/hooks/useGameRules.ts';
import { useVersionTap } from '../hooks/useVersionTap.ts';
import { GlobalOverlays } from '../components/GlobalOverlays.tsx';

export interface AppScreenRouterProps {
  authReady: boolean;
  appUrl: string;
  newAppUrl: string;
  isServiceInterrupted: boolean;
  handleCheckUpdate: () => Promise<string | null>;
  isSyncing: boolean;
  isDownloading: boolean;
  cloudMatchesCount: number;
  syncHistoryToFirebase: (forcedHistory?: MatchHistoryItem[], forceAll?: boolean) => Promise<void>;
  downloadHistoryFromFirebase: () => void;
  handleClearAllHistory: () => void;
  handleImportData: (jsonStr: string) => void;
  activeEvent: TournamentEvent | null;
  userEntryDate: number | null;
  registeredEvents: EventRegistration[];
  handleJoinTournament: (pin: string, silent?: boolean, profileOverride?: UserProfile) => Promise<void>;
  handleExitTournament: () => void;
  handleSelectEvent: (ev: TournamentEvent) => void;
  handleLogout: () => void;
  initialSpectatorPin: string | null;
  spectatorMatchId: string | null;
  spectatorPin: string | null;
  setSpectatorPin: React.Dispatch<React.SetStateAction<string | null>>;
  handleExitSpectator: () => void;
  activeCloudMatch: { id: string; sport: string } | null;
  handleConnectRemote: () => void;
  handleRejectRemote: () => void;
  isOfflineMode: boolean;
  setIsOfflineMode: React.Dispatch<React.SetStateAction<boolean>>;
  handleOfflineMode: () => void;
  handleExitOffline: () => void;
  unreadCommsCount: number;
  currentFullDeviceName: string;
  deviceId: string;
}

export const AppScreenRouter: React.FC<AppScreenRouterProps> = ({
  authReady,
  appUrl,
  newAppUrl,
  isServiceInterrupted,
  handleCheckUpdate,
  isSyncing,
  isDownloading,
  cloudMatchesCount,
  syncHistoryToFirebase,
  downloadHistoryFromFirebase,
  handleClearAllHistory,
  handleImportData,
  activeEvent,
  userEntryDate,
  registeredEvents,
  handleJoinTournament,
  handleExitTournament,
  handleSelectEvent,
  handleLogout,
  initialSpectatorPin,
  spectatorMatchId,
  spectatorPin,
  setSpectatorPin,
  handleExitSpectator,
  activeCloudMatch,
  handleConnectRemote,
  handleRejectRemote,
  isOfflineMode,
  setIsOfflineMode,
  handleOfflineMode,
  handleExitOffline,
  unreadCommsCount,
  currentFullDeviceName,
  deviceId,
}) => {
  const {
    currentScreen,
    setCurrentScreen,
    modalConfig,
    setModalConfig,
    showLiveControlOverlay,
    setShowLiveControlOverlay,
    isWaitingSync,
    setIsWaitingSync,
  } = useUI();
  const liveOverlayVisible = showLiveControlOverlay as boolean;

  const {
    userProfile,
    gameState,
    handleCloseCloudLive,
    handleDeleteJudge,
    handleControlLive,
    handleSyncScoreboard,
  } = useGame();

  const { canStartMatch } = useGameRules();
  const { logs, clearLogs } = useAppLogger();
  const { deferredPrompt } = useInstallPwa();
  const { handleVersionTap } = useVersionTap(() => setShowLogViewer(true));

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [adminTab, setAdminTab] = useState<AdminTab>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);
  const [showInstallPwa, setShowInstallPwa] = useState(false);
  const [installPromptShownSession, setInstallPromptShownSession] = useState(true);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [initialConfirmDeleteJudge, setInitialConfirmDeleteJudge] = useState(false);

  const isAdmin = userProfile.isAdmin === true;

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">

      <NavigationDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentScreen={currentScreen}
        currentTab={currentScreen === 'admin' ? adminTab : activeTab}
        onNavigate={(screen, tab) => {
          setCurrentScreen(screen);
          if (screen === 'admin' && tab) { setAdminTab(tab as AdminTab); }
          else if (tab) { setActiveTab(tab as Tab); }
        }}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        canStartMatch={canStartMatch}
      />

      <GlobalOverlays
        isWaitingSync={isWaitingSync}
        setIsWaitingSync={setIsWaitingSync}
        isServiceInterrupted={isServiceInterrupted}
        newAppUrl={newAppUrl}
        isUpdatingVersion={isUpdatingVersion}
        activeCloudMatch={activeCloudMatch}
        handleConnectRemote={handleConnectRemote}
        handleRejectRemote={handleRejectRemote}
      />

      {liveOverlayVisible ? (
        <LiveControlOverlay
          gameState={gameState}
          onClose={() => { setShowLiveControlOverlay(false); setInitialConfirmDeleteJudge(false); }}
          onControlLive={handleControlLive}
          onSyncScoreboard={handleSyncScoreboard}
          onCloseCloudLive={handleCloseCloudLive}
          onDeleteJudge={handleDeleteJudge}
          initialConfirmDeleteJudge={initialConfirmDeleteJudge}
        />
      ) : null}

      <AppModal modalConfig={modalConfig} />
      <InstallPwaModal isOpen={showInstallPwa} onClose={() => setShowInstallPwa(false)} deferredPrompt={deferredPrompt} />

      {currentScreen === 'spectator' && (spectatorMatchId || spectatorPin) && (
        <SpectatorScreen matchId={spectatorMatchId || ''} spectatorPin={spectatorPin || ''} onExit={handleExitSpectator} />
      )}

      {currentScreen === 'public-scoreboard' && initialSpectatorPin && (
        <PublicScoreboardRoute appUrl={appUrl} />
      )}

      {currentScreen === 'auth' && (
        <AuthRoute
          appUrl={appUrl}
          handleCheckUpdate={handleCheckUpdate}
          setIsUpdatingVersion={setIsUpdatingVersion}
          setIsOfflineMode={setIsOfflineMode}
          onOfflineMode={handleOfflineMode}
        />
      )}

      {currentScreen === 'settings' && (
        <SettingsRoute
          appUrl={appUrl}
          isSyncing={isSyncing}
          isDownloading={isDownloading}
          cloudMatchesCount={cloudMatchesCount}
          syncHistoryToFirebase={syncHistoryToFirebase}
          downloadHistoryFromFirebase={downloadHistoryFromFirebase}
          handleLogout={handleLogout}
          handleCheckUpdate={handleCheckUpdate}
          unreadCommsCount={unreadCommsCount}
          activeEvent={activeEvent}
          userEntryDate={userEntryDate}
          handleExitTournament={handleExitTournament}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onViewMap={id => { setFocusMatchId(id); setCurrentScreen('location'); }}
          setIsUpdatingVersion={setIsUpdatingVersion}
          onOpenMenu={() => setIsMenuOpen(true)}
          setShowInstallPwa={setShowInstallPwa}
          installPromptShownSession={installPromptShownSession}
          setInstallPromptShownSession={setInstallPromptShownSession}
        />
      )}

      {currentScreen === 'partners' && (
        <PartnersRoute
          appUrl={appUrl}
          authReady={authReady}
          activeEvent={activeEvent}
          setSpectatorPin={setSpectatorPin}
        />
      )}

      {currentScreen === 'new-game' && (
        <NewGameRoute
          activeEvent={activeEvent}
          handleExitTournament={handleExitTournament}
          isOfflineMode={isOfflineMode}
          onExitOffline={handleExitOffline}
          onOpenMenu={() => setIsMenuOpen(true)}
          setActiveTab={setActiveTab}
          onVersionTap={handleVersionTap}
        />
      )}

      {showLogViewer && <LogViewer logs={logs} onClose={() => setShowLogViewer(false)} onClear={clearLogs} />}

      {currentScreen === 'admin' && (
        <AdminRoute
          adminTab={adminTab}
          setActiveTab={setActiveTab}
          handleImportData={handleImportData}
          handleClearAllHistory={handleClearAllHistory}
          onOpenMenu={() => setIsMenuOpen(true)}
        />
      )}

      {currentScreen === 'scoreboard' &&
        new URLSearchParams(window.location.search).get('viewMode') !== 'scoreboard' &&
        (gameState || isWaitingSync) && (
          <ScoreboardRoute
            appUrl={appUrl}
            deviceId={deviceId}
            currentFullDeviceName={currentFullDeviceName}
            isOfflineMode={isOfflineMode}
            onExitOffline={handleExitOffline}
            onOpenMenu={() => setIsMenuOpen(true)}
            setActiveTab={setActiveTab}
            setInitialConfirmDeleteJudge={setInitialConfirmDeleteJudge}
          />
        )}

      {currentScreen === 'location' && (
        <LocationScreen
          focusMatchId={focusMatchId}
          onBack={() => { setFocusMatchId(null); setActiveTab('history'); setCurrentScreen('settings'); }}
        />
      )}

      {currentScreen === 'tournaments' && (
        <TournamentsScreen
          registrations={registeredEvents}
          onBack={() => setCurrentScreen('settings')}
          onJoin={handleJoinTournament}
          onSelectEvent={ev => handleSelectEvent(ev as unknown as TournamentEvent)}
        />
      )}

      {currentScreen === 'event-detail' && activeEvent && (
        <EventDetailRoute
          appUrl={appUrl}
          event={activeEvent}
          handleExitTournament={handleExitTournament}
          setModalConfig={setModalConfig}
        />
      )}

      {currentScreen === 'communications' && (
        <CommunicationsScreen onBack={() => setCurrentScreen('settings')} />
      )}

    </div>
  );
};
