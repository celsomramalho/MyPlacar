import { collection, doc, getDocs, onSnapshot, query, writeBatch, type Firestore, type Unsubscribe } from 'firebase/firestore';

export interface FirebaseLiveMatchesStats {
  total: number;
  expired: number;
  expiredIds: string[];
  inactiveLives: number;
  inactiveLivesIds: string[];
}

export interface FirebaseTournamentLiveScore {
  p1Score: string;
  p2Score: string;
  p1Games: number;
  p2Games: number;
  p1Sets: number;
  p2Sets: number;
  isPaused: boolean;
}

interface FirebaseLiveMatchData {
  startTime?: number;
  lastActivityAt?: number;
  tournamentPin?: string;
  tournamentMatchId?: string;
  p1?: {
    score?: string;
    games?: number;
    sets?: number[];
  };
  p2?: {
    score?: string;
    games?: number;
    sets?: number[];
  };
  isPaused?: boolean;
}

const countSetsWon = (ownSets: number[] = [], opponentSets: number[] = []) => {
  return ownSets.filter((score, index) => score > (opponentSets[index] ?? 0)).length;
};

export const fetchLiveMatchesStats = async (
  db: Firestore,
  expirationMs = 24 * 60 * 60 * 1000,
  inactiveHours = 2,
): Promise<FirebaseLiveMatchesStats> => {
  const snapshot = await getDocs(collection(db, 'live_matches'));
  const expirationLimit = Date.now() - expirationMs;
  const inactiveLimit = Date.now() - (inactiveHours * 60 * 60 * 1000);
  const expiredIds: string[] = [];
  const inactiveLivesIds: string[] = [];

  snapshot.forEach(docSnapshot => {
    const data = docSnapshot.data() as FirebaseLiveMatchData;
    // Critério 1: Criada há mais de 24h
    if (data.startTime && data.startTime < expirationLimit) {
      expiredIds.push(docSnapshot.id);
    }
    // Critério 2: Sem atividade pelo tempo configurado
    const lastActive = data.lastActivityAt || data.startTime;
    if (lastActive && lastActive < inactiveLimit) {
      inactiveLivesIds.push(docSnapshot.id);
    }
  });

  return {
    total: snapshot.size,
    expired: expiredIds.length,
    expiredIds,
    inactiveLives: inactiveLivesIds.length,
    inactiveLivesIds,
  };
};

export const deleteLiveMatchesByIds = async (
  db: Firestore,
  ids: string[],
) => {
  const batch = writeBatch(db);
  ids.forEach(id => {
    batch.delete(doc(db, 'live_matches', id));
  });

  await batch.commit();
};

export const subscribeTournamentLiveScores = (
  db: Firestore,
  tournamentPin: string,
  onScores: (scores: Record<string, FirebaseTournamentLiveScore>) => void,
): Unsubscribe => {
  const liveMatchesQuery = query(collection(db, 'live_matches'));

  return onSnapshot(liveMatchesQuery, (snapshot) => {
    const scores: Record<string, FirebaseTournamentLiveScore> = {};

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() as FirebaseLiveMatchData;
      if (data.tournamentPin !== tournamentPin || !data.tournamentMatchId) return;

      const p1Sets = data.p1?.sets || [];
      const p2Sets = data.p2?.sets || [];

      scores[data.tournamentMatchId] = {
        p1Score: data.p1?.score || '0',
        p2Score: data.p2?.score || '0',
        p1Games: data.p1?.games || 0,
        p2Games: data.p2?.games || 0,
        p1Sets: countSetsWon(p1Sets, p2Sets),
        p2Sets: countSetsWon(p2Sets, p1Sets),
        isPaused: !!data.isPaused,
      };
    });

    onScores(scores);
  });
};
