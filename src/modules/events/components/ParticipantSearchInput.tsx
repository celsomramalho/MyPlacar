import React from 'react';
import { Search, X } from 'lucide-react';
import { getSearchInputStyles } from '@shared/utils/searchInputStyle';

export interface ParticipantSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  resultCount?: number;
  hasResults?: boolean;
}

export const ParticipantSearchInput: React.FC<ParticipantSearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Pesquisar participante por nome...',
  className = '',
  autoFocus = false,
  resultCount,
  hasResults,
}) => {
  const hasQuery = Boolean(value && value.trim().length > 0);
  const resolvedHasResults = hasResults !== undefined
    ? hasResults
    : resultCount !== undefined
      ? resultCount > 0
      : true;

  const { inputClasses, iconClasses } = getSearchInputStyles({
    query: value,
    resultCount,
    hasResults: resolvedHasResults,
  });

  const wrapperBorder = !hasQuery
    ? 'border-blue-200 bg-blue-50/40'
    : resolvedHasResults
      ? 'border-emerald-400 bg-emerald-50/40'
      : 'border-rose-400 bg-rose-50/40';

  return (
    <div className={`rounded-2xl border-2 p-2.5 transition-all shadow-sm ${wrapperBorder} ${className}`}>
      <div className="relative w-full">
        <Search
          size={15}
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${iconClasses}`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full h-11 pl-9 pr-8 border-2 rounded-xl font-bold text-sm outline-none transition-all ${inputClasses}`}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
            title="Limpar pesquisa"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      {hasQuery && resultCount !== undefined && (
        <p className={`mt-1.5 px-1 text-[11px] font-bold ${resolvedHasResults ? 'text-emerald-700' : 'text-rose-600'}`}>
          {resolvedHasResults
            ? `${resultCount} ${resultCount === 1 ? 'resultado encontrado' : 'resultados encontrados'}`
            : `Nenhum resultado para "${value}"`}
        </p>
      )}
    </div>
  );
};
