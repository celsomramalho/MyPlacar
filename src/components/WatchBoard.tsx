
import React from 'react';
import { RotateCcw, Zap, Settings, X, Play, Trophy, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { GameState, PointType } from '../types';
import { LiveIndicator } from './LiveIndicator';

interface WatchBoardProps {
  gameState: GameState;
  onScoreUpdate: (player: 1 | 2, type?: PointType, source?: string) => void;
  onUndo: () => void;
  onSwitchServer: (team: 1 | 2, isPartner: boolean) => void;
  onBack: () => void;
  onConfirmMatch?: () => void;
  isListening: boolean;
  isAudioLocked: boolean;
  unlockAudio: () => Promise<boolean>;
  announceFullScore: () => void;
  handleUndoWithLog: () => void;
  isDimmed: boolean;
  setIsDimmed: (val: boolean) => void;
  resetDimTimer: () => void;
  dimProgress?: number;
  isCommandOwner: boolean;
  onResetMatch?: () => void;
  onOpenLiveControl?: () => void;
  remoteActionFeedback: string | null;
  p1WonSets: number;
  p2WonSets: number;
  isOfflineMode?: boolean;
  correctionMode: string;
  closeCorrection: () => void;
  handleApplyPickerCorrection: (val: string) => void;
  pickerOptions: string[];
  correctionPlayer: 1 | 2 | null;
  handleScoreCardPointerDown: (e: any, type: any, player: 1 | 2) => void;
  handlePointerMove: (e: any) => void;
  handleScoreCardPointerUp: (type: 'game' | 'gameSet' | 'matchSet', player: 1 | 2) => void;
  isEmbedded?: boolean;
  scorePressProgress?: { player: 1 | 2; type: 'game' | 'gameSet' | 'matchSet'; progress: number } | null;
  cloudLiveExists?: boolean;
  role?: 'owner' | 'judge' | 'observer' | 'spectator';
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

const WATCH_COLORS: Record<string, string> = {
  amarelo: 'bg-yellow-600', azul: 'bg-blue-700', laranja: 'bg-orange-600', marrom: 'bg-amber-900',
  lilas: 'bg-violet-700', verde: 'bg-green-700', vermelho: 'bg-red-700', roxo: 'bg-purple-700'
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

export const WatchBoard: React.FC<WatchBoardProps> = ({
  gameState, onScoreUpdate, onSwitchServer, onBack, onConfirmMatch,
  isAudioLocked, unlockAudio, announceFullScore, handleUndoWithLog,
  isDimmed, setIsDimmed, resetDimTimer, dimProgress = 0, isCommandOwner, onResetMatch, onOpenLiveControl, remoteActionFeedback,
  p1WonSets, p2WonSets, isOfflineMode, handleScoreCardPointerDown, handlePointerMove, handleScoreCardPointerUp,
  isEmbedded, scorePressProgress, cloudLiveExists, role
}) => {
  const [pressProgress, setPressProgress] = React.useState(0);
  const pressTimerRef = React.useRef<any>(null);
  const progressIntervalRef = React.useRef<any>(null);

  const startPress = () => {
    if (!onResetMatch || role === 'observer') return;
    setPressProgress(0);
    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setPressProgress(Math.min((elapsed / 3000) * 100, 100));
    }, 50);
    pressTimerRef.current = setTimeout(() => {
      stopPress();
      onResetMatch();
    }, 3000);
  };

  const stopPress = () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setPressProgress(0);
  };


  const renderWatchInitial = (team: 1 | 2, isPartner: boolean) => {
    const offset = gameState.servingOrderOffset;
    const isServingNow = team === 1 
      ? (isPartner ? offset === 2 : offset === 0)
      : (isPartner ? offset === 3 : offset === 1);
    
    const name = team === 1 
      ? (isPartner ? gameState.p1.partnerName : gameState.p1.name)
      : (isPartner ? gameState.p2.partnerName : gameState.p2.name);
    
    if (!name) return null;
    const initial = name.trim().charAt(0).toUpperCase();
    const teamColorText = team === 1 ? TEXT_COLORS[gameState.p1.color || 'azul'] : TEXT_COLORS[gameState.p2.color || 'vermelho'];

    return (
      <div 
        onClick={(e) => { e.stopPropagation(); onSwitchServer(team, isPartner); }}
        className={`flex items-center justify-center min-w-[48px] h-[48px] rounded-2xl font-black text-2xl transition-all active:scale-90 ${
          isServingNow ? `bg-white ${teamColorText} shadow-lg` : 'text-white border-2 border-white/20'
        }`}
      >
        {initial}
      </div>
    );
  };

  const isLiveActive = !!(gameState.isMirroringActive && !gameState.isLiveClosed) || !!cloudLiveExists;

  return (
    <div className={`${isEmbedded ? 'relative w-full aspect-[4/5] rounded-[2rem]' : 'fixed inset-0 h-full w-full z-[99999]'} bg-black flex select-none touch-none overflow-hidden ${gameState.isLiveClosed ? 'grayscale opacity-60 pointer-events-none' : ''}`}>
      {isDimmed && (
        <div onClick={(e) => { e.stopPropagation(); setIsDimmed(false); resetDimTimer(); }} className="fixed inset-0 z-[100002] bg-black/90 flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-white/20 flex items-center justify-center animate-pulse"><Play size={32} className="text-white fill-white ml-1" /></div>
            <span className="text-[10px] font-black text-white/40 tracking-widest">Toque para acordar</span>
          </div>
        </div>
      )}
      
      {isAudioLocked && (
        <div onClick={async () => { await unlockAudio(); announceFullScore(); }} className="fixed top-2 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2 rounded-xl shadow-2xl bg-orange-600 text-white flex items-center gap-2 animate-bounce cursor-pointer">
          <VolumeX size={16} /><span className="text-[10px] font-black">Ativar som</span>
        </div>
      )}
      
      {gameState.isMatchOver && !gameState.isConfirmedFinished && (
        <div className="fixed inset-0 z-[100001] bg-black/95 backdrop-blur-md flex items-center justify-center p-2">
          <div className="bg-slate-900 rounded-[2rem] p-4 w-full flex flex-col items-center gap-4 border border-white/10">
            <Trophy size={32} className="text-amber-500" />
            <div className="text-center">
              <h3 className="text-sm font-black text-white leading-tight">Partida encerrada</h3>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Venceu: {p1WonSets > p2WonSets ? gameState.p1.name : gameState.p2.name}</p>
            </div>
            <div className="flex flex-col w-full gap-2">
              <button onClick={() => onConfirmMatch?.()} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-xs shadow-lg">Confirmar resultado</button>
              {isCommandOwner && <button onClick={handleUndoWithLog} className="w-full py-2 bg-slate-800 text-white rounded-xl font-black text-xs">Desfazer ponto</button>}
            </div>
          </div>
        </div>
      )}

      <div className="w-[22%] h-full flex flex-col bg-black border-r border-white/10 shrink-0 p-1 gap-1">
        <div className="flex-1 flex flex-col gap-1">
          <div 
            onPointerDown={(e) => handleScoreCardPointerDown(e, 'matchSet', 1)} 
            onPointerMove={handlePointerMove} 
            onPointerUp={() => handleScoreCardPointerUp('matchSet', 1)}
            className={`flex-1 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden ${SOLID_COLORS[gameState.p1.color || 'azul']}`}
          >
            {scorePressProgress?.player === 1 && scorePressProgress?.type === 'matchSet' && (
              <div 
                className="absolute inset-0 bg-white/10 origin-left transition-all duration-75 z-0" 
                style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
              />
            )}
            <span className="text-5xl font-black text-white relative z-10">{p1WonSets}</span>
          </div>
          <div 
            onPointerDown={(e) => handleScoreCardPointerDown(e, 'gameSet', 1)} 
            onPointerMove={handlePointerMove} 
            onPointerUp={() => handleScoreCardPointerUp('gameSet', 1)}
            className="flex-1 bg-white rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden"
          >
            {scorePressProgress?.player === 1 && scorePressProgress?.type === 'gameSet' && (
              <div 
                className="absolute inset-0 bg-black/5 origin-left transition-all duration-75 z-0" 
                style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
              />
            )}
            <span className="text-5xl font-black text-black relative z-10">{gameState.p1.games}</span>
          </div>
        </div>
        <div className="h-16 flex items-center justify-center bg-slate-800/40 rounded-2xl gap-1">
          <span className="text-5xl font-black text-white leading-none">{gameState.currentSet + 1}</span>
          <div className="flex flex-col items-center text-[11px] font-black text-slate-400 leading-[1.1] font-bold">
            <span>S</span>
            <span>e</span>
            <span>t</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div 
            onPointerDown={(e) => handleScoreCardPointerDown(e, 'gameSet', 2)} 
            onPointerMove={handlePointerMove} 
            onPointerUp={() => handleScoreCardPointerUp('gameSet', 2)}
            className="flex-1 bg-white rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden"
          >
            {scorePressProgress?.player === 2 && scorePressProgress?.type === 'gameSet' && (
              <div 
                className="absolute inset-0 bg-black/5 origin-left transition-all duration-75 z-0" 
                style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
              />
            )}
            <span className="text-5xl font-black text-black relative z-10">{gameState.p2.games}</span>
          </div>
          <div 
            onPointerDown={(e) => handleScoreCardPointerDown(e, 'matchSet', 2)} 
            onPointerMove={handlePointerMove} 
            onPointerUp={() => handleScoreCardPointerUp('matchSet', 2)}
            className={`flex-1 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden ${SOLID_COLORS[gameState.p2.color || 'vermelho']}`}
          >
            {scorePressProgress?.player === 2 && scorePressProgress?.type === 'matchSet' && (
              <div 
                className="absolute inset-0 bg-white/10 origin-left transition-all duration-75 z-0" 
                style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
              />
            )}
            <span className="text-5xl font-black text-white relative z-10">{p2WonSets}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div onPointerDown={(e) => { resetDimTimer(); handleScoreCardPointerDown(e, 'game', 1); }} onPointerMove={handlePointerMove} onPointerUp={() => handleScoreCardPointerUp('game', 1)} className={`flex-1 w-full flex items-center justify-center relative overflow-hidden transition-all ${WATCH_COLORS[gameState.p1.color || 'azul']} ${!isCommandOwner ? 'opacity-70' : ''}`} >
          {scorePressProgress?.player === 1 && scorePressProgress?.type === 'game' && (
            <div 
              className="absolute inset-0 bg-white/10 origin-left transition-all duration-75 z-0" 
              style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
            />
          )}
          <span className={`text-[130px] font-black leading-none tabular-nums tracking-tighter relative z-10 ${gameState.server === 1 ? 'text-[#bef264]' : 'text-white'}`}>{gameState.p1.score}</span>
          {remoteActionFeedback === 'P1_POINT' && <div className="absolute inset-0 bg-white/20 animate-ping pointer-events-none" />}
        </div>
        
        <div className="h-20 bg-black border-y border-white/10 flex items-center justify-around px-2 shrink-0 z-10">
          <button onClick={() => { resetDimTimer(); handleUndoWithLog(); }} disabled={!isCommandOwner} className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white active:scale-90 border border-white/5"><RotateCcw size={32} strokeWidth={4} /></button>
          <button 
            disabled={!isCommandOwner} 
            onClick={() => onScoreUpdate(gameState.server, 'ace', 'cb')} 
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all ${
              SOLID_COLORS[gameState.server === 1 ? (gameState.p1.color || 'azul') : (gameState.p2.color || 'vermelho')]
            }`}
          >
            <Zap size={28} fill="currentColor" />
          </button>
          {isLiveActive ? (
            <LiveIndicator 
              role={role || (isCommandOwner ? 'owner' : 'observer')} 
              variant="header" 
              onClick={onOpenLiveControl}
              onPointerDown={startPress}
              onPointerUp={stopPress}
              onPointerLeave={stopPress}
              progress={pressProgress}
              className="w-14 h-14 bg-white/5 rounded-2xl border border-white/10 shadow-lg" 
            />
          ) : (
            <button 
              onPointerDown={startPress}
              onPointerUp={stopPress}
              onPointerLeave={stopPress}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform border-2 border-white relative overflow-hidden ${isOfflineMode ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-white'}`}
            >
              {pressProgress > 0 && (
                <div 
                  className="absolute inset-0 bg-black/10 origin-left transition-all duration-75" 
                  style={{ transform: `scaleX(${pressProgress / 100})` }} 
                />
              )}
              {isOfflineMode ? <WifiOff size={28} className="relative z-10" /> : <Wifi size={28} className="relative z-10" />}
            </button>
          )}
          <button 
            disabled={!isCommandOwner} 
            onClick={() => onScoreUpdate(gameState.server === 1 ? 2 : 1, 'fault', 'cb')} 
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all ${
              SOLID_COLORS[gameState.server === 1 ? (gameState.p2.color || 'vermelho') : (gameState.p1.color || 'azul')]
            }`}
          >
            <X size={32} strokeWidth={5} />
          </button>
          {!isEmbedded && (
            <button onClick={onBack} className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white active:scale-90 border border-white/5">
              <Settings size={28} />
            </button>
          )}
        </div>

        <div onPointerDown={(e) => { resetDimTimer(); handleScoreCardPointerDown(e, 'game', 2); }} onPointerMove={handlePointerMove} onPointerUp={() => handleScoreCardPointerUp('game', 2)} className={`flex-1 w-full flex items-center justify-center transition-all relative overflow-hidden ${WATCH_COLORS[gameState.p2.color || 'vermelho']} ${!isCommandOwner ? 'opacity-70' : ''}`} >
          {scorePressProgress?.player === 2 && scorePressProgress?.type === 'game' && (
            <div 
              className="absolute inset-0 bg-white/10 origin-left transition-all duration-75 z-0" 
              style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
            />
          )}
          <span className={`text-[130px] font-black leading-none tabular-nums tracking-tighter relative z-10 ${gameState.server === 2 ? 'text-[#bef264]' : 'text-white'}`}>{gameState.p2.score}</span>
          {remoteActionFeedback === 'P2_POINT' && <div className="absolute inset-0 bg-white/20 animate-ping pointer-events-none" />}
        </div>
      </div>
      {/* Barra de progresso do dim — aparece nos últimos 5s antes de escurecer */}
      {dimProgress > 0 && !isDimmed && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-[99998] pointer-events-none">
          <div
            className="h-full bg-white/30 transition-none"
            style={{ width: `${dimProgress}%` }}
          />
        </div>
      )}
    </div>
  );
};
