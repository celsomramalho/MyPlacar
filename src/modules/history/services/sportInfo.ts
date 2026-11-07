import { SPORT_LIST } from '../../../constants';

export interface SportInfo {
  id: string;
  name: string;
  defaultIcon: string;
  color: string;
}

const SPORT_COLORS: Record<string, string> = {
  tennis: '#3b82f6',
  'beach-tennis': '#f59e0b',
  pickleball: '#22c55e',
  voley: '#06b6d4',
  'voley-praia': '#f97316',
  pingpong: '#ec4899',
  truco: '#8b5cf6',
};

export const getSportInfo = (sportType?: string): SportInfo => {
  const normalized = (sportType || '').toLowerCase().trim();

  try {
    const cached = localStorage.getItem('myPlacar_ActiveSports');
    if (cached) {
      const parsed = JSON.parse(cached) as Array<{ id: string; name: string; url?: string }>;
      const foundInCache = parsed.find(
        (s) => s.id.toLowerCase() === normalized || s.id.toLowerCase() === normalized.replace(/_/g, '-')
      );
      if (foundInCache) {
        return {
          id: foundInCache.id,
          name: foundInCache.name,
          defaultIcon: foundInCache.url || '🎾',
          color: SPORT_COLORS[foundInCache.id] || '#f59e0b',
        };
      }
    }
  } catch {}

  const found = SPORT_LIST.find(
    (s) => s.id.toLowerCase() === normalized || s.id.toLowerCase() === normalized.replace(/_/g, '-')
  );
  if (found) {
    return {
      id: found.id,
      name: found.name,
      defaultIcon: found.defaultIcon,
      color: SPORT_COLORS[found.id] || '#3b82f6',
    };
  }

  if (normalized.includes('beach')) {
    return { id: 'beach-tennis', name: 'Beach tênis', defaultIcon: '🏓', color: '#f59e0b' };
  }
  if (normalized.includes('pickle')) {
    return { id: 'pickleball', name: 'Pickleball', defaultIcon: '🟡', color: '#22c55e' };
  }
  if (normalized === 'tennis') {
    return { id: 'tennis', name: 'Tênis', defaultIcon: '🎾', color: '#3b82f6' };
  }

  return {
    id: normalized || 'tennis',
    name: sportType || 'Partida',
    defaultIcon: '🎾',
    color: '#3b82f6',
  };
};
