import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, Loader2, ChevronRight, CheckCircle2, Wifi, AlertTriangle, Watch, RotateCcw, X, Smartphone, Settings, Play, ArrowLeft } from 'lucide-react';
import { getDb } from '../firebase';
import { doc, onSnapshot, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { GameState, MatchHistoryItem } from '../types';
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

export const SpectatorScreen: React.FC<Props> = ({ matchId, spectatorPin, onExit }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getDb();
    if (!db) return;

    let targetPin = spectatorPin?.toUpperCase();
    
    const setupListener = (pin: string) => {
      return onSnapshot(doc(db, "live_matches", pin), (snap) => {
        if (snap.exists()) {
          setGameState(snap.data() as GameState);
          setIsLoading(false);
        } else {
          setError("Partida não encontrada ou encerrada.");
          setIsLoading(false);
        }
      }, (err) => {
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

      <main className="flex-1 flex flex-col p-6 gap-8 max-w-md mx-auto w-full">
        <div className="bg-white/5 rounded-[3rem] p-8 border border-white/10 shadow-2xl space-y-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center space-y-3">
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg ${SOLID_COLORS[gameState.p1.color || 'azul']}`}>
                <span className="text-3xl font-black">{gameState.p1.sets.filter((s, i) => s > gameState.p2.sets[i]).length}</span>
              </div>
              <p className="text-sm font-black leading-tight">{gameState.p1.name}</p>
              {gameState.p1.partnerName && <p className="text-[10px] font-bold text-white/40">{gameState.p1.partnerName}</p>}
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="bg-white/10 px-3 py-1 rounded-full">
                <span className="text-[10px] font-black text-white/60">SET {gameState.currentSet + 1}</span>
              </div>
              <div className="text-4xl font-black text-blue-500">:</div>
            </div>

            <div className="flex-1 text-center space-y-3">
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-lg ${SOLID_COLORS[gameState.p2.color || 'vermelho']}`}>
                <span className="text-3xl font-black">{gameState.p2.sets.filter((s, i) => s > gameState.p1.sets[i]).length}</span>
              </div>
              <p className="text-sm font-black leading-tight">{gameState.p2.name}</p>
              {gameState.p2.partnerName && <p className="text-[10px] font-bold text-white/40">{gameState.p2.partnerName}</p>}
            </div>
          </div>

          <div className="flex items-center justify-center gap-8 py-6 border-y border-white/5">
            <div className="text-center">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">Game</p>
              <span className={`text-7xl font-black tabular-nums ${gameState.server === 1 ? 'text-blue-400' : 'text-white'}`}>{gameState.p1.score}</span>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-2">Game</p>
              <span className={`text-7xl font-black tabular-nums ${gameState.server === 2 ? 'text-blue-400' : 'text-white'}`}>{gameState.p2.score}</span>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <div className="bg-white/5 px-6 py-3 rounded-2xl border border-white/5 text-center">
              <p className="text-[9px] font-black text-white/20 uppercase mb-1">Games no set</p>
              <p className="text-xl font-black">{gameState.p1.games} - {gameState.p2.games}</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-600 rounded-[2rem] p-6 flex items-center gap-4 shadow-xl shadow-blue-900/20">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Wifi className="text-white animate-pulse" />
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