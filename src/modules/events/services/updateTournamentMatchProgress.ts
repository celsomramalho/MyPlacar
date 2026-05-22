import type { Firestore } from 'firebase/firestore';
import { fetchEventByPin, updateEventMatches } from '@infra/firebase/events';
import type { TournamentMatch } from '../types';

export const markTournamentMatchLive = async (
  db: Firestore,
  eventPin: string,
  matches: TournamentMatch[],
  matchId: string,
  ownerPin: string,
) => {
  const updatedMatches = matches.map((match) => (
    match.id === matchId ? { ...match, status: 'live' as const, ownerPin } : match
  ));
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

  const updatedMatches = (event.matches || []).map((match) => {
    if (match.id !== matchId) return match;
    return {
      ...match,
      status: 'finished' as const,
      result,
      winnerPairId: winnerTeam === 1 ? match.pair1Id : match.pair2Id,
    };
  });

  await updateEventMatches(db, eventPin, updatedMatches);
};
