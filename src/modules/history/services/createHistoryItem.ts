import type { Partner } from '@modules/partners';
import type { GameState, UserProfile } from '../../../types';
import type { MatchHistoryItem } from '../types';

const collectInvolvedPins = (state: GameState, partners: Partner[]): string[] => {
  const involvedPins: string[] = [];

  const checkAndAdd = (name: string) => {
    const found = partners.find((partner) => partner.nickname === name);
    if (found?.pin) involvedPins.push(found.pin.toUpperCase());
  };

  checkAndAdd(state.p1.name);
  if (state.p1.partnerName) checkAndAdd(state.p1.partnerName);
  checkAndAdd(state.p2.name);
  if (state.p2.partnerName) checkAndAdd(state.p2.partnerName);

  return involvedPins;
};

export const createHistoryItem = (
  state: GameState,
  userProfile: UserProfile,
  partners: Partner[],
  location?: { lat: number; lng: number },
): MatchHistoryItem => {
  const p1SetsWon = state.p1.sets.filter((s, i) => s > state.p2.sets[i]).length;
  const p2SetsWon = state.p2.sets.filter((s, i) => s > state.p1.sets[i]).length;
  const winnerTeam = p1SetsWon > p2SetsWon ? 1 : 2;
  const pointHistory = [...(state.pointHistory ?? [])];

  return {
    id: state.matchId,
    date: new Date().toLocaleDateString('pt-BR'),
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    sportType: state.matchConfig.sportType,
    p1Name: state.p1.name,
    p1Partner: state.p1.partnerName,
    p2Name: state.p2.name,
    p2Partner: state.p2.partnerName,
    p1Color: state.p1.color || 'azul',
    p2Color: state.p2.color || 'vermelho',
    scoreSummary: `${state.p1.sets.join('/')} - ${state.p2.sets.join('/')}`,
    p1Sets: [...state.p1.sets],
    p2Sets: [...state.p2.sets],
    winner: winnerTeam === 1 ? state.p1.name : state.p2.name,
    winnerTeam,
    duration: state.matchDuration,
    isSynced: false,
    ownerEmail: userProfile.email?.toLowerCase().trim() || '',
    pointHistory,
    location,
    stats: {
      p1Aces: pointHistory.filter((point) => point.winner === 1 && point.type === 'ace').length,
      p2Aces: pointHistory.filter((point) => point.winner === 2 && point.type === 'ace').length,
      p1Faults: pointHistory.filter((point) => point.winner === 1 && point.type === 'fault').length,
      p2Faults: pointHistory.filter((point) => point.winner === 2 && point.type === 'fault').length,
      totalPoints: pointHistory.length,
    },
    involvedPins: collectInvolvedPins(state, partners),
  };
};
