import React from 'react';
import { useGame } from '@modules/game';
import { UIProvider, useUI } from '@modules/ui';
import { GameLiveProviderStack } from './app/GameLiveProviderStack.tsx';
import { AppScreenRouter } from './app/AppScreenRouter.tsx';
import { ErrorBoundary } from '@app/shell/ErrorBoundary';
import { getInitialScreen } from '@app/appNavigation';
import { getDeviceId } from '@shared/utils/device';
import { useOnlineSync } from '@shared/hooks/useOnlineSync';
import { useWakeLock } from '@shared/hooks/useWakeLock';
import { useAppAuth } from '@app/hooks/useAppAuth';
import { useAppConfig } from '@app/hooks/useAppConfig';
import { useAppLogout } from '@app/hooks/useAppLogout';
import { useCommunicationsBadge } from '@modules/communications';
import { useHistoryCloud } from '@modules/history';
import { useTournamentSession } from '@modules/events';

import { useDeepLinkScreen } from '@app/hooks/useDeepLinkScreen';
const LiveSyncManager = React.lazy(() => import('./app/LiveSyncManager.tsx'));
import { useRemoteCloudMatch } from '@modules/live';
import { useAppOfflineMode } from '@app/hooks/useAppOfflineMode';
import { useAppStartup } from '@app/hooks/useAppStartup';
import { useAppDeviceName } from '@app/hooks/useAppDeviceName';

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
  const { unreadCommsCount } = useCommunicationsBadge({ pin: userProfile.pin, email: userProfile.email });
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



  // Mantém a tela acesa enquanto o placar estiver visível
  useWakeLock(currentScreen === 'scoreboard' || currentScreen === 'public-scoreboard');

  useOnlineSync({
    onOnline: () => {},
    onOffline: () => setIsOfflineMode(true),
  });

  // ── Render ────────────────────────────────────────────────────────────────
  // LiveSyncManager é carregado de forma lazy — o SDK do Firestore e toda a
  // lógica de sincronização (~1000 linhas) só são baixados após o primeiro paint.
  const shouldLoadLiveSync =
    userProfile.pin !== '' || currentScreen === 'public-scoreboard';

  return (
    <>
      {shouldLoadLiveSync && (
        <React.Suspense fallback={null}>
          <LiveSyncManager
            deviceId={deviceId}
            currentFullDeviceName={currentFullDeviceName}
            initialSpectatorPin={initialSpectatorPin}
          />
        </React.Suspense>
      )}
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
    </>
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
