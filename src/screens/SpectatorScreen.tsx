import React, { useState, useEffect } from 'react';
import { Loader2, Wifi, AlertTriangle, ArrowLeft } from 'lucide-react';
import { getDb } from '@infra/firebase';
import { doc, onSnapshot, collection, getDocs, query, where } from 'firebase/firestore';
import { GameState } from '../types';
import { SPORT_LIST } from '../constants';

interface Props {
  matchId: string;
  spectatorPin?: string;
  onExit: () => void;
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

const ServerIndicator: React.FC<{
  serverNumber: number;
  side: 'even' | 'odd';
  teamColor: string;
  position: 'top' | 'bottom';
}> = ({ serverNumber, side, teamColor, position }) => {
  const bgColor = SOLID_COLORS[teamColor] || 'bg-blue-600 text-white';
  const posClass = position === 'top' ? 'top-2' : 'bottom-2';
  const alignClass = side === 'even' ? 'right-2' : 'left-2';

  return (
    <div className={`absolute ${posClass} ${alignClass} z-20 flex items-center justify-center`}>
      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg p-0.5">
        <div className={`w-full h-full rounded-full flex items-center justify-center ${bgColor} font-black text-[10px] shadow-inner`}>
          S{serverNumber}
        </div>
      </div>
    </div>
  );
};

export const SpectatorScreen: React.FC<Props> = ({ matchId, spectatorPin, onExit }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getDb();
    if (!db) return;

    const targetPin = spectatorPin?.toUpperCase();
    
    const setupListener = (pin: string) => {
      return onSnapshot(doc(db, "live_matches", pin), (snap) => {
        if (snap.exists()) {
          setGameState(snap.data() as GameState);
          setIsLoading(false);
        } else {
          setError("Partida não encontrada ou encerrada.");
          setIsLoading(false);
        }
      }, () => {
        setError("Erro ao conectar com a partida.");
        setIsLoading(false);
      });
    };

    let unsubscribe: () => void;

    if (targetPin) {
      unsubscribe = setupListener(targetPin);
    } else if (matchId) {
      // Se tiver matchId mas não PIN, tentamos localizar qual PIN é dono desse matchId
      const q = query(collection(db, "live_matches"), where("matchId", "==", matchId));
      getDocs(q).then(snap => {
        if (!snap.empty) {
          unsubscribe = setupListener(snap.docs[0].id);
        } else {
          setError("Partida não localizada.");
          setIsLoading(false);
        }
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [matchId, spectatorPin]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="text-slate-400 font-bold">Conectando à transmissão...</p>
      </div>
    );
  }

  if (error || !gameState) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={40} />
        </div>
        <h2 className="text-xl font-black text-white mb-2">{error || "Erro desconhecido"}</h2>
        <button onClick={onExit} className="mt-6 px-8 py-3 bg-white/10 text-white rounded-2xl font-black text-sm">Voltar</button>
      </div>
    );
  }

  const sportDef = SPORT_LIST.find(s => s.id === gameState.matchConfig.sportType);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-white">
      <header className="p-6 flex items-center justify-between border-b border-white/5">
        <button onClick={onExit} className="p-2 -ml-2 text-white/40 hover:text-white active:scale-90 transition-all">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Assistindo ao vivo</span>
          <h1 className="text-sm font-black tracking-tight">{sportDef?.name || 'Partida'}</h1>
        </div>
        <div className="w-10" />
      </header>

      <main className="flex-1 flex flex-col p-6 gap-6 max-w-md mx-auto w-full">

        {/* Placar principal — layout em coluna por jogador */}
        <div className="bg-white/5 rounded-[3rem] p-6 border border-white/10 shadow-2xl">

          {/* Cabeçalho: set atual e indicador de saque */}
          <div className="flex justify-center mb-6">
            <div className="bg-white/10 px-4 py-1.5 rounded-full flex items-center gap-2">
              <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Set {gameState.currentSet + 1}</span>
              {gameState.server && (
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  · Saque: {gameState.server === 1 ? gameState.p1.name.split(' ')[0] : gameState.p2.name.split(' ')[0]}
                </span>
              )}
            </div>
          </div>

          {/* Duas colunas — uma por jogador */}
          <div className="grid grid-cols-2 gap-4">
            {/* Jogador 1 */}
            <div className="flex flex-col items-center gap-3">
              {/* Nome */}
              <p className="text-sm font-black leading-tight text-center">{gameState.p1.name}</p>
              {gameState.p1.partnerName && (
                <p className="text-[10px] font-bold text-white/40 text-center -mt-2">{gameState.p1.partnerName}</p>
              )}
              {/* Sets ganhos */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${SOLID_COLORS[gameState.p1.color || 'azul']}`}>
                <span className="text-2xl font-black">{gameState.p1.sets.filter((s, i) => s > gameState.p2.sets[i]).length}</span>
              </div>
              {/* Games no set atual */}
              <div className="bg-white/10 w-full rounded-2xl py-3 flex flex-col items-center">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Games</p>
                <span className="text-3xl font-black tabular-nums">{gameState.p1.games}</span>
              </div>
              {/* Score do game atual */}
              <div className="w-full rounded-2xl py-4 flex flex-col items-center border border-white/10 relative">
                {gameState.matchConfig.sportType === 'pickleball' && gameState.pickleball?.server.team === 1 && (
                  <ServerIndicator 
                    serverNumber={gameState.pickleball.server.serverNumber}
                    side={gameState.pickleball.server.side}
                    teamColor={gameState.p1.color || 'azul'}
                    position="bottom"
                  />
                )}
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Ponto</p>
                <span className={`text-5xl font-black tabular-nums ${gameState.server === 1 ? 'text-blue-400' : 'text-white'}`}>
                  {gameState.p1.score}
                </span>
              </div>
            </div>

            {/* Jogador 2 */}
            <div className="flex flex-col items-center gap-3">
              {/* Nome */}
              <p className="text-sm font-black leading-tight text-center">{gameState.p2.name}</p>
              {gameState.p2.partnerName && (
                <p className="text-[10px] font-bold text-white/40 text-center -mt-2">{gameState.p2.partnerName}</p>
              )}
              {/* Sets ganhos */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${SOLID_COLORS[gameState.p2.color || 'vermelho']}`}>
                <span className="text-2xl font-black">{gameState.p2.sets.filter((s, i) => s > gameState.p1.sets[i]).length}</span>
              </div>
              {/* Games no set atual */}
              <div className="bg-white/10 w-full rounded-2xl py-3 flex flex-col items-center">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Games</p>
                <span className="text-3xl font-black tabular-nums">{gameState.p2.games}</span>
              </div>
              {/* Score do game atual */}
              <div className="w-full rounded-2xl py-4 flex flex-col items-center border border-white/10 relative">
                {gameState.matchConfig.sportType === 'pickleball' && gameState.pickleball?.server.team === 2 && (
                  <ServerIndicator 
                    serverNumber={gameState.pickleball.server.serverNumber}
                    side={gameState.pickleball.server.side}
                    teamColor={gameState.p2.color || 'vermelho'}
                    position="top"
                  />
                )}
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Ponto</p>
                <span className={`text-5xl font-black tabular-nums ${gameState.server === 2 ? 'text-blue-400' : 'text-white'}`}>
                  {gameState.p2.score}
                </span>
              </div>
            </div>
          </div>

          {/* Histórico de sets disputados (Sugestão C) */}
          {gameState.p1.sets.length > 0 && (
            <div className="mt-6 pt-5 border-t border-white/5">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest text-center mb-3">Histórico de sets</p>
              <div className="flex justify-center gap-2 flex-wrap">
                {gameState.p1.sets.map((s1, i) => {
                  const s2 = gameState.p2.sets[i] ?? 0;
                  const p1Won = s1 > s2;
                  const p2Won = s2 > s1;
                  return (
                    <div key={i} className="flex items-center gap-1 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
                      <span className={`text-sm font-black tabular-nums ${p1Won ? SOLID_COLORS[gameState.p1.color || 'azul'].split(' ')[1] : 'text-white/40'}`}>{s1}</span>
                      <span className="text-white/20 font-black">-</span>
                      <span className={`text-sm font-black tabular-nums ${p2Won ? SOLID_COLORS[gameState.p2.color || 'vermelho'].split(' ')[1] : 'text-white/40'}`}>{s2}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Status da conexão */}
        <div className="bg-blue-600 rounded-[2rem] p-5 flex items-center gap-4 shadow-xl shadow-blue-900/20">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Wifi className="text-white animate-pulse" size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Status da conexão</p>
            <p className="text-sm font-black">Sincronizado em tempo real</p>
          </div>
        </div>
      </main>
    </div>
  );
};
