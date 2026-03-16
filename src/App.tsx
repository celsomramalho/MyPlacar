"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthScreen } from './screens/AuthScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ScoreboardScreen } from './screens/ScoreboardScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { AdminScreen } from './screens/AdminScreen';
import { LocationScreen } from './screens/LocationScreen';
import { SpectatorScreen } from './screens/SpectatorScreen';
import { PartnersScreen } from './screens/PartnersScreen';
import { TournamentsScreen } from './screens/TournamentsScreen';
import { EventDetailScreen } from './screens/EventDetailScreen';
import { CommunicationsScreen } from './screens/CommunicationsScreen';
import { InstallPwaModal } from './components/InstallPwaModal';
import { NavigationDrawer } from './components/NavigationDrawer';
import { GameState, MatchSettings, Screen, MatchHistoryItem, UserProfile, PointType, Partner, TournamentEvent, TournamentMatch, TournamentPair, QueuePlayer } from './types';
import { isValidGameState, isValidMatchSettings } from './utils/validation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DEFAULT_TENNIS_SETTINGS, APP_VERSION as LOCAL_CODE_VERSION } from './constants';
import { incrementScore, undoPoint } from './utils/tennisEngine';
import { applyGoldenRule } from './utils/formatters';
import { getDb, clearFirestoreCache } from './firebase';
import { doc, setDoc, serverTimestamp, writeBatch, collection, query, where, getDocs, deleteDoc, getDoc, updateDoc, onSnapshot, Firestore } from 'firebase/firestore';
import { AlertCircle, Smartphone, Download, Trash2, RotateCw, Wifi, X, Antenna, Check, Settings, CheckCircle, CheckCircle2, ShieldCheck, Eye, Loader2, ArrowLeftRight, Crown, UserCheck, Gavel, User, QrCode, Users } from 'lucide-react';
import { LiveIndicator } from './components/LiveIndicator';

const CURRENT_DATA_VERSION = '3.0.0';

const LogViewer: React.FC<{logs: {type: string, msg: string, time: string}[], onClose: () => void, onClear: () => void}> = ({logs, onClose, onClear}) => {
  return (
    <div className="fixed inset-0 z-[2000] bg-black/95 text-white p-6 flex flex-col font-mono text-[10px] animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
        <div className="flex flex-col">
          <h3 className="text-sm font-black uppercase tracking-widest text-blue-400">Registros do sistema</h3>
          <p className="text-[9px] font-bold text-slate-500 mt-1">Captura de logs em tempo real</p>
        </div>
        <button onClick={onClose} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors">
          <X size={24} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar">
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
            <AlertCircle size={40} opacity={0.2} />
            <p className="italic">Nenhum registro capturado ainda.</p>
          </div>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`p-3 rounded-2xl border-l-4 ${log.type === 'error' ? 'bg-red-500/5 border-red-500/50' : log.type === 'warn' ? 'bg-amber-500/5 border-amber-500/50' : 'bg-blue-500/5 border-blue-500/50'}`}>
            <div className="flex justify-between items-center opacity-40 mb-2 text-[8px] font-black uppercase tracking-tighter">
              <span className={log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-amber-400' : 'text-blue-400'}>{log.type}</span>
              <span>{log.time}</span>
            </div>
            <div className="break-all whitespace-pre-wrap text-[11px] font-medium leading-relaxed text-slate-300">{log.msg}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={onClear} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95">Limpar</button>
        <button onClick={onClose} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 shadow-lg shadow-blue-900/20">Fechar</button>
      </div>
    </div>
  );
};

let sessionDeviceId = "";

const App: React.FC = () => {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialSpectatorMatchId = useMemo(() => urlParams.get('viewMatch'), [urlParams]);
  const initialSpectatorPin = useMemo(() => urlParams.get('viewPin'), [urlParams]);
  
  const [currentScreen, setCurrentScreen] = useState<Screen>((initialSpectatorMatchId || initialSpectatorPin) ? 'spectator' : 'auth');
  const [spectatorMatchId, setMatchId] = useState<string | null>(initialSpectatorMatchId);
  const [spectatorPin, setSpectatorPin] = useState<string | null>(initialSpectatorPin);
  const [modalConfig, setModalConfig] = useState<{title: string, message: string, onConfirm: () => void, onCancel?: () => void, confirmLabel?: string, variant?: 'info' | 'danger' | 'success', icon?: React.ReactNode} | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [cloudMatchesCount, setCloudMatchesCount] = useState(0);
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);
  const [showInstallPwa, setShowInstallPwa] = useState(false);
  const [installPromptShownSession, setInstallPromptShownSession] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isSettingsInicialSaved, setIsSettingsInicialSaved] = useState(true);
  const [isSettingsRegrasSaved, setIsSettingsRegrasSaved] = useState(true);
  const [isProfileSaved, setIsProfileSaved] = useState(true);
  const [activeCloudMatch, setActiveCloudMatch] = useState<{id: string, sport: string} | null>(null);
  const [cloudLiveExists, setCloudLiveExists] = useState<boolean>(false);
  const [activeLives, setActiveLives] = useState<GameState[]>([]);
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [appUrl, setAppUrl] = useState("https://my-placar.vercel.app/");
  const [logs, setLogs] = useState<{type: 'log' | 'error' | 'warn', msg: string, time: string}[]>([]);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'config' | 'history' | 'help' | 'profile'>('config');
  const [adminTab, setAdminTab] = useState<'configs' | 'users' | 'icons' | 'events' | 'comms'>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  const [showLiveControlOverlay, setShowLiveControlOverlay] = useState(false);
  const [confirmDeleteLive, setConfirmDeleteLive] = useState(false);
  const [confirmDeleteJudge, setConfirmDeleteJudge] = useState(false);
  const [judgePinInput, setJudgePinInput] = useState('');
  const [judgeNicknameLookup, setJudgeNicknameLookup] = useState('');
  const [isSearchingJudgePin, setIsSearchingJudgePin] = useState(false);
  const [isSelectingJudge, setIsSelectingJudge] = useState(false);
  const [isSavingJudge, setIsSavingJudge] = useState(false);
  const [isRecoveryFromMatchOver, setIsRecoveryFromMatchOver] = useState(false);
  const [isWaitingSync, setIsWaitingSync] = useState(false);
  const [isServiceInterrupted, setIsServiceInterrupted] = useState(false);
  const [newAppUrl, setNewAppUrl] = useState("");
  const [activeEvent, setActiveEvent] = useState<TournamentEvent | null>(null);
  const [userEntryDate, setUserEntryDate] = useState<number | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<any[]>([]);

  const deviceId = useMemo(() => {
    if (sessionDeviceId) return sessionDeviceId;
    let id = localStorage.getItem('myPlacar_DeviceId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('myPlacar_DeviceId', id);
    }
    sessionDeviceId = id;
    return id;
  }, []);

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const profile = safeJsonParse('myPlacarUserProfile', { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' });
    return (profile && profile.email) ? profile : { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' };
  });

  const [matchSettings, setMatchSettings] = useState<MatchSettings>(() => {
    const s = safeJsonParse('myPlacarSettings', { ...DEFAULT_TENNIS_SETTINGS, winnersStay: false });
    return s;
  });

  const [gameState, setGameState] = useState<GameState | null>(() => safeJsonParse('myPlacarActiveGameState', null));
  const [partners, setPartners] = useState<Partner[]>(() => safeJsonParse('myPlacarPartners', []));
  const [playerQueue, setPlayerQueue] = useState<QueuePlayer[]>(() => safeJsonParse('myPlacarPlayerQueue', []));
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>(() => safeJsonParse('myPlacarHistory', []));

  const matchHistoryRef = useRef<MatchHistoryItem[]>(matchHistory);
  const prevSettingsRef = useRef<MatchSettings | null>(null);
  const prevProfileRef = useRef<UserProfile | null>(null);
  const finalizationTimerRef = useRef<any>(null);
  const lastSentStateRef = useRef<string>("");

  function safeJsonParse(key: string, fallback: any) {
    try {
      const saved = localStorage.getItem(key);
      if (saved && saved !== "undefined" && saved !== "null") return JSON.parse(saved);
    } catch (e) {}
    return fallback;
  }

  const sanitizeForFirestore = (obj: any) => {
    if (!obj) return null;
    return JSON.parse(JSON.stringify(obj));
  };

  const persistHistory = useCallback((newList: MatchHistoryItem[]) => {
    setMatchHistory(newList);
    matchHistoryRef.current = newList;
    localStorage.setItem('myPlacarHistory', JSON.stringify(newList));
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleSaveProfile = async () => {
    localStorage.setItem('myPlacarUserProfile', JSON.stringify(userProfile));
    setIsProfileSaved(true);
  };

  const handleCheckUpdate = async () => {
    return false;
  };

  const handleJoinTournament = async (pin: string) => {
    setCurrentScreen('tournaments');
  };

  const handleExitTournament = () => {
    setActiveEvent(null);
  };

  const handleOfflineMode = () => {
    setIsOfflineMode(true);
    setCurrentScreen('settings');
  };

  const handleExitOffline = () => {
    setIsOfflineMode(false);
    setCurrentScreen('auth');
  };

  const handleResetMatch = () => {
    setGameState(null);
  };

  const handleScoreUpdate = (player: 1 | 2, type: PointType = 'rally', source: string = 'cb') => {
    if (!gameState) return;
    const next = incrementScore(gameState, player, type, source);
    setGameState(next);
  };

  const handleUndo = () => {
    if (!gameState) return;
    const prev = undoPoint(historyStack);
    if (prev) setGameState(prev);
  };

  const handleSmartSwitchServer = (team: 1 | 2, isPartner: boolean) => {
    // Lógica de troca de sacador
  };

  const handleCorrectScore = (type: 'game' | 'gameSet' | 'matchSet', value: string) => {
    // Lógica de correção
  };

  const handleToggleMirroring = (active: boolean) => {
    // Lógica de espelhamento
  };

  const handleAddJudge = () => {};
  const handleDeleteJudge = () => {};
  const handleSelectJudgeFromPartners = () => {};

  const isOriginalOwner = true;
  const isCurrentController = true;
  const isCommandOwner = true;
  const cloudLiveExistsLocal = false;
  const liveRole: any = 'owner';
  const isJudgeOnline = false;
  const canStartMatch = true;

  const currentFullDeviceName = "Aparelho";

  return (
    <ErrorBoundary>
      <div className="min-h-screen w-full bg-gray-50 flex flex-col">
        <NavigationDrawer 
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          userProfile={userProfile}
          currentScreen={currentScreen}
          currentTab={currentScreen === 'admin' ? adminTab : activeTab}
          onNavigate={(screen, tab) => {
            setCurrentScreen(screen);
            if (screen === 'admin' && tab) setAdminTab(tab as any);
            else if (tab) setActiveTab(tab as any);
          }}
          onLogout={handleLogout}
          isAdmin={userProfile.email === 'celsomramalho@gmail.com'}
          canStartMatch={canStartMatch}
        />

        {currentScreen === 'auth' && (
          <AuthScreen 
            appUrl={appUrl} 
            onAuthSuccess={(p) => { setUserProfile(p); setCurrentScreen('settings'); }} 
            onCheckUpdate={handleCheckUpdate} 
            setIsUpdatingVersion={setIsUpdatingVersion} 
            onOfflineMode={handleOfflineMode} 
          />
        )}

        {currentScreen === 'settings' && (
          <SettingsScreen 
            appUrl={appUrl}
            history={matchHistory} 
            setHistory={setMatchHistory} 
            onDeleteMatch={(id) => persistHistory(matchHistory.filter(m => m.id !== id))}
            onDeleteManyMatches={(ids) => persistHistory(matchHistory.filter(m => !ids.has(m.id)))}
            onBack={() => setCurrentScreen('settings')}
            onNewGame={() => setCurrentScreen('new-game')}
            gameState={gameState}
            settings={matchSettings}
            setSettings={setMatchSettings}
            onStart={() => setCurrentScreen('scoreboard')}
            onPlayShortcut={() => setCurrentScreen('scoreboard')}
            onOpenRules={() => setCurrentScreen('new-game')}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onViewMap={(id) => { setFocusMatchId(id); setCurrentScreen('location'); }}
            userProfile={userProfile}
            setUserProfile={setUserProfile}
            onSaveProfile={handleSaveProfile}
            onLogout={handleLogout}
            onGoToScoreboard={() => setCurrentScreen('scoreboard')}
            isSettingsInicialSaved={isSettingsInicialSaved}
            canStartMatch={canStartMatch}
            onOpenPartners={() => setCurrentScreen('partners')}
            partners={partners}
            onAutoRegisterPartner={async () => null}
            onOpenCommunications={() => setCurrentScreen('communications')}
            unreadCount={unreadCommsCount}
            onOpenMenu={() => setIsMenuOpen(true)}
            activeEvent={activeEvent}
            userEntryDate={userEntryDate}
            onJoinTournament={() => setCurrentScreen('tournaments')}
            onExitTournament={handleExitTournament}
            isOfflineMode={isOfflineMode}
            onExitOffline={handleExitOffline}
          />
        )}

        {currentScreen === 'scoreboard' && gameState && (
          <ScoreboardScreen 
            appUrl={appUrl}
            gameState={gameState}
            onScoreUpdate={handleScoreUpdate}
            onUndo={handleUndo}
            onSwitchServer={handleSmartSwitchServer}
            onBack={() => setCurrentScreen('new-game')}
            onHome={() => setCurrentScreen('settings')}
            isSettingsInicialSaved={isSettingsInicialSaved}
            isSettingsRegrasSaved={isSettingsRegrasSaved}
            onToggleMirroring={handleToggleMirroring}
            onCorrectScore={handleCorrectScore}
            userProfile={userProfile}
            onResetMatch={handleResetMatch}
            onOpenMenu={() => setIsMenuOpen(true)}
            isOfflineMode={isOfflineMode}
            onExitOffline={handleExitOffline}
          />
        )}

        {currentScreen === 'new-game' && (
          <NewGameScreen 
            baseSettings={DEFAULT_TENNIS_SETTINGS}
            settings={matchSettings}
            setSettings={setMatchSettings}
            onBack={() => setCurrentScreen('settings')}
            onHome={() => setCurrentScreen('settings')}
            onGoToScoreboard={() => setCurrentScreen('scoreboard')}
            gameState={gameState}
            onStartMatch={() => setCurrentScreen('scoreboard')}
            onPlayShortcut={() => setCurrentScreen('scoreboard')}
            isSettingsRegrasSaved={isSettingsRegrasSaved}
            isSettingsInicialSaved={isSettingsInicialSaved}
            canStartMatch={canStartMatch}
            activeEvent={activeEvent}
            userProfile={userProfile}
            isOfflineMode={isOfflineMode}
            onExitOffline={handleExitOffline}
            onOpenMenu={() => setIsMenuOpen(true)}
          />
        )}

        {currentScreen === 'location' && (
          <LocationScreen 
            history={matchHistory} 
            focusMatchId={focusMatchId} 
            onBack={() => setCurrentScreen('settings')} 
          />
        )}

        {currentScreen === 'tournaments' && (
          <TournamentsScreen 
            registrations={registeredEvents} 
            onBack={() => setCurrentScreen('settings')} 
            onJoin={handleJoinTournament} 
            onSelectEvent={(ev) => { setActiveEvent(ev); setCurrentScreen('event-detail'); }} 
          />
        )}

        {currentScreen === 'event-detail' && activeEvent && (
          <EventDetailScreen 
            appUrl={appUrl}
            event={activeEvent} 
            onBack={() => setCurrentScreen('tournaments')} 
            userProfile={userProfile} 
            onExitTournament={handleExitTournament} 
            onAddPartner={(pin, nick) => {}} 
            partners={partners} 
            onStartTournamentMatch={() => setCurrentScreen('scoreboard')} 
            setModalConfig={setModalConfig} 
          />
        )}

        {currentScreen === 'communications' && (
          <CommunicationsScreen 
            userProfile={userProfile} 
            onBack={() => setCurrentScreen('settings')} 
          />
        )}

        {modalConfig && (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xs shadow-2xl space-y-6 flex flex-col items-center">
              <h3 className="text-2xl font-black text-center">{modalConfig.title}</h3>
              <p className="text-black text-center">{modalConfig.message}</p>
              <div className="flex gap-3 w-full">
                {modalConfig.onCancel && <button onClick={() => setModalConfig(null)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-black text-xs">Cancelar</button>}
                <button onClick={() => { modalConfig.onConfirm(); setModalConfig(null); }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs">Ok</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;