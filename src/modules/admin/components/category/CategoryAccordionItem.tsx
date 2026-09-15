import React from 'react';
import { Users, Trophy, Swords, X, ChevronDown } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import type { EventCategory } from '@modules/events/types';

export interface CategoryAccordionItemProps {
  cat: EventCategory;
  isEditing: boolean;
  isSelectedCategory: boolean;
  isReadOnly: boolean;
  categoryPanelView: 'entries' | 'teams' | 'matches' | null;
  inscritosCount: number;
  timesCount: number;
  partidasCount: number;
  onOpenPanel: (catId: string, view: 'entries' | 'teams' | 'matches') => void;
  onStartEdit: (cat: EventCategory) => void;
}

export const CategoryAccordionItem: React.FC<CategoryAccordionItemProps> = ({
  cat,
  isEditing,
  isSelectedCategory,
  isReadOnly,
  categoryPanelView,
  inscritosCount,
  timesCount,
  partidasCount,
  onOpenPanel,
  onStartEdit,
}) => {
  return (
    <div
      onClick={() => onOpenPanel(cat.id, 'entries')}
      className={`p-4 rounded-2xl border text-left transition-all space-y-3 w-full cursor-pointer ${
        isEditing
          ? 'border-emerald-500 bg-emerald-50 shadow-md scale-[1.01]'
          : isSelectedCategory
          ? 'border-blue-400 bg-blue-50/30 shadow-sm'
          : 'bg-white border-slate-100 hover:border-emerald-300 hover:shadow-sm shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-6 h-6 inline-flex items-center justify-center bg-slate-100 rounded-lg text-slate-600 font-black text-[10px]">
            {cat.priority}
          </span>
          <div className="min-w-0">
            <p className="font-black text-slate-800 text-sm leading-tight truncate">{cat.name}</p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">
              {cat.sportName || cat.sportId}
              {cat.abbreviation && ` · ${cat.abbreviation}`}
            </p>
          </div>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit(cat);
            }}
            className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-xl active:scale-90 transition-all cursor-pointer"
            title={isEditing ? 'Recolher cadastro da categoria' : 'Abrir cadastro da categoria'}
          >
            {isEditing ? <X size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {/* Badges de gênero */}
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
            cat.format === 'Duplas' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
          }`}
        >
          {cat.format}
        </span>
        {cat.gender1 && (
          <span
            className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${
              cat.gender1 === 'M' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
            }`}
          >
            {cat.gender1 === 'M' ? <MarsIcon size={10} /> : <VenusIcon size={10} />}
            {cat.gender1}
          </span>
        )}
        {cat.gender2 && cat.format === 'Duplas' && (
          <span
            className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${
              cat.gender2 === 'M' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
            }`}
          >
            {cat.gender2 === 'M' ? <MarsIcon size={10} /> : <VenusIcon size={10} />}
            {cat.gender2}
          </span>
        )}
      </div>

      {/* Contadores da categoria */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenPanel(cat.id, 'entries');
          }}
          className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors cursor-pointer ${
            isSelectedCategory && categoryPanelView === 'entries'
              ? 'bg-emerald-50 text-emerald-600'
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Users size={11} className="text-emerald-500" />
          <span>{inscritosCount} inscritos</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenPanel(cat.id, 'teams');
          }}
          className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors cursor-pointer ${
            isSelectedCategory && categoryPanelView === 'teams'
              ? 'bg-blue-50 text-blue-600'
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Trophy size={11} className="text-blue-500" />
          <span>{timesCount} times</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenPanel(cat.id, 'matches');
          }}
          className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-colors cursor-pointer ${
            isSelectedCategory && categoryPanelView === 'matches'
              ? 'bg-amber-50 text-amber-600'
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Swords size={11} className="text-amber-500" />
          <span>{partidasCount} partidas</span>
        </button>
      </div>
    </div>
  );
};
