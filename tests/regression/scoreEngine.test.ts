/**
 * Testes de regressão: src/modules/game/domain/scoreEngine.ts (dispatcher)
 */
import { describe, it, expect } from 'vitest';
import { incrementScore } from '../../src/modules/game/domain/scoreEngine';
import { createGameState, createPickleballState, createMatchOverState } from '../helpers/gameStateFactory';

describe('scoreEngine — incrementScore', () => {
  it('roteia tênis: 0 → 15', () => {
    const state = createGameState();
    const next = incrementScore(state, 1);
    expect(next.p1.score).toBe('15');
    expect(next.pointHistory).toHaveLength(1);
  });

  it('roteia pickleball: sacador pontua', () => {
    const state = createPickleballState();
    const next = incrementScore(state, 1);
    expect(next.pickleball).toBeDefined();
    expect(next.pickleball!.score.team1).toBe(1);
  });

  it('não altera estado se partida encerrada', () => {
    const state = createMatchOverState();
    const next = incrementScore(state, 1);
    expect(next).toEqual(state);
    expect(next.pointHistory).toHaveLength(state.pointHistory.length);
  });
});

describe('scoreEngine — pointHistory', () => {
  it('registra rally no histórico antes de despachar', () => {
    const state = createGameState();
    const next = incrementScore(state, 2, 'rally', 'test');
    expect(next.pointHistory).toHaveLength(1);
    expect(next.pointHistory[0].winner).toBe(2);
    expect(next.pointHistory[0].source).toBe('test');
  });
});
