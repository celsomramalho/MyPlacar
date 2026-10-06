import type { MatchSetScore, TournamentMatch } from '@modules/events/types';

export const parseScoresFromMatch = (match: TournamentMatch) => {
  let g1 = 0;
  let g2 = 0;
  let s1 = 0;
  let s2 = 0;

  if (match.scores && Array.isArray(match.scores) && match.scores.length > 0) {
    match.scores.forEach((s) => {
      if (s && s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
        const score1 = Number(s.p1);
        const score2 = Number(s.p2);
        if (!isNaN(score1) && !isNaN(score2)) {
          g1 += score1;
          g2 += score2;
          if (score1 > score2) s1 += 1;
          else if (score2 > score1) s2 += 1;
        }
      }
    });
  } else if (match.result) {
    const parts = match.result.trim().split(/[\s,]+/);
    parts.forEach((part) => {
      const matchScores = part.match(/(\d+)[\/xX\-](\d+)/);
      if (matchScores) {
        const score1 = Number(matchScores[1]);
        const score2 = Number(matchScores[2]);
        if (!isNaN(score1) && !isNaN(score2)) {
          g1 += score1;
          g2 += score2;
          if (score1 > score2) s1 += 1;
          else if (score2 > score1) s2 += 1;
        }
      }
    });
  }

  return { g1, g2, s1, s2 };
};

export const parseMatchSets = (
  match: TournamentMatch,
  totalSetsCount: number,
  gamesPerSet = 6
): { scores: MatchSetScore[]; setsWon1: number; setsWon2: number } => {
  const scores: MatchSetScore[] = Array.from({ length: totalSetsCount }, (_, i) => {
    if (match.scores && match.scores[i]) {
      return match.scores[i];
    }
    if (match.result) {
      const parts = match.result.trim().split(/[\s,]+/);
      if (parts[i]) {
        const matchParts = parts[i].match(/(\d+)[\/xX\-](\d+)/);
        if (matchParts) {
          return { p1: Number(matchParts[1]), p2: Number(matchParts[2]) };
        }
      }
    }
    return { p1: null, p2: null };
  });

  let setsWon1 = 0;
  let setsWon2 = 0;

  scores.forEach((s) => {
    if (s.inProgress && match.status !== 'finished') return;
    if (s.p1 !== null && s.p1 !== undefined && s.p2 !== null && s.p2 !== undefined) {
      const n1 = Number(s.p1);
      const n2 = Number(s.p2);
      if (n1 >= gamesPerSet && n1 > n2) {
        setsWon1 += 1;
      } else if (n2 >= gamesPerSet && n2 > n1) {
        setsWon2 += 1;
      }
    }
  });

  return { scores, setsWon1, setsWon2 };
};
