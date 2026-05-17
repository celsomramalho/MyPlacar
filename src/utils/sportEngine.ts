// ─── src/utils/sportEngine.ts ────────────────────────────────────────────────
// Mapeia o sportType para o motor de pontuação correspondente.
// Usado para detectar trocas de motor durante uma partida em andamento.
//
// Grupos:
//   'tennis'    → tennis, beach-tennis, padel, squash, badminton, etc.
//   'pickleball'→ pickleball
//
// Ao adicionar um novo motor no futuro, basta incluir o sportType aqui.
// ─────────────────────────────────────────────────────────────────────────────

export type ScoringEngine = 'tennis' | 'pickleball';

export function getEngineForSport(sportType: string | undefined): ScoringEngine {
  if (sportType === 'pickleball') return 'pickleball';
  return 'tennis';
}
