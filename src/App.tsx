import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthScreen } from './screens/AuthScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { ScoreboardScreen } from './screens/ScoreboardScreen.tsx';
import { NewGameScreen } from './screens/NewGameScreen.tsx';
import { AdminScreen } from './screens/AdminScreen.tsx';
import { SpectatorScreen } from './screens/SpectatorScreen.tsx';
import { LocationScreen, clearCloudHistory, createHistoryItem, downloadHistoryBatch, fetchCloudHistoryCount, getUnsyncedHistory, persistLocalHistory, removeHistoryMatches, syncHistoryBatch } from '@modules/history';
import { PartnersScreen, addPartnerToState, applyPartnerSelection, autoRegisterPartnerByPin, createManualPartner, hasPartnerWithPin } from '@modules/partners';
import { EventDetailScreen, TournamentsScreen, fetchRegisteredEvents, getActiveEventEntryDate, joinTournamentEvent, markTournamentMatchFinished, markTournamentMatchLive } from '@modules/events';
import { CommunicationsScreen } from './screens/CommunicationsScreen.tsx';
import { InstallPwaModal } from './components/InstallPwaModal.tsx';
import { NavigationDrawer } from './components/NavigationDrawer.tsx';
// import { Input } from './components/Input.tsx'; // unused
import type { Partner, QueuePlayer } from '@modules/partners';
import type { MatchHistoryItem } from '@modules/history';
import type { EventRegistration, TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events';
import { GameState, MatchSettings, Screen, UserProfile, PointType, AdminTab, ControllerRecord, Tab, LivePapel, LiveType, LiveLogEntry } from './types.ts';
// NOTA: adicionar 'public-scoreboard' ao tipo Screen em types.ts
import { isValidGameState, isValidMatchSettings } from './utils/validation.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { DEFAULT_TENNIS_SETTINGS, APP_VERSION as LOCAL_CODE_VERSION } from './constants.ts';
import { incrementScore, undoPoint } from './utils/tennisEngine.ts';
import { initPickleballState } from './utils/pickleballEngine.ts';
import { applyGoldenRule } from './utils/formatters.ts';
import { isWatchDevice, getDeviceType } from './utils/device.ts';
import { findUserByPin, getDb, clearFirestoreCache, deleteCloudMatch, deleteCloudMatches } from '@infra/firebase';

/** Detecta o tipo físico do dispositivo atual para gravar no ControllerRecord */
// getDeviceType movido para src/utils/device.ts
import { getAuthInstance } from '@infra/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, writeBatch, collection, query, where, getDocs, deleteDoc, getDoc, updateDoc, onSnapshot, Firestore, deleteField, FieldValue } from 'firebase/firestore';
import { AlertCircle, Trash2, RotateCw, RefreshCw, Wifi, X, CheckCircle, Eye, Loader2, ArrowLeftRight, Crown, UserCheck, Trophy, WifiOff } from 'lucide-react';
import { LiveIndicator } from './components/LiveIndicator.tsx';
import { useAppLogger } from './hooks/useAppLogger.ts';
import { useInstallPwa } from './hooks/useInstallPwa.ts';
import { useOnlineSync } from './hooks/useOnlineSync.ts';
import { mirrorUser } from './services/supabaseMirror.ts';
import { deleteSupabaseMatch, deleteSupabaseMatches } from '@infra/supabase';

const CURRENT_DATA_VERSION = '3.1.0'; // bumped: limpa SavedSettings_* para forçar novos defaults por esporte

function safeJsonParse(key: string, fallback: unknown) {
  try {
    if (typeof window === 'undefined' || !globalThis.localStorage) return fallback;
    const saved = localStorage.getItem(key);
    if (saved && saved !== "undefined" && saved !== "null" && saved.trim() !== "") {
      const parsed = JSON.parse(saved);
      if (key === 'myPlacarActiveGameState' && parsed !== null) {
        if (!isValidGameState(parsed)) {
          localStorage.removeItem(key);
          return fallback;
        }
      }
      if (key === 'myPlacarSettings' && parsed !== null) {
        if (!isValidMatchSettings(parsed)) {
          return fallback;
        }
      }
      return parsed;
    }
  } catch {}
  return fallback;
}

const getUrlParams = () => new URLSearchParams(globalThis.location.search);
const getDeviceId = () => {
  try {
    let id = localStorage.getItem('myPlacar_DeviceId');
    if (!id) {
      id = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('myPlacar_DeviceId', id);
    }
    return id;
  } catch (_e) {
    return "session_" + Math.random().toString(36).substring(2, 11);
  }
};

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

// ─── Helpers para persistência do ownerPin da live ────────────────────────────
// O ownerPin é a chave do documento no Firestore (live_matches/<ownerPin>).
// Persisti-lo no localStorage garante que qualquer resolução de targetPin
// tenha uma fonte confiável mesmo antes de activeLives ser populado.
const LIVE_OWNER_PIN_KEY = 'myPlacar_LiveOwnerPin';

const persistLiveOwnerPin = (pin: string) => {
  try { localStorage.setItem(LIVE_OWNER_PIN_KEY, pin.toUpperCase()); } catch {}
};

const clearLiveOwnerPin = () => {
  try { localStorage.removeItem(LIVE_OWNER_PIN_KEY); } catch {}
};

const getPersistedLiveOwnerPin = (): string | null => {
  try { return localStorage.getItem(LIVE_OWNER_PIN_KEY); } catch { return null; }
};

// Guard: valida que o targetPin é o PIN real do owner antes de qualquer
// escrita em live_matches. Evita criar documentos com ID errado.
// Retorna false e loga erro se a escrita for inválida.
const assertOwnerPin = (targetPin: string | undefined, ownerPin: string | undefined, context: string): boolean => {
  if (!targetPin) {
    console.error(`[LiveGuard:${context}] targetPin indefinido — escrita abortada.`);
    return false;
  }
  const persisted = getPersistedLiveOwnerPin();
  // targetPin deve bater com ownerPin do gameState OU com o persisted do localStorage.
  // Se nenhum referencial estiver disponível ainda, permite (primeira ativação).
  if (ownerPin && targetPin !== ownerPin.toUpperCase() && persisted && targetPin !== persisted) {
    console.error(`[LiveGuard:${context}] targetPin "${targetPin}" diverge do ownerPin "${ownerPin}" e do persisted "${persisted}" — escrita abortada.`);
    return false;
  }
  return true;
};

const App: React.FC = () => {
  const urlParams = getUrlParams();
  const deviceId = getDeviceId();
  
  const initialSpectatorMatchId = urlParams.get('viewMatch');
  const initialSpectatorPin = urlParams.get('viewPin');
  const initialViewMode = urlParams.get('viewMode'); // 'scoreboard' | 'watch' | null
  
  const [currentScreen, setCurrentScreen] = useState<Screen>(() => {
    if (initialSpectatorPin && initialViewMode === 'scoreboard') return 'public-scoreboard';
    if (initialSpectatorMatchId || initialSpectatorPin) return 'spectator';
    
    const params = getUrlParams();
    if (params.get('mode') === 'resetPassword' || params.get('oobCode')) return 'auth';

    // Auto-login: se houver perfil salvo válido e completo, pula o AuthScreen
    try {
      const saved = localStorage.getItem('myPlacarUserProfile');
      if (saved) {
        const profile = JSON.parse(saved) as UserProfile;
        if (profile?.email && profile?.pin && profile?.isProfileComplete) {
          return 'settings';
        }
      }
    } catch {}
    return 'auth';
  });

  // authReady: true quando o Firebase Auth terminou de restaurar a sessão.
  // Impede que listeners do Firestore disparem com request.auth == null no refresh.
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    const auth = getAuthInstance();
    if (!auth) { setAuthReady(true); return; }
    const unsub = onAuthStateChanged(auth, () => {
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Sinaliza que o app carregou IMEDIATAMENTE — independente do auth
    globalThis.dispatchEvent(new CustomEvent('app-ready'));
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const db = getDb();
    if (!db) return;
    const unsubscribe = onSnapshot(doc(db, "system", "config"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.appUrl) {
          const isDev = window.location.hostname.includes('run.app') || window.location.hostname.includes('localhost');
          if (!isDev) {
            setAppUrl(data.appUrl);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [authReady]);

  const [spectatorMatchId, _setMatchId] = useState<string | null>(initialSpectatorMatchId);
  const [spectatorPin, setSpectatorPin] = useState<string | null>(initialSpectatorPin);

  const [modalConfig, setModalConfig] = useState<{title: string, message: string, onConfirm: () => void, onCancel?: () => void, confirmLabel?: string, cancelLabel?: string, variant?: 'info' | 'danger' | 'success', icon?: React.ReactNode} | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [cloudMatchesCount, setCloudMatchesCount] = useState(0);
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);
  const [showInstallPwa, setShowInstallPwa] = useState(false);
  const [installPromptShownSession, setInstallPromptShownSession] = useState(true);
  const { deferredPrompt } = useInstallPwa();
  
  const [isSettingsInicialSaved, setIsSettingsInicialSaved] = useState(true);
  const [isSettingsRegrasSaved, setIsSettingsRegrasSaved] = useState(true);
  const [isProfileSaved, setIsProfileSaved] = useState(true);
  const [activeCloudMatch, setActiveCloudMatch] = useState<{id: string, sport: string} | null>(null);
  const [cloudLiveExists, setCloudLiveExists] = useState<boolean>(false);
  const [activeLives, setActiveLives] = useState<GameState[]>([]);

  useEffect(() => {
    // Detecta se é um link de reset de senha e força a tela de auth
    const params = getUrlParams();
    if (params.get('mode') === 'resetPassword' || params.get('oobCode')) {
      setCurrentScreen('auth');
    }
  }, []);
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [appUrl, setAppUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      // Se estiver no AI Studio ou dev environment, usa o origin atual
      if (window.location.hostname.includes('run.app') || window.location.hostname.includes('localhost')) {
        return window.location.origin;
      }
    }
    return "https://myplacar.app.br/"; // Valor padrão de produção
  });

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const profile = safeJsonParse('myPlacarUserProfile', { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' });
    return (profile && profile.email) ? profile : { name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' };
  });

  const { logs, clearLogs } = useAppLogger();
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [_versionTapCount, setVersionTapCount] = useState(0);

  // ─── Live Logs: persistem ao trocar de tela ────────────────────────────────
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const [voiceLogs, setVoiceLogs] = useState<{id: string, startTime: string, before: string, after: string, text: string, latency: number, timestamp: number, isError?: boolean, winner?: 1 | 2, isRemote?: boolean, liveSequence?: number, liveId?: number, source: string}[]>([]);

  // Captura de logs via useAppLogger

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

  const [matchSettings, setMatchSettings] = useState<MatchSettings>(() => {
    const s = safeJsonParse('myPlacarSettings', { ...DEFAULT_TENNIS_SETTINGS, winnersStay: false });
    try {
      s.deviceLabel = localStorage.getItem('myPlacar_LocalDeviceLabel') || '';
      s.brightness = parseInt(localStorage.getItem('myPlacar_LocalBrightness') || '100');
      s.volume = parseInt(localStorage.getItem('myPlacar_LocalVolume') || '100');
      // Se é um relógio, sempre ativa o modo relógio independente do valor salvo.
      // Caso contrário, respeita a preferência salva ou detecta automaticamente.
      if (isWatchDevice()) {
        s.isWatchMode = true;
        localStorage.setItem('myPlacar_LocalWatchMode', 'true');
      } else {
        const savedWatchMode = localStorage.getItem('myPlacar_LocalWatchMode');
        if (savedWatchMode !== null) {
          s.isWatchMode = savedWatchMode === 'true';
        } else {
          s.isWatchMode = false;
          localStorage.setItem('myPlacar_LocalWatchMode', 'false');
        }
      }

      s.selectedVoiceURI = localStorage.getItem('myPlacar_LocalVoiceURI') || s.selectedVoiceURI;
      s.voiceEnabled = localStorage.getItem('myPlacar_LocalVoiceEnabled') !== 'false';
      s.voiceScoring = localStorage.getItem('myPlacar_LocalVoiceScoring') !== 'false';
      s.actionCooldown = parseInt(localStorage.getItem('myPlacar_LocalActionCooldown') || '5');
      s.stateLockout = parseInt(localStorage.getItem('myPlacar_LocalStateLockout') || '10');
      s.screenDimTimeout = (parseInt(localStorage.getItem('myPlacar_LocalScreenDimTimeout') || '10') as 10 | 15 | 20);

      if (!s.deviceLabel) {
        // Usa isWatchDevice para label mais preciso que apenas verificar UA
        if (isWatchDevice()) {
          s.deviceLabel = 'Relógio';
        } else {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          s.deviceLabel = isMobile ? 'Celular' : 'Note';
        }
        localStorage.setItem('myPlacar_LocalDeviceLabel', s.deviceLabel);
      }
    } catch {}
    return s;
  });

  const [gameState, setGameState] = useState<GameState | null>(() => {
    const saved = safeJsonParse('myPlacarActiveGameState', null) as GameState | null;
    // Se o estado restaurado é pickleball mas não tem o sub-objeto pickleball
    // (salvo por versão anterior), reinicializa para evitar bugs de serverNumber.
    if (saved && saved.matchConfig?.sportType === 'pickleball' && !saved.pickleball) {
      saved.pickleball = initPickleballState(saved);
    }
    return saved;
  });

  // Refs espelho de gameState e activeLives — declarados logo após os estados para
  // garantir que estejam disponíveis em qualquer useEffect ou closure abaixo,
  // incluindo o performExit (que não pode ter gameState/activeLives no dep array).
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  const activeLivesRef = useRef<GameState[]>([]);
  useEffect(() => { activeLivesRef.current = activeLives; }, [activeLives]);

  const isOriginalOwner = useMemo(() => {
    // Fonte primária: ownerDeviceId no gameState local — fixo, gravado na criação da live.
    if (gameState?.ownerDeviceId) return gameState.ownerDeviceId === deviceId;
    // Fallback: activeLives (Firebase) — cobre o caso de gameState ainda não carregado.
    if (activeLives.some(l => l.ownerDeviceId === deviceId)) return true;
    // Último fallback por PIN: compatibilidade com sessões sem ownerDeviceId
    // (não deve ocorrer em novas lives, mas protege contra estado corrompido).
    if (!userProfile.pin) return false;
    const myPin = userProfile.pin.toUpperCase();
    if (activeLives.some(l => l.ownerPin?.toUpperCase() === myPin)) {
      // Só considera owner por PIN se não há outro device como ownerDeviceId
      return !activeLives.some(l => l.ownerDeviceId && l.ownerDeviceId !== deviceId && l.ownerPin?.toUpperCase() === myPin);
    }
    return false;
  }, [gameState?.ownerDeviceId, activeLives, deviceId, userProfile.pin]);

  const _activeMatchPin = useMemo(() => {
    return isOriginalOwner ? userProfile.pin?.toUpperCase() : gameState?.ownerPin?.toUpperCase();
  }, [isOriginalOwner, userProfile.pin, gameState?.ownerPin]);

  // ─── resolveTargetPin: fonte única de verdade para o PIN do owner ────────────
  // Ordem de prioridade (decrescente de confiabilidade):
  //   1. judgeMatch.ownerPin  — judge sempre sabe para qual owner escrever
  //   2. gameState.ownerPin   — gravado na criação da live, imutável
  //   3. localStorage         — persiste entre recarregamentos, gravado em initGameStateInternal
  //   4. isOriginalOwner + myPin — apenas se confirmado por ownerDeviceId (não só pelo PIN)
  // Nunca retorna undefined silenciosamente — loga e retorna null para que o
  // chamador possa abortar a escrita com segurança.
  const resolveTargetPin = useCallback((context: string): string | null => {
    const myPin = userProfile.pin?.toUpperCase();
    const judgeMatch = activeLives.find(l => l.judgePin?.toUpperCase() === myPin);
    if (judgeMatch?.ownerPin) return judgeMatch.ownerPin.toUpperCase();
    if (gameState?.ownerPin) return gameState.ownerPin.toUpperCase();
    const persisted = getPersistedLiveOwnerPin();
    if (persisted) return persisted;
    // Último recurso: só usa myPin se ownerDeviceId confirma que este device é o owner
    if (isOriginalOwner && myPin) return myPin;
    console.error(`[resolveTargetPin:${context}] Não foi possível determinar o ownerPin — escrita abortada.`);
    return null;
  }, [userProfile.pin, activeLives, gameState?.ownerPin, isOriginalOwner]);

  const isCurrentController = useMemo(() => gameState?.commandOwnerId === deviceId, [gameState?.commandOwnerId, deviceId]);
  // A3: usa role='judge' em vez de comparação por nickname — robusto a nomes duplicados
  // e correto com o sub-objeto judge adicionado no T4.3.
  const isJudgeOnline = useMemo(() => {
    const judgePin = gameState?.judge?.pin || gameState?.judgePin;
    if (!judgePin || !gameState?.controllers) return false;
    const now = Date.now();
    return Object.values(gameState.controllers).some(
      (c: ControllerRecord) => c.role === 'judge' && (now - (c.lastSeen || 0)) < 30000
    );
  }, [gameState?.judge, gameState?.judgePin, gameState?.controllers]);

  const isOwnerOnline = useMemo(() => {
    if (!gameState?.ownerPin || !gameState?.controllers) return false;
    const now = Date.now();
    return Object.values(gameState.controllers).some((c: ControllerRecord) => 
      c.isOwner && (now - c.lastSeen) < 60000
    );
  }, [gameState?.ownerPin, gameState?.controllers]);

  const isCommandOwner = useMemo(() => {
    if (!gameState || !gameState.isMirroringActive) return true;
    return isCurrentController;
  }, [gameState?.isMirroringActive, isCurrentController]);

  // Helper centralizado: "este dispositivo específico é o controller ativo?"
  // Usa deviceId em vez de pin para suportar múltiplos dispositivos do mesmo usuário.
  // Fallback para gameState local: cobre a janela de latência logo após criar a live,
  // quando activeLives ainda não foi atualizado pelo onSnapshot da collection.
  const isActiveController = useMemo(() => {
    if (activeLives.some(l => l.commandOwnerId === deviceId)) return true;
    // Fallback local: live foi criada agora (activeLives ainda vazio ou desatualizado).
    // Exige que ownerDeviceId também seja este device para não confundir com o celular
    // secundário que herdou o gameState da cloud (com ownerDeviceId do Note).
    if (
      gameState?.isMirroringActive &&
      gameState?.commandOwnerId === deviceId &&
      (gameState?.ownerDeviceId === deviceId || !gameState?.ownerDeviceId)
    ) return true;
    return false;
  }, [activeLives, deviceId, gameState?.isMirroringActive, gameState?.commandOwnerId, gameState?.ownerDeviceId]);

  // B1: papel permanente do usuário na live (não muda durante a live)
  // 'owner' = este deviceId é o ownerDeviceId da live
  // 'judge' = o PIN deste usuário é o judgePin da live
  // 'observer' = qualquer outro
  const livePapel = useMemo((): LivePapel => {
    // Fallback local: cobre a janela de latência logo após criar/entrar na live,
    // quando activeLives ainda não foi atualizado pelo onSnapshot da collection.
    // Sem isso, cloudLiveExists=false → 'spectator' → UI mostra "Observador".
    const liveIsActiveLocally = gameState?.isMirroringActive && !gameState?.isLiveClosed;
    const effectivelyHasLive = cloudLiveExists || liveIsActiveLocally;
    if (!effectivelyHasLive) return 'spectator';
    // Owner: baseado em deviceId — nunca por PIN, para não confundir multi-dispositivo
    if (activeLives.some(l => l.ownerDeviceId === deviceId)) return 'owner';
    // Fallback local para owner: live criada agora, activeLives ainda não propagou.
    // Exige que commandOwnerId também seja este device — confirma que foi quem criou a live.
    // Sem essa restrição, o celular (mesmo PIN) poderia ser tratado como owner pelo fallback.
    if (liveIsActiveLocally && gameState?.ownerDeviceId === deviceId && gameState?.commandOwnerId === deviceId) return 'owner';
    // Fallback para lives sem ownerDeviceId (não deve ocorrer em novas lives)
    const myPin = userProfile.pin?.toUpperCase();
    if (myPin && activeLives.some(l => l.ownerPin?.toUpperCase() === myPin && !l.ownerDeviceId)) return 'owner';
    // Judge: sempre por PIN (é como o owner designa o juiz)
    if (myPin && activeLives.some(l => l.judgePin?.toUpperCase() === myPin)) return 'judge';
    return 'observer';
  }, [cloudLiveExists, userProfile.pin, activeLives, deviceId, gameState?.isMirroringActive, gameState?.isLiveClosed, gameState?.ownerDeviceId]);

  // B1: tipo temporário — o que este dispositivo está fazendo agora
  const liveType = useMemo((): LiveType => {
    return isActiveController ? 'controller' : 'watcher';
  }, [isActiveController]);

  // Alias backward-compat — componentes que usam 'role' continuam funcionando
  const liveRole = livePapel;

  const indicatorRole = useMemo(() => {
    if (!isActiveController) return 'observer';
    return livePapel === 'owner' ? 'owner' : 'judge';
  }, [isActiveController, livePapel]);

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

  // ── Indicador de sincronismo FB ────────────────────────────────────────────
  // Aparece no card do time que marcou: verde (controller confirmado) / azul (observer recebeu)
  const [fbSyncStatus, setFbSyncStatus] = useState<{ team: 1 | 2; seq: number; isObserver: boolean } | null>(null);
  const fbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFbScoreKeyRef = useRef<string>(''); // "p1score_p1games_p2score_p2games"
  const hasAutoEnabledScoreboardRef = useRef(false); // evita loop: ativa modo placar 1x por sessão de observer
  const [newAppUrl, setNewAppUrl] = useState("");

  const [activeEvent, setActiveEvent] = useState<TournamentEvent | null>(() => safeJsonParse('myPlacarActiveEvent', null));
  const [userEntryDate, setUserEntryDate] = useState<number | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<EventRegistration[]>(() => safeJsonParse('myPlacarRegisteredEvents', []) as EventRegistration[]);

  const matchHistoryRef = useRef<MatchHistoryItem[]>([]);
  const prevSettingsRef = useRef<MatchSettings | null>(null);
  const prevProfileRef = useRef<UserProfile | null>(null);
  const finalizationTimerRef = useRef<any>(null);
  
  const lastSentStateRef = useRef<string>("");
  // T3.2: registra quando este device assumiu o controle pela última vez.
  // Usado para o grace period do guard duplo no sync de gameState.
  const tookControlAtRef = useRef<number>(0);
  // Registra quando este device PERDEU o controle (via onSnapshot).
  // Usado para evitar que visibilitychange feche a live logo após uma troca de controlador.
  const lostControlAtRef = useRef<number>(0);

  const sanitizeForFirestore = (obj: unknown) => {
    // campos undefined são convertidos para null pelo JSON.stringify abaixo.
    // O deepClean depois remove campos null que NÃO devem sobrescrever dados
    // existentes no Firestore via merge (ex: controllers: undefined -> null
    // apagaria todos os controllers registrados por outros devices).
    const clean = JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
    const fieldsToRemove = ['isWatchMode', 'isScoreboardMode', 'brightness', 'volume', 'deviceLabel', 'selectedVoiceURI', 'voiceEnabled', 'voiceScoring', 'actionCooldown', 'stateLockout', 'screenDimTimeout', 'customSportIcon', 'customSportIcons', 'customCategoryIcons', 'cloudSportIcons', 'cloudCategoryIcons'];
    // nullFieldsToRemove: quando null, remover do payload para nao sobrescrever no Firestore
    const nullFieldsToRemove = ['controllers'];
    const deepClean = (target: Record<string, unknown>) => {
      if (!target || typeof target !== 'object') return;
      fieldsToRemove.forEach(f => { if (target[f] !== undefined) delete target[f]; });
      nullFieldsToRemove.forEach(f => { if (target[f] === null) delete target[f]; });
      Object.keys(target).forEach(key => { if (target[key] && typeof target[key] === 'object') deepClean(target[key] as Record<string, unknown>); });
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
        getActiveEventEntryDate(db as Firestore, activeEvent.pin, userProfile.email)
          .then(setUserEntryDate)
          .catch(() => setUserEntryDate(null));
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
      collection(db as Firestore, 'communications'),
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
    const performExit = () => {
      // Se a flag 'alive' existe, o app foi montado recentemente — é um reload,
      // não uma saída definitiva. Consome a flag e aborta para não fechar a live.
      try {
        if (sessionStorage.getItem('myPlacar_alive')) {
          sessionStorage.removeItem('myPlacar_alive');
          return;
        }
      } catch {}
      // Lê estado atual via refs — evita closure stale e mantém o dep array estável
      // (o effect não é recriado a cada ponto marcado).
      const gs = gameStateRef.current;
      const lives = activeLivesRef.current;
      if (!gs?.isMirroringActive || !userProfile.email || !navigator.onLine) return;
      const db = getDb();
      if (!db) return;
      const myPin = userProfile.pin?.toUpperCase();
      const judgeMatch = lives.find(l => l.judgePin?.toUpperCase() === myPin);

      // Calcula isOwner via refs (não via closure) — evita stale value em devices
      // secundários do mesmo usuário que ainda não receberam o snapshot com ownerDeviceId.
      const gsOwnerDeviceId = gs.ownerDeviceId;
      const isOwnerByDeviceId = !!gsOwnerDeviceId && gsOwnerDeviceId === deviceId;
      const isOwnerByPin = !gsOwnerDeviceId &&
        gs.ownerPin?.toUpperCase() === myPin &&
        !lives.some(l => l.ownerDeviceId && l.ownerDeviceId !== deviceId && l.ownerPin?.toUpperCase() === myPin);
      const isOwnerViaRef = isOwnerByDeviceId || isOwnerByPin;

      // Usa isOwnerViaRef para determinar targetPin — deve vir após o cálculo acima.
      // Fallback extra: localStorage persiste o ownerPin gravado na criação da live,
      // cobrindo o caso em que gs.ownerPin está vazio por closure stale.
      const targetPin = (judgeMatch && judgeMatch.ownerPin)
        ? judgeMatch.ownerPin.toUpperCase()
        : (gs.ownerPin?.toUpperCase() || getPersistedLiveOwnerPin() || (isOwnerViaRef ? myPin : null));
      if (!targetPin) return;

      const isActiveController = gs.commandOwnerId === deviceId;

      // Grace period de 30s após perder o controle.
      const justLostControl = (Date.now() - lostControlAtRef.current) < 30000;
      // Grace period de 15s após assumir o controle.
      const justTookControl = (Date.now() - tookControlAtRef.current) < 15000;

      // Regra: o owner só fecha a live via performExit se ELE é o controller ativo.
      // Se outro device (relógio, juiz) está controlando, o owner saindo da tela
      // apenas remove sua presença — a live continua sob o controle do outro device.
      if (isOwnerViaRef && isActiveController && !justLostControl && !justTookControl) {
        // Owner saiu sendo o controller ativo: verifica se há judge ou outro owner ativo.
        const hasActiveJudge = !!(gs.judgePin && Object.values(gs.controllers || {}).some(
          (c: ControllerRecord) => c.role === 'judge' && (Date.now() - (c.lastSeen || 0)) < 60000
        ));
        const controllersEntries = Object.entries(gs.controllers || {});
        const hasActiveOwnerDevice = controllersEntries.some(([id, c]) =>
          id !== deviceId &&
          (c as ControllerRecord).role === 'owner' &&
          (Date.now() - ((c as ControllerRecord).lastSeen || 0)) < 60000
        );

        if (hasActiveJudge || hasActiveOwnerDevice) {
          // Há outro device ativo — apenas remove a presença deste
          const presenceUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
            [`controllers.${deviceId}`]: deleteField(),
            commandOwnerId: null,
            commandOwner: null
          };
          updateDoc(doc(db, "live_matches", targetPin), presenceUpdate).catch(() => {});
        } else {
          // Owner era o único controlador ativo — fecha a live
          setDoc(doc(db, "live_matches", targetPin), { isLiveClosed: true, isMirroringActive: false }, { merge: true }).catch(() => {});
        }
      } else if (isOwnerViaRef && !isActiveController) {
        // Owner saiu mas NÃO era o controller — apenas remove sua presença.
        // A live continua ativa sob controle do outro device.
        updateDoc(doc(db, "live_matches", targetPin), {
          [`controllers.${deviceId}`]: deleteField()
        }).catch(() => {});
      } else {
        // T4.1: Judge ou observer saiu — remove apenas o registro deste device via field-path.
        // Se era o controller ativo, libera o controle (commandOwnerId = null).
        const presenceUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
          [`controllers.${deviceId}`]: deleteField()
        };
        if (isActiveController) {
          presenceUpdate.commandOwnerId = null;
          presenceUpdate.commandOwner = null;
        }
        updateDoc(doc(db, "live_matches", targetPin), presenceUpdate).catch(() => {});
      }
    };

    // visibilitychange é o sinal mais confiável em mobile (iOS/Android).
    // Usamos um grace period de 2500ms: se o app voltar para 'visible' dentro
    // desse tempo (ex: reload/atualização de PWA), o performExit é cancelado e
    // a live NÃO é fechada prematuramente no Firebase.
    let exitTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        exitTimer = setTimeout(() => {
          if (document.visibilityState === 'hidden') performExit();
        }, 2500);
      } else {
        // Usuário voltou para o app dentro do grace period — cancela o fechamento
        if (exitTimer !== null) {
          clearTimeout(exitTimer);
          exitTimer = null;
        }
      }
    };

    // beforeunload cobre desktop e serve como fallback.
    // Se a flag myPlacar_pwa_updating estiver ativa, é um reload de atualização
    // de PWA — não fechar a live (o app vai reabrir em segundos).
    const handleBeforeUnload = () => {
      try {
        if (sessionStorage.getItem('myPlacar_pwa_updating')) return;
      } catch {}
      performExit();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (exitTimer !== null) clearTimeout(exitTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('beforeunload', handleBeforeUnload);
    };
  // gameState e activeLives removidos do dep array — lidos via ref dentro de performExit,
  // evitando que o handler seja recriado (e o exitTimer cancelado) a cada ponto marcado.
  }, [userProfile.pin, userProfile.email, deviceId, isOriginalOwner]);

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
    } catch {}
  }, [urlParams]);

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

  const fetchUserRegistrations = async (email: string) => {
    const db = getDb();
    if (!db) return;
    try {
      const list = await fetchRegisteredEvents(db as Firestore, email);
      setRegisteredEvents(list);
    } catch (e) {
      console.error("Erro ao buscar inscrições:", e);
    }
  };

  useEffect(() => {
    if (userProfile.email && userProfile.pin) {
      const params = getUrlParams();
      const isResetting = params.get('mode') === 'resetPassword' || params.get('oobCode');
      
      const pendingJoin = localStorage.getItem('myPlacarPendingJoinEvent');
      if (pendingJoin) {
          handleJoinTournament(pendingJoin, true, userProfile);
          localStorage.removeItem('myPlacarPendingJoinEvent');
      } else if (currentScreen === 'auth' && !isResetting) {
          setCurrentScreen('settings');
      }
    }
  }, [userProfile.email, userProfile.pin, currentScreen]);

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

        const deprecatedVersions = snap.data().deprecatedVersions || [];
        const minVersion = snap.data().minVersion || "";
        const serviceMovedTo = snap.data().serviceMovedTo || "";

        const isTooOld = !isNewer(localVersion, "2.3.04") || localVersion === "2.3.04";

        if (isTooOld || deprecatedVersions.includes(LOCAL_CODE_VERSION) || (minVersion && !isNewer(localVersion, minVersion.replace(/^v/, '')) && localVersion !== minVersion.replace(/^v/, ''))) {
          if (serviceMovedTo) {
            setNewAppUrl(serviceMovedTo);
            setIsServiceInterrupted(true);
            return true;
          }
        }

        if (!remoteVersion || remoteVersion === localVersion) return false;

        // Evita reabrir o modal se o usuário já confirmou a atualização nesta sessão
        const alreadyTriggered = sessionStorage.getItem('myPlacarUpdateTriggered');
        if (alreadyTriggered === remoteVersion) return false;
        
        if (isNewer(remoteVersion, localVersion)) {
          setModalConfig({
            title: "Nova versão disponível",
            message: `Uma nova versão (${remoteVersion}) está disponível. Deseja atualizar agora?`,
            confirmLabel: "Sim, atualizar",
            onConfirm: async () => {
              sessionStorage.setItem('myPlacarUpdateTriggered', remoteVersion);
              setModalConfig(null);

              // 1. Desregistra o SW primeiro — garante que o novo install
              //    não seja interceptado por um SW em estado inconsistente
              if ('serviceWorker' in navigator) {
                try {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map(r => r.unregister()));
                } catch {}
              }

              // 2. Limpa TODOS os caches após o SW estar fora
              if ('caches' in window) {
                try {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                } catch {}
              }

              // 3. Hard reload com ?v= para forçar bypass do CDN do Vercel
              // Sinaliza que este unload é uma atualização de PWA — não uma saída
              // real do usuário. O beforeunload vai checar essa flag e NÃO fechar a live.
              try { sessionStorage.setItem('myPlacar_pwa_updating', '1'); } catch {}
              const cleanUrl = globalThis.location.origin + globalThis.location.pathname + '?v=' + remoteVersion;
              globalThis.location.replace(cleanUrl);
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
    // Verificação de atualização NÃO-BLOQUEANTE: espera 3 segundos após o app abrir
    const timer = setTimeout(() => {
      handleCheckUpdate();
    }, 3000);
    return () => clearTimeout(timer);
  }, [handleCheckUpdate]);

  const isAdmin = userProfile.isAdmin === true;

  useEffect(() => {
    const overlay = document.getElementById('brightness-overlay');
    if (overlay) {
      overlay.style.opacity = ((100 - matchSettings.brightness) / 100).toString();
    }
  }, [matchSettings.brightness]);

  // Ref espelho de matchSettings — permite que o callback do onSnapshot leia
  // configó locais atualizadas sem precisar de matchSettings no dep array,
  // evitando o resubscribe do listener a cada mudança de setting.
  const matchSettingsRef = useRef(matchSettings);
  useEffect(() => { matchSettingsRef.current = matchSettings; }, [matchSettings]);

  // T3.1: PIN alvo do listener calculado de forma reativa (depende de activeLives).
  // Quando o judge é adicionado em tempo real, activeLives atualiza e o memo recalcula,
  // fazendo o useEffect do listener ser recriado com o PIN correto — sem closure stale.
  // Usa activeLives (state, não ref) para garantir reatividade.
  const targetListenPin = useMemo(() => {
    const myPin = userProfile.pin?.toUpperCase();
    if (!myPin) return null;

    // Judge: escuta o documento do owner da live em que é juiz
    const judgeInLive = activeLives.find(l => l.judgePin?.toUpperCase() === myPin);
    if (judgeInLive?.ownerPin) return judgeInLive.ownerPin.toUpperCase();

    // Owner: escuta o próprio documento — identificado por ownerDeviceId, não só por PIN.
    // Usar apenas PIN fazia qualquer outro device do mesmo usuário ser tratado como owner,
    // causando reassunção indevida de controle pelo celular secundário.
    const ownerOfLive = activeLives.find(l =>
      l.ownerDeviceId === deviceId ||
      // Fallback para lives antigas sem ownerDeviceId gravado
      (!l.ownerDeviceId && l.ownerPin?.toUpperCase() === myPin)
    );
    if (ownerOfLive) return ownerOfLive.ownerPin?.toUpperCase() || myPin;

    // Observer (inclui device secundário do mesmo usuário): escuta a live mais recente
    if (activeLives.length > 0) {
      const latest = activeLives.reduce((a, b) =>
        (b.liveSessionCounter || 0) > (a.liveSessionCounter || 0) ? b : a
      );
      if (latest.ownerPin) return latest.ownerPin.toUpperCase();
    }

    // Fallback: ownerPin já gravado no gameState local (cobre latência do onSnapshot da collection).
    // Só usa myPin como fallback se este device é realmente o owner — evita que device
    // secundário do mesmo usuário escute no próprio PIN e acione lógica de ownership.
    const localGs = gameStateRef.current;
    if (localGs?.ownerDeviceId === deviceId) return myPin;
    return localGs?.ownerPin?.toUpperCase() || null;
  }, [activeLives, userProfile.pin, deviceId]);

  // ── Listener dedicado para modo placar público (viewMode=scoreboard) ──────────
  // Visitantes sem login não têm userProfile.pin, então targetListenPin seria null.
  // Este useEffect escuta diretamente o PIN da URL e alimenta o gameState.
  useEffect(() => {
    if (currentScreen !== 'public-scoreboard' || !initialSpectatorPin) return;
    const db = getDb();
    if (!db) return;
    const pin = initialSpectatorPin.toUpperCase();
    setIsWaitingSync(true);
    const unsubscribe = onSnapshot(doc(db, 'live_matches', pin), (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data() as GameState;
        if (!isValidGameState(cloudData)) return;
        setCloudLiveExists(!cloudData.isLiveClosed);
        setGameState(prev => ({
          ...(prev || {}),
          ...cloudData,
          isMirroringActive: true,
          isLiveClosed: !!cloudData.isLiveClosed,
          matchConfig: {
            ...(prev?.matchConfig || {}),
            ...cloudData.matchConfig,
            isScoreboardMode: true,
          },
        } as GameState));
        setIsWaitingSync(false);
      } else {
        setCloudLiveExists(false);
        setIsWaitingSync(false);
      }
    });
    return () => unsubscribe();
  }, [currentScreen, initialSpectatorPin]);

  useEffect(() => {
    if (!navigator.onLine || !targetListenPin) return;
    const db = getDb();
    if (!db) return;

    const listenPin = targetListenPin;

    const unsubscribe = onSnapshot(doc(db, "live_matches", listenPin), (snap) => {
      if (snap.exists()) {
        const cloudData = snap.data() as GameState;

        if (!isValidGameState(cloudData)) {
          return;
        }

        if (cloudData.isLiveClosed) {
          // Guard: se este device é o owner ativo da live, ignora isLiveClosed: true
          // vindo do Firebase — é quase certamente um artefato do próprio reload/reconnect.
          // Usa ownerDeviceId (fixo) para identificar o dono, não commandOwnerId.
          const currentGs = gameStateRef.current;
          const thisDeviceIsActiveOwner =
            currentGs?.isMirroringActive &&
            (currentGs?.ownerDeviceId === deviceId ||
              // fallback para lives sem ownerDeviceId
              (currentGs?.commandOwnerId === deviceId &&
                currentGs?.ownerPin?.toUpperCase() === userProfile.pin?.toUpperCase()));

          if (thisDeviceIsActiveOwner) {
            console.log("[Sync] isLiveClosed: true ignorado — owner ativo local, provável artefato de reload.");
            return;
          }

          console.log("[Sync] Live fechada detected!");
          setCloudLiveExists(false);
          setGameState(prev => {
            if (!prev) return null;
            return { ...prev, isMirroringActive: false, isLiveClosed: true, isConfirmedFinished: cloudData.isConfirmedFinished || prev.isConfirmedFinished };
          });

          // E1: notifica observers/juiz sobre encerramento da partida
          const isMatchDone = cloudData.isConfirmedFinished || cloudData.isMatchOver;
          if (isMatchDone) {
            const p1Name = cloudData.p1?.name || 'Jogador 1';
            const p2Name = cloudData.p2?.name || 'Jogador 2';
            const p1SetsWon = (cloudData.p1?.sets || []).filter((s: number, i: number) => s > (cloudData.p2?.sets?.[i] ?? 0)).length;
            const p2SetsWon = (cloudData.p2?.sets || []).filter((s: number, i: number) => s > (cloudData.p1?.sets?.[i] ?? 0)).length;
            const winner = p1SetsWon > p2SetsWon ? p1Name : p2SetsWon > p1SetsWon ? p2Name : null;
            setModalConfig({
              title: 'Partida encerrada 🏆',
              message: winner ? `Vencedor: ${winner}\nA transmissão foi encerrada.` : 'A partida foi encerrada e a transmissão foi finalizada.',
              icon: <Trophy className="text-yellow-500 w-16 h-16" />,
              confirmLabel: 'Ok',
              onConfirm: () => setModalConfig(null)
            });
          }
          return;
        }

        setCloudLiveExists(true);
        if (cloudData.commandOwnerId !== deviceId) {
          // Grace period: se este device acabou de assumir o controle (últimos 15s),
          // ignora snapshots que ainda não refletem o novo commandOwnerId — são writes
          // intermediários chegando fora de ordem (Write 1 chegou, Write 3 ainda não).
          // Sobrescrever o gameState aqui reverteria o handleControlLive.
          const justTookControl = (Date.now() - tookControlAtRef.current) < 15000;
          if (justTookControl) {
            console.log("[Sync] Snapshot com commandOwnerId antigo ignorado — grace period pós-takeControl.");
            return;
          }

          // Reassunção automática: APENAS quando o controller não-owner saiu/perdeu conexão.
          // Regra: troca de controle nunca é automática, exceto neste caso específico.
          // Condições obrigatórias (todas devem ser verdadeiras):
          // 1. commandOwnerId está vazio na cloud (controller liberou o controle)
          // 2. Este device é o ownerDeviceId da live — por deviceId, NUNCA por PIN.
          //    PIN identifica o usuário; qualquer device do mesmo usuário tem o mesmo PIN.
          // 3. A live já estava ativa localmente — descarta o primeiro snapshot de live
          //    recém-criada onde commandOwnerId ainda não propagou para todos os devices.
          const controllerLeft = !cloudData.commandOwnerId;
          const currentGs = gameStateRef.current;
          const thisDeviceIsOwner = cloudData.ownerDeviceId === deviceId;
          const liveAlreadyActive = currentGs?.isMirroringActive === true;
          if (controllerLeft && thisDeviceIsOwner && liveAlreadyActive) {
            console.log("[Sync] commandOwnerId liberado pelo controller — ownerDevice reassumindo controle.");
            tookControlAtRef.current = Date.now();
            const db2 = getDb();
            if (db2) {
              updateDoc(doc(db2, "live_matches", listenPin), {
                commandOwnerId: deviceId,
                commandOwner: matchSettingsRef.current.deviceLabel
                  ? `${matchSettingsRef.current.deviceLabel} - ${userProfile.nickname || userProfile.name?.split(" ")[0] || "Dono"}`
                  : (userProfile.nickname || userProfile.name?.split(" ")[0] || "Dono"),
                [`controllers.${deviceId}`]: {
                  label: currentGs?.controllers?.[deviceId]?.label || deviceId,
                  lastSeen: Date.now(),
                  isOwner: true,
                  role: 'owner',
                  deviceType: getDeviceType()
                }
              }).catch(() => {});
            }
            setGameState(prev => {
              if (!prev) return prev;
              return { ...prev, commandOwnerId: deviceId, isMirroringActive: true, isLiveClosed: false };
            });
            return;
          }

          // Se este device era o controlador antes e agora não é mais:
          // marca o momento e notifica com um toast simples (sem modal bloqueante).
          if (currentGs?.commandOwnerId === deviceId) {
            lostControlAtRef.current = Date.now();
            const newControllerLabel = cloudData.commandOwner || 'outro dispositivo';
            // Notificação leve auto-dismiss (2s) — sem botão de confirmação
            setModalConfig({ title: "Controle transferido", message: `${newControllerLabel} assumiu o controle da partida.`, variant: 'info', onConfirm: () => setModalConfig(null) });
            setTimeout(() => setModalConfig(null), 2000);
          }
          // Lê matchSettings via ref para não forçar resubscribe do listener
          const localSettings = matchSettingsRef.current;

          // FB badge — observer: detecta qual time marcou ao receber snapshot
          const prevGs = gameStateRef.current;
          if (prevGs && !prevGs.isLiveClosed) {
            const p1Scored = cloudData.p1.games > prevGs.p1.games || (cloudData.p1.games === prevGs.p1.games && cloudData.p1.score !== prevGs.p1.score);
            const p2Scored = cloudData.p2.games > prevGs.p2.games || (cloudData.p2.games === prevGs.p2.games && cloudData.p2.score !== prevGs.p2.score);
            // seq = índice do último ponto no pointHistory (igual ao número visível no Firestore)
            const pointSeq = cloudData.pointHistory?.length ?? 0;
            if (p1Scored && !p2Scored) setFbSyncStatus({ team: 1, seq: pointSeq, isObserver: true });
            else if (p2Scored && !p1Scored) setFbSyncStatus({ team: 2, seq: pointSeq, isObserver: true });
          }

          setGameState(prev => {
            const baseConfig = prev?.matchConfig || localSettings;
            // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId NUNCA podem ser
            // sobrescritos por dados vindos da nuvem. O proprietário é fixado
            // no momento em que a live é criada (initGameStateInternal) e jamais
            // muda durante toda a sessão da live — independentemente do que o
            // Firestore enviar nos snapshots subsequentes.
            const lockedOwnerPin = prev?.ownerPin || cloudData.ownerPin;
            const lockedOwnerDeviceId = prev?.ownerDeviceId || cloudData.ownerDeviceId;
            return {
              ...cloudData,
              // Restaura os campos de proprietário travados após o spread do cloudData
              ownerPin: lockedOwnerPin,
              ownerDeviceId: lockedOwnerDeviceId,
              isMirroringActive: true,
              isLiveClosed: false,
              isConfirmedFinished: cloudData.isConfirmedFinished,
              matchConfig: {
                ...cloudData.matchConfig,
                isWatchMode: baseConfig.isWatchMode,
                isScoreboardMode: baseConfig.isScoreboardMode,
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
          // T4.2: Descarta write stale — versão cloud menor que a local indica ex-controller
          // ainda escrevendo após perder o controle (race condition entre dois controllers).
          const cloudVersion = cloudData.liveVersion || 0;
          const localVersion = gameStateRef.current?.liveVersion || 0;
          if (cloudVersion > 0 && localVersion > 0 && cloudVersion < localVersion) {
            console.log(`[Sync] Write stale ignorado — versão cloud: ${cloudVersion}, local: ${localVersion}`);
            return;
          }
          setGameState(prev => {
            if (!prev) return null;
            return {
              ...prev,
              controllers: cloudData.controllers,
              judgePin: cloudData.judgePin,
              judgeNickname: cloudData.judgeNickname,
              // T4.3: sincroniza sub-objeto judge se presente na cloud
              ...(cloudData.judge ? { judge: cloudData.judge } : {})
            };
          });
        }
      } else {
        // E1: snap não existe = live foi deletada após encerramento.
        // Notifica observers que ainda estão conectados (não receberam o isLiveClosed).
        const prevGs = gameStateRef.current;
        if (prevGs?.isMirroringActive && !prevGs?.isLiveClosed) {
          setModalConfig({
            title: 'Live encerrada',
            message: 'A transmissão foi encerrada pelo proprietário.',
            icon: <WifiOff className="text-slate-400 w-16 h-16" />,
            confirmLabel: 'Ok',
            onConfirm: () => setModalConfig(null)
          });
        }
        setCloudLiveExists(false);
        setGameState(prev => {
          if (!prev) return null;
          if (prev.isMirroringActive) {
            return { ...prev, isMirroringActive: false, isLiveClosed: true };
          }
          return prev;
        });
      }
    });
    return () => unsubscribe();
  // targetListenPin é reativo (useMemo sobre activeLives) — quando o PIN alvo muda
  // (ex: judge adicionado, live nova detectada), o listener é recriado automaticamente.
  // deviceId permanece para garantir que o guard de ownership funcione corretamente.
  }, [targetListenPin, deviceId]);

  const prevIsCommandOwner = useRef(isCommandOwner);
  const prevCommandOwnerIdWasSelf = useRef(gameState?.commandOwnerId === deviceId);
  useEffect(() => {
    // Só dispara se este device REALMENTE tinha o commandOwnerId antes —
    // isCommandOwner é true também quando !isMirroringActive, o que causava
    // falso positivo quando o celular recebia a live pela primeira vez.
    const hadControl = prevCommandOwnerIdWasSelf.current;
    const hasControl = gameState?.commandOwnerId === deviceId;
    if (hadControl && !hasControl && gameState?.isMirroringActive && !gameState.isLiveClosed) {
      // Fecha o overlay IMEDIATAMENTE antes de mostrar a notificação
      setShowLiveControlOverlay(false);
      // Após fechar o overlay, exibe apenas a notificação com botão "Ok"
      setTimeout(() => {
        setModalConfig({
          title: "Controle alterado",
          message: "Outro dispositivo assumiu o controle da transmissão. Você agora está no modo de observador.",
          confirmLabel: "Ok",
          onConfirm: () => setModalConfig(null)
        });
      }, 100);
    }
    prevIsCommandOwner.current = isCommandOwner;
    prevCommandOwnerIdWasSelf.current = hasControl;
  }, [isCommandOwner, gameState?.commandOwnerId, gameState?.isMirroringActive, gameState?.isLiveClosed]);

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
      localStorage.setItem('myPlacar_LocalScreenDimTimeout', (matchSettings.screenDimTimeout || 10).toString());
    } catch {}

    if (gameState && !gameState.isConfirmedFinished) {
        setGameState(prevG => {
            if (!prevG) return prevG;
            return {
                ...prevG,
                p1: { ...prevG.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, color: matchSettings.p1Color },
                p2: { ...prevG.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, color: matchSettings.p2Color },
                matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode }
            };
        });
    }
    prevSettingsRef.current = { ...matchSettings };
    try { localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings)); } catch {}
  }, [matchSettings, gameState?.matchId]);

  useEffect(() => {
    if (!prevProfileRef.current) { prevProfileRef.current = { ...userProfile }; return; }
    const prev = prevProfileRef.current;
    if (prev.name !== userProfile.name || prev.nickname !== userProfile.nickname || prev.gender !== userProfile.gender || prev.authMethod !== userProfile.authMethod) {
      setIsProfileSaved(false);
    }
    if (prev.authMethod === 'pin' && userProfile.authMethod === 'password') {
      handleSaveProfile();
    }
    prevProfileRef.current = { ...userProfile };
  }, [userProfile]);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    
    const subscribeToLives = () => {
      if (!navigator.onLine) {
        setActiveLives([]);
        return () => {};
      }
      const q = query(collection(db, "live_matches"), where("isLiveClosed", "==", false));
      return onSnapshot(q, (snap) => {
        const lives: GameState[] = [];
        snap.forEach(d => lives.push(d.data() as GameState));
        setActiveLives(lives);
      }, (error) => {
        console.error("Live listener error:", error);
      });
    };
    
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToLives();
    } catch (e) {
      console.error("Failed to subscribe to lives:", e);
    }
    
    const handleOnline = () => {
      unsubscribe();
      unsubscribe = subscribeToLives();
    };
    
    window.addEventListener('online', handleOnline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Throttle do registro automático de observer: evita writes excessivos no Firestore
  const lastObserverRegisterRef = useRef<number>(0);

  useEffect(() => {
    const hasAnyLive = activeLives.length > 0;
    setCloudLiveExists(hasAnyLive);

    // Proteção contra latência do Firebase: quando activeLives fica vazio
    // momentaneamente (ex: reload do app, reconexão), aguardamos 3s antes
    // de concluir que não há mais live e desativar o mirroring local.
    // Se activeLives voltar a ter entradas dentro desse tempo, o timer é cancelado.
    // Guard extra: se este device acabou de assumir o controle (grace period de 15s),
    // não desativa — o Firebase ainda pode estar propagando o novo commandOwnerId.
    const justTookControlRecently = (Date.now() - tookControlAtRef.current) < 15000;
    if (!hasAnyLive && gameState?.isMirroringActive && !justTookControlRecently) {
      const debounceTimer = setTimeout(() => {
        // Re-verifica o grace period dentro do timeout — pode ter assumido controle nesse intervalo
        if ((Date.now() - tookControlAtRef.current) < 15000) return;
        setGameState(prev => {
          if (!prev || !prev.isMirroringActive) return prev;
          return { ...prev, isMirroringActive: false };
        });
      }, 3000);
      return () => clearTimeout(debounceTimer);
    }
  }, [activeLives]);

  useEffect(() => {
    if (!userProfile.pin) return;
    const thisDeviceIsController = activeLives.some(l => l.commandOwnerId === deviceId);
    const hasLive = activeLives.length > 0;

    // Fix: owner nunca se registra como observer nos próprios controllers
    const thisDeviceIsOwner = activeLives.some(l => l.ownerDeviceId === deviceId);
    if (thisDeviceIsOwner) return;

    // Fix: device secundário do mesmo usuário (mesmo PIN, deviceId diferente) não
    // polui controllers com uma entrada de 'phone' extra — ele só observa silenciosamente.
    const myPin = userProfile.pin?.toUpperCase();
    const isSameUserSecondaryDevice = activeLives.some(l =>
      l.ownerPin?.toUpperCase() === myPin &&
      l.ownerDeviceId &&
      l.ownerDeviceId !== deviceId
    );
    if (isSameUserSecondaryDevice) return;

    // Registro automático como observador/juiz: quando há live E este dispositivo NÃO é o controller
    if (!thisDeviceIsController && hasLive && navigator.onLine && userProfile.email) {
      const now = Date.now();
      // Throttle: só registra/atualiza a cada 60s para não gerar writes excessivos
      if (now - lastObserverRegisterRef.current < 60000) return;
      const db = getDb();
      if (db) {
        const observerLive = activeLives.reduce((latest, l) =>
          (l.liveSessionCounter || 0) > (latest.liveSessionCounter || 0) ? l : latest
        );
        const ownerPin = observerLive.ownerPin?.toUpperCase();
        if (ownerPin) {
          const myPin = userProfile.pin?.toUpperCase();
          const myNickname = userProfile.nickname || userProfile.name?.split(' ')[0] || 'Observador';
          const isJudgeDevice = activeLives.some(l => l.judgePin?.toUpperCase() === myPin);
          const deviceRole: 'judge' | 'observer' = isJudgeDevice ? 'judge' : 'observer';
          lastObserverRegisterRef.current = now;
          // T4.1: field-path direto — sem getDoc, sem reescrita do objeto inteiro
          updateDoc(doc(db, "live_matches", ownerPin), {
            [`controllers.${deviceId}`]: {
              label: currentFullDeviceName,
              nickname: myNickname,
              lastSeen: now,
              role: deviceRole,
              deviceType: getDeviceType()
            }
          }).catch(() => {});
        }
      }
    }
  }, [activeLives, userProfile.pin, userProfile.email, userProfile.nickname, userProfile.name, gameState?.isMirroringActive, deviceId, currentFullDeviceName]);

  // Detecta live disponível e exibe overlay automaticamente para dispositivos não-controller
  const overlayShownForLiveRef = useRef<string | null>(null);
  // Ref separado: marca liveId que o usuário já aceitou (observer ou controller).
  // Não é resetado ao trocar de tela — só quando a live realmente encerra.
  // Isso impede que o modal reabra após setCurrentScreen('scoreboard') no aceite.
  const overlayAcceptedRef = useRef<string | null>(null);
  // Ref para handleObserveLive — permite chamá-lo dentro de useEffect
  // que é declarado antes da função (evita "used before declaration").
  const autoJoinObserverRef = useRef<((pin: string) => void) | null>(null);

  useEffect(() => {
    if (!userProfile.pin || !userProfile.email) return;
    const myPin = userProfile.pin.toUpperCase();

    // Guard 1: este device já é controller (cloud ou local)?
    const thisDeviceIsControllerInCloud = activeLives.some(l => l.commandOwnerId === deviceId);
    const thisDeviceIsControllerLocal = gameState?.commandOwnerId === deviceId;
    const thisDeviceIsController = thisDeviceIsControllerInCloud || thisDeviceIsControllerLocal;
    if (thisDeviceIsController) return;

    // Grace period pós-takeControl
    const justTookControl = (Date.now() - tookControlAtRef.current) < 15000;
    if (justTookControl) return;

    if (activeLives.length > 0) {
      const observerLive = activeLives.reduce((latest, l) =>
        (l.liveSessionCounter || 0) > (latest.liveSessionCounter || 0) ? l : latest
      );
      const liveId = observerLive.ownerPin?.toUpperCase() || '';

      // Guard: já entrou nesta live como observer ou controller
      if (liveId && overlayAcceptedRef.current === liveId) return;
      if (liveId && overlayShownForLiveRef.current === liveId) return;
      overlayShownForLiveRef.current = liveId;

      // Guard: se este device é o owner da live, nunca entra como observer.
      // Usa ownerDeviceId quando disponível. Quando ownerDeviceId ainda não propagou
      // (latência do Firestore logo após criar a live), só trata como owner se este
      // device também é o commandOwnerId — confirmação que foi ele quem criou.
      const thisDeviceIsOwner = observerLive.ownerDeviceId === deviceId ||
        (!observerLive.ownerDeviceId &&
          observerLive.ownerPin?.toUpperCase() === myPin &&
          observerLive.commandOwnerId === deviceId);
      if (thisDeviceIsOwner) return;

      // Determina se este device deve entrar automaticamente como observador:
      // 1. Device secundário do mesmo usuário (mesmo ownerPin, ownerDeviceId diferente OU
      //    ownerDeviceId não propagado ainda mas commandOwnerId é de outro device)
      // 2. Judge nomeado pelo owner
      // Nesses casos: entra direto no scoreboard como observer, SEM modal.
      // O modal só aparece se o usuário clicar voluntariamente (LiveIndicator, menu, etc).
      const isSameUserOtherDevice =
        observerLive.ownerPin?.toUpperCase() === myPin &&
        (
          // ownerDeviceId já propagou: confirma que é outro device
          (observerLive.ownerDeviceId && observerLive.ownerDeviceId !== deviceId) ||
          // ownerDeviceId ainda não propagou: usa commandOwnerId como proxy
          (!observerLive.ownerDeviceId && observerLive.commandOwnerId && observerLive.commandOwnerId !== deviceId)
        );

      const isNamedJudge = observerLive.judgePin?.toUpperCase() === myPin;

      if (isSameUserOtherDevice || isNamedJudge) {
        // Entra automaticamente como observador — sem modal.
        // Aguarda 2s para que o documento recém-criado pelo Note estabilize no Firestore
        // antes de o celular fazer getDoc e gravar sua presença. Sem esse delay, o getDoc
        // pode retornar o doc com commandOwnerId ainda não propagado, causando a race que
        // faz o celular sobrescrever commandOwnerId como null e o Note virar observer.
        overlayAcceptedRef.current = liveId;
        setTimeout(() => autoJoinObserverRef.current?.(liveId), isSameUserOtherDevice ? 2000 : 0);
        return;
      }

      // Outros devices (observers externos): mostra o overlay normalmente
      setShowLiveControlOverlay(true);
    }

    if (activeLives.length === 0) {
      overlayShownForLiveRef.current = null;
      overlayAcceptedRef.current = null;
    }
  }, [activeLives, userProfile.pin, userProfile.email, deviceId, gameState?.commandOwnerId, currentScreen]);

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
      const now = Date.now();
      const myDeviceType = getDeviceType();

      // ── Judge heartbeat ──────────────────────────────────────────────────────
      // T4.1: usa field-path direto (sem getDoc) — zero leituras extras a cada 30s
      const judgeMatches = activeLives.filter(l => l.judgePin?.toUpperCase() === myPin);
      for (const match of judgeMatches) {
        if (match.ownerPin) {
          const docRef = doc(db, "live_matches", match.ownerPin.toUpperCase());
          // Judge heartbeat: mantém role:'judge' nos controllers.
          // O role reflete quem o usuário É (juiz designado), não o que faz agora.
          // O commandOwnerId já indica quem está controlando ativamente.
          const judgeIsActive = match.commandOwnerId === deviceId;
          try {
            await updateDoc(docRef, {
              [`controllers.${deviceId}`]: {
                label: currentFullDeviceName,
                nickname: myNickname,
                lastSeen: now,
                role: 'judge',
                deviceType: myDeviceType
              },
              // T4.3: mantém judge.isActive sincronizado
              'judge.isActive': judgeIsActive
            });
          } catch {}
        }
      }

      // ── Owner heartbeat (quando NÃO é o controller ativo) ──────────────────
      const ownerMatch = activeLives.find(l => l.ownerPin?.toUpperCase() === myPin);
      const isOwnerControlling = ownerMatch?.commandOwnerId === deviceId;
      if (ownerMatch && !isOwnerControlling) {
        const docRef = doc(db, "live_matches", myPin);
        try {
          await updateDoc(docRef, {
            [`controllers.${deviceId}`]: {
              label: currentFullDeviceName,
              nickname: myNickname,
              lastSeen: now,
              isOwner: true,
              role: 'owner',
              deviceType: myDeviceType
            }
          });
        } catch {}
      }

      // ── Observer heartbeat ───────────────────────────────────────────────────
      // Devices secundários do mesmo usuário ou observers externos que estão no
      // scoreboard como observadores precisam renovar o lastSeen a cada 30s —
      // sem isso, o log do proprietário os remove após 60s (TTL do lastSeen).
      const isObserving =
        gameStateRef.current?.isMirroringActive &&
        !gameStateRef.current?.isLiveClosed &&
        gameStateRef.current?.commandOwnerId !== deviceId; // não é controller ativo

      if (isObserving) {
        const observerLivePin = gameStateRef.current?.ownerPin?.toUpperCase();
        // Não re-envia heartbeat se já foi coberto pelo judge ou owner heartbeat acima
        const alreadyCovered =
          judgeMatches.some(m => m.ownerPin?.toUpperCase() === observerLivePin) ||
          (ownerMatch && ownerMatch.ownerPin?.toUpperCase() === observerLivePin);

        if (observerLivePin && !alreadyCovered) {
          const docRef = doc(db, "live_matches", observerLivePin);
          const existingRole = gameStateRef.current?.controllers?.[deviceId]?.role;
          // Preserva role existente (owner/judge não devem virar observer no heartbeat)
          const heartbeatRole = (existingRole === 'owner' || existingRole === 'judge')
            ? existingRole
            : 'observer';
          try {
            await updateDoc(docRef, {
              [`controllers.${deviceId}`]: {
                label: currentFullDeviceName,
                nickname: myNickname,
                lastSeen: now,
                role: heartbeatRole,
                deviceType: myDeviceType
              }
            });
          } catch {}
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [activeLives, userProfile.pin, userProfile.name, userProfile.nickname, deviceId, currentFullDeviceName]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
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
      try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(gameState)); } catch {}
      
      if (gameState.isMirroringActive && userProfile.email && !gameState.isLiveClosed && navigator.onLine) {
        const db = getDb();
        if (db) {
            // ── Determina papel deste device ────────────────────────────────
            const isThisDeviceController = gameState.commandOwnerId === deviceId;

            // Guard duplo (escrita de estado de partida — apenas o controller):
            // Só escreve placar/histórico se AMBOS local e Firebase confirmam este
            // device como controller, ou se acabou de assumir (grace period).
            const isConfirmedControllerInCloud = activeLives.some(l => l.commandOwnerId === deviceId);
            const isConfirmedControllerLocal = isThisDeviceController;
            const justTookControl = (Date.now() - tookControlAtRef.current) < 15000;
            const controllerGuardOk = isConfirmedControllerInCloud || isConfirmedControllerLocal || justTookControl;

            // Owner sempre pode escrever mudanças de configuração/regras,
            // independentemente de ser ou não o controller atual.
            const now = Date.now();
            const prevStateStr = lastSentStateRef.current;
            const prevState = prevStateStr ? JSON.parse(prevStateStr) : null;

            const isMatchStateChange = !prevState ||
              prevState.p1.score !== gameState.p1.score ||
              prevState.p2.score !== gameState.p2.score ||
              prevState.p1.games !== gameState.p1.games ||
              prevState.p2.games !== gameState.p2.games ||
              prevState.p1.sets.join(',') !== gameState.p1.sets.join(',') ||
              prevState.p2.sets.join(',') !== gameState.p2.sets.join(',') ||
              prevState.isPaused !== gameState.isPaused ||
              prevState.isMatchOver !== gameState.isMatchOver ||
              prevState.server !== gameState.server;

            const isConfigChange = !prevState ||
              prevState.p1.name !== gameState.p1.name ||
              prevState.p2.name !== gameState.p2.name ||
              prevState.p1.color !== gameState.p1.color ||
              prevState.p2.color !== gameState.p2.color ||
              prevState.matchConfig?.sportType !== gameState.matchConfig?.sportType ||
              prevState.matchConfig?.sets !== gameState.matchConfig?.sets ||
              prevState.matchConfig?.gamesPerSet !== gameState.matchConfig?.gamesPerSet ||
              prevState.matchConfig?.noAd !== gameState.matchConfig?.noAd ||
              prevState.matchConfig?.tieBreak !== gameState.matchConfig?.tieBreak ||
              prevState.matchConfig?.tieBreakAt !== gameState.matchConfig?.tieBreakAt ||
              prevState.matchConfig?.tieBreakPoints !== gameState.matchConfig?.tieBreakPoints ||
              prevState.matchConfig?.tieBreakWinByTwo !== gameState.matchConfig?.tieBreakWinByTwo ||
              prevState.matchConfig?.switchSidesOdd !== gameState.matchConfig?.switchSidesOdd ||
              prevState.matchConfig?.tieBreakSideSwitchMode !== gameState.matchConfig?.tieBreakSideSwitchMode ||
              prevState.matchConfig?.pickleballScoringMode !== gameState.matchConfig?.pickleballScoringMode ||
              prevState.matchConfig?.pickleballServiceMode !== gameState.matchConfig?.pickleballServiceMode ||
              prevState.matchConfig?.winnersStay !== gameState.matchConfig?.winnersStay ||
              prevState.matchConfig?.isDoubles !== gameState.matchConfig?.isDoubles;

            // Owner OU controller ativo podem escrever mudanças de config (tela inicial e regras).
            // isOwnerByDeviceId: verificação direta via ownerDeviceId, sem depender da latência
            // do activeLives (que pode demorar segundos para confirmar isOriginalOwner).
            const isOwnerByDeviceId = gameState.ownerDeviceId === deviceId;
            const canWriteConfig = isOriginalOwner || isOwnerByDeviceId || controllerGuardOk;

            // Controller escreve mudanças de partida; owner ou controller ativo escrevem config.
            if (isMatchStateChange && !controllerGuardOk) return;
            if (!isMatchStateChange && isConfigChange && !canWriteConfig) return;
            if (!isMatchStateChange && !isConfigChange && !isThisDeviceController) return;

            const isCriticalChange = isMatchStateChange || isConfigChange;
            const timeSinceLastSync = now - lastSyncTimeRef.current;
            const shouldSync = isCriticalChange || timeSinceLastSync > 10000;

            if (shouldSync) {
              // T4.1: controllers são escritos SEPARADAMENTE do gameState via field-path.
              // Isso reduz o payload do write de placar em ~40% e elimina a race condition
              // onde dois controllers sobrescrevem o objeto controllers inteiro ao mesmo tempo.
              const controllerRole: 'owner' | 'judge' = isOriginalOwner ? 'owner' : 'judge';
              const myDeviceType = getDeviceType();
              const shouldUpdateLastSeen = now - lastSeenUpdateRef.current > 30000;

              // T4.2: stateToSave não inclui controllers (gerenciados separadamente).
              // liveVersion é incrementado a cada write do controller ativo —
              // permite detectar e descartar writes stale no onSnapshot.
              // TRAVA DE PROPRIETÁRIO: ownerPin e ownerDeviceId são campos imutáveis
              // da live — fixados na criação e nunca alterados por nenhum write posterior,
              // seja do owner, do judge ou de qualquer outro controller. Isso garante que
              // o proprietário da live é sempre quem a criou, sem possibilidade de mutação.
              const stateToSave = sanitizeForFirestore({
                ...gameState,
                controllers: undefined,  // T4.1: presença gerenciada via field-path
                liveVersion: (gameState.liveVersion || 0) + 1,  // T4.2: versionamento
                // Imutáveis: preserva os valores originais independente do estado corrente
                ownerPin: gameState.ownerPin,
                ownerDeviceId: gameState.ownerDeviceId,
              });

              if (stateToSave) {
                const strState = JSON.stringify(stateToSave);
                if (strState !== lastSentStateRef.current) {
                  lastSentStateRef.current = strState;
                  lastSyncTimeRef.current = now;
                  const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
                  if (targetPin) {
                    // T4.1 — Write 1: placar + estado da partida (sem controllers)
                    // D1: lastActivityAt habilita TTL de 3h pelo Cloud Function scheduler
                    setDoc(doc(db, "live_matches", targetPin), { ...stateToSave, lastActivityAt: Date.now() }, { merge: true }).catch(() => {});

                    // FB badge — detecta qual time marcou para exibir indicador verde no controller
                    const curScoreKey = `${gameState.p1.score}_${gameState.p1.games}_${gameState.p2.score}_${gameState.p2.games}`;
                    if (isMatchStateChange && lastFbScoreKeyRef.current && lastFbScoreKeyRef.current !== curScoreKey) {
                      const parts = lastFbScoreKeyRef.current.split('_');
                      const prevP1Games = parseInt(parts[1]);
                      const prevP2Games = parseInt(parts[3]);
                      const p1Scored = gameState.p1.games > prevP1Games || (gameState.p1.games === prevP1Games && gameState.p1.score !== parts[0]);
                      const p2Scored = gameState.p2.games > prevP2Games || (gameState.p2.games === prevP2Games && gameState.p2.score !== parts[2]);
                      // seq = índice do último ponto no pointHistory (igual ao número visível no Firestore)
                      const pointSeq = gameState.pointHistory?.length ?? 0;
                      if (p1Scored && !p2Scored) setFbSyncStatus({ team: 1, seq: pointSeq, isObserver: false });
                      else if (p2Scored && !p1Scored) setFbSyncStatus({ team: 2, seq: pointSeq, isObserver: false });
                    }
                    lastFbScoreKeyRef.current = curScoreKey;

                    // T4.1 — Write 2 (presença): atualiza só o registro deste device via field-path.
                    // Não sobrescreve os registros de outros devices — elimina race condition.
                    if (shouldUpdateLastSeen) {
                      const presenceRecord = {
                        label: currentFullDeviceName,
                        lastSeen: now,
                        isOwner: isOriginalOwner,
                        role: controllerRole,
                        deviceType: myDeviceType
                      };
                      updateDoc(doc(db, "live_matches", targetPin), {
                        [`controllers.${deviceId}`]: presenceRecord,
                        lastActivityAt: Date.now()  // D1: atualiza TTL a cada heartbeat
                      }).catch(() => {});
                      lastSeenUpdateRef.current = now;
                    }
                  }
                }
              }
            }
        }
      }
    }
  }, [gameState, userProfile.pin, userProfile.email, currentFullDeviceName, deviceId]);

  // ── Auto-clear do fbSyncStatus após 2.5s ──────────────────────────────────
  useEffect(() => {
    if (!fbSyncStatus) return;
    if (fbSyncTimerRef.current) clearTimeout(fbSyncTimerRef.current);
    fbSyncTimerRef.current = setTimeout(() => setFbSyncStatus(null), 2500);
    return () => { if (fbSyncTimerRef.current) clearTimeout(fbSyncTimerRef.current); };
  }, [fbSyncStatus]);

  // ── Observer: ativa modo placar automaticamente ao entrar na live ────────────
  // Guard: só ativa se cloudLiveExists confirmou a live E este device não é ownerDeviceId.
  // Sem essa guarda, a latência do Firestore faz livePapel ser 'observer' por um instante
  // logo após o owner abrir a live, ativando isScoreboardMode indevidamente.
  useEffect(() => {
    const thisDeviceIsOwnerOfAnyLive = activeLives.some(l => l.ownerDeviceId === deviceId);
    if (livePapel === 'observer' && cloudLiveExists && !thisDeviceIsOwnerOfAnyLive && !hasAutoEnabledScoreboardRef.current) {
      hasAutoEnabledScoreboardRef.current = true;
      setMatchSettings(prev => ({ ...prev, isScoreboardMode: true }));
      setGameState(prev => {
        if (!prev) return prev;
        return { ...prev, matchConfig: { ...prev.matchConfig, isScoreboardMode: true } };
      });
    }
    if (livePapel !== 'observer') hasAutoEnabledScoreboardRef.current = false;
  }, [livePapel, cloudLiveExists, activeLives, deviceId]);

  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  // Ref espelho do historyStack — garante que callbacks com closure stale
  // (como onUndo passado como prop) sempre leiam o valor mais recente.
  const historyStackRef = useRef<GameState[]>([]);
  useEffect(() => { historyStackRef.current = historyStack; }, [historyStack]);

  // Sempre inicializa gameState e historyStack juntos para garantir que
  // o undo consiga voltar até o estado zero a zero.
  const startGame = useCallback((state: GameState) => {
    setGameState(state);
    setHistoryStack([state]);
    historyStackRef.current = [state];
    setLiveLogs([]); // Zera logs ao iniciar nova partida
    setVoiceLogs([]); // Zera voice logs ao iniciar nova partida
    try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(state)); } catch {}
  }, []);
  const startGameRef = useRef(startGame);
  useEffect(() => { startGameRef.current = startGame; }, [startGame]);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>(() => {
    const list = safeJsonParse('myPlacarHistory', []);
    matchHistoryRef.current = list;
    return list;
  });
  
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [adminTab, setAdminTab] = useState<AdminTab>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);

  const persistHistory = useCallback((newList: MatchHistoryItem[]) => {
    const limitedList = persistLocalHistory(newList);
    matchHistoryRef.current = limitedList; // sincroniza ref com o que está realmente persistido
    setMatchHistory(limitedList);
  }, []);

  const handleClearAllHistory = async () => {
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (navigator.onLine && cleanEmail) {
      setIsSyncing(true);
      const db = getDb();
      try {
        await clearCloudHistory({ db, ownerEmail: cleanEmail });
        persistHistory([]);
        setCloudMatchesCount(0);
        setModalConfig({ title: "Sucesso", message: "Todo o histórico foi removido com sucesso.", onConfirm: () => setModalConfig(null) });
      } catch (_e) { persistHistory([]); } finally { setIsSyncing(false); }
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
      setModalConfig({ title: "Backup restaurado", message: "O aplicativo será reiniciado.", onConfirm: () => globalThis.location.reload() });
    } catch (_e) { setModalConfig({ title: "Erro", message: "Falha ao processar arquivo.", onConfirm: () => setModalConfig(null) }); }
  };

  const fetchCloudMatchesCount = useCallback(async (_isSilent = false, excludeIds: Set<string> = new Set()) => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    try {
      setCloudMatchesCount(await fetchCloudHistoryCount({
        db,
        ownerEmail: cleanEmail,
        history: matchHistoryRef.current,
        excludeIds,
      }));
    } catch {}
  }, [userProfile.email]);

  useEffect(() => { if (userProfile.email) fetchCloudMatchesCount(true); }, [userProfile.email, matchHistory.length, fetchCloudMatchesCount]);

  const syncHistoryToFirebase = useCallback(async (forcedHistory?: MatchHistoryItem[], forceAll = false) => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    const currentList = forcedHistory || [...matchHistoryRef.current];
    if ((forceAll ? currentList : getUnsyncedHistory(currentList)).length === 0) { fetchCloudMatchesCount(true); return; }
    setIsSyncing(true);
    const safetyTimeout = setTimeout(() => setIsSyncing(false), 15000);
    try {
      const { updatedHistory, syncedCount } = await syncHistoryBatch({
        db,
        history: currentList,
        ownerEmail: cleanEmail,
        ownerPin: userProfile.pin || '',
        forceAll,
        serializeMatch: (match) => {
          const sanitized = sanitizeForFirestore(match);
          if (!sanitized) return null;
          return sanitized;
        },
        syncedAt: serverTimestamp(),
      });
      if (syncedCount === 0) { fetchCloudMatchesCount(true); return; }
      persistHistory(updatedHistory);
      await fetchCloudMatchesCount(true);
    } catch {} finally { 
      clearTimeout(safetyTimeout);
      setIsSyncing(false); 
    }
  }, [userProfile.email, userProfile.pin, fetchCloudMatchesCount, persistHistory]);

  useEffect(() => {
    const unsyncedCount = getUnsyncedHistory(matchHistory).length;
    if (unsyncedCount > 0 && userProfile.email && !isSyncing) syncHistoryToFirebase();
  }, [matchHistory.length, userProfile.email, isSyncing, syncHistoryToFirebase]);

  useOnlineSync({
    onOnline: () => {
      const unsynced = getUnsyncedHistory(matchHistoryRef.current);
      if (unsynced.length > 0) syncHistoryToFirebase();
    },
    onOffline: () => setIsOfflineMode(true),
  });

  const downloadHistoryFromFirebase = useCallback(async () => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    setIsDownloading(true);
    try {
      const { updatedHistory, downloadedCount } = await downloadHistoryBatch({
        db,
        ownerEmail: cleanEmail,
        history: matchHistoryRef.current,
      });
      if (downloadedCount > 0) {
        setCloudMatchesCount(0);
        persistHistory(updatedHistory);
      }
    } catch {} finally { setIsDownloading(false); }
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
          markTournamentMatchFinished(db as Firestore, state.tournamentPin, state.tournamentMatchId, res, winnerTeam).catch(() => {});
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
      try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {}
      const db = getDb();
      if (!db) return;
      const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
      // E1: partida encerrada = live também encerrada.
      // 1) Propaga isLiveClosed:true para todos os observers via onSnapshot (notificação).
      // 2) Após 4s (tempo para observers receberem o evento), deleta o documento.
      if (targetPin && navigator.onLine) {
        updateDoc(doc(db, "live_matches", targetPin), {
          isMatchOver: true,
          isConfirmedFinished: true,
          matchEndedAt: Date.now(),
          isLiveClosed: true,
          isMirroringActive: false,
          lastActivityAt: Date.now()
        }).catch(() => {});
        // Deleta após 4s para garantir que todos os listeners receberam a notificação
        setTimeout(() => {
          deleteDoc(doc(db, "live_matches", targetPin)).catch(() => {});
        }, 4000);
      }
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
    } catch {}
    const historyItem = createHistoryItem(state, userProfile, partners, location);
    persistHistory([historyItem, ...matchHistoryRef.current]);
    try { localStorage.removeItem('myPlacarActiveGameState'); clearLiveOwnerPin(); } catch {}
    const db = getDb();
    // Regra 9: a live pode permanecer aberta para nova partida — apenas marca como encerrada,
    // não deleta. O documento será substituído quando o owner iniciar uma nova partida.
    if (db && userProfile.pin && navigator.onLine) {
      updateDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()), {
        isMatchOver: true,
        isConfirmedFinished: true,
        matchEndedAt: Date.now()
      }).catch(() => {});
    }
  }, [persistHistory, userProfile.email, userProfile.pin, partners]);

  const initGameState = async (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => {
    if (finalizationTimerRef.current) { clearTimeout(finalizationTimerRef.current); finalizationTimerRef.current = null; }
    if (forceNew && !tournamentOverride && gameState && (gameState.p1.games > 0 || gameState.p2.games > 0 || gameState.p1.sets.length > 0 || gameState.p1.score !== '0' || gameState.p2.score !== '0')) {
       setModalConfig({
         title: "Deseja iniciar uma nova partida?",
         message: "O placar atual está em andamento. Deseja realmente iniciar uma nova partida?",
         confirmLabel: "Sim, iniciar",
         cancelLabel: "Não, continuar a partida",
         onConfirm: () => { setModalConfig(null); initGameStateInternal(forceNew, tournamentOverride); },
         onCancel: () => { setModalConfig(null); setCurrentScreen('scoreboard'); }
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
              markTournamentMatchLive(db as Firestore, event.pin, event.matches || [], match.id, userProfile.pin).catch(() => {});
           }
        }
    }

    if (gameState?.isMirroringActive && userProfile.email && navigator.onLine && gameState.commandOwnerId === deviceId) {
       const db = getDb();
       if (db) {
          const updatedMatchConfig = { ...configToUse, setsToWin: configToUse.sets, isWatchMode: !!configToUse.isWatchMode };
          const stateToSync = sanitizeForFirestore({
             ...gameState,
             controllers: undefined,  // gerenciado via field-path, nunca sobrescrever
             p1: { ...gameState.p1, name: configToUse.p1Name, partnerName: configToUse.p1Partner, color: configToUse.p1Color },
             p2: { ...gameState.p2, name: configToUse.p2Name, partnerName: configToUse.p2Partner, color: configToUse.p2Color },
             matchConfig: updatedMatchConfig,
             isLiveClosed: false
          });
          const targetPin = resolveTargetPin('initSync');
          if (stateToSync && targetPin) await setDoc(doc(db, "live_matches", targetPin), stateToSync, { merge: true }).catch(() => {});
       }
    }

    if (forceNew && navigator.onLine) {
        const db = getDb();
        if (db && userProfile.pin) {
           const pinUpper = userProfile.pin.toUpperCase();
           try {
             const snap = await getDoc(doc(db, "live_matches", pinUpper));
             if (snap.exists()) {
               // Sempre deletar live existente ao iniciar nova live
               await deleteDoc(doc(db, "live_matches", pinUpper)).catch(() => {});
             }
           } catch {}
        }
    }
    if (gameState && gameState.isMatchOver && !gameState.isConfirmedFinished) finalizeMatchInternal({ ...gameState, isConfirmedFinished: true });
    
    setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true); setIsRecoveryFromMatchOver(false);
    if (!forceNew && navigator.onLine) {
        const db = getDb();
        if (db && userProfile.pin) {
           try {
             const snap = await getDoc(doc(db, "live_matches", userProfile.pin.toUpperCase()));
             if (snap.exists() && snap.data().isLiveClosed !== true) { 
                if (gameState && gameState.ownerPin?.toUpperCase() === userProfile.pin.toUpperCase()) {
                   setCurrentScreen('scoreboard'); 
                   return; 
                }
                setIsWaitingSync(true); 
                setCurrentScreen('scoreboard'); 
                return; 
             }
           } catch {}
        }
    }
    if (!forceNew && gameState) {
      const updatedState: GameState = { 
        ...gameState, 
        isLiveClosed: false,
        matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode }, 
        p1: { ...gameState.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, color: matchSettings.p1Color }, 
        p2: { ...gameState.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, color: matchSettings.p2Color }, 
        isPaused: false 
      };
      setGameState(updatedState);
      try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updatedState)); } catch {}
      setCurrentScreen('scoreboard'); return;
    }
    
    if (!tournamentOverride && !canStartMatch) return;
    const globalLiveCount = parseInt(localStorage.getItem('myPlacarLiveGlobalCount') || '0') + 1;
    try { localStorage.setItem('myPlacarLiveGlobalCount', globalLiveCount.toString()); } catch {}
    const db = getDb();
    if (db && userProfile.pin && navigator.onLine) { 
      try { 
        // Sempre deletar live existente ao iniciar nova live
        await deleteDoc(doc(db, "live_matches", userProfile.pin.toUpperCase())).catch(() => {}); 
      } catch {} 
    }
    
    const newGameState: GameState = {
      matchId: `match_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      startTime: Date.now(),
      p1: { name: configToUse.p1Name, partnerName: configToUse.p1Partner, score: '0', games: 0, sets: [], color: configToUse.p1Color },
      p2: { name: configToUse.p2Name, partnerName: configToUse.p2Partner, score: '0', games: 0, sets: [], color: configToUse.p2Color },
      server: configToUse.initialServer, servingOrderOffset: configToUse.initialServer === 1 ? 0 : 1,
      pointHistory: [], matchConfig: { ...configToUse, setsToWin: configToUse.sets, isWatchMode: !!configToUse.isWatchMode }, history: [], currentSet: 0, isMatchOver: false, isConfirmedFinished: false, matchDuration: 0, isPaused: false, 
      isMirroringActive: false, isLiveClosed: false, ownerPin: userProfile.pin, ownerDeviceId: deviceId,
      liveSessionCounter: globalLiveCount, commandOwner: currentFullDeviceName, commandOwnerId: deviceId, 
      controllers: { [deviceId]: { label: currentFullDeviceName, lastSeen: Date.now(), isOwner: true, role: 'owner' } },
      ...tournamentMeta
    };
    
    // Inicializa sub-estado do pickleball antes de iniciar o jogo,
    // garantindo que state.pickleball exista desde o primeiro render
    // (o announcer precisa dele para o anúncio de início da partida).
    if (configToUse.sportType === 'pickleball') {
      newGameState.pickleball = initPickleballState(newGameState);
      // Sincroniza servingOrderOffset com pkl.server para o marcador visual
      // (o GameState base inicia sempre com offset 0 ou 1, ignorando serverNumber=2)
      newGameState.servingOrderOffset =
        (newGameState.pickleball.server.team === 1 ? 0 : 1) +
        (newGameState.pickleball.server.serverNumber === 2 ? 2 : 0);
    }
    
    setMatchSettings(configToUse);
    // PERSISTE ownerPin no localStorage imediatamente ao criar a live.
    // Isso garante que resolveTargetPin tenha uma fonte confiável mesmo antes
    // de activeLives ser populado pelo onSnapshot da collection.
    if (userProfile.pin) persistLiveOwnerPin(userProfile.pin);
    startGame(newGameState);
    setCurrentScreen('scoreboard');
  };

  const handleScoreUpdate = (player: 1 | 2, type: PointType = 'rally', source: string = 'cb') => {
    const current = gameState;
    if (!current || current.isConfirmedFinished || current.isMatchOver || current.isLiveClosed) return;
    // Bloqueia se outro device é o controller ativo (live em andamento)
    if (current.isMirroringActive && current.commandOwnerId !== deviceId) return;
    // Bloqueia se há juiz designado e este device não é o controller
    // (mesmo antes de ativar o mirroring, o juiz deve ser o único a pontuar)
    if (!current.isMirroringActive && current.judgePin && current.commandOwnerId !== deviceId) return;
    setIsRecoveryFromMatchOver(false);
    // Usa setState funcional para garantir que incrementScore opera
    // sempre sobre o estado mais recente, evitando closure stale
    setGameState(prev => {
      if (!prev || prev.isConfirmedFinished || prev.isMatchOver || prev.isLiveClosed) return prev;
      const next = incrementScore(prev, player, type, source);
      next.isPaused = false;
      // Empilha na history dentro do mesmo ciclo de render
      setHistoryStack(stack => {
        const updated = [...stack, JSON.parse(JSON.stringify(next))];
        historyStackRef.current = updated;
        return updated;
      });
      return { ...next };
    });
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
        const updatedData = { ...cloudData, isMirroringActive: true, isLiveClosed: false, matchConfig: { ...cloudData.matchConfig, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } };
        setGameState(updatedData); setMatchSettings(prev => ({ ...prev, isWatchMode: !!prev.isWatchMode, sportType: cloudData.matchConfig.sportType })); setCurrentScreen('scoreboard'); setActiveCloudMatch(null);
      }
    } catch {}
  };

  const handleRejectRemote = () => setActiveCloudMatch(null);

  const handleCloseCloudLive = async () => {
    const db = getDb();
    if (!db) { setModalConfig({ title: "Erro", message: "Banco de dados não disponível.", onConfirm: () => setModalConfig(null) }); return; }
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Sem conexão com a internet.", onConfirm: () => setModalConfig(null) }); return; }
    if (!userProfile.pin) { setModalConfig({ title: "Erro", message: "PIN não cadastrado.", onConfirm: () => setModalConfig(null) }); return; }
    
    const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
    
    if (!targetPin) { setModalConfig({ title: "Erro", message: "PIN da transmissão não encontrado.", onConfirm: () => setModalConfig(null) }); return; }
    
    try {
      const liveRef = doc(db, "live_matches", targetPin);
      // 1) Propaga isLiveClosed:true para todos os devices via onSnapshot
      await updateDoc(liveRef, {
        isLiveClosed: true,
        isMirroringActive: false,
        closedAt: Date.now(),
        closedBy: deviceId,
        closedByRole: livePapel
      });
      // 2) Após 4s (tempo para observers receberem o snapshot), deleta o documento
      setTimeout(() => deleteDoc(liveRef).catch(() => {}), 4000);

      setGameState(prev => { if (!prev) return null; return { ...prev, isMirroringActive: false, isLiveClosed: true }; });
      setCloudLiveExists(false); setActiveLives(prev => prev.filter(l => l.ownerPin?.toUpperCase() !== targetPin));
      try { localStorage.removeItem('myPlacarActiveGameState'); } catch {}
      setShowLiveControlOverlay(false); setConfirmDeleteLive(false); setCurrentScreen('settings');
      setModalConfig({ title: "Transmissão encerrada", message: "Todos os participantes foram desconectados.", variant: 'success', icon: <CheckCircle className="text-green-500 w-16 h-16" />, onConfirm: () => setModalConfig(null) });
      setTimeout(() => setModalConfig(null), 3000);
    } catch (_e) { 
      console.error("Erro ao encerrar live:", _e);
      setModalConfig({ title: "Erro", message: `Erro ao encerrar: ${_e instanceof Error ? _e.message : 'Tente novamente'}`, onConfirm: () => setModalConfig(null) }); 
    }
  };

  /**
   * handleLeaveLive — chamado quando o usuário sai VOLUNTARIAMENTE da tela do placar.
   * C3: Owner NÃO é removido dos controllers — a live é sua e continua ativa.
   *   - Apenas libera commandOwnerId se estava controlando.
   * Judge/observer: removidos dos controllers; judge-controller libera commandOwnerId.
   */
  const handleLeaveLive = useCallback(async () => {
    if (!gameState?.isMirroringActive || !userProfile.email || !navigator.onLine) return;
    const db = getDb();
    if (!db) return;
    const targetPin = resolveTargetPin('handleLeaveLive');
    if (!targetPin) return;

    try {
      const isActiveController = gameState.commandOwnerId === deviceId;

      if (isOriginalOwner) {
        // C3: Owner sai da tela mas a live PERMANECE ativa — não remove dos controllers.
        // Apenas libera o commandOwnerId para que outro device possa assumir o controle.
        if (isActiveController) {
          await updateDoc(doc(db, "live_matches", targetPin), {
            commandOwnerId: null,
            commandOwner: null
          });
        }
        // Não chama deleteField para o owner — ele continua "presente" na live.
        return;
      }

      // Judge ou observer: remove dos controllers e libera controle se necessário.
      // T4.1: field-path com deleteField() — atômico, sem getDoc.
      const leaveUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
        [`controllers.${deviceId}`]: deleteField()
      };
      if (isActiveController) {
        leaveUpdate.commandOwnerId = null;
        leaveUpdate.commandOwner = null;
      }
      await updateDoc(doc(db, "live_matches", targetPin), leaveUpdate);
    } catch {}
  }, [gameState, userProfile.email, userProfile.pin, deviceId, isOriginalOwner, activeLives]);

  const handleControlLive = async () => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para assumir o controle.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    if (db && userProfile.pin) {
      const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
      
      if (!targetPin) return;
      try {
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudState = snap.data() as GameState;

          // Identifica controller atual e se é um device diferente ativo
          const currentControllerId = cloudState.commandOwnerId;

          const myCommandName = currentFullDeviceName;
          // Role do novo controller: owner se ownerPin bate, senão judge
          const newControllerRole: 'owner' | 'judge' = isOriginalOwner ? 'owner' : 'judge';
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
            isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode 
          };
          // D4: separa write de estado (setDoc com merge) de write de presença (field-path).
          // Eliminando o último ponto que reescrevia o objeto controllers inteiro.

          // Rebaixa o controller anterior para observer via field-path (sem rewrite geral).
          const prevDemoteUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {};
          if (currentControllerId && currentControllerId !== deviceId) {
            const prevEntry = (cloudState.controllers || {})[currentControllerId];
            if (prevEntry) {
              const demotedRole = prevEntry.isOwner || prevEntry.role === 'owner' ? 'owner' : 'observer';
              prevDemoteUpdate[`controllers.${currentControllerId}`] = { ...prevEntry, role: demotedRole };
            }
          }

          const updatedStateRaw = { ...cloudState, commandOwner: myCommandName, commandOwnerId: deviceId, isLiveClosed: false, matchConfig: { ...syncedSettings, setsToWin: syncedSettings.sets, isWatchMode: !!syncedSettings.isWatchMode } };
          // Remove controllers do payload principal — serão escritos via field-path abaixo.
          const { controllers: _controllers, ...stateWithoutControllers } = updatedStateRaw as typeof updatedStateRaw & { controllers?: unknown };
          const updatedState = sanitizeForFirestore(stateWithoutControllers);
          if (updatedState) {
            // Write 1: estado da partida sem controllers (merge preserva campos não enviados).
            await setDoc(doc(db, "live_matches", targetPin), updatedState, { merge: true }).catch(() => {});
            // Write 2: rebaixa controller anterior via field-path (se houver)
            if (Object.keys(prevDemoteUpdate).length > 0) {
              await updateDoc(doc(db, "live_matches", targetPin), prevDemoteUpdate).catch(() => {});
            }
            // Write 3: registra presença do novo controller via field-path
            await updateDoc(doc(db, "live_matches", targetPin), {
              [`controllers.${deviceId}`]: { label: myCommandName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: newControllerRole, deviceType: getDeviceType() }
            }).catch(() => {});
            // Fix D4: monta o objeto controllers local que corresponde ao estado final do Firestore.
            // Sem isso, setGameState ficaria com controllers:undefined causando log "todos saíram".
            const localControllers: Record<string, unknown> = { ...(cloudState.controllers || {}) };
            // Aplica demoção do controller anterior (igual ao Write 2)
            if (currentControllerId && currentControllerId !== deviceId) {
              const prevEntry = (cloudState.controllers || {})[currentControllerId];
              if (prevEntry) {
                const demotedRole = prevEntry.isOwner || prevEntry.role === 'owner' ? 'owner' : 'observer';
                localControllers[currentControllerId] = { ...prevEntry, role: demotedRole };
              }
            }
            // Registra este device como novo controller (igual ao Write 3)
            localControllers[deviceId] = { label: myCommandName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: newControllerRole, deviceType: getDeviceType() };

            tookControlAtRef.current = Date.now();
            prevSettingsRef.current = JSON.parse(JSON.stringify(syncedSettings)); setMatchSettings(syncedSettings); 
            try { localStorage.setItem('myPlacarSettings', JSON.stringify(syncedSettings)); } catch {}
            setIsSettingsInicialSaved(true); setIsSettingsRegrasSaved(true);
            setGameState({ ...updatedState, isMirroringActive: true, controllers: localControllers, matchConfig: { ...updatedState.matchConfig, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
            try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(updatedState)); } catch {}

            overlayAcceptedRef.current = targetPin;
            setShowLiveControlOverlay(false);
            setModalConfig(null); // limpa qualquer modal anterior
            if (currentScreen !== 'scoreboard') setCurrentScreen('scoreboard');
            // Sem modal de sucesso — a troca é silenciosa para quem assume.
            // O device que perdeu o controle será notificado via onSnapshot.
          }
        } else {
          setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Atenção", message: "A partida ao vivo não foi encontrada ou já foi encerrada.", onConfirm: () => setModalConfig(null) });
        }
      } catch {}
    }
  };

  const handleSelectJudgeFromPartners = (partner: Partner) => {
    setJudgePinInput(partner.pin || '');
    setJudgeNicknameLookup(partner.nickname);
    setIsSelectingJudge(false);
    setCurrentScreen('scoreboard');
  };

  // Popula o ref usado pelo activeLives effect (declarado antes desta função)
  // para auto-join como observer sem modal.
  autoJoinObserverRef.current = (pin: string) => handleObserveLive(pin);

  const handleObserveLive = async (targetPin?: string) => {
    if (!navigator.onLine) { setModalConfig({ title: "Erro", message: "Verifique sua conexão para observar.", onConfirm: () => setModalConfig(null) }); return; }
    const db = getDb();
    let pinToObserve = targetPin || userProfile.pin?.toUpperCase();

    if (!targetPin && userProfile.pin) {
      const myPin = userProfile.pin.toUpperCase();
      // 1. Judge: usa ownerPin da live onde este device é judge
      const judgeMatch = activeLives.find(l => l.judgePin?.toUpperCase() === myPin);
      if (judgeMatch && judgeMatch.ownerPin) {
        pinToObserve = judgeMatch.ownerPin;
      } else {
        // 2. Mesmo usuário em outro device: busca a live cujo ownerPin === myPin
        //    mas ownerDeviceId é diferente (ex: note abriu a live, celular quer observar)
        const ownerLive = activeLives.find(l =>
          l.ownerPin?.toUpperCase() === myPin && l.ownerDeviceId && l.ownerDeviceId !== deviceId
        );
        if (ownerLive && ownerLive.ownerPin) {
          pinToObserve = ownerLive.ownerPin.toUpperCase();
        } else {
          // 3. Fallback: qualquer live ativa mais recente
          const latestLive = activeLives.reduce((latest, l) =>
            (l.liveSessionCounter || 0) > (latest.liveSessionCounter || 0) ? l : latest
            , activeLives[0]);
          if (latestLive?.ownerPin) pinToObserve = latestLive.ownerPin.toUpperCase();
        }
      }
    }

    if (db && pinToObserve) {
      const pinUpper = pinToObserve.toUpperCase();
      try {
        const snap = await getDoc(doc(db, "live_matches", pinUpper));
        if (snap.exists() && snap.data().isLiveClosed !== true) {
          const cloudData = snap.data() as GameState;
          const myCommandName = currentFullDeviceName;
          const myNickname = userProfile.nickname || userProfile.name.split(' ')[0];
          // D2: field-path atômico — sem getDoc+rewrite inteiro do objeto controllers.
          // Preserva role existente se o device já está registrado (ex: owner voltando como observer).
          const existingEntry = (cloudData.controllers || {})[deviceId];
          const joinRole = existingEntry?.role === 'owner' || existingEntry?.role === 'judge' ? existingEntry.role : 'observer';

          // Guard: device secundário do mesmo usuário (mesmo PIN, ownerDeviceId diferente)
          // nunca deve tocar em commandOwnerId — o Note (owner real) é quem controla.
          // Só grava presença nos controllers, sem interferir no controle da live.
          const myPin = userProfile.pin?.toUpperCase();
          const isSecondaryDevice = cloudData.ownerPin?.toUpperCase() === myPin && cloudData.ownerDeviceId && cloudData.ownerDeviceId !== deviceId;

          await updateDoc(doc(db, "live_matches", pinUpper), {
            [`controllers.${deviceId}`]: { label: myCommandName, nickname: myNickname, lastSeen: Date.now(), role: joinRole, deviceType: getDeviceType(), isOwner: false }
          }).catch(() => {});
          // lastActivityAt atualizado via D1 no mesmo updateDoc
          
          if (cloudData.matchConfig) {
            setMatchSettings(prev => ({ ...prev, ...cloudData.matchConfig }));
          }

          const nextControllers = {
            ...(cloudData.controllers || {}),
            [deviceId]: { label: myCommandName, nickname: myNickname, lastSeen: Date.now(), role: joinRole, deviceType: getDeviceType(), isOwner: false }
          };
          // Device secundário do mesmo usuário: preserva commandOwnerId da cloud (o Note).
          // Se o celular sobrescrevesse commandOwnerId com o próprio deviceId, o Note viraria observer.
          const resolvedCommandOwnerId = isSecondaryDevice ? cloudData.commandOwnerId : deviceId;
          setGameState({ ...cloudData, isMirroringActive: true, isLiveClosed: false, commandOwnerId: resolvedCommandOwnerId, controllers: nextControllers, matchConfig: { ...cloudData.matchConfig, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: joinRole === 'observer' ? true : !!matchSettings.isScoreboardMode, brightness: matchSettings.brightness, volume: matchSettings.volume, deviceLabel: matchSettings.deviceLabel, selectedVoiceURI: matchSettings.selectedVoiceURI, voiceEnabled: matchSettings.voiceEnabled, voiceScoring: matchSettings.voiceScoring, actionCooldown: matchSettings.actionCooldown, stateLockout: matchSettings.stateLockout } });
          overlayAcceptedRef.current = pinUpper; // impede que o modal reabra após setCurrentScreen
          setShowLiveControlOverlay(false); setCurrentScreen('scoreboard');
        } else {
          if (!targetPin) setCloudLiveExists(false);
          setShowLiveControlOverlay(false);
          setGameState(prev => prev ? { ...prev, isMirroringActive: false } : null);
          setModalConfig({ title: "Atenção", message: "A partida ao vivo não foi encontrada ou já foi encerrada.", onConfirm: () => setModalConfig(null) });
        }
      } catch {}
    }
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

  const handleAddJudge = async () => {
    if (!judgePinInput || judgePinInput.length < 5 || !gameState || !userProfile.pin) return;
    setIsSavingJudge(true);
    const db = getDb();
    if (!db) return;
    try {
      const pinUpper = judgePinInput.toUpperCase().trim();
      const judgeResult = await autoRegisterPartnerByPin(db as Firestore, pinUpper, { origin: 'manual', fallbackNickname: 'Juiz' });
      const nickname = judgeResult?.nickname || judgeNicknameLookup || 'Juiz';

      if (pinUpper && !hasPartnerWithPin(partners, pinUpper)) {
        const newPartner: Partner = judgeResult?.partner || {
          id: `p_${Date.now()}`,
          pin: pinUpper,
          nickname,
          addedAt: Date.now(),
          origin: 'manual'
        };
        setPartners(prev => addPartnerToState(prev, newPartner));

        if (db && userProfile.pin) {
          await setDoc(doc(db as Firestore, 'users', userProfile.pin.toUpperCase(), 'partners', pinUpper), {
            pin: pinUpper,
            nickname,
            addedAt: newPartner.addedAt,
            origin: 'manual'
          }).catch(err => console.error("Erro ao salvar parceiro no Firestore:", err));
        }
      }

      // T4.3: escreve sub-objeto judge (novo) + campos legados (backward-compat)
      await updateDoc(doc(db as Firestore, "live_matches", userProfile.pin.toUpperCase()), { 
        judgePin: pinUpper,
        judgeNickname: nickname,
        judge: {
          pin: pinUpper,
          nickname,
          addedAt: Date.now(),
          isActive: false  // será atualizado para true quando o juiz assumir o controle
        }
      });
      setJudgePinInput('');
      setJudgeNicknameLookup('');
      setModalConfig({ title: "Sucesso", message: "Juiz adicionado com sucesso!", onConfirm: () => setModalConfig(null) });
    } catch (_e) {
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
      // T4.3: remove sub-objeto judge + campos legados
      await updateDoc(doc(db as Firestore, "live_matches", userProfile.pin.toUpperCase()), { 
        judgePin: null,
        judgeNickname: null,
        judge: null
      });
      setConfirmDeleteJudge(false);
      setModalConfig({ title: "Sucesso", message: "Juiz removido.", onConfirm: () => setModalConfig(null) });
    } catch (_e) {
      setModalConfig({ title: "Erro", message: "Erro ao remover juiz.", onConfirm: () => setModalConfig(null) });
    }
  };

  const handleExitSpectator = () => globalThis.location.href = globalThis.location.pathname;

  useEffect(() => { if (gameState?.isConfirmedFinished && !matchHistoryRef.current.some(m => m.id === gameState.matchId)) finalizeMatchInternal(gameState); }, [gameState?.isConfirmedFinished, gameState?.matchId, finalizeMatchInternal]); // matchHistory removido das deps: ler via ref evita re-finalizar partidas deletadas

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

  const handleLogout = async () => {
    if (gameState?.isMirroringActive && userProfile.email && navigator.onLine) {
      const db = getDb();
      if (db) {
        const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
        if (targetPin) {
          if (gameState.commandOwnerId === deviceId) {
            await setDoc(doc(db, "live_matches", targetPin), { isLiveClosed: true, isMirroringActive: false }, { merge: true }).catch(() => {});
          } else {
            // D2b: field-path com deleteField — sem getDoc prévio, sem rewrite inteiro.
            const logoutUpdate: Record<string, FieldValue | null | string | number | boolean | object | undefined> = {
              [`controllers.${deviceId}`]: deleteField()
            };
            if (gameState.commandOwnerId === deviceId) {
              logoutUpdate.commandOwnerId = null;
              logoutUpdate.commandOwner = null;
            }
            await updateDoc(doc(db, "live_matches", targetPin), logoutUpdate).catch(() => {});
          }
        }
      }
    }
    setGameState(null); setUserProfile({ name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false }); setMatchSettings({ ...DEFAULT_TENNIS_SETTINGS, isHistoryEnabled: true }); setMatchHistory([]); setPartners([]); setCloudLiveExists(false); setIsWaitingSync(false); setActiveEvent(null); setRegisteredEvents([]);
    try {
      localStorage.removeItem('myPlacarUserProfile'); localStorage.removeItem('myPlacarActiveGameState'); localStorage.removeItem('myPlacarHistory'); localStorage.removeItem('myPlacarPartners'); localStorage.removeItem('myPlacarAssets'); localStorage.removeItem('myPlacarSettings'); localStorage.removeItem('myPlacar_DataVersion'); localStorage.removeItem('myPlacarPendingReferral'); localStorage.removeItem('myPlacarPendingReferralPin'); localStorage.removeItem('myPlacarPlayerQueue'); localStorage.removeItem('myPlacarActiveEvent'); localStorage.removeItem('myPlacarRegisteredEvents');
      Object.keys(localStorage).forEach(key => { if (key.startsWith('myPlacar_SavedSettings_')) localStorage.removeItem(key); });
    } catch {}
    setCurrentScreen('auth'); setIsRecoveryFromMatchOver(false); globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
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
          // ── espelho Supabase ────────────────────────────────────────────
          mirrorUser(userProfile);
          // ───────────────────────────────────────────────────────────────
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
      const joined = await joinTournamentEvent(db as Firestore, pin, activeProfile);
      if (joined) {
        setUserEntryDate(joined.joinedAt);
        setActiveEvent(joined.event);
        setRegisteredEvents(prev => {
          if (prev.some(e => e.pin === pin)) return prev;
          return [joined.registration, ...prev];
        });
        setCurrentScreen('event-detail');
        if (!silent) {
           setModalConfig({ 
              title: "Inscrição confirmada", 
              message: `Você entrou no evento "${joined.event.name}".`, 
              variant: "success", 
              icon: <CheckCircle className="text-green-500 w-16 h-16" />, 
              onConfirm: () => setModalConfig(null) 
           });
        }
      } else if (!silent) {
        setModalConfig({ title: "Atenção", message: "O código do evento não foi encontrado ou está inativo.", onConfirm: () => setModalConfig(null) });
      }
    } catch (_e) {
       if (!silent) setModalConfig({ title: "Erro", message: "Falha ao buscar evento.", onConfirm: () => setModalConfig(null) });
    }
  };

  const persistMatchSettings = useCallback(() => {
    try {
      localStorage.setItem('myPlacarSettings', JSON.stringify(matchSettings));
      setIsSettingsInicialSaved(true);
      setIsSettingsRegrasSaved(true);

      if (gameState?.isMirroringActive && userProfile.email && navigator.onLine && gameState.commandOwnerId === deviceId) {
        const db = getDb();
        if (db) {
          const targetPin = resolveTargetPin('write');
            if (!targetPin) return;
          const stateToSync = sanitizeForFirestore({
            ...gameState,
            controllers: undefined,  // gerenciado via field-path, nunca sobrescrever
            p1: { ...gameState.p1, name: matchSettings.p1Name, partnerName: matchSettings.p1Partner, color: matchSettings.p1Color },
            p2: { ...gameState.p2, name: matchSettings.p2Name, partnerName: matchSettings.p2Partner, color: matchSettings.p2Color },
            matchConfig: { ...matchSettings, setsToWin: matchSettings.sets, isWatchMode: !!matchSettings.isWatchMode, isScoreboardMode: !!matchSettings.isScoreboardMode }
          });
          if (stateToSync && targetPin) setDoc(doc(db, "live_matches", targetPin), stateToSync, { merge: true }).catch(() => {});
        }
      }
    } catch {}
  }, [matchSettings, gameState, userProfile.pin, userProfile.email, deviceId]);

  const handleExitTournament = () => {
    setActiveEvent(null);
    setUserEntryDate(null);
  };

  const handleSmartSwitchServer = useCallback((team: 1 | 2, isPartner: boolean) => {
    if (!gameState || !isCommandOwner || gameState.isMatchOver) return;
    setIsSettingsInicialSaved(true);
    persistMatchSettings();
    const nextState = JSON.parse(JSON.stringify(gameState)) as GameState;
    const nextSettings = { ...matchSettings };

    // ── Pickleball rally scoring: lógica própria ──────────────────────────────
    const isPickleballRally =
      nextState.matchConfig.sportType === 'pickleball' &&
      nextState.matchConfig.pickleballScoringMode === 'rally';

    if (isPickleballRally && nextState.pickleball) {
      // rallyOffset: team=1 principal→0, team=2 principal→1, team=1 parceiro→2, team=2 parceiro→3
      const newOffset = (team === 1 ? 0 : 1) + (isPartner ? 2 : 0);
      const newServerNumber: 1 | 2 = isPartner ? 2 : 1;
      const sacadorScore = team === 1 ? nextState.pickleball.score.team1 : nextState.pickleball.score.team2;
      const newSide = sacadorScore % 2 === 0 ? 'even' : 'odd';

      nextState.pickleball.server.team         = team;
      nextState.pickleball.server.serverNumber = newServerNumber;
      nextState.pickleball.server.rallyOffset  = newOffset;
      nextState.pickleball.server.side         = newSide;
      // serverName: resolve pelo nome atual no estado (p1.name / p1.partnerName etc.)
      if (team === 1) {
        nextState.pickleball.server.serverName = isPartner
          ? (nextState.p1.partnerName || nextState.p1.name)
          : nextState.p1.name;
      } else {
        nextState.pickleball.server.serverName = isPartner
          ? (nextState.p2.partnerName || nextState.p2.name)
          : nextState.p2.name;
      }

      nextState.server             = team;
      nextState.servingOrderOffset = newOffset;
      nextState.matchConfig = { ...nextState.matchConfig, ...nextSettings };
      setMatchSettings(nextSettings);
      prevSettingsRef.current = { ...nextSettings };
      setGameState(nextState);
      setIsSettingsInicialSaved(true);
      try {
        localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
        localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
      } catch {}
      if (nextState.isMirroringActive && userProfile.email && navigator.onLine && nextState.commandOwnerId === deviceId) {
        const db = getDb();
        if (db) {
          const targetPin = resolveTargetPin('initSync');
          const stateToSync = sanitizeForFirestore({ ...nextState, controllers: undefined });
          if (stateToSync && targetPin) setDoc(doc(db, "live_matches", targetPin), stateToSync, { merge: true }).catch(() => {});
        }
      }
      if (navigator.vibrate) navigator.vibrate(30);
      return;
    }

    // ── Outros modos (tennis, side-out, simples) ──────────────────────────────
    const totalGames = gameState.p1.games + gameState.p2.games;
    const expectedServingTeam = (totalGames % 2 === 0) ? 1 : 2;

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
    // Não usa startGame aqui pois não é início de partida — apenas troca de saque
    setGameState(nextState);
    setIsSettingsInicialSaved(true);
    try { 
      localStorage.setItem('myPlacarSettings', JSON.stringify(nextSettings));
      localStorage.setItem('myPlacarActiveGameState', JSON.stringify(nextState));
    } catch {}
    
    if (nextState.isMirroringActive && userProfile.email && navigator.onLine && nextState.commandOwnerId === deviceId) {
      const db = getDb();
      if (db) {
        const targetPin = resolveTargetPin('confirmMatch');
        const stateToSync = sanitizeForFirestore({ ...nextState, controllers: undefined });
        if (stateToSync && targetPin) setDoc(doc(db, "live_matches", targetPin), stateToSync, { merge: true }).catch(() => {});
      }
    }

    if (navigator.vibrate) navigator.vibrate(30);
  }, [gameState, isCommandOwner, matchSettings, userProfile.pin, userProfile.email, deviceId]);

  const initialReferralPin = useMemo(() => { try { return localStorage.getItem('myPlacarPendingReferralPin') || ''; } catch (_e) { return ''; } }, []);

  const handleOfflineMode = useCallback(() => {
    setIsOfflineMode(true);

    // Tenta preservar o perfil salvo para não entrar como anônimo
    let p1Name = 'Jogador 1';
    let p2Name = 'Jogador 2';
    try {
      const savedProfile = localStorage.getItem('myPlacarUserProfile');
      if (savedProfile) {
        const profile = JSON.parse(savedProfile) as UserProfile;
        if (profile?.nickname || profile?.name) {
          p1Name = profile.nickname || profile.name.split(' ')[0];
        }
      }
    } catch {}

    const offlineSettings: MatchSettings = {
      ...matchSettings,
      p1Name,
      p2Name,
      isDoubles: false,
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
      p1: { name: p1Name, score: '0', games: 0, sets: [], color: offlineSettings.p1Color },
      p2: { name: p2Name, score: '0', games: 0, sets: [], color: offlineSettings.p2Color },
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
    
    // Mesmo tratamento do fluxo online: garante state.pickleball desde o início.
    if (offlineSettings.sportType === 'pickleball') {
      initialGameState.pickleball = initPickleballState(initialGameState);
      // Mesma sincronização do fluxo online
      initialGameState.servingOrderOffset =
        (initialGameState.pickleball.server.team === 1 ? 0 : 1) +
        (initialGameState.pickleball.server.serverNumber === 2 ? 2 : 0);
    }
    startGame(initialGameState);
    setCurrentScreen('scoreboard');
    // Após o ScoreboardScreen montar e os closures serem criados,
    // reinicia o historyStack com o estado zero a zero garantindo
    // que o undo consiga voltar ao início.
    setTimeout(() => startGame(initialGameState), 100);
  }, [matchSettings, startGame]);

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
        const current = gameState;
        const initialServer = current.matchConfig.initialServer ?? 1;

        const resetState: GameState = {
          ...current,
          matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: Date.now(),
          p1: {
            ...current.p1,
            name: current.matchConfig.p1Name,
            partnerName: current.matchConfig.p1Partner,
            color: current.matchConfig.p1Color,
            score: '0',
            games: 0,
            sets: []
          },
          p2: {
            ...current.p2,
            name: current.matchConfig.p2Name,
            partnerName: current.matchConfig.p2Partner,
            color: current.matchConfig.p2Color,
            score: '0',
            games: 0,
            sets: []
          },
          server: initialServer,
          servingOrderOffset: initialServer === 1 ? 0 : 1,
          pointHistory: [],
          history: [],
          currentSet: 0,
          isMatchOver: false,
          isConfirmedFinished: false,
          matchDuration: 0,
          isPaused: false,
          isLiveClosed: false,
          pickleball: undefined,
        };

        if (resetState.matchConfig.sportType === 'pickleball') {
          resetState.pickleball = initPickleballState(resetState);
          resetState.server = resetState.pickleball.server.team;
          resetState.servingOrderOffset =
            (resetState.pickleball.server.team === 1 ? 0 : 1) +
            (resetState.pickleball.server.serverNumber === 2 ? 2 : 0);
        }

        startGame(resetState);
        setLiveLogs([]);
        setVoiceLogs([]);
        setModalConfig(null);
      },
      onCancel: () => setModalConfig(null)
    });
  }, [gameState, startGame, setLiveLogs, setVoiceLogs]);

  // ── Sincronizar Placar ────────────────────────────────────────────────────
  // Controller (owner/judge): faz push do gameState atual para o Firestore.
  // Observer: faz pull do estado mais recente do Firestore e aplica localmente.
  // Ambos registram a ação na cronologia da partida (liveLogs).
  const handleSyncScoreboard = useCallback(async () => {
    if (!gameState || !gameState.isMirroringActive || gameState.isLiveClosed) return;
    if (!navigator.onLine) {
      setModalConfig({ title: "Sem conexão", message: "Verifique sua conexão com a internet e tente novamente.", onConfirm: () => setModalConfig(null) });
      return;
    }
    const db = getDb();
    if (!db) return;
    const targetPin = resolveTargetPin('liveControl');
    if (!targetPin) return;

    const isController = gameState.commandOwnerId === deviceId;

    try {
      if (isController) {
        // ── Controller: push estado atual → Firestore ──────────────────────
        const stateToSync = sanitizeForFirestore({ ...gameState, controllers: undefined });
        if (stateToSync) {
          await setDoc(doc(db, "live_matches", targetPin), { ...stateToSync, lastActivityAt: Date.now() }, { merge: true });
        }
      } else {
        // ── Observer/non-controller: pull estado mais recente ← Firestore ──
        const snap = await getDoc(doc(db, "live_matches", targetPin));
        if (snap.exists()) {
          const cloudData = snap.data() as GameState;
          // Aplica o estado da nuvem preservando campos locais de controle
          setGameState(prev => prev ? {
            ...prev,
            ...cloudData,
            // Preserva campos de presença local — não sobrescreve com dados da nuvem
            commandOwnerId: cloudData.commandOwnerId ?? prev.commandOwnerId,
          } : cloudData);
        }
      }

      // Registra na cronologia da partida
      setLiveLogs(prev => {
        const entry: LiveLogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
          timestamp: Date.now(),
          type: 'score',
          text: `↺ Placar sincronizado (${isController ? 'enviado' : 'recebido'}) — ${gameState.p1.name} ${gameState.p1.score} × ${gameState.p2.score} ${gameState.p2.name}`,
          ok: true,
          isController,
        };
        return [entry, ...(prev || [])].slice(0, 60);
      });
      setShowLiveControlOverlay(false);
    } catch (_e) {
      setModalConfig({ title: "Erro ao sincronizar", message: "Não foi possível sincronizar o placar. Tente novamente.", onConfirm: () => setModalConfig(null) });
    }
  }, [gameState, userProfile.pin, activeLives, isOriginalOwner, deviceId, setLiveLogs]);

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
        <div className="fixed inset-0 z-[100005] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white/90 backdrop-blur-2xl rounded-[3rem] p-8 w-full max-sm shadow-2xl border border-white/50 flex flex-col items-center gap-6 animate-in zoom-in duration-300 relative">
              <button onClick={() => { setShowLiveControlOverlay(false); setConfirmDeleteLive(false); setConfirmDeleteJudge(false); }} className="absolute top-6 right-6 p-2 text-black hover:bg-gray-100 rounded-full transition-colors active:scale-90"><X size={28} strokeWidth={3} /></button>
              <LiveIndicator variant="card" className="scale-125 mb-2" role={indicatorRole} />
              
              {!confirmDeleteLive && !confirmDeleteJudge ? (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-black tracking-tight leading-tight">
                      {isCurrentController ? 'Você está no controle' : 'Live em andamento'}
                    </h3>
                    <p className="text-xs font-bold text-slate-500">
                      {livePapel === 'owner' ? 'Proprietário da live' : livePapel === 'judge' ? 'Juiz convidado' : 'Observador'}
                      {liveType === 'controller' ? ' · Controlando' : ' · Assistindo'}
                    </p>
                  </div>

                  <div className="flex flex-col w-full gap-3">

                    {/* ── Sua participação ───────────────────────────────── */}
                    {/* A2: R2 — qualquer participante pode assumir o controle */}
                    {!isCurrentController && (
                      <button onClick={handleControlLive} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black text-base shadow-xl shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-3">
                        {livePapel === 'owner' ? <Crown size={24} /> : livePapel === 'judge' ? <UserCheck size={24} /> : <Eye size={24} />} Controlar
                      </button>
                    )}

                    {/* ── Sincronizar Placar — disponível para todos os participantes ── */}
                    <button
                      onClick={handleSyncScoreboard}
                      className="w-full py-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl font-black text-sm active:scale-95 flex items-center justify-center gap-2 transition-all hover:bg-emerald-100"
                    >
                      <RefreshCw size={18} /> Sincronizar Placar
                    </button>

                    {/* ── Gestão (só proprietário) ───────────────────────── */}
                    {livePapel === 'owner' && (
                      <div className="w-full mt-2 pt-4 border-t border-gray-100 space-y-3">
                        <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase px-1">Proprietário</p>

                        {/* Juiz */}
                        {liveRole === 'judge' && (
                          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black text-black">Juiz</span>
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black ${isJudgeOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                <div className={`w-1 h-1 rounded-full ${isJudgeOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                                {isJudgeOnline ? 'Online' : 'Offline'}
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    )}

                    {/* ── Encerrar (owner controlando OU controller ativo) — R11 ──────────── */}
                    {(livePapel === 'owner' && isCurrentController) || (!isOriginalOwner && isCurrentController) ? (
                      <button onClick={() => setConfirmDeleteLive(true)} className="w-full py-4 text-red-500 font-black text-xs active:scale-95 flex items-center justify-center gap-2 mt-1">
                        <Trash2 size={16} /> Encerrar transmissão
                      </button>
                    ) : null}

                  </div>
                </>
              ) : confirmDeleteLive ? (
                <>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-red-500 tracking-tight leading-tight">Encerrar a live?</h3>
                    <p className="text-xs font-bold text-slate-500">Todos os participantes perderão a conexão.</p>
                  </div>
                  <div className="flex flex-col w-full gap-3">
                    <button onClick={handleCloseCloudLive} className="w-full py-5 bg-red-600 text-white rounded-3xl font-black text-base shadow-xl shadow-red-200 active:scale-95 transition-all">Confirmar encerramento</button>
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
              {modalConfig.onCancel && <button onClick={() => modalConfig.onCancel!()} className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest active:scale-95 transition-all ${modalConfig.cancelLabel ? 'bg-green-500 text-white shadow-lg shadow-green-100' : 'bg-gray-200 text-gray-700'}`}>{modalConfig.cancelLabel || 'Cancelar'}</button>}
              <button onClick={() => { modalConfig.onConfirm(); }} className={`flex-1 py-4 rounded-[1.5rem] font-black text-xs tracking-widest active:scale-95 transition-all ${modalConfig.variant === 'danger' ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-blue-600 text-white shadow-lg shadow-blue-100'}`}>{modalConfig.confirmLabel || 'Ok'}</button>
            </div>
          </div>
        </div>
      )}
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
          gameState={gameState}
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
          isOriginalOwner={false}
          isPublicView={true}
          role="observer"
          cloudLiveExists={cloudLiveExists}
          userProfile={userProfile}
          fbSyncStatus={fbSyncStatus}
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
      }} onCheckUpdate={handleCheckUpdate} setIsUpdatingVersion={setIsUpdatingVersion} initialReferralPin={initialReferralPin} onOfflineMode={handleOfflineMode} />}
      {currentScreen === 'settings' && <SettingsScreen 
        appUrl={appUrl}
        history={matchHistory} setHistory={setMatchHistory} 
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
        onBack={() => { persistMatchSettings(); setCurrentScreen('settings'); }} onNewGame={() => { persistMatchSettings(); setCurrentScreen('new-game'); }} gameState={gameState} settings={matchSettings} setSettings={setMatchSettings} onStart={() => { persistMatchSettings(); initGameState(true); }} onPlayShortcut={() => { persistMatchSettings(); initGameState(false); }} onOpenRules={() => { persistMatchSettings(); setCurrentScreen('new-game'); }} activeTab={activeTab} setActiveTab={(t) => { persistMatchSettings(); setActiveTab(t); }} onViewMap={id => { setFocusMatchId(id); setCurrentScreen('location'); }} userProfile={userProfile} setUserProfile={setUserProfile} onSaveProfile={handleSaveProfile} onLogout={handleLogout} onGoAdmin={() => setCurrentScreen('admin')} onGoToScoreboard={() => { persistMatchSettings(); initGameState(false); }} isSettingsInicialSaved={isSettingsInicialSaved} isSettingsRegrasSaved={isSettingsRegrasSaved} isProfileSaved={isProfileSaved} canStartMatch={canStartMatch} onSyncAll={(force) => syncHistoryToFirebase(undefined, force)} onDownloadHistory={downloadHistoryFromFirebase} cloudMatchesCount={cloudMatchesCount} isSyncingAll={isSyncing} isDownloading={isDownloading} onOpenPartners={() => setCurrentScreen('partners')} partners={partners} playerQueue={playerQueue} onAutoRegisterPartner={handleAutoRegisterPartner} 
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
      />}
      {currentScreen === 'partners' && <PartnersScreen appUrl={appUrl} isAuthReady={authReady} partners={partners} setPartners={setPartners} playerQueue={playerQueue} setPlayerQueue={setPlayerQueue} onBack={() => { if (isSelectingJudge) { setIsSelectingJudge(false); setCurrentScreen('scoreboard'); } else setCurrentScreen('settings'); }} isDoubles={matchSettings.isDoubles} onUpdateSettings={(updates) => setMatchSettings(prev => ({ ...prev, ...updates }))} userProfile={userProfile} onConfirmSelection={handleConfirmPartners} onSelectPartner={isSelectingJudge ? handleSelectJudgeFromPartners : undefined} p1Color={matchSettings.p1Color} p2Color={matchSettings.p2Color} activeLives={activeLives} onWatchLive={(pin) => { 
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
      {currentScreen === 'scoreboard' && (gameState || isWaitingSync) && <ScoreboardScreen 
        fbSyncStatus={fbSyncStatus}
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
        const stack = historyStackRef.current;
        const p = undoPoint(stack); 
        if (p) { 
          const s = gameState!; const isFinishedPending = (s.isMatchOver && !s.isConfirmedFinished);
          if (isFinishedPending) { setHistoryStack(stack.slice(0,-1)); setGameState({...p, isPaused: false, isMatchOver: false}); setIsRecoveryFromMatchOver(true); return; }
          if (isRecoveryFromMatchOver) { const isCrossingGameOrSet = (p.p1.games !== s.p1.games) || (p.p2.games !== s.p2.games) || (p.p1.sets.length !== s.p1.sets.length); if (isCrossingGameOrSet) return; }
          setHistoryStack(stack.slice(0,-1)); setGameState({...p, isPaused: false, isMatchOver: false});
        } 
      }} onSwitchServer={handleSmartSwitchServer} onTogglePause={() => { 
        if(!gameState || gameState.isConfirmedFinished || gameState.isMatchOver || gameState.isLiveClosed || !isCommandOwner) return; 
        setGameState(p => p ? {...p, isPaused: !p.isPaused} : null); 
      }} onBack={() => {
        // C2: diálogos de saída por papel
        const liveAtiva = gameState?.isMirroringActive && !gameState.isLiveClosed && !gameState.isConfirmedFinished;
        if (liveAtiva) {
          if (isOriginalOwner) {
            // Owner: 2 opções — sair da tela (live continua) ou encerrar transmissão
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
        const liveAtiva = gameState?.isMirroringActive && !gameState.isLiveClosed && !gameState.isConfirmedFinished;
        if (liveAtiva) {
          if (isOriginalOwner) {
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
        if(!gameState || gameState.isConfirmedFinished || gameState.isLiveClosed) return; 
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
        const nextControllers = { [deviceId]: { label: currentFullDeviceName, lastSeen: Date.now(), isOwner: isOriginalOwner, role: isOriginalOwner ? 'owner' : 'judge' as const, deviceType: getDeviceType() } };
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
        setGameState(p => p ? {...p, isMirroringActive: a, isLiveClosed: false, commandOwnerId: a ? deviceId : p.commandOwnerId} : null); 
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
      }} userProfile={userProfile} isRecoveryFromMatchOver={isRecoveryFromMatchOver} currentDeviceId={deviceId} currentDeviceFullLabel={currentFullDeviceName} onOpenLiveControl={() => setShowLiveControlOverlay(true)} onDeleteLive={() => {
              setModalConfig({
                title: "Encerrar a live?",
                message: "Todos os participantes perderão a conexão.",
                confirmLabel: "Encerrar",
                variant: 'danger',
                onConfirm: async () => { setModalConfig(null); await handleCloseCloudLive(); },
                onCancel: () => setModalConfig(null)
              });
            }} onResetMatch={handleResetMatch} onOpenMenu={() => setIsMenuOpen(true)} isOfflineMode={isOfflineMode} onExitOffline={handleExitOffline} cloudLiveExists={cloudLiveExists} role={livePapel} indicatorRole={indicatorRole} onToggleWatchMode={() => setMatchSettings(prev => ({ ...prev, isWatchMode: !prev.isWatchMode }))} onToggleScoreboardMode={() => { setMatchSettings(prev => ({ ...prev, isScoreboardMode: !prev.isScoreboardMode })); setGameState(p => p ? { ...p, matchConfig: { ...p.matchConfig, isScoreboardMode: !p.matchConfig.isScoreboardMode } } : null); }} liveLogs={liveLogs} setLiveLogs={setLiveLogs} voiceLogs={voiceLogs} setVoiceLogs={setVoiceLogs} />}
      {currentScreen === 'location' && <LocationScreen history={matchHistory} focusMatchId={focusMatchId} onBack={() => { setFocusMatchId(null); setActiveTab('history'); setCurrentScreen('settings'); }} />}
      {currentScreen === 'tournaments' && <TournamentsScreen registrations={registeredEvents} onBack={() => setCurrentScreen('settings')} onJoin={handleJoinTournament} onSelectEvent={(ev) => { setActiveEvent(ev as unknown as TournamentEvent); setCurrentScreen('event-detail'); }} />}
      {currentScreen === 'event-detail' && activeEvent && <EventDetailScreen appUrl={appUrl} event={activeEvent} onBack={() => setCurrentScreen('tournaments')} userProfile={userProfile} onExitTournament={handleExitTournament} onAddPartner={handleAddTournamentPartner} partners={partners} onStartTournamentMatch={(match, pair1, pair2, ev) => initGameState(true, { match, pair1, pair2, event: ev })} setModalConfig={setModalConfig} />}
      {currentScreen === 'communications' && <CommunicationsScreen userProfile={userProfile} onBack={() => setCurrentScreen('settings')} />}
    </div>
    </ErrorBoundary>
  );
};

export default App;
