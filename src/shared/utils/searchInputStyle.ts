/**
 * Utilitário para padronização visual dos campos de pesquisa do MyPlacar:
 * - Vazio: Fundo azul claro (bg-blue-50/70 border-blue-200)
 * - Com resultado (tendo algo digitado): Fundo verde claro (bg-emerald-50/80 border-emerald-300)
 * - Sem resultado (tendo algo digitado): Fundo vermelho claro (bg-rose-50/80 border-rose-300)
 */

export interface SearchInputStyleOptions {
  query: string;
  resultCount?: number;
  hasResults?: boolean;
  hasSearched?: boolean;
  isSearching?: boolean;
}

export function getSearchInputStyles({
  query,
  resultCount,
  hasResults,
  hasSearched = true,
  isSearching = false,
}: SearchInputStyleOptions): {
  inputClasses: string;
  iconClasses: string;
} {
  const trimmed = query.trim();

  // 1. Vazio ou busca ainda não disparada: Azul claro
  if (!trimmed || hasSearched === false) {
    return {
      inputClasses:
        'bg-blue-50/70 border-blue-200 text-slate-800 placeholder:text-blue-400 focus:border-blue-400 focus:bg-blue-50 focus:ring-2 focus:ring-blue-100',
      iconClasses: 'text-blue-500',
    };
  }

  // Se estiver buscando ativamente de forma assíncrona
  if (isSearching) {
    return {
      inputClasses:
        'bg-blue-50/60 border-blue-300 text-slate-800 placeholder:text-blue-400 focus:border-blue-400 focus:bg-blue-50 focus:ring-2 focus:ring-blue-100',
      iconClasses: 'text-blue-600',
    };
  }

  const effectiveHasResults =
    typeof resultCount === 'number' ? resultCount > 0 : Boolean(hasResults);

  // 2. Com resultado: Verde claro
  if (effectiveHasResults) {
    return {
      inputClasses:
        'bg-emerald-50/80 border-emerald-300 text-slate-900 placeholder:text-emerald-500 focus:border-emerald-400 focus:bg-emerald-50 focus:ring-2 focus:ring-emerald-100',
      iconClasses: 'text-emerald-600',
    };
  }

  // 3. Sem resultado (tendo algo digitado): Vermelho claro
  return {
    inputClasses:
      'bg-rose-50/80 border-rose-300 text-slate-900 placeholder:text-rose-400 focus:border-rose-400 focus:bg-rose-50 focus:ring-2 focus:ring-rose-100',
    iconClasses: 'text-rose-500',
  };
}

export function getSearchInputBgClass(
  query: string,
  resultCountOrHasResults?: number | boolean,
  isSearching = false,
  hasSearched = true,
): string {
  const isNumber = typeof resultCountOrHasResults === 'number';
  return getSearchInputStyles({
    query,
    resultCount: isNumber ? resultCountOrHasResults : undefined,
    hasResults: !isNumber ? resultCountOrHasResults : undefined,
    isSearching,
    hasSearched,
  }).inputClasses;
}
