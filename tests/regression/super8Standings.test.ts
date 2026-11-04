/**
 * Testes de regressão: Critérios de desempate do Super 8
 *
 * Cobre o bug reportado onde dois atletas com exatamente os mesmos números
 * (vitórias, saldo de games, games pró, games contra) eram desempatados
 * incorretamente pelo "Saldo de Games" mesmo tendo valores idênticos.
 *
 * Critérios oficiais (CBT/ITF):
 * 2 atletas empatados em vitórias:
 *   1º Confronto Direto
 *   2º Saldo de Games (SG)
 *   3º Games Pró (GP)
 *   4º % de Games
 *   5º Empate Técnico (critérios matemáticos iguais -> mesmo rank compartilhado)
 *
 * 3+ atletas empatados em vitórias:
 *   1º Saldo de Games (SG)
 *   2º Games Pró (GP)
 *   3º % de Games
 *   4º Redução a subgrupos (se sobrar 2, aplica regras de 2 atletas incluindo Confronto Direto)
 *   5º Empate Técnico (se todos os critérios forem idênticos)
 */

import { describe, expect, it } from 'vitest';
import type { TournamentEntry, TournamentMatch } from '../../src/modules/events/types';
import { calculateSuper8PlayerStandings } from '../../src/modules/events/services/matchProgression';

let pinCounter = 1000;

const makeEntry = (name: string, pinOverride?: string): TournamentEntry => {
  const pin = pinOverride || String(pinCounter++);
  return {
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@teste.com`,
    name,
    nickname: name,
    pin,
    gender: 'M',
    categoryIds: ['cat1'],
    joinedAt: 0,
    shirtSize: 'M',
    phone: '',
    checkedIn: false,
    disabled: false,
    disabledReason: '',
  };
};

/**
 * Cria uma partida de duplas do Super 8
 */
const makeMatch = (
  id: string,
  a1: TournamentEntry,
  pa: TournamentEntry,
  b1: TournamentEntry,
  pb: TournamentEntry,
  scores: string,
  pair1Wins: boolean
): TournamentMatch => ({
  id,
  status: 'finished',
  categoryId: 'cat1',
  matchNumber: Number(id.replace(/\D/g, '')) || 1,
  matchCode: id,
  phase: 'rodada1',
  result: scores,
  pair1Id: `pair_${id}_1`,
  pair2Id: `pair_${id}_2`,
  pair1: { id: `pair_${id}_1`, p1: a1, p2: pa },
  pair2: { id: `pair_${id}_2`, p1: b1, p2: pb },
  winnerPairId: pair1Wins ? `pair_${id}_1` : `pair_${id}_2`,
});

describe('S8-T01 - Confronto Direto entre 2 atletas empatados em vitórias', () => {
  it('desempata por confronto direto quando há vitória clara no H2H entre os 2 empatados', () => {
    const a = makeEntry('Ana');
    const b = makeEntry('Bruno');
    const c = makeEntry('Carlos');
    const d = makeEntry('Diego');

    // Parceiros flutuantes (não inscritos nos entries do torneio)
    const p1 = makeEntry('P1');
    const p2 = makeEntry('P2');
    const p3 = makeEntry('P3');
    const p4 = makeEntry('P4');

    const entries = [a, b, c, d];

    // C vence A (6/4)
    // D vence A (6/4)
    // A vence B (6/4) -> Confronto direto entre A e B!
    // B vence C (6/4)
    // D vence B (6/4)
    // C vence D (6/4)
    //
    // C: 2 vitórias (vs A, vs D)
    // D: 2 vitórias (vs A, vs B)
    // A: 1 vitória (vs B), 2 derrotas (vs C, vs D)
    // B: 1 vitória (vs C), 2 derrotas (vs A, vs D)
    // A e B estão empatados com 1 vitória cada!
    // H2H entre A e B: A venceu B por 6/4!
    const matches: TournamentMatch[] = [
      makeMatch('m1', c, p1, a, p2, '6/4', true),
      makeMatch('m2', d, p1, a, p2, '6/4', true),
      makeMatch('m3', a, p1, b, p2, '6/4', true),
      makeMatch('m4', b, p1, c, p2, '6/4', true),
      makeMatch('m5', d, p1, b, p2, '6/4', true),
      makeMatch('m6', c, p1, d, p2, '6/4', true),
    ];

    const standings = calculateSuper8PlayerStandings(entries, matches, 'wins');

    const aS = standings.find((s) => s.entry.name === 'Ana')!;
    const bS = standings.find((s) => s.entry.name === 'Bruno')!;

    expect(aS.wins).toBe(1);
    expect(bS.wins).toBe(1);

    // Ana deve estar à frente de Bruno por ter vencido o confronto direto
    expect(aS.rank).toBeLessThan(bS.rank!);
    expect(aS.tieBreakNote).toBe('Desempate por confronto direto');
    expect(bS.tieBreakNote).toBe('Desempate por confronto direto');
    expect(aS.isTechnicalTie).toBe(false);
    expect(bS.isTechnicalTie).toBe(false);
  });
});

describe('S8-T02 - Empate Técnico entre 2 atletas com números 100% idênticos', () => {
  it('marca empate técnico, nota informativa e compartilha o mesmo rank quando stats são idênticos', () => {
    const a = makeEntry('PlayerA');
    const b = makeEntry('PlayerB');
    const c = makeEntry('PlayerC');

    const pX = makeEntry('ParceiroX');
    const pY = makeEntry('ParceiroY');

    const entries = [a, b, c];

    // A e B jogam entre si 2 vezes (1 vitória cada, com 6x4 e 4x6) -> H2H rigorosamente empatado: 1-1, games 10-10
    // Ambos perdem para C por 4x6
    //
    // A: 1 vitória, 2 derrotas; gamesWon = 6 + 4 + 4 = 14; gamesLost = 4 + 6 + 6 = 16; saldo = -2
    // B: 1 vitória, 2 derrotas; gamesWon = 4 + 6 + 4 = 14; gamesLost = 6 + 4 + 6 = 16; saldo = -2
    // C: 2 vitórias, 0 derrotas -> 1º lugar
    //
    // Todos os critérios matemáticos entre A e B são RIGOROSAMENTE idênticos!
    const matches: TournamentMatch[] = [
      makeMatch('m1', a, pX, b, pY, '6/4', true),  // A vence B (6/4)
      makeMatch('m2', b, pX, a, pY, '6/4', true),  // B vence A (6/4)
      makeMatch('m3', c, pX, a, pY, '6/4', true),  // C vence A (6/4)
      makeMatch('m4', c, pX, b, pY, '6/4', true),  // C vence B (6/4)
    ];

    const standings = calculateSuper8PlayerStandings(entries, matches, 'wins');

    const aS = standings.find((s) => s.entry.name === 'PlayerA')!;
    const bS = standings.find((s) => s.entry.name === 'PlayerB')!;
    const cS = standings.find((s) => s.entry.name === 'PlayerC')!;

    // Carlos é 1º colocado
    expect(cS.rank).toBe(1);

    // PlayerA e PlayerB possuem números 100% idênticos
    expect(aS.wins).toBe(bS.wins);
    expect(aS.losses).toBe(bS.losses);
    expect(aS.gamesWon).toBe(bS.gamesWon);
    expect(aS.gamesLost).toBe(bS.gamesLost);
    expect(aS.gamesDiff).toBe(bS.gamesDiff);

    // Ambos devem ser marcados com Empate Técnico
    expect(aS.isTechnicalTie).toBe(true);
    expect(bS.isTechnicalTie).toBe(true);
    expect(aS.isTiedWithOthers).toBe(true);
    expect(bS.isTiedWithOthers).toBe(true);

    // O rank DEVE ser compartilhado (ambos 2º lugar)
    expect(aS.rank).toBe(2);
    expect(bS.rank).toBe(2);

    // Nota de desempate deve explicitar o Empate Técnico
    expect(aS.tieBreakNote).toBe('Empate técnico (critérios matemáticos iguais)');
    expect(bS.tieBreakNote).toBe('Empate técnico (critérios matemáticos iguais)');
  });

  it('NÃO gera empate técnico quando saldo de games é diferente', () => {
    const a = makeEntry('Ana');
    const b = makeEntry('Bruno');
    const c = makeEntry('Carlos');
    const pX = makeEntry('PX');
    const pY = makeEntry('PY');

    const entries = [a, b, c];

    // Ana e Bruno nunca se enfrentaram diretamente, mas ambos têm 1 vitória
    // Ana venceu C por 6/1 (+5 saldo)
    // Bruno venceu C por 6/4 (+2 saldo)
    // Ana perdeu de C por 4/6 (-2 saldo) -> Ana saldo total: +3
    // Bruno perdeu de C por 1/6 (-5 saldo) -> Bruno saldo total: -3
    const matches: TournamentMatch[] = [
      makeMatch('m1', a, pX, c, pY, '6/1', true),
      makeMatch('m2', c, pX, a, pY, '6/4', true),
      makeMatch('m3', b, pX, c, pY, '6/4', true),
      makeMatch('m4', c, pX, b, pY, '6/1', true),
    ];

    const standings = calculateSuper8PlayerStandings(entries, matches, 'wins');
    const aS = standings.find((s) => s.entry.name === 'Ana')!;
    const bS = standings.find((s) => s.entry.name === 'Bruno')!;

    expect(aS.wins).toBe(1);
    expect(bS.wins).toBe(1);
    expect(aS.gamesDiff).toBe(3);
    expect(bS.gamesDiff).toBe(-3);

    // Classificação simples por Saldo de Games (sem nota de desempate pois o saldo é diferente)
    expect(aS.rank).toBeLessThan(bS.rank!);
    expect(aS.isTechnicalTie).toBeFalsy();
    expect(bS.isTechnicalTie).toBeFalsy();
    expect(aS.tieBreakNote).toBeUndefined();
    expect(bS.tieBreakNote).toBeUndefined();
  });
});

describe('S8-T03 - Desempate em grupo de 3 atletas por Saldo de Games', () => {
  it('separa 3 atletas com vitórias iguais pelo saldo de games decrescente', () => {
    const a = makeEntry('Ana');
    const b = makeEntry('Bruno');
    const c = makeEntry('Carlos');
    const pX = makeEntry('PX');
    const pY = makeEntry('PY');

    const entries = [a, b, c];

    // Todos com 1 vitória e 1 derrota (ciclo):
    // A vence B: 7/1 (A diff: +6, B diff: -6)
    // B vence C: 6/4 (B diff: +2, C diff: -2)
    // C vence A: 6/5 (C diff: +1, A diff: -1)
    //
    // A saldo: +5
    // C saldo: -1
    // B saldo: -4
    const matches: TournamentMatch[] = [
      makeMatch('m1', a, pX, b, pY, '7/1', true),
      makeMatch('m2', b, pX, c, pY, '6/4', true),
      makeMatch('m3', c, pX, a, pY, '6/5', true),
    ];

    const standings = calculateSuper8PlayerStandings(entries, matches, 'wins');

    const aS = standings.find((s) => s.entry.name === 'Ana')!;
    const cS = standings.find((s) => s.entry.name === 'Carlos')!;
    const bS = standings.find((s) => s.entry.name === 'Bruno')!;

    expect(aS.rank).toBe(1);
    expect(cS.rank).toBe(2);
    expect(bS.rank).toBe(3);

    // Como os saldos são diferentes (+5, -1, -4), a classificação é simples e direta
    expect(aS.tieBreakNote).toBeUndefined();
    expect(cS.tieBreakNote).toBeUndefined();
    expect(bS.tieBreakNote).toBeUndefined();
  });
});

describe('S8-T04 - Regressão: Cenário do Bug do Usuário (2 atletas empatados em grupo maior)', () => {
  /**
   * Cenário idêntico à imagem reportada:
   * Em um grupo de atletas com o mesmo número de vitórias:
   * - 1 atleta tem saldo superior (+12) e fica em 2º lugar isolado por Saldo de Games
   * - 2 atletas (Sup8F_D_001 e Sup8F_D_002) possuem EXATAMENTE os mesmos números:
   *   4 vitórias, 2 derrotas, saldo +8 (25 - 17)
   *
   * Bug anterior:
   *   Sup8F_D_001 recebia rank 2 com "Desempate por Saldo de Games: +8 (25 - 17)"
   *   Sup8F_D_002 recebia rank 3 com "Desempate por Saldo de Games: +8 (25 - 17)"
   *   (absurdo: afirmava desempate por saldo quando ambos tinham o mesmo saldo!)
   *
   * Comportamento corrigido:
   *   - O atleta com saldo +12 recebe rank 2 e nota de Saldo de Games
   *   - Sup8F_D_001 e Sup8F_D_002 NÃO recebem nota de desempate por saldo entre si
   *   - Sup8F_D_001 e Sup8F_D_002 são marcados com Empate Técnico
   *   - Ambos compartilham o mesmo rank (ambos 3º lugar)!
   */
  it('reconhece empate técnico entre dois atletas com números idênticos dentro de um grupo com 4 vitórias', () => {
    const top = makeEntry('TopLeader');
    const pBetter = makeEntry('BetterSaldo');
    const p1 = makeEntry('Sup8F_D_001');
    const p2 = makeEntry('Sup8F_D_002');
    const lower = makeEntry('LowerPlayer');

    const pX = makeEntry('PX');
    const pY = makeEntry('PY');

    const entries = [top, pBetter, p1, p2, lower];

    // TopLeader vence 5 partidas (1º isolado)
    // BetterSaldo, Sup8F_D_001 e Sup8F_D_002 terminam todos com 2 vitórias:
    // - BetterSaldo tem saldo +8 (18 - 10)
    // - Sup8F_D_001 tem saldo +2 (14 - 12)
    // - Sup8F_D_002 tem saldo +2 (14 - 12)
    // - Sup8F_D_001 e Sup8F_D_002 empatam entre si no H2H (1 vitória cada, placar 5/5)
    const matches: TournamentMatch[] = [
      // TopLeader vence todos
      makeMatch('m1', top, pX, pBetter, pY, '6/2', true),
      makeMatch('m2', top, pX, p1, pY, '6/2', true),
      makeMatch('m3', top, pX, p2, pY, '6/2', true),
      makeMatch('m4', top, pX, lower, pY, '6/0', true),

      // BetterSaldo vence lower duas vezes com placar elástico
      makeMatch('m5', pBetter, pX, lower, pY, '6/1', true),
      makeMatch('m6', pBetter, pX, lower, pY, '6/1', true),

      // p1 e p2 vencem lower por 5/1 cada
      makeMatch('m7', p1, pX, lower, pY, '5/1', true),
      makeMatch('m10', p2, pX, lower, pY, '5/1', true),

      // p1 e p2 jogam entre si 1-1 no H2H com mesmo placar
      makeMatch('m8', p1, pX, p2, pY, '5/5', true),
      makeMatch('m9', p2, pX, p1, pY, '5/5', true),
    ];

    const standings = calculateSuper8PlayerStandings(entries, matches, 'wins');

    const s1 = standings.find((s) => s.entry.name === 'Sup8F_D_001')!;
    const s2 = standings.find((s) => s.entry.name === 'Sup8F_D_002')!;
    const sBetter = standings.find((s) => s.entry.name === 'BetterSaldo')!;

    // BetterSaldo, p1 e p2 têm todos 2 vitórias
    expect(sBetter.wins).toBe(2);
    expect(s1.wins).toBe(2);
    expect(s2.wins).toBe(2);

    // BetterSaldo tem saldo superior e fica à frente com classificação simples (sem nota de desempate)
    expect(sBetter.gamesDiff).toBeGreaterThan(s1.gamesDiff);
    expect(sBetter.rank).toBeLessThan(s1.rank!);
    expect(sBetter.tieBreakNote).toBeUndefined();

    // p1 e p2 têm números idênticos
    expect(s1.gamesDiff).toBe(s2.gamesDiff);
    expect(s1.gamesWon).toBe(s2.gamesWon);
    expect(s1.gamesLost).toBe(s2.gamesLost);

    // p1 e p2 NÃO devem dizer que desempataram um contra o outro por Saldo de Games
    expect(s1.isTechnicalTie).toBe(true);
    expect(s2.isTechnicalTie).toBe(true);
    expect(s1.tieBreakNote).toBe('Empate técnico (critérios matemáticos iguais)');
    expect(s2.tieBreakNote).toBe('Empate técnico (critérios matemáticos iguais)');

    // Ambos devem compartilhar a mesma posição (mesmo rank)
    expect(s1.rank).toBe(s2.rank);
  });

  it('quando o saldo de games é diferente entre atletas com mesmas vitórias, classifica diretamente sem nota de desempate', () => {
    // Cenário das imagens enviadas pelo usuário:
    // Sup8F_D_002 e Sup8F_D_003 têm 5 vitórias, mas saldos +11 e +7
    // Sup8F_D_001 e Sup8F_D_004 têm 4 vitórias, mas saldos +5 e +1
    const p1 = makeEntry('Sup8F_D_001');
    const p2 = makeEntry('Sup8F_D_002');
    const p3 = makeEntry('Sup8F_D_003');
    const p4 = makeEntry('Sup8F_D_004');
    const pX = makeEntry('PX');
    const pY = makeEntry('PY');

    const entries = [p1, p2, p3, p4];

    // Simulando partidas para atingir saldos distintos
    const matches: TournamentMatch[] = [
      // p2 e p3 com 2 vitórias cada sobre p1 e p4, com placares diferentes
      makeMatch('m1', p2, pX, p1, pY, '6/1', true), // p2: +5
      makeMatch('m2', p2, pX, p4, pY, '6/2', true), // p2: +4 (total +9)
      makeMatch('m3', p3, pX, p1, pY, '6/3', true), // p3: +3
      makeMatch('m4', p3, pX, p4, pY, '6/4', true), // p3: +2 (total +5)
      // p1 vence p4
      makeMatch('m5', p1, pX, p4, pY, '6/3', true),
    ];

    const standings = calculateSuper8PlayerStandings(entries, matches, 'wins');

    const s2 = standings.find((s) => s.entry.name === 'Sup8F_D_002')!;
    const s3 = standings.find((s) => s.entry.name === 'Sup8F_D_003')!;

    // Ambos têm 2 vitórias, mas p2 tem saldo maior (+9 vs +5)
    expect(s2.wins).toBe(2);
    expect(s3.wins).toBe(2);
    expect(s2.gamesDiff).toBeGreaterThan(s3.gamesDiff);

    // Classificação simples sem nota de desempate
    expect(s2.rank).toBe(1);
    expect(s3.rank).toBe(2);
    expect(s2.tieBreakNote).toBeUndefined();
    expect(s3.tieBreakNote).toBeUndefined();
    expect(s2.isTechnicalTie).toBeFalsy();
    expect(s3.isTechnicalTie).toBeFalsy();
  });
});

describe('S8-T06 - Opções de Desempate Técnico: Alfabético, Sorteio e Rank Compartilhado', () => {
  const setupTiedMatchData = () => {
    const a = makeEntry('Beto Costa');
    const b = makeEntry('Alice Silva');
    const c = makeEntry('Carlos Top');
    const pX = makeEntry('ParceiroX');
    const pY = makeEntry('ParceiroY');

    const entries = [a, b, c];

    // Carlos vence ambos
    // Beto e Alice empatam rigorosamente em tudo
    const matches: TournamentMatch[] = [
      makeMatch('m1', c, pX, a, pY, '6/3', true),
      makeMatch('m2', c, pX, b, pY, '6/3', true),
      makeMatch('m3', a, pX, b, pY, '6/4', true),
      makeMatch('m4', b, pX, a, pY, '6/4', true),
    ];

    return { a, b, c, entries, matches };
  };

  it('quando technicalTieBreak é "Rank Compartilhado" (padrão), ambos recebem a mesma posição e nota explicativa', () => {
    const { entries, matches } = setupTiedMatchData();

    const standings = calculateSuper8PlayerStandings(entries, matches, {
      scoringMode: 'wins',
      technicalTieBreak: 'Rank Compartilhado',
    });

    const betoS = standings.find((s) => s.entry.name === 'Beto Costa')!;
    const aliceS = standings.find((s) => s.entry.name === 'Alice Silva')!;

    expect(betoS.rank).toBe(2);
    expect(aliceS.rank).toBe(2);
    expect(betoS.isTechnicalTie).toBe(true);
    expect(aliceS.isTechnicalTie).toBe(true);
    expect(betoS.tieBreakNote).toBe('Empate técnico (critérios matemáticos iguais)');
    expect(aliceS.tieBreakNote).toBe('Empate técnico (critérios matemáticos iguais)');
  });

  it('quando technicalTieBreak é "Alfabético", desempata pelo nome e atribui ranks sequenciais', () => {
    const { entries, matches } = setupTiedMatchData();

    const standings = calculateSuper8PlayerStandings(entries, matches, {
      scoringMode: 'wins',
      technicalTieBreak: 'Alfabético',
    });

    const betoS = standings.find((s) => s.entry.name === 'Beto Costa')!;
    const aliceS = standings.find((s) => s.entry.name === 'Alice Silva')!;

    // "Alice Silva" vem antes de "Beto Costa" no alfabeto
    expect(aliceS.rank).toBe(2);
    expect(betoS.rank).toBe(3);
    expect(aliceS.isTechnicalTie).toBe(false);
    expect(betoS.isTechnicalTie).toBe(false);
    expect(aliceS.tieBreakNote).toBe('Desempate por ordem alfabética');
    expect(betoS.tieBreakNote).toBe('Desempate por ordem alfabética');
  });

  it('quando technicalTieBreak é "Sorteio" sem indicação de ganhador, aguarda sorteio com rank compartilhado', () => {
    const { entries, matches } = setupTiedMatchData();

    const standings = calculateSuper8PlayerStandings(entries, matches, {
      scoringMode: 'wins',
      technicalTieBreak: 'Sorteio',
      drawWinners: [],
    });

    const betoS = standings.find((s) => s.entry.name === 'Beto Costa')!;
    const aliceS = standings.find((s) => s.entry.name === 'Alice Silva')!;

    expect(betoS.rank).toBe(2);
    expect(aliceS.rank).toBe(2);
    expect(betoS.isTechnicalTie).toBe(true);
    expect(aliceS.isTechnicalTie).toBe(true);
    expect(betoS.tieBreakNote).toBe('Empate técnico (aguardando sorteio)');
    expect(aliceS.tieBreakNote).toBe('Empate técnico (aguardando sorteio)');
  });

  it('quando technicalTieBreak é "Sorteio" e o ganhador é apontado, atualiza a classificação com ranks distintos', () => {
    const { a, b, entries, matches } = setupTiedMatchData();

    // Administrador aponta Beto Costa (PIN do atleta a) como ganhador do sorteio
    const standings = calculateSuper8PlayerStandings(entries, matches, {
      scoringMode: 'wins',
      technicalTieBreak: 'Sorteio',
      drawWinners: [a.pin],
    });

    const betoS = standings.find((s) => s.entry.name === 'Beto Costa')!;
    const aliceS = standings.find((s) => s.entry.name === 'Alice Silva')!;

    // Beto venceu o sorteio manual -> 2º lugar
    // Alice perdeu o sorteio manual -> 3º lugar
    expect(betoS.rank).toBe(2);
    expect(aliceS.rank).toBe(3);
    expect(betoS.isTechnicalTie).toBe(false);
    expect(aliceS.isTechnicalTie).toBe(false);
    expect(betoS.tieBreakNote).toBe('Desempate por sorteio (ganhador do sorteio)');
    expect(aliceS.tieBreakNote).toBe('Desempate por sorteio');
  });

  it('suporta múltiplos grupos de empate técnico na mesma categoria (ex: 2 atletas em 1º e 3 em 3º)', () => {
    // Grupo 1: dois atletas com 2 vitórias e mesmo saldo
    const p1A = makeEntry('Líder A');
    const p1B = makeEntry('Líder B');

    // Grupo 2: três atletas com 1 vitória e mesmo saldo
    const p3A = makeEntry('Terceiro A');
    const p3B = makeEntry('Terceiro B');
    const p3C = makeEntry('Terceiro C');

    const pX = makeEntry('PX');
    const pY = makeEntry('PY');

    const entries = [p1A, p1B, p3A, p3B, p3C];

    const matches: TournamentMatch[] = [
      // p1A e p1B têm 3 vitórias cada e empatam rigorosamente entre si no H2H (1-1, 10-10 games)
      makeMatch('m1', p1A, pX, pY, pY, '6/0', true),
      makeMatch('m2', p1A, pX, pY, pY, '6/0', true),
      makeMatch('m3', p1B, pX, pY, pY, '6/0', true),
      makeMatch('m4', p1B, pX, pY, pY, '6/0', true),
      makeMatch('m01', p1A, pX, p1B, pY, '6/4', true),
      makeMatch('m02', p1B, pX, p1A, pY, '6/4', true),

      // p3A, p3B, p3C têm 2 vitórias cada e empatam rigorosamente entre si no H2H
      makeMatch('m5', p3A, pX, p3B, pY, '6/4', true),
      makeMatch('m6', p3B, pX, p3A, pY, '6/4', true),
      makeMatch('m7', p3B, pX, p3C, pY, '6/4', true),
      makeMatch('m8', p3C, pX, p3B, pY, '6/4', true),
      makeMatch('m9', p3C, pX, p3A, pY, '6/4', true),
      makeMatch('m10', p3A, pX, p3C, pY, '6/4', true),
    ];

    // Admin aponta Líder B para o 1º lugar, e a ordem para o 3º lugar: p3C, depois p3A
    const standings = calculateSuper8PlayerStandings(entries, matches, {
      scoringMode: 'wins',
      technicalTieBreak: 'Sorteio',
      drawWinners: [p1B.pin, p3C.pin, p3A.pin],
    });

    const s1A = standings.find((s) => s.entry.name === 'Líder A')!;
    const s1B = standings.find((s) => s.entry.name === 'Líder B')!;
    const s3A = standings.find((s) => s.entry.name === 'Terceiro A')!;
    const s3B = standings.find((s) => s.entry.name === 'Terceiro B')!;
    const s3C = standings.find((s) => s.entry.name === 'Terceiro C')!;

    // Grupo do 1º lugar:
    expect(s1B.rank).toBe(1);
    expect(s1A.rank).toBe(2);
    expect(s1B.tieBreakNote).toBe('Desempate por sorteio (ganhador do sorteio)');
    expect(s1A.tieBreakNote).toBe('Desempate por sorteio');

    // Grupo do 3º lugar:
    expect(s3C.rank).toBe(3);
    expect(s3A.rank).toBe(4);
    expect(s3B.rank).toBe(5);
    expect(s3C.tieBreakNote).toBe('Desempate por sorteio (ganhador do sorteio)');
    expect(s3A.tieBreakNote).toBe('Desempate por sorteio');
    expect(s3B.tieBreakNote).toBe('Desempate por sorteio');
  });
});
