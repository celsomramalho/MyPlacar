import { GameState, MatchSettings, Player } from '../../../types.ts';

export function isValidPlayer(p: unknown): p is Player {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as Player).name === 'string' &&
    typeof (p as Player).score === 'string' &&
    typeof (p as Player).games === 'number' &&
    Array.isArray((p as Player).sets)
  );
}

export function isValidMatchSettings(s: unknown): s is MatchSettings {
  return (
    typeof s === 'object' &&
    s !== null &&
    typeof (s as MatchSettings).sportType === 'string' &&
    typeof (s as MatchSettings).p1Name === 'string' &&
    typeof (s as MatchSettings).p2Name === 'string' &&
    typeof (s as MatchSettings).sets === 'number' &&
    typeof (s as MatchSettings).gamesPerSet === 'number'
  );
}

export function isValidGameState(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const obj = s as any;
  
  // Essential fields for rendering
  const hasBasicFields = (
    typeof obj.matchId === 'string' &&
    typeof obj.startTime === 'number' &&
    isValidPlayer(obj.p1) &&
    isValidPlayer(obj.p2) &&
    (obj.server === 1 || obj.server === 2) &&
    Array.isArray(obj.pointHistory) &&
    typeof obj.currentSet === 'number' &&
    typeof obj.isMatchOver === 'boolean' &&
    typeof obj.matchDuration === 'number' &&
    typeof obj.isPaused === 'boolean'
  );

  if (!hasBasicFields) return false;

  // Check matchConfig which is often a source of crashes if missing
  if (!obj.matchConfig || typeof obj.matchConfig.sportType !== 'string') {
    return false;
  }

  return true;
}
