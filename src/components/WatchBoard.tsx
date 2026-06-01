import React from 'react';
import { RotateCcw, Zap, X, Trophy, VolumeX, Wifi, WifiOff, Settings, RefreshCw, Mic, Watch, SquareKanban, Cast, BatteryCharging } from 'lucide-react';
import { GameState, PointType, CourtSide } from '../types.ts';
import { isWatchDevice } from '../utils/device';
import { LiveIndicator } from './LiveIndicator.tsx';
import { getTennisServerSide } from '../utils/tennisEngine.ts';

type WatchStatusPanel = 'set' | 'mic' | 'battery';
type BatteryStatus = { percent: number; charging: boolean };
type BatteryManagerLike = EventTarget & {
  level: number;
  charging: boolean;
  addEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
  removeEventListener: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
};

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
  onSyncScoreboard?: () => Promise<void>;
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
  fbSyncStatus?: { team: 1 | 2; seq: number; isObserver: boolean } | null;
  onVoiceToggle?: () => void;
  isVoiceActive?: boolean;
  onToggleWatchMode?: () => void;
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
  isDimmed, setIsDimmed, resetDimTimer, dimProgress = 0, isCommandOwner, onResetMatch, onOpenLiveControl, onSyncScoreboard, remoteActionFeedback,
  p1WonSets, p2WonSets, isOfflineMode, handleScoreCardPointerDown, handlePointerMove, handleScoreCardPointerUp,
  isEmbedded, scorePressProgress, cloudLiveExists, role, fbSyncStatus, onVoiceToggle, isVoiceActive, onToggleWatchMode, onToggleScoreboardMode
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [statusPanel, setStatusPanel] = React.useState<WatchStatusPanel>('set');
  const [batteryStatus, setBatteryStatus] = React.useState<BatteryStatus | null>(null);
  const pauseRotationUntil = React.useRef(0);

  React.useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (!nav.getBattery) return;

    let battery: BatteryManagerLike | null = null;
    let cancelled = false;

    const updateBatteryStatus = () => {
      if (!battery) return;
      const percent = Math.max(0, Math.min(100, Math.round(battery.level * 100)));
      setBatteryStatus({ percent, charging: battery.charging });
    };

    nav.getBattery().then((manager) => {
      if (cancelled) return;
      battery = manager;
      updateBatteryStatus();
      manager.addEventListener('levelchange', updateBatteryStatus);
      manager.addEventListener('chargingchange', updateBatteryStatus);
    }).catch(() => {
      setBatteryStatus(null);
    });

    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', updateBatteryStatus);
      battery?.removeEventListener('chargingchange', updateBatteryStatus);
    };
  }, []);

  React.useEffect(() => {
    const panels: WatchStatusPanel[] = batteryStatus ? ['set', 'mic', 'battery'] : ['set', 'mic'];
    const interval = setInterval(() => {
      if (Date.now() < pauseRotationUntil.current) return;
      setStatusPanel(prev => {
        const currentIndex = panels.includes(prev) ? panels.indexOf(prev) : 0;
        return panels[(currentIndex + 1) % panels.length];
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [batteryStatus]);

  const handleMicInteraction = (e: React.PointerEvent) => {
    e.stopPropagation();
    onVoiceToggle?.();
    setStatusPanel('mic');
    resetDimTimer();
    pauseRotationUntil.current = Date.now() + 6000;
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
        onPointerDown={(e) => { e.stopPropagation(); onSwitchServer(team, isPartner); }}
        className={`flex items-center justify-center min-w-[48px] h-[48px] rounded-2xl font-black text-2xl transition-all active:scale-90 ${
          isServingNow ? `bg-white ${teamColorText} shadow-lg` : 'text-white border-2 border-white/20'
        }`}
      >
        {initial}
      </div>
    );
  };

  const isLiveActive = !!(gameState.isMirroringActive && !gameState.isLiveClosed) || !!cloudLiveExists;
  const batteryFillClass = batteryStatus?.charging
    ? 'bg-emerald-500'
    : (batteryStatus?.percent ?? 100) <= 20
      ? 'bg-red-500'
      : (batteryStatus?.percent ?? 100) < 60
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  const gamesSetT1 = (
    <div
      onPointerDown={(e) => handleScoreCardPointerDown(e, 'gameSet', 1)}
      onPointerMove={handlePointerMove}
      onPointerUp={() => handleScoreCardPointerUp('gameSet', 1)}
      className={`flex-1 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden ${SOLID_COLORS[gameState.p1.color || 'azul']}`}
    >
      {scorePressProgress?.player === 1 && scorePressProgress?.type === 'gameSet' && (
        <div
          className="absolute inset-0 bg-white/20 origin-left transition-all duration-75 z-0"
          style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }}
        />
      )}
      <span className="text-5xl font-black text-white relative z-10">{gameState.p1.games}</span>
    </div>
  );

  const setsPartidaT1 = (
    <div
      onPointerDown={(e) => handleScoreCardPointerDown(e, 'matchSet', 1)}
      onPointerMove={handlePointerMove}
      onPointerUp={() => handleScoreCardPointerUp('matchSet', 1)}
      className="flex-1 bg-white rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden"
    >
      {scorePressProgress?.player === 1 && scorePressProgress?.type === 'matchSet' && (
        <div
          className="absolute inset-0 bg-black/10 origin-left transition-all duration-75 z-0"
          style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }}
        />
      )}
      <span className="text-5xl font-black text-black relative z-10">{p1WonSets}</span>
    </div>
  );

  const gamesSetT2 = (
    <div
      onPointerDown={(e) => handleScoreCardPointerDown(e, 'gameSet', 2)}
      onPointerMove={handlePointerMove}
      onPointerUp={() => handleScoreCardPointerUp('gameSet', 2)}
      className={`flex-1 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden ${SOLID_COLORS[gameState.p2.color || 'vermelho']}`}
    >
      {scorePressProgress?.player === 2 && scorePressProgress?.type === 'gameSet' && (
        <div
          className="absolute inset-0 bg-white/20 origin-left transition-all duration-75 z-0"
          style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }}
        />
      )}
      <span className="text-5xl font-black text-white relative z-10">{gameState.p2.games}</span>
    </div>
  );

  const setsPartidaT2 = (
    <div
      onPointerDown={(e) => handleScoreCardPointerDown(e, 'matchSet', 2)}
      onPointerMove={handlePointerMove}
      onPointerUp={() => handleScoreCardPointerUp('matchSet', 2)}
      className="flex-1 bg-white rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden"
    >
      {scorePressProgress?.player === 2 && scorePressProgress?.type === 'matchSet' && (
        <div
          className="absolute inset-0 bg-black/10 origin-left transition-all duration-75 z-0"
          style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }}
        />
      )}
      <span className="text-5xl font-black text-black relative z-10">{p2WonSets}</span>
    </div>
  );

  // ── Indicador de saque ────────────────────────────────────────────────────
  // Renderiza para pickleball, tênis e beach tênis.
  // team 1 → ancorado no bottom do card; team 2 → ancorado no top do card.
  // Pickleball: posição horizontal por pkl.server.side (even=direita, odd=esquerda).
  // Tênis / beach: sempre centralizado (sem regra de lado).
  // opacity 0 quando não saca — espaço reservado, sem deslocar layout.
  const renderServerIndicator = (team: 1 | 2) => {
    const sport = gameState.matchConfig.sportType;
    if (sport !== 'pickleball' && sport !== 'tennis' && sport !== 'beach-tennis') return null;

    const isServing   = gameState.server === team;
    const isDoubles   = gameState.matchConfig.isDoubles;
    const pkl         = gameState.pickleball;

    // Número do servidor: pickleball usa pkl.server; tênis deriva do servingOrderOffset
    const srvNum: 1 | 2 = pkl
      ? pkl.server.serverNumber
      : (gameState.servingOrderOffset >= 2 ? 2 : 1);
    const label = isDoubles ? `S${srvNum}` : 'S';

    // Posição horizontal via style inline (evita purge do Tailwind)
    // Pickleball: usa pkl.server.side; Tênis/beach: calcula pela paridade do total de pontos do game
    const side: CourtSide = (sport === 'pickleball' && pkl)
      ? pkl.server.side
      : getTennisServerSide(gameState);
    const justifyContent = side === 'even' ? 'flex-end' : 'flex-start';

    // Posição vertical
    const posClass = team === 1 ? 'bottom-2' : 'top-2';

    // Cor do texto = cor do time sacador
    const textColorClass = team === 1
      ? TEXT_COLORS[gameState.p1.color || 'azul']
      : TEXT_COLORS[gameState.p2.color || 'vermelho'];

    return (
      <div
        className={`absolute ${posClass} left-3 right-3 flex z-20 pointer-events-none`}
        style={{ justifyContent }}
      >
        <div
          className="w-8 h-8 rounded-full bg-white flex items-center justify-center"
          style={{
            boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
            opacity: isServing ? 1 : 0,
            transition: 'opacity 150ms',
          }}
        >
          <span className={`text-[11px] font-black leading-none ${textColorClass}`}>{label}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`${isEmbedded ? 'relative w-full aspect-[4/5] rounded-[2rem]' : 'fixed inset-0 h-full w-full z-[99999]'} bg-black flex select-none touch-none overflow-hidden`}>
      {isDimmed && (
        <div
          onPointerDown={(e) => { e.stopPropagation(); setIsDimmed(false); resetDimTimer(); }}
          className="fixed inset-0 z-[100002] bg-black/50 backdrop-blur-none animate-in fade-in duration-500"
        >

        </div>
      )}
      
      {isAudioLocked && (
        <div onPointerDown={async () => { await unlockAudio(); announceFullScore(); }} className="fixed top-2 left-1/2 -translate-x-1/2 z-[100000] px-4 py-2 rounded-xl shadow-2xl bg-orange-600 text-white flex items-center gap-2 animate-bounce cursor-pointer">
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
              <button onPointerDown={() => onConfirmMatch?.()} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-xs shadow-lg">Confirmar resultado</button>
              {isCommandOwner && <button onPointerDown={handleUndoWithLog} className="w-full py-2 bg-slate-800 text-white rounded-xl font-black text-xs">Desfazer ponto</button>}
            </div>
          </div>
        </div>
      )}

      <div className="w-[22%] h-full flex flex-col bg-black border-r border-white/10 shrink-0 p-1 gap-1">
        <div className="flex-1 flex flex-col gap-1">
          {setsPartidaT1}
          {gamesSetT1}
        </div>
        <div className={`h-16 flex items-center justify-center rounded-2xl transition-all relative overflow-hidden ${isDimmed ? 'bg-white/20 animate-dim-pulse' : 'bg-slate-800/40'}`}>
          <div className={`absolute inset-0 flex items-center justify-center gap-1 transition-opacity duration-500 ${statusPanel === 'set' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <span className="text-5xl font-black leading-none text-white">{gameState.currentSet + 1}</span>
            <div className={`flex flex-col items-center text-[11px] font-black leading-[1.1] font-bold ${isDimmed ? 'text-white/70' : 'text-slate-400'}`}>
              <span>S</span>
              <span>e</span>
              <span>t</span>
            </div>
          </div>
          <div 
            role="button"
            onPointerDown={handleMicInteraction}
            className={`absolute inset-0 flex items-center justify-center transition-all duration-500 cursor-pointer ${statusPanel === 'mic' ? 'opacity-100 scale-100' : 'opacity-0 scale-50 pointer-events-none'}`}
          >
            <Mic size={32} strokeWidth={isVoiceActive ? 3.5 : 2} className={isVoiceActive ? 'text-blue-400' : 'text-slate-400'} />
            {!isVoiceActive && <div className="absolute w-8 h-[2.5px] bg-red-500 -rotate-45 pointer-events-none shadow-sm" />}
          </div>
          {batteryStatus && (
            <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${statusPanel === 'battery' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
              <div
                className={`absolute inset-y-0 left-0 ${batteryFillClass}`}
                style={{ width: `${batteryStatus.percent}%` }}
              />
              <span className="relative z-10 flex items-center gap-1 text-3xl font-black leading-none text-white tabular-nums">
                {batteryStatus.charging && <BatteryCharging size={22} strokeWidth={3.5} />}
                <span>{batteryStatus.percent}%</span>
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1">
          {gamesSetT2}
          {setsPartidaT2}
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div onPointerDown={(e) => { resetDimTimer(); handleScoreCardPointerDown(e, 'game', 1); }} onPointerMove={handlePointerMove} onPointerUp={() => handleScoreCardPointerUp('game', 1)} className={`flex-1 w-full flex items-center justify-center relative overflow-hidden transition-all ${WATCH_COLORS[gameState.p1.color || 'azul']} ${!isCommandOwner ? 'opacity-70' : ''} ${gameState.isMirroringActive && gameState.isLiveClosed && !isOfflineMode ? 'pointer-events-none grayscale opacity-50' : ''}`} >
          {scorePressProgress?.player === 1 && scorePressProgress?.type === 'game' && (
            <div 
              className="absolute inset-0 bg-white/20 origin-left transition-all duration-75 z-0" 
              style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
            />
          )}
          <span className={`text-[130px] font-black leading-none tabular-nums tracking-tighter relative z-10 ${gameState.server === 1 ? 'text-[#bef264]' : 'text-white'}`}>{gameState.p1.score}</span>
          {remoteActionFeedback === 'P1_POINT' && <div className="absolute inset-0 bg-white/20 animate-ping pointer-events-none" />}
          {renderServerIndicator(1)}
          {/* FB Sync Badge — topo-esquerdo, compacto para display do relógio */}
          {fbSyncStatus?.team === 1 && (
            <div className="absolute top-2 left-2 z-30 pointer-events-none flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="text-[16px] font-black text-white leading-none tabular-nums">FB|{fbSyncStatus.seq}</span>
              <span className={`w-3 h-3 rounded-full animate-pulse flex-shrink-0 ${fbSyncStatus.isObserver ? 'bg-blue-400' : 'bg-green-400'}`} />
            </div>
          )}
        </div>
        
        <div className="h-20 bg-black border-y border-white/10 flex items-center justify-around px-2 shrink-0 z-10 relative">
          {/* Undo — desabilitado para observadores em live ativa */}
          <button
            onPointerDown={() => { if (!isCommandOwner) return; resetDimTimer(); handleUndoWithLog(); }}
            disabled={!isCommandOwner}
            className={`w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white border border-white/5 transition-all ${
              !isCommandOwner ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'
            }`}
          >
            <RotateCcw size={34} strokeWidth={4} />
          </button>

          {/* Ace — desabilitado para observadores em live ativa */}
          <button
            disabled={!isCommandOwner}
            onPointerDown={() => { if (!isCommandOwner) return; onScoreUpdate(gameState.server, 'ace', 'cb'); }}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
              SOLID_COLORS[gameState.server === 1 ? (gameState.p1.color || 'azul') : (gameState.p2.color || 'vermelho')]
            } ${!isCommandOwner ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'}`}
          >
            <Zap size={30} fill="currentColor" />
          </button>

          {/* Botão Live/Modal — sempre ativo */}
          <div
            role="button"
            onPointerDown={() => { resetDimTimer(); setIsMenuOpen(true); }}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform border-2 relative overflow-hidden cursor-pointer ${
              isLiveActive ? 'border-emerald-400 bg-white/5 text-emerald-400' :
              isOfflineMode ? 'border-yellow-400 bg-yellow-500 text-black' :
              'border-white bg-emerald-500 text-white'
            }`}
          >
            {isLiveActive
              ? <LiveIndicator role={role || (isCommandOwner ? 'owner' : 'observer')} status={isLiveActive ? (isCommandOwner ? 'controller' : 'watcher') : undefined} variant="header" className="w-full h-full pointer-events-none" />
              : isOfflineMode ? <WifiOff size={30} className="relative z-10" /> : <Wifi size={30} className="relative z-10" />
            }
          </div>

          {/* Falta — desabilitado para observadores em live ativa */}
          <button
            disabled={!isCommandOwner}
            onPointerDown={() => { if (!isCommandOwner) return; onScoreUpdate(gameState.server === 1 ? 2 : 1, 'fault', 'cb'); }}
            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
              SOLID_COLORS[gameState.server === 1 ? (gameState.p2.color || 'vermelho') : (gameState.p1.color || 'azul')]
            } ${!isCommandOwner ? 'opacity-20 cursor-not-allowed' : 'active:scale-90'}`}
          >
            <X size={34} strokeWidth={5} />
          </button>

          {dimProgress > 0 && !isDimmed && (
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-white/20 pointer-events-none">
              <div className="h-full bg-white transition-none" style={{ width: `${dimProgress}%` }} />
            </div>
          )}
        </div>


        {/* Bottom sheet — menu do botão wifi/live */}
        {isMenuOpen && (
          <div
            className="fixed inset-0 z-[999999] flex flex-col justify-end"
            onPointerDown={() => setIsMenuOpen(false)}
          >
            <div
              className="bg-[#1e293b] rounded-t-3xl border-t border-white/10 p-4 space-y-2"
              onPointerDown={e => e.stopPropagation()}
            >
              {/* Handle visual */}
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

              {/* Live / Controle — só se live ativo */}
              {isLiveActive && (
                <div
                  role="button"
                  onPointerDown={() => { setIsMenuOpen(false); onOpenLiveControl?.(); }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 active:bg-white/10 text-white transition-colors cursor-pointer"
                >
                  <LiveIndicator role={role || (isCommandOwner ? 'owner' : 'observer')} status={isLiveActive ? (isCommandOwner ? 'controller' : 'watcher') : undefined} variant="header" className="w-8 h-8 shrink-0" />
                  <span className="font-black text-sm">Live / Controle</span>
                </div>
              )}

              {/* Modo relógio */}
              {(() => {
                const isWatchMode = !!gameState.matchConfig.isWatchMode;
                const isScoreboardMode = !!gameState.matchConfig.isScoreboardMode;
                const currentMode = isWatchMode ? 'watch' : (isScoreboardMode ? 'scoreboard' : 'control');
                const show3WayToggle = !isOfflineMode && !isWatchDevice();

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
                  <div className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 text-white">
                    <span className="font-black text-sm shrink-0">
                      {currentMode === 'control' && 'Placar'}
                      {currentMode === 'watch' && 'Modo relógio'}
                      {currentMode === 'scoreboard' && 'Modo placar'}
                    </span>

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

              {/* Regras */}
              <button
                onPointerDown={() => { setIsMenuOpen(false); onBack(); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 active:bg-white/10 text-white transition-colors"
              >
                <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-emerald-500 rounded-xl">
                  <Settings size={18} />
                </div>
                <span className="font-black text-sm">Regras</span>
              </button>

              {/* Zerar partida — só se commandOwner */}
              {isCommandOwner && onResetMatch && (
                <button
                  onPointerDown={() => { setIsMenuOpen(false); onResetMatch(); }}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-red-500/20 active:bg-red-500/30 text-red-400 transition-colors"
                >
                  <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-red-500/30 rounded-xl">
                    <RefreshCw size={18} />
                  </div>
                  <span className="font-black text-sm">Zerar partida</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div onPointerDown={(e) => { resetDimTimer(); handleScoreCardPointerDown(e, 'game', 2); }} onPointerMove={handlePointerMove} onPointerUp={() => handleScoreCardPointerUp('game', 2)} className={`flex-1 w-full flex items-center justify-center transition-all relative overflow-hidden ${WATCH_COLORS[gameState.p2.color || 'vermelho']} ${!isCommandOwner ? 'opacity-70' : ''} ${gameState.isMirroringActive && gameState.isLiveClosed && !isOfflineMode ? 'pointer-events-none grayscale opacity-50' : ''}`} >
          {scorePressProgress?.player === 2 && scorePressProgress?.type === 'game' && (
            <div 
              className="absolute inset-0 bg-white/20 origin-left transition-all duration-75 z-0" 
              style={{ transform: `scaleX(${scorePressProgress.progress / 100})` }} 
            />
          )}
          <span className={`text-[130px] font-black leading-none tabular-nums tracking-tighter relative z-10 ${gameState.server === 2 ? 'text-[#bef264]' : 'text-white'}`}>{gameState.p2.score}</span>
          {remoteActionFeedback === 'P2_POINT' && <div className="absolute inset-0 bg-white/20 animate-ping pointer-events-none" />}
          {renderServerIndicator(2)}
          {/* FB Sync Badge — inferior-esquerdo (topo ocupado pelo indicador de saque) */}
          {fbSyncStatus?.team === 2 && (
            <div className="absolute bottom-2 left-2 z-30 pointer-events-none flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
              <span className="text-[16px] font-black text-white leading-none tabular-nums">FB|{fbSyncStatus.seq}</span>
              <span className={`w-3 h-3 rounded-full animate-pulse flex-shrink-0 ${fbSyncStatus.isObserver ? 'bg-blue-400' : 'bg-green-400'}`} />
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
