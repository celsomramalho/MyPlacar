
/**
 * Formata nomes para o padrão Português em tempo real.
 */
export const formatPortugueseName = (val: string): string => {
  if (!val) return '';
  
  const prepositions = ['de', 'da', 'do', 'das', 'dos', 'e'];
  const parts = val.split(/(\s+)/);
  
  return parts.map((part) => {
    if (!part || part.trim().length === 0) return part;
    const lower = part.toLowerCase();
    if (prepositions.includes(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
};

/**
 * Aplica a Regra de Ouro (Sentence Case) a qualquer texto.
 */
export const applyGoldenRule = (text: string, enabled: boolean): string => {
  if (!enabled || !text) return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return text;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};
