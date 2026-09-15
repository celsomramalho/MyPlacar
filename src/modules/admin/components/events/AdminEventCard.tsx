import React from 'react';
import { Trash2, ChevronRight } from 'lucide-react';
import type { TournamentEvent } from '@modules/events/types';

export interface AdminEventCardProps {
  event: TournamentEvent;
  onSelect: (event: TournamentEvent) => void;
  onDelete: (pin: string) => void;
}

export const AdminEventCard: React.FC<AdminEventCardProps> = ({
  event,
  onSelect,
  onDelete,
}) => {
  return (
    <div
      onClick={() => onSelect(event)}
      className="bg-white py-3 px-4 rounded-[1.5rem] shadow-xs border border-slate-100 flex items-center justify-between group cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all"
    >
      <div className="flex-1 min-w-0 pr-3">
        <p className="font-black text-black text-sm truncate leading-tight">{event.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <p className="text-[10px] font-black text-amber-500 uppercase">{event.pin}</p>
          <span className="text-[8px] font-black text-slate-300">•</span>
          <p className={`text-[8px] font-black uppercase ${event.active ? 'text-green-500' : 'text-red-500'}`}>
            {event.active ? 'Ativo' : 'Inativo'}
          </p>
          <span className="text-[8px] font-black text-slate-300">•</span>
          <p className="text-[8px] font-bold capitalize text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
            {event.eventStatus || 'Em configuração'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(event.pin);
          }}
          className="p-2.5 bg-red-50 text-red-500 rounded-xl border border-red-100 active:scale-90 transition-all hover:bg-red-100"
          title="Excluir evento"
        >
          <Trash2 size={16} />
        </button>
        <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
      </div>
    </div>
  );
};
