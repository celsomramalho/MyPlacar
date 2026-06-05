import React, { useEffect, useState, Suspense, lazy } from 'react';

const ScoreboardRoute = lazy(() => import('./ScoreboardRoute.tsx').then(m => ({ default: m.ScoreboardRoute })));
const SettingsRoute = lazy(() => import('./SettingsRoute.tsx').then(m => ({ default: m.SettingsRoute })));
const PartnersRoute = lazy(() => import('./PartnersRoute.tsx').then(m => ({ default: m.PartnersRoute })));
const NewGameRoute = lazy(() => import('./NewGameRoute.tsx').then(m => ({ default: m.NewGameRoute })));
const AdminRoute = lazy(() => import('./AdminRoute.tsx').then(m => ({ default: m.AdminRoute })));
const AuthRoute = lazy(() => import('./AuthRoute.tsx').then(m => ({ default: m.AuthRoute })));
const PublicScoreboardRoute = lazy(() => import('./PublicScoreboardRoute.tsx').then(m => ({ default: m.PublicScoreboardRoute })));
const EventDetailRoute = lazy(() => import('./EventDetailRoute.tsx').then(m => ({ default: m.EventDetailRoute })));
const SpectatorScreen = lazy(() => import('@modules/live/screens/SpectatorScreen.tsx').then(m => ({ default: m.SpectatorScreen })));
const LocationScreen = lazy(() => import('@modules/history/screens/LocationScreen').then(m => ({ default: m.LocationScreen })));
const TournamentsScreen = lazy(() => import('@modules/events').then(m => ({ default: m.TournamentsScreen })));
const CommunicationsScreen = lazy(() => import('@modules/communications').then(m => ({ default: m.CommunicationsScreen })));
const HomeScreen = lazy(() => import('@modules/home').then(m => ({ default: m.HomeScreen })));

import { useLive } from '@modules/live';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { LiveControlOverlay } from '@modules/live/components/LiveControlOverlay.tsx';
import { InstallPwaModal } from '@app/shell/InstallPwaModal';
import { NavigationDrawer } from '@app/shell/NavigationDrawer';
import { LogViewer } from '@app/shell/LogViewer';
import { AppModal } from '@app/shell/AppModal';
import type { UserProfile } from '@modules/auth';
import type { TournamentEvent, EventRegistration } from '@modules/events';
import type { MatchHistoryItem } from '@modules/history/types';
import { type AdminTab, type Tab } from '../types.ts';
import { useAppLogger } from '@app/hooks/useAppLogger';
import { useInstallPwa } from '@pwa/installPrompt';
import { useGameRules } from '@modules/game/hooks/useGameRules.ts';
import { useVersionTap } from '@app/hooks/useVersionTap';
import { GlobalOverlays } from '@app/shell/GlobalOverlays';

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
  const offlineAllowedScreens = currentScreen === 'scoreboard' || currentScreen === 'new-game';

  useEffect(() => {
    if (isOfflineMode && gameState && !offlineAllowedScreens) {
      setCurrentScreen('scoreboard');
    }
  }, [isOfflineMode, gameState, offlineAllowedScreens, setCurrentScreen]);

  const handleDrawerNavigate = (screen: Parameters<typeof setCurrentScreen>[0], tab?: string) => {
    if (isOfflineMode && screen !== 'scoreboard' && screen !== 'new-game') {
      setCurrentScreen('scoreboard');
      return;
    }

    setCurrentScreen(screen);
    if (screen === 'admin' && tab) { setAdminTab(tab as AdminTab); }
    else if (tab) { setActiveTab(tab as Tab); }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col">

      <NavigationDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentScreen={currentScreen}
        currentTab={currentScreen === 'admin' ? adminTab : activeTab}
        onNavigate={handleDrawerNavigate}
        onLogout={handleLogout}
        onExitOffline={handleExitOffline}
        isAdmin={isAdmin}
        canStartMatch={canStartMatch}
        isOfflineMode={isOfflineMode}
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
      {showLogViewer && <LogViewer logs={logs} onClose={() => setShowLogViewer(false)} onClear={clearLogs} />}

      <Suspense fallback={
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] bg-slate-50">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-400 animate-pulse">Carregando...</p>
        </div>
      }>
        {currentScreen === 'spectator' && (spectatorMatchId || spectatorPin) && (
          <SpectatorScreen matchId={spectatorMatchId || ''} spectatorPin={spectatorPin || ''} onExit={handleExitSpectator} />
        )}

        {currentScreen === 'public-scoreboard' && initialSpectatorPin && (
          <PublicScoreboardRoute appUrl={appUrl} />
        )}

        {currentScreen === 'home' && (
          <HomeScreen
            userProfile={userProfile}
            unreadCommsCount={unreadCommsCount}
            onNavigate={(screen, tab) => {
              setCurrentScreen(screen);
              if (tab) setActiveTab(tab);
            }}
            onLogout={handleLogout}
            onCheckUpdate={handleCheckUpdate}
            onOpenMenu={() => setIsMenuOpen(true)}
          />
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
            onOpenMenu={() => setIsMenuOpen(true)}
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
            onOpenMenu={() => setIsMenuOpen(true)}
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
      </Suspense>

    </div>
  );
};
