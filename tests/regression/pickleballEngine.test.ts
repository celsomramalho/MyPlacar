/**
 * Testes de regressão: src/modules/game/domain/pickleballEngine.ts
 */
import { describe, it, expect } from 'vitest';
import {
  incrementScorePickleball,
  initPickleballState,
  whoHasPickleballGamePoint,
} from '../../src/modules/game/domain/pickleballEngine';
import { createPickleballState } from '../helpers/gameStateFactory';

describe('pickleballEngine — initPickleballState', () => {
  it('inicializa sub-estado com placar 0-0 e time 1 sacando', () => {
    const state = createPickleballState();
    delete state.pickleball;
    const pkl = initPickleballState(state);
    expect(pkl.score.team1).toBe(0);
    expect(pkl.score.team2).toBe(0);
    expect(pkl.server.team).toBe(1);
    expect(pkl.isMatchOver).toBe(false);
  });
});

describe('pickleballEngine — incrementScorePickleball (side-out)', () => {
  it('time sacador pontua no side-out', () => {
    const state = createPickleballState();
    const next = incrementScorePickleball(state, 1);
    expect(next.pickleball!.score.team1).toBe(1);
    expect(next.pickleball!.score.team2).toBe(0);
    expect(next.p1.score).toBe('1');
    expect(next.p2.score).toBe('0');
  });

  it('não altera placar quando receptor vence o rally (side-out)', () => {
    const state = createPickleballState();
    const next = incrementScorePickleball(state, 2);
    expect(next.pickleball!.score.team1).toBe(0);
    expect(next.pickleball!.score.team2).toBe(0);
  });

  it('marca game point quando um time atinge gamesPerSet - 1', () => {
    const state = createPickleballState();
    state.pickleball!.score.team1 = 10;
    state.pickleball!.score.team2 = 8;
    state.p1.score = '10';
    state.p2.score = '8';
    const gp = whoHasPickleballGamePoint(state.pickleball!, state);
    expect(gp).toBe(1);
  });
});

describe('pickleballEngine — whoHasPickleballGamePoint', () => {
  it('retorna null com placar baixo', () => {
    const state = createPickleballState();
    expect(whoHasPickleballGamePoint(state.pickleball!, state)).toBeNull();
  });
});
