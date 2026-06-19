import React from 'react';
import { GameState } from '../../../../types';

interface PickleballCourtViewProps {
  gameState: GameState;
}

export const PickleballCourtView: React.FC<PickleballCourtViewProps> = ({ gameState }) => {
  const pkl = gameState.pickleball;
  if (!pkl || gameState.matchConfig.sportType !== 'pickleball' || !gameState.matchConfig.isDoubles) {
    return null;
  }

  const p1 = gameState.p1;
  const p2 = gameState.p2;
  const scoringMode = gameState.matchConfig.pickleballScoringMode;
  const isSideOut = scoringMode !== 'rally';

  // Se for rally, não temos a lógica de posicionamento estrita na quadra baseada na paridade do placar do time que saca
  if (!isSideOut) return null;

  // Lado do saque ativo
  const activeTeam = pkl.server.team;
  const serverName = pkl.server.serverName;

  // Posições dos jogadores lidas diretamente do estado do motor (fonte única de verdade).
  // t1RightPlayer / t2RightPlayer contêm o nome de quem está fisicamente na DIREITA de cada time.
  const t1Right = pkl.server.t1RightPlayer || p1.name;
  const t2Right = pkl.server.t2RightPlayer || p2.name;

  // Time 1: lado esquerdo da quadra (visão de cima)
  // Superior = posição E do jogador (à esquerda de quem olha para a rede)
  // Inferior = posição D do jogador (à direita de quem olha para a rede)
  const t1LeftPlayer  = t1Right === p1.name ? (p1.partnerName || 'Parceiro T1') : p1.name;
  const t1RightPlayer = t1Right;

  // Time 2: lado direito da quadra (visão de cima)
  // Superior direito = posição E do time 2 (à esquerda de quem olha para a rede vindo do lado deles)
  // Inferior direito = posição D do time 2 (à direita de quem olha para a rede)
  const t2LeftPlayer  = t2Right === p2.name ? (p2.partnerName || 'Parceiro T2') : p2.name;
  const t2RightPlayer = t2Right;

  // Verifica se o jogador é o sacador ativo
  const isT1LeftActive = activeTeam === 1 && serverName === t1LeftPlayer;
  const isT1RightActive = activeTeam === 1 && serverName === t1RightPlayer;
  const isT2LeftActive = activeTeam === 2 && serverName === t2LeftPlayer;
  const isT2RightActive = activeTeam === 2 && serverName === t2RightPlayer;

  return (
    <div className="w-full flex flex-col items-center my-3 bg-slate-900 rounded-[2rem] p-5 border border-slate-800 shadow-xl">
      <div className="text-xs font-bold text-white/50 mb-3 tracking-wider">Quadra de pickleball (posicionamento)</div>
      
      {/* Container da quadra */}
      <div className="relative w-full max-w-[340px] aspect-[1.8/1] bg-[#1b4332] border-[3px] border-white rounded-lg flex overflow-hidden shadow-2xl">
        
        {/* Linha Central Vertical */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white opacity-40" />

        {/* Rede (Net) no meio */}
        <div className="absolute top-0 bottom-0 left-1/2 -ml-[4px] w-[8px] bg-slate-400 z-10 flex flex-col justify-between items-center opacity-85">
          <div className="w-[12px] h-[6px] bg-slate-200 rounded-sm -mt-0.5" />
          <div className="w-full h-full border-l border-r border-dashed border-white/40" />
          <div className="w-[12px] h-[6px] bg-slate-200 rounded-sm -mb-0.5" />
        </div>

        {/* Cozinha / NVZ (Non-Volley Zone) - 2.1m de cada lado da rede */}
        <div className="absolute top-0 bottom-0 left-[38%] right-[38%] bg-[#2d6a4f] opacity-80 border-l border-r border-white" />

        {/* Linha Central Horizontal da Quadra Esquerda */}
        <div className="absolute left-0 right-[62%] top-1/2 h-[2px] bg-white opacity-50" />

        {/* Linha Central Horizontal da Quadra Direita */}
        <div className="absolute left-[62%] right-0 top-1/2 h-[2px] bg-white opacity-50" />

        {/* --- Jogadores Time 1 (Lado Esquerdo da Tela - Top) --- */}
        {/* Superior Esquerdo (E) */}
        <div className="absolute left-[6%] top-[12%] flex flex-col items-center z-20">
          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black text-white transition-all ${isT1LeftActive ? 'bg-yellow-500 border-yellow-300 scale-110 shadow-lg shadow-yellow-500/50 animate-pulse' : 'bg-blue-600 border-white/60'}`}>
            {t1LeftPlayer.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-[8px] font-bold text-white/75 mt-1 max-w-[60px] truncate">{t1LeftPlayer}</span>
        </div>

        {/* Inferior Esquerdo (D) */}
        <div className="absolute left-[6%] bottom-[12%] flex flex-col items-center z-20">
          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black text-white transition-all ${isT1RightActive ? 'bg-yellow-500 border-yellow-300 scale-110 shadow-lg shadow-yellow-500/50 animate-pulse' : 'bg-blue-600 border-white/60'}`}>
            {t1RightPlayer.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-[8px] font-bold text-white/75 mt-1 max-w-[60px] truncate">{t1RightPlayer}</span>
        </div>

        {/* --- Jogadores Time 2 (Lado Direito da Tela) --- */}
        {/* Superior Direito (D) */}
        <div className="absolute right-[6%] top-[12%] flex flex-col items-center z-20">
          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black text-white transition-all ${isT2RightActive ? 'bg-yellow-500 border-yellow-300 scale-110 shadow-lg shadow-yellow-500/50 animate-pulse' : 'bg-red-600 border-white/60'}`}>
            {t2RightPlayer.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-[8px] font-bold text-white/75 mt-1 max-w-[60px] truncate">{t2RightPlayer}</span>
        </div>

        {/* Inferior Direito (E) */}
        <div className="absolute right-[6%] bottom-[12%] flex flex-col items-center z-20">
          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black text-white transition-all ${isT2LeftActive ? 'bg-yellow-500 border-yellow-300 scale-110 shadow-lg shadow-yellow-500/50 animate-pulse' : 'bg-red-600 border-white/60'}`}>
            {t2LeftPlayer.substring(0, 2).toUpperCase()}
          </div>
          <span className="text-[8px] font-bold text-white/75 mt-1 max-w-[60px] truncate">{t2LeftPlayer}</span>
        </div>

        {/* Seta de Saque indicativa */}
        {activeTeam === 1 && isT1RightActive && (
          <div className="absolute left-[15%] bottom-[25%] right-[55%] top-[25%] border-b border-r border-dashed border-yellow-400 pointer-events-none opacity-80 animate-pulse flex items-end justify-end">
            <span className="text-yellow-300 text-[10px] pr-1 pb-1">➔</span>
          </div>
        )}
        {activeTeam === 1 && isT1LeftActive && (
          <div className="absolute left-[15%] top-[25%] right-[55%] bottom-[25%] border-t border-r border-dashed border-yellow-400 pointer-events-none opacity-80 animate-pulse flex items-start justify-end">
            <span className="text-yellow-300 text-[10px] pr-1 pt-1">➔</span>
          </div>
        )}
        {activeTeam === 2 && isT2RightActive && (
          <div className="absolute right-[15%] bottom-[25%] left-[55%] top-[25%] border-b border-l border-dashed border-yellow-400 pointer-events-none opacity-80 animate-pulse flex items-end justify-start">
            <span className="text-yellow-300 text-[10px] pl-1 pb-1">⮨</span>
          </div>
        )}
        {activeTeam === 2 && isT2LeftActive && (
          <div className="absolute right-[15%] top-[25%] left-[55%] bottom-[25%] border-t border-l border-dashed border-yellow-400 pointer-events-none opacity-80 animate-pulse flex items-start justify-start">
            <span className="text-yellow-300 text-[10px] pl-1 pt-1">⮨</span>
          </div>
        )}

      </div>
    </div>
  );
};
