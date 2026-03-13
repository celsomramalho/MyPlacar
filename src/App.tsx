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
import { Input } from './components/Input';
import { GameState, MatchSettings, Screen, MatchHistoryItem, UserProfile, PointType, Partner, PointEvent, QueuePlayer, TournamentEvent, TournamentMatch, TournamentPair } from './types';
import { isValidGameState, isValidMatchSettings } from './utils/validation';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DEFAULT_TENNIS_SETTINGS, APP_VERSION as LOCAL_CODE_VERSION } from './constants';
import { incrementScore, undoPoint } from './utils/tennisEngine';
import { applyGoldenRule, maskPin } from './utils/formatters';
import { getDb, clearFirestoreCache } from './firebase';
import { doc, setDoc, serverTimestamp, writeBatch, collection, query, where, getDocs, orderBy, deleteDoc, getDoc, updateDoc, onSnapshot, Firestore } from 'firebase/firestore';
import { AlertCircle, Smartphone, Download, Trash2, RotateCw, Wifi, X, Antenna, Check, Settings, CheckCircle, ShieldCheck, Eye, Loader2, ArrowLeftRight, Crown, UserCheck, Gavel, User, QrCode, Users } from 'lucide-react';
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

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsubscribe = onSnapshot(doc(db, "system", "config"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.appUrl) {
          setAppUrl(data.appUrl);
          
          // Redirecionamento automático para a url canônica se necessário
          const hostname = window.location.hostname;
          const canonicalUrl = new URL(data.appUrl);
          if (hostname !== canonicalUrl.hostname && !hostname.includes('localhost') && !hostname.includes('127.0.0.1') && !hostname.includes('.run.app')) {
            // Preserva os parâmetros da URL ao redirecionar
            const currentSearch = window.location.search;
            window.location.href = data.appUrl + currentSearch;
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

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

  const deviceId = useMemo(() => {
    if (sessionDeviceId) return sessionDeviceId;
    try {
      let id = localStorage.getItem('myPlacar_DeviceId');
      if (!id) {
        id = Math.random().toString(36).substring(2, 11);
        localStorage.setItem('myPlacar_DeviceId', id);
      }
      sessionDeviceId = id;
      return id;
    } catch (e) {
      if (!sessionDeviceId) sessionDeviceId = "session_" + Math.random().toString(36).substring(2, 11);
      return sessionDeviceId;
    }
  }, []);

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const profile = safeJsonParse('myPlacarUserProfile', { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' });
    return (profile && profile.email) ? profile : { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' };
  });

  // MC: Log Viewer para celular
  const [logs, setLogs] = useState<{type: 'log' | 'error' | 'warn', msg: string, time: string}[]>([]);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: 'log' | 'error' | 'warn', args: any[]) => {
      const msg = args.map(arg => {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`;
        return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
      }).join(' ');
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [{type, msg, time}, ...prev].slice(0, 100));
    };

    console.log = (...args) => { addLog('log', args); originalLog(...args); };
    console.error = (...args) => { addLog('error', args); originalError(...args); };
    console.warn = (...args) => { addLog('warn', args); originalWarn(...args); };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const handleVersionTap = () => {
    setVersionTapCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setShowLogViewer(true);
        return 0;
      }
      return next;
    });
    // Reset do contador após 2 segundos de inatividade
    setTimeout(() => setVersionTapCount(0), 2000);
  };

  const [matchSettings, setMatchSettings] = useState<MatchSettings>(() => {
    const s = safeJsonParse('myPlacarSettings', { ...DEFAULT_TENNIS_SETTINGS, winnersStay: false });
    try {
      s.deviceLabel = localStorage.getItem('myPlacar_LocalDeviceLabel') || '';
      s.brightness = parseInt(localStorage.getItem('myPlacar_LocalBrightness') || '100');
      s.volume = parseInt(localStorage.getItem('myPlacar_LocalVolume') || '100');
      s.isWatchMode = localStorage.getItem('myPlacar_LocalWatchMode') === 'true';
      s.selectedVoiceURI = localStorage.getItem('myPlacar_LocalVoiceURI') || s.selectedVoiceURI;
      s.voiceEnabled = localStorage.getItem('myPlacar_LocalVoiceEnabled') !== 'false';
      s.voiceScoring = localStorage.getItem('myPlacar_LocalVoiceScoring') !== 'false';
      s.actionCooldown = parseInt(localStorage.getItem('myPlacar_LocalActionCooldown') || '5');
      s.stateLockout = parseInt(localStorage.getItem('myPlacar_LocalStateLockout') || '10');

      if (!s.deviceLabel) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        s.deviceLabel = isMobile ? 'Celular' : 'Note';
        localStorage.setItem('myPlacar_LocalDeviceLabel', s.deviceLabel);
      }
    } catch (e) {}
    return s;
  });

  const [gameState, setGameState] = useState<GameState | null>(() => safeJsonParse('myPlacarActiveGameState', null));

  const isOriginalOwner = useMemo(() => {
    if (!gameState || !userProfile.pin) return false;
    return userProfile.pin.toUpperCase() === gameState.ownerPin?.toUpperCase();
  }, [gameState?.ownerPin, userProfile.pin]);

  const isCurrentController = useMemo(() => gameState?.commandOwnerId === deviceId, [gameState?.commandOwnerId, deviceId]);
  const isJudgeOnline = useMemo(() => {
    if (!gameState?.judgeNickname || !gameState?.controllers) return false;
    const now = Date.now();
    return Object.values(gameState.controllers).some((c: any) => 
      (c.nickname === gameState.judgeNickname || c.label === gameState.judgeNickname || (c.label && c.label.includes(`(${gameState.judgeNickname})`))) && (now - c.lastSeen) < 30000
    );
  }, [gameState?.judgeNickname, gameState?.controllers]);

  const isOwnerOnline = useMemo(() => {
    if (!gameState?.ownerPin || !gameState?.controllers) return false;
    const now = Date.now();
    return Object.values(gameState.controllers).some((c: any) => 
      c.isOwner && (now - c.lastSeen) < 60000
    );
  }, [gameState?.ownerPin, gameState?.controllers]);

  const isCommandOwner = useMemo(() => {
    if (!gameState || !gameState.isMirroringActive) return true;
    return isCurrentController;
  }, [gameState?.isMirroringActive, isCurrentController]);

  const liveRole = useMemo(() => { 
    if (!cloudLiveExists) return 'spectator'; 
    const myPin = userProfile.pin.toUpperCase();
    if (activeLives.some(l => l.ownerPin?.toUpperCase() === myPin)) return 'owner';
    if (activeLives.some(l => l.judgePin?.toUpperCase() === myPin)) return 'judge';
    return 'observer'; 
  }, [cloudLiveExists, userProfile.pin, activeLives]);

  const indicatorRole = useMemo(() => {
    if (!isCurrentController) return 'observer';
    return isOriginalOwner ? 'owner' : 'judge';
  }, [isCurrentController, isOriginalOwner]);

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

  const [activeEvent, setActiveEvent] = useState<TournamentEvent | null>(() => safeJsonParse('myPlacarActiveEvent', null));
  const [userEntryDate, setUserEntryDate] = useState<number | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<any[]>(() => safeJsonParse('myPlacarRegisteredEvents', []));

  const matchHistoryRef = useRef<MatchHistoryItem[]>([]);
  const prevSettingsRef = useRef<MatchSettings | null>(null);
  const prevProfileRef = useRef<UserProfile | null>(null);
  const finalizationTimerRef = useRef<any>(null);
  
  const lastSentStateRef = useRef<string>("");

  function safeJsonParse(key: string, fallback: any) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      const saved = localStorage.getItem(key);
      if (saved && saved !== "undefined" && saved !== "null" && saved.trim() !== "") {
        const parsed = JSON.parse(saved);
        if (key === 'myPlacarActiveGameState' && parsed !== null) {
          if (!isValidGameState(parsed)) {
            console.warn("GameState corrompido detectado no localStorage. Limpando...");
            localStorage.removeItem(key);
            return fallback;
          }
        }
        if (key === 'myPlacarSettings' && parsed !== null) {
          if (!isValidMatchSettings(parsed)) {
            console.warn("Settings corrompidas detectadas no localStorage. Usando padrão...");
            return fallback;
          }
        }
        return parsed;
      }
    } catch (e) {}
    return fallback;
  }

  const sanitizeForFirestore = (obj: any) => {
    if (!userProfile.email && !userProfile.pin) return null;
    const clean = JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
    const fieldsToRemove = ['isWatchMode', 'brightness', 'volume', 'deviceLabel', 'selectedVoiceURI', 'voiceEnabled', 'voiceScoring', 'actionCooldown', 'stateLockout', 'customSportIcon', 'customSportIcons', 'customCategoryIcons', 'cloudSportIcons', 'cloudCategoryIcons'];
    const deepClean = (target: any) => {
      if (!target || typeof target !== 'object') return;
      fieldsToRemove.forEach(f => { if (target[f] !== undefined) delete target[f]; });
      Object.keys(target).forEach(key => { if (target[key] && typeof target[key] === 'object') deepClean(target[key]); });
    };
    deepClean(clean);
    return clean;
  };

  const [partners, setPartners] = useState<Partner[]>(() => safeJsonParse('myPlacarPartners', []));
  const [playerQueue, setPlayerQueue] = useState<QueuePlayer[]>(() => {
    const saved = safeJsonParse('myPlacarPlayerQueue', []);
    return saved.length > 0 ? saved : Array.from({ length: 10 }, (_, i) => ({ id: `q_${Date.now()}_${i}`, name: '', gender: 'M' as const }));
  });

  const currentFullDeviceName = useMemo(() => {
    const label = matchSettings.deviceLabel || 'Aparelho';
    const nick = userProfile.nickname || 'Usuário';
    return applyGoldenRule(`${label} - ${nick}`, true);
  }, [matchSettings.deviceLabel, userProfile.nickname]);

  useEffect(() => {
    if (activeEvent) {
      localStorage.setItem('myPlacarActiveEvent', JSON.stringify(activeEvent));
      const db = getDb();
      if (db && userProfile.email && navigator.onLine) {
        const entryRef = doc(db, "events", activeEvent.pin, "entries", userProfile.email.toLowerCase().trim());
        getDoc(entryRef).then(snap => {
          if (snap.exists()) setUserEntryDate(snap.data().joinedAt);
          else setUserEntryDate(null);
        });
      }
    } else {
      localStorage.removeItem('myPlacarActiveEvent');
      setUserEntryDate(null);
    }
  }, [activeEvent, userProfile.email]);

  useEffect(() => {
    localStorage.setItem('myPlacarRegisteredEvents', JSON.stringify(registeredEvents));
  }, [registeredEvents]);

  useEffect(() => {
    const db = getDb();
    if (!db || !userProfile.pin || !navigator.onLine) return;

    const q = query(
      collection(db as any, 'communications'),
      where('targetUserId', 'in', ['all', userProfile.pin])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unread = snapshot.docs.filter(d => {
        const data = d.data();
        return !data.readBy?.includes(userProfile.pin);
      }).length;
      setUnreadCommsCount(unread);
    });

    return () => unsubscribe();
  }, [userProfile.pin]);

  useEffect(() => {
    const handleAppExit = () => {
      if (gameState?.isMirroringActive && userProfile.pin && userProfile.email && navigator.onLine) {
        const db = getDb();
        if (db) {
          const pinUpper = userProfile.pin.toUpperCase();
          if (gameState.commandOwnerId === deviceId) {
            setDoc(doc(db, "live_matches", pinUpper), { isLiveClosed: true, isMirroringActive: false }, { merge: true }).catch(() => {});
          } else {
            getDoc(doc(db, "live_matches", pinUpper)).then(snap => {
              if (snap.exists()) {
                const data = snap.data();
                const nextControllers = { ...(data.controllers || {}) };
                delete nextControllers[deviceId];
                updateDoc(doc(db, "live_matches", pinUpper), { controllers: nextControllers }).catch(() => {});
              }
            }).catch(() => {});
          }
        }
      }
    };
    window.addEventListener('beforeunload', handleAppExit);
    return () => window.removeEventListener('beforeunload', handleAppExit);
  }, [gameState, userProfile.pin, userProfile.email, deviceId]);

  useEffect(() => {
    // Sinaliza para o script de emergência que o app carregou com sucesso
    window.dispatchEvent(new CustomEvent('app-ready'));
    localStorage.setItem('myPlacar_AppVersion', LOCAL_CODE_VERSION);
    localStorage.setItem('myPlacar_CrashCount', '0');
    
    const runMigration = () => {
      try {
        // Aggressive cleanup of old backups on every load to prevent QuotaExceededError
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
              const { customIcon, ...rest } = item;
              return rest;
            }
            return item;
          });
          localStorage.setItem('myPlacarHistory', JSON.stringify(cleanedHistory));
          localStorage.setItem('myPlacarAssets', JSON.stringify(assets));
        }
        localStorage.setItem('myPlacar_DataVersion', CURRENT_DATA_VERSION);
      } catch (e) {
        try { localStorage.setItem('myPlacar_DataVersion', CURRENT_DATA_VERSION); } catch(ex) {}
      }
    };
    runMigration();
  }, []);

  useEffect(() => {
    const handleQuotaError = (e: any) => {
      const isQuotaError = e.name === 'QuotaExceededError' || 
                          (e.reason && e.reason.name === 'QuotaExceededError') ||
                          (e.message && e.message.includes('exceeded the quota'));
      
      if (isQuotaError) {
        console.error("Myplacar: Limite de armazenamento excedido (QuotaExceededError).");
        
        // 1. Limpeza imediata de backups
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });

        // 2. Se for erro do Firestore (mutations), o app pode travar.
        // Tentamos alertar o usuário se possível
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
    window.addEventListener('error', handleQuotaError);
    window.addEventListener('unhandledrejection', handleQuotaError);
    return () => {
      window.removeEventListener('error', handleQuotaError);
      window.removeEventListener('unhandledrejection', handleQuotaError);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    try {
      const data = JSON.stringify(partners);
      if (data !== "undefined") localStorage.setItem('myPlacarPartners', data);
    } catch(e) {}
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
    } catch(e) {}
  }, [playerQueue, userProfile.email]);

  useEffect(() => {
    try {
      const referral = urlParams.get('ref');
      const referralPin = urlParams.get('pin_ref') || urlParams.get('refPin');
      const joinEvent = urlParams.get('joinEvent');
      if (referral) localStorage.setItem('myPlacarPendingReferral', referral);
      if (referralPin) localStorage.setItem('myPlacarPendingReferralPin', referralPin);
      if (joinEvent) localStorage.setItem('myPlacarPendingJoinEvent', joinEvent);
      const forceLogout = urlParams.get('logout');
      if (forceLogout === 'true') handleLogout();
    } catch(e) {}
  }, [urlParams]);

  useEffect(() => {
    (window as any).alert = (msg: string) => {
      setModalConfig({ title: "Atenção", message: msg, onConfirm: () => setModalConfig(null) });
    };
  }, []);

  useEffect(() => {
    if (userProfile.email && currentScreen === 'settings' && !installPromptShownSession) {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      try {
        const isHidden = localStorage.getItem('myPlacarHideInstallPrompt') === 'true';
        if (!isStandalone && !isHidden) {
          setInstallPromptShownSession(true); 
          const timer = setTimeout(() => setShowInstallPwa(true), 3000);
          return () => clearTimeout(timer);
        }
      } catch(e) {}
    }
  }, [userProfile.email, currentScreen, installPromptShownSession]);

  const fetchUserRegistrations = async (email: string) => {
    const db = getDb();
    if (!db) return;
    try {
      const q = query(collection(db, "user_registrations", email.toLowerCase().trim(), "events"));
      const snap = await getDocs(q);
      const list: any[] = [];
      snap.forEach(d => list.push(d.data()));
      setRegisteredEvents(list.sort((a,b) => b.joinedAt - a.joinedAt));
    } catch (e) {
      console.error("Erro ao buscar inscrições:", e);
    }
  };

  useEffect(() => {
    if (userProfile.email && userProfile.pin) {
      const pendingJoin = localStorage.getItem('myPlacarPendingJoinEvent');
      if (pendingJoin) {
          handleJoinTournament(pendingJoin, true, userProfile);
          localStorage.removeItem('myPlacarPendingJoinEvent');
      } else if (currentScreen === 'auth') {
          setCurrentScreen('settings');
      }
    }
  }, [userProfile.email, userProfile.pin]);

  const handleCheckUpdate = useCallback(async () => {
    if (!navigator.onLine) return false;
    const db = getDb();
    if (!db) return false;
    try {
      const snap = await getDoc(doc(db, "system", "config"));
      if (snap.exists()) {
        const remoteVersion = (snap.data().appVersion || "").toString().trim().replace(/^v/, '');
        const localVersion = LOCAL_CODE_VERSION.trim().replace(/^v/, '');
        
        const isNewer = (remote: string, local: string) => {
          const r = remote.split('.').map(Number);
          const l = local.split('.').map(Number);
          const maxLength = Math.max(r.length, l.length);
          for (let i = 0; i < maxLength; i++) {
            const vRemote = r[i] || 0;
            const vLocal = l[i] || 0;
            if (vRemote > vLocal) return true;
            if (vRemote < vLocal) return false; 
          }
          return false;
        };

        // Check for service interruption/deprecation
        const deprecatedVersions = snap.data().deprecatedVersions || [];
        const minVersion = snap.data().minVersion || "";
        const serviceMovedTo = snap.data().serviceMovedTo || "";

        // Hardcoded check for 2.3.04 or lower as requested
        const isTooOld = !isNewer(localVersion, "2.3.04") || localVersion === "2.3.04";

        if (isTooOld || deprecatedVersions.includes(LOCAL_CODE_VERSION) || (minVersion && !isNewer(localVersion, minVersion.replace(/^v/, '')) && localVersion !== minVersion.replace(/^v/, ''))) {
          if (serviceMovedTo) {
            setNewAppUrl(serviceMovedTo);
            setIsServiceInterrupted(true);
            return true;
          }
        }

        if (!remoteVersion || remoteVersion === localVersion) return false;
        
        if (isNewer(remoteVersion, localVersion)) {
          setModalConfig({
            title: "Nova versão disponível",
            message: `Uma nova versão (${remoteVersion}) está disponível. Deseja atualizar agora?`,
            confirmLabel: "Sim, atualizar",
            onConfirm: () => {
              window.location.reload();
            },
            onCancel: () => setModalConfig(null)
          });
          return remoteVersion;
        }
      }
    } catch (e) { console.error(e); }
    return false; 
  }, [setModalConfig]);

  useEffect(() => {
    handleCheckUpdate();
  }, [handleCheckUpdate]);

  const isAdmin = userProfile.email?.toLowerCase().trim() === 'celsomramalho@gmail.com';

  useEffect(() => {
    const overlay = document.getElementById('brightness-overlay');
    if (overlay) {
      overlay.style.opacity = ((100 - matchSettings.brightness) / 100).toString();
    }
  }, [matchSettings.brightness]);

  useEffect(() => {
    if (!userProfile.pin || !currentFullDeviceName) return;
    const db = getDb();
    if (!db) return;
    const unsubscribe = onSnapshot(doc(db, "live_matches", userProfile.pin.toUpperCase()), (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data() as GameState;
        
        // Validação defensiva de dados da nuvem
        if (!isValidGameState(cloudData)) {
          console.warn("Recebido GameState inválido da nuvem. Ignorando atualização.");
          return;
        }

        if (cloudData.isLiveClosed) {
          setCloudLiveExists(false);
          setGameState(prev => {
            if (!prev) return null;
            return { ...prev, isMirroringActive: false, isLiveClosed: true, isConfirmedFinished: cloudData.isConfirmedFinished || prev.isConfirmedFinished };
          });
          return;
        }
        setCloudLiveExists(true);
        if (cloudData.commandOwnerId !== deviceId) {
           setGameState(prev => {
             const baseConfig = prev?.matchConfig || matchSettings;
             return {
               ...cloudData,
               isMirroringActive: true,
               isLiveClosed: false,
               isConfirmedFinished: cloudData.isConfirmedFinished,
               matchConfig: {
                 ...cloudData.matchConfig,
                 isWatchMode: baseConfig.isWatchMode,
                 brightness: baseConfig.brightness,
                 volume: baseConfig.volume,
                 deviceLabel: baseConfig.deviceLabel,
                 selectedVoiceURI: baseConfig.selectedVoiceURI,
                 voiceEnabled: baseConfig.voiceEnabled,
                 voiceScoring: baseConfig.voiceScoring,
                 actionCooldown: baseConfig.actionCooldown,
                 stateLockout: baseConfig.stateLockout
               }
             };
           });
           setIsWaitingSync(false);
        } else {
           setGameState(prev => {
             if (!prev) return null;
              return { 
                ...prev, 
                controllers: cloudData.controllers,
                judgePin: cloudData.judgePin,
                judgeNickname: cloudData.judgeNickname
              };
           });
        }
      } else {
        setCloudLiveExists(false);
        setGameState(prev => {
          if (!prev) return null;
          if (prev.isMirroringActive) {
            console.log("Limpando mirroring local pois a live não existe na nuvem.");
            return { ...prev, isMirroringActive: false, isLiveClosed: false };
          }
          return prev;
        });
      }
    });
    return () => unsubscribe();
  }, [userProfile.pin, currentFullDeviceName, deviceId, matchSettings]);

  useEffect(() => {
    if (!prevSettingsRef.current) { prevSettingsRef.current = { ...matchSettings }; return; }
    const prev = prevSettingsRef.current;
    const inicialChanged = prev.p1Name !== matchSettings.p1Name || prev.p1Partner !== matchSettings.p1Partner || prev.p2Name !== matchSettings.p2Name || prev.p2Partner !== matchSettings.p2Partner || prev.isDoubles !== matchSettings.isDoubles || prev.p1Color !== matchSettings.p1Color || prev.p2Color !== matchSettings.p2Color;
    const technicalFieldsChanged = prev.sportType !== matchSettings.sportType || prev.sets !== matchSettings.sets || prev.gamesPerSet !== matchSettings.gamesPerSet || prev.noAd !== matchSettings.noAd || prev.tieBreak !== matchSettings.tieBreak || prev.tieBreakAt !== matchSettings.tieBreakAt || prev.tieBreakPoints !== matchSettings.tieBreakPoints || prev.tieBreakWinByTwo !== matchSettings.tieBreakWinByTwo || prev.switchSidesOdd !== matchSettings.switchSidesOdd || prev.tieBreakSideSwitchMode !== matchSettings.tieBreakSideSwitchMode || prev.pickleballScoringMode !== matchSettings.pickleballScoringMode || prev.pickleballServiceMode !== matchSettings.pickleballServiceMode || prev.useGeminiVoice !== matchSettings.useGeminiVoice || prev.isWatchMode !== matchSettings.isWatchMode || prev.brightness !== matchSettings.brightness || prev.volume !== matchSettings.volume || prev.actionCooldown !== matchSettings.actionCooldown || prev.stateLockout !== matchSettings.stateLockout || prev.deviceLabel !== matchSettings.deviceLabel || prev.selectedVoiceURI !== matchSettings.selectedVoiceURI || prev.voiceEnabled !== matchSettings.voiceEnabled || prev.voiceScoring !== matchSettings.voiceScoring || prev.winnersStay !== matchSettings.winnersStay;
    if (inicialChanged) setIsSettingsInicialSaved(false);
    if (prev.sportType !== matchSettings.sportType) { setIsSettingsRegrasSaved(true); } else if (technicalFieldsChanged) { setIsSettingsRegrasSaved(false); }

    try {
      localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings));
      localStorage.setItem('myPlacar_LocalDeviceLabel', matchSettings.deviceLabel || '');
      localStorage.setItem('myPlacar_LocalBrightness', matchSettings.brightness.toString());
      localStorage.setItem('myPlacar_LocalVolume', matchSettings.volume.toString());
      localStorage.setItem('myPlacar_LocalWatchMode', matchSettings.isWatchMode ? 'true' : 'false');
      localStorage.setItem('myPlacar_LocalVoiceURI', matchSettings.selectedVoiceURI || '');
      localStorage.setItem('myPlacar_LocalVoiceEnabled', matchSettings.voiceEnabled ? 'true' : 'false');
      localStorage.setItem('myPlacar_LocalVoiceScoring', matchSettings.voiceScoring ? 'true' : 'false');
      localStorage.setItem('myPlacar_LocalActionCooldown', matchSettings.actionCooldown.toString());
      localStorage.setItem('myPlacar_LocalStateLockout', matchSettings.stateLockout.toString());
    } catch(e) {}

    if (gameState && !gameState.isConfirmedFinished) {
        setGameState(prevG => {
            if (!prevG) return prevG;
            return {
                ...prevG,
                p1: { ...prevG.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, color: matchSettings.p1Color },
                p2: { ...prevG.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, color: matchSettings.p2Color },
                matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode }
            };
        });
    }
    prevSettingsRef.current = { ...matchSettings };
    try { localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings)); } catch(e) {}
  }, [matchSettings, gameState?.matchId]);

  useEffect(() => {
    if (!prevProfileRef.current) { prevProfileRef.current = { ...userProfile }; return; }
    const prev = prevProfileRef.current;
    if (prev.name !== userProfile.name || prev.nickname !== userProfile.nickname || prev.gender !== userProfile.gender || prev.authMethod !== userProfile.authMethod) {
      setIsProfileSaved(false);
    }
    // Se o método de autenticação mudou para password, salvamos automaticamente para garantir persistência
    if (prev.authMethod === 'pin' && userProfile.authMethod === 'password') {
      handleSaveProfile();
    }
    prevProfileRef.current = { ...userProfile };
  }, [userProfile]);

  useEffect(() => {
    const db = getDb();
    if (db) {
      const q = query(collection(db, "live_matches"), where("isLiveClosed", "==", false));
      const unsubscribe = onSnapshot(q, (snap) => {
        const lives: GameState[] = [];
        snap.forEach(d => lives.push(d.data() as GameState));
        setActiveLives(lives);
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!userProfile.pin) { setCloudLiveExists(false); return; }
    const myPin = userProfile.pin.toUpperCase();
    const exists = activeLives.some(live => 
      (live.ownerPin?.toUpperCase() === myPin) || 
      (live.judgePin?.toUpperCase() === myPin)
    );
    setCloudLiveExists(exists);
    if (!exists && gameState?.isMirroringActive) {
      setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
    }
  }, [activeLives, userProfile.pin, gameState?.isMirroringActive]);

  useEffect(() => {
    if (userProfile.email && navigator.onLine) {
        const db = getDb();
        if (db) {
            getDoc(doc(db, "user_queue_metadata", userProfile.email.toLowerCase().trim())).then(snap => {
                if (snap.exists() && snap.data().queue_list) {
                    setPlayerQueue(snap.data().queue_list);
                }
            });
            fetchUserRegistrations(userProfile.email);
        }
    }
  }, [userProfile.pin, userProfile.email]);

  useEffect(() => {
    if (!userProfile.pin || !navigator.onLine) return;
    const db = getDb();
    if (!db) return;
    const myPin = userProfile.pin.toUpperCase();
    const myNickname = userProfile.nickname || userProfile.name.split(' ')[0];
    
    const interval = setInterval(async () => {
      const judgeMatches = activeLives.filter(l => l.judgePin?.toUpperCase() === myPin);
      for (const match of judgeMatches) {
        if (match.ownerPin) {
          const docRef = doc(db, "live_matches", match.ownerPin.toUpperCase());
          try {
            const snap = await getDoc(docRef);
            if (snap.exists() && !snap.data().isLiveClosed) {
              const data = snap.data();
              const controllers = { ...(data.controllers || {}) };
              controllers[deviceId] = { 
                label: currentFullDeviceName, 
                nickname: myNickname,
                lastSeen: Date.now() 
              };
              await updateDoc(docRef, { controllers });
            }
          } catch (e) {}
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [activeLives, userProfile.pin, userProfile.name, userProfile.nickname, deviceId, currentFullDeviceName]);

  useEffect(() => {
    let timer: any;
    if (gameState && !gameState.isPaused && !gameState.isMatchOver && !matchSettings.isWatchMode && !gameState.isLiveClosed) {
      timer = setInterval(() => {
        setGameState(prev => {
          if (!prev || prev.isPaused || prev.isMatchOver || prev.isLiveClosed) return prev;
          return { ...prev, matchDuration: prev.matchDuration + 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState?.isPaused, gameState?.isMatchOver, gameState?.isLiveClosed, !!gameState, matchSettings.isWatchMode]);

  const lastSeenUpdateRef = useRef<number>(0);
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => {
    if (gameState) {
      try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(gameState)); } catch(e) {}
      
      if (gameState.isMirroringActive && userProfile.pin && userProfile.email && !gameState.isLiveClosed && navigator.onLine) {
        const db = getDb();
        if (db && gameState.commandOwnerId === deviceId) {
            const now = Date.now();
            
            // 1. Determina se é uma mudança "crítica" (placar, status, etc) ou "passiva" (timer)
            const prevStateStr = lastSentStateRef.current;
            const prevState = prevStateStr ? JSON.parse(prevStateStr) : null;
            
            const isCriticalChange = !prevState || 
              prevState.p1.score !== gameState.p1.score || 
              prevState.p2.score !== gameState.p2.score ||
              prevState.p1.games !== gameState.p1.games ||
              prevState.p2.games !== gameState.p2.games ||
              prevState.p1.sets.join(',') !== gameState.p1.sets.join(',') ||
              prevState.p2.sets.join(',') !== gameState.p2.sets.join(',') ||
              prevState.isPaused !== gameState.isPaused ||
              prevState.isMatchOver !== gameState.isMatchOver ||
              prevState.server !== gameState.server;

            // 2. Throttle: Mudanças críticas são instantâneas, mudanças passivas (timer) a cada 10s
            const timeSinceLastSync = now - lastSyncTimeRef.current;
            const shouldSync = isCriticalChange || timeSinceLastSync > 10000;

            if (shouldSync) {
              const nextControllers: Record<string, any> = { ...(gameState.controllers || {}) };
              
              // Só atualiza o lastSeen a cada 30 segundos
              const shouldUpdateLastSeen = now - lastSeenUpdateRef.current > 30000;
              
              if (shouldUpdateLastSeen) {
                Object.keys(nextControllers).forEach(id => { 
                  if (nextControllers[id].label === currentFullDeviceName && id !== deviceId) delete nextControllers[id]; 
                });
                nextControllers[deviceId] = { label: currentFullDeviceName, lastSeen: now, isOwner: isOriginalOwner };
                lastSeenUpdateRef.current = now;
              } else {
                const existing = gameState.controllers?.[deviceId];
                if (existing) nextControllers[deviceId] = { ...existing, isOwner: isOriginalOwner };
                else {
                  nextControllers[deviceId] = { label: currentFullDeviceName, lastSeen: now, isOwner: isOriginalOwner };
                  lastSeenUpdateRef.current = now;
                }
              }

              const stateToSave = sanitizeForFirestore({ ...gameState, controllers: nextControllers });
              if (stateToSave) {
                const strState = JSON.stringify(stateToSave);
                if (strState !== lastSentStateRef.current) {
                  lastSentStateRef.current = strState;
                  lastSyncTimeRef.current = now;
                  setDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), stateToSave, { merge: true }).catch((err) => {
                    console.error("Erro ao sincronizar com nuvem:", err);
                  });
                }
              }
            }
        }
      }
    }
  }, [gameState, userProfile.pin, userProfile.email, currentFullDeviceName, deviceId]);

  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>(() => {
    const list = safeJsonParse('myPlacarHistory', []);
    matchHistoryRef.current = list;
    return list;
  });
  
  const [activeTab, setActiveTab] = useState<'config' | 'history' | 'help' | 'profile'>('config');
  const [adminTab, setAdminTab] = useState<'configs' | 'users' | 'icons' | 'events' | 'comms'>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);

  const persistHistory = useCallback((newList: MatchHistoryItem[]) => {
    // Limit local history to 100 items to prevent QuotaExceededError
    const limitedList = newList.slice(0, 100);
    matchHistoryRef.current = newList;
    setMatchHistory(newList);
    try { 
      localStorage.setItem('myPlacarHistory', JSON.stringify(limitedList)); 
    } catch(e) {
      // If still failing, try to clear some space
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('myPlacar_Backup_')) localStorage.removeItem(key);
        });
        try { localStorage.setItem('myPlacarHistory', JSON.stringify(limitedList.slice(0, 50))); } catch(ex) {}
      }
    }
  }, []);

  const handleClearAllHistory = async () => {
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (navigator.onLine && cleanEmail) {
      setIsSyncing(true);
      const db = getDb();
      try {
        if (db) {
          const q = query(collection(db, "matches"), where("ownerEmail", "==", cleanEmail));
          const snap = await getDocs(q);
          const batch = writeBatch(db);
          snap.forEach(docSnap => batch.delete(docSnap.ref));
          await batch.commit();
        }
        persistHistory([]);
        setCloudMatchesCount(0);
        setModalConfig({ title: "Sucesso", message: "Todo o histórico foi removido com sucesso.", onConfirm: () => setModalConfig(null) });
      } catch (e) { persistHistory([]); } finally { setIsSyncing(false); }
    } else {
      persistHistory([]);
      setCloudMatchesCount(0);
      setModalConfig({ title: "Sucesso", message: "Histórico local removido. Sem internet para limpar a nuvem.", onConfirm: () => setModalConfig(null) });
    }
  };

  const handleExportData = () => {
    const data = { profile: userProfile, history: matchHistory, settings: matchSettings, partners, playerQueue, exportDate: new Date().toISOString(), appVersion: LOCAL_CODE_VERSION };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `myplacar_backup_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.profile && !data.history && !data.settings) throw new Error("Inválido");
      if (data.profile) localStorage.setItem('myPlacarUserProfile', JSON.stringify(data.profile));
      if (data.history) localStorage.setItem('myPlacarHistory', JSON.stringify(data.history));
      if (data.settings) localStorage.setItem('myPlacarSettings', JSON.stringify(data.settings));
      if (data.partners) localStorage.setItem('myPlacarPartners', JSON.stringify(data.partners));
      if (data.playerQueue) localStorage.setItem('myPlacarPlayerQueue', JSON.stringify(data.playerQueue));
      setModalConfig({ title: "Backup restaurado", message: "O aplicativo será reiniciado.", onConfirm: () => window.location.reload() });
    } catch (e) { setModalConfig({ title: "Erro", message: "Falha ao processar arquivo.", onConfirm: () => setModalConfig(null) }); }
  };

  const fetchCloudMatchesCount = useCallback(async (isSilent = false) => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    try {
      const q = query(collection(db, "matches"), where("ownerEmail", "==", cleanEmail));
      const snap = await getDocs(q);
      const localIds = new Set(matchHistoryRef.current.map(m => m.id));
      let count = 0;
      snap.forEach(docSnap => { if (!localIds.has(docSnap.id)) count++; });
      setCloudMatchesCount(count);
    } catch (e) {}
  }, [userProfile.email]);

  useEffect(() => { if (userProfile.email) fetchCloudMatchesCount(true); }, [userProfile.email, matchHistory.length, fetchCloudMatchesCount]);

  const syncHistoryToFirebase = useCallback(async (forcedHistory?: MatchHistoryItem[], forceAll = false) => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    const currentList = forcedHistory || [...matchHistoryRef.current];
    const unsynced = forceAll ? currentList : currentList.filter(m => !m.isSynced);
    if (unsynced.length === 0) { fetchCloudMatchesCount(true); return; }
    setIsSyncing(true);
    const safetyTimeout = setTimeout(() => setIsSyncing(false), 15000);
    try {
      const batch = writeBatch(db);
      unsynced.forEach(match => {
        const matchRef = doc(db, "matches", match.id);
        const dataToSave = { ...sanitizeForFirestore(match), syncedAt: serverTimestamp(), isSynced: true, ownerEmail: cleanEmail, ownerPin: userProfile.pin };
        if (dataToSave) batch.set(matchRef, dataToSave, { merge: true });
      });
      await batch.commit();
      const syncedIds = new Set(unsynced.map(u => u.id));
      const updatedList = currentList.map(m => syncedIds.has(m.id) ? { ...m, isSynced: true } : m);
      persistHistory(updatedList);
      await fetchCloudMatchesCount(true);
    } catch (e) {} finally { 
      clearTimeout(safetyTimeout);
      setIsSyncing(false); 
    }
  }, [userProfile.email, userProfile.pin, fetchCloudMatchesCount, persistHistory]);

  useEffect(() => {
    const unsyncedCount = matchHistory.filter(m => !m.isSynced).length;
    if (unsyncedCount > 0 && userProfile.email && !isSyncing) syncHistoryToFirebase();
  }, [matchHistory.length, userProfile.email, isSyncing, syncHistoryToFirebase]);

  useEffect(() => {
    const handleOnline = () => {
      const unsynced = matchHistoryRef.current.filter(m => !m.isSynced);
      if (unsynced.length > 0) syncHistoryToFirebase();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncHistoryToFirebase]);

  const downloadHistoryFromFirebase = useCallback(async () => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    setIsDownloading(true);
    try {
      const q = query(collection(db, "matches"), where("ownerEmail", "==", cleanEmail));
      const snap = await getDocs(q);
      const localIds = new Set(matchHistoryRef.current.map(m => m.id));
      const downloaded: MatchHistoryItem[] = [];
      snap.forEach(docSnap => { if (!localIds.has(docSnap.id)) downloaded.push({ id: docSnap.id, ...docSnap.data(), isSynced: true } as MatchHistoryItem); });
      if (downloaded.length > 0) {
        setCloudMatchesCount(0);
        persistHistory([...downloaded, ...matchHistoryRef.current].sort((a,b) => b.id.localeCompare(a.id)));
      }
    } catch (e) {} finally { setIsDownloading(false); }
  }, [userProfile.email, persistHistory]);

  const canStartMatch = useMemo(() => {
    const s = matchSettings;
    if (!s.isDoubles) return s.p1Name.trim().length > 0 && s.p2Name.trim().length > 0;
    return s.p1Name.trim().length > 0 && (s.p1Partner || '').trim().length > 0 && s.p2Name.trim().length > 0 && (s.p2Partner || '').trim().length > 0;
  }, [matchSettings]);

  const finalizeMatchInternal = useCallback(async (state: GameState) => {
    const p1SetsWon = state.p1.sets.filter((s, i) => s > state.p2.sets[i]).length;
    const p2SetsWon = state.p2.sets.filter((s, i) => s > state.p1.sets[i]).length;
    const winnerTeam = p1SetsWon > p2SetsWon ? 1 : 2;
    const winnersStay = state.matchConfig.winnersStay;

    if (state.tournamentPin && state.tournamentMatchId && navigator.onLine) {
       const db = getDb();
       if (db) {
          const res = `${state.p1.sets.join('/')}-${state.p2.sets.join('/')}`;
          const winnerId = winnerTeam === 1 ? 'pair1' : 'pair2'; 
          getDoc(doc(db, "events", state.tournamentPin)).then(snap => {
             if (snap.exists()) {
                const evData = snap.data();
                const matches = (evData.matches || []) as TournamentMatch[];
                const updatedMatches = matches.map(m => {
                   if (m.id === state.tournamentMatchId) {
                      return { ...m, status: 'finished', result: res, winnerPairId: winnerId === 'pair1' ? m.pair1Id : m.pair2Id };
                   }
                   return m;
                });
                updateDoc(doc(db, "events", state.tournamentPin!), { matches: updatedMatches });
             }
          });
       }
    }

    const exitingPlayers: string[] = [];
    if (!winnersStay) {
        exitingPlayers.push(state.p1.name, state.p1.partnerName || '', state.p2.name, state.p2.partnerName || '');
        setMatchSettings(prev => ({ ...prev, p1Name: '', p1Partner: '', p2Name: '', p2Partner: '', p1Verified: false, p1PartnerVerified: false, p2Verified: false, p2PartnerVerified: false }));
    } else {
        if (winnerTeam === 1) {
            exitingPlayers.push(state.p2.name, state.p2.partnerName || '');
            setMatchSettings(prev => ({ ...prev, p2Name: '', p2Partner: '', p2Verified: false, p2PartnerVerified: false }));
        } else {
            exitingPlayers.push(state.p1.name, state.p1.partnerName || '');
            setMatchSettings(prev => ({ ...prev, p1Name: '', p1Partner: '', p1Verified: false, p1PartnerVerified: false }));
        }
    }

    const cleanExiting = exitingPlayers.filter(n => !!n && n.trim() !== "");
    setPlayerQueue(prev => {
        const next = [...prev];
        cleanExiting.forEach(name => {
            const partnerInfo = partners.find(p => p.nickname === name);
            const gender = partnerInfo?.gender || (name.toLowerCase().endsWith('a') ? 'F' : 'M');
            const emptyIdx = next.findIndex(p => !p.name);
            if (emptyIdx !== -1) { next[emptyIdx] = { ...next[emptyIdx], name, gender }; }
            else { next.push({ id: `q_${Date.now()}_${next.length}`, name, gender }); }
        });
        return next;
    });

    if (!state.matchConfig.isHistoryEnabled) {
      try { localStorage.removeItem('myPlacarActiveGameState'); } catch(e) {}
      const db = getDb();
      if (db && userProfile.pin && navigator.onLine) deleteDoc(doc(db, "live_matches", userProfile.pin.toUpperCase())).catch(() => {});
      return;
    }

    if (matchHistoryRef.current.some(m => m.id === state.matchId)) return;
    let location: { lat: number, lng: number } | undefined = undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => { 
          if (!navigator.geolocation) return reject(new Error("Indisponível"));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, enableHighAccuracy: true }); 
      });
      location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) {}
    const involvedPins: string[] = [];
    const checkAndAdd = (name: string) => { const found = partners.find(p => p.nickname === name); if (found && found.pin) involvedPins.push(found.pin.toUpperCase()); };
    checkAndAdd(state.p1.name); if (state.p1.partnerName) checkAndAdd(state.p1.partnerName);
    checkAndAdd(state.p2.name); if (state.p2.partnerName) checkAndAdd(state.p2.partnerName);
    const historyItem: MatchHistoryItem = {
      id: state.matchId,
      date: new Date().toLocaleDateString('pt-BR'),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      sportType: state.matchConfig.sportType,
      p1Name: state.p1.name, p1Partner: state.p1.partnerName,
      p2Name: state.p2.name, p2Partner: state.p2.partnerName,
      p1Color: state.p1.color || 'azul', p2Color: state.p2.color || 'vermelho',
      scoreSummary: `${state.p1.sets.join('/')} - ${state.p2.sets.join('/')}`,
      p1Sets: [...state.p1.sets], p2Sets: [...state.p2.sets],
      winner: winnerTeam === 1 ? state.p1.name : state.p2.name,
      winnerTeam: winnerTeam,
      duration: state.matchDuration, isSynced: false,
      ownerEmail: userProfile.email?.toLowerCase().trim() || '', 
      pointHistory: [...(state.pointHistory ?? [])],
      location, stats: { p1Aces: (state.pointHistory ?? []).filter(p => p.winner === 1 && p.type === 'ace').length, p2Aces: (state.pointHistory ?? []).filter(p => p.winner === 2 && p.type === 'ace').length, p1Faults: (state.pointHistory ?? []).filter(p => p.winner === 1 && p.type === 'fault').length, p2Faults: (state.pointHistory ?? []).filter(p => p.winner === 2 && p.type === 'fault').length, totalPoints: (state.pointHistory ?? []).length },
      involvedPins
    };
    persistHistory([historyItem, ...matchHistoryRef.current]);
    try { localStorage.removeItem('myPlacarActiveGameState'); } catch(e) {}
    const db = getDb();
    if (db && userProfile.pin && navigator.onLine) deleteDoc(doc(db, "live_matches", userProfile.pin.toUpperCase())).catch(() => {});
  }, [persistHistory, userProfile.email, userProfile.pin, partners]);

  const initGameState = async (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => {
    if (finalizationTimerRef.current) { clearTimeout(finalizationTimerRef.current); finalizationTimerRef.current = null; }
    if (forceNew && !tournamentOverride && gameState && (gameState.p1.games > 0 || gameState.p2.games > 0 || gameState.p1.sets.length > 0 || gameState.p1.score !== '0' || gameState.p2.score !== '0')) {
       setModalConfig({
         title: "Deseja iniciar uma nova partida?",
         message: "O placar atual está em andamento. Deseja realmente iniciar uma nova partida?",
         confirmLabel: "Sim, iniciar",
         onConfirm: () => { setModalConfig(null); initGameStateInternal(forceNew, tournamentOverride); },
         onCancel: () => setModalConfig(null)
       });
       return;
    }
    initGameStateInternal(forceNew, tournamentOverride);
  };

  const initGameStateInternal = async (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => {
    const savedSettings = safeJsonParse('myPlacarSettings', matchSettings);
    let configToUse = { ...savedSettings };
    let tournamentMeta: Partial<GameState> = {};

    if (tournamentOverride) {
       const { match, pair1, pair2, event } = tournamentOverride;
       configToUse = {
          ...matchSettings,
          p1Name: pair1.p1.nickname,
          p1Partner: pair1.p2.nickname,
          p2Name: pair2.p1.nickname,
          p2Partner: pair2.p2.nickname,
          isDoubles: true,
          p1Verified: true, p1PartnerVerified: true, p2Verified: true, p2PartnerVerified: true,
          ...(event.config || {})
       };
       tournamentMeta = {
          tournamentMatchId: match.id,
          tournamentPin: event.pin
       };
       forceNew = true;
       if (navigator.onLine) {
          const db = getDb();
          if (db) {
             const updatedMatches = (event.matches || []).map(m => {
                if (m.id === match.id) return { ...m, status: 'live' as const, ownerPin: userProfile.pin };
                return m;
             });
             updateDoc(doc(db, "events", event.pin), { matches: updatedMatches });
          }
       }
    }

    if (gameState?.isMirroringActive && userProfile.pin && userProfile.email && navigator.onLine && gameState.commandOwnerId === deviceId) {
       const db = getDb();
       if (db) {
          const updatedMatchConfig = { ...configToUse, setsToWin: configToUse.sets, isWatchMode: !!configToUse.isWatchMode };
          const stateToSync = sanitizeForFirestore({
             ...gameState,
             p1: { ...gameState.p1, name: configToUse.p1Name, partnerName: configToUse.p1Partner, color: configToUse.p1Color },
             p2: { ...gameState.p2, name: configToUse.p2Name, partnerName: configToUse.p2Partner, color: configToUse.p2Color },
             matchConfig: updatedMatchConfig,
             isLiveClosed: false
          });
          if (stateToSync) await setDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), stateToSync, { merge: true }).catch(() => {});
       }
    }

    if (forceNew && cloudLiveExists && navigator.onLine) {
        const db = getDb();
        if (db && userProfile.pin) {
           const pinUpper = userProfile.pin.toUpperCase();
           try {
             const snap = await getDoc(doc(db, "live_matches", pinUpper));
             if (snap.exists() && snap.data().isLiveClosed !== true) {
                const data = snap.data() as GameState;
                const ownerData = Object.values(data.controllers || {}).find((c: any) => c.label === data.commandOwner);
                const lastAct = ownerData?.lastSeen || data.startTime || 0;
                if ((Date.now() - lastAct) < (60 * 60 * 1000)) { setShowLiveControlOverlay(true); return; }
                await deleteDoc(doc(db, "live_matches", pinUpper)).catch(() => {});
             }
           } catch (e) {}
        }
    }
    if (gameState && gameState.isMatchOver && !gameState.isConfirmedFinished) finalizeMatchInternal({ ...gameState, isConfirmedFinished: true });
    
    setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true); setIsRecoveryFromMatchOver(false);
    if (!forceNew && cloudLiveExists && navigator.onLine) {
        const db = getDb();
        if (db && userProfile.pin) {
           try {
             const snap = await getDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()));
             if (snap.exists() && snap.data().isLiveClosed !== true) { 
                // Se já temos o estado local e ele bate com o PIN, não precisamos mostrar o modal de espera
                if (gameState && gameState.ownerPin?.toUpperCase() === userProfile.pin.toUpperCase()) {
                   setCurrentScreen('scoreboard'); 
                   return; 
                }
                setIsWaitingSync(true); 
                setCurrentScreen('scoreboard'); 
                return; 
             }
           } catch (e) {}
        }
    }
    if (!forceNew && gameState) {
      const updatedState: GameState = { 
        ...gameState, 
        isLiveClosed: false,
        matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode }, 
        p1: { ...gameState.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, color: matchSettings.p1Color }, 
        p2: { ...gameState.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, color: matchSettings.p2Color }, 
        isPaused: false 
      };
      setGameState(updatedState);
      try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updatedState)); } catch(e) {}
      setCurrentScreen('scoreboard'); return;
    }
    
    if (!tournamentOverride && !canStartMatch) return;
    const globalLiveCount = parseInt(localStorage.getItem('myPlacarLiveGlobalCount') || '0') + 1;
    try { localStorage.setItem('myPlacarLiveGlobalCount', globalLiveCount.toString()); } catch(e) {}
    const db = getDb();
    if (db && userProfile.pin && navigator.onLine) { try { await deleteDoc(doc(db, "live_matches", userProfile.pin.toUpperCase())).catch(() => {}); } catch (e) {} }
    
    const newGameState: GameState = {
      matchId: `match_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      startTime: Date.now(),
      p1: { name: configToUse.p1Name, partnerName: configToUse.p1Partner, score: '0', games: 0, sets: [], color: configToUse.p1Color },
      p2: { name: configToUse.p2Name, partnerName: configToUse.p2Partner, score: '0', games: 0, sets: [], color: configToUse.p2Color },
      server: configToUse.initialServer, servingOrderOffset: configToUse.initialServer === 1 ? 0 : 1,
      pointHistory: [], matchConfig: { ...configToUse, setsToWin: configToUse.sets, isWatchMode: !!configToUse.isWatchMode }, history: [], currentSet: 0, isMatchOver: false, isConfirmedFinished: false, matchDuration: 0, isPaused: false, 
      isMirroringActive: false, isLiveClosed: false, ownerPin: userProfile.pin,
      liveSessionCounter: globalLiveCount, commandOwner: currentFullDeviceName, commandOwnerId: deviceId, 
      controllers: { [deviceId]: { label: currentFullDeviceName, lastSeen: Date.now() } },
      ...tournamentMeta
    };
    
    setMatchSettings(configToUse);
    setGameState(newGameState); setHistoryStack([newGameState]);
    try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(newGameState)); } catch(e) {}
    setCurrentScreen('scoreboard');
  };

  const handleScoreUpdate = async (player: 1 | 2, type: PointType = 'rally', source: string = 'cb') => {
    if (!gameState || gameState.isConfirmedFinished || gameState.isMatchOver || gameState.isLiveClosed) return;
    if (gameState.isMirroringActive && gameState.commandOwnerId !== deviceId) return;
    setIsRecoveryFromMatchOver(false);
    const next = incrementScore(gameState, player, type, source);
    next.isPaused = false; setGameState({ ...next });
    setHistoryStack(prev => [...prev, JSON.parse(JSON.stringify(next))]);
  };

  const handleCorrectScore = (type: 'game' | 'gameSet' | 'matchSet', value: string) => {
    if (!gameState || gameState.isMatchOver || gameState.isLiveClosed) return;
    if (gameState.isMirroringActive && gameState.commandOwnerId !== deviceId) return;
    setIsRecoveryFromMatchOver(false);
    const match = value.toLowerCase().match(/(\d+|ad)\s*[a-]\s*(\d+|ad)/);
    if (!match) return;
    const v1 = match[1]; const v2 = match[2];
    const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
    if (type === 'game') {
      const tennisMap: Record<string, number> = { '0': 0, '15': 1, '30': 2, '40': 3, 'ad': 4 };
      const p1Target = tennisMap[v1] ?? parseInt(v1); const p2Target = tennisMap[v2] ?? parseInt(v2);
      const lastFinalizedIdx = [...(nextState.pointHistory ?? [])].reverse().findIndex(p => !!p.resultingScore);
      const startIndex = lastFinalizedIdx === -1 ? 0 : (nextState.pointHistory ?? []).length - lastFinalizedIdx;
      nextState.pointHistory = (nextState.pointHistory ?? []).slice(0, startIndex);
      for (let i = 0; i < p1Target; i++) nextState.pointHistory.push({ winner: 1, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb' });
      for (let i = 0; i < p2Target; i++) nextState.pointHistory.push({ winner: 2, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb' });
      nextState.p1.score = v1.charAt(0).toUpperCase() + v1.slice(1); nextState.p2.score = v2.charAt(0).toUpperCase() + v2.slice(1);
    } else if (type === 'gameSet') {
      const g1 = parseInt(v1); const g2 = parseInt(v2);
      nextState.pointHistory = []; nextState.p1.games = g1; nextState.p2.games = g2; nextState.p1.score = '0'; nextState.p2.score = '0';
      for (let g = 0; g < g1; g++) { for (let b = 0; b < 4; b++) nextState.pointHistory.push({ winner: 1, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb', resultingScore: b === 3 ? `${g+1}-${nextState.p2.games}` : undefined }); }
      for (let g = 0; g < g2; g++) { for (let b = 0; b < 4; b++) nextState.pointHistory.push({ winner: 2, type: 'rally', server: nextState.server, scoreBefore: '...', source: 'cb', resultingScore: b === 3 ? `${nextState.p1.games}-${g+1}` : undefined }); }
    } else if (type === 'matchSet') {
      const s1 = parseInt(v1); const s2 = parseInt(v2);
      const maxGames = nextState.matchConfig.gamesPerSet || 6;
      nextState.p1.sets = []; nextState.p2.sets = [];
      for (let i = 0; i < s1; i++) { nextState.p1.sets.push(maxGames); nextState.p2.sets.push(0); }
      for (let i = 0; i < s2; i++) { nextState.p1.sets.push(0); nextState.p2.sets.push(maxGames); }
      nextState.p1.games = 0; nextState.p2.games = 0;
      nextState.p1.score = '0'; nextState.p2.score = '0';
      nextState.currentSet = s1 + s2;
    }
    setGameState(nextState); setHistoryStack([JSON.parse(JSON.stringify(nextState))]);
  };

  const handleConnectRemote = async () => {
    if (!activeCloudMatch || !navigator.onLine) return;
    const db = getDb(); if (!db) return;
    try {
      const snap = await getDoc(doc(db, "live_matches", activeCloudMatch.id));
      if (snap.exists() && snap.data().isLiveClosed !== true) {
        const cloudData = snap.data() as GameState;
        const updatedData = { ...cloudData, isMirroringActive: true, isLiveClosed: false, matchConfig: { ...cloudData.matchConfig, isWatchMode: !!matchSettings.isWatchMode, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } };
        setGameState(updatedData); setMatchSettings(prev => ({ ...prev, isWatchMode: !!prev.isWatchMode, sportType: cloudData.matchConfig.sportType })); setCurrentScreen('scoreboard'); setActiveCloudMatch(null);
      }
    } catch (e) {}
  };

  const handleRejectRemote = () => setActiveCloudMatch(null);

  const handleCloseCloudLive = async () => {
    const db = getDb();
    if (db && userProfile.pin && navigator.onLine) {
      const targetPin = isOriginalOwner ? userProfile.pin.toUpperCase() : gameState?.ownerPin?.toUpperCase();
      if (!targetPin) return;
      try {
        await deleteDoc(doc(db, "live_matches", targetPin));
        setGameState(prev => { if (!prev) return null; return { ...prev, isMirroringActive: false, isLiveClosed: false }; });
        setCloudLiveExists(false); try { localStorage.removeItem('myPlacarActiveGameState'); } catch(e) {}
        setShowLiveControlOverlay(false); setConfirmDeleteLive(false); setCurrentScreen('settings');
        setModalConfig({ title: "Sucesso", message: "Transmissão encerrada com sucesso.", variant: 'success', icon: <CheckCircle className="text-green-500 w-16 h-16" />, onConfirm: () => setModalConfig(null) });
        setTimeout(() => setModalConfig(null), 3000);
      } catch (e) { setModalConfig({ title: "Erro", message: "Erro ao excluir a transmissão. Verifique sua internet.", onConfirm: () => setModalConfig(null) }); }
    } else { setModalConfig({ title: "Erro", message: "Verifique sua conexão para encerrar a live.", onConfirm: () => setModalConfig(null) }); }
  };

  const handleControlLive = async () => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para assumir o controle.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    if (db && userProfile.pin) {
      let targetPin = isOriginalOwner ? userProfile.pin.toUpperCase() : gameState?.ownerPin?.toUpperCase();
      
      // Se não temos targetPin mas somos juiz de alguma partida, pegamos o ownerPin
      if (!targetPin) {
        const myPin = userProfile.pin.toUpperCase();
        const judgeMatch = activeLives.find(l => l.judgePin?.toUpperCase() === myPin);
        if (judgeMatch) targetPin = judgeMatch.ownerPin;
      }

      if (!targetPin) return;
      try {
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudState = snap.data() as GameState;
          const myCommandName = currentFullDeviceName;
          const syncedSettings: MatchSettings = { 
            ...matchSettings, 
            p1Name: cloudState.p1.name, 
            p1Partner: cloudState.p1.partnerName || '', 
            p2Name: cloudState.p2.name, 
            p2Partner: cloudState.p2.partnerName || '', 
            p1Color: cloudState.p1.color || 'azul', 
            p2Color: cloudState.p2.color || 'vermelho', 
            isDoubles: cloudState.matchConfig.isDoubles, 
            sets: cloudState.matchConfig.sets, 
            gamesPerSet: cloudState.matchConfig.gamesPerSet, 
            noAd: cloudState.matchConfig.noAd, 
            tieBreak: cloudState.matchConfig.tieBreak, 
            tieBreakAt: cloudState.matchConfig.tieBreakAt, 
            tieBreakPoints: cloudState.matchConfig.tieBreakPoints, 
            tieBreakWinByTwo: cloudState.matchConfig.tieBreakWinByTwo, 
            switchSidesOdd: cloudState.matchConfig.switchSidesOdd,
            tieBreakSideSwitchMode: cloudState.matchConfig.tieBreakSideSwitchMode,
            pickleballScoringMode: cloudState.matchConfig.pickleballScoringMode,
            pickleballServiceMode: cloudState.matchConfig.pickleballServiceMode,
            winnersStay: cloudState.matchConfig.winnersStay,
            isHistoryEnabled: cloudState.matchConfig.isHistoryEnabled,
            sportType: cloudState.matchConfig.sportType, 
            isWatchMode: !!matchSettings.isWatchMode 
          };
          const nextControllers = { ...(cloudState.controllers || {}) };
          nextControllers[deviceId] = { label: myCommandName, lastSeen: Date.now() };
          const updatedStateRaw = { ...cloudState, commandOwner: myCommandName, commandOwnerId: deviceId, controllers: nextControllers, isLiveClosed: false, matchConfig: { ...syncedSettings, setsToWin: syncedSettings.sets, isWatchMode: !!syncedSettings.isWatchMode } };
          const updatedState = sanitizeForFirestore(updatedStateRaw);
          if (updatedState) {
            await setDoc(doc(db, "live_matches", targetPin), updatedState, { merge: true }).catch(() => {});
            prevSettingsRef.current = JSON.parse(JSON.stringify(syncedSettings)); setMatchSettings(syncedSettings); 
            try { localStorage.setItem('myPlacarSettings', JSON.stringify(syncedSettings)); } catch(e) {}
            setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true);
            setGameState({ ...updatedState, isMirroringActive: true, matchConfig: { ...updatedState.matchConfig, isWatchMode: !!matchSettings.isWatchMode, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
            try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updatedState)); } catch(e) {}
            setShowLiveControlOverlay(false); if (currentScreen !== 'scoreboard') setCurrentScreen('scoreboard');
            setModalConfig({ title: "Sucesso", message: "Controle da partida assumido com sucesso.", variant: 'success', icon: <CheckCircle className="text-green-500 w-16 h-16" />, onConfirm: () => setModalConfig(null) });
            setTimeout(() => setModalConfig(null), 3000);
          }
        } else {
          setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Atenção", message: "A partida ao vivo não foi encontrada ou já foi encerrada.", onConfirm: () => setModalConfig(null) });
        }
      } catch (e) {}
    }
  };

  const handleSelectJudgeFromPartners = (partner: Partner) => {
    setJudgePinInput(partner.pin || '');
    setJudgeNicknameLookup(partner.nickname);
    setIsSelectingJudge(false);
    setCurrentScreen('scoreboard');
  };

  const handleObserveLive = async (targetPin?: string) => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para observar.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    let pinToObserve = targetPin || userProfile.pin?.toUpperCase();

    // Se não temos pinToObserve (ex: clicou no botão Live sem estar em uma partida própria)
    // mas somos juiz de alguma partida em activeLives, pegamos o ownerPin dessa partida.
    if (!targetPin && userProfile.pin) {
      const myPin = userProfile.pin.toUpperCase();
      const judgeMatch = activeLives.find(l => l.judgePin?.toUpperCase() === myPin);
      if (judgeMatch && judgeMatch.ownerPin) pinToObserve = judgeMatch.ownerPin;
    }

    if (db && pinToObserve) {
      const pinUpper = pinToObserve.toUpperCase();
      try {
        const snap = await getDoc(doc(db, "live_matches", pinUpper));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudData = snap.data() as GameState;
          const myCommandName = currentFullDeviceName;
          const myNickname = userProfile.nickname || userProfile.name.split(' ')[0];
          const nextControllers = { ...(cloudData.controllers || {}) };
          nextControllers[deviceId] = { label: myCommandName, nickname: myNickname, lastSeen: Date.now() };
          await updateDoc(doc(db, "live_matches", pinUpper), { controllers: nextControllers }).catch(() => {});
          
          // Sincronizar regras da partida se o juiz/observador estiver conectando
          if (cloudData.matchConfig) {
            setMatchSettings(prev => ({ ...prev, ...cloudData.matchConfig }));
          }

          setGameState({ ...cloudData, isMirroringActive: true, isLiveClosed: false, controllers: nextControllers, matchConfig: { ...cloudData.matchConfig, isWatchMode: !!matchSettings.isWatchMode, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
          setShowLiveControlOverlay(false); setCurrentScreen('scoreboard');
        } else {
          if (!targetPin) setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Atenção", message: "A partida ao vivo não foi encontrada ou já foi encerrada.", onConfirm: () => setModalConfig(null) });
        }
      } catch (e) {}
    }
  };

  useEffect(() => {
    const lookup = async () => {
      const pin = judgePinInput.toUpperCase().trim();
      if (pin.length === 5) {
        setIsSearchingJudgePin(true);
        const db = getDb();
        if (!db) return;
        try {
          const q = query(collection(db as Firestore, "users"), where("pin", "==", pin));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const data = snap.docs[0].data();
            setJudgeNicknameLookup(data.nickname || data.name.split(' ')[0]);
          } else {
            setJudgeNicknameLookup("Usuário não localizado");
          }
        } catch (e) {
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

  const handleAddJudge = async () => {
    if (!judgePinInput || judgePinInput.length < 5 || !gameState || !userProfile.pin) return;
    setIsSavingJudge(true);
    const db = getDb();
    if (!db) return;
    try {
      const pinUpper = judgePinInput.toUpperCase().trim();
      const nickname = judgeNicknameLookup;

      // Se o juiz não estiver nos parceiros, adiciona-lo
      if (pinUpper && !partners.some(p => p.pin === pinUpper)) {
        const newPartner: Partner = {
          id: `p_${Date.now()}`,
          pin: pinUpper,
          nickname: nickname || 'Juiz',
          addedAt: Date.now(),
          origin: 'manual'
        };
        const updatedPartners = [...partners, newPartner];
        setPartners(updatedPartners);
        localStorage.setItem('myPlacarPartners', JSON.stringify(updatedPartners));

        // Salvar no Firestore para persistência
        if (db && userProfile.pin) {
          await setDoc(doc(db as Firestore, 'users', userProfile.pin.toUpperCase(), 'partners', pinUpper), {
            pin: pinUpper,
            nickname: nickname || 'Juiz',
            addedAt: Date.now(),
            origin: 'manual'
          }).catch(err => console.error("Erro ao salvar parceiro no Firestore:", err));
        }
      }

      await updateDoc(doc(db as Firestore, "live_matches", userProfile.pin.toUpperCase()), { 
        judgePin: pinUpper,
        judgeNickname: nickname
      });
      setJudgePinInput('');
      setJudgeNicknameLookup('');
      setModalConfig({ title: "Sucesso", message: "Juiz adicionado com sucesso!", onConfirm: () => setModalConfig(null) });
    } catch (e) {
      setModalConfig({ title: "Erro", message: "Erro ao adicionar juiz.", onConfirm: () => setModalConfig(null) });
    } finally {
      setIsSavingJudge(false);
    }
  };

  const handleDeleteJudge = async () => {
    if (!userProfile.pin) return;
    const db = getDb();
    if (!db) return;
    try {
      await updateDoc(doc(db as Firestore, "live_matches", userProfile.pin.toUpperCase()), { 
        judgePin: null,
        judgeNickname: null
      });
      setConfirmDeleteJudge(false);
      setModalConfig({ title: "Sucesso", message: "Juiz removido.", onConfirm: () => setModalConfig(null) });
    } catch (e) {
      setModalConfig({ title: "Erro", message: "Erro ao remover juiz.", onConfirm: () => setModalConfig(null) });
    }
  };

  const handleExitSpectator = () => window.location.href = window.location.pathname;

  useEffect(() => { if (gameState?.isConfirmedFinished && !matchHistory.some(m => m.id === gameState.matchId)) finalizeMatchInternal(gameState); }, [gameState?.isConfirmedFinished, gameState?.matchId, finalizeMatchInternal, matchHistory]);

  const handleConfirmPartners = (team1: Partner[], team2: Partner[]) => {
    setMatchSettings(prev => {
      const next = { ...prev };
      if (!prev.isDoubles) { 
        if (team1.length > 0) { next.p1Name = team1[0].nickname; next.p1Verified = team1[0].pin === 'VERIFIED' || !!team1[0].pin; } 
        if (team2.length > 0) { next.p2Name = team2[0].nickname; next.p2Verified = team2[0].pin === 'VERIFIED' || !!team2[0].pin; } 
      }
      else { 
        if (team1.length >= 1) { next.p1Name = team1[0].nickname; next.p1Verified = team1[0].pin === 'VERIFIED' || !!team1[0].pin; } 
        if (team1.length >= 2) { next.p1Partner = team1[1].nickname; next.p1PartnerVerified = team1[1].pin === 'VERIFIED' || !!team1[1].pin; } 
        if (team2.length >= 1) { next.p2Name = team2[0].nickname; next.p2Verified = team2[0].pin === 'VERIFIED' || !!team2[0].pin; } 
        if (team2.length >= 2) { next.p2Partner = team2[1].nickname; next.p2PartnerVerified = team1[1].pin === 'VERIFIED' || !!team1[1].pin; } 
      }
      return next;
    });
  };

  const handleLogout = async () => {
    if (gameState?.isMirroringActive && userProfile.pin && userProfile.email && navigator.onLine) {
      const db = getDb();
      if (db) {
        const pinUpper = userProfile.pin.toUpperCase();
        if (gameState.commandOwnerId === deviceId) {
          await setDoc(doc(db, "live_matches", pinUpper), { isLiveClosed: true, isMirroringActive: false }, { merge: true }).catch(() => {});
        } else {
          const snap = await getDoc(doc(db, "live_matches", pinUpper));
          if (snap.exists() && snap.data().isLiveClosed !== true) {
            const data = snap.data();
            const nextControllers = { ...(data.controllers || {}) };
            delete nextControllers[deviceId];
            await updateDoc(doc(db, "live_matches", pinUpper), { controllers: nextControllers }).catch(() => {});
          }
        }
      }
    }
    setGameState(null); setUserProfile({ name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false }); setMatchSettings({ ...DEFAULT_TENNIS_SETTINGS, isHistoryEnabled: true }); setMatchHistory([]); setPartners([]); setCloudLiveExists(false); setIsWaitingSync(false); setActiveEvent(null); setRegisteredEvents([]);
    try {
      localStorage.removeItem('myPlacarUserProfile'); localStorage.removeItem('myPlacarActiveGameState'); localStorage.removeItem('myPlacarHistory'); localStorage.removeItem('myPlacarPartners'); localStorage.removeItem('myPlacarAssets'); localStorage.removeItem('myPlacarSettings'); localStorage.removeItem('myPlacar_DataVersion'); localStorage.removeItem('myPlacarPendingReferral'); localStorage.removeItem('myPlacarPendingReferralPin'); localStorage.removeItem('myPlacarPlayerQueue'); localStorage.removeItem('myPlacarActiveEvent'); localStorage.removeItem('myPlacarRegisteredEvents');
      Object.keys(localStorage).forEach(key => { if (key.startsWith('myPlacar_SavedSettings_')) localStorage.removeItem(key); });
    } catch(e) {}
    setCurrentScreen('auth'); setIsRecoveryFromMatchOver(false); window.history.replaceState({}, document.title, window.location.pathname);
    setIsMenuOpen(false);
    setModalConfig({ title: "Sessão finalizada", message: "Limpando dados da sessão anterior.", variant: 'success', icon: <CheckCircle className="text-green-500 w-16 h-16" />, onConfirm: () => setModalConfig(null) });
    setTimeout(() => setModalConfig(null), 2500);
  };

  const handleSaveProfile = async () => {
    try {
      localStorage.setItem('myPlacarUserProfile', JSON.stringify(userProfile));
      prevProfileRef.current = { ...userProfile };
      setIsProfileSaved(true);
      if (navigator.onLine && userProfile.email) {
        const db = getDb();
        if (db) {
          await setDoc(doc(db as Firestore, "users", userProfile.email.toLowerCase().trim()), {
            name: userProfile.name,
            nickname: userProfile.nickname,
            phone: userProfile.phone || '',
            gender: userProfile.gender || 'M',
            pin: userProfile.pin,
            authMethod: userProfile.authMethod || 'pin',
            isProfileComplete: userProfile.isProfileComplete,
            passkeyCredentialId: userProfile.passkeyCredentialId || null,
            passkeyPublicKey: userProfile.passkeyPublicKey || null,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }
    } catch (e) {
      console.error("Erro ao salvar perfil:", e);
    }
  };

  const handleJoinTournament = async (pin: string, silent = false, profileOverride?: UserProfile) => {
    const db = getDb();
    const activeProfile = profileOverride || userProfile;
    if (!db || !navigator.onLine) {
       if (!silent) setModalConfig({ title: "Erro", message: "Verifique sua conexão com a internet.", onConfirm: () => setModalConfig(null) });
       return;
    }
    if (!activeProfile.email) return;
    try {
      const snap = await getDoc(doc(db, "events", pin));
      if (snap.exists() && snap.data().active) {
        const eventData = { ...snap.data(), pin } as TournamentEvent;
        const entryRef = doc(db, "events", pin, "entries", activeProfile.email.toLowerCase().trim());
        const entrySnap = await getDoc(entryRef);
        const now = Date.now();
        if (!entrySnap.exists()) {
           await setDoc(entryRef, {
              email: activeProfile.email.toLowerCase().trim(),
              name: activeProfile.name,
              nickname: activeProfile.nickname,
              pin: activeProfile.pin,
              gender: activeProfile.gender || (activeProfile.nickname.toLowerCase().endsWith('a') ? 'F' : 'M'),
              joinedAt: now
           });
        }
        const userRegRef = doc(db, "user_registrations", activeProfile.email.toLowerCase().trim(), "events", pin);
        await setDoc(userRegRef, {
           pin,
           name: eventData.name,
           joinedAt: entrySnap.exists() ? entrySnap.data().joinedAt : now,
           bannerUrl: eventData.bannerUrl || null
        });
        setUserEntryDate(entrySnap.exists() ? entrySnap.data().joinedAt : now);
        setActiveEvent(eventData);
        setRegisteredEvents(prev => {
          if (prev.some(e => e.pin === pin)) return prev;
          return [{ pin, name: eventData.name, joinedAt: entrySnap.exists() ? entrySnap.data().joinedAt : now, bannerUrl: eventData.bannerUrl }, ...prev];
        });
        setCurrentScreen('event-detail');
        if (!silent) {
           setModalConfig({ 
             title: "Inscrição confirmada", 
             message: `Você entrou no evento "${eventData.name}".`, 
             variant: "success", 
             icon: <CheckCircle className="text-green-500 w-16 h-16" />, 
             onConfirm: () => setModalConfig(null) 
           });
        }
      } else if (!silent) {
        setModalConfig({ title: "Atenção", message: "O código do evento não foi encontrado ou está inativo.", onConfirm: () => setModalConfig(null) });
      }
    } catch (e) {
       if (!silent) setModalConfig({ title: "Erro", message: "Falha ao buscar evento.", onConfirm: () => setModalConfig(null) });
    }
  };

  const persistMatchSettings = useCallback(() => {
    try {
      localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings));
      setIsSettingsInicialSaved(true);
      setIsSettingsRegrasSaved(true);

      if (gameState?.isMirroringActive && userProfile.pin && userProfile.email && navigator.onLine && gameState.commandOwnerId === deviceId) {
        const db = getDb();
        if (db) {
          const pinUpper = userProfile.pin.toUpperCase();
          const stateToSync = sanitizeForFirestore({
            ...gameState,
            p1: { ...gameState.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, color: matchSettings.p1Color },
            p2: { ...gameState.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, color: matchSettings.p2Color },
            matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode }
          });
          if (stateToSync) setDoc(doc(db, "live_matches", pinUpper), stateToSync, { merge: true }).catch(() => {});
        }
      }
    } catch (e) {}
  }, [matchSettings, gameState, userProfile.pin, userProfile.email, deviceId]);

  const handleExitTournament = () => {
    setActiveEvent(null);
    setUserEntryDate(null);
  };

  const handleSmartSwitchServer = useCallback((team: 1 | 2, isPartner: boolean) => {
    if (!gameState || !isCommandOwner || gameState.isMatchOver) return;
    setIsSettingsInicialSaved(true);
    persistMatchSettings();
    const totalGames = gameState.p1.games + gameState.p2.games;
    const expectedServingTeam = (totalGames % 2 === 0) ? 1 : 2;
    let nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
    let nextSettings = { ...matchSettings };

    if (team !== expectedServingTeam) {
      const p1Tmp = { ...nextState.p1 };
      nextState.p1 = { ...nextState.p2 };
      nextState.p2 = p1Tmp;
      const tmpName = nextSettings.p1Name;
      const tmpPartner = nextSettings.p1Partner;
      const tmpV1 = nextSettings.p1Verified;
      const tmpPV1 = nextSettings.p1PartnerVerified;
      nextSettings.p1Name = nextSettings.p2Name;
      nextSettings.p1Partner = nextSettings.p2Partner;
      nextSettings.p1Verified = nextSettings.p2Verified;
      nextSettings.p1PartnerVerified = nextSettings.p2PartnerVerified;
      nextSettings.p2Name = tmpName;
      nextSettings.p2Partner = tmpPartner;
      nextSettings.p2Verified = tmpV1;
      nextSettings.p2PartnerVerified = tmpPV1;
    }

    const currentCycle = totalGames % 4;
    const expectedIsPartnerSlot = (currentCycle === 2 || currentCycle === 3);
    if (isPartner !== expectedIsPartnerSlot) {
        if (expectedServingTeam === 1) {
            const tmpName = nextState.p1.name;
            const tmpPartnerName = nextState.p1.partnerName;
            nextState.p1.name = tmpPartnerName || '';
            nextState.p1.partnerName = tmpName;
            nextSettings.p1Name = nextState.p1.name;
            nextSettings.p1Partner = nextState.p1.partnerName;
            const vTmp = nextSettings.p1Verified;
            nextSettings.p1Verified = nextSettings.p1PartnerVerified;
            nextSettings.p1PartnerVerified = vTmp;
        } else {
            const tmpName = nextState.p2.name;
            const tmpPartnerName = nextState.p2.partnerName;
            nextState.p2.name = tmpPartnerName || '';
            nextState.p2.partnerName = tmpName;
            nextSettings.p2Name = nextState.p2.name;
            nextSettings.p2Partner = nextState.p2.partnerName;
            const vTmp = nextSettings.p2Verified;
            nextSettings.p2Verified = nextSettings.p2PartnerVerified;
            nextSettings.p2PartnerVerified = vTmp;
        }
    }
    nextState.servingOrderOffset = currentCycle;
    nextState.server = expectedServingTeam;
    nextState.matchConfig = { ...nextState.matchConfig, ...nextSettings };
    setMatchSettings(nextSettings);
    prevSettingsRef.current = { ...nextSettings };
    setGameState(nextState);
    setIsSettingsInicialSaved(true);
    try { 
      localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
      localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
    } catch(e) {}
    
    if (nextState.isMirroringActive && userProfile.pin && userProfile.email && navigator.onLine && nextState.commandOwnerId === deviceId) {
      const db = getDb();
      if (db) {
        const pinUpper = userProfile.pin.toUpperCase();
        const stateToSync = sanitizeForFirestore(nextState);
        if (stateToSync) setDoc(doc(db, "live_matches", pinUpper), stateToSync, { merge: true }).catch(() => {});
      }
    }

    if (navigator.vibrate) navigator.vibrate(30);
  }, [gameState, isCommandOwner, matchSettings, userProfile.pin, userProfile.email, deviceId]);

  const initialReferralPin = useMemo(() => { try { return localStorage.getItem('myPlacarPendingReferralPin') || ''; } catch(e) { return ''; } }, []);

  const handleOfflineMode = useCallback(() => {
    setIsOfflineMode(true);
    const offlineSettings: MatchSettings = {
      ...matchSettings,
      p1Name: 'Jogador 1',
      p2Name: 'Jogador 2',
      isDoubles: false,
      voiceEnabled: false,
      voiceScoring: false,
      isHistoryEnabled: false,
      cloudSync: false,
      useGeminiVoice: false,
      isWatchMode: true,
    };
    setMatchSettings(offlineSettings);
    
    const matchId = `offline_${Date.now()}`;
    const initialGameState: GameState = {
      matchId,
      startTime: Date.now(),
      p1: { name: 'Jogador 1', score: '0', games: 0, sets: [], color: offlineSettings.p1Color },
      p2: { name: 'Jogador 2', score: '0', games: 0, sets: [], color: offlineSettings.p2Color },
      server: 1,
      servingOrderOffset: 0,
      pointHistory: [],
      matchConfig: { ...offlineSettings, setsToWin: offlineSettings.sets },
      history: [],
      currentSet: 0,
      isMatchOver: false,
      matchDuration: 0,
      isPaused: false,
    };
    setGameState(initialGameState);
    setCurrentScreen('scoreboard');
  }, [matchSettings]);

  const handleExitOffline = useCallback(() => {
    setIsOfflineMode(false);
    setGameState(null);
    setCurrentScreen('auth');
  }, []);

  const handleResetMatch = useCallback(() => {
    if (!gameState) return;
    setModalConfig({
      title: "Zerar partida",
      message: "Deseja zerar a partida? Esta ação não pode ser desfeita.",
      confirmLabel: "Sim, zerar",
      onConfirm: () => {
        const resetState: GameState = {
          ...gameState,
          startTime: Date.now(),
          p1: { ...gameState.p1, score: '0', games: 0, sets: [] },
          p2: { ...gameState.p2, score: '0', games: 0, sets: [] },
          server: 1,
          servingOrderOffset: 0,
          pointHistory: [],
          history: [],
          currentSet: 0,
          isMatchOver: false,
          isConfirmedFinished: false,
          matchDuration: 0,
          isPaused: false,
        };
        setGameState(resetState);
        setHistoryStack([resetState]);
        setModalConfig(null);
      },
      onCancel: () => setModalConfig(null)
    });
  }, [gameState]);

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
          if (screen === 'admin' && tab) {
            setAdminTab(tab as any);
          } else if (tab) {
            setActiveTab(tab as any);
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
          <div className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl space-y-8 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto shadow-inner">
              <AlertCircle size={48} />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Versão descontinuada</h2>
              <p className="text-sm font-bold text-slate-500 leading-relaxed">Esta versão do aplicativo não é mais suportada. Por favor, utilize o novo endereço oficial para continuar usando o My placar.</p>
            </div>
            <div className="pt-4">
              <button 
                onClick={() => window.location.href = newAppUrl}
                className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-base shadow-xl shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Acessar novo endereço <ArrowLeftRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
      {showLiveControlOverlay && (
        <div className="fixed inset-0 z-[100005] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white/90 backdrop-blur-2xl rounded-[3rem] p-8 w-full max-sm shadow-2xl border border-white/50 flex flex-col items-center gap-6 animate-in zoom-in duration-300 relative">
              <button onClick={() => { setShowLiveControlOverlay(false); setConfirmDeleteLive(false); setConfirmDeleteJudge(false); }} className="absolute top-6 right-6 p-2 text-black hover:bg-gray-100 rounded-full transition-colors active:scale-90"><X size={28} strokeWidth={3} /></button>
              <LiveIndicator variant="card" className="scale-125 mb-2" role={indicatorRole} />
              
              {!confirmDeleteLive && !confirmDeleteJudge ? (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-black tracking-tight leading-tight">
                      {isCurrentController ? 'Você está no controle' : 'Live em andamento, quer controlar?'}
                    </h3>
                    <p className="text-xs font-bold text-slate-500">
                      {isCurrentController ? 'A transmissão está ativa para os seus parceiros.' : 'Isso aplicará as regras salvas neste celular.'}
                    </p>
                  </div>

                  <div className="flex flex-col w-full gap-3">
                    {/* Botão Controlar - Visível para Owner ou Judge */}
                    {(isOriginalOwner || liveRole === 'judge') && !isCurrentController && (
                      <button onClick={handleControlLive} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black text-base shadow-xl shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-3">
                        {isOriginalOwner ? <Crown size={24} /> : <UserCheck size={24} />} Controlar
                      </button>
                    )}

                    {/* Botão Observador - Visível para todos exceto quando Owner é o único controlador */}
                    {(!isCurrentController || liveRole === 'judge' || gameState?.judgePin) && (
                      <button onClick={() => handleObserveLive()} className="w-full py-5 bg-[#00FFFF] text-black rounded-[2rem] font-black text-base shadow-xl shadow-cyan-100 active:scale-95 transition-all flex items-center justify-center gap-3">
                        <Eye size={24} /> Observador
                      </button>
                    )}

                    {/* Bloco do Proprietário - Visível para o Juiz */}
                    {liveRole === 'judge' && (
                      <div className="w-full mt-4 pt-4 border-t border-gray-100 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Crown size={18} className="text-slate-400" />
                          <span className="text-[10px] font-black text-slate-400">Proprietário da live</span>
                        </div>
                        <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-black">Status</span>
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black ${isOwnerOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                              <div className={`w-1 h-1 rounded-full ${isOwnerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                              {isOwnerOnline ? 'Online' : 'Offline'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Botão Excluir Transmissão - Apenas para Owner */}
                    {isOriginalOwner && (
                      <button onClick={() => setConfirmDeleteLive(true)} className="w-full py-4 text-red-500 font-black text-xs active:scale-95 flex items-center justify-center gap-2 mt-2">
                        <Trash2 size={16} /> Excluir transmissão
                      </button>
                    )}
                  </div>
                </>
              ) : confirmDeleteLive ? (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-red-500 tracking-tight leading-tight">Quer realmente excluir a live em andamento?</h3>
                    <p className="text-xs font-bold text-slate-500">Essa ação encerrará a transmissão para todos.</p>
                  </div>
                  <div className="flex flex-col w-full gap-3">
                    <button onClick={handleCloseCloudLive} className="w-full py-5 bg-red-600 text-white rounded-3xl font-black text-base shadow-xl shadow-red-200 active:scale-95 transition-all">Confirmar exclusão</button>
                    <button onClick={() => setConfirmDeleteLive(false)} className="w-full py-4 text-slate-400 font-bold text-xs tracking-widest">Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-red-500 tracking-tight leading-tight">Remover juiz?</h3>
                    <p className="text-xs font-bold text-slate-500">O juiz perderá o acesso de controle à partida.</p>
                  </div>
                  <div className="flex flex-col w-full gap-3">
                    <button onClick={handleDeleteJudge} className="w-full py-5 bg-red-600 text-white rounded-3xl font-black text-base shadow-xl shadow-red-200 active:scale-95 transition-all">Confirmar remoção</button>
                    <button onClick={() => setConfirmDeleteJudge(false)} className="w-full py-4 text-slate-400 font-bold text-xs tracking-widest">Cancelar</button>
                  </div>
                </>
              )}
           </div>
        </div>
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
      {modalConfig && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-xs shadow-2xl animate-in zoom-in duration-300 space-y-6 flex flex-col items-center">
            {modalConfig.icon && <div className="mb-2">{modalConfig.icon}</div>}
            <h3 className="text-2xl font-black mb-4 text-center">{modalConfig.title}</h3>
            <p className="text-black font-black mb-6 leading-tight text-center">{modalConfig.message}</p>
            <div className="flex gap-3 w-full">
              {modalConfig.onCancel && <button onClick={() => setModalConfig(null)} className="flex-1 py-4 bg-gray-100 rounded-[1.5rem] font-black text-xs tracking-widest text-black">Cancelar</button>}
              <button onClick={() => { modalConfig.onConfirm(); setModalConfig(null); }} className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest ${modalConfig.variant === 'danger' ? 'bg-red-50 text-black shadow-lg shadow-red-100' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'}`}>{modalConfig.confirmLabel || 'Ok'}</button>
            </div>
          </div>
        </div>
      )}
      <InstallPwaModal isOpen={showInstallPwa} onClose={() => setShowInstallPwa(false)} deferredPrompt={deferredPrompt} />
      {currentScreen === 'spectator' && (spectatorMatchId || spectatorPin) && <SpectatorScreen matchId={spectatorMatchId || ''} spectatorPin={spectatorPin || ''} onExit={handleExitSpectator} />}
      {currentScreen === 'auth' && <AuthScreen appUrl={appUrl} onAuthSuccess={(p, s) => { 
        setIsOfflineMode(false);
        if (s) { 
          try { 
            localStorage.setItem('myPlacarUserProfile', JSON.stringify(p)); 
            localStorage.setItem('myPlacarSavedPin', p.pin); 
            localStorage.setItem('myPlacarSavedEmail', p.email); 
          } catch(e) {} 
        } 
        setUserProfile(p); 
      }} onCheckUpdate={handleCheckUpdate} setIsUpdatingVersion={setIsUpdatingVersion} initialReferralPin={initialReferralPin} onOfflineMode={handleOfflineMode} />}
      {currentScreen === 'settings' && <SettingsScreen 
        appUrl={appUrl}
        history={matchHistory} setHistory={setMatchHistory} 
        onDeleteMatch={id => setModalConfig({ title: "Excluir partida?", message: "Apagar registro permanentemente?", confirmLabel: "Excluir", variant: 'danger', onConfirm: async () => { const db = getDb(); const cleanEmail = userProfile.email?.toLowerCase().trim(); if (db && cleanEmail && navigator.onLine) try { await deleteDoc(doc(db as any, "matches", id)); } catch(e) {} persistHistory(matchHistory.filter(m => m.id !== id)); }, onCancel: () => setModalConfig(null) })} 
        onDeleteManyMatches={ids => setModalConfig({ title: `Excluir ${ids.size} partidas?`, message: "Apagar registros permanentemente?", confirmLabel: "Excluir", variant: 'danger', onConfirm: async () => { const db = getDb(); const cleanEmail = userProfile.email?.toLowerCase().trim(); if (db && cleanEmail && navigator.onLine) { const batch = writeBatch(db as any); ids.forEach(id => batch.delete(doc(db as any, "matches", id))); try { await batch.commit(); } catch(e) {} } persistHistory(matchHistory.filter(m => !ids.has(m.id))); }, onCancel: () => setModalConfig(null) })}
        onBack={() => { persistMatchSettings(); setCurrentScreen('settings'); }} onNewGame={() => { persistMatchSettings(); setCurrentScreen('new-game'); }} gameState={gameState} settings={matchSettings} setSettings={setMatchSettings} onStart={() => { persistMatchSettings(); initGameState(true); }} onPlayShortcut={() => { persistMatchSettings(); initGameState(false); }} onOpenRules={() => { persistMatchSettings(); setCurrentScreen('new-game'); }} activeTab={activeTab} setActiveTab={(t) => { persistMatchSettings(); setActiveTab(t); }} onViewMap={id => { setFocusMatchId(id); setCurrentScreen('location'); }} userProfile={userProfile} setUserProfile={setUserProfile} onSaveProfile={handleSaveProfile} onLogout={handleLogout} onGoAdmin={() => setCurrentScreen('admin')} onGoToScoreboard={() => { persistMatchSettings(); initGameState(false); }} isSettingsInicialSaved={isSettingsInicialSaved} isSettingsRegrasSaved={isSettingsRegrasSaved} isProfileSaved={isProfileSaved} canStartMatch={canStartMatch} onSyncAll={(force) => syncHistoryToFirebase(undefined, force)} onDownloadHistory={downloadHistoryFromFirebase} cloudMatchesCount={cloudMatchesCount} isSyncingAll={isSyncing} isDownloading={isDownloading} onOpenPartners={() => setCurrentScreen('partners')} partners={partners} onAutoRegisterPartner={async (p, field) => { 
          if (!navigator.onLine) return null; 
          const db = getDb(); 
          if (!db) return null; 
          try { 
            const q = query(collection(db as any, "users"), where("pin", "==", p.toUpperCase())); 
            const s = await getDocs(q); 
            if (!s.empty) { 
              const d = s.docs[0].data(); 
              const nick = d.nickname || d.name.split(' ')[0]; 
              const fullName = d.name;
              setPartners(prev => { 
                if (prev.some(x => x.pin.toUpperCase() === p.toUpperCase())) return prev; 
                return [...prev, { id: s.docs[0].id, name: fullName, nickname: nick, pin: p.toUpperCase(), addedAt: Date.now(), origin: 'qrcode', gender: d.gender }]; 
              }); 
              if (field) setMatchSettings(prev => ({ ...prev, [`${field}Verified`]: true })); 
              return nick; 
            } 
          } catch(e) {} 
          return null; 
        }} 
        onDeletePartners={ids => setModalConfig({ title: "Excluir parceiros?", message: "Apagar registro permanentemente?", confirmLabel: "Excluir", variant: 'danger', onConfirm: () => {
          setPartners(prev => {
            const next = prev.filter(p => !ids.has(p.id));
            return next;
          });
        }, onCancel: () => setModalConfig(null) })}
        cloudLiveExists={cloudLiveExists} onCheckUpdate={handleCheckUpdate} setIsUpdatingVersion={setIsUpdatingVersion} onOpenLiveControl={() => setShowLiveControlOverlay(true)} role={liveRole}
        activeEvent={activeEvent} userEntryDate={userEntryDate} onJoinTournament={() => setCurrentScreen('tournaments')} onExitTournament={handleExitTournament}
        onOpenCommunications={() => setCurrentScreen('communications')} unreadCount={unreadCommsCount}
        onOpenMenu={() => setIsMenuOpen(true)}
        isOfflineMode={isOfflineMode}
      />}
      {currentScreen === 'partners' && <PartnersScreen appUrl={appUrl} partners={partners} setPartners={setPartners} playerQueue={playerQueue} setPlayerQueue={setPlayerQueue} onBack={() => { if (isSelectingJudge) { setIsSelectingJudge(false); setCurrentScreen('scoreboard'); } else setCurrentScreen('settings'); }} isDoubles={matchSettings.isDoubles} onUpdateSettings={(updates) => setMatchSettings(prev => ({ ...prev, ...updates }))} userProfile={userProfile} onConfirmSelection={handleConfirmPartners} onSelectPartner={isSelectingJudge ? handleSelectJudgeFromPartners : undefined} p1Color={matchSettings.p1Color} p2Color={matchSettings.p2Color} activeLives={activeLives} onWatchLive={(pin) => { 
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
        matchSettings={matchSettings} 
        activeEvent={activeEvent}
      />}
      {currentScreen === 'new-game' && <NewGameScreen 
        baseSettings={DEFAULT_TENNIS_SETTINGS} 
        settings={matchSettings} 
        setSettings={setMatchSettings} 
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
        role={liveRole} 
        activeEvent={activeEvent} 
        onJoinTournament={() => setCurrentScreen('tournaments')} 
        onExitTournament={handleExitTournament} 
        onOpenMenu={() => { persistMatchSettings(); setIsMenuOpen(true); }} 
        userProfile={userProfile} 
        isOfflineMode={isOfflineMode} 
        onExitOffline={handleExitOffline} 
        onVersionTap={handleVersionTap}
      />}
      {showLogViewer && <LogViewer logs={logs} onClose={() => setShowLogViewer(false)} onClear={() => setLogs([])} />}
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
      {currentScreen === 'scoreboard' && (gameState || isWaitingSync) && <ScoreboardScreen 
        appUrl={appUrl} 
        gameState={gameState!} 
        onScoreUpdate={handleScoreUpdate}
        isOriginalOwner={isOriginalOwner}
        judgePinInput={judgePinInput}
        setJudgePinInput={setJudgePinInput}
        isSearchingJudgePin={isSearchingJudgePin}
        judgeNicknameLookup={judgeNicknameLookup}
        isSavingJudge={isSavingJudge}
        onAddJudge={handleAddJudge}
        onDeleteJudge={() => { setConfirmDeleteJudge(true); setShowLiveControlOverlay(true); }}
        isJudgeOnline={isJudgeOnline}
        onSelectJudgeFromPartners={() => { setIsSelectingJudge(true); setCurrentScreen('partners'); }} onUndo={() => {         if (!gameState || !isCommandOwner) return;
        const p = undoPoint(historyStack); 
        if (p) { 
          const s = gameState!; const isFinishedPending = (s.isMatchOver && !s.isConfirmedFinished);
          if (isFinishedPending) { setHistoryStack(historyStack.slice(0,-1)); setGameState({...p, isPaused: false, isMatchOver: false}); setIsRecoveryFromMatchOver(true); if (navigator.vibrate) navigator.vibrate(50); return; }
          if (isRecoveryFromMatchOver) { const isCrossingGameOrSet = (p.p1.games !== s.p1.games) || (p.p2.games !== s.p2.games) || (p.p1.sets.length !== s.p1.sets.length); if (isCrossingGameOrSet) return; }
          setHistoryStack(historyStack.slice(0,-1)); setGameState({...p, isPaused: false, isMatchOver: false}); if (navigator.vibrate) navigator.vibrate(30);
        } 
      }} onSwitchServer={handleSmartSwitchServer} onTogglePause={() => { 
        if(!gameState || gameState.isConfirmedFinished || gameState.isMatchOver || gameState.isLiveClosed || !isCommandOwner) return; 
        setGameState(p => p ? {...p, isPaused: !p.isPaused} : null); 
      }} onBack={() => setCurrentScreen('new-game')} onHome={() => setCurrentScreen('settings')} onNavigateToTab={t => { setActiveTab(t); setCurrentScreen('settings'); }} isSettingsInicialSaved={isSettingsInicialSaved} isSettingsRegrasSaved={isSettingsRegrasSaved} onToggleMirroring={a => { 
        if(!gameState || gameState.isConfirmedFinished || gameState.isLiveClosed) return; 
        if (a) { const isStarted = (gameState.pointHistory?.length ?? 0) > 0 || gameState.p1.games > 0 || gameState.p2.games > 0 || (gameState.p1.score !== '0' && gameState.p1.score !== '') || (gameState.p2.score !== '0' && gameState.p2.score !== ''); if (isStarted) { setModalConfig({ title: "Atenção", message: "Não é possível iniciar a live com a partida em andamento.", onConfirm: () => setModalConfig(null) }); return; } }
        const db = getDb();
        if (a && db && userProfile.pin && navigator.onLine) {
          const nextControllers = { [deviceId]: { label: currentFullDeviceName, lastSeen: Date.now() } };
          const stateToSave = sanitizeForFirestore({...gameState, isMirroringActive: true, commandOwner: currentFullDeviceName, commandOwnerId: deviceId, controllers: nextControllers, isLiveClosed: false});
          if (stateToSave) { setDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), stateToSave).catch(() => {}); }
        }
        setGameState(p => p ? {...p, isMirroringActive: a, isLiveClosed: false, commandOwnerId: a ? deviceId : p.commandOwnerId} : null); 
      }} onCorrectScore={handleCorrectScore} isAdmin={isAdmin} onConfirmMatch={async () => {
        const db = getDb(); if (db && userProfile.pin && navigator.onLine) try { await updateDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), { isConfirmedFinished: true, isLiveClosed: true }); } catch (e) {} 
        setGameState(p => p ? {...p, isConfirmedFinished: true, isPaused: false, isMirroringActive: false} : null);
      }} userProfile={userProfile} isRecoveryFromMatchOver={isRecoveryFromMatchOver} currentDeviceId={deviceId} currentDeviceFullLabel={currentFullDeviceName} onOpenLiveControl={() => setShowLiveControlOverlay(true)} onResetMatch={handleResetMatch} onOpenMenu={() => setIsMenuOpen(true)} isOfflineMode={isOfflineMode} onExitOffline={handleExitOffline} cloudLiveExists={cloudLiveExists} role={liveRole} />}
      {currentScreen === 'location' && <LocationScreen history={matchHistory} focusMatchId={focusMatchId} onBack={() => { setFocusMatchId(null); setActiveTab('history'); setCurrentScreen('settings'); }} />}
      {currentScreen === 'tournaments' && <TournamentsScreen registrations={registeredEvents} onBack={() => setCurrentScreen('settings')} onJoin={handleJoinTournament} onSelectEvent={(ev) => { setActiveEvent(ev as TournamentEvent); setCurrentScreen('event-detail'); }} />}
      {currentScreen === 'event-detail' && activeEvent && <EventDetailScreen appUrl={appUrl} event={activeEvent} onBack={() => setCurrentScreen('tournaments')} userProfile={userProfile} onExitTournament={handleExitTournament} onAddPartner={async (pin, nickname, gender, name) => { setPartners(prev => [{ id: `p_${Date.now()}`, name, nickname, pin, origin: 'manual', addedAt: Date.now(), gender }, ...prev]); }} partners={partners} onStartTournamentMatch={(match, pair1, pair2, ev) => initGameState(true, { match, pair1, pair2, event: ev })} setModalConfig={setModalConfig} />}
      {currentScreen === 'communications' && <CommunicationsScreen userProfile={userProfile} onBack={() => setCurrentScreen('settings')} />}
    </div>
    </ErrorBoundary>
  );
};

export default App;

