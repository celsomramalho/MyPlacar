import React from 'react';
import { useGame } from '@modules/game';
import { UIProvider, useUI } from '@modules/ui';
import { GameLiveProviderStack } from './app/GameLiveProviderStack.tsx';
import { AppScreenRouter } from './app/AppScreenRouter.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { getInitialScreen } from './utils/appNavigation.ts';
import { getDeviceId } from './utils/device.ts';
import { useOnlineSync } from './hooks/useOnlineSync.ts';
import { useWakeLock } from './hooks/useWakeLock.ts';
import { useAppAuth } from './hooks/useAppAuth.ts';
import { useAppConfig } from './hooks/useAppConfig.ts';
import { useAppLogout } from './hooks/useAppLogout.tsx';
import { useCommunicationsBadge } from './hooks/useCommunicationsBadge.ts';
import { useHistoryCloud } from './hooks/useHistoryCloud.ts';
import { useTournamentSession } from './hooks/useTournamentSession.tsx';
import { useDeepLinkScreen } from './hooks/useDeepLinkScreen.ts';
import { useLiveFirestoreSync } from './hooks/useLiveFirestoreSync.tsx';
import { useRemoteCloudMatch } from './hooks/useRemoteCloudMatch.ts';
import { useAppOfflineMode } from './hooks/useAppOfflineMode.ts';
import { useAppStartup } from './hooks/useAppStartup.ts';
import { useAppDeviceName } from './hooks/useAppDeviceName.ts';

// ─── AppContent ────────────────────────────────────────────────────────────────
// Orquestra side-effects e hooks com estado. Renderiza dentro de
// <GameLiveProviderStack> (UIProvider → Live → Game) e delega o JSX
// de roteamento de telas ao <AppScreenRouter>.
const AppContent: React.FC = () => {
  const deviceId = getDeviceId();

  const { setModalConfig, playerQueue, currentScreen } = useUI();
  const { userProfile, partners, matchSettings } = useGame();

  // ── Hooks com estado (cada um instanciado UMA única vez aqui) ─────────────
  const { authReady } = useAppAuth();
  const { appUrl, newAppUrl, isServiceInterrupted, handleCheckUpdate } = useAppConfig(authReady);
  const { unreadCommsCount } = useCommunicationsBadge(userProfile.pin);
  const {
    activeEvent,
    userEntryDate,
    registeredEvents,
    handleJoinTournament,
    handleExitTournament,
    handleSelectEvent,
    clearTournamentSession,
  } = useTournamentSession();
  const { handleLogout } = useAppLogout(clearTournamentSession, () => {});
  const {
    isSyncing,
    isDownloading,
    cloudMatchesCount,
    syncHistoryToFirebase,
    downloadHistoryFromFirebase,
    handleClearAllHistory,
    handleImportData,
  } = useHistoryCloud(authReady);
  const {
    initialSpectatorPin,
    spectatorMatchId,
    spectatorPin,
    setSpectatorPin,
    handleExitSpectator,
  } = useDeepLinkScreen(handleLogout);
  const { activeCloudMatch, handleConnectRemote, handleRejectRemote } = useRemoteCloudMatch();
  const { isOfflineMode, setIsOfflineMode, handleOfflineMode, handleExitOffline } = useAppOfflineMode();

  // ── Computados ────────────────────────────────────────────────────────────
  const currentFullDeviceName = useAppDeviceName(matchSettings.deviceLabel, userProfile.nickname);

  // ── Hooks de side-effect (listeners / wake-lock / startup) ───────────────
  useAppStartup({ partners, playerQueue, userProfile, matchSettings, setModalConfig });

  useLiveFirestoreSync({ deviceId, currentFullDeviceName, initialSpectatorPin });

  // Mantém a tela acesa enquanto o placar estiver visível
  useWakeLock(currentScreen === 'scoreboard' || currentScreen === 'public-scoreboard');

  useOnlineSync({
    onOnline: () => {},
    onOffline: () => setIsOfflineMode(true),
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppScreenRouter
      authReady={authReady}
      appUrl={appUrl}
      newAppUrl={newAppUrl}
      isServiceInterrupted={isServiceInterrupted}
      handleCheckUpdate={handleCheckUpdate}
      isSyncing={isSyncing}
      isDownloading={isDownloading}
      cloudMatchesCount={cloudMatchesCount}
      syncHistoryToFirebase={syncHistoryToFirebase}
      downloadHistoryFromFirebase={downloadHistoryFromFirebase}
      handleClearAllHistory={handleClearAllHistory}
      handleImportData={handleImportData}
      activeEvent={activeEvent}
      userEntryDate={userEntryDate}
      registeredEvents={registeredEvents}
      handleJoinTournament={handleJoinTournament}
      handleExitTournament={handleExitTournament}
      handleSelectEvent={handleSelectEvent}
      handleLogout={handleLogout}
      initialSpectatorPin={initialSpectatorPin}
      spectatorMatchId={spectatorMatchId}
      spectatorPin={spectatorPin}
      setSpectatorPin={setSpectatorPin}
      handleExitSpectator={handleExitSpectator}
      activeCloudMatch={activeCloudMatch}
      handleConnectRemote={handleConnectRemote}
      handleRejectRemote={handleRejectRemote}
      isOfflineMode={isOfflineMode}
      setIsOfflineMode={setIsOfflineMode}
      handleOfflineMode={handleOfflineMode}
      handleExitOffline={handleExitOffline}
      unreadCommsCount={unreadCommsCount}
      currentFullDeviceName={currentFullDeviceName}
      deviceId={deviceId}
    />
  );
};

// ─── App (root mínimo) ────────────────────────────────────────────────────────
const App: React.FC = () => (
  <ErrorBoundary>
    <UIProvider initialScreen={getInitialScreen()}>
      <GameLiveProviderStack>
        <AppContent />
      </GameLiveProviderStack>
    </UIProvider>
  </ErrorBoundary>
);

export default App;
