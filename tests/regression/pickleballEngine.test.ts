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

  it('processa corretamente o caso crítico de Side-Out em duplas (rastreamento posicional)', () => {
    const state = createPickleballState();
    state.matchConfig.isDoubles = true;
    state.matchConfig.pickleballScoringMode = 'side-out';
    state.matchConfig.pickleballServiceMode = 'switch-side';

    // Jogadores
    state.p1.name = 'Jogador_A1';
    state.p1.partnerName = 'Jogador_A2';
    state.p2.name = 'Jogador_B1';
    state.p2.partnerName = 'Jogador_B2';

    // Configura estado: Time B sacando com serverNumber=2, placar T1=3, T2=2.
    // No rastreamento posicional, t2RightPlayer = 'Jogador_B2' (quem está na direita do T2).
    state.pickleball!.score.team1 = 3;
    state.pickleball!.score.team2 = 2;
    state.pickleball!.server.team = 2;
    state.pickleball!.server.serverNumber = 2;
    state.pickleball!.server.serverName = 'Jogador_B2';
    state.pickleball!.server.side = 'odd';
    state.pickleball!.server.t1RightPlayer = 'Jogador_A2'; // A2 está na direita de T1 após 3 pontos (trocas: A1→A2→A1→A2)
    state.pickleball!.server.t2RightPlayer = 'Jogador_B1'; // B1 está na direita de T2 (não sacou mais desde último turno)
    state.pickleball!.isFirstServerActive = false;

    // Time B (serverNumber=2) perde o rally → side-out para o Time A
    const next = incrementScorePickleball(state, 1);

    // Após side-out: Time A recebe o saque
    expect(next.pickleball!.server.team).toBe(1);
    expect(next.pickleball!.server.serverNumber).toBe(1);
    // Quem saca é quem está na DIREITA de T1 = 'Jogador_A2'
    expect(next.pickleball!.server.serverName).toBe('Jogador_A2');
    // Sacador está na DIREITA → side = 'even'
    expect(next.pickleball!.server.side).toBe('even');
  });

  it('troca de lado corretamente após ponto conquistado em side-out duplas', () => {
    const state = createPickleballState();
    state.matchConfig.isDoubles = true;
    state.matchConfig.pickleballScoringMode = 'side-out';
    state.matchConfig.pickleballServiceMode = 'switch-side';

    state.p1.name = 'Jogador_A1';
    state.p1.partnerName = 'Jogador_A2';
    state.p2.name = 'Jogador_B1';
    state.p2.partnerName = 'Jogador_B2';

    // T1 está sacando; A1 está na direita → saca A1 (serverNumber=1)
    state.pickleball!.server.team = 1;
    state.pickleball!.server.serverNumber = 1;
    state.pickleball!.server.serverName = 'Jogador_A1';
    state.pickleball!.server.side = 'even';
    state.pickleball!.server.t1RightPlayer = 'Jogador_A1';
    state.pickleball!.server.t2RightPlayer = 'Jogador_B1';
    state.pickleball!.isFirstServerActive = false;

    // T1 marca um ponto → A1 e A2 trocam de lado → agora A2 na direita
    const next = incrementScorePickleball(state, 1);

    expect(next.pickleball!.score.team1).toBe(1);
    expect(next.pickleball!.server.t1RightPlayer).toBe('Jogador_A2'); // swap executado
    expect(next.pickleball!.server.serverName).toBe('Jogador_A2');    // quem está na direita saca
    expect(next.pickleball!.server.side).toBe('even');                // direita = 'even'
  });

  it('inicializa t1RightPlayer e t2RightPlayer no estado inicial de side-out duplas', () => {
    const state = createPickleballState();
    state.matchConfig.isDoubles = true;
    state.matchConfig.pickleballScoringMode = 'side-out';
    state.p1.name = 'Jogador_A1';
    state.p1.partnerName = 'Jogador_A2';
    state.p2.name = 'Jogador_B1';
    state.p2.partnerName = 'Jogador_B2';
    delete state.pickleball;

    const pkl = initPickleballState(state);
    expect(pkl.server.t1RightPlayer).toBe('Jogador_A1'); // p1.name inicia na direita
    expect(pkl.server.t2RightPlayer).toBe('Jogador_B1'); // p2.name inicia na direita
    expect(pkl.server.side).toBe('even');                // sacador inicial na direita
  });
});

describe('pickleballEngine — whoHasPickleballGamePoint', () => {
  it('retorna null com placar baixo', () => {
    const state = createPickleballState();
    expect(whoHasPickleballGamePoint(state.pickleball!, state)).toBeNull();
  });
});
