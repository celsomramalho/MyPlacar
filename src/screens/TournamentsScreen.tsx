
import React, { useState } from 'react';
import { ArrowLeft, Search, Trophy, Calendar, Ticket, Loader2, X, ChevronRight } from 'lucide-react';
import { Button } from '../components/Button.tsx';
import { ScoreboardIcon } from '../components/ScoreboardIcon.tsx';

interface Props {
  registrations: any[];
  onBack: () => void;
  onJoin: (pin: string) => void;
  onSelectEvent: (event: any) => void;
}

export const TournamentsScreen: React.FC<Props> = ({ registrations, onBack, onJoin, onSelectEvent }) => {
  const [pinInput, setPinInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleJoin = async () => {
    if (!pinInput.trim()) return;
    setIsSearching(true);
    await onJoin(pinInput);
    setIsSearching(false);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden animate-in fade-in duration-300 font-sans">
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button onClick={onBack} className="p-2 -ml-2 text-black active:scale-90 flex items-center justify-center">
          <ScoreboardIcon className="w-8 h-8" />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Trophy size={22} className="text-amber-500 stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight">Meus torneios</h1>
        </div>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-8 no-scrollbar pb-32">
        {/* BUSCAR EVENTO */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1 text-amber-500 font-black">
            <Search size={18} />
            <h3 className="text-sm font-black text-black tracking-tight">Localizar torneios</h3>
          </div>
          <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-100 flex gap-2">
            <input 
              type="text" 
              placeholder="Digite o PIN do evento" 
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="flex-1 h-14 bg-gray-50 border border-gray-100 rounded-2xl px-4 font-black text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <button 
              onClick={handleJoin}
              disabled={isSearching || !pinInput}
              className="bg-amber-500 text-white px-6 rounded-2xl font-black text-xs uppercase active:scale-95 shadow-md flex items-center justify-center"
            >
              {isSearching ? <Loader2 size={20} className="animate-spin" /> : 'Entrar'}
            </button>
          </div>
        </div>

        {/* MINHAS INSCRIÇÕES */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1 text-blue-500 font-black">
            <Ticket size={18} />
            <h3 className="text-sm font-black text-black tracking-tight">Minhas inscrições</h3>
          </div>

          {registrations.length === 0 ? (
            <div className="py-12 bg-white rounded-[2.5rem] border border-dashed text-center space-y-2">
              <p className="text-slate-400 font-bold text-sm">Nenhum torneio localizado ainda.</p>
              <p className="text-[10px] text-slate-300 font-medium italic">Use o PIN fornecido pela organização.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {registrations.map(reg => (
                <button 
                  key={reg.pin} 
                  onClick={() => onSelectEvent(reg)}
                  className="w-full bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100 flex items-center justify-between active:scale-[0.98] transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner">
                      <Trophy size={24} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-gray-900 mb-1">{reg.name}</p>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Calendar size={12} />
                        <p className="text-[10px] font-bold">Inscrito em {new Date(reg.joinedAt).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
