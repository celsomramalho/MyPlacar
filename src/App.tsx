import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SettingsScreen } from '@modules/settings';
import { ScoreboardScreen } from './screens/ScoreboardScreen.tsx';
import { NewGameScreen } from './screens/NewGameScreen.tsx';
import { AdminScreen } from './screens/AdminScreen.tsx';
import { SpectatorScreen } from './screens/SpectatorScreen.tsx';
import { LocationScreen, clearCloudHistory, createHistoryItem, downloadHistoryBatch, fetchCloudHistoryCount, getUnsyncedHistory, removeHistoryMatches, syncHistoryBatch } from '@modules/history';
import { AuthScreen } from '@modules/auth';
import { PartnersScreen, addPartnerToState, applyPartnerSelection, autoRegisterPartnerByPin, createManualPartner, hasPartnerWithPin } from '@modules/partners';
import { EventDetailScreen, TournamentsScreen, fetchRegisteredEvents, getActiveEventEntryDate, joinTournamentEvent, markTournamentMatchFinished, markTournamentMatchLive } from '@modules/events';
import { CommunicationsScreen } from './screens/CommunicationsScreen.tsx';
import { LiveProvider, useLive } from '@modules/live';
import { GameProvider, useGame } from '@modules/game';
import { UIProvider, useUI } from '@modules/ui';
import { LiveControlOverlay } from '@modules/live/components/LiveControlOverlay.tsx';
import { InstallPwaModal } from './components/InstallPwaModal.tsx';
import { NavigationDrawer } from './components/NavigationDrawer.tsx';
// import { Input } from './components/Input.tsx'; // unused
import type { Partner, QueuePlayer } from '@modules/partners';
import type { MatchHistoryItem } from '@modules/history';
import type { UserProfile } from '@modules/auth';
import type { EventRegistration, TournamentEvent, TournamentMatch, TournamentPair } from '@modules/events';
import { GameState, MatchSettings, Screen, PointType, AdminTab, ControllerRecord, Tab, LivePapel, LiveType, LiveLogEntry } from './types.ts';
// NOTA: adicionar 'public-scoreboard' ao tipo Screen em types.ts
import { isValidGameState, isValidMatchSettings } from './utils/validation.ts';
import { safeJsonParse } from './utils/safeJsonParse.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { DEFAULT_TENNIS_SETTINGS, APP_VERSION as LOCAL_CODE_VERSION } from './constants.ts';
import { incrementScore, undoPoint } from './utils/tennisEngine.ts';
import { initPickleballState } from './utils/pickleballEngine.ts';
import { applyGoldenRule } from './utils/formatters.ts';
import { isWatchDevice, getDeviceType, getDeviceId, resolveWatchMode } from './utils/device.ts';
import { sanitizeForFirestore } from './utils/sanitize.ts';
import { findUserByPin, getDb, clearFirestoreCache, deleteCloudMatch, deleteCloudMatches } from '@infra/firebase';

import { getAuthInstance } from '@infra/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, deleteDoc, getDoc, updateDoc, onSnapshot, Firestore, deleteField, FieldValue } from 'firebase/firestore';
import { AlertCircle, RotateCw, Wifi, X, CheckCircle, Loader2, ArrowLeftRight, Trophy, WifiOff } from 'lucide-react';
import { useAppLogger } from './hooks/useAppLogger.ts';
import { useInstallPwa } from './hooks/useInstallPwa.ts';
import { useOnlineSync } from './hooks/useOnlineSync.ts';
import { useWakeLock } from './hooks/useWakeLock.ts';
import { deleteSupabaseMatch, deleteSupabaseMatches, mirrorUser } from '@infra/supabase';

const CURRENT_DATA_VERSION = '3.1.0'; // bumped: limpa SavedSettings_* para forçar novos defaults por esporte


const getUrlParams = () => new URLSearchParams(globalThis.location.search);

const getInitialScreen = (): Screen => {
  try {
    const _viewMode = new URLSearchParams(window.location.search).get('viewMode');
    const _viewPin = new URLSearchParams(window.location.search).get('viewPin');
    const _viewMatch = new URLSearchParams(window.location.search).get('viewMatch');
    console.log('[DEBUG currentScreen init] viewMode:', _viewMode, 'viewPin:', _viewPin, 'viewMatch:', _viewMatch);
    if (_viewPin && _viewMode === 'scoreboard') { console.log('[DEBUG] → public-scoreboard'); return 'public-scoreboard'; }
    if (_viewMatch || _viewPin) { console.log('[DEBUG] → spectator'); return 'spectator'; }
    
    const params = getUrlParams();
    if (params.get('mode') === 'resetPassword' || params.get('oobCode')) return 'auth';

    // Auto-login: se houver perfil salvo válido e completo, pula o AuthScreen
    const saved = localStorage.getItem('myPlacarUserProfile');
    if (saved) {
      const profile = JSON.parse(saved) as UserProfile;
      if (profile?.email && profile?.pin && profile?.isProfileComplete) {
        return 'settings';
      }
    }
    return 'auth';
  } catch (_e) {
    return 'auth';
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

import {
  persistLiveOwnerPin,
  getPersistedLiveOwnerPin,
  clearLiveOwnerPin,
  assertOwnerPin,
} from './modules/live/liveHelpers.ts';

// ─── AppInner ────────────────────────────────────────────────────────────────
// Contém todo o estado, lógica e JSX do app.
// É filho do <LiveProvider> (montado no App abaixo), então o useLive() chamado
// pelo LiveBridge (também filho do provider) pode injetar os valores de volta
// via callback sem violar as regras de contexto do React.
const AppInner: React.FC = () => {
  const urlParams = getUrlParams();
  const deviceId = getDeviceId();
  
  const initialSpectatorMatchId = urlParams.get('viewMatch');
  const initialSpectatorPin = urlParams.get('viewPin');
  const initialViewMode = new URLSearchParams(window.location.search).get('viewMode'); // 'scoreboard' | 'watch' | null
  
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
    voiceLogs, setVoiceLogs
  } = useUI();

  // Mantém a tela acesa enquanto o placar estiver visível — independente de remounts do ScoreboardScreen.
  useWakeLock(currentScreen === 'scoreboard' || currentScreen === 'public-scoreboard');

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

  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(!navigator.onLine);
  const [cloudMatchesCount, setCloudMatchesCount] = useState(0);
  const [isUpdatingVersion, setIsUpdatingVersion] = useState(false);
  const [showInstallPwa, setShowInstallPwa] = useState(false);
  const [installPromptShownSession, setInstallPromptShownSession] = useState(true);
  const { deferredPrompt } = useInstallPwa();
  const [activeCloudMatch, setActiveCloudMatch] = useState<{id: string, sport: string} | null>(null);
  // (ver bloco "espelhos do LiveContext" abaixo, junto a fbSyncStatus)
  const [activeLives, setActiveLivesLocal] = useState<GameState[]>([]);
  const [cloudLiveExists, setCloudLiveExistsLocal] = useState<boolean>(false);

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

  // ── userProfile — espelho do GameContext ─────────────────────────────────
  // Estado vive no <GameProvider>. Espelho local mantido para que useMemo/useEffect
  // e props das telas filhas (AuthScreen, CommunicationsScreen, etc.) permaneçam
  // reativos sem modificação. GameBridge sincroniza via onUpdate.
  const [userProfile, setUserProfileLocal] = useState<UserProfile>({ name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false, authMethod: 'pin' });
  const setUserProfileLocalRef = useRef(setUserProfileLocal);
  setUserProfileLocalRef.current = setUserProfileLocal;
  // Ref que receberá o setter real do GameContext via GameBridge.onReady:
  const ctxSetUserProfileRef = useRef<React.Dispatch<React.SetStateAction<UserProfile>>>(() => {});
  // Wrapper estável: atualiza o GameContext E o estado espelho local.
  const setUserProfile = useCallback<React.Dispatch<React.SetStateAction<UserProfile>>>(
    (v) => { ctxSetUserProfileRef.current(v); setUserProfileLocalRef.current(v); }, []
  );

  const { logs, clearLogs } = useAppLogger();
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [_versionTapCount, setVersionTapCount] = useState(0);

  // ─── Live Logs: persistem ao trocar de tela ────────────────────────────────
  const [liveLogs, setLiveLogsLocal] = useState<LiveLogEntry[]>([]);

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

  // ── matchSettings — espelho do GameContext ───────────────────────────────
  // Inicializado com o default; GameBridge.onReady sincroniza o valor real
  // (com lazy load do localStorage) antes do primeiro render das telas filhas.
  const [matchSettings, setMatchSettingsLocal] = useState<MatchSettings>(() => ({ ...DEFAULT_TENNIS_SETTINGS, winnersStay: false }));
  const setMatchSettingsLocalRef = useRef(setMatchSettingsLocal);
  setMatchSettingsLocalRef.current = setMatchSettingsLocal;
  const ctxSetMatchSettingsRef = useRef<React.Dispatch<React.SetStateAction<MatchSettings>>>(() => {});
  const setMatchSettings = useCallback<React.Dispatch<React.SetStateAction<MatchSettings>>>(
    (v) => { ctxSetMatchSettingsRef.current(v); setMatchSettingsLocalRef.current(v); }, []
  );

  // ── gameState — espelho do GameContext ──────────────────────────────────
  // Estado vive no <GameProvider>. Espelho necessário: alimenta <LiveProvider>,
  // 8+ dep arrays reativos e closures de onSnapshot (via gameStateRef abaixo).
  // GameBridge sincroniza via onUpdate.
  const [gameState, setGameStateLocal] = useState<GameState | null>(null);
  const setGameStateLocalRef = useRef(setGameStateLocal);
  setGameStateLocalRef.current = setGameStateLocal;
  const ctxSetGameStateRef = useRef<React.Dispatch<React.SetStateAction<GameState | null>>>(() => {});
  const setGameState = useCallback<React.Dispatch<React.SetStateAction<GameState | null>>>(
    (v) => { ctxSetGameStateRef.current(v); setGameStateLocalRef.current(v); }, []
  );

  // gameStateRef: ref local para closures estáveis (performExit, onSnapshot) — evita stale closure.
  // activeLivesRef: proxy para o ref do LiveContext (ver abaixo).
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── Estados de permissão Live — espelhos do LiveContext ──────────────────
  // Valores computados no LiveContext; sincronizados pelo LiveBridge via onUpdate.
  // Valores iniciais conservadores (false/'spectator') até o primeiro onUpdate.
  const [isOriginalOwner, setIsOriginalOwner] = useState(false);
  const [isActiveController, setIsActiveController] = useState(false);
  const [isCurrentController, setIsCurrentController] = useState(false);
  const [isCommandOwner, setIsCommandOwner] = useState(true);
  const [livePapel, setLivePapel] = useState<LivePapel>('spectator');
  const [liveStatus, setLiveStatus] = useState<LiveType>('watcher');
  const [indicatorRole, setIndicatorRole] = useState<'owner' | 'judge' | 'observer'>('observer');
  const [isJudgeOnline, setIsJudgeOnline] = useState(false);
  const [isOwnerOnline, setIsOwnerOnline] = useState(false);

  // resolveTargetPin: ref que aponta para a função do contexto após onReady.
  // Wrapper estável para que handlers com useCallback não precisem ser recriados.
  const resolveTargetPinRef = useRef<(context: string) => string | null>(() => null);
  const resolveTargetPin = useCallback(
    (context: string) => resolveTargetPinRef.current(context), []
  );

  // _activeMatchPin: derivado de isOriginalOwner (agora estado espelho)
  const _activeMatchPin = useMemo(() => {
    return isOriginalOwner ? userProfile.pin?.toUpperCase() : gameState?.ownerPin?.toUpperCase();
  }, [isOriginalOwner, userProfile.pin, gameState?.ownerPin]);

  // [Fase 6] confirmDeleteLive e confirmDeleteJudge migrados para LiveControlOverlay (estado interno).
  // initialConfirmDeleteJudge: sinaliza que o overlay deve abrir já na tela de confirmação de remoção de juiz.
  const [initialConfirmDeleteJudge, setInitialConfirmDeleteJudge] = useState(false);


  const [isServiceInterrupted, setIsServiceInterrupted] = useState(false);

  // ── fbSyncStatus / liveLogs / activeLives — espelhos do LiveContext ──────
  // Estados sincronizados pelo LiveBridge. Mantidos locais para reatividade
  // de useMemo/useEffect sem modificar os consumidores existentes.
  const [fbSyncStatus, setFbSyncStatusLocal] = useState<{ team: 1 | 2; seq: number; isObserver: boolean } | null>(null);
  const fbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFbScoreKeyRef = useRef<string>(''); // "p1score_p1games_p2score_p2games"
  const hasAutoEnabledScoreboardRef = useRef(false); // evita loop: ativa modo placar 1x por sessão de observer
  // ── Injeção dos setters/refs do LiveContext via LiveBridge ───────────────
  // useLive() não pode ser chamado aqui — AppInner renderiza o <LiveProvider>,
  // portanto ainda não é descendente dele. O <LiveBridge> (filho direto do provider)
  // chama useLive() e injeta valores nestes refs via onReady/onUpdate.
  // Os refs ctx* são inicializados com stubs e substituídos no primeiro render.

  // Refs que receberão os setters reais do contexto via LiveBridge.onReady:
  const ctxSetActiveLivesRef = useRef<React.Dispatch<React.SetStateAction<GameState[]>>>(() => {});
  const ctxSetCloudLiveExistsRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(() => {});
  const ctxSetLiveLogsRef = useRef<React.Dispatch<React.SetStateAction<LiveLogEntry[]>>>(() => {});
  const ctxSetFbSyncStatusRef = useRef<React.Dispatch<React.SetStateAction<{ team: 1 | 2; seq: number; isObserver: boolean } | null>>>(() => {});

  // Refs dos setters locais espelho — declarados antes dos useCallback wrappers que os usam.
  // O .current é atualizado a cada render para evitar closure stale.
  const setActiveLivesLocalRef = useRef(setActiveLivesLocal);
  setActiveLivesLocalRef.current = setActiveLivesLocal;
  const setCloudLiveExistsLocalRef = useRef(setCloudLiveExistsLocal);
  setCloudLiveExistsLocalRef.current = setCloudLiveExistsLocal;
  const setLiveLogsLocalRef = useRef(setLiveLogsLocal);
  setLiveLogsLocalRef.current = setLiveLogsLocal;
  const setFbSyncStatusLocalRef = useRef(setFbSyncStatusLocal);
  setFbSyncStatusLocalRef.current = setFbSyncStatusLocal;

  // Wrappers estáveis que delegam para o ref do contexto E atualizam o estado espelho local.
  // O estado espelho mantém a reatividade dos useMemo/useEffect do AppInner.
  const ctxSetActiveLives = useCallback<React.Dispatch<React.SetStateAction<GameState[]>>>(
    (v) => { ctxSetActiveLivesRef.current(v); setActiveLivesLocalRef.current(v); }, []
  );
  const ctxSetCloudLiveExists = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (v) => { ctxSetCloudLiveExistsRef.current(v); setCloudLiveExistsLocalRef.current(v); }, []
  );
  const ctxSetLiveLogs = useCallback<React.Dispatch<React.SetStateAction<LiveLogEntry[]>>>(
    (v) => { ctxSetLiveLogsRef.current(v); setLiveLogsLocalRef.current(v); }, []
  );
  const ctxSetFbSyncStatus = useCallback<React.Dispatch<React.SetStateAction<{ team: 1 | 2; seq: number; isObserver: boolean } | null>>>(
    (v) => { ctxSetFbSyncStatusRef.current(v); setFbSyncStatusLocalRef.current(v); }, []
  );

  // Refs de ciclo de vida: usamos objetos proxy que delegam leituras e escritas
  // ao objeto ref real do contexto após onReady. Antes disso, operam sobre
  // um ref local temporário — comportamento idêntico ao Passo 5.4.
  // Assim todos os usos existentes (ctxTookControlAtRef.current = x) continuam
  // funcionando sem nenhuma mudança.
  //
  // activeLivesRef: proxy para o ref do contexto (usado no performExit).
  const _ctxActiveLivesRefInner = useRef<GameState[]>([]);
  const _ctxActiveLivesRefTarget = useRef<React.MutableRefObject<GameState[]>>(_ctxActiveLivesRefInner);
  const activeLivesRef: React.MutableRefObject<GameState[]> = {
    get current() { return _ctxActiveLivesRefTarget.current.current; },
    set current(v) { _ctxActiveLivesRefTarget.current.current = v; },
  };

  const _ctxTookControlAtInner = useRef<number>(0);
  const _ctxLostControlAtInner = useRef<number>(0);
  const _ctxIsClosingLiveInner = useRef<boolean>(false);
  const _ctxLastFbScoreKeyInner = useRef<string>('');
  const _ctxFbSyncTimerInner = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _ctxHasAutoEnabledScoreboardInner = useRef<boolean>(false);

  // Refs que apontam para o objeto ref ativo (local ou do contexto).
  const _ctxTookControlAtTarget = useRef<React.MutableRefObject<number>>(_ctxTookControlAtInner);
  const _ctxLostControlAtTarget = useRef<React.MutableRefObject<number>>(_ctxLostControlAtInner);
  const _ctxIsClosingLiveTarget = useRef<React.MutableRefObject<boolean>>(_ctxIsClosingLiveInner);
  const _ctxLastFbScoreKeyTarget = useRef<React.MutableRefObject<string>>(_ctxLastFbScoreKeyInner);
  const _ctxFbSyncTimerTarget = useRef<React.MutableRefObject<ReturnType<typeof setTimeout> | null>>(_ctxFbSyncTimerInner);
  const _ctxHasAutoEnabledScoreboardTarget = useRef<React.MutableRefObject<boolean>>(_ctxHasAutoEnabledScoreboardInner);

  // Proxies com interface MutableRefObject<T> — transparentes para os handlers.
  const ctxTookControlAtRef: React.MutableRefObject<number> = {
    get current() { return _ctxTookControlAtTarget.current.current; },
    set current(v) { _ctxTookControlAtTarget.current.current = v; },
  };
  const ctxLostControlAtRef: React.MutableRefObject<number> = {
    get current() { return _ctxLostControlAtTarget.current.current; },
    set current(v) { _ctxLostControlAtTarget.current.current = v; },
  };
  const ctxIsClosingLiveRef: React.MutableRefObject<boolean> = {
    get current() { return _ctxIsClosingLiveTarget.current.current; },
    set current(v) { _ctxIsClosingLiveTarget.current.current = v; },
  };
  const ctxLastFbScoreKeyRef: React.MutableRefObject<string> = {
    get current() { return _ctxLastFbScoreKeyTarget.current.current; },
    set current(v) { _ctxLastFbScoreKeyTarget.current.current = v; },
  };
  const ctxFbSyncTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null> = {
    get current() { return _ctxFbSyncTimerTarget.current.current; },
    set current(v) { _ctxFbSyncTimerTarget.current.current = v; },
  };
  const ctxHasAutoEnabledScoreboardRef: React.MutableRefObject<boolean> = {
    get current() { return _ctxHasAutoEnabledScoreboardTarget.current.current; },
    set current(v) { _ctxHasAutoEnabledScoreboardTarget.current.current = v; },
  };

  // Callback passado ao LiveBridge: chamado assim que o contexto estiver disponível.
  const handleLiveReady = useCallback((ctx: ReturnType<typeof useLive>) => {
    ctxSetActiveLivesRef.current = ctx.setActiveLives;
    ctxSetCloudLiveExistsRef.current = ctx.setCloudLiveExists;
    ctxSetLiveLogsRef.current = ctx.setLiveLogs;
    ctxSetFbSyncStatusRef.current = ctx.setFbSyncStatus;
    // Redireciona os proxies para os objetos ref reais do contexto
    _ctxTookControlAtTarget.current = ctx.tookControlAtRef as React.MutableRefObject<number>;
    _ctxLostControlAtTarget.current = ctx.lostControlAtRef as React.MutableRefObject<number>;
    _ctxIsClosingLiveTarget.current = ctx.isClosingLiveRef as React.MutableRefObject<boolean>;
    _ctxLastFbScoreKeyTarget.current = ctx.lastFbScoreKeyRef as React.MutableRefObject<string>;
    _ctxFbSyncTimerTarget.current = ctx.fbSyncTimerRef as React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    _ctxHasAutoEnabledScoreboardTarget.current = ctx.hasAutoEnabledScoreboardRef as React.MutableRefObject<boolean>;
    // activeLivesRef do contexto — usado em closures estáveis (performExit)
    _ctxActiveLivesRefTarget.current = ctx.activeLivesRef as React.MutableRefObject<GameState[]>;
    // Sincroniza os estados espelho com os valores iniciais do contexto
    setActiveLivesLocalRef.current(ctx.activeLives);
    setCloudLiveExistsLocalRef.current(ctx.cloudLiveExists);
    setLiveLogsLocalRef.current(ctx.liveLogs);
    setFbSyncStatusLocalRef.current(ctx.fbSyncStatus);
    // resolveTargetPin: aponta para a função do contexto (estável entre renders)
    resolveTargetPinRef.current = ctx.resolveTargetPin;
  }, []);

  // handleLiveUpdate: chamado pelo LiveBridge a cada mudança nos valores computados.
  // Sincroniza os estados espelho de permissão com o contexto.
  const handleLiveUpdate = useCallback((ctx: ReturnType<typeof useLive>) => {
    setIsOriginalOwner(ctx.isOriginalOwner);
    setIsActiveController(ctx.isActiveController);
    setIsCurrentController(ctx.isCurrentController);
    setIsCommandOwner(ctx.isCommandOwner);
    setLivePapel(ctx.livePapel);
    setLiveStatus(ctx.liveStatus);
    setIndicatorRole(ctx.indicatorRole);
    setIsJudgeOnline(ctx.isJudgeOnline);
    setIsOwnerOnline(ctx.isOwnerOnline);
    resolveTargetPinRef.current = ctx.resolveTargetPin;
    // Estados de dados também sincronizados aqui para cobrir mudanças externas
    setActiveLivesLocalRef.current(ctx.activeLives);
    setCloudLiveExistsLocalRef.current(ctx.cloudLiveExists);
    setLiveLogsLocalRef.current(ctx.liveLogs);
    setFbSyncStatusLocalRef.current(ctx.fbSyncStatus);
  }, []);

  const [newAppUrl, setNewAppUrl] = useState("");

  const [activeEvent, setActiveEvent] = useState<TournamentEvent | null>(() => safeJsonParse('myPlacarActiveEvent', null));
  const [userEntryDate, setUserEntryDate] = useState<number | null>(null);
  const [registeredEvents, setRegisteredEvents] = useState<EventRegistration[]>(() => safeJsonParse('myPlacarRegisteredEvents', []) as EventRegistration[]);

  // ── matchHistoryRef — proxy para o ref do GameContext ────────────────────
  // Lido em closures de handlers (finalizeMatchInternal, downloadHistoryFromFirebase,
  // onDeleteMatch, useOnlineSync) sem adicionar deps. Delega ao ref do contexto
  // após GameBridge.onReady; opera sobre ref local temporário antes disso.
  const _ctxMatchHistoryRefInner = useRef<MatchHistoryItem[]>([]);
  const _ctxMatchHistoryRefTarget = useRef<React.MutableRefObject<MatchHistoryItem[]>>(_ctxMatchHistoryRefInner);
  const matchHistoryRef: React.MutableRefObject<MatchHistoryItem[]> = {
    get current() { return _ctxMatchHistoryRefTarget.current.current; },
    set current(v) { _ctxMatchHistoryRefTarget.current.current = v; },
  };
  const prevSettingsRef = useRef<MatchSettings | null>(null);
  const prevProfileRef = useRef<UserProfile | null>(null);

  
  const lastSentStateRef = useRef<string>("");
  // tookControlAtRef, lostControlAtRef, isClosingLiveRef vivem no LiveContext;
  // acessados via proxies ctxTookControlAtRef/ctxLostControlAtRef/ctxIsClosingLiveRef abaixo.



  // ── partners — espelho do GameContext ────────────────────────────────────
  // Estado vive no <GameProvider>. Espelho necessário: sync localStorage,
  // exportação de dados e finalizeMatchInternal.
  // PartnersScreen e SettingsScreen migradas para useGame().
  const [partners, setPartnersLocal] = useState<Partner[]>([]);
  const setPartnersLocalRef = useRef(setPartnersLocal);
  setPartnersLocalRef.current = setPartnersLocal;
  const ctxSetPartnersRef = useRef<React.Dispatch<React.SetStateAction<Partner[]>>>(() => {});
  const setPartners = useCallback<React.Dispatch<React.SetStateAction<Partner[]>>>(
    (v) => { ctxSetPartnersRef.current(v); setPartnersLocalRef.current(v); }, []
  );

  const handleLeaveLiveLocalRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleLeaveLive = useCallback(async () => handleLeaveLiveLocalRef.current(), []);
  
  const finalizeMatchInternalLocalRef = useRef<(state: GameState) => Promise<void>>(() => Promise.resolve());
  const finalizeMatchInternal = useCallback(async (state: GameState) => finalizeMatchInternalLocalRef.current(state), []);

  const handleCloseCloudLiveLocalRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleCloseCloudLive = useCallback(async () => handleCloseCloudLiveLocalRef.current(), []);

  const handleDeleteJudgeLocalRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleDeleteJudge = useCallback(async () => handleDeleteJudgeLocalRef.current(), []);

  const handleControlLiveLocalRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleControlLive = useCallback(async () => handleControlLiveLocalRef.current(), []);

  const handleObserveLiveLocalRef = useRef<((pin?: string) => Promise<void>)>(async () => {});
  const handleObserveLive = useCallback(async (pin?: string) => handleObserveLiveLocalRef.current(pin), []);

  const handleSyncScoreboardLocalRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleSyncScoreboard = useCallback(async () => handleSyncScoreboardLocalRef.current(), []);

  const handleAddJudgeLocalRef = useRef<((pin: string, nickname?: string) => Promise<void>)>(async () => {});
  const handleAddJudge = useCallback(async (pin: string, nickname?: string) => handleAddJudgeLocalRef.current(pin, nickname), []);

  const handleSaveProfileLocalRef = useRef<() => Promise<void>>(async () => {});
  const handleSaveProfile = useCallback(async () => handleSaveProfileLocalRef.current(), []);

  const setHistoryStackLocalRef = useRef<React.Dispatch<React.SetStateAction<GameState[]>>>(() => {});
  const setHistoryStack = useCallback<React.Dispatch<React.SetStateAction<GameState[]>>>((v) => setHistoryStackLocalRef.current(v), []);

  const handleScoreUpdateLocalRef = useRef<((player: 1 | 2, type?: PointType, source?: string) => void)>(() => {});
  const handleScoreUpdate = useCallback((player: 1 | 2, type?: PointType, source?: string) => handleScoreUpdateLocalRef.current(player, type, source), []);

  const handleCorrectScoreLocalRef = useRef<((type: 'game' | 'gameSet' | 'matchSet', value: string) => void)>(() => {});
  const handleCorrectScore = useCallback((type: 'game' | 'gameSet' | 'matchSet', value: string) => handleCorrectScoreLocalRef.current(type, value), []);

  const handleUndoLocalRef = useRef<(() => void)>(() => {});
  const handleUndo = useCallback(() => handleUndoLocalRef.current(), []);

  const startGameLocalRef = useRef<((state: GameState) => void)>(() => {});
  const startGame = useCallback((state: GameState) => startGameLocalRef.current(state), []);

  const handleResetMatchLocalRef = useRef<(() => void)>(() => {});
  const handleResetMatch = useCallback(() => handleResetMatchLocalRef.current(), []);

  const initGameStateLocalRef = useRef<((forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => Promise<void>)>(async () => {});
  const initGameState = useCallback(async (forceNew: boolean, tournamentOverride?: { match: TournamentMatch, pair1: TournamentPair, pair2: TournamentPair, event: TournamentEvent }) => initGameStateLocalRef.current(forceNew, tournamentOverride), []);

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
      const justLostControl = (Date.now() - ctxLostControlAtRef.current) < 30000;
      // Grace period de 15s após assumir o controle.
      const justTookControl = (Date.now() - ctxTookControlAtRef.current) < 15000;

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
  }, [userProfile.email]);

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
        ctxSetCloudLiveExists(!cloudData.isLiveClosed);
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
        ctxSetCloudLiveExists(false);
        setIsWaitingSync(false);
      }
    });
    return () => unsubscribe();
  }, [currentScreen, initialSpectatorPin]);

  useEffect(() => {
    if (!navigator.onLine || !targetListenPin) return;
    // Visitante público tem seu próprio listener dedicado — não usar o listener principal
    if (currentScreen === 'public-scoreboard') return;
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

          // Só ignora o isLiveClosed se NÃO foi este device que iniciou o encerramento.
          // ctxIsClosingLiveRef é marcado true em handleCloseCloudLive antes do updateDoc,
          // garantindo que o owner não ignore o próprio sinal de encerramento.
          if (thisDeviceIsActiveOwner && !ctxIsClosingLiveRef.current) {
            console.log("[Sync] isLiveClosed: true ignorado — owner ativo local, provável artefato de reload.");
            return;
          }
          // Encerramento intencional confirmado — reset do ref.
          ctxIsClosingLiveRef.current = false;

          console.log("[Sync] Live fechada detected!");
          ctxSetCloudLiveExists(false);
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

        ctxSetCloudLiveExists(true);
        if (cloudData.commandOwnerId !== deviceId) {
          // Grace period: se este device acabou de assumir o controle (últimos 15s),
          // ignora snapshots que ainda não refletem o novo commandOwnerId — são writes
          // intermediários chegando fora de ordem (Write 1 chegou, Write 3 ainda não).
          // Sobrescrever o gameState aqui reverteria o handleControlLive.
          const justTookControl = (Date.now() - ctxTookControlAtRef.current) < 15000;
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
            ctxTookControlAtRef.current = Date.now();
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
            ctxLostControlAtRef.current = Date.now();
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
            if (p1Scored && !p2Scored) ctxSetFbSyncStatus({ team: 1, seq: pointSeq, isObserver: true });
            else if (p2Scored && !p1Scored) ctxSetFbSyncStatus({ team: 2, seq: pointSeq, isObserver: true });
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
            // Se este device perdeu o controle (era controller, agora não é mais):
            // volta para ScoreboardDisplay (isScoreboardMode: true), exceto se for relógio.
            const justLostControl = prev?.commandOwnerId === deviceId && cloudData.commandOwnerId !== deviceId;
            const isWatchMode = baseConfig.isWatchMode;
            const resolvedScoreboardMode = isWatchMode
              ? baseConfig.isScoreboardMode  // relógio: preserva modo atual
              : justLostControl
                ? true                        // perdeu controle → volta ao placar
                : baseConfig.isScoreboardMode; // demais: preserva preferência local
            return {
              ...cloudData,
              matchDuration: Math.max(prev?.matchDuration || 0, cloudData.matchDuration || 0),
              // Restaura os campos de proprietário travados após o spread do cloudData
              ownerPin: lockedOwnerPin,
              ownerDeviceId: lockedOwnerDeviceId,
              isMirroringActive: true,
              isLiveClosed: false,
              isConfirmedFinished: cloudData.isConfirmedFinished,
              matchConfig: {
                ...cloudData.matchConfig,
                isWatchMode: baseConfig.isWatchMode,
                isScoreboardMode: resolvedScoreboardMode,
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
          // Sincroniza matchSettings local quando device perde controle → volta a ser observer
          if (gameStateRef.current?.commandOwnerId === deviceId && cloudData.commandOwnerId !== deviceId) {
            const localWatchMode = matchSettingsRef.current.isWatchMode;
            if (!localWatchMode) setMatchSettings(prev => ({ ...prev, isScoreboardMode: true }));
          }
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
        // Correção 4: limpa o estado de live SEMPRE, independente dos flags locais
        // (isMirroringActive, isLiveClosed). O estado anterior pode estar inconsistente
        // — por exemplo, quando o encerramento veio direto pelo console do Firebase
        // sem passar pelo fluxo normal do app, ou quando o owner ainda tinha
        // isMirroringActive: false localmente mas cloudLiveExists: true.
        const prevGs = gameStateRef.current;
        const wasActiveLocally = prevGs?.isMirroringActive && !prevGs?.isLiveClosed;
        // Notifica observers que ainda não receberam o isLiveClosed (só se relevante)
        if (wasActiveLocally) {
          setModalConfig({
            title: 'Live encerrada',
            message: 'A transmissão foi encerrada pelo proprietário.',
            icon: <WifiOff className="text-slate-400 w-16 h-16" />,
            confirmLabel: 'Ok',
            onConfirm: () => setModalConfig(null)
          });
        }
        // Sempre limpa — independente de wasActiveLocally
        ctxIsClosingLiveRef.current = false;
        ctxSetCloudLiveExists(false);
        ctxSetActiveLives([]);
        setGameState(prev => {
          if (!prev) return null;
          return { ...prev, isMirroringActive: false, isLiveClosed: true };
        });
      }
    });
    return () => unsubscribe();
  // targetListenPin é reativo (useMemo sobre activeLives) — quando o PIN alvo muda
  // (ex: judge adicionado, live nova detectada), o listener é recriado automaticamente.
  // deviceId permanece para garantir que o guard de ownership funcione corretamente.
  }, [targetListenPin, deviceId, currentScreen]);

  const prevIsCommandOwner = useRef(isCommandOwner);
  const prevCommandOwnerIdWasSelf = useRef(gameState?.commandOwnerId === deviceId);
  useEffect(() => {
    // Só dispara se este device REALMENTE tinha o commandOwnerId antes —
    // isCommandOwner é true também quando !isMirroringActive, o que causava
    // falso positivo quando o celular recebia a live pela primeira vez.
    const hadControl = prevCommandOwnerIdWasSelf.current;
    const hasControl = gameState?.commandOwnerId === deviceId;
    if (hadControl && !hasControl && gameState?.isMirroringActive && !(gameState.isMirroringActive && gameState.isLiveClosed)) {
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
    const db = getDb();
    if (!db) return;
    
    const subscribeToLives = () => {
      if (!navigator.onLine) {
        ctxSetActiveLives([]);
        return () => {};
      }
      const q = query(collection(db, "live_matches"), where("isLiveClosed", "==", false));
      return onSnapshot(q, (snap) => {
        const lives: GameState[] = [];
        snap.forEach(d => lives.push(d.data() as GameState));
        ctxSetActiveLives(lives);
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
    ctxSetCloudLiveExists(hasAnyLive);

    // Proteção contra latência do Firebase: quando activeLives fica vazio
    // momentaneamente (ex: reload do app, reconexão), aguardamos 3s antes
    // de concluir que não há mais live e desativar o mirroring local.
    // Se activeLives voltar a ter entradas dentro desse tempo, o timer é cancelado.
    // Guard extra: se este device acabou de assumir o controle (grace period de 15s),
    // não desativa — o Firebase ainda pode estar propagando o novo commandOwnerId.
    const justTookControlRecently = (Date.now() - ctxTookControlAtRef.current) < 15000;
    if (!hasAnyLive && gameState?.isMirroringActive && !justTookControlRecently) {
      const debounceTimer = setTimeout(() => {
        // Re-verifica o grace period dentro do timeout — pode ter assumido controle nesse intervalo
        if ((Date.now() - ctxTookControlAtRef.current) < 15000) return;
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
    const justTookControl = (Date.now() - ctxTookControlAtRef.current) < 15000;
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

  // O timer de 1 segundo (matchDuration) foi removido.
  // A duração da partida agora é baseada em timestamp (startTime, lastPauseTime, accumulatedPausedTime)
  // calculada na hora da exibição (ScoreboardScreen e ScoreboardDisplay).

  const lastSeenUpdateRef = useRef<number>(0);
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => {
    if (gameState) {
      try { localStorage.setItem('myPlacarActiveGameState', JSON.stringify(gameState)); } catch {}
      
      if (gameState.isMirroringActive && userProfile.email && !(gameState.isMirroringActive && gameState.isLiveClosed) && navigator.onLine) {
        const db = getDb();
        if (db) {
            // ── Determina papel deste device ────────────────────────────────
            const isThisDeviceController = gameState.commandOwnerId === deviceId;

            // Guard duplo (escrita de estado de partida — apenas o controller):
            // Só escreve placar/histórico se AMBOS local e Firebase confirmam este
            // device como controller, ou se acabou de assumir (grace period).
            const isConfirmedControllerInCloud = activeLives.some(l => l.commandOwnerId === deviceId);
            const isConfirmedControllerLocal = isThisDeviceController;
            const justTookControl = (Date.now() - ctxTookControlAtRef.current) < 15000;
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
                    if (isMatchStateChange && ctxLastFbScoreKeyRef.current && ctxLastFbScoreKeyRef.current !== curScoreKey) {
                      const parts = ctxLastFbScoreKeyRef.current.split('_');
                      const prevP1Games = parseInt(parts[1]);
                      const prevP2Games = parseInt(parts[3]);
                      const p1Scored = gameState.p1.games > prevP1Games || (gameState.p1.games === prevP1Games && gameState.p1.score !== parts[0]);
                      const p2Scored = gameState.p2.games > prevP2Games || (gameState.p2.games === prevP2Games && gameState.p2.score !== parts[2]);
                      // seq = índice do último ponto no pointHistory (igual ao número visível no Firestore)
                      const pointSeq = gameState.pointHistory?.length ?? 0;
                      if (p1Scored && !p2Scored) ctxSetFbSyncStatus({ team: 1, seq: pointSeq, isObserver: false });
                      else if (p2Scored && !p1Scored) ctxSetFbSyncStatus({ team: 2, seq: pointSeq, isObserver: false });
                    }
                    ctxLastFbScoreKeyRef.current = curScoreKey;

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
    if (ctxFbSyncTimerRef.current) clearTimeout(ctxFbSyncTimerRef.current);
    ctxFbSyncTimerRef.current = setTimeout(() => ctxSetFbSyncStatus(null), 2500);
    return () => { if (ctxFbSyncTimerRef.current) clearTimeout(ctxFbSyncTimerRef.current); };
  }, [fbSyncStatus]);

  // ── Observer: ativa modo placar automaticamente ao entrar na live ────────────
  // Guards:
  //   1. cloudLiveExists confirmado — evita ativar durante latência do onSnapshot
  //   2. Não é ownerDeviceId de nenhuma live — evita ativar no owner durante flutuação de livePapel
  //   3. Não é controller ativo — evita sobrescrever isScoreboardMode:false de quem controla
  //   4. ctxHasAutoEnabledScoreboardRef — evita dupla ativação na mesma sessão
  useEffect(() => {
    const thisDeviceIsOwnerOfAnyLive = activeLives.some(l => l.ownerDeviceId === deviceId);
    const thisDeviceIsActiveController = activeLives.some(l => l.commandOwnerId === deviceId);
    if (
      !thisDeviceIsOwnerOfAnyLive &&
      !thisDeviceIsActiveController &&
      cloudLiveExists &&
      !ctxHasAutoEnabledScoreboardRef.current
    ) {
      ctxHasAutoEnabledScoreboardRef.current = true;
      setMatchSettings(prev => ({ ...prev, isScoreboardMode: true }));
      setGameState(prev => {
        if (!prev) return prev;
        return { ...prev, matchConfig: { ...prev.matchConfig, isScoreboardMode: true } };
      });
    }
    // Reset do ref: so quando device passa a ser owner ou controller ativo
    if (thisDeviceIsOwnerOfAnyLive || thisDeviceIsActiveController) ctxHasAutoEnabledScoreboardRef.current = false;
  }, [cloudLiveExists, activeLives, deviceId]);

  // ── matchHistory — espelho do GameContext ────────────────────────────────
  // Estado vive no <GameProvider>. Espelho necessário: consumido como trigger
  // reativo nos useEffect de sync (matchHistory.length nas deps — linhas ~1981 e ~2027).
  // SettingsScreen migrada para useGame(). handleExportData migrado para matchHistoryRef.current.
  // Remoção completa do espelho aguarda extração dos useEffect de sync para o GameContext.
  const [matchHistory, setMatchHistoryLocal] = useState<MatchHistoryItem[]>([]);
  const setMatchHistoryLocalRef = useRef(setMatchHistoryLocal);
  setMatchHistoryLocalRef.current = setMatchHistoryLocal;
  const ctxSetMatchHistoryRef = useRef<React.Dispatch<React.SetStateAction<MatchHistoryItem[]>>>(() => {});
  const setMatchHistory = useCallback<React.Dispatch<React.SetStateAction<MatchHistoryItem[]>>>(
    (v) => { ctxSetMatchHistoryRef.current(v); setMatchHistoryLocalRef.current(v); }, []
  );

  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [adminTab, setAdminTab] = useState<AdminTab>('configs');
  const [focusMatchId, setFocusMatchId] = useState<string | null>(null);

  const ctxPersistHistoryRef = useRef<(newList: MatchHistoryItem[]) => void>(() => {});
  const persistHistory = useCallback((newList: MatchHistoryItem[]) => {
    ctxPersistHistoryRef.current(newList);
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
    const data = { profile: userProfile, history: matchHistoryRef.current, settings: matchSettings, partners, playerQueue, exportDate: new Date().toISOString(), appVersion: LOCAL_CODE_VERSION };
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
    } catch (e) {
      console.warn('[sync] fetchCloudHistoryCount falhou:', e);
    }
  }, [userProfile.email]);

  // Dispara apenas após o Firebase Auth ter restaurado a sessão (authReady),
  // evitando que o getDocs seja bloqueado por request.auth == null no celular.
  useEffect(() => {
    if (authReady && userProfile.email) fetchCloudMatchesCount(true);
  }, [authReady, userProfile.email, matchHistory.length, fetchCloudMatchesCount]);

  // Retry: quando authReady vira true e o count ainda está em 0, tenta novamente.
  // Cobre o caso em que o fetch disparou antes do Auth estar pronto e foi bloqueado.
  useEffect(() => {
    if (!authReady || !userProfile.email || !navigator.onLine) return;
    if (cloudMatchesCount === 0) {
      const timer = setTimeout(() => fetchCloudMatchesCount(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [authReady, userProfile.email, cloudMatchesCount, fetchCloudMatchesCount]);

  const syncHistoryToFirebase = useCallback(async (forcedHistory?: MatchHistoryItem[], forceAll = false) => {
    if (!navigator.onLine) return;
    const db = getDb();
    const cleanEmail = userProfile.email?.toLowerCase().trim();
    if (!db || !cleanEmail) return;
    const baseList = forcedHistory || [...matchHistoryRef.current];
    // forceAll: reseta isSynced para garantir reenvio mesmo de itens marcados como
    // sincronizados mas ausentes na nuvem (ex: falha de rede após marcação local).
    const currentList = forceAll
      ? baseList.map(item => ({ ...item, isSynced: false }))
      : baseList;
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
    } catch (e) {
      console.warn('[sync] syncHistoryToFirebase falhou:', e);
    } finally { 
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
        persistHistory(updatedHistory);
      }
      // Sempre recalcula o count após tentativa de download —
      // evita count zerado manualmente quando o download é parcial ou vazio.
      await fetchCloudMatchesCount(true);
    } catch (e) {
      console.warn('[sync] downloadHistoryFromFirebase falhou:', e);
    } finally { setIsDownloading(false); }
  }, [userProfile.email, persistHistory, fetchCloudMatchesCount]);

  const canStartMatch = useMemo(() => {
    const s = matchSettings;
    if (!s.isDoubles) return s.p1Name.trim().length > 0 && s.p2Name.trim().length > 0;
    return s.p1Name.trim().length > 0 && (s.p1Partner || '').trim().length > 0 && s.p2Name.trim().length > 0 && (s.p2Partner || '').trim().length > 0;
  }, [matchSettings]);




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





  const handleSelectJudgeFromPartners = (partner: Partner) => {
    setJudgePinInput(partner.pin || '');
    setJudgeNicknameLookup(partner.nickname);
    setIsSelectingJudge(false);
    setCurrentScreen('scoreboard');
  };

  // Popula o ref usado pelo activeLives effect (declarado antes desta função)
  // para auto-join como observer sem modal.
  autoJoinObserverRef.current = (pin: string) => handleObserveLive(pin);



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
    setGameState(null); setUserProfile({ name: '', nickname: '', email: '', phone: '', pin: '', isProfileComplete: false }); setMatchSettings({ ...DEFAULT_TENNIS_SETTINGS, isHistoryEnabled: true }); setMatchHistory([]); setPartners([]); ctxSetCloudLiveExists(false); setIsWaitingSync(false); setActiveEvent(null); setRegisteredEvents([]);
    try {
      localStorage.removeItem('myPlacarUserProfile'); localStorage.removeItem('myPlacarActiveGameState'); localStorage.removeItem('myPlacarHistory'); localStorage.removeItem('myPlacarPartners'); localStorage.removeItem('myPlacarAssets'); localStorage.removeItem('myPlacarSettings'); localStorage.removeItem('myPlacar_DataVersion'); localStorage.removeItem('myPlacarPendingReferral'); localStorage.removeItem('myPlacarPendingReferralPin'); localStorage.removeItem('myPlacarPlayerQueue'); localStorage.removeItem('myPlacarActiveEvent'); localStorage.removeItem('myPlacarRegisteredEvents');
      Object.keys(localStorage).forEach(key => { if (key.startsWith('myPlacar_SavedSettings_')) localStorage.removeItem(key); });
    } catch {}
    setCurrentScreen('auth'); setIsRecoveryFromMatchOver(false); globalThis.history.replaceState({}, document.title, globalThis.location.pathname);
    setIsMenuOpen(false);
    setModalConfig({ title: "Sessão finalizada", message: "Limpando dados da sessão anterior.", variant: 'success', icon: <CheckCircle className="text-green-500 w-16 h-16" />, onConfirm: () => setModalConfig(null) });
    setTimeout(() => setModalConfig(null), 2500);
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

  const handleTogglePause = useCallback(() => {
    const isCommandOwner = !gameState?.isMirroringActive || gameState?.commandOwnerId === deviceId;
    if(!gameState || gameState.isConfirmedFinished || gameState.isMatchOver || (gameState.isMirroringActive && gameState.isLiveClosed) || !isCommandOwner) return; 
    setGameState(p => {
      if (!p) return null;
      const isNowPaused = !p.isPaused;
      const now = Date.now();
      if (isNowPaused) {
        return { ...p, isPaused: true, lastPauseTime: now };
      } else {
        const pausedDuration = p.lastPauseTime ? now - p.lastPauseTime : 0;
        return { 
          ...p, 
          isPaused: false, 
          accumulatedPausedTime: (p.accumulatedPausedTime || 0) + pausedDuration,
          lastPauseTime: undefined
        };
      }
    }); 
  }, [gameState, deviceId, setGameState]);

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





  return (
      <LiveProvider
        deviceId={deviceId}
        userProfile={userProfile}
        gameState={gameState}
        gameStateRef={gameStateRef}
      >
        {/* LiveBridge: chama useLive() dentro do provider e injeta os valores */}
        <LiveBridge onReady={handleLiveReady} onUpdate={handleLiveUpdate} />
      {/* ─── GameProvider (Fase 2) ──────────────────────────────────────────────
          Estados declarados no AppInner são repassados como props.
          Nenhum consumidor usa o contexto ainda — isso ocorre a partir da Fase 3.
          Fase 4: os useState/useRef serão movidos para dentro do provider
          e estas props serão removidas. */}
      {/* ─── GameBridge: chama useGame() dentro do provider e injeta userProfile ──
           Necessário porque o <GameProvider> está dentro do AppInner — não é possível
           chamar useGame() no topo do componente pai. Padrão idêntico ao LiveBridge.
           Passo 4.1: userProfile/setUserProfile. Passo 4.2: partners/setPartners. */}
      <GameProvider>
        <GameBridge
          onReady={(ctx) => {
            ctxSetUserProfileRef.current = ctx.setUserProfile;
            setUserProfileLocalRef.current(ctx.userProfile);
            ctxSetPartnersRef.current = ctx.setPartners;
            setPartnersLocalRef.current(ctx.partners);
            ctxSetMatchSettingsRef.current = ctx.setMatchSettings;
            setMatchSettingsLocalRef.current(ctx.matchSettings);
            ctxSetGameStateRef.current = ctx.setGameState;
            setGameStateLocalRef.current(ctx.gameState);
            ctxSetMatchHistoryRef.current = ctx.setMatchHistory;
            setMatchHistoryLocalRef.current(ctx.matchHistory);
            ctxPersistHistoryRef.current = ctx.persistHistory;
            _ctxMatchHistoryRefTarget.current = ctx.matchHistoryRef;
            handleLeaveLiveLocalRef.current = ctx.handleLeaveLive;
            finalizeMatchInternalLocalRef.current = ctx.finalizeMatchInternal;
            handleCloseCloudLiveLocalRef.current = ctx.handleCloseCloudLive;
            handleDeleteJudgeLocalRef.current = ctx.handleDeleteJudge;
            handleControlLiveLocalRef.current = ctx.handleControlLive;
            handleObserveLiveLocalRef.current = ctx.handleObserveLive;
            handleSyncScoreboardLocalRef.current = ctx.handleSyncScoreboard;
            handleAddJudgeLocalRef.current = ctx.handleAddJudge;
            handleSaveProfileLocalRef.current = ctx.handleSaveProfile;
            setHistoryStackLocalRef.current = ctx.setHistoryStack;
            handleScoreUpdateLocalRef.current = ctx.handleScoreUpdate;
            handleCorrectScoreLocalRef.current = ctx.handleCorrectScore;
            handleUndoLocalRef.current = ctx.handleUndo;
            startGameLocalRef.current = ctx.startGame;
            handleResetMatchLocalRef.current = ctx.handleResetMatch;
            initGameStateLocalRef.current = ctx.initGameState;
          }}
          onUpdate={(ctx) => {
            setUserProfileLocalRef.current(ctx.userProfile);
            setPartnersLocalRef.current(ctx.partners);
            setMatchSettingsLocalRef.current(ctx.matchSettings);
            setGameStateLocalRef.current(ctx.gameState);
            setMatchHistoryLocalRef.current(ctx.matchHistory);
          }}
        />
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
        const liveAtiva = gameState?.isMirroringActive && !(gameState.isMirroringActive && gameState.isLiveClosed) && !gameState.isConfirmedFinished;
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
        ctxSetCloudLiveExists(false);
        ctxSetActiveLives(prev => prev.filter(l => l.ownerPin?.toUpperCase() !== targetPin));
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
      {currentScreen === 'tournaments' && <TournamentsScreen registrations={registeredEvents} onBack={() => setCurrentScreen('settings')} onJoin={handleJoinTournament} onSelectEvent={(ev) => { setActiveEvent(ev as unknown as TournamentEvent); setCurrentScreen('event-detail'); }} />}
      {currentScreen === 'event-detail' && activeEvent && <EventDetailScreen appUrl={appUrl} event={activeEvent} onBack={() => setCurrentScreen('tournaments')} userProfile={userProfile} onExitTournament={handleExitTournament} onAddPartner={handleAddTournamentPartner} partners={partners} onStartTournamentMatch={(match, pair1, pair2, ev) => initGameState(true, { match, pair1, pair2, event: ev })} setModalConfig={setModalConfig} />}
      {currentScreen === 'communications' && <CommunicationsScreen onBack={() => setCurrentScreen('settings')} />}
    </div>
      </GameProvider>
      </LiveProvider>
  );
};

// ─── GameBridge ──────────────────────────────────────────────────────────────
// Componente filho do <GameProvider>. Chama useGame() e repassa os valores ao
// AppInner via dois callbacks — padrão idêntico ao LiveBridge.
//   onReady  — chamado 1x na montagem: injeta setters reais do contexto nos refs.
//   onUpdate — chamado a cada mudança: sincroniza estados espelho locais.
interface GameBridgeProps {
  onReady: (ctx: ReturnType<typeof useGame>) => void;
  onUpdate: (ctx: ReturnType<typeof useGame>) => void;
}
const GameBridge: React.FC<GameBridgeProps> = ({ onReady, onUpdate }) => {
  const ctx = useGame();
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  useEffect(() => {
    onReadyRef.current(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    onUpdateRef.current(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.userProfile, ctx.partners, ctx.matchSettings, ctx.gameState, ctx.matchHistory]);
  return null;
};

// ─── LiveBridge ───────────────────────────────────────────────────────────────
// Componente filho do <LiveProvider>. Chama useLive() e repassa os valores ao
// AppInner via dois callbacks:
//   onReady  — chamado 1x na montagem: injeta setters, refs e valores iniciais.
//   onUpdate — chamado a cada render: sincroniza valores computados reativos
//              (livePapel, isActiveController, etc.) com os estados espelho locais.
interface LiveBridgeProps {
  onReady: (ctx: ReturnType<typeof useLive>) => void;
  onUpdate: (ctx: ReturnType<typeof useLive>) => void;
}
const LiveBridge: React.FC<LiveBridgeProps> = ({ onReady, onUpdate }) => {
  const ctx = useLive();
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  // onReady: apenas na montagem — injeta setters/refs estáveis
  useEffect(() => {
    onReadyRef.current(ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // onUpdate: a cada render do bridge (= a cada mudança no contexto)
  // Chamado via useEffect com ctx nas deps para evitar updates síncronos durante render
  useEffect(() => {
    onUpdateRef.current(ctx);
  // Os valores computados (livePapel, isActiveController, etc.) mudam junto com ctx
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.livePapel, ctx.liveStatus, ctx.isOriginalOwner, ctx.isActiveController,
      ctx.isCurrentController, ctx.isCommandOwner, ctx.indicatorRole,
      ctx.isJudgeOnline, ctx.isOwnerOnline, ctx.resolveTargetPin,
      ctx.activeLives, ctx.cloudLiveExists, ctx.liveLogs, ctx.fbSyncStatus]);
  return null;
};

// ─── App (root mínimo) ────────────────────────────────────────────────────────
// Só monta o ErrorBoundary e o AppInner. O <LiveProvider> está dentro do
// AppInner para que os estados (gameState, userProfile, etc.) já existam
// quando o provider for montado.
const App: React.FC = () => (
  <ErrorBoundary>
    <UIProvider initialScreen={getInitialScreen()}>
      <AppInner />
    </UIProvider>
  </ErrorBoundary>
);

export default App;
