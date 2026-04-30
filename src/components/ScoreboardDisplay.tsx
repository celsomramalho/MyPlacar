import React, { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Settings, RefreshCw, Mic } from 'lucide-react';
import { GameState, CourtSide } from '../types.ts';
import { LiveIndicator } from '../components/LiveIndicator.tsx';
import { getTennisServerSide } from '../utils/tennisEngine.ts';

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
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(
    () => window.innerWidth > window.innerHeight
  );

  // ── Detecção de orientação ─────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

    const srvNum: 1 | 2 = pkl
      ? pkl.server.serverNumber
      : (gameState.servingOrderOffset >= 2 ? 2 : 1);
    const label = isDoubles ? `S${srvNum}` : 'S';

    const side: CourtSide = (sport === 'pickleball' && pkl)
      ? pkl.server.side
      : getTennisServerSide(gameState);
    const justifyContent = side === 'even' ? 'flex-end' : 'flex-start';

    const textColorClass = team === 1
      ? TEXT_COLORS[gameState.p1.color || 'azul']
      : TEXT_COLORS[gameState.p2.color || 'vermelho'];

    return (
      <div
        className={`absolute ${team === 1 ? 'bottom-3' : 'top-3'} left-3 right-3 flex z-20 pointer-events-none`}
        style={{ justifyContent }}
      >
        <div
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
          style={{
            boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
            opacity: isServing ? 1 : 0,
            transition: 'opacity 150ms',
          }}
        >
          <span className={`text-sm font-black leading-none ${textColorClass}`}>{label}</span>
        </div>
      </div>
    );
  }, [gameState]);


  // ── Histórico de games por set ─────────────────────────────────────────────
  const renderSetHistory = useCallback((player: 1 | 2) => {
    const p = player === 1 ? gameState.p1 : gameState.p2;
    const currentSet = gameState.currentSet ?? 0;
    // sets[] guarda apenas sets encerrados; o set atual usa p.games
    const pastSets = (p?.sets || []).slice(0, currentSet);

    return (
      <div className="flex gap-3 items-end">
        {/* Sets encerrados — só os games do próprio time */}
        {pastSets.map((games, i) => (
          <span key={i} className="font-black leading-none text-white text-2xl opacity-60">
            {games}
          </span>
        ))}
        {/* Set atual */}
        <span className="font-black leading-none text-[#bef264] text-5xl">
          {p?.games ?? 0}
        </span>
      </div>
    );
  }, [gameState]);


  // ── Guard — aguarda gameState completo (deve vir após todos os hooks) ───────
  if (!gameState?.p1?.sets || !gameState?.p2?.sets) return null;

  const isLiveActive = !!(gameState.isMirroringActive && !gameState.isLiveClosed) || !!cloudLiveExists;
  const showMic = !!onVoiceToggle && gameState.matchConfig.voiceEnabled && (!isLiveActive || isCommandOwner);

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

    const names = (
      <div className="z-10">
        <p className="text-white font-black text-2xl leading-tight uppercase">{p.name}</p>
        {p.partnerName && (
          <p className="text-white/80 font-black text-2xl leading-tight uppercase">{p.partnerName}</p>
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
        {/* time 1: bottom-3 alinha base do placar com base do indicador */}
        {/* time 2: top-14 alinha topo do placar com base inferior do indicador (top-3 + h-10) */}
        <div className={`absolute left-0 right-0 flex justify-center z-0 ${team === 1 ? 'bottom-3' : 'top-14'}`}>
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
      </div>
    );
  };

  // ── Faixa central ──────────────────────────────────────────────────────────
  const renderCenterBar = (horizontal: boolean) => (
    <div className={`bg-black flex items-center justify-center shrink-0 z-10 relative ${horizontal ? 'flex-col py-4 w-16 gap-3' : 'flex-row h-16 gap-4'}`}>

      {/* Botão microfone — só para controller ou fora da live */}
      {showMic && (
        <button
          onPointerDown={onVoiceToggle}
          className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform border-2 shadow-md ${
            isVoiceActive ? 'bg-blue-600 border-blue-700' : 'bg-white border-blue-300'
          }`}
        >
          <Mic size={18} strokeWidth={isVoiceActive ? 3.5 : 2} className={isVoiceActive ? 'text-white' : 'text-blue-600'} />
        </button>
      )}

      {/* Ícone de conexão — também é o botão do modal */}
      <div
        role="button"
        onPointerDown={() => setIsMenuOpen(true)}
        className={`w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer border-2 shadow-lg ${
          isLiveActive ? 'border-emerald-400 bg-white/5 text-emerald-400' :
          isOfflineMode ? 'border-yellow-400 bg-yellow-500 text-black' :
          'border-white bg-emerald-500 text-white'
        }`}
      >
        {isLiveActive
          ? <LiveIndicator role={role || (isCommandOwner ? 'owner' : 'observer')} variant="header" className="w-full h-full pointer-events-none" />
          : isOfflineMode
            ? <WifiOff size={20} className="relative z-10" />
            : <Wifi size={20} className="relative z-10" />
        }
      </div>

      {/* Cronômetro */}
      <span className="text-white font-black text-lg tabular-nums tracking-tight">{formatTime(gameState.matchDuration || 0)}</span>
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
              role="button"
              onPointerDown={() => { setIsMenuOpen(false); onOpenLiveControl?.(); }}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl bg-white/5 active:bg-white/10 text-white transition-colors cursor-pointer"
            >
              <LiveIndicator role={role || (isCommandOwner ? 'owner' : 'observer')} variant="header" className="w-8 h-8 shrink-0" />
              <span className="font-black text-sm">Live / Controle</span>
            </div>
          )}

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

  // ── Layout portrait (cima/baixo) ───────────────────────────────────────────
  if (!isLandscape) {
    return (
      <div className="fixed inset-0 w-full h-full z-[99999] flex flex-col bg-black select-none touch-none overflow-hidden">
        {renderTeamBlock(1, 'flex-1')}
        {renderCenterBar(false)}
        {renderTeamBlock(2, 'flex-1')}
        {renderModal()}
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
    </div>
  );
};
