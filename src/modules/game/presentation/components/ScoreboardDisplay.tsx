import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Settings, RefreshCw, Mic, RotateCcw, MonitorSmartphone, Trophy, SquareKanban, Watch, Cast } from 'lucide-react';
import { GameState, CourtSide } from '../../../../types.ts';
import { isWatchDevice } from '@shared/utils/device';
import { LiveIndicator } from '@modules/live';
import { getTennisServerSide } from '@modules/game/domain/tennisEngine';
import { useMatchTimer } from '../hooks/useMatchTimer.ts';

// ─── Props ────────────────────────────────────────────────────────────────────
interface ScoreboardDisplayProps {
gameState: GameState;
isCommandOwner: boolean;
onResetMatch?: () => void;
onOpenLiveControl?: () => void;
onBack: () => void;
cloudLiveExists?: boolean;
isOfflineMode?: boolean;
role?: 'owner' | 'judge' | 'observer' | 'spectator';
onVoiceToggle?: () => void;
isVoiceActive?: boolean;
  fbSyncStatus?: { team: 1 | 2; seq: number; isObserver: boolean } | null;
  onToggleScoreboardMode?: () => void;
  onToggleWatchMode?: () => void;
}

// ─── Cores por time ───────────────────────────────────────────────────────────
const BG_COLORS: Record<string, string> = {
amarelo: 'bg-yellow-600',
azul:    'bg-blue-700',
laranja: 'bg-orange-600',
marrom:  'bg-amber-900',
lilas:   'bg-violet-700',
verde:   'bg-green-700',
vermelho:'bg-red-700',
roxo:    'bg-purple-700',
};

const TEXT_COLORS: Record<string, string> = {
azul:    'text-blue-600',
vermelho:'text-red-600',
verde:   'text-green-600',
amarelo: 'text-yellow-500',
laranja: 'text-orange-500',
lilas:   'text-violet-500',
marrom:  'text-amber-700',
roxo:    'text-purple-600',
};

// ─── Componente principal ─────────────────────────────────────────────────────
export const ScoreboardDisplay: React.FC<ScoreboardDisplayProps> = ({
gameState,
isCommandOwner,
onResetMatch,
onOpenLiveControl,
onBack,
cloudLiveExists,
isOfflineMode,
role,
onVoiceToggle,
isVoiceActive = false,
  fbSyncStatus,
  onToggleScoreboardMode,
  onToggleWatchMode,
}) => {
const [isMenuOpen, setIsMenuOpen] = useState(false);
const [physicalLandscape, setPhysicalLandscape] = useState(
() => window.innerWidth > window.innerHeight
);
const [forceLayoutOverride, setForceLayoutOverride] = useState<boolean | null>(null);
// isLandscape: usa override manual se definido, senão usa a orientação física
const isLandscape = forceLayoutOverride !== null ? forceLayoutOverride : physicalLandscape;
const isPublicView = new URLSearchParams(window.location.search).get('viewMode') === 'scoreboard';

const displayTime = useMatchTimer(gameState);

// ── Detecção de orientação ─────────────────────────────────────────────────
useEffect(() => {
const handleResize = () => {
const physical = window.innerWidth > window.innerHeight;
setPhysicalLandscape(physical);
// Se o dispositivo girou fisicamente, reseta o override — orientação real assumiu
if (forceLayoutOverride !== null && physical === forceLayoutOverride) {
setForceLayoutOverride(null);
}
};
window.addEventListener('resize', handleResize);
return () => window.removeEventListener('resize', handleResize);
}, [forceLayoutOverride]);

const handleToggleOrientation = () => {
// Alterna entre landscape e portrait manualmente
setForceLayoutOverride(prev => {
if (prev !== null) return prev ? false : true; // alterna override existente
return !physicalLandscape; // cria override oposto à orientação física
});
};

// ── Cronômetro — lê diretamente do gameState (sincronizado via Firebase) ────

// ── Wake Lock — mantém tela acesa ──────────────────────────────────────────
useEffect(() => {
let wakeLock: WakeLockSentinel | null = null;
const requestWakeLock = async () => {
try {
if ('wakeLock' in navigator) {
wakeLock = await (navigator as any).wakeLock.request('screen');
}
} catch (_) {}
};
requestWakeLock();
const handleVisibilityChange = () => {
if (document.visibilityState === 'visible') requestWakeLock();
};
document.addEventListener('visibilitychange', handleVisibilityChange);
return () => {
wakeLock?.release();
document.removeEventListener('visibilitychange', handleVisibilityChange);
};
}, []);

// ── Indicador de sacador ───────────────────────────────────────────────────
  const renderServerIndicator = useCallback((team: 1 | 2) => {
    const sport = gameState.matchConfig.sportType;
    if (sport !== 'pickleball' && sport !== 'tennis' && sport !== 'beach-tennis') return null;

    const isServing = gameState.server === team;
    const isDoubles = gameState.matchConfig.isDoubles;
    const pkl = gameState.pickleball;

    const offset = gameState.servingOrderOffset;
    const srvNum: 1 | 2 = pkl
    ? pkl.server.serverNumber
    : (team === 1 ? (offset === 2 ? 2 : 1) : (offset === 3 ? 2 : 1));
    const label = isDoubles ? `S${srvNum}` : 'S';

    const side: CourtSide = (sport === 'pickleball' && pkl)
    ? pkl.server.side
    : getTennisServerSide(gameState);
    const justifyContent = side === 'even' ? 'flex-end' : 'flex-start';

    const textColorClass = team === 1
    ? TEXT_COLORS[gameState.p1.color || 'azul']
    : TEXT_COLORS[gameState.p2.color || 'vermelho'];

    const show3Digit = sport === 'pickleball' && isDoubles && gameState.matchConfig.pickleballScoringMode !== 'rally' && !!pkl;
    const get3DigitScore = () => {
      if (!pkl) return '';
      if (pkl.isFirstServerActive && pkl.score.team1 === 0 && pkl.score.team2 === 0) return '0-0-2';
      return `${pkl.server.team === 1 ? pkl.score.team1 : pkl.score.team2}-\ ${pkl.server.team === 1 ? pkl.score.team2 : pkl.score.team1}-\ ${pkl.server.serverNumber}`.replace(/- /g, '-');
    };

    return (
      <div
        className={`absolute ${team === 1 ? 'bottom-3' : 'top-3'} left-3 right-3 flex items-center z-20 pointer-events-none`}
        style={{ justifyContent: isServing ? 'space-between' : justifyContent }}
      >
        {isServing && side === 'even' && show3Digit && (
          <span className="text-white/80 font-black tracking-widest text-sm bg-black/45 px-3 py-1 rounded-full">{get3DigitScore()}</span>
        )}
        <div
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0"
          style={{
            boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
            opacity: isServing ? 1 : 0,
            transition: 'opacity 150ms',
          }}
        >
          <span className={`text-sm font-black leading-none ${textColorClass}`}>{label}</span>
        </div>
        {isServing && side === 'odd' && show3Digit && (
          <span className="text-white/80 font-black tracking-widest text-sm bg-black/45 px-3 py-1 rounded-full">{get3DigitScore()}</span>
        )}
      </div>
    );
  }, [gameState]);


// ── Histórico de games por set ─────────────────────────────────────────────
const renderSetHistory = useCallback((player: 1 | 2) => {
const p = player === 1 ? gameState.p1 : gameState.p2;
const currentSet = gameState.currentSet ?? 0;
const isMatchOver = gameState.isMatchOver;

// Calcula o vencedor global se a partida acabou
let isMatchWinner = false;
if (isMatchOver) {
  const p1WonSets = gameState.p1.sets.filter((s, i) => s > (gameState.p2.sets[i] ?? 0)).length;
  const p2WonSets = gameState.p2.sets.filter((s, i) => s > (gameState.p1.sets[i] ?? 0)).length;
  isMatchWinner = player === 1 ? p1WonSets > p2WonSets : p2WonSets > p1WonSets;
}

// Se a partida acabou, o último set jogado já está em p.sets.
const pastSets = isMatchOver 
  ? (p?.sets || []).slice(0, -1) 
  : (p?.sets || []).slice(0, currentSet);

const currentScore = isMatchOver 
  ? (p?.sets && p.sets.length > 0 ? p.sets[p.sets.length - 1] : 0)
  : (p?.games ?? 0);

return (
<div className="flex gap-2 items-end">
{/* Sets encerrados — mesmo tamanho do set atual, opacity para diferenciar */}
{pastSets.map((games, i) => (
<span key={i} className="font-black leading-none text-white text-5xl opacity-50">
{games}
</span>
))}
{/* Separador — só aparece se há sets passados */}
{pastSets.length > 0 && (
<span className="font-black leading-none text-white/30 text-5xl select-none">|</span>
)}
{/* Set atual */}
<span className="font-black leading-none text-[#bef264] text-5xl flex items-center gap-2">
{currentScore}
{isMatchOver && isMatchWinner && (
  <Trophy size={36} className="text-yellow-400 animate-bounce" style={{ animationIterationCount: 3 }} />
)}
</span>
</div>
);
}, [gameState]);


// ── Guard — aguarda gameState completo (deve vir após todos os hooks) ───────
if (!gameState?.p1?.sets || !gameState?.p2?.sets) return null;

const isLiveActive = !!(gameState.isMirroringActive && !gameState.isLiveClosed) || !!cloudLiveExists;
const showMic = !isPublicView && !!onVoiceToggle && gameState.matchConfig.voiceEnabled && (!isLiveActive || isCommandOwner);

const p1Sets = gameState.p1.sets;
const p2Sets = gameState.p2.sets;
const p1WonSets = p1Sets.filter((s, i) => s > (p2Sets[i] ?? 0)).length;
const p2WonSets = p2Sets.filter((s, i) => s > (p1Sets[i] ?? 0)).length;

const formatTime = (s: number) => {
const h = Math.floor(s / 3600);
const m = Math.floor((s % 3600) / 60);
const sec = s % 60;
return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};


// ── Bloco de cada time ─────────────────────────────────────────────────────
const renderTeamBlock = (team: 1 | 2, flex: string) => {
const p = team === 1 ? gameState.p1 : gameState.p2;
const color = p.color || (team === 1 ? 'azul' : 'vermelho');
const isServing = gameState.server === team;

const pkl = gameState.pickleball;
const isDoubles = gameState.matchConfig.isDoubles;
const offset = gameState.servingOrderOffset;
const srvNum: 1 | 2 = pkl
? pkl.server.serverNumber
: (team === 1 ? (offset === 2 ? 2 : 1) : (offset === 3 ? 2 : 1));
// Em duplas: só o jogador que está sacando recebe fundo amarelo
const p1IsServer = isServing && (!isDoubles || srvNum === 1);
const p2IsServer = isServing && isDoubles && srvNum === 2;

    const names = (
      <div className="z-10">
        <p className={`font-black text-2xl leading-tight uppercase px-1 rounded w-fit ${p1IsServer ? 'text-[#1a1a1a] bg-[#bef264]' : 'text-white'}`}>{p.name}</p>
        {isDoubles && p.partnerName && (
          <p className={`font-black text-2xl leading-tight uppercase px-1 rounded w-fit ${p2IsServer ? 'text-[#1a1a1a] bg-[#bef264]' : 'text-white/80'}`}>{p.partnerName}</p>
        )}
      </div>
    );

const games = (
<div className="z-10">
{renderSetHistory(team)}
</div>
);

return (
<div className={`${flex} ${BG_COLORS[color]} relative flex flex-col p-5 overflow-hidden`}>
{/* Placar de pontos — ancorado ao indicador de sacador */}
{/* time 1: bottom-3 + items-end ancora a base do número em bottom-3 */}
{/* time 2: top-3  + items-start ancora o topo do número em top-3, alinhado com o indicador */}
<div className={`absolute left-0 right-0 flex justify-center z-0 ${team === 1 ? 'bottom-3 items-end' : 'top-3 items-start'}`}>
<span className={`font-black leading-none tabular-nums tracking-tighter select-none ${isServing ? 'text-[#bef264]' : 'text-white'}`}
style={{ fontSize: 'clamp(120px, 28vh, 260px)' }}>
{p.score}
</span>
</div>

{/* Time 1: games no topo + nomes logo abaixo */}
{team === 1 && (
<div className="z-10 flex flex-col gap-1">
{games}
{names}
</div>
)}

{/* Time 2: empurra games + nomes para o fundo */}
{team === 2 && (
<div className="z-10 flex flex-col gap-1 mt-auto">
{names}
{games}
</div>
)}

{/* Indicador de sacador */}
{renderServerIndicator(team)}

        {/* FB Sync Badge — centralizado verticalmente à direita, igual ao placar inline */}
        {fbSyncStatus?.team === team && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 pointer-events-none flex items-center gap-2 bg-white/85 backdrop-blur-sm rounded-full px-4 py-2 shadow-md">
            <span className="text-[18px] font-black text-gray-700 leading-none tabular-nums">FB|{fbSyncStatus.seq}</span>
            <span className={`w-4 h-4 rounded-full animate-pulse flex-shrink-0 ${fbSyncStatus.isObserver ? 'bg-blue-500' : 'bg-green-500'}`} />
          </div>
        )}
</div>
);
};

// ── Faixa central ──────────────────────────────────────────────────────────
const renderCenterBar = (horizontal: boolean) => (
<div className={`bg-black flex items-center justify-center shrink-0 z-10 relative ${horizontal ? 'flex-col py-4 w-16 gap-3' : 'flex-row h-16 gap-4'}`}>

{/* Botão microfone — só para controller ou fora da live */}
{showMic && (
<button
onPointerDown={(e) => {
e.preventDefault();
e.stopPropagation();
onVoiceToggle?.();
}}
className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform border-2 shadow-md ${
           isVoiceActive ? 'bg-blue-600 border-blue-700' : 'bg-white border-blue-300'
         }`}
>
<Mic size={18} strokeWidth={isVoiceActive ? 3.5 : 2} className={isVoiceActive ? 'text-white' : 'text-blue-600'} />
</button>
)}

{/* Ícone de conexão — também é o botão do modal */}
<div
role={isPublicView ? undefined : "button"}
onPointerDown={() => { if (!isPublicView) setIsMenuOpen(true); }}
className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform border-2 shadow-lg ${isPublicView ? 'cursor-default' : 'active:scale-95 cursor-pointer'} ${
         isLiveActive ? 'border-emerald-400 bg-white/5 text-emerald-400' :
         isOfflineMode ? 'border-yellow-400 bg-yellow-500 text-black' :
         'border-white bg-emerald-500 text-white'
       }`}
>
{isLiveActive
? <LiveIndicator role={role || (isCommandOwner ? 'owner' : 'observer')} status={isLiveActive ? (isCommandOwner ? 'controller' : 'watcher') : undefined} variant="header" className="w-full h-full pointer-events-none" />
: isOfflineMode
? <WifiOff size={20} className="relative z-10" />
: <Wifi size={20} className="relative z-10" />
}
</div>

{/* Cronômetro */}
<span className="text-white font-black text-lg tabular-nums tracking-tight">{formatTime(displayTime)}</span>

{/* Botão rotação — alterna layout portrait/landscape manualmente */}
<button
onPointerDown={handleToggleOrientation}
className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform border-2 shadow-md ${
         forceLayoutOverride !== null ? 'bg-amber-400 border-amber-500 text-black' : 'bg-white/10 border-white/20 text-white'
       }`}
title={isLandscape ? 'Mudar para retrato' : 'Mudar para paisagem'}
>
<RotateCcw size={16} strokeWidth={2.5} className={`transition-transform ${isLandscape ? 'rotate-90' : ''}`} />
</button>
</div>
);

// ── Bottom sheet modal ─────────────────────────────────────────────────────
const renderModal = () => (
isMenuOpen ? (
<div
className="fixed inset-0 z-[999999] flex flex-col justify-end"
onPointerDown={() => setIsMenuOpen(false)}
>
<div
className="bg-[#1e293b] rounded-t-3xl border-t border-white/10 p-4 space-y-2"
onPointerDown={e => e.stopPropagation()}
>
<div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

{/* Live / Controle */}
{isLiveActive && (
<div
role={isPublicView ? undefined : "button"}
onPointerDown={() => { if (!isPublicView) { setIsMenuOpen(false); onOpenLiveControl?.(); } }}
className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-colors ${isPublicView ? 'bg-white/5 opacity-40 cursor-not-allowed' : 'bg-white/5 active:bg-white/10 cursor-pointer'} text-white`}
>
<LiveIndicator role={role || (isCommandOwner ? 'owner' : 'observer')} status={isLiveActive ? (isCommandOwner ? 'controller' : 'watcher') : undefined} variant="header" className={`w-8 h-8 shrink-0 ${isPublicView ? 'grayscale opacity-50' : ''}`} />
<span className="font-black text-sm">Live / Controle</span>
</div>
)}

{/* Modo placar */}
{(() => {
  const isWatchMode = !!gameState.matchConfig.isWatchMode;
  const isScoreboardMode = !!gameState.matchConfig.isScoreboardMode;
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

{/* Zerar partida */}
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
) : null
);

// ── Overlay de fim de partida (espectador) ─────────────────────────────────
const [matchOverDismissed, setMatchOverDismissed] = useState(false);

// Reseta o dismiss se a partida for zerada (novo matchId)
useEffect(() => {
  setMatchOverDismissed(false);
}, [gameState.matchId]);

const showMatchOverOverlay =
  gameState.isMatchOver &&
  !matchOverDismissed &&
  (isPublicView || role === 'spectator');

const winnerName = p1WonSets > p2WonSets
  ? gameState.p1.name
  : p2WonSets > p1WonSets
  ? gameState.p2.name
  : null;

const renderMatchOverOverlay = () =>
  showMatchOverOverlay ? (
    <div className="fixed inset-0 z-[999998] bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl border border-white/50 flex flex-col items-center gap-6 animate-in zoom-in duration-300">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-inner">
          <Trophy size={40} />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-black text-black tracking-tight leading-none">Partida encerrada</h3>
          {winnerName && (
            <p className="text-sm font-bold text-slate-500">Vencedor: {winnerName}</p>
          )}
        </div>
        <button
          onClick={() => setMatchOverDismissed(true)}
          className="w-full py-5 bg-slate-800 text-white rounded-3xl font-black text-base shadow-xl active:scale-95 transition-all"
        >
          Fechar
        </button>
      </div>
    </div>
  ) : null;


if (!isLandscape) {
return (
<div className="fixed inset-0 w-full h-full z-[99999] flex flex-col bg-black select-none touch-none overflow-hidden">
{renderTeamBlock(1, 'flex-1')}
{renderCenterBar(false)}
{renderTeamBlock(2, 'flex-1')}
{renderModal()}
{renderMatchOverOverlay()}
</div>
);
}

// ── Layout landscape (esquerda/direita) ────────────────────────────────────
return (
<div className="fixed inset-0 w-full h-full z-[99999] flex flex-row bg-black select-none touch-none overflow-hidden">
{renderTeamBlock(1, 'flex-1')}
{renderCenterBar(true)}
{renderTeamBlock(2, 'flex-1')}
{renderModal()}
{renderMatchOverOverlay()}
</div>
);
};
