import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SettingsScreen } from '@modules/settings';
import { ScoreboardScreen } from '@modules/game/screens/ScoreboardScreen.tsx';
import { NewGameScreen } from '@modules/game/screens/NewGameScreen.tsx';
import { AdminScreen } from '@modules/settings/screens/AdminScreen.tsx';
import { SpectatorScreen } from '@modules/live/screens/SpectatorScreen.tsx';
import { LocationScreen } from '@modules/history/screens/LocationScreen';
import { AuthScreen } from '@modules/auth';
import {
  PartnersScreen,
  addPartnerToState,
  applyPartnerSelection,
  autoRegisterPartnerByPin,
  createManualPartner,
} from '@modules/partners';
import { EventDetailScreen, TournamentsScreen } from '@modules/events';
import { CommunicationsScreen } from '@modules/auth/screens/CommunicationsScreen.tsx';
import { useLive } from '@modules/live';
import { useGame } from '@modules/game';
import { useUI } from '@modules/ui';
import { LiveControlOverlay } from '@modules/live/components/LiveControlOverlay.tsx';
import { InstallPwaModal } from '../components/InstallPwaModal.tsx';
import { NavigationDrawer } from '../components/NavigationDrawer.tsx';
import { LogViewer } from '../components/LogViewer.tsx';
import { AppModal } from '../components/AppModal.tsx';
import type { Partner } from '@modules/partners';
import type { UserProfile } from '@modules/auth';
import type { TournamentEvent, EventRegistration } from '@modules/events';
import type { MatchHistoryItem } from '@modules/history/types';
import { type AdminTab, type Tab, type GameState, type ControllerRecord } from '../types.ts';
import { DEFAULT_TENNIS_SETTINGS } from '../constants.ts';
import { getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useAppLogger } from '../hooks/useAppLogger.ts';
import { useInstallPwa } from '../hooks/useInstallPwa.ts';
import { useVoiceControl } from '../hooks/useVoiceControl.ts';
import { useGameRules } from '@modules/game/hooks/useGameRules.ts';
import { useScoreboardEngine } from '@modules/game/hooks/useScoreboardEngine.ts';
import { useJudgeLookup } from '../hooks/useJudgeLookup.ts';
import { useMatchDeletion } from '../hooks/useMatchDeletion.ts';
import { useLiveActions } from '../hooks/useLiveActions.ts';
import { GlobalOverlays } from '../components/GlobalOverlays.tsx';

// ─── Props ────────────────────────────────────────────────────────────────────
export interface AppScreenRouterProps {
  // Auth
  authReady: boolean;
  // Config
  appUrl: string;
  newAppUrl: string;
  isServiceInterrupted: boolean;
  handleCheckUpdate: () => Promise<string | null>;
  // History cloud
  isSyncing: boolean;
  isDownloading: boolean;
  cloudMatchesCount: number;
  syncHistoryToFirebase: (forcedHistory?: MatchHistoryItem[], forceAll?: boolean) => Promise<void>;
  downloadHistoryFromFirebase: () => void;
  handleClearAllHistory: () => void;
  handleImportData: (jsonStr: string) => void;
  // Tournament
  activeEvent: TournamentEvent | null;
  userEntryDate: number | null;
  registeredEvents: EventRegistration[];
  handleJoinTournament: (pin: string, silent?: boolean, profileOverride?: UserProfile) => Promise<void>;
  handleExitTournament: () => void;
  handleSelectEvent: (ev: TournamentEvent) => void;
  // Logout
  handleLogout: () => void;
  // Deep link / spectator
  initialSpectatorPin: string | null;
  spectatorMatchId: string | null;
  spectatorPin: string | null;
  setSpectatorPin: React.Dispatch<React.SetStateAction<string | null>>;
  handleExitSpectator: () => void;
  // Remote match
  activeCloudMatch: { id: string; sport: string } | null;
  handleConnectRemote: () => void;
  handleRejectRemote: () => void;
  // Offline mode
  isOfflineMode: boolean;
  setIsOfflineMode: React.Dispatch<React.SetStateAction<boolean>>;
  handleOfflineMode: () => void;
  handleExitOffline: () => void;
  // Communications
  unreadCommsCount: number;
  // Device / identity
  currentFullDeviceName: string;
  deviceId: string;
}

// ─── AppScreenRouter ──────────────────────────────────────────────────────────
// Renderiza o JSX de roteamento de telas. Deve ser montado dentro de
// <GameLiveProviderStack> para acessar useGame() e useLive() via contexto.
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
  // ── Context hooks (sem re-subscription; apenas lêem o contexto) ──────────
  const {
    currentScreen,
    setCurrentScreen,
    modalConfig,
    setModalConfig,
    showLiveControlOverlay,
    setShowLiveControlOverlay,
    playerQueue,
    setPlayerQueue,
    isSettingsInicialSaved,
    isSettingsRegrasSaved,
    judgePinInput,
    setJudgePinInput,
    judgeNicknameLookup,
    setJudgeNicknameLookup,
    isSearchingJudgePin,
    setIsSearchingJudgePin,
    isSavingJudge,
    isSelectingJudge,
    setIsSelectingJudge,
    isRecoveryFromMatchOver,
    isWaitingSync,
    setIsWaitingSync,
    isProfileSaved,
  } = useUI();
  const liveOverlayVisible = showLiveControlOverlay as boolean;

  const {
    userProfile,
    setUserProfile,
    partners,
    setPartners,
    matchSettings,
    setMatchSettings,
    gameState,
    setGameState,
    matchHistoryRef,
    persistHistory,
    handleLeaveLive,
    handleCloseCloudLive,
    handleDeleteJudge,
    handleControlLive,
    handleObserveLive,
    handleSyncScoreboard,
    handleAddJudge,
    handleSaveProfile,
    handleScoreUpdate,
    handleCorrectScore,
    handleUndo,
    initGameState,
    handleExportData,
    handleResetMatch,
  } = useGame();

  const {
    activeLives,
    setActiveLives,
    cloudLiveExists,
    setCloudLiveExists,
    isOriginalOwner,
    isActiveController,
    isCommandOwner,
    livePapel,
    isJudgeOnline,
    resolveTargetPin,
  } = useLive();

  const { canStartMatch, persistMatchSettings } = useGameRules();
  const { handleTogglePause, handleSmartSwitchServer } = useScoreboardEngine();
  const { voiceLogs, setVoiceLogs } = useVoiceControl();
  const { logs, clearLogs } = useAppLogger();
  const { deferredPrompt } = useInstallPwa();

  const { handleDeleteMatch, handleDeleteManyMatches } = useMatchDeletion({
    matchHistoryRef,
    persistHistory,
    setModalConfig,
    userProfile,
  });

  const { handleToggleMirroring, handleConfirmMatch } = useLiveActions({
    gameState,
    setGameState,
    userProfile,
    deviceId,
    currentFullDeviceName,
    isOriginalOwner,
    isCommandOwner,
    livePapel,
    resolveTargetPin,
    setModalConfig,
    setCloudLiveExists,
    setActiveLives,
    setMatchSettings,
  });

  // ── Estado local de UI ────────────────────────────────────────────────────
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [adminTab, setAdminTab] = useState<AdminTab>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);
  const [showInstallPwa, setShowInstallPwa] = useState(false);
  const [installPromptShownSession, setInstallPromptShownSession] = useState(true);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [_versionTapCount, setVersionTapCount] = useState(0);
  const [initialConfirmDeleteJudge, setInitialConfirmDeleteJudge] = useState(false);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Computados ────────────────────────────────────────────────────────────
  const isAdmin = userProfile.isAdmin === true;
  const initialReferralPin = useMemo(() => {
    try { return localStorage.getItem('myPlacarPendingReferralPin') || ''; } catch { return ''; }
  }, []);

  // ── Handlers de UI ────────────────────────────────────────────────────────
  const handleVersionTap = () => {
    setVersionTapCount(prev => {
      const next = prev + 1;
      if (next >= 5) { setShowLogViewer(true); return 0; }
      return next;
    });
    if (versionTapTimerRef.current) clearTimeout(versionTapTimerRef.current);
    versionTapTimerRef.current = setTimeout(() => setVersionTapCount(0), 2000);
  };

  const handleSelectJudgeFromPartners = (partner: Partner) => {
    setJudgePinInput(partner.pin || '');
    setJudgeNicknameLookup(partner.nickname);
    setIsSelectingJudge(false);
    setCurrentScreen('scoreboard');
  };

  const handleConfirmPartners = (team1: Partner[], team2: Partner[]) => {
    setMatchSettings(prev => applyPartnerSelection(prev, team1, team2));
  };

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
    } catch { return null; }
  };

  const handleAddTournamentPartner = (pin: string, nickname: string, gender: 'M' | 'F', name?: string) => {
    const partner = createManualPartner({ pin, nickname, gender, name });
    setPartners(prev => addPartnerToState(prev, partner));
  };

  // ── Hook: lookup juiz por PIN ─────────────────────────────────────────────
  useJudgeLookup({ judgePinInput, setIsSearchingJudgePin, setJudgeNicknameLookup });

  // ── Effect: prompt de instalação PWA ─────────────────────────────────────
  useEffect(() => {
    if (userProfile.email && currentScreen === 'settings' && !installPromptShownSession) {
      const isStandalone = globalThis.matchMedia('(display-mode: standalone)').matches ||
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
  }, [userProfile.email, currentScreen, installPromptShownSession]);

  // ─── JSX ─────────────────────────────────────────────────────────────────
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

      {/* ── Overlays globais ─────────────────────────────────────────────── */}
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

      {/* ── Telas ────────────────────────────────────────────────────────── */}
      {currentScreen === 'spectator' && (spectatorMatchId || spectatorPin) && (
        <SpectatorScreen matchId={spectatorMatchId || ''} spectatorPin={spectatorPin || ''} onExit={handleExitSpectator} />
      )}

      {/* Modo placar público: sem login, sem LiveIndicator — acesso via QR/link/WhatsApp */}
      {currentScreen === 'public-scoreboard' && initialSpectatorPin && !gameState && (
        <div className="flex items-center justify-center h-screen w-screen bg-slate-900">
          <Loader2 className="animate-spin text-white w-10 h-10" />
        </div>
      )}
      {currentScreen === 'public-scoreboard' && initialSpectatorPin && gameState && (
        <ScoreboardScreen
          appUrl={appUrl}
          onScoreUpdate={() => {}}
          onUndo={() => {}}
          onSwitchServer={() => {}}
          onTogglePause={() => {}}
          onBack={() => {}}
          onHome={() => {}}
          onToggleMirroring={() => {}}
          onToggleWatchMode={() => {}}
          isSettingsInicialSaved={false}
          isSettingsRegrasSaved={false}
          isAdmin={false}
        />
      )}

      {currentScreen === 'auth' && (
        <AuthScreen
          appUrl={appUrl}
          onAuthSuccess={(p, s) => {
            setIsOfflineMode(false);
            if (s) {
              try {
                localStorage.setItem('myPlacarUserProfile', JSON.stringify(p));
                localStorage.setItem('myPlacarSavedPin', p.pin);
                localStorage.setItem('myPlacarSavedEmail', p.email);
              } catch {}
            }
            setUserProfile(p);
            setCurrentScreen('settings');
          }}
          onCheckUpdate={() => handleCheckUpdate().then(v => v ?? false)}
          setIsUpdatingVersion={setIsUpdatingVersion}
          initialReferralPin={initialReferralPin}
          onOfflineMode={handleOfflineMode}
        />
      )}

      {currentScreen === 'settings' && (
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
          onViewMap={id => { setFocusMatchId(id); setCurrentScreen('location'); }}
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
          onDeletePartners={ids => setModalConfig({
            title: 'Excluir parceiros?', message: 'Apagar registro permanentemente?', confirmLabel: 'Excluir', variant: 'danger',
            onConfirm: () => { setPartners(prev => prev.filter(p => !ids.has(p.id))); setModalConfig(null); },
            onCancel: () => setModalConfig(null),
          })}
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
          onOpenMenu={() => setIsMenuOpen(true)}
        />
      )}

      {currentScreen === 'partners' && (
        <PartnersScreen
          appUrl={appUrl}
          isAuthReady={authReady}
          playerQueue={playerQueue}
          setPlayerQueue={setPlayerQueue}
          onBack={() => {
            if (isSelectingJudge) { setIsSelectingJudge(false); setCurrentScreen('scoreboard'); }
            else setCurrentScreen('settings');
          }}
          isDoubles={matchSettings.isDoubles}
          onUpdateSettings={updates => setMatchSettings(prev => ({ ...prev, ...updates }))}
          onConfirmSelection={handleConfirmPartners}
          onSelectPartner={isSelectingJudge ? handleSelectJudgeFromPartners : undefined}
          p1Color={matchSettings.p1Color}
          p2Color={matchSettings.p2Color}
          activeLives={activeLives}
          onWatchLive={pin => {
            const isJudge = activeLives.find(l => l.ownerPin?.toUpperCase() === pin.toUpperCase())?.judgePin?.toUpperCase() === userProfile.pin.toUpperCase();
            if (isJudge) { handleObserveLive(pin); }
            else { setSpectatorPin(pin); setCurrentScreen('spectator'); }
          }}
          onDeletePartners={ids => setModalConfig({
            title: 'Excluir jogadores?',
            message: 'Deseja excluir os jogadores selecionados?',
            confirmLabel: 'Excluir',
            variant: 'danger',
            onConfirm: () => {
              setPartners(prev => prev.filter(p => !ids.has(p.id)));
              setPlayerQueue(prev => {
                const filtered = prev.filter(p => !p.isSelected);
                const diff = prev.length - filtered.length;
                const padding = Array.from({ length: diff }, (_, i) => ({ id: `q_${Date.now()}_pad_${i}`, name: '', gender: 'M' as const }));
                return [...filtered, ...padding];
              });
            },
            onCancel: () => setModalConfig(null),
          })}
          activeEvent={activeEvent}
        />
      )}

      {currentScreen === 'new-game' && (
        <NewGameScreen
          baseSettings={DEFAULT_TENNIS_SETTINGS}
          onBack={() => { persistMatchSettings(); setCurrentScreen('settings'); }}
          onHome={() => { persistMatchSettings(); setCurrentScreen('settings'); }}
          onGoToScoreboard={() => { persistMatchSettings(); initGameState(false); }}
          onNavigateToTab={t => { persistMatchSettings(); setActiveTab(t); setCurrentScreen('settings'); }}
          gameState={gameState}
          onStartMatch={() => { persistMatchSettings(); initGameState(true); }}
          onPlayShortcut={() => { persistMatchSettings(); initGameState(false); }}
          isSettingsRegrasSaved={isSettingsRegrasSaved}
          isSettingsInicialSaved={isSettingsInicialSaved}
          canStartMatch={canStartMatch}
          onSportChange={() => {}}
          cloudLiveExists={cloudLiveExists}
          onOpenLiveControl={() => setShowLiveControlOverlay(true)}
          isController={isActiveController}
          activeEvent={activeEvent}
          onJoinTournament={() => setCurrentScreen('tournaments')}
          onExitTournament={handleExitTournament}
          onOpenMenu={() => { persistMatchSettings(); setIsMenuOpen(true); }}
          isOfflineMode={isOfflineMode}
          onExitOffline={handleExitOffline}
          onVersionTap={handleVersionTap}
        />
      )}

      {showLogViewer && <LogViewer logs={logs} onClose={() => setShowLogViewer(false)} onClear={clearLogs} />}

      {currentScreen === 'admin' && (
        <AdminScreen
          onBack={() => setCurrentScreen('settings')}
          onNavigateToTab={t => { setActiveTab(t); setCurrentScreen('settings'); }}
          onOpenRules={() => setCurrentScreen('new-game')}
          onExportData={handleExportData}
          onImportData={handleImportData}
          onClearAllHistory={() => setModalConfig({
            title: 'Limpar histórico?', message: 'Apagará permanentemente os registros locais e na nuvem.', confirmLabel: 'Sim, apagar', variant: 'danger',
            onConfirm: () => handleClearAllHistory(),
            onCancel: () => setModalConfig(null),
          })}
          initialTab={adminTab}
          onOpenMenu={() => setIsMenuOpen(true)}
        />
      )}

      {currentScreen === 'scoreboard' &&
        new URLSearchParams(window.location.search).get('viewMode') !== 'scoreboard' &&
        (gameState || isWaitingSync) && (
          <ScoreboardScreen
            appUrl={appUrl}
            onScoreUpdate={handleScoreUpdate}
            judgePinInput={judgePinInput}
            setJudgePinInput={setJudgePinInput}
            isSearchingJudgePin={isSearchingJudgePin}
            judgeNicknameLookup={judgeNicknameLookup}
            isSavingJudge={isSavingJudge}
            onAddJudge={() => handleAddJudge(judgePinInput, judgeNicknameLookup).then(() => { setJudgePinInput(''); setJudgeNicknameLookup(''); })}
            onDeleteJudge={() => { setInitialConfirmDeleteJudge(true); setShowLiveControlOverlay(true); }}
            isJudgeOnline={isJudgeOnline}
            onSelectJudgeFromPartners={() => { setIsSelectingJudge(true); setCurrentScreen('partners'); }}
            onUndo={handleUndo}
            onSwitchServer={handleSmartSwitchServer}
            onTogglePause={handleTogglePause}
            onBack={() => {
              // C2: diálogos de saída por papel
              const liveAtiva = gameState?.isMirroringActive && !(gameState.isMirroringActive && gameState.isLiveClosed) && !gameState.isConfirmedFinished;
              if (liveAtiva) {
                if (isOriginalOwner && isCommandOwner) {
                  setModalConfig({
                    title: 'Você é o proprietário',
                    message: 'A live continua ativa mesmo depois que você sair. O que deseja fazer?',
                    confirmLabel: 'Sair da tela (live continua)',
                    onConfirm: () => { setModalConfig(null); setCurrentScreen('new-game'); },
                    onCancel: () => setModalConfig(null),
                  });
                } else if (isCommandOwner) {
                  setCurrentScreen('new-game');
                } else {
                  handleLeaveLive(); setCurrentScreen('new-game');
                }
              } else {
                handleLeaveLive(); setCurrentScreen('new-game');
              }
            }}
            onHome={() => {
              // C2: mesma lógica de diálogos, destino = settings
              const liveAtiva = gameState?.isMirroringActive && !(gameState.isMirroringActive && gameState.isLiveClosed) && !gameState.isConfirmedFinished;
              if (liveAtiva) {
                if (isOriginalOwner && isCommandOwner) {
                  setModalConfig({
                    title: 'Você é o proprietário',
                    message: 'A live continua ativa mesmo depois que você sair. O que deseja fazer?',
                    confirmLabel: 'Sair da tela (live continua)',
                    onConfirm: () => { setModalConfig(null); setCurrentScreen('settings'); },
                    onCancel: () => setModalConfig(null),
                  });
                } else if (isCommandOwner) {
                  setCurrentScreen('settings');
                } else {
                  handleLeaveLive(); setCurrentScreen('settings');
                }
              } else {
                handleLeaveLive(); setCurrentScreen('settings');
              }
            }}
            onNavigateToTab={t => { setActiveTab(t); setCurrentScreen('settings'); }}
            isSettingsInicialSaved={isSettingsInicialSaved}
            isSettingsRegrasSaved={isSettingsRegrasSaved}
            onToggleMirroring={handleToggleMirroring}
            onCorrectScore={handleCorrectScore}
            isAdmin={isAdmin}
            onConfirmMatch={handleConfirmMatch}
            isRecoveryFromMatchOver={isRecoveryFromMatchOver}
            currentDeviceId={deviceId}
            currentDeviceFullLabel={currentFullDeviceName}
            onOpenLiveControl={() => setShowLiveControlOverlay(true)}
            onDeleteLive={() => {
              setModalConfig({
                title: 'Encerrar a live?',
                message: 'Todos os participantes perderão a conexão.',
                confirmLabel: 'Encerrar',
                variant: 'danger',
                onConfirm: async () => { setModalConfig(null); await handleCloseCloudLive(); },
                onCancel: () => setModalConfig(null),
              });
            }}
            onResetMatch={handleResetMatch}
            onOpenMenu={() => setIsMenuOpen(true)}
            isOfflineMode={isOfflineMode}
            onExitOffline={handleExitOffline}
            onToggleWatchMode={() => setMatchSettings(prev => ({ ...prev, isWatchMode: !prev.isWatchMode }))}
            onToggleScoreboardMode={() => {
              setMatchSettings(prev => ({ ...prev, isScoreboardMode: !prev.isScoreboardMode }));
              setGameState(p => p ? { ...p, matchConfig: { ...p.matchConfig, isScoreboardMode: !p.matchConfig.isScoreboardMode } } : null);
            }}
            voiceLogs={voiceLogs}
            setVoiceLogs={setVoiceLogs}
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
        <EventDetailScreen
          appUrl={appUrl}
          event={activeEvent}
          onBack={() => setCurrentScreen('tournaments')}
          userProfile={userProfile}
          onExitTournament={handleExitTournament}
          onAddPartner={handleAddTournamentPartner}
          partners={partners}
          onStartTournamentMatch={(match, pair1, pair2, ev) => initGameState(true, { match, pair1, pair2, event: ev })}
          setModalConfig={setModalConfig}
        />
      )}

      {currentScreen === 'communications' && (
        <CommunicationsScreen onBack={() => setCurrentScreen('settings')} />
      )}

    </div>
  );
};
