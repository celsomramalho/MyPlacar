import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Mic, Undo, Settings, Pause, Play, VolumeX, User, Zap, Activity, X as CloseIcon, Trophy, Loader2, CheckCircle2, AlertCircle, X, Share2, QrCode, Copy, Globe, Edit3, Watch, RotateCcw, CheckCircle, Check, Wifi, MonitorSmartphone, ChevronDown, ChevronUp, ListTodo, ShieldCheck, Eye, WifiOff, Gavel, Trash2, Users, Smartphone, Monitor, Laptop, Crown, UserPlus, Gamepad2, RefreshCw, SquareKanban, Cast, Menu, ArrowRightLeft } from 'lucide-react';
import { getDeviceType } from '@shared/utils/device';
import { copyToClipboard } from '@shared/utils/clipboard';
import { Button } from '@shared/components/Button';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';
import { Input } from '@shared/components/Input';
import { GameState, PointType, PointEvent, Tab } from '../../../types';
import { useGeminiReferee } from '../presentation/hooks/useGeminiReferee';
import { getSharedAudioContext, playErrorBeep, unlockAudio, useScoreAnnouncer } from '../presentation/hooks/useScoreAnnouncer';
import { usePickleballAnnouncer } from '../presentation/hooks/usePickleballAnnouncer';
import { useMatchTimer } from '../presentation/hooks/useMatchTimer';
import { getTennisServerSide, isTennisTieBreak } from '@modules/game/domain/tennisEngine';
import { isWatchDevice } from '@shared/utils/device';
import { SPORT_LIST } from '../../../constants';
import { getDb } from '@infra/firebase';
import { doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { LazySportIcon } from '@shared/components/LazySportIcon';
import { LiveIndicator } from '@modules/live';
import { applyGoldenRule, maskPin } from '@shared/utils/formatters';
import { WatchBoard } from '../presentation/components/WatchBoard';
import { useLive } from '@modules/live';
import { useGame } from '@modules/game';
import { ScoreboardDisplay } from '../presentation/components/ScoreboardDisplay';
import { PickleballCourtView } from '../presentation/components/PickleballCourtView';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { useLocalSyncIntegration, LocalPairingModal, LocalControllerView, LocalMirrorInput, LocalSyncBadge } from '@modules/localSync';

interface CommandLogEntry {
  id: string;
  startTime: string;
  before: string;
  after: string;
  text: string;
  latency: number;
  timestamp: number;
  isError?: boolean;
  winner?: 1 | 2;
  isRemote?: boolean;
  liveSequence?: number;
  liveId?: number;
  source: string;
}

type LiveLogType =
  | 'live_created'
  | 'control_taken'
  | 'match_started'
  | 'score'
  | 'participant_join'
  | 'participant_leave'
  | 'match_over'
  | 'match_confirmed'
  | 'fb_ack'
  | 'observers_ack'
  | 'live_closed'
  | 'judge_added'    // D3: juiz adicionado
  | 'judge_removed'  // D3: juiz removido
  | 'new_match'      // D3: nova partida iniciada na live
  | 'match_reset';   // D3: partida zerada

interface LiveLogEntry {
  id: string;
  time: string;
  timestamp: number;
  type: LiveLogType;
  text: string;
  ok?: boolean;
  // Campos para composição de ícones em eventos de participante
  deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop';
  participantRole?: 'owner' | 'judge' | 'observer';
  isController?: boolean;
}

interface Props {
  onScoreUpdate: (player: 1 | 2, type?: PointType, source?: string) => void;
  onUndo: () => void;
  onSwitchServer: (team: 1 | 2, isPartner: boolean) => void;
  onSwapSides?: (team: 1 | 2) => void;
  onToggleGender?: (team: 1 | 2, isPartner: boolean) => void;
  onTogglePause?: () => void;
  onBack: () => void;
  onHome: () => void;
  onNavigateToTab?: (tab: Tab) => void;
  isSettingsInicialSaved: boolean;
  isSettingsRegrasSaved: boolean;
  onToggleMirroring: (active: boolean) => void;
  onToggleWatchMode?: () => void;
  onToggleLiveCollapse?: (isCollapsed: boolean) => void;
  onCorrectScore?: (type: 'game' | 'gameSet' | 'matchSet', value: string) => void;
  isAdmin?: boolean;
  onConfirmMatch?: () => void;
  isRecoveryFromMatchOver?: boolean;
  currentDeviceId?: string;
  currentDeviceFullLabel?: string;
  onOpenLiveControl?: () => void;
  onSyncScoreboard?: () => Promise<void>;
  onResetMatch?: () => void;
  onOpenMenu?: () => void;
  isOfflineMode?: boolean;
  onExitOffline?: () => void;
  appUrl: string;
  judgePinInput?: string;
  setJudgePinInput?: (val: string) => void;
  isSearchingJudgePin?: boolean;
  judgeNicknameLookup?: string;
  isSavingJudge?: boolean;
  onAddJudge?: () => void;
  onDeleteJudge?: () => void;
  onDeleteLive?: () => void;
  isJudgeOnline?: boolean;
  onSelectJudgeFromPartners?: () => void;
  voiceLogs?: {id: string, startTime: string, before: string, after: string, text: string, latency: number, timestamp: number, isError?: boolean, winner?: 1 | 2, isRemote?: boolean, liveSequence?: number, liveId?: number, source: string}[];
  setVoiceLogs?: (logs: any[] | ((prev: any[]) => any[])) => void;
  onToggleScoreboardMode?: () => void;
}

const SOLID_COLORS: Record<string, string> = {
  amarelo: 'bg-yellow-500 text-white',
  azul: 'bg-blue-600 text-white',
  laranja: 'bg-orange-500 text-white',
  marrom: 'bg-amber-800 text-white',
  lilas: 'bg-violet-500 text-white',
  verde: 'bg-green-600 text-white',
  vermelho: 'bg-red-600 text-white',
  roxo: 'bg-purple-600 text-white',
};

const BORDER_COLORS: Record<string, string> = {
  amarelo: 'border-yellow-500',
  azul: 'border-blue-600',
  laranja: 'border-orange-500',
  marrom: 'border-amber-800',
  lilas: 'border-violet-500',
  verde: 'border-green-600',
  vermelho: 'border-red-600',
  roxo: 'border-purple-600',
};

const TEXT_COLORS: Record<string, string> = {
  azul: 'text-blue-600',
  vermelho: 'text-red-600',
  verde: 'text-green-600',
  amarelo: 'text-yellow-600',
  laranja: 'text-orange-600',
  lilas: 'text-violet-600',
  marrom: 'text-amber-800',
  roxo: 'text-purple-600',
};

const FB_ACK_MARK_SECONDS = Array.from({ length: 11 }, (_, index) => (index + 1) * 5);

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const ScorePickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (val: string) => void;
  title: string;
  options: string[];
  initialValue: string;
  isWatchMode?: boolean;
}> = ({ isOpen, onClose, onConfirm, title, options, initialValue, isWatchMode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const idx = options.indexOf(initialValue);
      if (idx !== -1) {
        setSelectedIndex(idx);
        setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = idx * 60; }, 60);
      }
    }
  }, [isOpen, options, initialValue]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const idx = Math.round(top / 60);
    if (idx !== selectedIndex && idx >= 0 && idx < options.length) {
      setSelectedIndex(idx);
      if (navigator.vibrate) navigator.vibrate(5);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className={`bg-[#1e293b] rounded-[2.5rem] w-full shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in zoom-in duration-300 ${isWatchMode ? 'h-full max-w-full' : 'max-w-xs h-[420px]'}`}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-white font-black text-lg tracking-tight truncate pr-4">{title}</h3>
          <button onClick={onClose} className="p-2 text-gray-400 active:scale-90 transition-transform"><X size={24}/></button>
        </div>
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-x-0 h-[60px] top-1/2 -translate-y-1/2 bg-white/10 pointer-events-none border-y border-white/20 z-20" />
          <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto no-scrollbar snap-y snap-mandatory z-10 flex flex-col items-center">
            <div className="h-[calc(50%-30px)] w-full shrink-0" />
            {options.map((opt, i) => (
              <div key={i} className={`h-[60px] w-full flex items-center justify-center snap-center transition-all duration-200 shrink-0 ${selectedIndex === i ? 'text-orange-500 scale-125 font-black text-5xl' : 'text-gray-500 font-bold text-2xl opacity-40'}`}>
                {opt}
              </div>
            ))}
            <div className="h-[calc(50%-30px)] w-full shrink-0" />
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4 border-t border-white/5 bg-black/20">
          <button onClick={onClose} className="py-4 bg-white/5 text-gray-400 rounded-2xl font-black text-xs tracking-widest active:scale-95 transition-all">Cancelar</button>
          <button onClick={() => onConfirm(options[selectedIndex])} className="py-4 bg-orange-600 text-white rounded-2xl font-black text-xs tracking-widest shadow-lg active:scale-95 transition-all">Ok</button>
        </div>
      </div>
    </div>
  );
};

type MatchTimelineElement =
  | { type: 'set-marker'; setNumber: number }
  | { type: 'score-start' }
  | { type: 'point'; winner: 1 | 2; pointType: PointType }
  | { type: 'game-score'; winner: 1 | 2; g1: number; g2: number }
  | { type: 'set-score'; winner: 1 | 2; s1: number; s2: number };

export const MatchTimeline: React.FC<{ history: PointEvent[]; p1Sets: number[]; p2Sets: number[]; isMatchOver?: boolean; p1Color?: string; p2Color?: string }> = ({ history, p1Sets, p2Sets, isMatchOver, p1Color, p2Color }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) { scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; } }, [history]);
  const timelineElements = useMemo(() => {
    const elements: MatchTimelineElement[] = [];
    if (!history) return elements;
    
    // Initial set marker and start score
    elements.push({ type: 'set-marker', setNumber: 1 });
    elements.push({ type: 'score-start' });

    const setsP1 = p1Sets || [];
    const setsP2 = p2Sets || [];
    let setCounter = 0;
    history.forEach((event) => {
      elements.push({ type: 'point', winner: event.winner, pointType: event.type });
      if (event.resultingScore) {
        const [g1Str, g2Str] = event.resultingScore!.split('-');
        const g1 = Number(g1Str);
        const g2 = Number(g2Str);
        elements.push({ type: 'game-score', winner: event.winner, g1, g2 });
        if (setCounter < setsP1.length) {
          if (g1 === setsP1[setCounter] && g2 === setsP2[setCounter]) {
            setCounter++;
            elements.push({ type: 'set-score', winner: event.winner, s1: setsP1.slice(0, setCounter).filter((s, i) => s > (setsP2[i] ?? 0)).length, s2: setsP2.slice(0, setCounter).filter((s, i) => s > (setsP1[i] ?? 0)).length });
            
            // Add next set marker if match is not over
            if (!isMatchOver) {
              elements.push({ type: 'set-marker', setNumber: setCounter + 1 });
              elements.push({ type: 'score-start' });
            }
          }
        }
      }
    });
    return elements;
  }, [history, p1Sets, p2Sets, isMatchOver]);

  return (
    <div className="w-full overflow-hidden">
       <div ref={scrollRef} className="flex-1 overflow-x-auto py-2 timeline-scrollbar scroll-smooth no-scrollbar">
           <div className="flex items-start gap-1 min-w-max px-2 relative h-20 pt-4">
             <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-gray-50 -translate-y-1/2" />
             {timelineElements.map((el, idx) => {
               if (el.type === 'set-marker') return (
                 <div key={idx} className="relative flex flex-col items-center justify-center px-2 shrink-0 z-20">
                   <div className="bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                     <span className="text-[9px] font-black text-slate-600 whitespace-nowrap">Set {el.setNumber}</span>
                   </div>
                 </div>
               );
               if (el.type === 'score-start') return (
                 <div key={idx} className="relative flex flex-col items-center justify-start shrink-0 mx-2 z-10">
                    <div className={`flex flex-col items-center justify-center min-w-[24px] h-[38px] rounded-lg border bg-opacity-30 shadow-xs ${BORDER_COLORS[p1Color || 'azul']} ${p1Color === 'amarelo' ? 'bg-yellow-50' : p1Color === 'verde' ? 'bg-green-50' : 'bg-blue-50'}`}>
                       <span className={`text-[10px] font-black ${TEXT_COLORS[p1Color || 'azul']}`}>0</span>
                       <span className="text-[10px] font-black text-gray-400">0</span>
                    </div>
                 </div>
               );
               if (el.type === 'point') return (
                <div key={idx} className="relative flex flex-col items-center justify-center w-6 shrink-0 z-10 pt-2.5">
                  <div className={`transition-transform ${el.winner === 1 ? '-translate-y-4' : 'translate-y-4'}`}>
                    {el.pointType === 'rally' && <div className="w-3 h-3 rounded-full bg-[#d9f99d] border border-green-300 shadow-sm" />}
                    {el.pointType === 'ace' && <Zap size={14} className="text-amber-400" fill="currentColor" />}
                    {el.pointType === 'fault' && <CloseIcon size={16} className="text-red-400 stroke-[4]" />}
                  </div>
                </div>
               );
               if (el.type === 'game-score') return <div key={idx} className="relative flex flex-col items-center justify-start shrink-0 mx-1 z-20"><div className={`flex flex-col items-center justify-center min-w-[22px] h-[36px] rounded-lg border shadow-sm ${el.winner === 1 ? `${p1Color === 'amarelo' ? 'bg-yellow-50' : 'bg-blue-50'} ${BORDER_COLORS[p1Color || 'azul']}` : `${p2Color === 'vermelho' ? 'bg-red-50' : 'bg-slate-50'} ${BORDER_COLORS[p2Color || 'vermelho']}`}`}><span className={`text-[10px] font-black leading-none mb-0.5 ${el.winner === 1 ? TEXT_COLORS[p1Color || 'azul'] : 'text-gray-400'}`}>{el.g1}</span><span className={`text-[10px] font-black leading-none mt-0.5 ${el.winner === 2 ? TEXT_COLORS[p2Color || 'vermelho'] : 'text-gray-400'}`}>{el.g2}</span></div></div>;
               if (el.type === 'set-score') return <div key={idx} className="relative flex flex-col items-center justify-start shrink-0 ml-1 mr-2 z-20 animate-in zoom-in duration-300"><div className={`flex flex-col items-center justify-center min-w-[26px] h-[40px] rounded-lg border shadow-md ${el.winner === 1 ? `${p1Color === 'amarelo' ? 'bg-yellow-100' : 'bg-blue-100'} ${BORDER_COLORS[p1Color || 'azul']}` : `${p2Color === 'vermelho' ? 'bg-red-100' : 'bg-slate-100'} ${BORDER_COLORS[p2Color || 'vermelho']}`}`}><span className={`text-[11px] font-black leading-none mb-0.5 ${el.winner === 1 ? TEXT_COLORS[p1Color || 'azul'] : 'text-gray-600'}`}>{el.s1}</span><span className={`text-[11px] font-black leading-none mt-0.5 ${el.winner === 2 ? TEXT_COLORS[p2Color || 'vermelho'] : 'text-gray-600'}`}>{el.s2}</span></div><div className="absolute -bottom-4 text-[7px] font-black text-gray-400 tracking-tighter">Set</div></div>;
               return null;
             })}
           </div>
         </div>
    </div>
  );
};

export const ScoreboardScreen: React.FC<Props> = (props) => {
  const { onScoreUpdate, onUndo, onSwitchServer, onSwapSides, onToggleGender, onTogglePause, onBack, onHome, onNavigateToTab, isSettingsInicialSaved, isSettingsRegrasSaved, onToggleMirroring, onToggleWatchMode, onCorrectScore, isAdmin, onConfirmMatch, isRecoveryFromMatchOver, currentDeviceId, currentDeviceFullLabel, onOpenLiveControl, onSyncScoreboard, onResetMatch, onOpenMenu, isOfflineMode, onExitOffline, appUrl, judgePinInput, setJudgePinInput, isSearchingJudgePin, judgeNicknameLookup, isSavingJudge, onAddJudge, onDeleteJudge, isJudgeOnline, onSelectJudgeFromPartners, voiceLogs, setVoiceLogs, onDeleteLive, onToggleScoreboardMode } = props;

  // ── Contexto Game (Passo 3.2 ✅) ──────────────────────────────────────────
  // gameState lido exclusivamente do GameContext.
  // Props gameState e userProfile removidas da interface e das chamadas no App.tsx.
  const gameCtx = useGame();
  const effectiveGameState = gameCtx.gameState!;

  // Detecta modo público diretamente pela URL — independente de props/minificação
  const isPublicView = new URLSearchParams(window.location.search).get('viewMode') === 'scoreboard';

  // ── Contexto Live ─────────────────────────────────────────────────────────
  // Passo 5.3: props Live removidas — lê exclusivamente do LiveContext.
  const liveCtx = useLive();

  const effectiveCloudLiveExists = liveCtx.cloudLiveExists && !isOfflineMode;
  const effectiveLivePapel = liveCtx.livePapel;
  const effectiveIsController = liveCtx.isActiveController;
  const effectiveIndicatorRole = liveCtx.indicatorRole;
  const effectiveIsOriginalOwner = liveCtx.isOriginalOwner;
  const effectiveFbSyncStatus = liveCtx.fbSyncStatus;
  const effectiveLastFirebaseAckAt = liveCtx.lastFirebaseAckAt;

  // liveLogs e setLiveLogs: exclusivamente do contexto
  const effectiveLiveLogs = liveCtx.liveLogs;
  const effectiveSetLiveLogs = liveCtx.setLiveLogs;
  const effectiveVoiceLogs = voiceLogs !== undefined ? voiceLogs : [];
  const effectiveSetVoiceLogs = setVoiceLogs || (() => {});

  const displayTime = useMatchTimer(effectiveGameState);

  // ─── Modo Lite Offline (sincronismo local sem internet) ───────────────────
  const localSync = useLocalSyncIntegration(effectiveGameState);

  // Escuta evento customizado disparado pelo NavigationDrawer e ScoreboardDisplay
  // para abrir o modal de pareamento sem precisar de prop drilling.
  useEffect(() => {
    const handler = () => localSync.openPairingModal();
    window.addEventListener('localSync:openPairing', handler);
    return () => window.removeEventListener('localSync:openPairing', handler);
  }, [localSync.openPairingModal]);

  // ─── Wake Lock gerenciado no App.tsx — estável independente de remounts ───

  // Guard de runtime movido para após todos os hooks (ver linha ~1112)
  // O '!' em effectiveGameState = gameCtx.gameState! garante tipagem correta.

  const [resetPressProgress, setResetPressProgress] = useState(0);
  const resetPressTimerRef = useRef<number | null>(null);
  const resetProgressIntervalRef = useRef<number | null>(null);

  const startResetPress = () => {
    if (!onResetMatch || !isCommandOwner) return;
    setResetPressProgress(0);
    const startTime = Date.now();
    resetProgressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setResetPressProgress(Math.min((elapsed / 3000) * 100, 100));
    }, 50);
    resetPressTimerRef.current = setTimeout(() => {
      stopResetPress();
      onResetMatch();
    }, 3000);
  };

  const stopResetPress = () => {
    if (resetPressTimerRef.current) clearTimeout(resetPressTimerRef.current);
    if (resetProgressIntervalRef.current) clearInterval(resetProgressIntervalRef.current);
    setResetPressProgress(0);
  };

  const [scorePressProgress, setScorePressProgress] = useState<{ player: 1 | 2; type: 'game' | 'gameSet' | 'matchSet'; progress: number } | null>(null);
  const scoreProgressIntervalRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);

  const [isLogsOpen, setIsLogsOpen] = useState(effectiveGameState.matchConfig.isHistoryEnabled);
  const [isTimelineOpen, setIsTimelineOpen] = useState(effectiveGameState.matchConfig.isHistoryEnabled);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  const [remoteActionFeedback, setRemoteActionFeedback] = useState<string | null>(null);
  const [isWaitingAck, setIsWaitingAck] = useState(false);
  const [correctionMode, setCorrectionMode] = useState<'none' | 'game' | 'gameSet' | 'matchSet'>('none');
  const [correctionPlayer, setCorrectionPlayer] = useState<1 | 2 | null>(null);
  const [voiceWasManuallyStopped, setVoiceWasManuallyStopped] = useState(true);
  const longPressTimer = useRef<number | null>(null);
  const isLongPressActive = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const lastRemoteCommandTimestamp = useRef(0);
  const lastHistoryLengthOnWatch = useRef(effectiveGameState.pointHistory?.length ?? 0);
  const [isPinging, setIsPinging] = useState(false);
  const [isMirrorExpanded, setIsMirrorExpanded] = useState(false);
  const [isLiveExpanded, setIsLiveExpanded] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);
  const [dimProgress, setDimProgress] = useState(0);
  const dimTimeoutRef = useRef<number | null>(null);
  const dimProgressIntervalRef = useRef<number | null>(null);

  const currentGameStateRef = useRef(effectiveGameState);
  const pendingLogIdRef = useRef<string | null>(null);
  const lastVoiceToggleAtRef = useRef(0);
  const voiceLogsRef = useRef<CommandLogEntry[]>([]);

  useEffect(() => { voiceLogsRef.current = effectiveVoiceLogs || []; }, [effectiveVoiceLogs]);

  // ─── Live Log state ────────────────────────────────────────────────────────
  const [isLiveLogOpen, setIsLiveLogOpen] = useState(true);

  const nowTime = useCallback(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }), []);

  // Resolve o label de um deviceId a partir dos controllers do effectiveGameState atual
  const resolveLabel = (deviceId: string, controllers?: Record<string, any>): string => {
    const c = (controllers || {})[deviceId];
    return c?.label || deviceId;
  };

  const addLiveLog = useCallback((
    type: LiveLogType,
    text: string,
    ok?: boolean,
    meta?: { deviceType?: LiveLogEntry['deviceType']; participantRole?: LiveLogEntry['participantRole']; isController?: boolean }
  ) => {
    const entry: LiveLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      time: nowTime(),
      timestamp: Date.now(),
      type,
      text,
      ok,
      ...meta,
    };
    effectiveSetLiveLogs(prev => [entry, ...(prev || [])].slice(0, 60));
  }, [effectiveSetLiveLogs, nowTime]);
  // Ref estável para addLiveLog — permite lê-lo dentro de setTimeouts sem
  // incluí-lo nas dependências do useEffect (o que causaria reset do debounce a cada render)
  const addLiveLogRef = useRef(addLiveLog);
  useEffect(() => { addLiveLogRef.current = addLiveLog; }, [addLiveLog]);

  // Reset log ao iniciar nova partida — APENAS quando a nova partida realmente começa
  // Em vez de depender de matchId (que pode não estar definido), usamos o estado anterior
  const prevMatchIdRef = useRef<string | undefined>(effectiveGameState.matchId);
  useEffect(() => {
    if (effectiveGameState.matchId && prevMatchIdRef.current !== effectiveGameState.matchId) {
      // Partida realmente mudou
      const wasReset = !!prevMatchIdRef.current; // true = foi um reset (não o primeiro load)
      prevMatchIdRef.current = effectiveGameState.matchId;
      // Se a live estava ativa durante o reset, adicionar log de início de nova partida
      if (wasReset && effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) {
        addLiveLog('new_match', `Partida zerada — nova partida iniciada às ${nowTime()}`, true, {
          deviceType: getDeviceType(),
          participantRole: 'owner',
          isController: true,
        });
        addLiveLog('score', `${effectiveGameState.p1.name} 0 × 0 ${effectiveGameState.p2.name}`, true);
      }
    }
  }, [effectiveGameState.matchId, effectiveGameState.isMirroringActive, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed), currentDeviceFullLabel, addLiveLog]);

  // ── Live criada ────────────────────────────────────────────────────────────
  const prevIsMirroringRef = useRef(effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed));
  useEffect(() => {
    const isNowActive = effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed);
    if (!prevIsMirroringRef.current && isNowActive) {
      const label = currentDeviceFullLabel || 'Dispositivo';
      addLiveLog('live_created', `${label}: criou a live às ${nowTime()}`, true, {
        deviceType: getDeviceType(),
        participantRole: 'owner',
        isController: true,
      });
    }
    prevIsMirroringRef.current = isNowActive;
  }, [effectiveGameState.isMirroringActive, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed), currentDeviceFullLabel, addLiveLog]);

  // ── Partida iniciada (primeiro ponto) ─────────────────────────────────────
  const prevHistLenRef = useRef(effectiveGameState.pointHistory?.length ?? 0);
  useEffect(() => {
    const cur = effectiveGameState.pointHistory?.length ?? 0;
    const prev = prevHistLenRef.current;
    if (prev === 0 && cur === 1 && effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) {
      addLiveLog('match_started', `Partida iniciada às ${nowTime()}`, true);
      addLiveLog('score', `${effectiveGameState.p1.name} ${effectiveGameState.p1.score} × ${effectiveGameState.p2.score} ${effectiveGameState.p2.name}`, true);
    }
    prevHistLenRef.current = cur;
  }, [effectiveGameState.pointHistory?.length, addLiveLog]);

  // ── Mudança de placar: FB enviando → FB ok → Observadores ok ──────────────
  const prevScoreRef = useRef(`${effectiveGameState.p1.score}-${effectiveGameState.p2.score}-${effectiveGameState.p1.games}-${effectiveGameState.p2.games}`);
  const pendingScoreLogIdRef = useRef<string | null>(null);
  const pendingScoreSentAtRef = useRef<number>(0);
  useEffect(() => {
    const curKey = `${effectiveGameState.p1.score}-${effectiveGameState.p2.score}-${effectiveGameState.p1.games}-${effectiveGameState.p2.games}`;
    if (!effectiveGameState.isMirroringActive || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || curKey === prevScoreRef.current) {
      prevScoreRef.current = curKey;
      return;
    }
    const histLen = effectiveGameState.pointHistory?.length ?? 0;
    if (histLen === 0) { prevScoreRef.current = curKey; return; }

    // D3: identifica quem marcou o ponto (last entry no histórico)
    const lastEvent = effectiveGameState.pointHistory?.[histLen - 1];
    const scorerName = lastEvent?.winner === 1
      ? effectiveGameState.p1.name
      : lastEvent?.winner === 2
      ? effectiveGameState.p2.name
      : null;
    const scoreText = scorerName
      ? `${scorerName}: ponto → ${effectiveGameState.p1.score} × ${effectiveGameState.p2.score}`
      : `${effectiveGameState.p1.name} ${effectiveGameState.p1.score} × ${effectiveGameState.p2.score} ${effectiveGameState.p2.name}`;
    const sentAt = Date.now();
    pendingScoreSentAtRef.current = sentAt;

    // Linha placar atual
    addLiveLog('score', scoreText, true);

    // Linha FB: começa como pendente (ok = undefined)
    const fbEntryId = Math.random().toString(36).substr(2, 9);
    const fbEntry: LiveLogEntry = {
      id: fbEntryId,
      time: nowTime(),
      timestamp: sentAt,
      type: 'fb_ack',
      text: `→ FB: enviando...`,
      ok: undefined,
    };
    pendingScoreLogIdRef.current = fbEntryId;
    effectiveSetLiveLogs(prev => [fbEntry, ...(prev || [])].slice(0, 60));

    // Após ~1.5s marca FB ok com latência medida
    setTimeout(() => {
      const latency = Date.now() - sentAt;
      effectiveSetLiveLogs(prev => {
        const idx = (prev || []).findIndex(l => l.id === fbEntryId);
        if (idx === -1) return prev;
        const updated = [...(prev || [])];
        updated[idx] = { ...updated[idx], text: `✓ FB ok — ${latency}ms`, ok: true };
        return updated;
      });
      pendingScoreLogIdRef.current = null;

      // Observadores online (role observer OU spectator, vistos nos últimos 2min)
      const now = Date.now();
      const obsCount = Object.values(effectiveGameState.controllers || {}).filter(
        (c: any) => (c.role === 'observer' || c.role === 'spectator') && (now - (c.lastSeen || 0)) < 120000
      ).length;
      if (obsCount > 0) {
        addLiveLog('observers_ack', `✓ Obs: ${obsCount} online receberam`, true);
      }
    }, 1500);

    prevScoreRef.current = curKey;
  }, [effectiveGameState.p1.score, effectiveGameState.p2.score, effectiveGameState.p1.games, effectiveGameState.p2.games, addLiveLog]);

  // ── Assumiu o controle ────────────────────────────────────────────────────
  const prevCommandOwnerIdRef = useRef(effectiveGameState.commandOwnerId);
  useEffect(() => {
    if (!effectiveGameState.isMirroringActive || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) { prevCommandOwnerIdRef.current = effectiveGameState.commandOwnerId; return; }
    const prev = prevCommandOwnerIdRef.current;
    const cur = effectiveGameState.commandOwnerId;
    if (prev !== cur && cur) {
      // Busca label nos controllers; fallback para currentDeviceFullLabel se for este device
      const label = cur === currentDeviceId
        ? (currentDeviceFullLabel || resolveLabel(cur, effectiveGameState.controllers))
        : resolveLabel(cur, effectiveGameState.controllers);
      const ctrlRecord = effectiveGameState.controllers?.[cur] as any;
      addLiveLog('control_taken', `${label}: assumiu o controle da partida`, true, {
        deviceType: ctrlRecord?.deviceType,
        participantRole: ctrlRecord?.role === 'owner' ? 'owner' : ctrlRecord?.role === 'judge' ? 'judge' : undefined,
        isController: true,
      });
    }
    prevCommandOwnerIdRef.current = cur;
  }, [effectiveGameState.commandOwnerId, effectiveGameState.isMirroringActive, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed), addLiveLog]);

  // ── Participante entrou / saiu ─────────────────────────────────────────────
  const prevControllersRef = useRef<Record<string, any>>({});
  const loggedDeviceIdsRef = useRef<Set<string>>(new Set()); // IDs já registrados no log
  const controllersInitializedRef = useRef(false);
  const controllersDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs sempre atualizadas — lidas DENTRO do setTimeout para evitar closure stale
  // (o useEffect captura o valor do render em que rodou, não o do momento do disparo)
  const latestControllersRef = useRef<Record<string, any>>(effectiveGameState.controllers || {});
  const latestCommandOwnerIdRef = useRef(effectiveGameState.commandOwnerId);
  useEffect(() => { latestControllersRef.current = effectiveGameState.controllers || {}; }, [effectiveGameState.controllers]);
  useEffect(() => { latestCommandOwnerIdRef.current = effectiveGameState.commandOwnerId; }, [effectiveGameState.commandOwnerId]);

  useEffect(() => {
    if (!effectiveGameState.isMirroringActive || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) {
      prevControllersRef.current = {};
      loggedDeviceIdsRef.current = new Set();
      controllersInitializedRef.current = false;
      return;
    }

    // Debounce de 2s: reinicia a cada snapshot do Firebase — o timeout só dispara
    // quando os controllers pararem de mudar, garantindo o estado estável completo
    if (controllersDebounceRef.current) clearTimeout(controllersDebounceRef.current);
    controllersDebounceRef.current = setTimeout(() => {
      // Lê das refs, não do closure — valor mais atual do Firebase no momento do disparo
      const stable = latestControllersRef.current;
      const commandOwnerId = latestCommandOwnerIdRef.current;
      const prev = prevControllersRef.current;
      const checkTime = Date.now();
      const log = addLiveLogRef.current; // ref estável — não depende do closure

      // Loga qualquer participante ativo que ainda não foi registrado no log.
      // Usa loggedDeviceIdsRef como fonte da verdade — não prevControllersRef —
      // para evitar que um device seja ignorado por ter sido visto em um snapshot
      // anterior mas ainda não ter sido logado (race condition de debounce).
      Object.keys(stable).forEach(id => {
        const c = stable[id] as any;
        // Pula o próprio device se for owner — já logado em live_created
        if (id === currentDeviceId && c.role === 'owner') return;
        // Pula se já foi logado antes
        if (loggedDeviceIdsRef.current.has(id)) return;
        // Pula se inativo (TTL menor para novos entrantes após inicialização)
        const maxAge = controllersInitializedRef.current ? 90000 : 120000;
        if ((checkTime - (c.lastSeen || 0)) > maxAge) return;
        const isCtrl = id === commandOwnerId;
        const verb = controllersInitializedRef.current ? 'entrou na live' : 'já está na live';
        const roleLabel = isCtrl ? 'Controlador' : c.role === 'judge' ? 'Juiz' : 'Observador';
        log('participant_join', `${c.label || id}: ${verb} (${roleLabel})`, true, {
          deviceType: c.deviceType,
          participantRole: c.role === 'owner' ? 'owner' : c.role === 'judge' ? 'judge' : 'observer',
          isController: isCtrl,
        });
        loggedDeviceIdsRef.current.add(id);
      });

      // Saiu: deviceId que estava em prev e sumiu do stable com lastSeen recente
      Object.keys(prev).forEach(id => {
        if (stable[id]) return;
        const c = prev[id] as any;
        if ((checkTime - (c.lastSeen || 0)) > 120000) return;
        const roleLabel = c.role === 'judge' ? 'Juiz' : 'Observador';
        log('participant_leave', `${c.label || id}: saiu da live (${roleLabel})`, false, {
          deviceType: c.deviceType,
          participantRole: c.role === 'owner' ? 'owner' : c.role === 'judge' ? 'judge' : 'observer',
          isController: id === commandOwnerId,
        });
        loggedDeviceIdsRef.current.delete(id); // permite re-logar se o device voltar
      });

      prevControllersRef.current = stable;
      controllersInitializedRef.current = true;
    }, 2000);

    return () => {
      if (controllersDebounceRef.current) clearTimeout(controllersDebounceRef.current);
    };
  }, [effectiveGameState.controllers, effectiveGameState.isMirroringActive, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)]); // addLiveLog excluído intencionalmente — lido via ref para não reiniciar o debounce a cada render

  // ── Partida encerrada ─────────────────────────────────────────────────────
  const prevIsMatchOverRef = useRef(effectiveGameState.isMatchOver);
  useEffect(() => {
    if (!prevIsMatchOverRef.current && effectiveGameState.isMatchOver) {
      const p1SetsWon = (effectiveGameState.p1.sets || []).filter((s: number, i: number) => s > (effectiveGameState.p2.sets?.[i] ?? 0)).length;
      const p2SetsWon = (effectiveGameState.p2.sets || []).filter((s: number, i: number) => s > (effectiveGameState.p1.sets?.[i] ?? 0)).length;
      const winner = p1SetsWon > p2SetsWon ? effectiveGameState.p1.name : p2SetsWon > p1SetsWon ? effectiveGameState.p2.name : null;
      addLiveLog('match_over', `Partida encerrada${winner ? ` — Vencedor: ${winner}` : ''}`, true);
    }
    prevIsMatchOverRef.current = effectiveGameState.isMatchOver;
  }, [effectiveGameState.isMatchOver, addLiveLog]);

  // ── Partida confirmada ────────────────────────────────────────────────────
  const prevIsConfirmedRef = useRef(effectiveGameState.isConfirmedFinished);
  useEffect(() => {
    if (!prevIsConfirmedRef.current && effectiveGameState.isConfirmedFinished) {
      const label = currentDeviceFullLabel || 'Dispositivo';
      addLiveLog('match_confirmed', `${label}: confirmou o encerramento da partida`, true);
    }
    prevIsConfirmedRef.current = effectiveGameState.isConfirmedFinished;
  }, [effectiveGameState.isConfirmedFinished, currentDeviceFullLabel, addLiveLog]);

  // ── Live encerrada ────────────────────────────────────────────────────────
  const prevIsLiveClosedRef = useRef((effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed));
  useEffect(() => {
    if (!prevIsLiveClosedRef.current && (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) {
      addLiveLog('live_closed', 'Live encerrada', false);
    }
    prevIsLiveClosedRef.current = (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed);
  }, [(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed), addLiveLog]);
  // ─────────────────────────────────────────────────────────────────────────

  const isCommandOwner = useMemo(() => {
    if (isOfflineMode) return true;
    if (!effectiveGameState.isMirroringActive) return true;
    return currentDeviceId === effectiveGameState.commandOwnerId;
  }, [isOfflineMode, effectiveGameState.isMirroringActive, effectiveGameState.commandOwnerId, currentDeviceId]);

  const isLiveActive = useMemo(() => {
    return !!(effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) || !!effectiveCloudLiveExists;
  }, [effectiveGameState.isMirroringActive, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed), effectiveCloudLiveExists]);
  const [livePresenceNow, setLivePresenceNow] = useState(Date.now());

  useEffect(() => {
    if (!isLiveActive) return;
    setLivePresenceNow(Date.now());
    const interval = setInterval(() => setLivePresenceNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [isLiveActive]);
  const [firebaseAckElapsedSeconds, setFirebaseAckElapsedSeconds] = useState(0);

  useEffect(() => {
    setFirebaseAckElapsedSeconds(Math.max(0, Math.floor((Date.now() - effectiveLastFirebaseAckAt) / 1000)));
    const interval = setInterval(() => {
      setFirebaseAckElapsedSeconds(Math.max(0, Math.floor((Date.now() - effectiveLastFirebaseAckAt) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [effectiveLastFirebaseAckAt]);

  const resetDimTimer = useCallback(() => {
    if (dimTimeoutRef.current) clearTimeout(dimTimeoutRef.current);
    if (dimProgressIntervalRef.current) clearInterval(dimProgressIntervalRef.current);
    setDimProgress(0);
  if (effectiveGameState.matchConfig.isWatchMode) {
      const timeoutSec = (effectiveGameState.matchConfig.screenDimTimeout || 10);
      const timeoutMs = timeoutSec * 1000;
      const startTime = Date.now();
      // Atualiza a barra de progresso a cada 200ms
      dimProgressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / timeoutMs) * 100, 100);
        setDimProgress(pct);
        if (pct >= 100 && dimProgressIntervalRef.current !== null) clearInterval(dimProgressIntervalRef.current);
      }, 200);
      dimTimeoutRef.current = setTimeout(() => {
        if (dimProgressIntervalRef.current !== null) clearInterval(dimProgressIntervalRef.current);
        setDimProgress(0);
        setIsDimmed(true);
      }, timeoutMs);
    }
  }, [effectiveGameState.matchConfig.isWatchMode, effectiveGameState.matchConfig.screenDimTimeout]);

  useEffect(() => {
    resetDimTimer();
    return () => {
      if (dimTimeoutRef.current) clearTimeout(dimTimeoutRef.current);
      if (dimProgressIntervalRef.current) clearInterval(dimProgressIntervalRef.current);
    };
  }, [effectiveGameState.p1.score, effectiveGameState.p2.score, resetDimTimer]);

  useEffect(() => {
    if (pendingLogIdRef.current) {
      const logId = pendingLogIdRef.current;
      effectiveSetVoiceLogs(prev => {
        const idx = (prev || []).findIndex(l => l.id === logId);
        if (idx === -1) return prev;
        const updated = [...(prev || [])];
        const nowScore = `${effectiveGameState.p1.score}-${effectiveGameState.p2.score}`;
        updated[idx] = { 
          ...updated[idx], 
          after: nowScore, 
          latency: Date.now() - updated[idx].timestamp 
        };
        return updated;
      });
      pendingLogIdRef.current = null;
    }
  }, [effectiveGameState.p1.score, effectiveGameState.p2.score, (effectiveGameState.pointHistory?.length ?? 0)]);

  const groupedControllers = useMemo(() => {
    const list = Object.entries(effectiveGameState.controllers || {});
    const now = livePresenceNow;
    // Considera online se visto nos últimos 2 minutos (alinhado com o TTL de limpeza)
    return list
      .map(([id, data]) => {
        const d = data as { label: string; lastSeen: number; isOwner?: boolean; nickname?: string; role?: 'owner' | 'judge' | 'observer'; deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop' };
        const isCurrentDevice = id === currentDeviceId;
        const isActiveController = effectiveGameState.commandOwnerId === id;
        const presenceAt = Math.max(
          d.lastSeen || 0,
          isCurrentDevice ? effectiveLastFirebaseAckAt || 0 : 0,
          isActiveController ? effectiveGameState.controllerHeartbeatAt || 0 : 0,
        );
        const ageMs = Math.max(0, now - presenceAt);
        const ageSeconds = Math.floor(ageMs / 1000);
        const isOnline = ageMs < 300000; // 5 min — cobre dispositivos que atualizam lastSeen com menos frequência (ex: relógio)
        const status: 'controller' | 'watcher' = isActiveController ? 'controller' : 'watcher';
        const heartbeatStatus: 'ok' | 'slow' | 'late' =
          ageMs < 30000 ? 'ok' : ageMs < 60000 ? 'slow' : 'late';
        const heartbeatProgress = Math.min(100, (ageMs / 60000) * 100);
        // isOwner: fonte de verdade é ownerDeviceId no nível raiz — nunca muda durante a live
        const isOwner = !!effectiveGameState.ownerDeviceId && id === effectiveGameState.ownerDeviceId;
        // role: proprietário nunca pode ser juiz — corrige dado inconsistente do Firebase
        const role = isOwner ? 'owner' : (d.role || 'observer');
        return { id, label: d.label, nickname: d.nickname || '', isOnline, isOwner, role, status, deviceType: d.deviceType || 'phone', isActiveController, ageSeconds, heartbeatStatus, heartbeatProgress };
      })
      .filter(d => d.isOnline) // exibe apenas dispositivos que ainda estão ativos
      .sort((a, b) => {
        // Controller ativo primeiro, depois owners, depois os demais por ordem alfabética
        if (a.isActiveController) return -1;
        if (b.isActiveController) return 1;
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [currentDeviceId, effectiveGameState.controllers, effectiveGameState.commandOwnerId, effectiveGameState.controllerHeartbeatAt, effectiveGameState.ownerDeviceId, effectiveLastFirebaseAckAt, livePresenceNow]);

  const createCommandLog = (commandText: string, source: string = 'cb', isError = false, winner?: 1 | 2, isRemote = false) => {
    const now = Date.now();
    const isUndoCmd = commandText.toLowerCase().includes('desfazer') || commandText.toLowerCase().includes('voltar');
    let seq = 0;
    let beforeScore = `${currentGameStateRef.current.p1.score}-${currentGameStateRef.current.p2.score}`;
    let afterScore = '...';
    if (isUndoCmd) {
        const currentLogs = voiceLogsRef.current;
        const lastLog = currentLogs[0];
        if (lastLog && (lastLog.text.toLowerCase().includes('desfazer') || lastLog.text.toLowerCase().includes('voltar'))) {
            seq = Math.max(0, (lastLog.liveSequence || 0) - 1);
        } else {
            const penultimatePoint = currentLogs.find((l, idx) => idx > 0 && !l.isError && !(l.text.toLowerCase().includes('desfazer') || l.text.toLowerCase().includes('voltar')));
            if (penultimatePoint) {
                seq = penultimatePoint.liveSequence!;
                beforeScore = penultimatePoint.before;
                afterScore = penultimatePoint.after;
            } else {
                seq = Math.max(0, (currentGameStateRef.current?.pointHistory?.length ?? 0) - 1);
            }
        }
    } else {
        seq = (currentGameStateRef.current?.pointHistory?.length ?? 0) + 1;
    }
    const getDeviceTypeChar = () => {
      if (currentGameStateRef.current.matchConfig.isWatchMode) return 'W';
      const label = (currentDeviceFullLabel || '').toLowerCase();
      if (label.includes('note') || label.includes('laptop') || label.includes('pc') || label.includes('computador')) return 'N';
      return 'C';
    };
    const deviceChar = getDeviceTypeChar();
    const finalSourceToStore = source.startsWith('w') ? source : `${deviceChar}${source.charAt(1)}`;
    const entry: CommandLogEntry = { 
      id: Math.random().toString(36).substr(2, 9), 
      startTime: new Date(now).toLocaleTimeString('pt-BR', { hour12: false }), 
      before: beforeScore, 
      after: afterScore, 
      text: applyGoldenRule(commandText, true), 
      latency: 0, 
      timestamp: now, 
      isError, 
      winner, 
      isRemote, 
      liveSequence: seq, 
      liveId: 0,
      source: finalSourceToStore 
    };
    effectiveSetVoiceLogs(prev => [entry, ...(prev || [])].slice(0, 30)); 
    if (!isError && afterScore === '...') pendingLogIdRef.current = entry.id;
    return entry.id;
  };

  const handleUndoWithLog = () => {
    if (effectiveGameState.isConfirmedFinished || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || !isCommandOwner) return;
    createCommandLog('Desfazer', 'cb');
    onUndo();
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleVoiceToggle = () => {
    const now = Date.now();
    if (now - lastVoiceToggleAtRef.current < 700) return;
    lastVoiceToggleAtRef.current = now;
    if ((effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || !isCommandOwner || effectiveGameState.isMatchOver) return;
    if (voiceWasManuallyStopped) {
      setVoiceWasManuallyStopped(false);
    } else {
      setVoiceWasManuallyStopped(true);
    }
  };

  const [customBaseUrl, setCustomBaseUrl] = useState(() => {
    const saved = localStorage.getItem('myPlacar_CustomHost');
    if (saved) return saved;
    return appUrl.endsWith('/') ? appUrl : appUrl + '/';
  });
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [copiedType, setCopiedType] = useState<'link' | 'watch' | null>(null);
  const mirrorLink = useMemo(() => {
    let base = customBaseUrl.trim();
    if (!base.startsWith('http')) base = 'https://' + base;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/?viewPin=${effectiveGameState.ownerPin?.toUpperCase()}`;
  }, [effectiveGameState.ownerPin, customBaseUrl]);
  const watchLink = useMemo(() => `${mirrorLink}&viewMode=watch`, [mirrorLink]);
  const scoreboardLink = useMemo(() => `${mirrorLink}&viewMode=scoreboard`, [mirrorLink]);
  const qrCodeUrl = useMemo(() => `https://quickchart.io/qr?text=${encodeURIComponent(scoreboardLink)}&size=400&margin=1&ecLevel=H&dark=0f172a`, [scoreboardLink]);

  // Tênis e beach tênis
  const { announceFullScore: announceFullScoreTennis, isAnnouncing: isAnnouncingTennis } =
    useScoreAnnouncer(effectiveGameState);

  // Pickleball — hook dedicado, isolado do motor de tênis
  const { announceFullScore: announceFullScorePickleball, isAnnouncing: isAnnouncingPickle } =
    usePickleballAnnouncer(effectiveGameState);

  // Dispatcher: encaminha para o hook correto conforme o esporte
  const isPickleball = effectiveGameState.matchConfig.sportType === 'pickleball';
  const announceFullScore = isPickleball ? announceFullScorePickleball : announceFullScoreTennis;
  const isAnnouncing = isPickleball ? isAnnouncingPickle : isAnnouncingTennis;

  const { isListening, start, stop } = useGeminiReferee({
    onScoreP1: (type, text) => { if(!effectiveGameState.isConfirmedFinished && !effectiveGameState.isMatchOver && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner) { createCommandLog(text || `Ponto ${currentGameStateRef.current.p1.name}`, 'cv', false, 1); onScoreUpdate(1, type, 'cv'); } },
    onScoreP2: (type, text) => { if(!effectiveGameState.isConfirmedFinished && !effectiveGameState.isMatchOver && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner) { createCommandLog(text || `Ponto ${currentGameStateRef.current.p2.name}`, 'cv', false, 2); onScoreUpdate(2, type, 'cv'); } },
    onUndo: (text) => { if(!effectiveGameState.isConfirmedFinished && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner) { createCommandLog(text || 'Desfazer', 'cv'); onUndo(); } },
    onCommandError: (text) => { if(!effectiveGameState.isConfirmedFinished && !effectiveGameState.isMatchOver && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner) { playErrorBeep(effectiveGameState.matchConfig.errorSoundType); if (navigator.vibrate) navigator.vibrate([100, 50, 100]); createCommandLog(text, 'cv', true); } },
    onSwitchServer: () => onSwitchServer(effectiveGameState.server === 1 ? 2 : 1, false), onAnnounceScore: announceFullScore, isEnabled: effectiveGameState.matchConfig.voiceEnabled && !voiceWasManuallyStopped && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner && !effectiveGameState.isMatchOver,
    p1Name: effectiveGameState.p1.name, p2Name: effectiveGameState.p2.name, p1Partner: effectiveGameState.p1.partnerName, p2Partner: effectiveGameState.p2.partnerName, p1Color: effectiveGameState.p1.color, p2Color: effectiveGameState.p2.color,
    server: effectiveGameState.server, servingOrderOffset: effectiveGameState.servingOrderOffset, voiceCommands: effectiveGameState.matchConfig.voiceCommands, actionCooldownSec: effectiveGameState.matchConfig.actionCooldown || 5, stateLockoutSec: effectiveGameState.matchConfig.stateLockout || 2
  });

  // Reset voice logs ao iniciar nova partida — APENAS quando a nova partida realmente começa
  // NÃO zeramos mais aqui — os logs agora persistem entre telas
  const prevVoiceMatchIdRef = useRef<string | undefined>(effectiveGameState.matchId);
  useEffect(() => {
    if (effectiveGameState.matchId && prevVoiceMatchIdRef.current !== effectiveGameState.matchId) {
      prevVoiceMatchIdRef.current = effectiveGameState.matchId;
      // NÃO zeramos voiceLogs — os logs agora persistem
    }
  }, [effectiveGameState.matchId]);

  useEffect(() => {
    if (!effectiveGameState.matchId) return;
    setIsWaitingAck(false);
    setRemoteActionFeedback(null);
    setScorePressProgress(null);
    setCorrectionMode('none');
    setCorrectionPlayer(null);
    isLongPressActive.current = false;
    hasDraggedRef.current = false;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (scoreProgressIntervalRef.current) {
      clearInterval(scoreProgressIntervalRef.current);
      scoreProgressIntervalRef.current = null;
    }
  }, [effectiveGameState.matchId]);

  currentGameStateRef.current = effectiveGameState;

  useEffect(() => {
    if (!effectiveGameState.matchConfig.isWatchMode) return;
    if (isWaitingAck && (effectiveGameState.pointHistory?.length ?? 0) !== lastHistoryLengthOnWatch.current) {
        setRemoteActionFeedback('CONFIRMED'); setIsWaitingAck(false); lastHistoryLengthOnWatch.current = (effectiveGameState.pointHistory?.length ?? 0); setTimeout(() => setRemoteActionFeedback(null), 1000);
    } else { lastHistoryLengthOnWatch.current = (effectiveGameState.pointHistory?.length ?? 0); }
  }, [effectiveGameState.pointHistory?.length, effectiveGameState.matchConfig.isWatchMode, isWaitingAck]);

  useEffect(() => {
    if (!effectiveGameState.matchConfig.isWatchMode || !effectiveGameState.isMirroringActive || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) return;
    const interval = setInterval(async () => {
      const db = getDb(); if (!db || !effectiveGameState.ownerPin) return;
      try { await setDoc(doc(db, "live_matches", effectiveGameState.ownerPin.toUpperCase()), { lastRemotePing: Date.now() }, { merge: true }); } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [effectiveGameState.matchConfig.isWatchMode, effectiveGameState.isMirroringActive, effectiveGameState.ownerPin, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)]);

  const isWatchConnected = useMemo(() => {
    if (!effectiveGameState.lastRemotePing || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) return false;
    return (Date.now() - effectiveGameState.lastRemotePing) < 55000;
  }, [effectiveGameState.lastRemotePing, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)]);

  useEffect(() => {
    if (effectiveGameState.matchConfig.isWatchMode || !isAdmin || !effectiveGameState.isMirroringActive || !effectiveGameState.ownerPin || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) return;
    const db = getDb(); if (!db) return;
    const liveRef = doc(db, "live_matches", effectiveGameState.ownerPin.toUpperCase());
    const unsubscribe = onSnapshot(liveRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data(); const cmd = data.remoteCommand;
        if (cmd && cmd.timestamp > lastRemoteCommandTimestamp.current) {
          lastRemoteCommandTimestamp.current = cmd.timestamp;
          let logText = "";
          if (cmd.action === 'P1_POINT') { onScoreUpdate(1, 'rally', 'wb'); logText = `Ponto ${effectiveGameState.p1.name} (remoto)`; }
          else if (cmd.action === 'P2_POINT') { onScoreUpdate(2, 'rally', 'wb'); logText = `Ponto ${effectiveGameState.p2.name} (remoto)`; }
          else if (cmd.action === 'P1_ACE') { onScoreUpdate(1, 'ace', 'wb'); logText = `Ace ${effectiveGameState.p1.name} (remoto)`; }
          else if (cmd.action === 'P2_ACE') { onScoreUpdate(2, 'ace', 'wb'); logText = `Ace ${effectiveGameState.p2.name} (remoto)`; }
          else if (cmd.action === 'P1_FAULT') { onScoreUpdate(2, 'fault', 'wb'); logText = `Saque errado ${effectiveGameState.p1.name} (remoto)`; }
          else if (cmd.action === 'UNDO') { onUndo(); logText = "Desfazer (remoto)"; }
          if (logText) createCommandLog(logText, 'wb', false, undefined, true);
        }
      }
    });
    return () => unsubscribe();
  }, [effectiveGameState.ownerPin, effectiveGameState.matchConfig.isWatchMode, isAdmin, effectiveGameState.isMirroringActive, onScoreUpdate, onUndo, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)]);

  const handleToggleMirroringLocal = (active: boolean) => { 
    if (!effectiveGameState.isMatchOver && !effectiveGameState.isConfirmedFinished && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) {
       if (isCommandOwner && !active) {
         // Ao desligar a live, vai direto para confirmação de encerramento —
         // sem passar pelo overlay de controle. Chama onDeleteLive se disponível,
         // senão abre o overlay (fallback).
         if (onDeleteLive) onDeleteLive();
         else onOpenLiveControl?.();
       }
       else onToggleMirroring(active);
    }
  };
  const handlePingTest = async () => {
    const db = getDb(); if (!db || !effectiveGameState.ownerPin || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) return;
    setIsPinging(true);
    try {
      const liveRef = doc(db, "live_matches", effectiveGameState.ownerPin.toUpperCase());
      await updateDoc(liveRef, { pingTimestamp: Date.now(), pingConfirmed: false });
      setTimeout(async () => { await updateDoc(liveRef, { pingConfirmed: true }); setTimeout(() => setIsPinging(false), 1000); }, 1500);
    } catch (e) { setIsPinging(false); }
  };

  const handleSaveBaseUrl = () => { localStorage.setItem('myPlacar_CustomHost', customBaseUrl); setIsEditingUrl(false); };
  const handleCopyLink = async () => {
    const ok = await copyToClipboard(scoreboardLink);
    if (ok) {
      setCopiedType('link');
      setTimeout(() => setCopiedType(null), 2500);
      window.alert("Link do placar copiado com sucesso.");
    } else {
      window.alert("Não foi possível copiar o link automaticamente. Copie manualmente: " + scoreboardLink);
    }
  };
  const handleCopyWatchLink = async () => {
    const ok = await copyToClipboard(watchLink);
    if (ok) {
      setCopiedType('watch');
      setTimeout(() => setCopiedType(null), 2500);
      window.alert("Link para relógio copiado com sucesso.");
    } else {
      window.alert("Não foi possível copiar o link automaticamente. Copie manualmente: " + watchLink);
    }
  };
  const handleShareWhatsApp = () => {
    const currentSportDef = SPORT_LIST.find(s => s.id === effectiveGameState.matchConfig.sportType) || SPORT_LIST[0];
    const text = `Acompanhe meu jogo de ${currentSportDef.name} ao vivo no my placar. 🎾\n\n${scoreboardLink}`;
    globalThis.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const isTieBreak = isTennisTieBreak(effectiveGameState);
  useEffect(() => { const interval = setInterval(() => setIsAudioLocked(getSharedAudioContext()?.state !== 'running'), 1500); return () => clearInterval(interval); }, []);

  const openCorrection = (type: 'game' | 'gameSet' | 'matchSet', player: 1 | 2) => { if (!effectiveGameState.isConfirmedFinished && !effectiveGameState.isMatchOver && !isRecoveryFromMatchOver && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner) { if (isListening) stop(); setCorrectionMode(type); setCorrectionPlayer(player); } };
  const closeCorrection = () => { setCorrectionMode('none'); setCorrectionPlayer(null); if (effectiveGameState.matchConfig.voiceEnabled && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner) setTimeout(start, 300); };
  const handleApplyPickerCorrection = (selectedVal: string) => {
    if (onCorrectScore && correctionPlayer && correctionMode !== 'none') {
      let otherVal = "";
      if (correctionMode === 'game') {
        otherVal = correctionPlayer === 1 ? effectiveGameState.p2.score : effectiveGameState.p1.score;
      } else if (correctionMode === 'gameSet') {
        otherVal = (correctionPlayer === 1 ? effectiveGameState.p2.games : effectiveGameState.p1.games).toString();
      } else if (correctionMode === 'matchSet') {
        otherVal = (correctionPlayer === 1 ? p2WonSets : p1WonSets).toString();
      }
      onCorrectScore(correctionMode as any, correctionPlayer === 1 ? `${selectedVal} a ${otherVal}` : `${otherVal} a ${selectedVal}`); closeCorrection();
    }
  };

  const handleScoreCardPointerDown = (e: React.PointerEvent<HTMLElement>, type: 'game' | 'gameSet' | 'matchSet', player: 1 | 2) => {
    const waitingForRemoteAck = !isOfflineMode && isWaitingAck;
    const recoveringFromFinishedMatch = !isOfflineMode && isRecoveryFromMatchOver;
    if (effectiveGameState.isConfirmedFinished || effectiveGameState.isMatchOver || waitingForRemoteAck || recoveringFromFinishedMatch || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || !isCommandOwner) return;
    isLongPressActive.current = false; 
    hasDraggedRef.current = false;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    
    const duration = effectiveGameState.matchConfig.isWatchMode ? 4000 : 3000;
    const startTime = Date.now();
    setScorePressProgress({ player, type, progress: 0 });
    
    if (scoreProgressIntervalRef.current) clearInterval(scoreProgressIntervalRef.current);
    scoreProgressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setScorePressProgress({ player, type, progress: Math.min((elapsed / duration) * 100, 100) });
    }, 50);

    longPressTimer.current = setTimeout(() => { 
      isLongPressActive.current = true; 
      if (scoreProgressIntervalRef.current) clearInterval(scoreProgressIntervalRef.current);
      setScorePressProgress(null);
      openCorrection(type, player); 
    }, duration);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const dx = e.clientX - touchStartPos.current.x;
    const dy = e.clientY - touchStartPos.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Cancela se qualquer movimento > 10px, com prioridade extra para scroll vertical
    const isScrolling = Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx);
    if (dist > 10 || isScrolling) {
      hasDraggedRef.current = true;
    }
    if (longPressTimer.current && (dist > 10 || isScrolling)) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      if (scoreProgressIntervalRef.current) clearInterval(scoreProgressIntervalRef.current);
      setScorePressProgress(null);
    }
  };
  const handleScoreCardPointerUp = (type: 'game' | 'gameSet' | 'matchSet', player: 1 | 2) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (scoreProgressIntervalRef.current) clearInterval(scoreProgressIntervalRef.current);
    setScorePressProgress(null);
    
    if (!isLongPressActive.current && !hasDraggedRef.current && correctionMode === 'none' && !currentGameStateRef.current.isConfirmedFinished && !currentGameStateRef.current.isMatchOver && !(currentGameStateRef.current.isMirroringActive && currentGameStateRef.current.isLiveClosed)) {
      if (currentGameStateRef.current.isMirroringActive && !isCommandOwner) return;
      
      // Item 8: Retirar incremento do placar do game nos botões de set (matchSet) e gameSet
      if (type === 'matchSet' || type === 'gameSet') return;

      createCommandLog(`Ponto ${player === 1 ? currentGameStateRef.current.p1.name : currentGameStateRef.current.p2.name}`, 'cb', false, player);
      onScoreUpdate(player, 'rally', 'cb');
    }
  };

  const [showSetGamesInMainScore, setShowSetGamesInMainScore] = useState(false);

  const p1GamesNew = effectiveGameState?.p1?.games ?? 0;
  const p2GamesNew = effectiveGameState?.p2?.games ?? 0;
  const hasFinishedGamesNew = (p1GamesNew + p2GamesNew) > 0;
  const s1New = String(effectiveGameState?.p1?.score ?? '').trim();
  const s2New = String(effectiveGameState?.p2?.score ?? '').trim();
  const isZeroZeroNew = (s1New === '0' || s1New === '00' || s1New === '') && (s2New === '0' || s2New === '00' || s2New === '');

  useEffect(() => {
    if (!hasFinishedGamesNew || !isZeroZeroNew || effectiveGameState?.isMatchOver) {
      setShowSetGamesInMainScore(false);
      return;
    }

    const interval = setInterval(() => {
      setShowSetGamesInMainScore(prev => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, [hasFinishedGamesNew, isZeroZeroNew, effectiveGameState?.isMatchOver]);

  const p1WonSets = useMemo(() => effectiveGameState.p1.sets.filter((s, i) => s > effectiveGameState.p2.sets[i]).length, [effectiveGameState.p1.sets, effectiveGameState.p2.sets]);
  const p2WonSets = useMemo(() => effectiveGameState.p2.sets.filter((s, i) => s > effectiveGameState.p1.sets[i]).length, [effectiveGameState.p1.sets, effectiveGameState.p2.sets]);
  const currentSportDef = SPORT_LIST.find(s => s.id === effectiveGameState.matchConfig.sportType) || SPORT_LIST[0];
  const makeNumericOptions = (max: number) => Array.from({ length: Math.max(0, max) + 1 }, (_, i) => i.toString());
  const pickerOptions = useMemo(() => {
    const config = effectiveGameState.matchConfig;
    if (correctionMode === 'matchSet') {
      const bestOf = Number(config.setsToWin ?? config.sets) || 1;
      const setsNeeded = Math.max(1, Math.ceil(bestOf / 2));
      return makeNumericOptions(setsNeeded);
    }
    if (correctionMode === 'gameSet') {
      const maxGames = Number(config.gamesPerSet) || 6;
      return makeNumericOptions(maxGames);
    }
    if (currentSportDef.engine === 'tennis' && !isTieBreak) {
      return config.noAd ? ['0', '15', '30', '40'] : ['0', '15', '30', '40', 'Ad'];
    }

    if (currentSportDef.engine === 'tennis' && isTieBreak) {
      const tieBreakTarget = Number(config.tieBreakPoints) || 7;
      return makeNumericOptions(config.tieBreakWinByTwo ? tieBreakTarget + 2 : tieBreakTarget);
    }

    if (currentSportDef.engine === 'rally') {
      const pointTarget = Number(config.gamesPerSet) || (config.sportType === 'pickleball' ? 11 : 21);
      return makeNumericOptions(config.tieBreakWinByTwo ? pointTarget + 2 : pointTarget);
    }

    return makeNumericOptions(30);
  }, [correctionMode, currentSportDef, isTieBreak, effectiveGameState.matchConfig]);
  
  const isVoiceActive = !voiceWasManuallyStopped && effectiveGameState.matchConfig.voiceEnabled && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && isCommandOwner && !effectiveGameState.isMatchOver;
  
  // isWatchMode return movido para após todos os hooks (Rules of Hooks)

  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  // Banner "quem está controlando" — calculado fora do JSX para evitar IIFE com const
  const liveBanner = useMemo(() => {
    if (!isLiveActive || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || effectiveGameState.matchConfig.isWatchMode) return null;
    const iAmController = currentDeviceId === effectiveGameState.commandOwnerId;
    const controllerName = effectiveGameState.commandOwner || '';
    if (iAmController) {
      return (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-[#f59e0b] text-white text-[11px] font-black tracking-tight">
          {effectiveIsOriginalOwner ? <Crown size={13} /> : <Gavel size={13} />}
          <span>Você está no controle do placar</span>
        </div>
      );
    }
    if (effectiveGameState.isMirroringActive && controllerName) {
      return (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-[11px] font-black tracking-tight">
          <Eye size={13} />
          <span>{controllerName} está controlando · você está observando</span>
        </div>
      );
    }
    return null;
  }, [isLiveActive, (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed), effectiveGameState.matchConfig.isWatchMode, effectiveGameState.commandOwnerId, effectiveGameState.commandOwner, effectiveGameState.isMirroringActive, currentDeviceId, effectiveIsOriginalOwner]);
  const connType = connection?.type;
  const downlink = connection?.downlink;

  // ─── Returns condicionais — APÓS todos os hooks (Rules of Hooks) ──────────

  // Guard: gameState inválido (não deve ocorrer em produção — App.tsx só monta
  // este componente quando gameState != null, mas protege contra edge cases)
  if (!effectiveGameState || !effectiveGameState.p1 || !effectiveGameState.p2 || !effectiveGameState.matchConfig) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold">Sincronizando partida...</p>
      </div>
    );
  }

  const correctionPickerModal = (
    <ScorePickerModal 
      isOpen={correctionMode !== 'none'} 
      onClose={closeCorrection} 
      onConfirm={handleApplyPickerCorrection} 
      title={`Corrigir ${correctionMode === 'game' ? 'game' : correctionMode === 'gameSet' ? 'games no set' : 'sets vencidos'}: ${correctionPlayer === 1 ? effectiveGameState.p1.name : effectiveGameState.p2.name}`} 
      options={pickerOptions} 
      initialValue={correctionPlayer === 1 ? (correctionMode === 'game' ? effectiveGameState.p1.score : correctionMode === 'gameSet' ? effectiveGameState.p1.games.toString() : p1WonSets.toString()) : (correctionMode === 'game' ? effectiveGameState.p2.score : correctionMode === 'gameSet' ? effectiveGameState.p2.games.toString() : p2WonSets.toString())} 
      isWatchMode={effectiveGameState.matchConfig.isWatchMode}
    />
  );

  if (effectiveGameState.matchConfig.isScoreboardMode && !(isWatchDevice() && effectiveGameState.matchConfig.isWatchMode)) {
    return (
      <ScoreboardDisplay
        gameState={effectiveGameState}
        isCommandOwner={isCommandOwner}
        onResetMatch={onResetMatch}
        onOpenLiveControl={onOpenLiveControl}
        onBack={onBack}
        cloudLiveExists={effectiveCloudLiveExists}
        isOfflineMode={isOfflineMode}
        role={effectiveIndicatorRole}
        onVoiceToggle={handleVoiceToggle}
        isVoiceActive={isVoiceActive}
        fbSyncStatus={effectiveFbSyncStatus}
        lastFirebaseAckAt={effectiveLastFirebaseAckAt}
        onToggleScoreboardMode={onToggleScoreboardMode}
        onToggleWatchMode={onToggleWatchMode}
      />
    );
  }

  if (effectiveGameState.matchConfig.isWatchMode) {
    return (
      <>
        {correctionPickerModal}
        <WatchBoard 
          gameState={effectiveGameState} onScoreUpdate={onScoreUpdate} onUndo={onUndo} onSwitchServer={onSwitchServer} 
          onBack={onBack} onConfirmMatch={onConfirmMatch} isListening={isListening} 
          isAudioLocked={isAudioLocked} unlockAudio={unlockAudio} announceFullScore={announceFullScore} 
          handleUndoWithLog={handleUndoWithLog} isDimmed={isDimmed} setIsDimmed={setIsDimmed} resetDimTimer={resetDimTimer} dimProgress={dimProgress}
          isCommandOwner={isCommandOwner} onResetMatch={onResetMatch} onOpenLiveControl={onOpenLiveControl} onSyncScoreboard={onSyncScoreboard} remoteActionFeedback={remoteActionFeedback} p1WonSets={p1WonSets} p2WonSets={p2WonSets}
          isOfflineMode={isOfflineMode}
          correctionMode={correctionMode} closeCorrection={closeCorrection} handleApplyPickerCorrection={handleApplyPickerCorrection}
          pickerOptions={pickerOptions} correctionPlayer={correctionPlayer} handleScoreCardPointerDown={handleScoreCardPointerDown}
          handlePointerMove={handlePointerMove} handleScoreCardPointerUp={handleScoreCardPointerUp}
          scorePressProgress={scorePressProgress}
          cloudLiveExists={effectiveCloudLiveExists}
          role={effectiveIndicatorRole}
          fbSyncStatus={effectiveFbSyncStatus}
          lastFirebaseAckAt={effectiveLastFirebaseAckAt}
          onVoiceToggle={handleVoiceToggle}
          isVoiceActive={isVoiceActive}
          onToggleWatchMode={onToggleWatchMode}
          onToggleScoreboardMode={onToggleScoreboardMode}
          onOpenRules={() => onNavigateToTab?.('regras')}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative font-sans">
       {effectiveGameState.isMatchOver && !effectiveGameState.isConfirmedFinished && (
         <div className="fixed inset-0 z-[100001] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-[3rem] p-8 w-full max-sm shadow-2xl border border-white/50 flex flex-col items-center gap-6 animate-in zoom-in duration-300">
               <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-inner"><Trophy size={40} /></div>
               <div className="text-center space-y-2">
                 <h3 className="text-2xl font-black text-black tracking-tight leading-none">Partida encerrada</h3>
                 <p className="text-sm font-bold text-slate-500">Vencedor: {p1WonSets > p2WonSets ? effectiveGameState.p1.name : effectiveGameState.p2.name}</p>
               </div>
               <div className="flex flex-col w-full gap-3">
                 <button onClick={() => onConfirmMatch?.()} className="w-full py-5 bg-emerald-600 text-white rounded-3xl font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"><Check size={20} strokeWidth={3} />Confirmar resultado</button>
                 {isCommandOwner && <button onClick={handleUndoWithLog} className="w-full py-5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/60 rounded-3xl font-black text-base shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"><RotateCcw size={20} strokeWidth={3} />Corrigir último ponto</button>}
               </div>
            </div>
         </div>
       )}
       {isAudioLocked && <div onClick={async () => { await unlockAudio(); announceFullScore(); setIsAudioLocked(false); }} className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl bg-orange-600 text-white flex items-center gap-3 animate-bounce cursor-pointer"><VolumeX size={20} /><span className="text-sm font-bold">Ativar som</span></div>}
       {correctionPickerModal}

       <header className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={props.onOpenMenu}
            className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
          >
            <Menu size={20} />
          </button>
          {isOfflineMode && (
            <button 
              onPointerDown={startResetPress}
              onPointerUp={stopResetPress}
              onPointerLeave={stopResetPress}
              className="w-10 h-10 rounded-full flex items-center justify-center text-black bg-yellow-500 shadow-md border-2 border-white relative overflow-hidden active:scale-95 transition-transform"
            >
              {resetPressProgress > 0 && (
                <div 
                  className="absolute inset-0 bg-black/10 origin-left transition-all duration-75" 
                  style={{ transform: `scaleX(${resetPressProgress / 100})` }} 
                />
              )}
              <WifiOff size={22} className="relative z-10" />
            </button>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <button onClick={() => announceFullScore()} className="flex items-center gap-3 active:scale-95 transition-transform">
            <LazySportIcon sportId={effectiveGameState.matchConfig.sportType} defaultIcon={currentSportDef.defaultIcon} className="w-10 h-10 rounded-full shadow-sm" />
            <span className="text-xl font-black tracking-tighter text-gray-900 flex items-center gap-1">
              {currentSportDef.name} 
              {isTieBreak && <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-1">Tb</span>}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isLiveActive && isWatchConnected && <div className="p-2 bg-sky-100 text-sky-600 rounded-xl animate-pulse flex items-center gap-2 px-3 border border-sky-200" title="Relógio conectado"><Watch size={18} /><span className="text-[9px] font-black tracking-tight hidden md:inline">Relógio conectado</span></div>}
          {/* Badge Modo Lite Offline — sempre visível quando espelhamento está ativo */}
          {localSync.showSyncBadge && (
            <LocalSyncBadge
              role={localSync.syncState.role}
              status={localSync.syncState.status}
              pin={localSync.syncState.pin}
              onClick={localSync.openPairingModal}
            />
          )}
          <div className="w-10" />
        </div>
      </header>

      {/* Banner: indica quem está controlando o placar durante a live */}
      {liveBanner}

      <main className={`flex-1 p-4 max-w-2xl mx-auto w-full pb-36 overflow-y-auto no-scrollbar transition-all duration-700 ${effectiveGameState.isMirroringActive && (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && !isOfflineMode ? 'grayscale opacity-60 pointer-events-none' : ''}`}>
        <div className="flex flex-col items-center gap-4 relative w-full">
           <div className="flex flex-col w-full">
             <div className="flex items-center justify-between w-full mb-2 px-2">
               <div className="flex items-center gap-2"></div>
               <div className="flex flex-col items-center justify-center -mt-12 md:-mt-16">
                 {!isOfflineMode && (
                   <button onClick={handleVoiceToggle} disabled={effectiveGameState.isConfirmedFinished || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || !isCommandOwner || effectiveGameState.isMatchOver} className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 border-2 ${isVoiceActive ? 'bg-blue-600 border-blue-700' : 'bg-white border-blue-600'}`}>
                     <div className="relative flex items-center justify-center">
                       <Mic size={32} strokeWidth={isVoiceActive ? 3.5 : 2} className={isVoiceActive ? 'text-white' : 'text-blue-600'} />
                       {(voiceWasManuallyStopped || !effectiveGameState.matchConfig.voiceEnabled || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) || !isCommandOwner || effectiveGameState.isMatchOver) && (
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-[2.5px] bg-red-600 -rotate-45 rounded-full shadow-sm pointer-events-none z-20" />
                       )}
                     </div>
                   </button>
                 )}
               </div>
               <div className="flex items-center gap-3"><span className={`text-2xl font-black tracking-tighter ${effectiveGameState.isPaused ? 'text-red-500 animate-pulse' : 'text-gray-900'}`}>{formatTime(displayTime)}</span><button onClick={() => onTogglePause?.()} className={`p-3 rounded-2xl active:scale-90 transition-all shadow-md ${effectiveGameState.isPaused ? 'bg-green-600 text-white' : 'bg-red-50 text-red-500'}`}>{effectiveGameState.isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} />}</button></div>
             </div>
             
              <div className="flex flex-col w-full mt-4">
                {(() => {
                  const isActive = !effectiveGameState.isConfirmedFinished && !effectiveGameState.isMatchOver && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed);
                  const o = effectiveGameState.servingOrderOffset;
                  const c1 = effectiveGameState.p1.color || 'azul';
                  const c2 = effectiveGameState.p2.color || 'vermelho';
                  const sport = effectiveGameState.matchConfig.sportType;
                  const isDoubles = effectiveGameState.matchConfig.isDoubles;
                  const pkl = effectiveGameState.pickleball;
                  // Mostra (E)/(D) apenas para pickleball side-out duplas
                  const showSides = sport === 'pickleball' && isDoubles && effectiveGameState.matchConfig.pickleballScoringMode !== 'rally' && !!pkl;

                  const renderTeamRow = (team: 1 | 2) => {
                    const p = team === 1 ? effectiveGameState.p1 : effectiveGameState.p2;
                    const color = team === 1 ? c1 : c2;
                    const offsetInitial = team === 1 ? 0 : 1;
                    const offsetPartner = team === 1 ? 2 : 3;

                    // Outros esportes ou sem parceiro: layout original
                    if (!showSides || !p.partnerName) {
                      const isInitialActive = isActive && (sport === 'pickleball' && pkl ? (pkl.server.team === team && pkl.server.serverName === p.name) : o === offsetInitial);
                      const isPartnerActive = isActive && (sport === 'pickleball' && pkl ? (pkl.server.team === team && pkl.server.serverName === p.partnerName) : o === offsetPartner);
                      
                      if (isDoubles && p.partnerName) {
                        const genderInitial = p.gender ?? 'M';
                        const genderPartner = p.partnerGender ?? 'M';
                        return (
                          <div key={team} className={`flex items-center w-full py-1.5 ${SOLID_COLORS[color]}`}>
                            {/* Botão gênero lado esquerdo */}
                            <button
                              disabled={!isActive}
                              onClick={(e) => { e.stopPropagation(); onToggleGender?.(team, false); }}
                              className={`shrink-0 ml-2 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${genderInitial === 'M' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-pink-50 text-pink-600 border-pink-200'}`}
                              title="Trocar gênero"
                            >
                              {genderInitial === 'M' ? <MarsIcon size={12} /> : <VenusIcon size={12} />}
                            </button>
                            {/* Nome esquerdo */}
                            <div onClick={() => onSwitchServer(team, false)} className="flex-1 cursor-pointer active:scale-95 transition-transform flex items-center justify-start pl-2">
                              <span className={`text-xl md:text-2xl font-black truncate px-2 py-0.5 rounded ${isInitialActive ? 'bg-[#bef264] text-[#1a1a1a] shadow-md' : 'text-white'}`}>{p.name}</span>
                            </div>
                            {/* Botão trocar lado */}
                            <button
                              disabled={!isActive}
                              onClick={(e) => { e.stopPropagation(); onSwapSides?.(team); }}
                              className="shrink-0 w-8 h-8 rounded-full bg-white text-gray-800 shadow-md flex items-center justify-center active:scale-90 transition-all border border-gray-200"
                              title="Trocar lado dos jogadores"
                            >
                              <ArrowRightLeft size={14} />
                            </button>
                            {/* Nome direito */}
                            <div onClick={() => onSwitchServer(team, true)} className="flex-1 cursor-pointer active:scale-95 transition-transform flex items-center justify-end pr-2">
                              <span className={`text-xl md:text-2xl font-black truncate px-2 py-0.5 rounded ${isPartnerActive ? 'bg-[#bef264] text-[#1a1a1a] shadow-md' : 'text-white'}`}>{p.partnerName}</span>
                            </div>
                            {/* Botão gênero lado direito */}
                            <button
                              disabled={!isActive}
                              onClick={(e) => { e.stopPropagation(); onToggleGender?.(team, true); }}
                              className={`shrink-0 mr-2 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${genderPartner === 'M' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-pink-50 text-pink-600 border-pink-200'}`}
                              title="Trocar gênero"
                            >
                              {genderPartner === 'M' ? <MarsIcon size={12} /> : <VenusIcon size={12} />}
                            </button>
                          </div>
                        );
                      } else {
                        const genderInitial = p.gender ?? 'M';
                        return (
                          <div key={team} className={`flex items-center justify-center w-full py-2.5 gap-2.5 ${SOLID_COLORS[color]}`}>
                            {/* Botão gênero lado esquerdo */}
                            <button
                              disabled={!isActive}
                              onClick={(e) => { e.stopPropagation(); onToggleGender?.(team, false); }}
                              className={`shrink-0 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${genderInitial === 'M' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-pink-50 text-pink-600 border-pink-200'}`}
                              title="Trocar gênero"
                            >
                              {genderInitial === 'M' ? <MarsIcon size={12} /> : <VenusIcon size={12} />}
                            </button>
                            <div onClick={() => onSwitchServer(team, false)} className="cursor-pointer active:scale-95 transition-transform">
                              <span className={`text-xl md:text-2xl font-black truncate px-2 py-0.5 rounded ${isInitialActive ? 'bg-[#bef264] text-[#1a1a1a] shadow-md' : 'text-white'}`}>{p.name}</span>
                            </div>
                          </div>
                        );
                      }
                    }
 
                    // Pickleball side-out duplas: posições lidas do estado do motor (fonte única de verdade).
                    // t1RightPlayer / t2RightPlayer indicam quem está fisicamente na DIREITA de cada time.
                    const rightName = team === 1
                      ? (pkl!.server.t1RightPlayer || p.name)
                      : (pkl!.server.t2RightPlayer || p.name);
                    const leftName = rightName === p.name ? p.partnerName! : p.name;
                    const rightIsPartner = rightName === p.partnerName;
                    const leftIsPartner  = leftName  === p.partnerName;
 
                    const leftPlayer  = { name: leftName,  isPartner: leftIsPartner };
                    const rightPlayer = { name: rightName, isPartner: rightIsPartner };
 
                    const isLeftActive = isActive && pkl!.server.team === team && pkl!.server.serverName === leftPlayer.name;
                    const isRightActive = isActive && pkl!.server.team === team && pkl!.server.serverName === rightPlayer.name;
 
                    // Gênero dos lados físicos (esq/dir) baseado em qual jogador está em cada posição
                    const leftGender  = leftPlayer.isPartner  ? (p.partnerGender ?? 'M') : (p.gender ?? 'M');
                    const rightGender = rightPlayer.isPartner ? (p.partnerGender ?? 'M') : (p.gender ?? 'M');
                    return (
                      <div key={team} className={`flex items-center w-full py-1.5 ${SOLID_COLORS[color]}`}>
                        {/* Botão gênero lado esquerdo */}
                        <button
                          disabled={!isActive}
                          onClick={(e) => { e.stopPropagation(); onToggleGender?.(team, leftPlayer.isPartner); }}
                          className={`shrink-0 ml-2 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${leftGender === 'M' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-pink-50 text-pink-600 border-pink-200'}`}
                          title="Trocar gênero"
                        >
                          {leftGender === 'M' ? <MarsIcon size={12} /> : <VenusIcon size={12} />}
                        </button>
                        {/* Jogador do lado ESQUERDO da quadra */}
                        <div onClick={() => onSwitchServer(team, leftPlayer.isPartner)} className="flex-1 cursor-pointer active:scale-95 transition-transform flex items-center justify-start pl-2">
                          <span className={`text-xl md:text-2xl font-black truncate px-2 py-0.5 rounded ${isLeftActive ? 'bg-[#bef264] text-[#1a1a1a] shadow-md' : 'text-white'}`}>{leftPlayer.name}</span>
                        </div>
                        {/* Botão trocar lado */}
                        <button
                          disabled={!isActive}
                          onClick={(e) => { e.stopPropagation(); onSwapSides?.(team); }}
                          className="shrink-0 w-8 h-8 rounded-full bg-white text-gray-800 shadow-md flex items-center justify-center active:scale-90 transition-all border border-gray-200"
                          title="Trocar lado dos jogadores"
                        >
                          <ArrowRightLeft size={14} />
                        </button>
                        {/* Jogador do lado DIREITO da quadra */}
                        <div onClick={() => onSwitchServer(team, rightPlayer.isPartner)} className="flex-1 cursor-pointer active:scale-95 transition-transform flex items-center justify-end pr-2">
                          <span className={`text-xl md:text-2xl font-black truncate px-2 py-0.5 rounded ${isRightActive ? 'bg-[#bef264] text-[#1a1a1a] shadow-md' : 'text-white'}`}>{rightPlayer.name}</span>
                        </div>
                        {/* Botão gênero lado direito */}
                        <button
                          disabled={!isActive}
                          onClick={(e) => { e.stopPropagation(); onToggleGender?.(team, rightPlayer.isPartner); }}
                          className={`shrink-0 mr-2 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all active:scale-90 ${rightGender === 'M' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-pink-50 text-pink-600 border-pink-200'}`}
                          title="Trocar gênero"
                        >
                          {rightGender === 'M' ? <MarsIcon size={12} /> : <VenusIcon size={12} />}
                        </button>
                      </div>
                    );
                  };


                  return (
                    <>
                      {renderTeamRow(1)}
                      {renderTeamRow(2)}
                      
                      <PickleballCourtView gameState={effectiveGameState} />
                    </>
                  );
                })()}
             </div>
           </div>

        </div>

        {/* ── NOVO BLOCO: ScoreboardDisplay inline (ponta a ponta) ─────────── */}
        {/* Este bloco substitui visualmente o placar superior. Após validação,  */}
        {/* o bloco original acima (card com WatchBoard) será removido.          */}
        {(() => {
          const BG_COLORS_NEW: Record<string, string> = {
            amarelo: 'bg-yellow-600', azul: 'bg-blue-700', laranja: 'bg-orange-600',
            marrom: 'bg-amber-900', lilas: 'bg-violet-700', verde: 'bg-green-700',
            vermelho: 'bg-red-700', roxo: 'bg-purple-700',
          };
          const SOLID_COLORS_NEW: Record<string, string> = {
            amarelo: 'bg-yellow-500 text-white', azul: 'bg-blue-600 text-white',
            laranja: 'bg-orange-500 text-white', marrom: 'bg-amber-800 text-white',
            lilas: 'bg-violet-500 text-white', verde: 'bg-green-600 text-white',
            vermelho: 'bg-red-600 text-white', roxo: 'bg-purple-600 text-white',
          };
          const TEXT_COLORS_NEW: Record<string, string> = {
            azul: 'text-blue-600', vermelho: 'text-red-600', verde: 'text-green-600',
            amarelo: 'text-yellow-600', laranja: 'text-orange-600',
            lilas: 'text-violet-600', marrom: 'text-amber-800', roxo: 'text-purple-600',
          };
          const isLiveActiveNew = !!(effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)) || !!effectiveCloudLiveExists;
          const fbAckProgressNew = Math.min(100, (firebaseAckElapsedSeconds / 60) * 100);
          const isFbAckLateNew = isLiveActiveNew && firebaseAckElapsedSeconds >= 30;
          const p1Color = effectiveGameState.p1.color || 'azul';
          const p2Color = effectiveGameState.p2.color || 'vermelho';

          const renderServerIndicatorNew = (team: 1 | 2) => {
            const sport = effectiveGameState.matchConfig.sportType;
            if (sport !== 'pickleball' && sport !== 'tennis' && sport !== 'beach-tennis') return null;
            const isServing = effectiveGameState.server === team;
            const isDoubles = effectiveGameState.matchConfig.isDoubles;
            const pkl = effectiveGameState.pickleball;
            const srvNum: 1 | 2 = pkl ? pkl.server.serverNumber : (effectiveGameState.servingOrderOffset >= 2 ? 2 : 1);
            const label = isDoubles ? `S${srvNum}` : 'S';
            const side = (sport === 'pickleball' && pkl) ? pkl.server.side : getTennisServerSide(effectiveGameState);
            const justifyContent = side === 'even' ? 'flex-end' : 'flex-start';
            const posClass = team === 1 ? 'bottom-3' : 'top-3';
            const textColorClass = team === 1 ? TEXT_COLORS_NEW[p1Color] : TEXT_COLORS_NEW[p2Color];

            const show3Digit = sport === 'pickleball' && isDoubles && effectiveGameState.matchConfig.pickleballScoringMode !== 'rally' && !!pkl;
            const get3DigitScore = () => {
              if (!pkl) return '';
              if (pkl.isFirstServerActive && pkl.score.team1 === 0 && pkl.score.team2 === 0) return '0-0-2';
              return `${pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2}-\ ${pkl.server.team === 1 ? pkl.score.team2 : pkl.score.team1}-\ ${pkl.server.serverNumber}`.replace(/- /g, '-');
            };

            return (
              <div className={`absolute ${posClass} left-3 right-3 flex items-center z-20 pointer-events-none`} style={{ justifyContent: isServing ? 'space-between' : justifyContent }}>
                {isServing && side === 'even' && show3Digit && (
                  <span className="text-white/80 font-black tracking-widest text-xl bg-black/45 px-4 py-1.5 rounded-full">{get3DigitScore()}</span>
                )}
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0"
                  style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.4)', opacity: isServing ? 1 : 0, transition: 'opacity 150ms' }}>
                  <span className={`text-sm font-black leading-none ${textColorClass}`}>{label}</span>
                </div>
                {isServing && side === 'odd' && show3Digit && (
                  <span className="text-white/80 font-black tracking-widest text-xl bg-black/45 px-4 py-1.5 rounded-full">{get3DigitScore()}</span>
                )}
              </div>
            );
          };

          // ── renderSetHistory inline ──────────────────────────────────────
          const renderSetHistoryNew = (team: 1 | 2) => {
            const p = team === 1 ? effectiveGameState.p1 : effectiveGameState.p2;
            const currentSet = effectiveGameState.currentSet ?? 0;
            const isMatchOver = effectiveGameState.isMatchOver;

            let isMatchWinner = false;
            if (isMatchOver) {
              const p1WonSets = effectiveGameState.p1.sets.filter((s, i) => s > (effectiveGameState.p2.sets[i] ?? 0)).length;
              const p2WonSets = effectiveGameState.p2.sets.filter((s, i) => s > (effectiveGameState.p1.sets[i] ?? 0)).length;
              isMatchWinner = team === 1 ? p1WonSets > p2WonSets : p2WonSets > p1WonSets;
            }

            const pastSets = isMatchOver 
              ? (p?.sets || []).slice(0, -1) 
              : (p?.sets || []).slice(0, currentSet);

            const currentScore = isMatchOver 
              ? (p?.sets && p.sets.length > 0 ? p.sets[p.sets.length - 1] : 0)
              : (p?.games ?? 0);

            return (
              <div className="flex gap-3 items-end">
                {pastSets.map((games: number, i: number) => (
                  <span key={i} className="font-black leading-none text-white text-7xl opacity-50">{games}</span>
                ))}
                {pastSets.length > 0 && (
                  <span className="font-black leading-none text-white/30 text-7xl select-none">|</span>
                )}
                <span
                  role="button"
                  className="font-black leading-none text-[#bef264] text-7xl flex items-center gap-2 relative overflow-hidden rounded px-1 touch-none"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleScoreCardPointerDown(e, 'gameSet', team);
                  }}
                  onPointerMove={(e) => {
                    e.stopPropagation();
                    handlePointerMove(e);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    handleScoreCardPointerUp('gameSet', team);
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                    if (scoreProgressIntervalRef.current) clearInterval(scoreProgressIntervalRef.current);
                    setScorePressProgress(null);
                  }}
                >
                  {scorePressProgress?.player === team && scorePressProgress?.type === 'gameSet' && (
                    <span
                      className="absolute inset-0 bg-white/20 origin-left transition-all duration-75 z-0"
                      style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }}
                    />
                  )}
                  <span className="relative z-10">{currentScore}</span>
                  {isMatchOver && isMatchWinner && (
                    <Trophy size={48} className="text-yellow-400 animate-bounce" style={{ animationIterationCount: 3 }} />
                  )}
                </span>
              </div>
            );
          };

          // ── renderTeamBlock inline ───────────────────────────────────────
          const renderTeamBlockNew = (team: 1 | 2) => {
            const p = team === 1 ? effectiveGameState.p1 : effectiveGameState.p2;
            const color = p.color || (team === 1 ? 'azul' : 'vermelho');
            const isServing = effectiveGameState.server === team;

            const games = <div className="z-10">{renderSetHistoryNew(team)}</div>;

            return (
              <div
                className={`flex-1 ${BG_COLORS_NEW[color]} relative flex flex-col p-5 overflow-hidden`}
                onPointerDown={(e) => handleScoreCardPointerDown(e, 'game', team)}
                onPointerMove={handlePointerMove}
                onPointerUp={() => handleScoreCardPointerUp('game', team)}
                onPointerCancel={() => {
                  if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                  if (scoreProgressIntervalRef.current) clearInterval(scoreProgressIntervalRef.current);
                  setScorePressProgress(null);
                }}
              >
                {scorePressProgress?.player === team && scorePressProgress?.type === 'game' && (
                  <div className="absolute inset-0 bg-white/20 origin-left transition-all duration-75 z-0" style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} />
                )}
                {/* Número grande */}
                {team === 1 && (
                  <div className="absolute top-[60px] bottom-0 left-0 right-0 flex justify-center items-center z-0">
                    <span
                      className={`font-black leading-none tabular-nums tracking-tighter select-none transition-all duration-300 ${isServing ? 'text-[#bef264]' : 'text-white'} ${!isCommandOwner ? 'opacity-70' : ''}`}
                      style={{ fontSize: 'clamp(100px, 20vh, 220px)' }}
                    >
                      {showSetGamesInMainScore ? p.games : p.score}
                    </span>
                  </div>
                )}
                {team === 2 && (
                  <div className="absolute top-0 bottom-[60px] left-0 right-0 flex justify-center items-center z-0">
                    <span
                      className={`font-black leading-none tabular-nums tracking-tighter select-none transition-all duration-300 ${isServing ? 'text-[#bef264]' : 'text-white'} ${!isCommandOwner ? 'opacity-70' : ''}`}
                      style={{ fontSize: 'clamp(100px, 20vh, 220px)' }}
                    >
                      {showSetGamesInMainScore ? p.games : p.score}
                    </span>
                  </div>
                )}
                {/* Time 1: games no topo */}
                {team === 1 && (
                  <div className="z-10 flex flex-col gap-1">
                    {games}
                  </div>
                )}
                {/* Time 2: games no fundo */}
                {team === 2 && (
                  <div className="absolute bottom-3 left-5 z-10">
                    {games}
                  </div>
                )}
                {/* Indicador de sacador */}
                {renderServerIndicatorNew(team)}
                {/* FB Sync Badge — pílula discreta com contador e bolinha de status */}
                {effectiveFbSyncStatus?.team === team && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 pointer-events-none flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-full px-4 py-2 shadow-md">
                    <span className="text-[18px] font-black text-gray-700 leading-none tabular-nums">
                      FB|{effectiveFbSyncStatus.seq}
                    </span>
                    <span
                      className={`w-4 h-4 rounded-full animate-pulse flex-shrink-0 ${
                        effectiveFbSyncStatus.isObserver ? 'bg-blue-500' : 'bg-green-500'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          };

          return (
            <div className="-mx-4 mt-6 bg-black flex flex-col select-none touch-pan-y overflow-hidden" style={{ height: '580px' }}>
              {/* Time 1 */}
              {renderTeamBlockNew(1)}

              {/* Faixa central: 4 botões idênticos ao WatchBoard */}
              <div className="h-20 bg-black border-y border-white/10 flex items-center justify-around px-2 pt-2 shrink-0 z-10 relative overflow-hidden">
                {isLiveActiveNew && (
                  <div className="absolute top-1 left-6 right-6 h-2 z-20 pointer-events-none bg-white/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full w-full origin-left rounded-full transition-transform duration-500 ${isFbAckLateNew ? 'bg-white' : 'bg-white/95'}`}
                      style={{ transform: `scaleX(${fbAckProgressNew / 100})` }}
                    />
                    {FB_ACK_MARK_SECONDS.map(seconds => (
                      <span
                        key={seconds}
                        className="absolute top-0 bottom-0 w-[2px] bg-black/95"
                        style={{ left: `${(seconds / 60) * 100}%`, transform: 'translateX(-1px)' }}
                      />
                    ))}
                    {isFbAckLateNew && <div className="absolute inset-0 bg-[#bef264] animate-pulse" />}
                  </div>
                )}
                <button
                  onPointerDown={() => { if (!isCommandOwner) return; handleUndoWithLog(); }}
                  disabled={!isCommandOwner}
                  className={`w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white border border-white/5 transition-all ${!isCommandOwner ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'}`}
                >
                  <RotateCcw size={34} strokeWidth={4} />
                </button>
                <button
                  disabled={!isCommandOwner}
                  onPointerDown={() => { if (!isCommandOwner) return; onScoreUpdate(effectiveGameState.server, 'ace', 'cb'); }}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all ${SOLID_COLORS_NEW[effectiveGameState.server === 1 ? p1Color : p2Color]} ${!isCommandOwner ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'}`}
                >
                  <Zap size={30} fill="currentColor" />
                </button>
                <div
                  role={isPublicView ? undefined : "button"}
                  onPointerDown={isPublicView ? undefined : () => setNewMenuOpen(true)}
                  style={isPublicView ? { pointerEvents: 'none', cursor: 'default' } : undefined}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform border-2 relative overflow-hidden cursor-pointer ${isLiveActiveNew ? 'border-emerald-400 bg-white/5 text-emerald-400' : isOfflineMode ? 'border-yellow-400 bg-yellow-500 text-black' : 'border-white bg-emerald-500 text-white'}`}
                >
                  {isLiveActiveNew
                    ? <LiveIndicator role={effectiveIndicatorRole} status={isLiveActiveNew ? (isCommandOwner ? 'controller' : 'watcher') : undefined} variant="header" className="w-full h-full pointer-events-none" />
                    : isOfflineMode ? <WifiOff size={30} className="relative z-10" /> : <Wifi size={30} className="relative z-10" />
                  }
                </div>
                <button
                  disabled={!isCommandOwner}
                  onPointerDown={() => { if (!isCommandOwner) return; onScoreUpdate(effectiveGameState.server === 1 ? 2 : 1, 'fault', 'cb'); }}
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all ${SOLID_COLORS_NEW[effectiveGameState.server === 1 ? p2Color : p1Color]} ${!isCommandOwner ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'}`}
                >
                  <X size={34} strokeWidth={5} />
                </button>
              </div>

              {/* Time 2 */}
              {renderTeamBlockNew(2)}

              {/* Bottom sheet modal */}
              {newMenuOpen && (
                <div className="fixed inset-0 z-[999999] flex flex-col justify-end" onPointerDown={() => setNewMenuOpen(false)}>
                  <div className="bg-[#1e293b] rounded-t-3xl border-t border-white/10 p-4 space-y-2" onPointerDown={e => e.stopPropagation()}>
                    <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
                    {isLiveActiveNew && (
                      <div role={isPublicView ? undefined : "button"} onPointerDown={() => { if (!isPublicView) { setNewMenuOpen(false); onOpenLiveControl?.(); } }}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-colors ${isPublicView ? 'bg-white/5 opacity-40 cursor-not-allowed' : 'bg-white/5 active:bg-white/10 cursor-pointer text-white'}`}>
                        <LiveIndicator role={effectiveIndicatorRole} status={isLiveActiveNew ? (isCommandOwner ? 'controller' : 'watcher') : undefined} variant="header" className={`w-8 h-8 shrink-0 ${isPublicView ? 'grayscale opacity-50' : ''}`} />
                        <span className={`font-black text-sm ${isPublicView ? 'text-white/50' : ''}`}>Live / Controle</span>
                      </div>
                    )}
                    {/* Modo placar — logo abaixo de Live/Controle */}
                    {(() => {
                      const isWatchMode = !!effectiveGameState.matchConfig.isWatchMode;
                      const isScoreboardMode = !!effectiveGameState.matchConfig.isScoreboardMode;
                      const currentMode = isScoreboardMode ? 'scoreboard' : (isWatchMode ? 'watch' : 'control');
                      const show3WayToggle = !isOfflineMode;

                      const handleModeChange = (targetMode: 'control' | 'watch' | 'scoreboard') => {
                        if (currentMode === targetMode) return;

                        if (targetMode === 'control') {
                          if (isWatchMode) onToggleWatchMode?.();
                          if (isScoreboardMode) onToggleScoreboardMode?.();
                        } else if (targetMode === 'watch') {
                          if (isScoreboardMode) onToggleScoreboardMode?.();
                          if (!isWatchMode) onToggleWatchMode?.();
                        } else if (targetMode === 'scoreboard') {
                          if (isWatchMode) onToggleWatchMode?.();
                          if (!isScoreboardMode) onToggleScoreboardMode?.();
                        }
                      };

                      return show3WayToggle && (
                        <div className="w-full flex items-center justify-between gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-sm">
                              {currentMode === 'control' && 'Placar'}
                              {currentMode === 'watch' && 'Modo relógio'}
                              {currentMode === 'scoreboard' && 'Modo placar'}
                            </span>
                          </div>

                          <div className="flex-1 flex bg-slate-800/80 rounded-xl p-0.5 border border-white/5 gap-1.5">
                            <button
                              onPointerDown={() => handleModeChange('control')}
                              className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all ${
                                currentMode === 'control' ? 'bg-emerald-500 text-white shadow-md scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'
                              }`}
                              title="Placar"
                            >
                              <SquareKanban size={16} />
                            </button>
                            <button
                              onPointerDown={() => handleModeChange('watch')}
                              className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all ${
                                currentMode === 'watch' ? 'bg-emerald-500 text-white shadow-md scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'
                              }`}
                              title="Modo relógio"
                            >
                              <Watch size={16} />
                            </button>
                            <button
                              onPointerDown={() => handleModeChange('scoreboard')}
                              className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all ${
                                currentMode === 'scoreboard' ? 'bg-emerald-500 text-white shadow-md scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'
                              }`}
                              title="Modo placar"
                            >
                              <Cast size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    <button onPointerDown={() => { setNewMenuOpen(false); onNavigateToTab?.('regras'); }}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 active:bg-white/10 text-white transition-colors">
                      <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-emerald-500 rounded-xl"><Settings size={18} /></div>
                      <span className="font-black text-sm">Regras</span>
                    </button>
                    {/* Espelhar Placar — modo offline */}
                    {isOfflineMode && (
                      <button
                        id="btn-scoreboard-espelhar"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewMenuOpen(false);
                          window.dispatchEvent(new CustomEvent('localSync:openPairing'));
                        }}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-colors ${
                          localSync.syncState.role !== 'none' && localSync.syncState.status !== 'idle'
                            ? 'bg-orange-500/20 active:bg-orange-500/30 text-orange-400'
                            : 'bg-white/5 active:bg-white/10 text-white'
                        }`}
                      >
                        <div className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-xl ${
                          localSync.syncState.role !== 'none' && localSync.syncState.status !== 'idle'
                            ? 'bg-orange-500/30'
                            : 'bg-slate-600'
                        }`}>
                          <MonitorSmartphone size={18} />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="font-black text-sm">
                            {localSync.syncState.status === 'connected' ? 'Espelhando...' : 'Espelhar Placar'}
                          </span>
                          {localSync.syncState.pin && localSync.syncState.status !== 'idle' && (
                            <span className="text-xs opacity-60">PIN {localSync.syncState.pin}</span>
                          )}
                        </div>
                      </button>
                    )}
                    {isCommandOwner && onResetMatch && (
                      <button onPointerDown={() => { setNewMenuOpen(false); onResetMatch(); }}
                        className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-red-500/20 active:bg-red-500/30 text-red-400 transition-colors">
                        <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-red-500/30 rounded-xl"><RefreshCw size={18} /></div>
                        <span className="font-black text-sm">Zerar partida</span>
                      </button>
                    )}

                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {/* ── FIM NOVO BLOCO ──────────────────────────────────────────────────── */}

        {!isOfflineMode && (
          <div className="flex flex-col gap-5 mt-8">
            <div className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-gray-100 w-full overflow-hidden">
               <div 
                 className="flex items-center justify-between mb-0 border-b border-gray-50 pb-3 cursor-pointer select-none"
                 onClick={() => setIsLogsOpen(!isLogsOpen)}
               >
                 <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-blue-50 rounded-lg">
                     <ListTodo size={18} className="text-blue-500" />
                   </div>
                   <span className="text-gray-900 font-black text-sm tracking-tight">Log de comandos</span>
                 </div>
                 <div className="flex items-center gap-2">
                   {isLogsOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                 </div>
               </div>
               {isLogsOpen && (
                 <div className="flex flex-col gap-3 font-mono max-h-[420px] overflow-y-auto pr-2 no-scrollbar mt-4 animate-in slide-in-from-top-2 duration-300">
                    {effectiveVoiceLogs.length === 0 ? (
                      <div className="py-10 flex items-center justify-center text-gray-300 text-[11px] font-bold italic text-center">Aguardando comandos...</div>
                    ) : (
                      effectiveVoiceLogs.map((log) => {
                         const [b1, b2] = log.before.split('-'); 
                         const [a1, a2] = log.after.split('-'); 
                         const cmdColor = log.winner === 1 ? TEXT_COLORS[effectiveGameState.p1.color || 'azul'] : log.winner === 2 ? TEXT_COLORS[effectiveGameState.p2.color || 'vermelho'] : log.isError ? 'text-red-600' : 'text-slate-500';
                         return (
                           <div key={log.id} className={`flex items-start gap-2.5 p-2.5 rounded-2xl border shadow-xs transition-all animate-in fade-in slide-in-from-left-2 duration-300 ${log.isError ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                             <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${log.isError ? 'bg-red-600 text-white' : (log.isRemote ? 'bg-sky-500 text-white' : 'bg-green-500 text-white')}`}>{log.isError ? <X size={14} className="stroke-[4]" /> : (log.source?.toLowerCase().includes('w') ? <Watch size={14} className="text-white" strokeWidth={3} /> : <CheckCircle size={14} className="text-white" strokeWidth={4} />)}</div>
                             <div className="flex-1 font-mono text-[11px] overflow-hidden leading-tight">
                               <div className="flex items-center flex-wrap gap-x-1.5 text-slate-500">
                                 <span className={`font-black ${TEXT_COLORS[effectiveGameState.p1.color || 'azul']}`}>{log.source?.toUpperCase() || (log.isRemote ? 'WB' : 'CB')}#</span>
                                 {!log.isError && <span className={`${TEXT_COLORS[effectiveGameState.p1.color || 'azul']} font-bold`}>[{log.liveSequence}]</span>}
                                 {!log.isError && <>
                                     <span className="opacity-30">|</span>
                                     <span className="font-bold"><span className="text-black">I: </span><span className={TEXT_COLORS[effectiveGameState.p1.color || 'azul']}>{b1}</span><span className="mx-0.5">-</span><span className={TEXT_COLORS[effectiveGameState.p2.color || 'vermelho']}>{b2}</span></span>
                                     <span className="font-black text-orange-500"><span className="text-black ml-1 mr-0.5"> F: </span><span className={TEXT_COLORS[effectiveGameState.p1.color || 'azul']}>{a1}</span><span className="mx-0.5">-</span><span className={TEXT_COLORS[effectiveGameState.p2.color || 'vermelho']}>{a2}</span></span>
                                   </>}
                               </div>
                               <div className={`font-black mt-0.5 truncate ${cmdColor}`}>[ {log.text} ]</div>
                               <div className="flex items-center gap-1.5 mt-0.5 text-black font-bold text-[10px]"><span>{log.startTime}</span>{!log.isError && <><span className="opacity-30">|</span><span>{log.latency}ms</span></>}</div>
                             </div>
                           </div>
                         );
                       })
                    )}
                 </div>
               )}
            </div>
            {effectiveGameState.matchConfig.isHistoryEnabled && (
              <div className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-gray-100 w-full overflow-hidden">
                 <div 
                   className="flex items-center justify-between mb-0 cursor-pointer select-none"
                   onClick={() => setIsTimelineOpen(!isTimelineOpen)}
                 >
                   <div className="flex items-center gap-2">
                     <div className="p-1.5 bg-blue-50 rounded-lg">
                       <Activity size={18} className="text-blue-500" />
                     </div>
                     <span className="text-gray-900 font-black text-sm tracking-tight">Cronologia da partida</span>
                   </div>
                   <div className="flex items-center gap-2">
                     {isTimelineOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                   </div>
                 </div>
                 {isTimelineOpen && (
                   <div className="mt-6 animate-in slide-in-from-top-2 duration-300">
                     <MatchTimeline history={effectiveGameState.pointHistory ?? []} p1Sets={effectiveGameState.p1.sets} p2Sets={effectiveGameState.p2.sets} isMatchOver={effectiveGameState.isMatchOver} p1Color={effectiveGameState.p1.color} p2Color={effectiveGameState.p2.color} />
                   </div>
                 )}
              </div>
            )}
            <div className={`bg-[#0f172a] rounded-[3rem] p-4 pl-6 pr-6 shadow-2xl border border-white/50 w-full animate-in fade-in duration-700 flex flex-col gap-4 overflow-hidden transition-all duration-500 ${effectiveGameState.isConfirmedFinished ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                     <div className={`w-12 h-12 rounded-2xl transition-all duration-500 flex items-center justify-center shadow-lg ${effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) ? 'bg-sky-500' : 'bg-slate-800'}`}><QrCode size={24} className="text-white" /></div>
                     <div className="flex flex-col min-w-0"><h3 className="text-white font-black text-lg tracking-tight leading-none mb-1">Abrir live</h3><p className="text-[10px] font-bold text-slate-400 truncate tracking-tight">Compartilhe o placar em tempo real com qualquer dispositivo.</p></div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                     {isLiveActive && <button onClick={() => setIsMirrorExpanded(!isMirrorExpanded)} className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center active:scale-90 transition-all border border-white/50">{isMirrorExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>}
                     <div className="flex items-center h-7 px-0.5">
                       <div className="relative inline-block w-12 h-7 align-middle select-none transition duration-200 ease-in">
                         <input type="checkbox" id="toggle-mirroring" checked={isLiveActive || false} onChange={(e) => handleToggleMirroringLocal(e.target.checked)} disabled={effectiveGameState.isConfirmedFinished || (effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300 ease-in-out shadow-sm top-[2px] left-[2px] checked:translate-x-full" />
                         <label htmlFor="toggle-mirroring" className={`toggle-label block overflow-hidden h-7 rounded-full cursor-pointer transition-colors duration-300 ease-in-out ${isLiveActive ? 'bg-[#22c55e]' : 'bg-slate-800'}`}></label>
                       </div>
                     </div>
                  </div>
               </div>
               {isLiveActive && isMirrorExpanded && (
                 <div className="mt-4 space-y-6 animate-in zoom-in duration-500 border-t border-white/5 pt-6">
                    {isAdmin && <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Globe size={14} className="text-blue-400" /><span className="text-[10px] font-black text-blue-400 tracking-tight">Endereço público do app</span></div><button onClick={() => setIsEditingUrl(!isEditingUrl)} className="text-gray-400 p-1 active:scale-90 transition-all"><Edit3 size={14} /></button></div>{isEditingUrl ? <div className="flex gap-2 animate-in slide-in-from-top-1"><input type="text" value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)} placeholder="https://seu-link-real.app/" className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xs text-white outline-none" /><button onClick={handleSaveBaseUrl} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black">Ok</button></div> : <p className="text-[11px] font-bold text-gray-400 truncate bg-black/20 p-2 rounded-xl border border-white/5">{customBaseUrl}</p>}</div>}
                    <div className="flex flex-col items-center gap-8 w-full"><div className="bg-white p-3 rounded-3xl shadow-2xl w-48 h-48 flex items-center justify-center shrink-0 border-4 border-sky-500/20"><img src={qrCodeUrl} alt="QR code" className="w-full h-full object-contain" /></div><div className="w-full space-y-3"><button onClick={handleShareWhatsApp} className="w-full bg-[#25D366] text-white py-4 px-8 rounded-2xl font-black text-xs items-center justify-center gap-3 shadow-lg active:scale-95 transition-all flex"><Share2 size={18} /> WhatsApp</button><button onClick={handleCopyLink} className="w-full bg-white/10 text-white py-4 px-8 rounded-2xl font-black text-xs items-center justify-center gap-3 border border-white/20 active:scale-95 transition-all flex">{copiedType === 'link' ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}{copiedType === 'link' ? 'Link copiado!' : 'Copiar link'}</button><button onClick={handleCopyWatchLink} className="w-full bg-indigo-600 text-white py-4 px-8 rounded-2xl font-black text-xs items-center justify-center gap-3 shadow-lg active:scale-95 transition-all flex">{copiedType === 'watch' ? <Check size={18} className="text-green-400" /> : <Watch size={18} />}{copiedType === 'watch' ? 'Link copiado!' : 'Link para relógio'}</button></div></div>
                 </div>
               )}
            </div>
            {isLiveActive && (
            <div className={`bg-white rounded-[2.5rem] p-4 pl-7 pr-7 shadow-sm border border-gray-100 w-full animate-in fade-in transition-all duration-500 ${effectiveGameState.isConfirmedFinished ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-inner"><Wifi size={22} /></div><h3 className="text-gray-900 font-black text-lg tracking-tight leading-none">Live</h3></div>
                  <button onClick={() => setIsLiveExpanded(!isLiveExpanded)} className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center active:scale-90 transition-all border border-gray-100">{isLiveExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
               </div>
               {isLiveExpanded && <div className="space-y-4 animate-in zoom-in duration-300">
                   <div className="space-y-2.5"><div className="flex items-center gap-2 px-1"><MonitorSmartphone size={16} className="text-gray-400" /><span className="text-[11px] font-bold text-gray-500">Dispositivos participantes</span></div><div className="flex flex-wrap gap-2">{groupedControllers.map(({ id, label, nickname, isOnline, isOwner, role, status, deviceType, isActiveController, ageSeconds, heartbeatStatus, heartbeatProgress }) => {
                    // Ícone do tipo físico do dispositivo
                    const DeviceIcon = deviceType === 'watch' ? Watch : deviceType === 'laptop' ? Laptop : deviceType === 'tablet' ? Monitor : Smartphone;
                    // Nome: nickname do Firebase quando disponível, senão extrai do label
                    // Extrai o nickname do label em 3 formatos:
                    // 1. nickname explícito do Firebase (ex: "Celso")
                    // 2. após " - " (ex: "Note - celso" → "celso")
                    // 3. entre parênteses (ex: "Relógio (Celso)" → "Celso")
                    // 4. label completo como fallback
                    const shortLabel = nickname
                      || (label.includes(' - ') ? label.split(' - ').slice(1).join(' - ') : null)
                      || (label.includes('(') && label.includes(')') ? label.slice(label.indexOf('(') + 1, label.lastIndexOf(')')) : null)
                      || label;
                    // Badge 1 — papel hierárquico (Dono / Juiz): só aparece se aplicável
                    const isCtrlActive = status === 'controller' && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed);
                    // proteção dupla: role já foi corrigido acima, mas garantimos aqui também
                    const showHierarchyBadge = isOwner || (role === 'judge' && !isOwner);
                    const HierarchyIcon = isOwner ? Crown : Gavel;
                    const hierarchyColor = isOwner ? 'text-blue-600' : 'text-emerald-500';
                    const hierarchyLabel = isOwner ? 'Dono' : 'Juiz';
                    // Badge 2 — papel operacional (Ctrl / observador): sempre aparece
                     const OperIcon = isCtrlActive ? Gamepad2 : Eye;
                     const operColor = isCtrlActive ? 'text-orange-500' : 'text-blue-400';
                     const operLabel = isCtrlActive ? 'Ctrl' : 'Obs';
                     const heartbeatColor =
                       heartbeatStatus === 'ok'
                         ? 'bg-emerald-500'
                         : heartbeatStatus === 'slow'
                         ? 'bg-[#bef264]'
                         : 'bg-red-500';
                     const heartbeatTextColor =
                       heartbeatStatus === 'ok'
                         ? 'text-emerald-600'
                         : heartbeatStatus === 'slow'
                         ? 'text-lime-600'
                         : 'text-red-600';
                     const heartbeatTitle = `Último sinal há ${ageSeconds}s`;
                     return (
                       <div key={id} title={heartbeatTitle} className={`relative overflow-hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all duration-300 ${isCtrlActive ? 'bg-orange-50 border-orange-200 text-orange-700 shadow-sm ring-2 ring-orange-100' : isOnline ? 'bg-white border-gray-200 text-gray-600' : 'bg-white border-gray-100 text-gray-400 opacity-50'} ${heartbeatStatus === 'late' ? 'ring-2 ring-red-100' : ''}`}>
                         <div className="absolute left-0 bottom-0 h-0.5 bg-gray-100 w-full" />
                         <div className={`absolute left-0 bottom-0 h-0.5 ${heartbeatColor} transition-all duration-500 ${heartbeatStatus === 'late' ? 'animate-pulse' : ''}`} style={{ width: `${heartbeatProgress}%` }} />
                         <span className={`relative z-10 w-2 h-2 rounded-full ${heartbeatColor} ${heartbeatStatus !== 'ok' ? 'animate-pulse' : ''}`} />
                         <DeviceIcon size={12} className={isCtrlActive ? 'text-orange-500' : 'text-gray-400'} />
                         <span className="text-[10px] font-black">{shortLabel}</span>
                        {showHierarchyBadge && (
                          <div className={`flex items-center gap-0.5 pl-1 border-l border-gray-200 ${hierarchyColor}`}>
                            <HierarchyIcon size={11} />
                            <span className="text-[9px] font-bold">{hierarchyLabel}</span>
                          </div>
                        )}
                         <div className={`flex items-center gap-0.5 pl-1 border-l border-gray-200 ${operColor}`}>
                           <OperIcon size={11} />
                           {operLabel && <span className="text-[9px] font-bold">{operLabel}</span>}
                         </div>
                         <span className={`text-[8px] font-black tabular-nums ${heartbeatTextColor}`}>{ageSeconds}s</span>
                       </div>
                     );
                  })}</div></div>
                   <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100"><div className="flex items-center gap-2.5"><CheckCircle size={16} className="text-gray-400" /><span className="text-[11px] font-bold text-gray-500">Sincronização confirmada</span></div><div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-colors ${(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) ? <X size={12} strokeWidth={4} /> : <Check size={12} strokeWidth={4} />}<span className="text-[10px] font-black">{(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) ? 'Encerrado' : 'Ativo'}</span></div></div>
                    {/* Recurso de inserir juiz - Apenas para o proprietário */}
                    {effectiveIsOriginalOwner && (
                      <div className="w-full space-y-4">
                        <div className="flex items-center gap-2 px-1">
                          <Gavel size={16} className="text-gray-400" />
                          <span className="text-[11px] font-bold text-gray-500">Juiz da partida</span>
                        </div>

                        {effectiveGameState?.judgePin ? (
                          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-black">{effectiveGameState.judgeNickname}</span>
                                <span className="text-[10px] font-bold text-slate-400">{maskPin(effectiveGameState.judgePin)}</span>
                              </div>
                              {/* Status do Juiz */}
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black ${isJudgeOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                <div className={`w-1 h-1 rounded-full ${isJudgeOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                                {isJudgeOnline ? 'Online' : 'Offline'}
                              </div>
                            </div>
                            <button 
                              onClick={onDeleteJudge}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <Input 
                              value={judgePinInput || ''}
                              onChange={(e) => setJudgePinInput?.(e.target.value.toUpperCase().slice(0, 5))}
                              placeholder="PIN do Juiz"
                              enableVoice
                              enableCamera
                              className="bg-white border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:bg-white transition-all"
                              rightAction={
                                <div className="flex items-center gap-1">
                                  {isSearchingJudgePin && <Loader2 size={16} className="animate-spin text-blue-500 mr-1" />}
                                  <button 
                                    onClick={onSelectJudgeFromPartners}
                                    className="p-2 text-[#40E0D0] hover:text-[#30C0B0] transition-all active:scale-75"
                                  >
                                    <Users size={18} />
                                  </button>
                                </div>
                              }
                            />
                            
                            {judgeNicknameLookup && (
                              <div className="flex items-center gap-2 px-4 animate-in fade-in slide-in-from-top-2">
                                <User size={14} className="text-blue-500" />
                                <span className="text-xs font-black text-blue-600">{judgeNicknameLookup}</span>
                              </div>
                            )}

                            <button 
                              onClick={onAddJudge}
                              disabled={!judgeNicknameLookup || judgeNicknameLookup === "Usuário não localizado" || isSavingJudge}
                              className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-xs disabled:opacity-50 active:scale-95 transition-all"
                            >
                              {isSavingJudge ? 'Salvando...' : 'Adicionar juiz'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {effectiveGameState.judgeNickname && !isCommandOwner && (
                      <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <Gavel size={16} className="text-gray-400" />
                          <span className="text-[11px] font-bold text-gray-500">Juiz da partida</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {effectiveGameState.commandOwner === effectiveGameState.judgeNickname && <CheckCircle size={14} className="text-blue-600" />}
                          <span className="text-[10px] font-black text-blue-600">{effectiveGameState.judgeNickname}</span>
                        </div>
                      </div>
                    )}
                   {/* MC1: Network diagnostic block removed per user request */}
                 </div>}
            </div>
            )}
            {/* ─── Log Live ─────────────────────────────────────────────────── */}
            {isLiveActive && (
              <div className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-gray-100 w-full overflow-hidden animate-in fade-in duration-500">
                <div
                  className="flex items-center justify-between mb-0 cursor-pointer select-none"
                  onClick={() => setIsLiveLogOpen(v => !v)}
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-sky-50 rounded-lg relative">
                      <Wifi size={18} className="text-sky-500" />
                      {effectiveLiveLogs.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-sky-500 rounded-full text-[7px] font-black text-white flex items-center justify-center">{Math.min(effectiveLiveLogs.length, 9)}</span>
                      )}
                    </div>
                    <span className="text-gray-900 font-black text-sm tracking-tight">Log Live</span>
                    {effectiveGameState.isMirroringActive && !(effectiveGameState.isMirroringActive && effectiveGameState.isLiveClosed) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-emerald-600">AO VIVO</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isLiveLogOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </div>
                {isLiveLogOpen && (
                  <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1 no-scrollbar mt-5 animate-in slide-in-from-top-2 duration-300">
                    {effectiveLiveLogs.length === 0 ? (
                      <div className="py-10 flex items-center justify-center text-gray-300 text-[11px] font-bold italic text-center">Aguardando eventos da live...</div>
                    ) : (
                      effectiveLiveLogs.map(log => {
                        const iconMap: Record<LiveLogType, React.ReactNode> = {
                          live_created:     <QrCode size={12} />,
                          control_taken:    <Crown size={12} />,
                          match_started:    <Zap size={12} />,
                          score:            <Activity size={12} />,
                          participant_join: <UserPlus size={12} />,
                          participant_leave:<X size={12} />,
                          match_over:       <Trophy size={12} />,
                          match_confirmed:  <ShieldCheck size={12} />,
                          fb_ack:           <Wifi size={12} />,
                          observers_ack:    <Eye size={12} />,
                          live_closed:      <WifiOff size={12} />,
                          judge_added:      <Gavel size={12} />,
                          judge_removed:    <Trash2 size={12} />,
                          new_match:        <RotateCcw size={12} />,
                          match_reset:      <RotateCcw size={12} />,
                        };
                        const dotColor: Record<LiveLogType, string> = {
                          live_created:     'bg-sky-500 text-white',
                          control_taken:    'bg-blue-600 text-white',
                          match_started:    'bg-emerald-500 text-white',
                          score:            'bg-orange-400 text-white',
                          participant_join: 'bg-teal-500 text-white',
                          participant_leave:'bg-gray-400 text-white',
                          match_over:       'bg-yellow-500 text-white',
                          match_confirmed:  'bg-emerald-700 text-white',
                          fb_ack:           log.ok === undefined ? 'bg-slate-300 text-white' : log.ok ? 'bg-sky-500 text-white' : 'bg-red-500 text-white',
                          observers_ack:    'bg-cyan-500 text-white',
                          live_closed:      'bg-red-500 text-white',
                          judge_added:      'bg-violet-500 text-white',
                          judge_removed:    'bg-rose-400 text-white',
                          new_match:        'bg-indigo-500 text-white',
                          match_reset:      'bg-amber-500 text-white',
                        };
                        const rowBg: Record<LiveLogType, string> = {
                          live_created:     'bg-sky-50 border-sky-100',
                          control_taken:    'bg-blue-50 border-blue-100',
                          match_started:    'bg-emerald-50 border-emerald-100',
                          score:            'bg-orange-50 border-orange-100',
                          participant_join: 'bg-teal-50 border-teal-100',
                          participant_leave:'bg-gray-50 border-gray-200',
                          match_over:       'bg-yellow-50 border-yellow-100',
                          match_confirmed:  'bg-emerald-50 border-emerald-200',
                          fb_ack:           log.ok === undefined ? 'bg-slate-50 border-slate-200' : log.ok ? 'bg-sky-50 border-sky-100' : 'bg-red-50 border-red-100',
                          observers_ack:    'bg-cyan-50 border-cyan-100',
                          live_closed:      'bg-red-50 border-red-100',
                          judge_added:      'bg-violet-50 border-violet-100',
                          judge_removed:    'bg-rose-50 border-rose-100',
                          new_match:        'bg-indigo-50 border-indigo-100',
                          match_reset:      'bg-amber-50 border-amber-100',
                        };
                        // ── Ícones compostos para eventos de participante ──────────
                        const hasParticipantMeta = log.deviceType || log.participantRole || log.isController !== undefined;
                        const deviceIconMap: Record<string, React.ReactNode> = {
                          watch:  <Watch size={11} />,
                          phone:  <Smartphone size={11} />,
                          tablet: <Monitor size={11} />,
                          laptop: <Laptop size={11} />,
                        };
                        const roleIconMap: Record<string, React.ReactNode> = {
                          owner: <Crown size={11} />,
                          judge: <Gavel size={11} />,
                        };
                        const deviceBubbleColor = 'bg-slate-500 text-white';
                        const roleBubbleColor: Record<string, string> = {
                          owner: 'bg-amber-500 text-white',
                          judge: 'bg-blue-600 text-white',
                        };
                        const modeBubbleColor = log.isController ? 'bg-emerald-500 text-white' : 'bg-gray-400 text-white';

                        return (
                          <div key={log.id} className={`flex items-start gap-2.5 p-2.5 rounded-2xl border shadow-xs animate-in fade-in slide-in-from-top-1 duration-200 ${rowBg[log.type]}`}>
                            {hasParticipantMeta ? (
                              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                {/* Bolinha 1: tipo do dispositivo */}
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${deviceBubbleColor}`}>
                                  {log.deviceType ? deviceIconMap[log.deviceType] : <Smartphone size={11} />}
                                </div>
                                {/* Bolinha 2: papel (owner/judge) — só se aplicável */}
                                {log.participantRole && log.participantRole !== 'observer' && (
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${roleBubbleColor[log.participantRole] || ''}`}>
                                    {roleIconMap[log.participantRole]}
                                  </div>
                                )}
                                {/* Bolinha 3: modo (controller ou observer) */}
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${modeBubbleColor}`}>
                                  {log.isController ? <Gamepad2 size={11} /> : <Eye size={11} />}
                                </div>
                              </div>
                            ) : (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${dotColor[log.type]}`}>
                                {iconMap[log.type]}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-[11px] font-black text-slate-800 leading-snug block">{log.text}</span>
                              <span className="text-[9px] font-bold text-slate-400 mt-0.5 block">{log.time}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
            {/* ────────────────────────────────────────────────────────────────── */}
          </div>
        )}
      </main>
    </div>
  );
};
