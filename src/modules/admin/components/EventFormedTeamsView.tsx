import React from 'react';
import { Users, Trophy, ShieldAlert } from 'lucide-react';
import type { TournamentEvent } from '@modules/events/types';

interface Props {
  event: TournamentEvent;
}

export const EventFormedTeamsView: React.FC<Props> = ({ event }) => {
  const pairs = event.pairs || [];

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
        <h2 className="text-xl font-black text-slate-800 tracking-tight">Times Formados</h2>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          Duplas e equipes confirmadas no evento ({pairs.length} duplas no total).
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-6">
        {pairs.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="mx-auto text-slate-300" size={32} />
            <p className="text-sm font-bold text-slate-400">Nenhum time formado ainda.</p>
            <p className="text-xs text-slate-300">
              Os times/duplas serão exibidos aqui assim que formados pelas inscrições.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pairs.map((pair, index) => (
              <div
                key={pair.id || index}
                className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-black text-xs">
                    #{index + 1}
                  </div>
                  <div>
                    <p className="font-black text-xs text-slate-800">
                      {pair.p1?.name || pair.p1?.nickname || 'Jogador 1'} &{' '}
                      {pair.p2?.name || pair.p2?.nickname || 'Jogador 2'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                      PINs: {pair.p1?.pin || '-'} / {pair.p2?.pin || '-'}
                    </p>
                  </div>
                </div>
                <span className="bg-white text-slate-500 border border-slate-200 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase">
                  Confirmada
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
