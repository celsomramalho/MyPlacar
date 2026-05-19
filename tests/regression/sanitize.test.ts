/**
 * Testes de regressão: src/utils/sanitize.ts
 *
 * Cobertura:
 * - sanitizeForFirestore: remoção de campos proibidos e conversão undefined→null
 *
 * Propósito: garantir que a lógica de sanitização para o Firestore
 * permanece intacta após a refatoração de tipos.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForFirestore } from '../../src/utils/sanitize';

describe('sanitize — sanitizeForFirestore', () => {
  it('retorna um objeto limpo sem modificar o original', () => {
    const original = { name: 'Test', score: 10 };
    const result = sanitizeForFirestore(original);
    expect(result).toEqual({ name: 'Test', score: 10 });
    expect(result).not.toBe(original); // deep clone
  });

  it('remove campos de configuração local (isWatchMode)', () => {
    const obj = { name: 'Test', isWatchMode: true, score: 5 };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('isWatchMode');
    expect(result.score).toBe(5);
  });

  it('remove isScoreboardMode', () => {
    const obj = { isScoreboardMode: true, score: 3 };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('isScoreboardMode');
  });

  it('remove brightness e volume', () => {
    const obj = { brightness: 80, volume: 50, name: 'X' };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('brightness');
    expect(result).not.toHaveProperty('volume');
    expect(result.name).toBe('X');
  });

  it('remove deviceLabel', () => {
    const obj = { deviceLabel: 'My Watch', score: 1 };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('deviceLabel');
  });

  it('remove selectedVoiceURI, voiceEnabled, voiceScoring', () => {
    const obj = { selectedVoiceURI: 'uri', voiceEnabled: true, voiceScoring: false, x: 1 };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('selectedVoiceURI');
    expect(result).not.toHaveProperty('voiceEnabled');
    expect(result).not.toHaveProperty('voiceScoring');
    expect(result.x).toBe(1);
  });

  it('remove actionCooldown e stateLockout', () => {
    const obj = { actionCooldown: 300, stateLockout: 500, score: 2 };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('actionCooldown');
    expect(result).not.toHaveProperty('stateLockout');
  });

  it('remove campos de ícones customizados', () => {
    const obj = {
      customSportIcon: 'icon',
      customSportIcons: { tennis: 'x' },
      customCategoryIcons: {},
      cloudSportIcons: {},
      cloudCategoryIcons: {},
      name: 'Y',
    };
    const result = sanitizeForFirestore(obj);
    expect(result).not.toHaveProperty('customSportIcon');
    expect(result).not.toHaveProperty('customSportIcons');
    expect(result).not.toHaveProperty('customCategoryIcons');
    expect(result).not.toHaveProperty('cloudSportIcons');
    expect(result).not.toHaveProperty('cloudCategoryIcons');
    expect(result.name).toBe('Y');
  });

  it('converte undefined para null e depois remove campos null de controllers', () => {
    const obj = { controllers: undefined, score: 7 };
    const result = sanitizeForFirestore(obj);
    // controllers: undefined → null → removido (nullFieldsToRemove)
    expect(result).not.toHaveProperty('controllers');
    expect(result.score).toBe(7);
  });

  it('mantém controllers quando definido (não null)', () => {
    const obj = { controllers: { dev1: { label: 'x', lastSeen: 1 } }, score: 7 };
    const result = sanitizeForFirestore(obj);
    expect(result.controllers).toEqual({ dev1: { label: 'x', lastSeen: 1 } });
  });

  it('aplica limpeza recursiva em objetos aninhados', () => {
    const obj = {
      matchConfig: {
        isWatchMode: true,
        brightness: 100,
        sportType: 'tennis',
      },
      score: 1,
    };
    const result = sanitizeForFirestore(obj);
    expect(result.matchConfig).not.toHaveProperty('isWatchMode');
    expect(result.matchConfig).not.toHaveProperty('brightness');
    expect(result.matchConfig.sportType).toBe('tennis');
  });

  it('lida com arrays sem quebrar', () => {
    const obj = { history: [{ p1: '6', p2: '4', setScores: '6-4' }] };
    const result = sanitizeForFirestore(obj);
    expect(Array.isArray(result.history)).toBe(true);
    expect(result.history[0].p1).toBe('6');
  });

  it('não quebra com objeto vazio', () => {
    expect(sanitizeForFirestore({})).toEqual({});
  });
});
