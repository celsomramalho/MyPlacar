
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, Loader2, ChevronRight, CheckCircle2, Wifi, AlertTriangle, Watch, RotateCcw, X, Smartphone, Settings, Play } from 'lucide-react';
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

const formatTime = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const SpectatorScreen: React.FC<Props> = ({ matchId, spectatorPin, onExit }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [localDuration, setLocalDuration] = useState(0);
  const [historyItem, setHistoryItem] = useState<MatchHistoryItem | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'finished' | 'not_found'>('loading');
  const [dbSportsIcons, setDbSportsIcons] = useState<Record<string, string>>({});
  const [isWatchView, setIsWatchView] = useState(() => {
    return new URLSearchParams(window.location.search).get('viewMode') === 'watch';
  });
  
  const lastKnownState = useRef<GameState | null>(null);

  useEffect(() => {
    const fetchIcons = async () => {
      const db = getDb();
      if (!db) return;
      const snap = await getDocs(collection(db, "sport_icons"));
      const icons: Record<string, string> = {};
      snap.forEach(d => { icons[d.id] = d.data().url; });
      setDbSportsIcons(icons);
    };
    fetchIcons();
  }, []);

  useEffect(() => {
    const db = getDb();
    if (!db) return;

    // MC6: PRIORIDADE PARA O PIN SE DISPONÍVEL
    const liveId = spectatorPin?.toUpperCase() || matchId;
    const liveRef = doc(db, "live_matches", liveId);
    
    const unsubscribe = onSnapshot(liveRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data() as GameState;
        // Even if isLiveClosed is true, if it's confirmed finished, we display as finished
        if (data.isLiveClosed && data.isConfirmedFinished) {
           lastKnownState.current = data; // Store the final state
           setStatus('finished');
           return;
        } else if (data.isLiveClosed && !data.isConfirmedFinished) {
          // If closed but not confirmed finished (e.g., host just closed without confirming), it's truly not found for spectator
          setStatus('not_found');
          return;
        }

        setGameState(data);
        setLocalDuration(data.matchDuration);
        lastKnownState.current = data; // Keep lastKnownState updated with live data
        setStatus(data.isConfirmedFinished ? 'finished' : 'live');
      } else {
        // If live document is gone:
        if (lastKnownState.current && lastKnownState.current.isConfirmedFinished) {
          // Use the last known confirmed finished state if the live document disappeared
          setGameState(lastKnownState.current); // Re-set gameState to the last known complete state
          setHistoryItem(null); // Ensure historyItem is cleared if we're using live's final state
          setStatus('finished');
          return;
        }
        
        // If not a confirmed finished live match, try history or set not_found
        if (matchId && !spectatorPin) {
           const histRef = doc(db, "matches", matchId);
           const histSnap = await getDoc(histRef);
           if (histSnap.exists()) {
              setHistoryItem(histSnap.data() as MatchHistoryItem);
              setGameState(null); // Ensure gameState is cleared if we're using history
              setStatus('finished');
           } else {
              setStatus('not_found');
           }
        } else {
           setStatus('not_found');
        }
      }
    });

    return () => unsubscribe();
  }, [matchId, spectatorPin, status]);

  useEffect(() => {
    let timer: any;
    if (status === 'live' && gameState && !gameState.isPaused && !gameState.isMatchOver) {
      timer = setInterval(() => { setLocalDuration(prev => prev + 1); }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, gameState?.isPaused, gameState?.isMatchOver]);

  const sportDef = useMemo(() => {
    if (gameState) return SPORT_LIST.find(s => s.id === gameState.matchConfig.sportType);
    if (historyItem) return SPORT_LIST.find(s => s.id === historyItem.sportType);
    return null;
  }, [gameState, historyItem]);

  const admIcon = useMemo(() => {
    const sportId = gameState?.matchConfig.sportType || historyItem?.sportType;
    if (!sportId) return null;
    return dbSportsIcons[sportId] || gameState?.matchConfig.cloudSportIcons?.[sportId];
  }, [gameState, historyItem, dbSportsIcons]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
        <Loader2 size={48} className="text-blue-500 animate-spin mb-4" />
        <h2 className="text-xl font-black text-gray-900">Sincronizando partida...</h2>
        <p className="text-gray-400 font-bold mt-2">Aguardando conexão ao vivo</p>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center animate-in zoom-in">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={40} />
        </div>
        <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Partida não encontrada</h2>
        <p className="text-gray-500 font-bold mt-2 mb-8">O link expirou ou o host finalizou a transmissão.</p>
        <button onClick={onExit} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-lg">Voltar ao my placar</button>
      </div>
    );
  }

  if (status === 'finished') {
    // Prioritize historyItem if available, otherwise use gameState (which would be lastKnownState.current)
    const p1Name = historyItem ? historyItem.p1Name : (gameState?.p1.name || 'Time 1');
    const p1Partner = historyItem ? historyItem.p1Partner : gameState?.p1.partnerName;
    const p2Name = historyItem ? historyItem.p2Name : (gameState?.p2.name || 'Time 2');
    const p2Partner = historyItem ? historyItem.p2Partner : gameState?.p2.partnerName;
    const p1Full = `${p1Name}${p1Partner ? ' & ' + p1Partner : ''}`;
    const p2Full = `${p2Name}${p2Partner ? ' & ' + p2Partner : ''}`;
    const setsP1 = historyItem ? historyItem.p1Sets : (gameState?.p1.sets || []);
    const setsP2 = historyItem ? historyItem.p2Sets : (gameState?.p2.sets || []);
    const w1 = setsP1.filter((s, i) => s > setsP2[i]).length;
    const w2 = setsP2.filter((s, i) => s > setsP1[i]).length;
    const winnerTeam = w1 > w2 ? 1 : (w2 > w1 ? 2 : 0);
    const scoreSummary = historyItem ? historyItem.scoreSummary : `${setsP1.join('/')} - ${setsP2.join('/')}`;
    const durationTotal = historyItem ? historyItem.duration : (gameState?.matchDuration || 0);

    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col p-6 animate-in slide-in-from-bottom duration-700">
        <div className="bg-[#0f172a] rounded-[3rem] p-8 md:p-10 shadow-2xl border border-slate-800 flex flex-col items-center space-y-10 max-w-sm mx-auto w-full">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg animate-bounce"><CheckCircle2 size={36} /></div>
          <div className="text-center w-full">
            <p className="text-xs font-black text-blue-400 mb-10">Partida encerrada com sucesso</p>
            <div className="flex flex-col items-center gap-6 mb-10">
               <div className="flex items-center justify-center gap-4 w-full">
                 <div className="flex flex-col items-center flex-1 min-w-0"><p className={`text-lg font-black tracking-tight text-center truncate w-full text-white`}>{p1Full}</p></div>
                 {winnerTeam === 1 && <Trophy size={28} className="text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)] shrink-0" />}
               </div>
               <div className="w-16 h-px bg-slate-800"></div>
               <div className="flex items-center justify-center gap-4 w-full">
                 <div className="flex flex-col items-center flex-1 min-w-0"><p className={`text-lg font-black tracking-tight text-center truncate w-full text-white`}>{p2Full}</p></div>
                 {winnerTeam === 2 && <Trophy size={28} className="text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.6)] shrink-0" />}
               </div>
            </div>
            <div className="w-full pt-10 border-t border-slate-800/50 flex flex-col items-center">
              <p className="text-xs font-bold text-slate-500 mb-3">Placar final</p>
              <p className="text-5xl font-black text-white mb-3 tracking-tighter tabular-nums">{scoreSummary}</p>
              <p className="text-[12px] font-black text-slate-600">Duração: {formatTime(durationTotal)}</p>
            </div>
          </div>
          <button onClick={onExit} className="w-full bg-white text-[#0f172a] py-5 rounded-[2rem] font-black text-lg shadow-xl mt-4 active:scale-95 transition-all">Sair da visualização</button>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const p1WonSets = gameState.p1.sets.filter((s, i) => s > gameState.p2.sets[i]).length;
  const p2WonSets = gameState.p2.sets.filter((s, i) => s > gameState.p1.sets[i]).length;

  const getServingLetter = () => {
    const offset = gameState.servingOrderOffset;
    let name = "";
    if (offset === 0) name = gameState.p1.name;
    else if (offset === 1) name = gameState.p2.name;
    else if (offset === 2) name = gameState.p1.partnerName || gameState.p1.name;
    else if (offset === 3) name = gameState.p2.partnerName || gameState.p2.name;
    return name.trim().charAt(0).toUpperCase();
  };

  if (isWatchView) {
    return (
      <div className="fixed inset-0 h-full w-full bg-black flex select-none touch-none z-[99999]">
        {/* Barra lateral esquerda para sets e games */}
        <div className="w-[20%] h-full flex flex-col bg-black border-r border-white/10 shrink-0 relative">
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
             <div className={`w-14 h-16 rounded-xl flex items-center justify-center shadow-lg border-2 border-white/10 ${SOLID_COLORS[gameState.p1.color || 'azul']}`}>
               <span className="text-5xl font-black text-white leading-none tabular-nums">{gameState.p1.games}</span>
             </div>
             <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-lg border-2 border-white/10">
                <span className="text-4xl font-black text-black leading-none tabular-nums">{p1WonSets}</span>
             </div>
          </div>

          <div className="h-28 flex flex-col items-center justify-center border-y border-white/10 bg-slate-900/50">
             <span className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Set</span>
             <div className="bg-white px-3 py-0.5 rounded-lg border border-white shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                <span className="text-4xl font-black text-black leading-none tabular-nums">{gameState.currentSet + 1}</span>
             </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-2">
             <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-lg border-2 border-white/10">
                <span className="text-4xl font-black text-black leading-none tabular-nums">{p2WonSets}</span>
             </div>
             <div className={`w-14 h-16 rounded-xl flex items-center justify-center shadow-lg border-2 border-white/10 ${SOLID_COLORS[gameState.p2.color || 'vermelho']}`}>
               <span className="text-5xl font-black text-white leading-none tabular-nums">{gameState.p2.games}</span>
             </div>
          </div>
        </div>

        {/* Área principal */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className={`flex-1 w-full flex items-center justify-center relative overflow-hidden ${WATCH_COLORS[gameState.p1.color || 'azul']}`}>
            {gameState.server === 1 && (
              <div className="absolute top-8 left-8 text-white font-black text-4xl uppercase animate-in fade-in zoom-in duration-500">
                {getServingLetter()}
              </div>
            )}
            <span className={`text-[120px] font-black leading-none tabular-nums tracking-tighter ${gameState.server === 1 ? 'text-[#bef264]' : 'text-white'}`}>{gameState.p1.score}</span>
          </div>
          
          {/* Barra de ferramentas central - Simplificada para espectador */}
          <div className="h-20 bg-black border-y border-white/10 flex items-center justify-around px-4 shrink-0 z-10">
            <button onClick={() => setIsWatchView(false)} className="p-2 text-white active:scale-90"><Smartphone size={32} /></button>
            <div className="w-8 h-8 rounded-full bg-red-600 animate-pulse border-4 border-white/10 shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
            <button onClick={onExit} className="p-2 text-red-400 active:scale-90 transition-transform"><X size={44} strokeWidth={4} /></button>
          </div>

          <div className={`flex-1 w-full flex items-center justify-center transition-all relative overflow-hidden ${WATCH_COLORS[gameState.p2.color || 'vermelho']}`}>
            {gameState.server === 2 && (
              <div className="absolute top-8 left-8 text-white font-black text-4xl uppercase animate-in fade-in zoom-in duration-500">
                {getServingLetter()}
              </div>
            )}
            <span className={`text-[120px] font-black leading-none tabular-nums tracking-tighter ${gameState.server === 2 ? 'text-[#bef264]' : 'text-white'}`}>{gameState.p2.score}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col animate-in fade-in overflow-hidden">
      <header className="px-6 py-5 bg-white border-b border-gray-200 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" /><span className="text-xs font-black text-red-500">Ao vivo</span></div>
        <div className="flex items-center gap-3"><div className="w-6 h-6 overflow-hidden rounded-full flex items-center justify-center">{admIcon ? (admIcon.startsWith('http') || admIcon.startsWith('data') ? <img src={admIcon} className="w-full h-full object-cover" /> : <span className="text-xl">{admIcon}</span>) : (<span className="text-xl">{sportDef?.defaultIcon || '🎾'}</span>)}</div><h1 className="text-lg font-black text-gray-900 tracking-tighter">{sportDef?.name}</h1></div>
        <div className="flex items-center gap-1"><button onClick={() => setIsWatchView(true)} className="p-2 text-indigo-600 active:scale-90 transition-transform"><Watch size={24} /></button><button onClick={onExit} className="p-2 text-gray-400 active:scale-90 transition-transform"><X size={24} /></button></div>
      </header>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full pb-20 overflow-y-auto no-scrollbar">
        <div className="bg-white rounded-[2.5rem] md:rounded-[3.5rem] p-4 md:p-8 shadow-sm border border-gray-100 flex flex-col items-center gap-6 md:gap-8 mb-4">
           <div className="flex items-center justify-between w-full"><div className="flex items-center gap-2 text-lg md:text-xl font-black text-gray-900">Set {gameState.currentSet + 1}</div><div className="text-xl md:text-2xl font-black text-gray-900 tracking-tighter tabular-nums bg-gray-100 px-4 py-1.5 rounded-2xl">{formatTime(localDuration)}</div></div>
           <div className="flex items-stretch justify-between w-full gap-2 md:gap-4">
              <div className="flex flex-col items-center flex-1 min-w-0">
                 <div className="text-center min-h-[5rem] flex flex-col justify-center px-1 mb-4 w-full"><div className="flex items-center justify-center gap-1 md:gap-2"><span className="text-base md:text-xl font-black text-gray-900 truncate uppercase">{gameState.p1.name}</span>{gameState.servingOrderOffset === 0 && <span className="text-xl md:text-3xl animate-bounce">🎾</span>}</div>{gameState.p1.partnerName && (<div className="flex items-center justify-center gap-1 md:gap-2 mt-1"><span className="text-base md:text-xl font-black text-gray-900 truncate uppercase">{gameState.p1.partnerName}</span>{gameState.servingOrderOffset === 2 && <span className="text-lg md:text-2xl animate-bounce">🎾</span>}</div>)}</div>
                 <div className={`${SOLID_COLORS[gameState.p1.color || 'azul']} ${gameState.server === 1 ? '!text-[#bef264]' : ''} rounded-[3rem] shadow-xl border-4 border-white/20 flex items-center justify-center shrink-0`} style={{ width: '135px', height: '170px', minWidth: '135px', minHeight: '170px' }} ><span className="text-[70px] md:text-[110px] font-black leading-none tabular-nums">{gameState.p1.score}</span></div>
                 <div className="text-4xl md:text-5xl font-black mt-4 text-slate-800 tabular-nums">{gameState.p1.games}</div>
              </div>
              <div className="flex flex-col items-center w-8 md:w-10 pt-20 md:pt-24 gap-1 md:gap-2 shrink-0">{gameState.p1.sets.map((s1, i) => (<div key={i} className="flex flex-col items-center gap-1 py-1 md:py-2 border-b border-gray-50 last:border-0"><span className={`text-base md:text-xl font-black tabular-nums ${TEXT_COLORS[gameState.p1.color || 'azul']}`}>{s1}</span><span className={`text-base md:text-xl font-black tabular-nums ${TEXT_COLORS[gameState.p2.color || 'vermelho']}`}>{gameState.p2.sets[i]}</span></div>))}</div>
              <div className="flex flex-col items-center flex-1 min-w-0">
                 <div className="text-center min-h-[5rem] flex flex-col justify-center px-1 mb-4 w-full"><div className="flex items-center justify-center gap-1 md:gap-2"><span className="text-base md:text-xl font-black text-gray-900 truncate uppercase">{gameState.p2.name}</span>{gameState.servingOrderOffset === 1 && <span className="text-xl md:text-3xl animate-bounce">🎾</span>}</div>{gameState.p2.partnerName && (<div className="flex items-center justify-center gap-1 md:gap-2 mt-1"><span className="text-base md:text-xl font-black text-gray-900 truncate uppercase">{gameState.p2.partnerName}</span>{gameState.servingOrderOffset === 3 && <span className="text-lg md:text-2xl animate-bounce">🎾</span>}</div>)}</div>
                 <div className={`${SOLID_COLORS[gameState.p2.color || 'vermelho']} ${gameState.server === 2 ? '!text-[#bef264]' : ''} rounded-[3rem] shadow-xl border-4 border-white/20 flex items-center justify-center shrink-0`} style={{ width: '135px', height: '170px', minWidth: '135px', minHeight: '170px' }} ><span className="text-[70px] md:text-[110px] font-black leading-none tabular-nums">{gameState.p2.score}</span></div>
                 <div className="text-4xl md:text-5xl font-black mt-4 text-slate-800 tabular-nums">{gameState.p2.games}</div>
              </div>
           </div>
        </div>
        <div className="bg-blue-600 rounded-[2.5rem] p-5 md:p-6 text-white shadow-xl flex items-center justify-between"><div className="flex items-center gap-3 md:gap-4"><div className="p-2 md:p-3 bg-white/20 rounded-2xl backdrop-blur-md"><Wifi size={20} className="md:w-6 md:h-6" /></div><div><p className="text-[9px] md:text-[10px] font-black opacity-80">Conexão</p><p className="text-sm md:text-base font-black">Placar sincronizado</p></div></div>{gameState.isPaused && ( <div className="px-3 py-1 bg-amber-500 rounded-full text-[9px] md:text-[10px] font-black uppercase animate-pulse">Pausado</div> )}</div>
      </main>
    </div>
  );
};