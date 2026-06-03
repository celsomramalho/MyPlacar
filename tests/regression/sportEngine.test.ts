/**
 * Testes de regressão: src/modules/game/domain/sportEngine.ts
 *
 * Cobertura:
 * - getEngineForSport: mapeamento correto de sport → engine
 *
 * Propósito: garantir que a refatoração (mover ScoringEngine para dentro
 * de sportEngine.ts e remover o import de src/types.ts) não quebra
 * o comportamento desta função.
 */
import { describe, it, expect } from 'vitest';
import { getEngineForSport } from '../../src/modules/game/domain/sportEngine';

describe('sportEngine — getEngineForSport', () => {
  it('retorna "pickleball" para sportType === "pickleball"', () => {
    expect(getEngineForSport('pickleball')).toBe('pickleball');
  });

  it('retorna "tennis" para sportType === "tennis"', () => {
    expect(getEngineForSport('tennis')).toBe('tennis');
  });

  it('retorna "tennis" para beach-tennis', () => {
    expect(getEngineForSport('beach-tennis')).toBe('tennis');
  });

  it('retorna "tennis" para padel', () => {
    expect(getEngineForSport('padel')).toBe('tennis');
  });

  it('retorna "tennis" para qualquer esporte desconhecido', () => {
    expect(getEngineForSport('futsal')).toBe('tennis');
  });

  it('retorna "tennis" para undefined', () => {
    expect(getEngineForSport(undefined)).toBe('tennis');
  });

  it('retorna "tennis" para string vazia', () => {
    expect(getEngineForSport('')).toBe('tennis');
  });
});
