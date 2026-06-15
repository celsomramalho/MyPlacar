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

  it('processa corretamente o caso crítico de Side-Out em duplas com placar ímpar', () => {
    const state = createPickleballState();
    state.matchConfig.isDoubles = true;
    state.matchConfig.pickleballScoringMode = 'side-out';
    state.matchConfig.pickleballServiceMode = 'switch-side';

    // Jogadores
    state.p1.name = 'Jogador_Inicial_A1';
    state.p1.partnerName = 'Jogador_A2';
    state.p2.name = 'Jogador_Inicial_B1';
    state.p2.partnerName = 'Jogador_B2';

    // Configura estado inicial do caso de teste:
    // Placar: Time A (3 pontos), Time B (2 pontos).
    // Time B sacando com serverNumber = 2.
    state.pickleball!.score.team1 = 3;
    state.pickleball!.score.team2 = 2;
    state.pickleball!.server.team = 2;
    state.pickleball!.server.serverNumber = 2;
    state.pickleball!.server.serverName = 'Jogador_B2';
    state.pickleball!.server.side = 'odd'; // já na esquerda
    state.pickleball!.isFirstServerActive = false;

    // Time B perde o rali -> Rally Winner é o Time 1 (Time A)
    const next = incrementScorePickleball(state, 1);

    // Verificações Pós-Side-Out
    expect(next.pickleball!.server.team).toBe(1); // Posse vai para o Time A
    expect(next.pickleball!.server.serverNumber).toBe(1); // Sacador 1 do turno
    expect(next.pickleball!.server.serverName).toBe('Jogador_A2'); // Sacador de acordo com a paridade (ímpar -> parceiro na direita)
    expect(next.pickleball!.server.side).toBe('even'); // Deve sacar da direita
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
