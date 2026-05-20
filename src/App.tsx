import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SettingsScreen } from '@modules/settings';
import { ScoreboardScreen } from './screens/ScoreboardScreen.tsx';
import { NewGameScreen } from './screens/NewGameScreen.tsx';
import { AdminScreen } from './screens/AdminScreen.tsx';
import { SpectatorScreen } from './screens/SpectatorScreen.tsx';
import { LocationScreen } from '@modules/history/screens/LocationScreen';
import { removeHistoryMatches } from '@modules/history/services/removeHistoryMatches';
import { AuthScreen } from '@modules/auth';
import { PartnersScreen, addPartnerToState, applyPartnerSelection, autoRegisterPartnerByPin, createManualPartner, hasPartnerWithPin } from '@modules/partners';
import { EventDetailScreen, TournamentsScreen, markTournamentMatchFinished, markTournamentMatchLive } from '@modules/events';
import { CommunicationsScreen } from './screens/CommunicationsScreen.tsx';
import { useLive } from '@modules/live';
import { useGame } from '@modules/game';
import { GameLiveProviderStack } from './app/GameLiveProviderStack.tsx';
import { UIProvider, useUI } from '@modules/ui';
import { LiveControlOverlay } from '@modules/live/components/LiveControlOverlay.tsx';
import { InstallPwaModal } from './components/InstallPwaModal.tsx';
import { NavigationDrawer } from './components/NavigationDrawer.tsx';
// import { Input } from './components/Input.tsx'; // unused
import type { Partner, QueuePlayer } from '@modules/partners';
import type { UserProfile } from '@modules/auth';
import type { TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events';
import { GameState, MatchSettings, Screen, PointType, AdminTab, ControllerRecord, Tab, LivePapel, LiveType, LiveLogEntry } from './types.ts';
// NOTA: adicionar 'public-scoreboard' ao tipo Screen em types.ts
import { isValidGameState, isValidMatchSettings } from './utils/validation.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { LogViewer } from './components/LogViewer.tsx';
import { AppModal } from './components/AppModal.tsx';
import { getUrlParams, getInitialScreen } from './utils/appNavigation.ts';
import {
  persistLiveOwnerPin,
  getPersistedLiveOwnerPin,
  clearLiveOwnerPin,
  assertOwnerPin,
} from './modules/live/liveHelpers.ts';
import { DEFAULT_TENNIS_SETTINGS, APP_VERSION as LOCAL_CODE_VERSION } from './constants.ts';
import { incrementScore, undoPoint } from './utils/tennisEngine.ts';
import { initPickleballState } from './utils/pickleballEngine.ts';
import { getEngineForSport } from './utils/sportEngine.ts';
import { applyGoldenRule } from './utils/formatters.ts';
import { isWatchDevice, getDeviceType, getDeviceId, resolveWatchMode } from './utils/device.ts';
import { sanitizeForFirestore } from './utils/sanitize.ts';
import { findUserByPin, getDb, clearFirestoreCache, deleteCloudMatch, deleteCloudMatches } from '@infra/firebase';

import { doc, setDoc, serverTimestamp, collection, query, where, deleteDoc, getDoc, updateDoc, onSnapshot, Firestore, deleteField, FieldValue } from 'firebase/firestore';
import { AlertCircle, RotateCw, Wifi, X, CheckCircle, Loader2, ArrowLeftRight, Trophy, WifiOff } from 'lucide-react';
import { useAppLogger } from './hooks/useAppLogger.ts';
import { useInstallPwa } from './hooks/useInstallPwa.ts';
import { useOnlineSync } from './hooks/useOnlineSync.ts';
import { useWakeLock } from './hooks/useWakeLock.ts';
import { useVoiceControl } from './hooks/useVoiceControl.ts';
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
import { useGameRules } from '@modules/game/hooks/useGameRules.ts';
import { useScoreboardEngine } from '@modules/game/hooks/useScoreboardEngine.ts';
import { deleteSupabaseMatch, deleteSupabaseMatches, mirrorUser } from '@infra/supabase';

const CURRENT_DATA_VERSION = '3.1.0'; // bumped: limpa SavedSettings_* para forçar novos defaults por esporte


// ─── AppContent ────────────────────────────────────────────────────────────────
// Lógica e JSX do app. Deve renderizar dentro de <GameLiveProviderStack>
// (UIProvider → Live → Game) para usar useGame() e useLive() diretamente.
const AppContent: React.FC = () => {
  const deviceId = getDeviceId();

  const { 
    currentScreen, setCurrentScreen, 
    modalConfig, setModalConfig, 
    showLiveControlOverlay, setShowLiveControlOverlay,
    playerQueue, setPlayerQueue,
    isSettingsInicialSaved, setIsSettingsInicialSaved,
    isSettingsRegrasSaved, setIsSettingsRegrasSaved,
    overlayAcceptedRef,
    judgePinInput, setJudgePinInput,
    judgeNicknameLookup, setJudgeNicknameLookup,
    isSearchingJudgePin, setIsSearchingJudgePin,
    isSavingJudge, setIsSavingJudge,
    isSelectingJudge, setIsSelectingJudge,
    isRecoveryFromMatchOver, setIsRecoveryFromMatchOver,
    isWaitingSync, setIsWaitingSync,
    isProfileSaved,
  } = useUI();

  const {
    userProfile,
    setUserProfile,
    partners,
    setPartners,
    matchSettings,
    setMatchSettings,
    gameState,
    setGameState,
    gameStateRef,
    matchHistory,
    setMatchHistory,
    matchHistoryRef,
    persistHistory,
    handleLeaveLive,
    finalizeMatchInternal,
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
    startGame,
    handleResetMatch,
    initGameState,
    handleExportData,
  } = useGame();

  const {
    activeLives,
    setActiveLives,
    cloudLiveExists,
    setCloudLiveExists,
    fbSyncStatus,
    setFbSyncStatus,
    activeLivesRef,
    tookControlAtRef,
    lostControlAtRef,
    isClosingLiveRef,
    lastFbScoreKeyRef,
    fbSyncTimerRef,
    hasAutoEnabledScoreboardRef,
    isOriginalOwner,
    isActiveController,
    isCurrentController,
    isCommandOwner,
    livePapel,
    liveStatus,
    indicatorRole,
    isJudgeOnline,
    isOwnerOnline,
    resolveTargetPin,
  } = useLive();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { voiceLogs, setVoiceLogs } = useVoiceControl();
  const { canStartMatch, persistMatchSettings } = useGameRules();
  const { handleTogglePause, handleSmartSwitchServer } = useScoreboardEngine();
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
  const { handleLogout } = useAppLogout(clearTournamentSession, () => setIsMenuOpen(false));
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
    urlParams,
    initialSpectatorPin,
    spectatorMatchId,
    spectatorPin,
    setSpectatorPin,
    handleExitSpectator,
  } = useDeepLinkScreen(handleLogout);
  const { activeCloudMatch, setActiveCloudMatch, handleConnectRemote, handleRejectRemote } =
    useRemoteCloudMatch();
  const { isOfflineMode, setIsOfflineMode, handleOfflineMode, handleExitOffline } =
    useAppOfflineMode();

  const currentFullDeviceName = useMemo(() => {
    const label = matchSettings.deviceLabel || 'Aparelho';
    const nick = userProfile.nickname || 'Usuário';
    return applyGoldenRule(`${label} - ${nick}`, true);
  }, [matchSettings.deviceLabel, userProfile.nickname]);

  useLiveFirestoreSync({ deviceId, currentFullDeviceName, initialSpectatorPin });

  // Mantém a tela acesa enquanto o placar estiver visível — independente de remounts do ScoreboardScreen.
  useWakeLock(currentScreen === 'scoreboard' || currentScreen === 'public-scoreboard');
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);
  const [showInstallPwa, setShowInstallPwa] = useState(false);
  const [installPromptShownSession, setInstallPromptShownSession] = useState(true);
  const { deferredPrompt } = useInstallPwa();

  const { logs, clearLogs } = useAppLogger();
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [_versionTapCount, setVersionTapCount] = useState(0);

  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleVersionTap = () => {
    setVersionTapCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setShowLogViewer(true);
        return 0;
      }
      return next;
    });
    if (versionTapTimerRef.current) clearTimeout(versionTapTimerRef.current);
    versionTapTimerRef.current = setTimeout(() => setVersionTapCount(0), 2000);
  };

  const [initialConfirmDeleteJudge, setInitialConfirmDeleteJudge] = useState(false);

  // performExit migrado para o LiveContext (Fase 7 — limpeza de lógica duplicada).
  // A lógica de saída segura da live vive em LiveContext.tsx e usa os refs do
  // contexto diretamente, sem precisar dos proxies tookControlAtRef/lostControlAtRef.
  // Remover esta cópia elimina o duplo registro de visibilitychange + beforeunload.

  useEffect(() => {
    localStorage.setItem('myPlacar_AppVersion', LOCAL_CODE_VERSION);
    localStorage.setItem('myPlacar_CrashCount', '0');
    
    const runMigration = () => {
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });

        const lastVersion = localStorage.getItem('myPlacar_DataVersion') || '2.2.23';
        if (lastVersion === CURRENT_DATA_VERSION) return;
        
        const rawHistory = localStorage.getItem('myPlacarHistory');
        if (rawHistory && rawHistory !== "undefined" && rawHistory !== "null") {
          const history = JSON.parse(rawHistory) as any[];
          const rawAssets = localStorage.getItem('myPlacarAssets');
          const assets: Record<string, string> = (rawAssets && rawAssets !== "undefined" && rawAssets !== "null") ? JSON.parse(rawAssets) : {};
          const cleanedHistory = history.map(item => {
            if (item && item.customIcon && item.sportType) {
              assets[item.sportType] = item.customIcon;
              const { customIcon: _customIcon, ...rest } = item;
              return rest;
            }
            return item;
          });
          localStorage.setItem('myPlacarHistory', JSON.stringify(cleanedHistory));
          localStorage.setItem('myPlacarAssets', JSON.stringify(assets));
        }
        // Limpa configurações salvas por esporte para que os novos
        // defaults (sets, noAd, gamesPerSet) sejam aplicados na próxima seleção
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_SavedSettings_')) localStorage.removeItem(key);
        });
        localStorage.setItem('myPlacar_DataVersion', CURRENT_DATA_VERSION);
      } catch (_e) {
        try { localStorage.setItem('myPlacar_DataVersion', CURRENT_DATA_VERSION); } catch {}
      }
    };
    runMigration();
    // Limpa flag de atualização de PWA em andamento — o app reiniciou com sucesso,
    // o beforeunload já pode fechar lives normalmente em saídas futuras.
    try { sessionStorage.removeItem('myPlacar_pwa_updating'); } catch {}
    // Seta flag de "app ativo" — usada pelo performExit para distinguir reload de saída real.
    // Se o performExit encontrar essa flag, sabe que é um reload e aborta o fechamento da live.
    try { sessionStorage.setItem('myPlacar_alive', '1'); } catch {}
  }, []);

  useEffect(() => {
    const checkQuotaError = (name?: string, message?: string, reason?: unknown) => {
      return name === 'QuotaExceededError' ||
             (reason && typeof reason === 'object' && (reason as { name?: string }).name === 'QuotaExceededError') ||
             (message && message.includes('exceeded the quota'));
    };
    const handleQuotaError = (e: ErrorEvent) => {
      const isQuotaError = checkQuotaError(e.error?.name ?? e.type, e.message, undefined);
      
      if (isQuotaError) {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });

        if (e.message && e.message.includes('firestore_mutations')) {
          setModalConfig({
            title: "Erro de armazenamento",
            message: "O limite de espaço do navegador foi atingido. Deseja limpar o cache técnico e reiniciar?",
            confirmLabel: "Limpar e reiniciar",
            variant: "danger",
            onConfirm: async () => {
              await clearFirestoreCache();
            },
            onCancel: () => setModalConfig(null)
          });
        }
      }
    };
    const handleRejectionError = (e: PromiseRejectionEvent) => {
      const isQuotaError = checkQuotaError(undefined, undefined, e.reason);
      if (isQuotaError) {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });
      }
    };
    globalThis.addEventListener('error', handleQuotaError);
    globalThis.addEventListener('unhandledrejection', handleRejectionError);
    return () => {
      globalThis.removeEventListener('error', handleQuotaError);
      globalThis.removeEventListener('unhandledrejection', handleRejectionError);
    };
  }, []);

  // PWA install prompt via useInstallPwa

  useEffect(() => {
    try {
      const data = JSON.stringify(partners);
      if (data !== "undefined") localStorage.setItem('myPlacarPartners', data);
    } catch {}
  }, [partners]);

  useEffect(() => {
    try {
      const data = JSON.stringify(playerQueue);
      if (data !== "undefined") localStorage.setItem('myPlacarPlayerQueue', data);
      if (userProfile.email && navigator.onLine) {
          const db = getDb();
          if (db) {
             setDoc(doc(db, "user_queue_metadata", userProfile.email.toLowerCase().trim()), { queue_list: playerQueue, updatedAt: Date.now() }, { merge: true }).catch(() => {});
          }
      }
    } catch {}
  }, [userProfile.email]);

  useEffect(() => {
    (window as unknown as { alert: (msg: string) => void }).alert = (msg: string) => {
      setModalConfig({ title: "Atenção", message: msg, onConfirm: () => setModalConfig(null) });
    };
  }, []);

  useEffect(() => {
    if (userProfile.email && currentScreen === 'settings' && !installPromptShownSession) {
      const isStandalone = globalThis.matchMedia('(display-mode: standalone)').matches || (globalThis.navigator as Navigator & { standalone?: boolean }).standalone === true;
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

  const isAdmin = userProfile.isAdmin === true;

  useEffect(() => {
    const overlay = document.getElementById('brightness-overlay');
    if (overlay) {
      overlay.style.opacity = ((100 - matchSettings.brightness) / 100).toString();
    }
  }, [matchSettings.brightness]);

  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [adminTab, setAdminTab] = useState<AdminTab>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);

  useOnlineSync({
    onOnline: () => {},
    onOffline: () => setIsOfflineMode(true),
  });

  const handleSelectJudgeFromPartners = (partner: Partner) => {
    setJudgePinInput(partner.pin || '');
    setJudgeNicknameLookup(partner.nickname);
    setIsSelectingJudge(false);
    setCurrentScreen('scoreboard');
  };

  useEffect(() => {
    const lookup = async () => {
      const pin = judgePinInput.toUpperCase().trim();
      if (pin.length === 5) {
        setIsSearchingJudgePin(true);
        const db = getDb();
        if (!db) { setIsSearchingJudgePin(false); return; }
        try {
          const user = await findUserByPin(db as Firestore, pin, { fallbackNickname: 'Juiz' });
          if (user) {
            setJudgeNicknameLookup(user.nickname);
          } else {
            setJudgeNicknameLookup("Usuário não localizado");
          }
        } catch (_e) {
          setJudgeNicknameLookup("");
        } finally {
          setIsSearchingJudgePin(false);
        }
      } else {
        setJudgeNicknameLookup("");
      }
    };
    lookup();
  }, [judgePinInput]);





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

      if (field) {
        setMatchSettings(prev => ({ ...prev, [`${field}Verified`]: true }));
      }

      return result.nickname;
    } catch {
      return null;
    }
  };

  const handleAddTournamentPartner = (pin: string, nickname: string, gender: 'M' | 'F', name?: string) => {
    const partner = createManualPartner({ pin, nickname, gender, name });
    setPartners(prev => addPartnerToState(prev, partner));
  };

  const initialReferralPin = useMemo(() => { try { return localStorage.getItem('myPlacarPendingReferralPin') || ''; } catch (_e) { return ''; } }, []);

  return (
      <div className="min-h-screen w-full bg-gray-50 flex flex-col">
        
      <NavigationDrawer 
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        currentScreen={currentScreen}
        currentTab={currentScreen === 'admin' ? adminTab : activeTab}
        onNavigate={(screen, tab) => {
          setCurrentScreen(screen);
          if (screen === 'admin' && tab) {
            setAdminTab(tab as AdminTab);
          } else if (tab) {
            setActiveTab(tab as Tab);
          }
        }}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        canStartMatch={canStartMatch}
      />
      {isWaitingSync && (
        <div className="fixed inset-0 z-[100002] bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
           <Loader2 className="text-blue-600 animate-spin mb-6" size={48} />
           <h2 className="text-2xl font-black text-black tracking-tight">Sincronizando com a nuvem...</h2>
           <p className="text-slate-500 font-bold mt-2 mb-10">Aguardando dados da partida ao vivo</p>
           <button onClick={() => setIsWaitingSync(false)} className="px-8 py-4 bg-gray-100 text-black rounded-2xl font-black text-xs tracking-widest active:scale-95 transition-all shadow-sm border border-gray-100" > Cancelar sincronismo </button>
        </div>
      )}
      {isServiceInterrupted && (
        <div className="fixed inset-0 z-[200000] bg-slate-900 flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[3rem] p-10 w-full max-md shadow-2xl space-y-8 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto shadow-inner">
              <AlertCircle size={48} />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Versão descontinuada</h2>
              <p className="text-sm font-bold text-slate-500 leading-relaxed">Esta versão do aplicativo não é mais suportada. Por favor, utilize o novo endereço oficial para continuar usando o My placar.</p>
            </div>
            <div className="pt-4">
              <button 
                onClick={() => globalThis.location.href = newAppUrl}
                className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-base shadow-xl shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Acessar novo endereço <ArrowLeftRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
      {showLiveControlOverlay && (
        <LiveControlOverlay
          gameState={gameState}
          onClose={() => { setShowLiveControlOverlay(false); setInitialConfirmDeleteJudge(false); }}
          onControlLive={handleControlLive}
          onSyncScoreboard={handleSyncScoreboard}
          onCloseCloudLive={handleCloseCloudLive}
          onDeleteJudge={handleDeleteJudge}
          initialConfirmDeleteJudge={initialConfirmDeleteJudge}
        />
      )}
      {activeCloudMatch && (
        <div className="fixed top-20 left-4 right-4 z-[999] bg-blue-600 text-white rounded-[2rem] p-5 shadow-2xl animate-in slide-in-from-top-10 flex flex-col gap-3">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Wifi size={24} className="animate-pulse" /></div>
              <div><p className="text-[10px] font-black tracking-tight opacity-80">Partida ativa detectada</p><p className="text-sm font-black">Conectar relógio como controle?</p></div>
           </div>
           <div className="flex gap-2">
              <button onClick={handleConnectRemote} className="flex-1 bg-white text-blue-600 py-3 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95">Conectar</button>
              <button onClick={handleRejectRemote} className="px-4 py-3 bg-white/10 rounded-xl"><X size={18} /></button>
           </div>
        </div>
      )}
      {isUpdatingVersion && (
        <div className="fixed inset-0 z-[20000] bg-blue-600 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
          <RotateCw className="text-white animate-spin mb-8" size={48} />
          <h2 className="text-3xl font-black text-white mb-4">Atualizando sistema</h2>
          <p className="text-blue-100 font-bold text-lg">Sincronizando nova versão...</p>
        </div>
      )}
      <AppModal modalConfig={modalConfig} />
      <InstallPwaModal isOpen={showInstallPwa} onClose={() => setShowInstallPwa(false)} deferredPrompt={deferredPrompt} />
      {currentScreen === 'spectator' && (spectatorMatchId || spectatorPin) && <SpectatorScreen matchId={spectatorMatchId || ''} spectatorPin={spectatorPin || ''} onExit={handleExitSpectator} />}
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
      {currentScreen === 'auth' && <AuthScreen appUrl={appUrl} onAuthSuccess={(p, s) => { 
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
      }} onCheckUpdate={handleCheckUpdate} setIsUpdatingVersion={setIsUpdatingVersion} initialReferralPin={initialReferralPin} onOfflineMode={handleOfflineMode} />}
      {currentScreen === 'settings' && <SettingsScreen 
        appUrl={appUrl}
        onDeleteMatch={id => setModalConfig({ title: "Excluir partida?", message: "Apagar registro permanentemente?", confirmLabel: "Excluir", variant: 'danger', onConfirm: () => {
          persistHistory(removeHistoryMatches(matchHistoryRef.current, [id]));
          setModalConfig(null);
          const db = getDb(); const cleanEmail = userProfile.email?.toLowerCase().trim();
          if (db && cleanEmail && navigator.onLine) {
            deleteCloudMatch(db as Firestore, id).catch(() => {});
            deleteSupabaseMatch(id);
          }
        }, onCancel: () => setModalConfig(null) })}
        onDeleteManyMatches={ids => setModalConfig({ title: `Excluir ${ids.size} partidas?`, message: "Apagar registros permanentemente?", confirmLabel: "Excluir", variant: 'danger', onConfirm: () => {
          persistHistory(removeHistoryMatches(matchHistoryRef.current, ids));
          setModalConfig(null);
          const db = getDb(); const cleanEmail = userProfile.email?.toLowerCase().trim();
          if (db && cleanEmail && navigator.onLine) {
            deleteCloudMatches(db as Firestore, ids).catch(() => {});
            deleteSupabaseMatches([...ids]);
          }
        }, onCancel: () => setModalConfig(null) })}
        onBack={() => { persistMatchSettings(); setCurrentScreen('settings'); }} onNewGame={() => { persistMatchSettings(); setCurrentScreen('new-game'); }} gameState={gameState} onStart={() => { persistMatchSettings(); initGameState(true); }} onPlayShortcut={() => { persistMatchSettings(); initGameState(false); }} onOpenRules={() => { persistMatchSettings(); setCurrentScreen('new-game'); }} activeTab={activeTab} setActiveTab={(t) => { persistMatchSettings(); setActiveTab(t); }} onViewMap={id => { setFocusMatchId(id); setCurrentScreen('location'); }} onSaveProfile={handleSaveProfile} onLogout={handleLogout} onGoAdmin={() => setCurrentScreen('admin')} onGoToScoreboard={() => { persistMatchSettings(); initGameState(false); }} isSettingsInicialSaved={isSettingsInicialSaved} isSettingsRegrasSaved={isSettingsRegrasSaved} isProfileSaved={isProfileSaved} canStartMatch={canStartMatch} onSyncAll={(force) => syncHistoryToFirebase(undefined, force)} onDownloadHistory={downloadHistoryFromFirebase} cloudMatchesCount={cloudMatchesCount} isSyncingAll={isSyncing} isDownloading={isDownloading} onOpenPartners={() => setCurrentScreen('partners')} playerQueue={playerQueue} onAutoRegisterPartner={handleAutoRegisterPartner} 
        onDeletePartners={ids => setModalConfig({ title: "Excluir parceiros?", message: "Apagar registro permanentemente?", confirmLabel: "Excluir", variant: 'danger', onConfirm: () => {
          setPartners(prev => {
            const next = prev.filter(p => !ids.has(p.id));
            return next;
          });
        }, onCancel: () => setModalConfig(null) })}
        cloudLiveExists={cloudLiveExists} onCheckUpdate={handleCheckUpdate} setIsUpdatingVersion={setIsUpdatingVersion} onOpenLiveControl={() => setShowLiveControlOverlay(true)} role={livePapel}
        activeEvent={activeEvent} userEntryDate={userEntryDate} onJoinTournament={() => setCurrentScreen('tournaments')} onExitTournament={handleExitTournament}
        onOpenCommunications={() => setCurrentScreen('communications')} unreadCount={unreadCommsCount}
        onOpenMenu={() => setIsMenuOpen(true)}
      />}
      {currentScreen === 'partners' && <PartnersScreen appUrl={appUrl} isAuthReady={authReady} playerQueue={playerQueue} setPlayerQueue={setPlayerQueue} onBack={() => { if (isSelectingJudge) { setIsSelectingJudge(false); setCurrentScreen('scoreboard'); } else setCurrentScreen('settings'); }} isDoubles={matchSettings.isDoubles} onUpdateSettings={(updates) => setMatchSettings(prev => ({ ...prev, ...updates }))} onConfirmSelection={handleConfirmPartners} onSelectPartner={isSelectingJudge ? handleSelectJudgeFromPartners : undefined} p1Color={matchSettings.p1Color} p2Color={matchSettings.p2Color} activeLives={activeLives} onWatchLive={(pin) => { 
        const isJudge = activeLives.find(l => l.ownerPin?.toUpperCase() === pin.toUpperCase())?.judgePin?.toUpperCase() === userProfile.pin.toUpperCase();
        if (isJudge) {
          handleObserveLive(pin);
        } else {
          setSpectatorPin(pin); 
          setCurrentScreen('spectator'); 
        }
      }} 
        onDeletePartners={(ids) => setModalConfig({ 
          title: "Excluir jogadores?", 
          message: `Deseja excluir os jogadores selecionados?`, 
          confirmLabel: "Excluir", 
          variant: 'danger', 
          onConfirm: () => {
            setPartners(prev => {
              const next = prev.filter(p => !ids.has(p.id));
              return next;
            });
            setPlayerQueue(prev => {
              const filtered = prev.filter(p => !p.isSelected);
              const diff = prev.length - filtered.length;
              const padding = Array.from({ length: diff }, (_, i) => ({ id: `q_${Date.now()}_pad_${i}`, name: '', gender: 'M' as const }));
              return [...filtered, ...padding];
            });
          }, 
          onCancel: () => setModalConfig(null) 
        })} 
        activeEvent={activeEvent}
      />}
      {currentScreen === 'new-game' && <NewGameScreen 
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
      />}
      {showLogViewer && <LogViewer logs={logs} onClose={() => setShowLogViewer(false)} onClear={clearLogs} />}
      {currentScreen === 'admin' && (
        <AdminScreen 
          onBack={() => setCurrentScreen('settings')} 
          onNavigateToTab={t => { setActiveTab(t); setCurrentScreen('settings'); }} 
          onOpenRules={() => setCurrentScreen('new-game')} 
          onExportData={handleExportData} 
          onImportData={handleImportData} 
          onClearAllHistory={() => setModalConfig({ title: "Limpar histórico?", message: "Apagará permanentemente os registros locais e na nuvem.", confirmLabel: "Sim, apagar", variant: "danger", onConfirm: () => handleClearAllHistory(), onCancel: () => setModalConfig(null) })}
          initialTab={adminTab}
          onOpenMenu={() => setIsMenuOpen(true)}
        />
      )}
      {currentScreen === 'scoreboard' && new URLSearchParams(window.location.search).get('viewMode') !== 'scoreboard' && (gameState || isWaitingSync) && <ScoreboardScreen 
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
        onTogglePause={handleTogglePause} onBack={() => {
        // C2: diálogos de saída por papel
        const liveAtiva = gameState?.isMirroringActive && !(gameState.isMirroringActive && gameState.isLiveClosed) && !gameState.isConfirmedFinished;
        if (liveAtiva) {
          if (isOriginalOwner && isCommandOwner) {
            // Owner controlando: 2 opções — sair da tela (live continua) ou encerrar transmissão
            setModalConfig({
              title: "Você é o proprietário",
              message: "A live continua ativa mesmo depois que você sair. O que deseja fazer?",
              confirmLabel: "Sair da tela (live continua)",
              onConfirm: () => { setModalConfig(null); handleLeaveLive(); setCurrentScreen('new-game'); },
              onCancel: () => setModalConfig(null),
            });
          } else {
            handleLeaveLive(); setCurrentScreen('new-game');
          }
        } else {
          handleLeaveLive(); setCurrentScreen('new-game');
        }
      }} onHome={() => {
        // C2: mesma lógica de diálogos, destino = settings
        const liveAtiva = gameState?.isMirroringActive && !(gameState.isMirroringActive && gameState.isLiveClosed) && !gameState.isConfirmedFinished;
        if (liveAtiva) {
          if (isOriginalOwner && isCommandOwner) {
            setModalConfig({
              title: "Você é o proprietário",
              message: "A live continua ativa mesmo depois que você sair. O que deseja fazer?",
              confirmLabel: "Sair da tela (live continua)",
              onConfirm: () => { setModalConfig(null); handleLeaveLive(); setCurrentScreen('settings'); },
              onCancel: () => setModalConfig(null),
            });
          } else {
            handleLeaveLive(); setCurrentScreen('settings');
          }
        } else {
          handleLeaveLive(); setCurrentScreen('settings');
        }
      }} onNavigateToTab={t => { setActiveTab(t); setCurrentScreen('settings'); }} isSettingsInicialSaved={isSettingsInicialSaved} isSettingsRegrasSaved={isSettingsRegrasSaved} onToggleMirroring={async a => { 
        if(!gameState || gameState.isConfirmedFinished || (gameState.isMirroringActive && gameState.isLiveClosed)) return; 
        if (a) { 
          const isStarted = (gameState.pointHistory?.length ?? 0) > 0 || gameState.p1.games > 0 || gameState.p2.games > 0 || (gameState.p1.score !== '0' && gameState.p1.score !== '') || (gameState.p2.score !== '0' && gameState.p2.score !== ''); 
          if (isStarted) { setModalConfig({ title: "Atenção", message: "Não é possível iniciar a live com a partida em andamento.", onConfirm: () => setModalConfig(null) }); return; } 
          const db = getDb();
          if (db && navigator.onLine && userProfile.pin) {
            const myPin = userProfile.pin.toUpperCase();
            const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
            // Guard: consulta o Firestore diretamente pelo pin (não depende de activeLives
            // estar populado em memória — cobre o caso de reload/latência do onSnapshot).
            // Usamos o pin próprio como fallback adicional caso targetPin venha de activeLives vazio.
            const pinsToCheck = Array.from(new Set([targetPin, myPin].filter(Boolean))) as string[];
            let foundActiveLive = false;
            for (const pin of pinsToCheck) {
              try {
                const existingSnap = await getDoc(doc(db, "live_matches", pin));
                if (existingSnap.exists() && existingSnap.data().isLiveClosed !== true) {
                  const existingData = existingSnap.data() as GameState;
                  const hasActiveController = Object.values(existingData.controllers || {}).some((c: ControllerRecord) => c.lastSeen && (Date.now() - c.lastSeen) < 30000);
                  if (hasActiveController) { foundActiveLive = true; break; }
                }
              } catch {}
            }
            if (foundActiveLive) {
              setModalConfig({ title: "Live já ativa", message: "Já existe uma transmissão ativa para esta partida. Deseja assumir o controle?", confirmLabel: "Sim", onConfirm: () => { setGameState(p => p ? {...p, isMirroringActive: true, commandOwnerId: deviceId} : null); setModalConfig(null); }, onCancel: () => setModalConfig(null) });
              return;
            }
          }
        }
        const db = getDb();
        if (a && db && navigator.onLine) {
          const myPin = userProfile.pin?.toUpperCase();
          const targetPin = resolveTargetPin('write');
          if (!targetPin) return;
        const nextControllers = {
          [deviceId]: {
            label: currentFullDeviceName,
            lastSeen: Date.now(),
            isOwner: isOriginalOwner,
            role: livePapel === 'owner' ? 'owner' : (livePapel === 'judge' ? 'judge' : 'observer'),
            status: 'controller' as const,
            deviceType: getDeviceType()
          }
        };
          // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId são imutáveis — NUNCA
          // sobrescrever com o deviceId de quem está ativando o mirroring (pode ser
          // um judge ou device secundário). Preserva os valores já gravados no gameState.
          // ownerDeviceId só é definido se ainda não existir (primeira ativação pelo owner).
          const lockedOwnerDeviceId = gameState.ownerDeviceId || (isOriginalOwner ? deviceId : undefined);
          const lockedOwnerPin = gameState.ownerPin || userProfile.pin;
          const stateToSave = sanitizeForFirestore({...gameState, isMirroringActive: true, commandOwner: currentFullDeviceName, commandOwnerId: deviceId, ownerDeviceId: lockedOwnerDeviceId, ownerPin: lockedOwnerPin, controllers: nextControllers, isLiveClosed: false});
          if (stateToSave && targetPin && assertOwnerPin(targetPin, lockedOwnerPin?.toUpperCase(), 'toggleMirroring')) {
            setDoc(doc(db, "live_matches", targetPin), stateToSave).catch(() => {});
          }
        }
        // Owner que abre a live entra sempre em ScoreboardScreen (isScoreboardMode: false).
        // isScoreboardMode é preferência local — não afeta observers nem é gravado na cloud.
        if (a) { setMatchSettings(prev => ({ ...prev, isScoreboardMode: false })); }
        setGameState(p => p ? {...p, isMirroringActive: a, isLiveClosed: false, commandOwnerId: a ? deviceId : p.commandOwnerId, matchConfig: { ...p.matchConfig, isScoreboardMode: a ? false : p.matchConfig.isScoreboardMode } } : null); 
      }} onCorrectScore={handleCorrectScore} isAdmin={isAdmin} onConfirmMatch={async () => {
        const db = getDb();
        const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
        // 2) após 4s deleta o documento do Firestore.
        if (db && targetPin && navigator.onLine) {
          try {
            await updateDoc(doc(db, "live_matches", targetPin), {
              isConfirmedFinished: true,
              isMatchOver: true,
              matchEndedAt: Date.now(),
              isLiveClosed: true,
              isMirroringActive: false
            });
            setTimeout(() => {
              deleteDoc(doc(db, "live_matches", targetPin)).catch(() => {});
            }, 4000);
          } catch {}
        }
        setGameState(p => p ? {...p, isConfirmedFinished: true, isPaused: false, isMirroringActive: false, isLiveClosed: true} : null);
        setCloudLiveExists(false);
        setActiveLives(prev => prev.filter(l => l.ownerPin?.toUpperCase() !== targetPin));
        try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {};
      }} isRecoveryFromMatchOver={isRecoveryFromMatchOver} currentDeviceId={deviceId} currentDeviceFullLabel={currentFullDeviceName} onOpenLiveControl={() => setShowLiveControlOverlay(true)} onDeleteLive={() => {
              setModalConfig({
                title: "Encerrar a live?",
                message: "Todos os participantes perderão a conexão.",
                confirmLabel: "Encerrar",
                variant: 'danger',
                onConfirm: async () => { setModalConfig(null); await handleCloseCloudLive(); },
                onCancel: () => setModalConfig(null)
              });
            }} onResetMatch={handleResetMatch} onOpenMenu={() => setIsMenuOpen(true)} isOfflineMode={isOfflineMode} onExitOffline={handleExitOffline} onToggleWatchMode={() => setMatchSettings(prev => ({ ...prev, isWatchMode: !prev.isWatchMode }))} onToggleScoreboardMode={() => { setMatchSettings(prev => ({ ...prev, isScoreboardMode: !prev.isScoreboardMode })); setGameState(p => p ? { ...p, matchConfig: { ...p.matchConfig, isScoreboardMode: !p.matchConfig.isScoreboardMode } } : null); }} voiceLogs={voiceLogs} setVoiceLogs={setVoiceLogs} />}
      {currentScreen === 'location' && <LocationScreen focusMatchId={focusMatchId} onBack={() => { setFocusMatchId(null); setActiveTab('history'); setCurrentScreen('settings'); }} />}
      {currentScreen === 'tournaments' && <TournamentsScreen registrations={registeredEvents} onBack={() => setCurrentScreen('settings')} onJoin={handleJoinTournament} onSelectEvent={(ev) => handleSelectEvent(ev as unknown as TournamentEvent)} />}
      {currentScreen === 'event-detail' && activeEvent && <EventDetailScreen appUrl={appUrl} event={activeEvent} onBack={() => setCurrentScreen('tournaments')} userProfile={userProfile} onExitTournament={handleExitTournament} onAddPartner={handleAddTournamentPartner} partners={partners} onStartTournamentMatch={(match, pair1, pair2, ev) => initGameState(true, { match, pair1, pair2, event: ev })} setModalConfig={setModalConfig} />}
      {currentScreen === 'communications' && <CommunicationsScreen onBack={() => setCurrentScreen('settings')} />}
    </div>
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
