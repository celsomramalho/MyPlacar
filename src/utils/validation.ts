import { GameState, MatchSettings, Player, PointEvent } from '../types';

export function isValidPlayer(p: any): p is Player {
  return (
    p &&
    typeof p.name === 'string' &&
    typeof p.score === 'string' &&
    typeof p.games === 'number' &&
    Array.isArray(p.sets)
  );
}

export function isValidMatchSettings(s: any): s is MatchSettings {
  return (
    s &&
    typeof s.sportType === 'string' &&
    typeof s.p1Name === 'string' &&
    typeof s.p2Name === 'string' &&
    typeof s.sets === 'number' &&
    typeof s.gamesPerSet === 'number'
  );
}

export function isValidGameState(s: any): s is GameState {
  if (!s) return false;
  
  // Essential fields for rendering
  const hasBasicFields = (
    typeof s.matchId === 'string' &&
    typeof s.startTime === 'number' &&
    isValidPlayer(s.p1) &&
    isValidPlayer(s.p2) &&
    (s.server === 1 || s.server === 2) &&
    Array.isArray(s.pointHistory) &&
    typeof s.currentSet === 'number' &&
    typeof s.isMatchOver === 'boolean' &&
    typeof s.matchDuration === 'number' &&
    typeof s.isPaused === 'boolean'
  );

  if (!hasBasicFields) return false;

  // Check matchConfig which is often a source of crashes if missing
  if (!s.matchConfig || typeof s.matchConfig.sportType !== 'string') {
    return false;
  }

  return true;
}
