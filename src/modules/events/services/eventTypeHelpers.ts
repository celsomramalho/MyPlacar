import type { TournamentEvent } from '../types';

/**
 * Identifica se um evento é do tipo Ranking.
 * Verifica o campo eventType (case-insensitive), o nome do evento,
 * as configurações de ranking (rankingMatchesPerTeam), esportes/chaves, etc.
 */
export const isRankingEvent = (event?: Partial<TournamentEvent> | null): boolean => {
  if (!event) return false;
  const type = (event.eventType || '').trim().toLowerCase();
  if (type === 'ranking') return true;
  const name = (event.name || '').trim().toLowerCase();
  if (name.includes('ranking')) return true;
  if (Boolean(event.rankingMatchesPerTeam && event.rankingMatchesPerTeam > 0)) return true;
  if (event.config?.sportType?.toLowerCase() === 'ranking') return true;
  if (event.bracketDrawType?.toLowerCase() === 'ranking' || event.matchDrawType?.toLowerCase() === 'ranking') return true;
  return false;
};

/**
 * Identifica se um evento é do tipo Super 8.
 */
export const isSuper8Event = (event?: Partial<TournamentEvent> | null): boolean => {
  if (!event) return false;
  const type = (event.eventType || '').trim().toLowerCase();
  if (type === 'super 8' || type === 'super8') return true;
  const name = (event.name || '').trim().toLowerCase();
  if (name.includes('super 8') || name.includes('super8')) return true;
  if (event.config?.sportType?.toLowerCase() === 'super 8' || event.config?.sportType?.toLowerCase() === 'super8') return true;
  return false;
};

/**
 * Eventos individuais onde cada jogador se inscreve individualmente
 * e a formação de duplas/times é livre por partida (Ranking ou Super 8).
 */
export const isSinglePlayerEvent = (event?: Partial<TournamentEvent> | null): boolean => {
  return isSuper8Event(event) || isRankingEvent(event);
};
