import React from 'react';
import { Search, X } from 'lucide-react';

export interface ParticipantSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const ParticipantSearchInput: React.FC<ParticipantSearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Pesquisar participante por nome...',
  className = '',
  autoFocus = false,
}) => {
  return (
    <div className={`relative w-full ${className}`}>
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          title="Limpar pesquisa"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
};
