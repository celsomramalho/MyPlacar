import React from 'react';
import { Layers, Trash2, ChevronUp, Check } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import type { EventCategory } from '@modules/events/types';
import type { FirebaseAdminSportIcon } from '@infra/firebase/adminIcons';

export interface CategoryFormModalProps {
  editingId: string | null;
  name: string;
  description: string;
  format: 'Simples' | 'Duplas';
  duplaType: 'Fixo' | 'Livre';
  phaseDuplaTypes: Partial<Record<'groups' | 'playoffs' | 'semifinal' | 'final', 'Fixo' | 'Livre'>>;
  sportId: string;
  abbreviation: string;
  priority: number;
  gender1: 'M' | 'F';
  gender2: 'M' | 'F';
  maxPlayers: number;
  activeSports: FirebaseAdminSportIcon[];
  onNameChange: (val: string) => void;
  onDescriptionChange: (val: string) => void;
  onFormatChange: (val: 'Simples' | 'Duplas') => void;
  onDuplaTypeChange: (val: 'Fixo' | 'Livre') => void;
  onPhaseDuplaTypeChange: (phase: 'groups' | 'playoffs' | 'semifinal' | 'final', val: 'Fixo' | 'Livre' | '') => void;
  onSportIdChange: (val: string) => void;
  onAbbreviationChange: (val: string) => void;
  onPriorityChange: (val: number) => void;
  onGender1Change: (val: 'M' | 'F') => void;
  onGender2Change: (val: 'M' | 'F') => void;
  onMaxPlayersChange: (val: number) => void;
  onSave: (e: React.FormEvent) => void;
  onDelete?: (id: string) => void;
  onCancel: () => void;
}

export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  editingId,
  name,
  description,
  format,
  duplaType,
  phaseDuplaTypes,
  sportId,
  abbreviation,
  priority,
  gender1,
  gender2,
  maxPlayers,
  activeSports,
  onNameChange,
  onDescriptionChange,
  onFormatChange,
  onDuplaTypeChange,
  onPhaseDuplaTypeChange,
  onSportIdChange,
  onAbbreviationChange,
  onPriorityChange,
  onGender1Change,
  onGender2Change,
  onMaxPlayersChange,
  onSave,
  onDelete,
  onCancel,
}) => {
  return (
    <form onSubmit={onSave} className="bg-white p-6 rounded-3xl border-2 border-emerald-500 shadow-md space-y-4 animate-in slide-in-from-top-4">
      <div className="flex items-center justify-between border-b pb-3">
        <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
          <Layers size={18} className="text-emerald-500" />
          {editingId ? 'Editar categoria' : 'Nova categoria'}
        </h3>
        <div className="flex items-center gap-1">
          {editingId && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(editingId)}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
              title="Excluir categoria"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-slate-600"
            title="Recolher cadastro"
          >
            <ChevronUp size={20} />
          </button>
        </div>

      </div>

      <div className="space-y-3">
        {/* Campo: Nome */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Nome</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ex: Duplas Masculino A"
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
          />
        </div>

        {/* Campo: Abreviação */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Abreviação</label>
          <input
            type="text"
            value={abbreviation}
            onChange={(e) => onAbbreviationChange(e.target.value)}
            placeholder="Ex: DMa_A"
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
          />
        </div>

        {/* Campo: Esporte */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Esporte</label>
          <select
            value={sportId}
            onChange={(e) => onSportIdChange(e.target.value)}
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
          >
            {activeSports.length === 0 ? (
              <option value="beach-tennis">Beach Tennis</option>
            ) : (
              activeSports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Campo: Formato */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Formato</label>
          <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value as 'Simples' | 'Duplas')}
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="Duplas">Duplas</option>
            <option value="Simples">Simples</option>
          </select>
        </div>

        {/* Campo: Descrição */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Descrição</label>
          <input
            type="text"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Ex: Categoria avançada masculina"
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
          />
        </div>

        {format === 'Duplas' && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 ml-1">Duplas</label>
              <select
                value={duplaType}
                onChange={(e) => onDuplaTypeChange(e.target.value as 'Fixo' | 'Livre')}
                className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="Fixo">Fixo</option>
                <option value="Livre">Livre</option>
              </select>
              <p className="text-[10px] text-slate-500 px-1">Fixo mantém os parceiros; livre permite combinações diferentes por partida.</p>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-500 ml-1">Substituir por fase (opcional)</p>
              {([
                ['groups', 'Fase de grupos'],
                ['playoffs', 'Eliminatórias'],
                ['semifinal', 'Semifinais'],
                ['final', 'Final e 3º lugar'],
              ] as const).map(([phase, label]) => (
                <div key={phase} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-slate-600">{label}</span>
                  <select
                    value={phaseDuplaTypes[phase] ?? ''}
                    onChange={(e) => onPhaseDuplaTypeChange(phase, e.target.value as 'Fixo' | 'Livre' | '')}
                    className="h-9 bg-white border border-slate-200 rounded-lg px-2 font-bold text-xs outline-none"
                  >
                    <option value="">Usar padrão ({duplaType})</option>
                    <option value="Fixo">Fixo</option>
                    <option value="Livre">Livre</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linha 6: Limite de jogadores */}
        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 ml-1">Limite de jogadores (padrão: 8)</label>
          <input
            type="number"
            min={1}
            value={maxPlayers || 8}
            onChange={(e) => onMaxPlayersChange(Math.max(1, Number(e.target.value) || 8))}
            placeholder="8"
            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500"
          />
        </div>

        {/* Linha 7: Prioridade e Gêneros */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Prioridade</label>
            <input
              type="number"
              min={1}
              value={priority}
              onChange={(e) => onPriorityChange(Number(e.target.value))}
              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs outline-none focus:border-emerald-500 text-center"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 ml-1">Gênero 1</label>
            <button
              type="button"
              onClick={() => onGender1Change(gender1 === 'M' ? 'F' : 'M')}
              className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 border font-black text-xs transition-all active:scale-95 ${
                gender1 === 'M'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-pink-500 text-white border-pink-500'
              }`}
              title="Clique para alternar entre M e F"
            >
              {gender1 === 'M' ? <MarsIcon size={18} /> : <VenusIcon size={18} />}
              {gender1 === 'M' ? 'M' : 'F'}
            </button>
          </div>

          {format === 'Duplas' ? (
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 ml-1">Gênero 2</label>
              <button
                type="button"
                onClick={() => onGender2Change(gender2 === 'M' ? 'F' : 'M')}
                className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 border font-black text-xs transition-all active:scale-95 ${
                  gender2 === 'M'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-pink-500 text-white border-pink-500'
                }`}
                title="Clique para alternar entre M e F"
              >
                {gender2 === 'M' ? <MarsIcon size={18} /> : <VenusIcon size={18} />}
                {gender2 === 'M' ? 'M' : 'F'}
              </button>
            </div>
          ) : (
            <div className="space-y-1 invisible">
              <label className="text-[10px]">–</label>
              <div className="h-11" />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-3">
        <button
          type="submit"
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs px-6 py-3.5 rounded-xl transition-all shadow-sm flex items-center gap-2"
        >
          <Check size={16} /> Salvar categoria
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-5 py-3.5 rounded-xl transition-all"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
};
