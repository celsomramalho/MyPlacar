import type { PointEvent, SportType } from '../../types';

export interface MatchHistoryItem {
  id: string;
  date: string;
  time: string;
  sportType: SportType;
  p1Name: string;
  p1Partner?: string;
  p2Name: string;
  p2Partner?: string;
  p1Color: string;
  p2Color: string;
  scoreSummary: string;
  p1Sets: number[];
  p2Sets: number[];
  winner: string;
  winnerTeam: 1 | 2;
  duration: number;
  isSynced: boolean;
  ownerEmail?: string;
  ownerPin?: string;
  location?: {
    lat: number;
    lng: number;
  };
  stats: {
    p1Aces: number;
    p2Aces: number;
    p1Faults: number;
    p2Faults: number;
    totalPoints: number;
  };
  pointHistory: PointEvent[];
  involvedPins?: string[];
}
