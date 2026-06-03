/**
 * Testes de regressão: src/modules/game/domain/tennisEngine.ts
 *
 * Cobertura das funções críticas:
 * - incrementScore: fluxo completo de pontuação (ponto → game → set → match)
 * - isTennisTieBreak: detecção correta de tie-break
 * - getTennisServerSide: cálculo de lado da quadra
 * - undoPoint: recuperação de estado anterior
 *
 * Propósito: garantir que a refatoração dos tipos não quebra a lógica
 * de pontuação do tênis — o coração do app.
 */
import { describe, it, expect } from 'vitest';
import {
  incrementScore,
  isTennisTieBreak,
  getTennisServerSide,
  undoPoint,
  incrementScoreTennis,
} from '../../src/modules/game/domain/tennisEngine';
import {
  createGameState,
  createDeuceState,
  createNearSetEndState,
  createTieBreakState,
  createMatchOverState,
} from '../helpers/gameStateFactory';

// ─── Testes básicos de pontuação ─────────────────────────────────────────────

describe('tennisEngine — incrementScore (ponto básico)', () => {
  it('avança placar de P1: 0 → 15', () => {
    const state = createGameState();
    const next = incrementScore(state, 1);
    expect(next.p1.score).toBe('15');
    expect(next.p2.score).toBe('0');
  });

  it('avança placar de P2: 0 → 15', () => {
    const state = createGameState();
    const next = incrementScore(state, 2);
    expect(next.p2.score).toBe('15');
    expect(next.p1.score).toBe('0');
  });

  it('avança: 15 → 30 → 40 → game ganho', () => {
    let s = createGameState();
    s = incrementScore(s, 1); // 15
    s = incrementScore(s, 1); // 30
    s = incrementScore(s, 1); // 40
    s = incrementScore(s, 1); // win game
    expect(s.p1.games).toBe(1);
    expect(s.p1.score).toBe('0');
    expect(s.p2.score).toBe('0');
  });

  it('não altera estado quando isMatchOver = true', () => {
    const state = createMatchOverState();
    const next = incrementScore(state, 1);
    expect(next).toBe(state); // mesma referência — retorno antecipado
  });

  it('adiciona evento ao pointHistory a cada ponto', () => {
    const state = createGameState();
    const next = incrementScore(state, 1);
    expect(next.pointHistory).toHaveLength(1);
    expect(next.pointHistory[0].winner).toBe(1);
    expect(next.pointHistory[0].scoreBefore).toBe('0-0');
  });

  it('registra source corretamente no pointHistory', () => {
    const state = createGameState();
    const next = incrementScore(state, 2, 'ace', 'cv');
    expect(next.pointHistory[0].type).toBe('ace');
    expect(next.pointHistory[0].source).toBe('cv');
  });
});

// ─── Deuce / Advantage ────────────────────────────────────────────────────────

describe('tennisEngine — Deuce e Advantage', () => {
  it('de 40-40, P1 marca → "Ad"', () => {
    const state = createDeuceState();
    const next = incrementScore(state, 1);
    expect(next.p1.score).toBe('Ad');
    expect(next.p2.score).toBe('40');
  });

  it('de Ad-40 (P1), P2 marca → volta para 40-40', () => {
    const s1 = createDeuceState();
    const s2 = incrementScore(s1, 1); // P1: Ad
    const s3 = incrementScore(s2, 2); // P2 nivela
    expect(s3.p1.score).toBe('40');
    expect(s3.p2.score).toBe('40');
  });

  it('de Ad-40 (P1), P1 marca → ganha game', () => {
    const s1 = createDeuceState();
    const s2 = incrementScore(s1, 1); // P1: Ad
    const s3 = incrementScore(s2, 1); // P1 wins game
    expect(s3.p1.games).toBe(1);
    expect(s3.p1.score).toBe('0');
  });

  it('com noAd: de 40-40, ganha game direto', () => {
    const state = createGameState({
      p1: { name: 'P1', score: '40', games: 0, sets: [], color: '#fff' },
      p2: { name: 'P2', score: '40', games: 0, sets: [], color: '#000' },
    });
    state.matchConfig.noAd = true;
    const next = incrementScore(state, 1);
    expect(next.p1.games).toBe(1);
  });
});

// ─── Vitória de Set ────────────────────────────────────────────────────────────

describe('tennisEngine — vitória de set', () => {
  it('P1 ganha set em 6-4', () => {
    const state = createNearSetEndState(); // P1: 5-4, score 40-0
    const next = incrementScore(state, 1); // ganha o game → 6-4 → win set
    expect(next.p1.sets).toHaveLength(1);
    expect(next.p1.sets[0]).toBe(6);
    expect(next.p2.sets[0]).toBe(4);
    expect(next.p1.games).toBe(0); // resetado
    expect(next.isMatchOver).toBe(false); // ainda falta 1 set
  });

  it('P1 vence a partida ao ganhar 2 sets (melhor de 3)', () => {
    // Simular P1 com 1 set já ganho, prestes a ganhar o 2º
    const state = createNearSetEndState();
    state.p1.sets = [6];
    state.p2.sets = [4];
    state.matchConfig.setsToWin = 3;

    const next = incrementScore(state, 1);
    expect(next.isMatchOver).toBe(true);
  });
});

// ─── Tie-break ─────────────────────────────────────────────────────────────────

describe('tennisEngine — isTennisTieBreak', () => {
  it('retorna true quando games estão em 6-6 (padrão)', () => {
    const state = createTieBreakState();
    expect(isTennisTieBreak(state)).toBe(true);
  });

  it('retorna false quando games não estão empatados no limite', () => {
    const state = createGameState();
    state.p1.games = 5;
    state.p2.games = 5;
    expect(isTennisTieBreak(state)).toBe(false); // 5-5 não é tie-break em set de 6
  });

  it('retorna false para pickleball (não usa tie-break de tênis)', () => {
    const state = createGameState();
    state.matchConfig.sportType = 'pickleball';
    state.p1.games = 6;
    state.p2.games = 6;
    expect(isTennisTieBreak(state)).toBe(false);
  });

  it('retorna false quando tieBreak está desabilitado', () => {
    const state = createTieBreakState();
    state.matchConfig.tieBreak = false;
    expect(isTennisTieBreak(state)).toBe(false);
  });

  it('suporta configuração de tie-break em 3-3 (Fast 4)', () => {
    const state = createGameState({
      p1: { name: 'P1', score: '0', games: 3, sets: [], color: '#fff' },
      p2: { name: 'P2', score: '0', games: 3, sets: [], color: '#000' },
    });
    state.matchConfig.tieBreakAt = '3-3';
    state.matchConfig.gamesPerSet = 4;
    expect(isTennisTieBreak(state)).toBe(true);
  });
});

// ─── Tie-break pontuação ───────────────────────────────────────────────────────

describe('tennisEngine — pontuação no tie-break', () => {
  it('placar no tie-break avança numericamente (0 → 1 → 2)', () => {
    let s = createTieBreakState();
    s = incrementScore(s, 1);
    expect(s.p1.score).toBe('1');
    s = incrementScore(s, 1);
    expect(s.p1.score).toBe('2');
  });

  it('P1 vence tie-break em 7-5 (win by two)', () => {
    let s = createTieBreakState();
    // P1: 6pts, P2: 5pts — P1 precisa de 2 de vantagem
    s.p1.score = '6';
    s.p2.score = '5';
    s = incrementScore(s, 1); // 7-5 → P1 wins (7 >= 7 e 7 >= 5+2)
    expect(s.p1.sets).toHaveLength(1);
  });

  it('tie-break troca de servidor a cada 2 pontos totais', () => {
    let s = createTieBreakState();
    const serverInitial = s.server;
    s = incrementScore(s, 1); // total: 1 → troca
    expect(s.server).not.toBe(serverInitial);
    s = incrementScore(s, 2); // total: 2 → não troca (par)
    expect(s.server).not.toBe(serverInitial); // ainda trocado
  });
});

// ─── Rotação de servidor ───────────────────────────────────────────────────────

describe('tennisEngine — rotação de servidor', () => {
  it('servidor troca após cada game ganho', () => {
    let s = createGameState(); // server: 1
    // P1 ganha um game completo
    s = incrementScore(s, 1); // 15
    s = incrementScore(s, 1); // 30
    s = incrementScore(s, 1); // 40
    s = incrementScore(s, 1); // game → server troca
    expect(s.server).toBe(2);
  });
});

// ─── getTennisServerSide ───────────────────────────────────────────────────────

describe('tennisEngine — getTennisServerSide', () => {
  it('retorna "even" no início do game (0-0)', () => {
    const state = createGameState(); // score: 0-0
    expect(getTennisServerSide(state)).toBe('even');
  });

  it('retorna "odd" após o primeiro ponto (15-0 → total 1)', () => {
    const state = createGameState({
      p1: { name: 'P1', score: '15', games: 0, sets: [], color: '#fff' },
      p2: { name: 'P2', score: '0',  games: 0, sets: [], color: '#000' },
    });
    expect(getTennisServerSide(state)).toBe('odd');
  });

  it('retorna "even" em 15-15 (total 2)', () => {
    const state = createGameState({
      p1: { name: 'P1', score: '15', games: 0, sets: [], color: '#fff' },
      p2: { name: 'P2', score: '15', games: 0, sets: [], color: '#000' },
    });
    expect(getTennisServerSide(state)).toBe('even');
  });

  it('retorna "odd" em 30-15 (total 3)', () => {
    const state = createGameState({
      p1: { name: 'P1', score: '30', games: 0, sets: [], color: '#fff' },
      p2: { name: 'P2', score: '15', games: 0, sets: [], color: '#000' },
    });
    expect(getTennisServerSide(state)).toBe('odd');
  });
});

// ─── undoPoint ─────────────────────────────────────────────────────────────────

describe('tennisEngine — undoPoint', () => {
  it('retorna null quando o histórico tem apenas 1 estado', () => {
    const state = createGameState();
    const result = undoPoint([state]);
    expect(result).toBeNull();
  });

  it('retorna o estado anterior com 2+ estados no histórico', () => {
    const s1 = createGameState();
    const s2 = incrementScore(s1, 1);
    const result = undoPoint([s1, s2]);
    expect(result).toBe(s1);
  });

  it('retorna o estado correto (penúltimo) com 3 estados', () => {
    const s1 = createGameState();
    const s2 = incrementScore(s1, 1);
    const s3 = incrementScore(s2, 2);
    const result = undoPoint([s1, s2, s3]);
    expect(result).toBe(s2);
  });
});
