import type { Firestore } from 'firebase/firestore';
import { fetchEventByPin, updateEventMatches } from '@infra/firebase/events';
import type { TournamentMatch } from '../types';
import { updatePlayoffProgression } from './matchProgression';

export const markTournamentMatchLive = async (
  db: Firestore,
  eventPin: string,
  matches: TournamentMatch[],
  matchId: string,
  ownerPin: string,
) => {
  let sourceMatches = matches;
  if (sourceMatches.length === 0) {
    const event = await fetchEventByPin(db, eventPin);
    sourceMatches = ((event?.matches || []) as TournamentMatch[]);
  }

  const nowIso = new Date().toISOString();
  const updatedMatches = sourceMatches.map((match) => (
    match.id === matchId
      ? { ...match, status: 'live' as const, ownerPin, startedAt: match.startedAt || nowIso }
      : match
  ));
  await updateEventMatches(db, eventPin, updatedMatches);
};

export const markTournamentMatchScore = async (
  db: Firestore,
  eventPin: string,
  matchId: string,
  scores: TournamentMatch['scores'],
) => {
  const event = await fetchEventByPin(db, eventPin);
  if (!event) return;

  const updatedMatches: TournamentMatch[] = ((event.matches || []) as TournamentMatch[]).map((match) => {
    if (match.id !== matchId) return match;
    return {
      ...match,
      scores,
      result: (scores || [])
        .filter((score) => score.p1 !== null && score.p1 !== undefined && score.p2 !== null && score.p2 !== undefined)
        .map((score) => `${score.p1}/${score.p2}`)
        .join(' '),
    };
  });

  await updateEventMatches(db, eventPin, updatedMatches);
};

export const markTournamentMatchFinished = async (
  db: Firestore,
  eventPin: string,
  matchId: string,
  result: string,
  winnerTeam: 1 | 2,
) => {
  const event = await fetchEventByPin(db, eventPin);
  if (!event) return;

  const nowIso = new Date().toISOString();

  const updatedMatches: TournamentMatch[] = ((event.matches || []) as TournamentMatch[]).map((match) => {
    if (match.id !== matchId) return match;
    const winnerPairId = winnerTeam === 1 ? match.pair1Id : match.pair2Id;
    const loserPairId = winnerTeam === 1 ? match.pair2Id : match.pair1Id;
    let durationMinutes: number | undefined = undefined;
    if (match.startedAt) {
      const startMs = new Date(match.startedAt).getTime();
      const endMs = new Date(nowIso).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
        durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
      }
    }
    return {
      ...match,
      status: 'finished' as const,
      result,
      winnerPairId,
      loserPairId,
      court: undefined,
      ownerPin: undefined,
      finishedAt: nowIso,
      durationMinutes: durationMinutes ?? match.durationMinutes,
    };
  });

  const progressedMatches = updatePlayoffProgression((event.pairs || []) as unknown as import('../types').TournamentPair[], updatedMatches);

  await updateEventMatches(db, eventPin, progressedMatches);
};
