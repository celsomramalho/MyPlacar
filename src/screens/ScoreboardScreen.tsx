import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Plus, Mic, MicOff, Undo, Settings, Clock, Bluetooth, Pause, Play, VolumeX, User, Zap, Activity, X as CloseIcon, Trophy, Loader2, ArrowRightLeft, ArrowUpDown, HelpCircle, CheckCircle2, Type, AlertCircle, X, Share2, QrCode, Copy, Globe, Edit3, Watch, RotateCcw, Keyboard, CheckCircle, Check, Wifi, Send, MonitorSmartphone, Smartphone, Monitor, ChevronDown, ChevronUp, ListTodo, Disc, ShieldCheck, Eye, ArrowLeft, Crown, ChevronRight, Volume2, Antenna, WifiOff, LogOut, Menu, Gavel, Trash2, Users } from 'lucide-react';
import { SettingsTabs } from './settings/SettingsTabs';
import { Button } from '../components/Button';
import { ScoreboardIcon } from '../components/ScoreboardIcon';
import { Input } from '../components/Input';
import { GameState, PointType, PointEvent, UserProfile } from '../types';
import { useGeminiReferee } from '../hooks/useGeminiReferee';
import { useScoreAnnouncer, unlockAudio, getSharedAudioContext, playErrorBeep } from '../hooks/useScoreAnnouncer';
import { useWakeLock } from '../hooks/useWakeLock';
import { isTennisTieBreak } from '../utils/tennisEngine';
import { SPORT_LIST } from '../constants';
import { Toggle } from '../components/Toggle';
import { getDb } from '../firebase';
import { doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { LazySportIcon } from '../components/LazySportIcon';
import { LiveIndicator } from '../components/LiveIndicator';
import { applyGoldenRule, maskPin } from '../utils/formatters';
import { WatchBoard } from '../components/WatchBoard';

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

interface Props {
  gameState: GameState;
  onScoreUpdate: (player: 1 | 2, type?: PointType, source?: string) => void;
  onUndo: () => void;
  onSwitchServer: (team: 1 | 2, isPartner: boolean) => void;
  onTogglePause?: () => void;
  onBack: () => void;
  onHome: () => void;
  onNavigateToTab?: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  isSettingsInicialSaved: boolean;
  isSettingsRegrasSaved: boolean;
  onToggleMirroring: (active: boolean) => void;
  onToggleLiveCollapse?: (isCollapsed: boolean) => void;
  onCorrectScore?: (type: 'game' | 'gameSet' | 'matchSet', value: string) => void;
  isAdmin?: boolean;
  onConfirmMatch?: () => void;
  userProfile?: UserProfile;
  isRecoveryFromMatchOver?: boolean;
  currentDeviceId?: string;
  currentDeviceFullLabel?: string;
  onOpenLiveControl?: () => void;
  onResetMatch?: () => void;
  onOpenMenu?: () => void;
  isOfflineMode?: boolean;
  onExitOffline?: () => void;
  appUrl: string;
  cloudLiveExists?: boolean;
  role?: 'owner' | 'judge' | 'observer' | 'spectator';
  isOriginalOwner?: boolean;
  judgePinInput?: string;
  setJudgePinInput?: (val: string) => void;
  isSearchingJudgePin?: boolean;
  judgeNicknameLookup?: string;
  isSavingJudge?: boolean;
  onAddJudge?: () => void;
  onDeleteJudge?: () => void;
  isJudgeOnline?: boolean;
  onSelectJudgeFromPartners?: () => void;
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

export const MatchTimeline: React.FC<{ history: PointEvent[], currentSet: number, p1Sets: number[], p2Sets: number[], isMatchOver?: boolean, p1Color?: string, p2Color?: string }> = ({ history, currentSet, p1Sets, p2Sets, isMatchOver, p1Color, p2Color }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) { scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; } }, [history]);
  const timelineElements = useMemo(() => {
    const elements: any[] = [];
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
        const [g1, g2] = event.resultingScore!.split('-');
        elements.push({ type: 'game-score', winner: event.winner, g1, g2 });
        if (setCounter < setsP1.length) {
          if (Number(g1) === setsP1[setCounter] && Number(g2) === setsP2[setCounter]) {
            setCounter++;
            elements.push({ type: 'set-score', winner: event.winner, s1: setsP1.slice(0, setCounter).filter((s, i) => s > setsP2[i]).length, s2: setsP2.slice(0, setCounter).filter((s, i) => s > p1Sets[i]).length });
            
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
    <div className="bg-white rounded-5xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 w-full overflow-hidden">
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
  const { gameState, onScoreUpdate, onUndo, onSwitchServer, onTogglePause, onBack, onHome, onNavigateToTab, isSettingsInicialSaved, isSettingsRegrasSaved, onToggleMirroring, onCorrectScore, isAdmin, onConfirmMatch, userProfile, isRecoveryFromMatchOver, currentDeviceId, currentDeviceFullLabel, onOpenLiveControl, onResetMatch, onOpenMenu, isOfflineMode, onExitOffline, appUrl, cloudLiveExists, role, isOriginalOwner, judgePinInput, setJudgePinInput, isSearchingJudgePin, judgeNicknameLookup, isSavingJudge, onAddJudge, onDeleteJudge, isJudgeOnline, onSelectJudgeFromPartners } = props;

  if (!gameState || !gameState.p1 || !gameState.p2 || !gameState.matchConfig) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold">Sincronizando partida...</p>
      </div>
    );
  }

  const [resetPressProgress, setResetPressProgress] = useState(0);
  const resetPressTimerRef = useRef<any>(null);
  const resetProgressIntervalRef = useRef<any>(null);

  const startResetPress = () => {
    if (!onResetMatch || role === 'observer') return;
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
  const scoreProgressIntervalRef = useRef<any>(null);
  const hasDraggedRef = useRef(false);

  const [isLogsOpen, setIsLogsOpen] = useState(gameState.matchConfig.isHistoryEnabled);
  const [isTimelineOpen, setIsTimelineOpen] = useState(gameState.matchConfig.isHistoryEnabled);
  const [isAudioLocked, setIsAudioLocked] = useState(false);
  const [voiceLogs, setVoiceLogs] = useState<CommandLogEntry[]>([]);
  const [remoteActionFeedback, setRemoteActionFeedback] = useState<string | null>(null);
  const [isWaitingAck, setIsWaitingAck] = useState(false);
  const [correctionMode, setCorrectionMode] = useState<'none' | 'game' | 'gameSet' | 'matchSet'>('none');
  const [correctionPlayer, setCorrectionPlayer] = useState<1 | 2 | null>(null);
  const [voiceWasManuallyStopped, setVoiceWasManuallyStopped] = useState(false);
  const longPressTimer = useRef<any>(null);
  const isLongPressActive = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const lastRemoteCommandTimestamp = useRef(0);
  const lastHistoryLengthOnWatch = useRef(gameState.pointHistory?.length ?? 0);
  const [isPinging, setIsPinging] = useState(false);
  const [isMirrorExpanded, setIsMirrorExpanded] = useState(false);
  const [isLiveExpanded, setIsLiveExpanded] = useState(false);
  const [isDimmed, setIsDimmed] = useState(false);
  const dimTimeoutRef = useRef<any>(null);

  const currentGameStateRef = useRef(gameState);
  const pendingLogIdRef = useRef<string | null>(null);
  const voiceLogsRef = useRef<CommandLogEntry[]>([]);

  useEffect(() => { voiceLogsRef.current = voiceLogs; }, [voiceLogs]);

  const isCommandOwner = useMemo(() => {
    if (!gameState.isMirroringActive) return true;
    return currentDeviceId === gameState.commandOwnerId;
  }, [gameState.isMirroringActive, gameState.commandOwnerId, currentDeviceId]);

  const isLiveActive = useMemo(() => {
    return !!(gameState.isMirroringActive && !gameState.isLiveClosed) || !!cloudLiveExists;
  }, [gameState.isMirroringActive, gameState.isLiveClosed, cloudLiveExists]);

  const resetDimTimer = useCallback(() => {
    if (dimTimeoutRef.current) clearTimeout(dimTimeoutRef.current);
    if (gameState.matchConfig.isWatchMode) {
      dimTimeoutRef.current = setTimeout(() => {
        setIsDimmed(true);
      }, 10000);
    }
  }, [gameState.matchConfig.isWatchMode]);

  useEffect(() => {
    resetDimTimer();
    return () => { if (dimTimeoutRef.current) clearTimeout(dimTimeoutRef.current); };
  }, [gameState.p1.score, gameState.p2.score, resetDimTimer]);

  useEffect(() => {
    if (pendingLogIdRef.current) {
      const logId = pendingLogIdRef.current;
      setVoiceLogs(prev => {
        const idx = prev.findIndex(l => l.id === logId);
        if (idx === -1) return prev;
        const updated = [...prev];
        const nowScore = `${gameState.p1.score}-${gameState.p2.score}`;
        updated[idx] = { 
          ...updated[idx], 
          after: nowScore, 
          latency: Date.now() - updated[idx].timestamp 
        };
        return updated;
      });
      pendingLogIdRef.current = null;
    }
  }, [gameState.p1.score, gameState.p2.score, (gameState.pointHistory?.length ?? 0)]);

  const groupedControllers = useMemo(() => {
    const counts: Record<string, { count: number; isOnline: boolean; isOwner: boolean }> = {};
    const list = Object.entries(gameState.controllers || {});
    const now = Date.now();
    list.forEach(([id, data]) => {
      const d = data as { label: string; lastSeen: number; isOwner?: boolean };
      if (!counts[d.label]) {
        counts[d.label] = { count: 0, isOnline: false, isOwner: false };
      }
      counts[d.label].count += 1;
      if (now - d.lastSeen < 60000) {
        counts[d.label].isOnline = true;
      }
      if (d.isOwner) {
        counts[d.label].isOwner = true;
      }
    });
    return Object.entries(counts)
      .map(([name, { count, isOnline, isOwner }]) => ({ name, count, isOnline, isOwner }))
      .sort((a, b) => {
        if (a.name === gameState.commandOwner) return -1;
        if (b.name === gameState.commandOwner) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [gameState.controllers, gameState.commandOwner]);

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
    setVoiceLogs(prev => [entry, ...prev].slice(0, 30)); 
    if (!isError && afterScore === '...') pendingLogIdRef.current = entry.id;
    return entry.id;
  };

  const handleUndoWithLog = () => {
    if (gameState.isConfirmedFinished || gameState.isLiveClosed || !isCommandOwner) return;
    createCommandLog('Desfazer', 'cb');
    onUndo();
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const handleVoiceToggle = () => {
    if (!gameState.matchConfig.voiceEnabled || gameState.isLiveClosed || !isCommandOwner || gameState.isMatchOver) return;
    if (voiceWasManuallyStopped) {
      setVoiceWasManuallyStopped(false);
      start();
    } else {
      setVoiceWasManuallyStopped(true);
      stop();
    }
  };

  const [customBaseUrl, setCustomBaseUrl] = useState(() => {
    const saved = localStorage.getItem('myPlacar_CustomHost');
    if (saved) return saved;
    return appUrl.endsWith('/') ? appUrl : appUrl + '/';
  });
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const mirrorLink = useMemo(() => {
    let base = customBaseUrl.trim();
    if (!base.startsWith('http')) base = 'https://' + base;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}/?viewPin=${gameState.ownerPin?.toUpperCase()}`;
  }, [gameState.ownerPin, customBaseUrl]);
  const watchLink = useMemo(() => `${mirrorLink}&viewMode=watch`, [mirrorLink]);
  const qrCodeUrl = useMemo(() => `https://quickchart.io/qr?text=${encodeURIComponent(mirrorLink)}&size=400&margin=1&ecLevel=H&dark=0f172a`, [mirrorLink]);

  const { announceFullScore, isAnnouncing } = useScoreAnnouncer(gameState);

  const { isListening, start, stop } = useGeminiReferee({
    onScoreP1: (type, text) => { if(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed && isCommandOwner) { createCommandLog(text || `Ponto ${currentGameStateRef.current.p1.name}`, 'cv', false, 1); onScoreUpdate(1, type, 'cv'); } },
    onScoreP2: (type, text) => { if(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed && isCommandOwner) { createCommandLog(text || `Ponto ${currentGameStateRef.current.p2.name}`, 'cv', false, 2); onScoreUpdate(2, type, 'cv'); } },
    onUndo: (text) => { if(!gameState.isConfirmedFinished && !gameState.isLiveClosed && isCommandOwner) { createCommandLog(text || 'Desfazer', 'cv'); onUndo(); } },
    onCommandError: (text) => { if(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed && isCommandOwner) { playErrorBeep(gameState.matchConfig.errorSoundType); if (navigator.vibrate) navigator.vibrate([100, 50, 100]); createCommandLog(text, 'cv', true); } },
    onSwitchServer: () => onSwitchServer(gameState.server === 1 ? 2 : 1, false), onAnnounceScore: announceFullScore, isEnabled: gameState.matchConfig.voiceEnabled && !voiceWasManuallyStopped && !gameState.isLiveClosed && isCommandOwner && !gameState.isMatchOver,
    p1Name: gameState.p1.name, p2Name: gameState.p2.name, p1Partner: gameState.p1.partnerName, p2Partner: gameState.p2.partnerName, p1Color: gameState.p1.color, p2Color: gameState.p2.color,
    server: gameState.server, servingOrderOffset: gameState.servingOrderOffset, voiceCommands: gameState.matchConfig.voiceCommands, actionCooldownSec: gameState.matchConfig.actionCooldown || 5, stateLockoutSec: gameState.matchConfig.stateLockout || 2
  });

  useEffect(() => { setVoiceLogs([]); currentGameStateRef.current = gameState; }, [gameState.matchId]);

  useEffect(() => {
    if (!gameState.matchConfig.isWatchMode) return;
    if (isWaitingAck && (gameState.pointHistory?.length ?? 0) !== lastHistoryLengthOnWatch.current) {
        setRemoteActionFeedback('CONFIRMED'); setIsWaitingAck(false); lastHistoryLengthOnWatch.current = (gameState.pointHistory?.length ?? 0); setTimeout(() => setRemoteActionFeedback(null), 1000);
    } else { lastHistoryLengthOnWatch.current = (gameState.pointHistory?.length ?? 0); }
  }, [gameState.pointHistory?.length, gameState.matchConfig.isWatchMode, isWaitingAck]);

  useEffect(() => {
    if (!gameState.matchConfig.isWatchMode || !gameState.isMirroringActive || gameState.isLiveClosed) return;
    const interval = setInterval(async () => {
      const db = getDb(); if (!db || !gameState.ownerPin) return;
      try { await setDoc(doc(db, "live_matches", gameState.ownerPin.toUpperCase()), { lastRemotePing: Date.now() }, { merge: true }); } catch (e) {}
    }, 10000);
    return () => clearInterval(interval);
  }, [gameState.matchConfig.isWatchMode, gameState.isMirroringActive, gameState.ownerPin, gameState.isLiveClosed]);

  const isWatchConnected = useMemo(() => {
    if (!gameState.lastRemotePing || gameState.isLiveClosed) return false;
    return (Date.now() - gameState.lastRemotePing) < 55000;
  }, [gameState.lastRemotePing, gameState.isLiveClosed]);

  useEffect(() => {
    if (gameState.matchConfig.isWatchMode || !isAdmin || !gameState.isMirroringActive || !gameState.ownerPin || gameState.isLiveClosed) return;
    const db = getDb(); if (!db) return;
    const liveRef = doc(db, "live_matches", gameState.ownerPin.toUpperCase());
    const unsubscribe = onSnapshot(liveRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data(); const cmd = data.remoteCommand;
        if (cmd && cmd.timestamp > lastRemoteCommandTimestamp.current) {
          lastRemoteCommandTimestamp.current = cmd.timestamp;
          let logText = "";
          if (cmd.action === 'P1_POINT') { onScoreUpdate(1, 'rally', 'wb'); logText = `Ponto ${gameState.p1.name} (remoto)`; }
          else if (cmd.action === 'P2_POINT') { onScoreUpdate(2, 'rally', 'wb'); logText = `Ponto ${gameState.p2.name} (remoto)`; }
          else if (cmd.action === 'P1_ACE') { onScoreUpdate(1, 'ace', 'wb'); logText = `Ace ${gameState.p1.name} (remoto)`; }
          else if (cmd.action === 'P2_ACE') { onScoreUpdate(2, 'ace', 'wb'); logText = `Ace ${gameState.p2.name} (remoto)`; }
          else if (cmd.action === 'P1_FAULT') { onScoreUpdate(2, 'fault', 'wb'); logText = `Saque errado ${gameState.p1.name} (remoto)`; }
          else if (cmd.action === 'UNDO') { onUndo(); logText = "Desfazer (remoto)"; }
          if (logText) createCommandLog(logText, 'wb', false, undefined, true);
        }
      }
    });
    return () => unsubscribe();
  }, [gameState.ownerPin, gameState.matchConfig.isWatchMode, isAdmin, gameState.isMirroringActive, onScoreUpdate, onUndo, gameState.isLiveClosed]);

  const handleToggleMirroringLocal = (active: boolean) => { 
    if (!gameState.isMatchOver && !gameState.isConfirmedFinished && !gameState.isLiveClosed) {
       if (isCommandOwner && !active) onOpenLiveControl?.();
       else onToggleMirroring(active);
    }
  };
  const handlePingTest = async () => {
    const db = getDb(); if (!db || !gameState.ownerPin || gameState.isLiveClosed) return;
    setIsPinging(true);
    try {
      const liveRef = doc(db, "live_matches", gameState.ownerPin.toUpperCase());
      await updateDoc(liveRef, { pingTimestamp: Date.now(), pingConfirmed: false });
      setTimeout(async () => { await updateDoc(liveRef, { pingConfirmed: true }); setTimeout(() => setIsPinging(false), 1000); }, 1500);
    } catch (e) { setIsPinging(false); }
  };

  const handleSaveBaseUrl = () => { localStorage.setItem('myPlacar_CustomHost', customBaseUrl); setIsEditingUrl(false); };
  const handleCopyLink = () => navigator.clipboard.writeText(mirrorLink).then(() => (window as any).alert("Link de espelhamento copiado com sucesso."));
  const handleCopyWatchLink = () => navigator.clipboard.writeText(watchLink).then(() => (window as any).alert("Link para relógio copiado com sucesso."));
  const handleShareWhatsApp = () => {
    const currentSportDef = SPORT_LIST.find(s => s.id === gameState.matchConfig.sportType) || SPORT_LIST[0];
    const text = `Acompanhe meu jogo de ${currentSportDef.name} ao vivo no my placar. 🎾\n\n${mirrorLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const isTieBreak = isTennisTieBreak(gameState);
  useWakeLock(true);
  useEffect(() => { const interval = setInterval(() => setIsAudioLocked(getSharedAudioContext()?.state !== 'running'), 1500); return () => clearInterval(interval); }, []);

  const openCorrection = (type: 'game' | 'gameSet' | 'matchSet', player: 1 | 2) => { if (!gameState.isConfirmedFinished && !gameState.isMatchOver && !isRecoveryFromMatchOver && !gameState.isLiveClosed && isCommandOwner) { if (isListening) stop(); setCorrectionMode(type); setCorrectionPlayer(player); } };
  const closeCorrection = () => { setCorrectionMode('none'); setCorrectionPlayer(null); if (gameState.matchConfig.voiceEnabled && !gameState.isLiveClosed && isCommandOwner) setTimeout(start, 300); };
  const handleApplyPickerCorrection = (selectedVal: string) => {
    if (onCorrectScore && correctionPlayer && correctionMode !== 'none') {
      let otherVal = "";
      if (correctionMode === 'game') {
        otherVal = correctionPlayer === 1 ? gameState.p2.score : gameState.p1.score;
      } else if (correctionMode === 'gameSet') {
        otherVal = (correctionPlayer === 1 ? gameState.p2.games : gameState.p1.games).toString();
      } else if (correctionMode === 'matchSet') {
        otherVal = (correctionPlayer === 1 ? p2WonSets : p1WonSets).toString();
      }
      onCorrectScore(correctionMode as any, correctionPlayer === 1 ? `${selectedVal} a ${otherVal}` : `${otherVal} a ${selectedVal}`); closeCorrection();
    }
  };

  const handleScoreCardPointerDown = (e: React.PointerEvent<HTMLDivElement>, type: 'game' | 'gameSet' | 'matchSet', player: 1 | 2) => {
    if (gameState.isConfirmedFinished || gameState.isMatchOver || isWaitingAck || isRecoveryFromMatchOver || gameState.isLiveClosed || !isCommandOwner) return;
    isLongPressActive.current = false; 
    hasDraggedRef.current = false;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    
    const duration = gameState.matchConfig.isWatchMode ? 4000 : 3000;
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
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const dist = Math.sqrt(Math.pow(e.clientX - touchStartPos.current.x, 2) + Math.pow(e.clientY - touchStartPos.current.y, 2));
    if (dist > 10) {
      hasDraggedRef.current = true;
    }
    if (longPressTimer.current && dist > 10) { 
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
    
    if (!isLongPressActive.current && !hasDraggedRef.current && correctionMode === 'none' && !gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed) {
      if (gameState.isMirroringActive && gameState.commandOwnerId !== currentDeviceId) return;
      
      // Item 8: Retirar incremento do placar do game nos botões de set (matchSet) e gameSet
      if (type === 'matchSet' || type === 'gameSet') return;

      createCommandLog(`Ponto ${player === 1 ? currentGameStateRef.current.p1.name : currentGameStateRef.current.p2.name}`, 'cb', false, player);
      onScoreUpdate(player, 'rally', 'cb');
    }
  };

  const p1WonSets = useMemo(() => gameState.p1.sets.filter((s, i) => s > gameState.p2.sets[i]).length, [gameState.p1.sets, gameState.p2.sets]);
  const p2WonSets = useMemo(() => gameState.p2.sets.filter((s, i) => s > gameState.p1.sets[i]).length, [gameState.p1.sets, gameState.p2.sets]);
  const currentSportDef = SPORT_LIST.find(s => s.id === gameState.matchConfig.sportType) || SPORT_LIST[0];
  const pickerOptions = useMemo(() => {
    if (correctionMode === 'matchSet') {
      return Array.from({ length: 4 }, (_, i) => i.toString());
    }
    if (correctionMode === 'gameSet') {
      const maxGames = gameState.matchConfig.gamesPerSet || 6;
      return Array.from({ length: maxGames + 2 }, (_, i) => i.toString());
    }
    return (currentSportDef.engine === 'tennis' && !isTieBreak ? ['0', '15', '30', '40', 'Ad'] : Array.from({ length: 31 }, (_, i) => i.toString()));
  }, [correctionMode, currentSportDef, isTieBreak, gameState.matchConfig.gamesPerSet]);
  
  if (gameState.matchConfig.isWatchMode) {
    return (
      <WatchBoard 
        gameState={gameState} onScoreUpdate={onScoreUpdate} onUndo={onUndo} onSwitchServer={onSwitchServer} 
        onBack={onBack} onConfirmMatch={onConfirmMatch} isListening={isListening} 
        isAudioLocked={isAudioLocked} unlockAudio={unlockAudio} announceFullScore={announceFullScore} 
        handleUndoWithLog={handleUndoWithLog} isDimmed={isDimmed} setIsDimmed={setIsDimmed} resetDimTimer={resetDimTimer} 
        isCommandOwner={isCommandOwner} onResetMatch={onResetMatch} onOpenLiveControl={onOpenLiveControl} remoteActionFeedback={remoteActionFeedback} p1WonSets={p1WonSets} p2WonSets={p2WonSets}
        isOfflineMode={isOfflineMode}
        correctionMode={correctionMode} closeCorrection={closeCorrection} handleApplyPickerCorrection={handleApplyPickerCorrection}
        pickerOptions={pickerOptions} correctionPlayer={correctionPlayer} handleScoreCardPointerDown={handleScoreCardPointerDown}
        handlePointerMove={handlePointerMove} handleScoreCardPointerUp={handleScoreCardPointerUp}
        cloudLiveExists={cloudLiveExists}
        role={role}
      />
    );
  }

  const isVoiceActive = isListening && !voiceWasManuallyStopped && gameState.matchConfig.voiceEnabled && !gameState.isLiveClosed && isCommandOwner && !gameState.isMatchOver;
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const connType = connection?.type;
  const downlink = connection?.downlink;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative font-sans">
       {gameState.isMatchOver && !gameState.isConfirmedFinished && (
         <div className="fixed inset-0 z-[100001] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-[3rem] p-8 w-full max-sm shadow-2xl border border-white/50 flex flex-col items-center gap-6 animate-in zoom-in duration-300">
               <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-inner"><Trophy size={40} /></div>
               <div className="text-center space-y-2">
                 <h3 className="text-2xl font-black text-black tracking-tight leading-none">Partida encerrada</h3>
                 <p className="text-sm font-bold text-slate-500">Vencedor: {p1WonSets > p2WonSets ? gameState.p1.name : gameState.p2.name}</p>
               </div>
               <div className="flex flex-col w-full gap-3">
                 <button onClick={() => onConfirmMatch?.()} className="w-full py-5 bg-emerald-600 text-white rounded-3xl font-black text-base shadow-xl active:scale-95 transition-all">Confirmar resultado</button>
                 {isCommandOwner && <button onClick={handleUndoWithLog} className="w-full py-5 bg-slate-800 text-white rounded-3xl font-black text-base shadow-xl active:scale-95 transition-all">Corrigir último ponto</button>}
               </div>
            </div>
         </div>
       )}
       {isAudioLocked && <div onClick={async () => { await unlockAudio(); announceFullScore(); setIsAudioLocked(false); }} className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl bg-orange-600 text-white flex items-center gap-3 animate-bounce cursor-pointer"><VolumeX size={20} /><span className="text-sm font-bold">Ativar som</span></div>}
       <ScorePickerModal 
         isOpen={correctionMode !== 'none'} 
         onClose={closeCorrection} 
         onConfirm={handleApplyPickerCorrection} 
         title={`Corrigir ${correctionMode === 'game' ? 'game' : correctionMode === 'gameSet' ? 'games no set' : 'sets vencidos'}: ${correctionPlayer === 1 ? gameState.p1.name : gameState.p2.name}`} 
         options={pickerOptions} 
         initialValue={correctionPlayer === 1 ? (correctionMode === 'game' ? gameState.p1.score : correctionMode === 'gameSet' ? gameState.p1.games.toString() : p1WonSets.toString()) : (correctionMode === 'game' ? gameState.p2.score : correctionMode === 'gameSet' ? gameState.p2.games.toString() : p2WonSets.toString())} 
       />
       <header className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {!isOfflineMode && (
            <button onClick={onHome} className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all duration-500 relative ${isSettingsInicialSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              <ScoreboardIcon className="w-6 h-6" />
              {isSettingsInicialSaved && isLiveActive && <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100"><Check size={8} strokeWidth={4} /></div>}
            </button>
          )}
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
            <LazySportIcon sportId={gameState.matchConfig.sportType} defaultIcon={currentSportDef.defaultIcon} className="w-10 h-10 rounded-full shadow-sm" />
            <span className="text-xl font-black tracking-tighter text-gray-900 flex items-center gap-1">
              {currentSportDef.name} 
              {isTieBreak && <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-1">Tb</span>}
            </span>
          </button>
          {isLiveActive && (
            <LiveIndicator 
              role={role || (isCommandOwner ? 'owner' : 'observer')} 
              onClick={onOpenLiveControl} 
              onPointerDown={startResetPress}
              onPointerUp={stopResetPress}
              onPointerLeave={stopResetPress}
              progress={resetPressProgress}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {isWatchConnected && <div className="p-2 bg-sky-100 text-sky-600 rounded-xl animate-pulse flex items-center gap-2 px-3 border border-sky-200" title="Relógio conectado"><Watch size={18} /><span className="text-[9px] font-black tracking-tight hidden md:inline">Relógio conectado</span></div>}
          <button onClick={onBack} className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all duration-500 relative ${isSettingsRegrasSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
            <Settings size={22} />
            {isSettingsRegrasSaved && isLiveActive && <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100"><Check size={8} strokeWidth={4} /></div>}
          </button>
        </div>
      </header>
      <main className={`flex-1 p-4 max-w-2xl mx-auto w-full pb-36 overflow-y-auto no-scrollbar transition-all duration-700 ${gameState.isLiveClosed ? 'grayscale opacity-60 pointer-events-none' : ''}`}>
        <div className={`bg-white rounded-[2rem] shadow-sm border ${gameState.isConfirmedFinished ? 'border-emerald-400 ring-4 ring-emerald-50' : isTieBreak ? 'border-amber-300 ring-4 ring-amber-100' : 'border-gray-100'} p-4 md:p-8 flex flex-col items-center gap-4 relative`}>
           <div className="flex flex-col w-full mb-4">
             <div className="flex items-center justify-between w-full mb-2 px-2">
               <div className="flex items-center gap-2"></div>
               <div className="flex flex-col items-center justify-center -mt-12 md:-mt-16">
                 {!isOfflineMode && (
                   <button onClick={handleVoiceToggle} disabled={gameState.isConfirmedFinished || gameState.isLiveClosed || !isCommandOwner || gameState.isMatchOver} className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 border-2 ${isVoiceActive ? 'bg-blue-600 border-blue-700' : 'bg-white border-blue-600'}`}>
                     <div className="relative flex items-center justify-center">
                       <Mic size={32} strokeWidth={isVoiceActive ? 3.5 : 2} className={isVoiceActive ? 'text-white' : 'text-blue-600'} />
                       {(voiceWasManuallyStopped || !gameState.matchConfig.voiceEnabled || gameState.isLiveClosed || !isCommandOwner || gameState.isMatchOver) && (
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-[2.5px] bg-red-600 -rotate-45 rounded-full shadow-sm pointer-events-none z-20" />
                       )}
                     </div>
                   </button>
                 )}
               </div>
               <div className="flex items-center gap-3"><span className={`text-2xl font-black tracking-tighter ${gameState.isPaused ? 'text-red-500 animate-pulse' : 'text-gray-900'}`}>{formatTime(gameState.matchDuration)}</span><button onClick={() => onTogglePause?.()} className={`p-3 rounded-2xl active:scale-90 transition-all shadow-md ${gameState.isPaused ? 'bg-green-600 text-white' : 'bg-red-50 text-red-500'}`}>{gameState.isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} />}</button></div>
             </div>
             
             <div className="flex items-center justify-between w-full px-4 mt-4">
               <div className="flex flex-col items-center flex-1 min-w-0">
                 <div onClick={() => onSwitchServer(1, false)} className="text-center w-full cursor-pointer active:scale-95 transition-transform">
                   <div className="flex items-center justify-center gap-2">
                     <span className="text-xl md:text-2xl font-black text-gray-900 truncate">{gameState.p1.name}</span>
                     {(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed) && gameState.servingOrderOffset === 0 && <span className="text-3xl animate-bounce">🎾</span>}
                   </div>
                 </div>
                 {gameState.p1.partnerName && (
                   <div onClick={() => onSwitchServer(1, true)} className="text-center w-full cursor-pointer active:scale-95 transition-transform mt-1">
                     <div className="flex items-center justify-center gap-2">
                       <span className="text-lg md:text-xl font-black text-gray-900 truncate">{gameState.p1.partnerName}</span>
                       {(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed) && gameState.servingOrderOffset === 2 && <span className="text-2xl animate-bounce">🎾</span>}
                     </div>
                   </div>
                 )}
               </div>
               <div className="w-8" />
               <div className="flex flex-col items-center flex-1 min-w-0">
                 <div onClick={() => onSwitchServer(2, false)} className="text-center w-full cursor-pointer active:scale-95 transition-transform">
                   <div className="flex items-center justify-center gap-2">
                     <span className="text-xl md:text-2xl font-black text-gray-900 truncate">{gameState.p2.name}</span>
                     {(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed) && gameState.servingOrderOffset === 1 && <span className="text-xl md:text-3xl animate-bounce">🎾</span>}
                   </div>
                 </div>
                 {gameState.p2.partnerName && (
                   <div onClick={() => onSwitchServer(2, true)} className="text-center w-full cursor-pointer active:scale-95 transition-transform mt-1">
                     <div className="flex items-center justify-center gap-2">
                       <span className="text-lg md:text-xl font-black text-gray-900 truncate">{gameState.p2.partnerName}</span>
                       {(!gameState.isConfirmedFinished && !gameState.isMatchOver && !gameState.isLiveClosed) && gameState.servingOrderOffset === 3 && <span className="text-lg md:text-2xl animate-bounce">🎾</span>}
                     </div>
                   </div>
                 )}
               </div>
             </div>
           </div>

           <WatchBoard 
             gameState={gameState} onScoreUpdate={onScoreUpdate} onUndo={onUndo} onSwitchServer={onSwitchServer} 
             onBack={onBack} onConfirmMatch={onConfirmMatch} isListening={isListening} 
             isAudioLocked={isAudioLocked} unlockAudio={unlockAudio} announceFullScore={announceFullScore} 
             handleUndoWithLog={handleUndoWithLog} isDimmed={isDimmed} setIsDimmed={setIsDimmed} resetDimTimer={resetDimTimer} 
             isCommandOwner={isCommandOwner} onResetMatch={onResetMatch} onOpenLiveControl={onOpenLiveControl} remoteActionFeedback={remoteActionFeedback} p1WonSets={p1WonSets} p2WonSets={p2WonSets}
             isOfflineMode={isOfflineMode}
             correctionMode={correctionMode} closeCorrection={closeCorrection} handleApplyPickerCorrection={handleApplyPickerCorrection}
             pickerOptions={pickerOptions} correctionPlayer={correctionPlayer} handleScoreCardPointerDown={handleScoreCardPointerDown}
             handlePointerMove={handlePointerMove} handleScoreCardPointerUp={handleScoreCardPointerUp}
             isEmbedded={true}
             scorePressProgress={scorePressProgress}
             cloudLiveExists={cloudLiveExists}
             role={role}
           />
        </div>
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
                    {voiceLogs.length === 0 ? (
                      <div className="py-10 flex items-center justify-center text-gray-300 text-[11px] font-bold italic text-center">Aguardando comandos...</div>
                    ) : (
                      voiceLogs.map((log) => {
                         const [b1, b2] = log.before.split('-'); 
                         const [a1, a2] = log.after.split('-'); 
                         const cmdColor = log.winner === 1 ? TEXT_COLORS[gameState.p1.color || 'azul'] : log.winner === 2 ? TEXT_COLORS[gameState.p2.color || 'vermelho'] : log.isError ? 'text-red-600' : 'text-slate-500';
                         return (
                           <div key={log.id} className={`flex items-start gap-2.5 p-2.5 rounded-2xl border shadow-xs transition-all animate-in fade-in slide-in-from-left-2 duration-300 ${log.isError ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                             <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${log.isError ? 'bg-red-600 text-white' : (log.isRemote ? 'bg-sky-500 text-white' : 'bg-green-500 text-white')}`}>{log.isError ? <X size={14} className="stroke-[4]" /> : (log.source?.toLowerCase().includes('w') ? <Watch size={14} className="text-white" strokeWidth={3} /> : <CheckCircle size={14} className="text-white" strokeWidth={4} />)}</div>
                             <div className="flex-1 font-mono text-[11px] overflow-hidden leading-tight">
                               <div className="flex items-center flex-wrap gap-x-1.5 text-slate-500">
                                 <span className={`font-black ${TEXT_COLORS[gameState.p1.color || 'azul']}`}>{log.source?.toUpperCase() || (log.isRemote ? 'WB' : 'CB')}#</span>
                                 {!log.isError && <span className={`${TEXT_COLORS[gameState.p1.color || 'azul']} font-bold`}>[{log.liveSequence}]</span>}
                                 {!log.isError && <>
                                     <span className="opacity-30">|</span>
                                     <span className="font-bold"><span className="text-black">I: </span><span className={TEXT_COLORS[gameState.p1.color || 'azul']}>{b1}</span><span className="mx-0.5">-</span><span className={TEXT_COLORS[gameState.p2.color || 'vermelho']}>{b2}</span></span>
                                     <span className="font-black text-orange-500"><span className="text-black ml-1 mr-0.5"> F: </span><span className={TEXT_COLORS[gameState.p1.color || 'azul']}>{a1}</span><span className="mx-0.5">-</span><span className={TEXT_COLORS[gameState.p2.color || 'vermelho']}>{a2}</span></span>
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
            {gameState.matchConfig.isHistoryEnabled && (
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
                     <MatchTimeline history={gameState.pointHistory ?? []} currentSet={gameState.currentSet} p1Sets={gameState.p1.sets} p2Sets={gameState.p2.sets} isMatchOver={gameState.isMatchOver} p1Color={gameState.p1.color} p2Color={gameState.p2.color} />
                   </div>
                 )}
              </div>
            )}
            <div className={`bg-[#0f172a] rounded-[3rem] p-4 pl-6 pr-6 shadow-2xl border border-white/50 w-full animate-in fade-in duration-700 flex flex-col gap-4 overflow-hidden transition-all duration-500 ${gameState.isConfirmedFinished ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                     <div className={`w-12 h-12 rounded-2xl transition-all duration-500 flex items-center justify-center shadow-lg ${gameState.isMirroringActive && !gameState.isLiveClosed ? 'bg-sky-500' : 'bg-slate-800'}`}><QrCode size={24} className="text-white" /></div>
                     <div className="flex flex-col min-w-0"><h3 className="text-white font-black text-lg tracking-tight leading-none mb-1">Espelhar partida</h3><p className="text-[10px] font-bold text-slate-400 truncate tracking-tight">O PIN serve tanto para torcida quanto para seu controle.</p></div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                     {isLiveActive && <button onClick={() => setIsMirrorExpanded(!isMirrorExpanded)} className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center active:scale-90 transition-all border border-white/50">{isMirrorExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>}
                     <div className="flex items-center h-7 px-0.5">
                       <div className="relative inline-block w-12 h-7 align-middle select-none transition duration-200 ease-in">
                         <input type="checkbox" id="toggle-mirroring" checked={isLiveActive || false} onChange={(e) => handleToggleMirroringLocal(e.target.checked)} disabled={gameState.isConfirmedFinished || gameState.isLiveClosed} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300 ease-in-out shadow-sm top-[2px] left-[2px] checked:translate-x-full" />
                         <label htmlFor="toggle-mirroring" className={`toggle-label block overflow-hidden h-7 rounded-full cursor-pointer transition-colors duration-300 ease-in-out ${isLiveActive ? 'bg-[#22c55e]' : 'bg-slate-800'}`}></label>
                       </div>
                     </div>
                  </div>
               </div>
               {isLiveActive && isMirrorExpanded && (
                 <div className="mt-4 space-y-6 animate-in zoom-in duration-500 border-t border-white/5 pt-6">
                    {isAdmin && <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Globe size={14} className="text-blue-400" /><span className="text-[10px] font-black text-blue-400 tracking-tight">Endereço público do app</span></div><button onClick={() => setIsEditingUrl(!isEditingUrl)} className="text-gray-400 p-1 active:scale-90 transition-all"><Edit3 size={14} /></button></div>{isEditingUrl ? <div className="flex gap-2 animate-in slide-in-from-top-1"><input type="text" value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)} placeholder="https://seu-link-real.app/" className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xs text-white outline-none" /><button onClick={handleSaveBaseUrl} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black">Ok</button></div> : <p className="text-[11px] font-bold text-gray-400 truncate bg-black/20 p-2 rounded-xl border border-white/5">{customBaseUrl}</p>}</div>}
                    <div className="flex flex-col items-center gap-8 w-full"><div className="bg-white p-3 rounded-3xl shadow-2xl w-48 h-48 flex items-center justify-center shrink-0 border-4 border-sky-500/20"><img src={qrCodeUrl} alt="QR code" className="w-full h-full object-contain" /></div><div className="w-full space-y-3"><button onClick={handleShareWhatsApp} className="w-full bg-[#25D366] text-white py-4 px-8 rounded-2xl font-black text-xs items-center justify-center gap-3 shadow-lg active:scale-95 transition-all flex"><Share2 size={18} /> WhatsApp</button><button onClick={handleCopyLink} className="w-full bg-white/10 text-white py-4 px-8 rounded-2xl font-black text-xs items-center justify-center gap-3 border border-white/20 active:scale-95 transition-all flex"><Copy size={18} /> Copiar link</button><button onClick={handleCopyWatchLink} className="w-full bg-indigo-600 text-white py-4 px-8 rounded-2xl font-black text-xs items-center justify-center gap-3 shadow-lg active:scale-95 transition-all flex"><Watch size={18} /> Link para relógio</button></div></div>
                 </div>
               )}
            </div>
            {(gameState.isMirroringActive || isMirrorExpanded) && (
            <div className={`bg-white rounded-[2.5rem] p-4 pl-7 pr-7 shadow-sm border border-gray-100 w-full animate-in fade-in transition-all duration-500 ${gameState.isConfirmedFinished ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-inner"><Wifi size={22} /></div><h3 className="text-gray-900 font-black text-lg tracking-tight leading-none">Live</h3></div>
                  <button onClick={() => setIsLiveExpanded(!isLiveExpanded)} className="w-10 h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center active:scale-90 transition-all border border-gray-100">{isLiveExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
               </div>
               {isLiveExpanded && <div className="space-y-4 animate-in zoom-in duration-300">
                   <div className="space-y-2.5"><div className="flex items-center gap-2 px-1"><MonitorSmartphone size={16} className="text-gray-400" /><span className="text-[11px] font-bold text-gray-500">Dispositivos participantes</span></div><div className="flex flex-wrap gap-2">{groupedControllers.map(({ name, count, isOnline, isOwner }) => { const isPrimary = gameState.commandOwner === name; const isActive = isPrimary || (isOwner && isOnline); return <div key={name} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${isActive && !gameState.isLiveClosed ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm ring-2 ring-blue-100' : 'bg-white border-gray-100 text-gray-400 opacity-60'}`}>{isActive && !gameState.isLiveClosed ? <ShieldCheck size={14} className="text-blue-600" fill="white" /> : <Eye size={12} className="text-[#40E0D0]" />}<span className="text-[10px] font-black">{name}{count > 1 ? ` (${count})` : ''}</span></div>; })}</div></div>
                   <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100"><div className="flex items-center gap-2.5"><CheckCircle size={16} className="text-gray-400" /><span className="text-[11px] font-bold text-gray-500">Sincronização confirmada</span></div><div className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-colors ${gameState.isLiveClosed ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{gameState.isLiveClosed ? <X size={12} strokeWidth={4} /> : <Check size={12} strokeWidth={4} />}<span className="text-[10px] font-black">{gameState.isLiveClosed ? 'Encerrado' : 'Ativo'}</span></div></div>
                    {/* Recurso de inserir juiz - Apenas para o proprietário */}
                    {isOriginalOwner && (
                      <div className="w-full space-y-4">
                        <div className="flex items-center gap-2 px-1">
                          <Gavel size={16} className="text-gray-400" />
                          <span className="text-[11px] font-bold text-gray-500">Juiz da partida</span>
                        </div>

                        {gameState?.judgePin ? (
                          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-black">{gameState.judgeNickname}</span>
                                <span className="text-[10px] font-bold text-slate-400">{maskPin(gameState.judgePin)}</span>
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
                              enableVoice={true}
                              enableCamera={true}
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

                    {gameState.judgeNickname && !isOriginalOwner && (
                      <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <Gavel size={16} className="text-gray-400" />
                          <span className="text-[11px] font-bold text-gray-500">Juiz da partida</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {gameState.commandOwner === gameState.judgeNickname && <CheckCircle size={14} className="text-blue-600" />}
                          <span className="text-[10px] font-black text-blue-600">{gameState.judgeNickname}</span>
                        </div>
                      </div>
                    )}
                   {/* MC1: Network diagnostic block removed per user request */}
                 </div>}
            </div>
            )}
          </div>
        )}
      </main>
      <SettingsTabs 
        activeTab="none"
        setActiveTab={(tab) => onNavigateToTab?.(tab)}
        onOpenRules={() => onNavigateToTab?.('config')}
        isSettingsInicialSaved={isSettingsInicialSaved}
        isSettingsRegrasSaved={isSettingsRegrasSaved}
        isMirroringActive={isLiveActive}
        onOpenMenu={() => onOpenMenu?.()}
        isOfflineMode={isOfflineMode}
        onExitOffline={onExitOffline}
      />
    </div>
  );
};