/**
 * Fase 1 – Testes de Regressão: Fila de Quadras (Court Queue Engine)
 *
 * Objetivo: Garantir que TODOS os comportamentos de negócio do queueManager.ts
 * sejam capturados antes da refatoração estrutural da Fase 2.
 *
 * Cobertura:
 *   Q-T01  Quadras livres e ocupadas calculadas corretamente
 *   Q-T02  Partida VERDE: time livre, quadra disponível
 *   Q-T03  Partida AMARELA: elegível mas sem quadra livre imediata
 *   Q-T04  Partida VERMELHA: atleta em conflito (jogando em outra quadra)
 *   Q-T05  Partida VERMELHA: bloqueada por fase anterior (semifinal)
 *   Q-T06  Partida VERMELHA: bloqueada por fase anterior (final)
 *   Q-T07  Partida CONGELADA manualmente (frozen flag)
 *   Q-T08  Ordenação circular de chaves (Chave 1 → 2 → 1 → 2 …)
 *   Q-T09  Prioridade de categoria (priority menor aparece primeiro)
 *   Q-T10  Visibilidade limitada a 4 × (quadras_efetivas)
 *   Q-T11  Quadra interditada não conta como disponível
 *   Q-T12  Estimativa de duração: usa dados reais das partidas finalizadas
 *   Q-T13  Estimativa de duração: fallback por formato quando sem histórico
 *   Q-T14  Tempo de chamada estimado é atribuído a partidas na fila
 *   Q-T15  Evento sem quadras retorna fila com courtList vazia
 */

import { describe, it, expect } from 'vitest';
import {
  calculateQueueState,
  calculateAverageMatchDuration,
} from '../../src/modules/events/services/queueManager';
import type { TournamentEvent, TournamentMatch, TournamentPair, EventCategory } from '../../src/modules/events/types';

// ─── Helpers de Factory ──────────────────────────────────────────────────────

const makePair = (id: string, email1: string, email2?: string): TournamentPair => ({
  id,
  p1: { email: email1, name: `Player ${email1}`, nickname: `nick_${email1}`, pin: `pin_${id}_1`, joinedAt: 0, gender: 'M', categoryIds: [], shirtSize: 'M', phone: '', checkedIn: false, disabled: false, disabledReason: '' },
  p2: email2
    ? { email: email2, name: `Player ${email2}`, nickname: `nick_${email2}`, pin: `pin_${id}_2`, joinedAt: 0, gender: 'F', categoryIds: [], shirtSize: 'M', phone: '', checkedIn: false, disabled: false, disabledReason: '' }
    : { email: '', name: '', nickname: '', pin: '', joinedAt: 0, gender: 'M', categoryIds: [], shirtSize: 'M', phone: '', checkedIn: false, disabled: false, disabledReason: '' },
  categoryId: 'cat1',
  teamNumber: 1,
  teamCode: `T${id}`,
});

const makeMatch = (overrides: Partial<TournamentMatch> & { id: string }): TournamentMatch => ({
  matchNumber: 1,
  status: 'waiting',
  phase: 'chave1',
  categoryId: 'cat1',
  pair1Id: 'p1',
  pair2Id: 'p2',
  ...overrides,
});

const makeCategory = (overrides: Partial<EventCategory> & { id: string }): EventCategory => ({
  name: 'Categoria Teste',
  format: 'Duplas',
  priority: 1,
  sportId: 'tennis',
  abbreviation: 'CAT',
  ...overrides,
});

const baseEvent = (overrides: Partial<TournamentEvent> = {}): TournamentEvent => ({
  pin: 'TEST',
  name: 'Torneio Teste',
  active: true,
  createdAt: Date.now(),
  courtsCount: 2,
  courtNames: ['Quadra 1', 'Quadra 2'],
  ...overrides,
});

// ─── Grupo 1: Estado das Quadras ─────────────────────────────────────────────

describe('Q-T01 – Quadras livres e ocupadas', () => {
  it('deve retornar quadras livres quando não há partidas ao vivo', () => {
    const event = baseEvent({ matches: [] });
    const result = calculateQueueState(event);

    expect(result.totalCourtsCount).toBe(2);
    expect(result.freeCourtsCount).toBe(2);
    expect(result.busyCourtsCount).toBe(0);
    expect(result.freeCourts).toEqual(['Quadra 1', 'Quadra 2']);
  });

  it('deve marcar quadra como busy quando há partida ao vivo nela', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const liveMatch = makeMatch({
      id: 'm1',
      status: 'live',
      court: 'Quadra 1',
      pair1: pair1,
      pair2: pair2,
    });

    const event = baseEvent({ matches: [liveMatch], pairs: [pair1, pair2] });
    const result = calculateQueueState(event);

    expect(result.busyCourtsCount).toBe(1);
    expect(result.freeCourtsCount).toBe(1);
    expect(result.freeCourts).toEqual(['Quadra 2']);

    const quadra1State = result.courtStates.find(c => c.courtName === 'Quadra 1');
    expect(quadra1State?.status).toBe('busy');
    expect(quadra1State?.activeMatch?.id).toBe('m1');
  });
});

describe('Q-T11 – Quadra interditada', () => {
  it('deve marcar quadra como interdicted e não contar como livre ou ocupada', () => {
    const event = baseEvent({
      matches: [],
      interdictedCourts: ['Quadra 1'],
    });
    const result = calculateQueueState(event);

    expect(result.interdictedCourtsCount).toBe(1);
    expect(result.freeCourtsCount).toBe(1);
    expect(result.busyCourtsCount).toBe(0);

    const q1 = result.courtStates.find(c => c.courtName === 'Quadra 1');
    expect(q1?.status).toBe('interdicted');
  });
});

// ─── Grupo 2: Status das Partidas na Fila ────────────────────────────────────

describe('Q-T02 – Partida VERDE: pronta para quadra livre', () => {
  it('a primeira partida elegível recebe status green quando há quadra livre', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const waitingMatch = makeMatch({
      id: 'm1',
      status: 'waiting',
      pair1: pair1,
      pair2: pair2,
      pair1Id: 'p1',
      pair2Id: 'p2',
    });

    const event = baseEvent({
      matches: [waitingMatch],
      pairs: [pair1, pair2],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const item = result.orderedQueue[0];
    expect(item.queueStatus).toBe('green');
    expect(item.isFrozen).toBe(false);
  });
});

describe('Q-T03 – Partida AMARELA: elegível, sem quadra livre imediata', () => {
  it('recebe yellow quando todas as quadras estão ocupadas mas a partida não tem conflito', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const pair3 = makePair('p3', 'e@e.com', 'f@f.com');
    const pair4 = makePair('p4', 'g@g.com', 'h@h.com');

    // 2 partidas ao vivo preenchem as 2 quadras
    const liveMatch1 = makeMatch({ id: 'live1', status: 'live', court: 'Quadra 1', pair1: pair1, pair2: pair2, pair1Id: 'p1', pair2Id: 'p2' });
    const liveMatch2 = makeMatch({ id: 'live2', status: 'live', court: 'Quadra 2', pair1: pair3, pair2: pair4, pair1Id: 'p3', pair2Id: 'p4' });

    // Times diferentes esperando
    const pair5 = makePair('p5', 'i@i.com', 'j@j.com');
    const pair6 = makePair('p6', 'k@k.com', 'l@l.com');
    const waitingMatch = makeMatch({ id: 'w1', status: 'waiting', pair1: pair5, pair2: pair6, pair1Id: 'p5', pair2Id: 'p6' });

    const event = baseEvent({
      matches: [liveMatch1, liveMatch2, waitingMatch],
      pairs: [pair1, pair2, pair3, pair4, pair5, pair6],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const item = result.orderedQueue.find(i => i.match.id === 'w1');
    expect(item).toBeDefined();
    expect(item?.queueStatus).toBe('yellow');
    expect(item?.isFrozen).toBe(false);
  });
});

describe('Q-T04 – Partida VERMELHA: conflito de atleta em quadra ativa', () => {
  it('recebe red e conflictReason quando um dos atletas está jogando em outra quadra', () => {
    const pair1 = makePair('p1', 'star@player.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');

    // pair1 está ao vivo na Quadra 1
    const liveMatch = makeMatch({
      id: 'live1',
      status: 'live',
      court: 'Quadra 1',
      pair1: pair1,
      pair2: pair2,
      pair1Id: 'p1',
      pair2Id: 'p2',
    });

    // pair3 tem star@player.com (em conflito) e pair4 é livre
    const pair3 = makePair('p3', 'star@player.com', 'e@e.com');
    const pair4 = makePair('p4', 'f@f.com', 'g@g.com');
    const conflictMatch = makeMatch({
      id: 'conflict1',
      status: 'waiting',
      pair1: pair3,
      pair2: pair4,
      pair1Id: 'p3',
      pair2Id: 'p4',
      matchNumber: 2,
    });

    const event = baseEvent({
      matches: [liveMatch, conflictMatch],
      pairs: [pair1, pair2, pair3, pair4],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const item = result.orderedQueue.find(i => i.match.id === 'conflict1');
    expect(item).toBeDefined();
    expect(item?.queueStatus).toBe('red');
    expect(item?.isFrozen).toBe(true);
    expect(item?.conflictReason).toContain('Aguardando');
  });
});

describe('Q-T05 – Partida VERMELHA: bloqueada por fase anterior (semifinal)', () => {
  it('recebe red quando é semifinal e partidas da fase de grupos não terminaram', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');

    // Partida de grupo ainda não finalizada
    const groupMatch = makeMatch({
      id: 'g1',
      status: 'waiting',
      phase: 'chave1',
      pair1: pair1,
      pair2: pair2,
      pair1Id: 'p1',
      pair2Id: 'p2',
    });

    // Semifinal com times definidos, mas grupo não terminou
    const pair3 = makePair('p3', 'e@e.com', 'f@f.com');
    const pair4 = makePair('p4', 'g@g.com', 'h@h.com');
    const semiMatch = makeMatch({
      id: 'semi1',
      status: 'waiting',
      phase: 'semifinal',
      pair1: pair3,
      pair2: pair4,
      pair1Id: 'p3',
      pair2Id: 'p4',
      matchNumber: 2,
    });

    const event = baseEvent({
      matches: [groupMatch, semiMatch],
      pairs: [pair1, pair2, pair3, pair4],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const semi = result.orderedQueue.find(i => i.match.id === 'semi1');
    expect(semi).toBeDefined();
    expect(semi?.queueStatus).toBe('red');
    expect(semi?.conflictReason).toContain('Aguardando término da fase anterior');
  });

  it('semifinal recebe status normal quando TODAS as partidas de grupos estão finalizadas', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');

    // Todos os grupos finalizados
    const groupMatch = makeMatch({
      id: 'g1',
      status: 'finished',
      phase: 'chave1',
      pair1: pair1,
      pair2: pair2,
      pair1Id: 'p1',
      pair2Id: 'p2',
    });

    // Semifinal com times definidos
    const pair3 = makePair('p3', 'e@e.com', 'f@f.com');
    const pair4 = makePair('p4', 'g@g.com', 'h@h.com');
    const semiMatch = makeMatch({
      id: 'semi1',
      status: 'waiting',
      phase: 'semifinal',
      pair1: pair3,
      pair2: pair4,
      pair1Id: 'p3',
      pair2Id: 'p4',
    });

    const event = baseEvent({
      matches: [groupMatch, semiMatch],
      pairs: [pair1, pair2, pair3, pair4],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const semi = result.orderedQueue.find(i => i.match.id === 'semi1');
    expect(semi?.queueStatus).not.toBe('red');
    expect(semi?.conflictReason).toBeUndefined();
  });
});

describe('Q-T06 – Partida VERMELHA: bloqueada por fase anterior (final)', () => {
  it('final recebe red quando semifinais ainda não terminaram', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const semi = makeMatch({ id: 's1', status: 'waiting', phase: 'semifinal', pair1: pair1, pair2: pair2, pair1Id: 'p1', pair2Id: 'p2' });

    const pair3 = makePair('p3', 'e@e.com', 'f@f.com');
    const pair4 = makePair('p4', 'g@g.com', 'h@h.com');
    const finalMatch = makeMatch({ id: 'f1', status: 'waiting', phase: 'final', pair1: pair3, pair2: pair4, pair1Id: 'p3', pair2Id: 'p4', matchNumber: 99 });

    const event = baseEvent({
      matches: [semi, finalMatch],
      pairs: [pair1, pair2, pair3, pair4],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const fin = result.orderedQueue.find(i => i.match.id === 'f1');
    expect(fin?.queueStatus).toBe('red');
    expect(fin?.conflictReason).toContain('Aguardando término da fase anterior');
  });
});

describe('Q-T07 – Partida VERMELHA: congelada manualmente', () => {
  it('frozen=true força o status para red independente de outros critérios', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const frozenMatch = makeMatch({
      id: 'm_frozen',
      status: 'waiting',
      frozen: true,
      pair1: pair1,
      pair2: pair2,
      pair1Id: 'p1',
      pair2Id: 'p2',
    });

    const event = baseEvent({
      matches: [frozenMatch],
      pairs: [pair1, pair2],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const item = result.orderedQueue.find(i => i.match.id === 'm_frozen');
    expect(item?.queueStatus).toBe('red');
    expect(item?.isFrozen).toBe(true);
  });
});

// ─── Grupo 3: Ordenação e Prioridade ─────────────────────────────────────────

describe('Q-T08 – Alternância circular de chaves', () => {
  it('intercala Chave 1 e Chave 2 em ordem circular', () => {
    const cats = [makeCategory({ id: 'cat1', priority: 1 })];
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const pair3 = makePair('p3', 'e@e.com', 'f@f.com');
    const pair4 = makePair('p4', 'g@g.com', 'h@h.com');
    const pair5 = makePair('p5', 'i@i.com', 'j@j.com');
    const pair6 = makePair('p6', 'k@k.com', 'l@l.com');

    const c1m1 = makeMatch({ id: 'c1m1', phase: 'chave1', order: 1, pair1: pair1, pair2: pair2, pair1Id: 'p1', pair2Id: 'p2' });
    const c1m2 = makeMatch({ id: 'c1m2', phase: 'chave1', order: 2, pair1: pair3, pair2: pair4, pair1Id: 'p3', pair2Id: 'p4' });
    const c2m1 = makeMatch({ id: 'c2m1', phase: 'chave2', order: 1, pair1: pair5, pair2: pair6, pair1Id: 'p5', pair2Id: 'p6' });

    const event = baseEvent({
      matches: [c1m1, c1m2, c2m1],
      pairs: [pair1, pair2, pair3, pair4, pair5, pair6],
      categories: cats,
      // 3 quadras para todos ficarem green e na fila visível
      courtsCount: 3,
      courtNames: ['Q1', 'Q2', 'Q3'],
    });
    const result = calculateQueueState(event);

    // Orderedqueue antes da reordenação por cor segue o critério circular:
    // c1m1 (chave1 order:1) → c2m1 (chave2 order:1) → c1m2 (chave1 order:2)
    const ids = result.orderedQueue.map(i => i.match.id);
    const posC1m1 = ids.indexOf('c1m1');
    const posC2m1 = ids.indexOf('c2m1');
    const posC1m2 = ids.indexOf('c1m2');

    // c1m1 deve vir antes de c1m2 (ambas da Chave 1)
    expect(posC1m1).toBeLessThan(posC1m2);
    // c2m1 deve vir entre c1m1 e c1m2 (alternância)
    expect(posC2m1).toBeGreaterThan(posC1m1);
    expect(posC2m1).toBeLessThan(posC1m2);
  });
});

describe('Q-T09 – Prioridade de categoria', () => {
  it('partidas de categoria com menor priority aparecem primeiro na fila', () => {
    const catHigh = makeCategory({ id: 'cat_high', priority: 1 });
    const catLow = makeCategory({ id: 'cat_low', priority: 5 });

    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const pair3 = makePair('p3', 'e@e.com', 'f@f.com');
    const pair4 = makePair('p4', 'g@g.com', 'h@h.com');

    const lowPrioMatch = makeMatch({ id: 'low1', categoryId: 'cat_low', pair1: pair1, pair2: pair2, pair1Id: 'p1', pair2Id: 'p2', matchNumber: 1 });
    const highPrioMatch = makeMatch({ id: 'high1', categoryId: 'cat_high', pair1: pair3, pair2: pair4, pair1Id: 'p3', pair2Id: 'p4', matchNumber: 2 });

    const event = baseEvent({
      matches: [lowPrioMatch, highPrioMatch],
      pairs: [pair1, pair2, pair3, pair4],
      categories: [catHigh, catLow],
      courtsCount: 1,
      courtNames: ['Q1'],
    });
    const result = calculateQueueState(event);

    // Filtra apenas partidas green/yellow (eligíveis) — não considera a reordenação por status
    const eligible = result.orderedQueue.filter(i => !i.isFrozen);
    const ids = eligible.map(i => i.match.id);

    // cat_high (priority 1) deve vir antes de cat_low (priority 5)
    expect(ids.indexOf('high1')).toBeLessThan(ids.indexOf('low1'));
  });
});

// ─── Grupo 4: Visibilidade ───────────────────────────────────────────────────

describe('Q-T10 – Limite de visibilidade (4 × quadras efetivas)', () => {
  it('visibleMatches retorna no máximo 4x o número de quadras efetivas', () => {
    // 10 partidas, 1 quadra efetiva → limite = 4
    const pairs: TournamentPair[] = [];
    const matches: TournamentMatch[] = [];

    for (let i = 0; i < 10; i++) {
      const p1 = makePair(`p${i * 2}`, `a${i}@a.com`, `b${i}@b.com`);
      const p2 = makePair(`p${i * 2 + 1}`, `c${i}@c.com`, `d${i}@d.com`);
      pairs.push(p1, p2);
      matches.push(makeMatch({
        id: `m${i}`,
        status: 'waiting',
        pair1: p1,
        pair2: p2,
        pair1Id: p1.id,
        pair2Id: p2.id,
        order: i,
      }));
    }

    const event = baseEvent({
      matches,
      pairs,
      courtsCount: 1,
      courtNames: ['Q1'],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    expect(result.visibleLimit).toBe(4);
    expect(result.visibleMatches.length).toBeLessThanOrEqual(4);
    expect(result.orderedQueue.length).toBe(10);
  });

  it('visibleLimit aumenta proporcionalmente com mais quadras', () => {
    const event = baseEvent({
      matches: [],
      courtsCount: 3,
      courtNames: ['Q1', 'Q2', 'Q3'],
    });
    const result = calculateQueueState(event);
    expect(result.visibleLimit).toBe(12); // 4 × 3
  });

  it('quadras interditadas não contam para o limite de visibilidade', () => {
    const event = baseEvent({
      matches: [],
      courtsCount: 3,
      courtNames: ['Q1', 'Q2', 'Q3'],
      interdictedCourts: ['Q1'], // 1 interditada → efetivas = 2
    });
    const result = calculateQueueState(event);
    expect(result.visibleLimit).toBe(8); // 4 × 2
  });
});

// ─── Grupo 5: Cálculo de Duração Média ───────────────────────────────────────

describe('Q-T12 – Duração média calculada a partir de partidas reais', () => {
  it('calcula a média das partidas finalizadas com durationMinutes', () => {
    const matches: TournamentMatch[] = [
      { ...makeMatch({ id: 'm1' }), status: 'finished', durationMinutes: 30 },
      { ...makeMatch({ id: 'm2' }), status: 'finished', durationMinutes: 40 },
      { ...makeMatch({ id: 'm3' }), status: 'finished', durationMinutes: 20 },
    ];

    const result = calculateAverageMatchDuration(matches);
    // Média: (30 + 40 + 20) / 3 = 30
    expect(result.averageMinutes).toBe(30);
    expect(result.isEstimated).toBe(false);
    expect(result.sampleCount).toBe(3);
  });

  it('calcula duração a partir de startedAt/finishedAt quando durationMinutes está ausente', () => {
    const now = Date.now();
    const matches: TournamentMatch[] = [
      {
        ...makeMatch({ id: 'm1' }),
        status: 'finished',
        startedAt: new Date(now - 35 * 60000).toISOString(),
        finishedAt: new Date(now).toISOString(),
      },
    ];

    const result = calculateAverageMatchDuration(matches);
    expect(result.averageMinutes).toBe(35);
    expect(result.isEstimated).toBe(false);
  });
});

describe('Q-T13 – Duração estimada (fallback por formato)', () => {
  it('retorna 25 minutos quando não há histórico e sets=1', () => {
    const result = calculateAverageMatchDuration([], { pin: 'T', name: 'T', active: true, createdAt: 0, setsCount: 1 });
    expect(result.averageMinutes).toBe(25);
    expect(result.isEstimated).toBe(true);
    expect(result.sampleCount).toBe(0);
  });

  it('retorna 45 minutos quando sets=3', () => {
    const result = calculateAverageMatchDuration([], { pin: 'T', name: 'T', active: true, createdAt: 0, setsCount: 3 });
    expect(result.averageMinutes).toBe(45);
    expect(result.isEstimated).toBe(true);
  });

  it('retorna 20 minutos para eventos Super 8', () => {
    const result = calculateAverageMatchDuration([], {
      pin: 'T', name: 'T', active: true, createdAt: 0,
      eventType: 'Super 8',
    });
    expect(result.averageMinutes).toBe(20);
    expect(result.isEstimated).toBe(true);
  });
});

// ─── Grupo 6: Estimativa de Chamada ──────────────────────────────────────────

describe('Q-T14 – Tempo de chamada estimado na fila', () => {
  it('partida green com quadra livre recebe estimatedWaitMinutes = 0', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const waitingMatch = makeMatch({ id: 'm1', status: 'waiting', pair1, pair2, pair1Id: 'p1', pair2Id: 'p2' });

    const event = baseEvent({
      matches: [waitingMatch],
      pairs: [pair1, pair2],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const item = result.orderedQueue.find(i => i.match.id === 'm1');
    expect(item?.queueStatus).toBe('green');
    expect(item?.estimatedWaitMinutes).toBe(0);
    expect(item?.estimatedCallTimeStr).toBeDefined();
  });

  it('partida red (conflito) NÃO recebe estimativa de chamada', () => {
    const pair1 = makePair('p1', 'conflict@x.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');

    const liveMatch = makeMatch({ id: 'live1', status: 'live', court: 'Quadra 1', pair1, pair2, pair1Id: 'p1', pair2Id: 'p2' });

    const pair3 = makePair('p3', 'conflict@x.com', 'e@e.com'); // mesmo atleta
    const pair4 = makePair('p4', 'f@f.com', 'g@g.com');
    const conflictMatch = makeMatch({ id: 'conflict1', status: 'waiting', pair1: pair3, pair2: pair4, pair1Id: 'p3', pair2Id: 'p4', matchNumber: 2 });

    const event = baseEvent({
      matches: [liveMatch, conflictMatch],
      pairs: [pair1, pair2, pair3, pair4],
      categories: [makeCategory({ id: 'cat1' })],
    });
    const result = calculateQueueState(event);

    const item = result.orderedQueue.find(i => i.match.id === 'conflict1');
    expect(item?.queueStatus).toBe('red');
    expect(item?.estimatedWaitMinutes).toBeUndefined();
  });
});

// ─── Grupo 7: Evento sem quadras ─────────────────────────────────────────────

describe('Q-T15 – Evento sem quadras configuradas', () => {
  it('retorna courtList vazia e fila com todas as partidas como gray', () => {
    const pair1 = makePair('p1', 'a@a.com', 'b@b.com');
    const pair2 = makePair('p2', 'c@c.com', 'd@d.com');
    const match = makeMatch({ id: 'm1', status: 'waiting', pair1, pair2, pair1Id: 'p1', pair2Id: 'p2' });

    const event: TournamentEvent = {
      pin: 'T',
      name: 'Sem Quadras',
      active: true,
      createdAt: 0,
      // Sem courtsCount e sem courtNames
      matches: [match],
      pairs: [pair1, pair2],
      categories: [makeCategory({ id: 'cat1' })],
    };
    const result = calculateQueueState(event);

    expect(result.courtList).toHaveLength(0);
    expect(result.freeCourtsCount).toBe(0);
    expect(result.totalCourtsCount).toBe(0);
    // Sem quadras livres, não há partidas green
    const greenItems = result.orderedQueue.filter(i => i.queueStatus === 'green');
    expect(greenItems).toHaveLength(0);
  });
});
