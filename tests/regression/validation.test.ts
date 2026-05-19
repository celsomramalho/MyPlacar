/**
 * Testes de regressão: src/utils/validation.ts
 */
import { describe, it, expect } from 'vitest';
import { isValidPlayer, isValidMatchSettings, isValidGameState } from '../../src/utils/validation';
import { createGameState } from '../helpers/gameStateFactory';

describe('validation — isValidPlayer', () => {
  it('aceita jogador válido', () => {
    expect(isValidPlayer({ name: 'A', score: '0', games: 0, sets: [] })).toBe(true);
  });

  it('rejeita objeto incompleto', () => {
    expect(isValidPlayer({ name: 'A' })).toBe(false);
    expect(isValidPlayer(null)).toBe(false);
  });
});

describe('validation — isValidMatchSettings', () => {
  it('aceita config mínima de createGameState', () => {
    expect(isValidMatchSettings(createGameState().matchConfig)).toBe(true);
  });

  it('rejeita config sem sportType', () => {
    expect(isValidMatchSettings({ p1Name: 'a', p2Name: 'b', sets: 3, gamesPerSet: 6 })).toBe(false);
  });
});

describe('validation — isValidGameState', () => {
  it('aceita GameState de factory', () => {
    expect(isValidGameState(createGameState())).toBe(true);
  });

  it('rejeita estado sem matchConfig.sportType', () => {
    const state = createGameState();
    const broken = { ...state, matchConfig: { ...state.matchConfig, sportType: undefined } };
    expect(isValidGameState(broken)).toBe(false);
  });

  it('rejeita null e primitivos', () => {
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState('x')).toBe(false);
  });
});
