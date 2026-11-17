import React from 'react';
import { Layers, CheckCircle2, AlertTriangle, Users, DollarSign } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import type { EventCategory } from '@modules/events/types';
import type { PricingCalculationResult, CategoryVacancyResult } from '../../types';

export interface CategorySelectionStepProps {
  categories: EventCategory[];
  selectedCategoryIds: string[];
  toggleCategory: (categoryId: string) => void;
  categoryVacancyMap: Record<string, CategoryVacancyResult>;
  pricing: PricingCalculationResult;
  readOnly?: boolean;
  conflictingCategoryIds?: string[];
  groupConflictCategoryIds?: string[];
  nickname?: string;
  gender?: 'M' | 'F';
  onGenderChange?: (gender: 'M' | 'F') => void;
}

export const CategorySelectionStep: React.FC<CategorySelectionStepProps> = ({
  categories,
  selectedCategoryIds,
  toggleCategory,
  categoryVacancyMap,
  pricing,
  readOnly = false,
  conflictingCategoryIds = [],
  groupConflictCategoryIds = [],
  nickname = '',
  gender = 'M',
  onGenderChange,
}) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
          <Layers size={18} className="text-blue-600" />
          Categorias disponíveis
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          Selecione uma ou mais categorias que deseja disputar.
        </p>
      </div>

      {/* Banner Informativo de Gênero com Troca Rápida */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          gender === 'F'
            ? 'bg-rose-50/60 border-rose-200/80 text-rose-950'
            : 'bg-blue-50/60 border-blue-200/80 text-blue-950'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              gender === 'F' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
            }`}
          >
            {gender === 'F' ? <VenusIcon size={16} /> : <MarsIcon size={16} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black">
                Perfil: {gender === 'F' ? 'Feminino' : 'Masculino'}
              </span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                  gender === 'F' ? 'bg-rose-100/90 text-rose-700' : 'bg-blue-100/90 text-blue-700'
                }`}
              >
                {gender === 'F' ? 'Categorias Femininas e Mistas' : 'Categorias Masculinas e Mistas'}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Exibindo apenas categorias compatíveis com o gênero do atleta.
            </p>
          </div>
        </div>

        {!readOnly && onGenderChange && (
          <button
            type="button"
            onClick={() => onGenderChange(gender === 'F' ? 'M' : 'F')}
            className={`self-start sm:self-center shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95 ${
              gender === 'F'
                ? 'bg-white hover:bg-blue-50 text-slate-700 border-slate-200 hover:border-blue-300'
                : 'bg-white hover:bg-rose-50 text-slate-700 border-slate-200 hover:border-rose-300'
            }`}
            title={`Alterar cadastro para perfil ${gender === 'F' ? 'Masculino' : 'Feminino'}`}
          >
            {gender === 'F' ? (
              <>
                <span className="text-blue-600 flex items-center"><MarsIcon size={13} /></span>
                <span>Trocar para <strong className="text-blue-600">Masculino</strong></span>
              </>
            ) : (
              <>
                <span className="text-rose-600 flex items-center"><VenusIcon size={13} /></span>
                <span>Trocar para <strong className="text-rose-600">Feminino</strong></span>
              </>
            )}
          </button>
        )}
      </div>

      {categories.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 font-bold text-xs">
          Nenhuma categoria configurada para este evento.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((cat) => {
            const isSelected = selectedCategoryIds.includes(cat.id);
            const vacancy = categoryVacancyMap[cat.id];
            const isFull = vacancy?.isFull ?? false;
            const hasGroupConflict = groupConflictCategoryIds.includes(cat.id);
            const remaining = vacancy?.remaining ?? 0;
            const limit = vacancy?.limit ?? 8;
            const confirmedCount = vacancy?.confirmedCount ?? 0;

            return (
              <div
                key={cat.id}
                onClick={() => {
                  if (readOnly) return;
                  if (!isSelected && hasGroupConflict) return;
                  if (!isSelected && isFull) return;
                  toggleCategory(cat.id);
                }}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-50/50 border-blue-500 shadow-xs'
                    : isFull || hasGroupConflict
                    ? 'bg-slate-50/70 border-slate-200 opacity-60 cursor-not-allowed'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 tracking-wider">
                      {cat.abbreviation || 'Cat'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {cat.format}
                    </span>
                  </div>

                  <h4 className="text-sm font-black text-slate-800 mt-2">
                    {cat.name}
                  </h4>
                  {cat.description && (
                    <p className="text-xs text-slate-500 font-bold mt-1 line-clamp-2">
                      {cat.description}
                    </p>
                  )}
                  {conflictingCategoryIds.includes(cat.id) && (
                    <div className="mt-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                      <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                      <span>Nome "{nickname}" já em uso nesta categoria</span>
                    </div>
                  )}
                  {hasGroupConflict && (
                    <div className="mt-2.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                      <span>{cat.categoryGroup ? `Já há outra categoria do grupo ${cat.categoryGroup} selecionada ou vinculada a esta inscrição.` : 'Já existe uma inscrição sua em outra categoria deste grupo.'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
                  {/* Indicador de Vagas */}
                  <div className="text-[11px] font-black">
                    {isFull ? (
                      <span className="text-rose-600 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Vagas esgotadas ({confirmedCount}/{limit})
                      </span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1">
                        <Users size={12} className="text-slate-400" />
                        {remaining} {remaining === 1 ? 'vaga restante' : 'vagas restantes'}
                      </span>
                    )}
                  </div>

                  {/* Checkbox Visual */}
                  <div
                    className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'border-2 border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <CheckCircle2 size={14} className="fill-current text-white" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumo Financeiro da Seleção */}
      {selectedCategoryIds.length > 0 && (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
              <DollarSign size={16} />
            </div>
            <div>
              <p className="text-xs font-black text-slate-800">
                {pricing.isFree
                  ? 'Inscrição gratuita'
                  : `Valor total: R$ ${pricing.dueAmount.toFixed(2)}`}
              </p>
              <p className="text-[11px] font-bold text-slate-400">
                {selectedCategoryIds.length === 1
                  ? '1 categoria selecionada'
                  : `${selectedCategoryIds.length} categorias selecionadas (+ R$ ${pricing.extraFee.toFixed(2)} por adicional)`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
