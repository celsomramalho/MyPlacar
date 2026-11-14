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
  const { inputClasses, iconClasses } = getSearchInputStyles({
    query: value,
    resultCount,
    hasResults,
  });

  return (
    <div className={`relative w-full ${className}`}>
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
        className={`w-full h-10 pl-9 pr-8 border rounded-xl font-bold text-xs outline-none transition-all ${inputClasses}`}
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
  );
};
