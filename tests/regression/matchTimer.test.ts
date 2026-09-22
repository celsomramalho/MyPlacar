import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHistoryItem } from '../../src/modules/history/services/createHistoryItem';
import type { GameState } from '../../src/types';
import type { UserProfile } from '../../src/modules/auth/types';

const mockUserProfile: UserProfile = {
  name: 'Jogador Teste',
  nickname: 'Teste',
  email: 'teste@example.com',
  phone: '11999999999',
  pin: '1234',
  isProfileComplete: true,
  authMethod: 'pin',
};

const createMockGameState = (overrides: Partial<GameState> = {}): GameState =>
  ({
    matchId: 'match_timer_test',
    startTime: 1000000,
    currentSet: 0,
    server: 1,
    servingOrderOffset: 0,
    isMatchOver: false,
    isConfirmedFinished: false,
    isPaused: false,
    matchDuration: 0,
    accumulatedPausedTime: 0,
    p1: { name: 'P1', score: '0', games: 0, sets: [6], color: 'azul' },
    p2: { name: 'P2', score: '0', games: 0, sets: [4], color: 'vermelho' },
    pointHistory: [],
    history: [],
    matchConfig: {
      sportType: 'tennis',
      sets: 1,
      gamesPerSet: 6,
      tieBreak: true,
      tieBreakAt: 6,
      tieBreakPoints: 7,
      tieBreakWinByTwo: true,
      noAd: false,
      isDoubles: false,
      isWatchMode: false,
      isScoreboardMode: false,
      winnersStay: false,
      isHistoryEnabled: true,
    } as any,
    ...overrides,
  } as GameState);

describe('Match Duration & Timer Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses matchEndedAt when present to lock the exact duration', () => {
    const startTime = 1000000;
    const matchEndedAt = startTime + 35 * 60 * 1000; // 35 minutes later
    const laterTime = matchEndedAt + 10 * 60 * 1000; // 45 minutes later (user confirming 10 mins later)

    vi.spyOn(Date, 'now').mockReturnValue(laterTime);

    const state = createMockGameState({
      startTime,
      matchEndedAt,
      isMatchOver: true,
      isConfirmedFinished: true,
    });

    const item = createHistoryItem(state, mockUserProfile, []);

    // Duration should be exactly 35 minutes (2100 seconds), NOT 45 minutes (2700 seconds)
    expect(item.duration).toBe(35 * 60);
  });

  it('subtracts accumulatedPausedTime when calculating final duration', () => {
    const startTime = 1000000;
    const accumulatedPausedTime = 5 * 60 * 1000; // 5 minutes paused
    const matchEndedAt = startTime + 35 * 60 * 1000; // 35 minutes elapsed wall-clock

    const state = createMockGameState({
      startTime,
      matchEndedAt,
      accumulatedPausedTime,
      isMatchOver: true,
      isConfirmedFinished: true,
    });

    const item = createHistoryItem(state, mockUserProfile, []);

    // 35m - 5m = 30m = 1800s
    expect(item.duration).toBe(30 * 60);
  });

  it('falls back to Date.now() when matchEndedAt is not set', () => {
    const startTime = 1000000;
    const currentTime = startTime + 20 * 60 * 1000; // 20 minutes later

    vi.spyOn(Date, 'now').mockReturnValue(currentTime);

    const state = createMockGameState({
      startTime,
      matchEndedAt: undefined,
      isMatchOver: true,
      isConfirmedFinished: true,
    });

    const item = createHistoryItem(state, mockUserProfile, []);

    expect(item.duration).toBe(20 * 60);
  });
});
