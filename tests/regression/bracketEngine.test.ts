/**
 * Fase 1 - Testes de Regressao: Chaves, Times e Partidas de Evento
 *
 * Objetivo: capturar o comportamento atual de matchGenerator.ts e
 * matchProgression.ts antes de mover as regras para events/domain/brackets.
 */

import { describe, expect, it } from 'vitest';
import type {
  EventCategory,
  TournamentEntry,
  TournamentMatch,
  TournamentPair,
} from '../../src/modules/events/types';
import {
  createManualMatch,
  generateRoundRobinPairs,
  generateSystemMatchesForCategory,
  getNextMatchNumber,
  validateCategoryGenders,
} from '../../src/modules/events/services/matchGenerator';
import {
  buildPairsById,
  calculateBracketStandings,
  createTournamentPair,
  filterEntriesByParticipantSearch,
  findPairForEntry,
  getNextTeamNumber,
  getCategoryEntries,
  getCategoryMatches,
  getCategoryPairs,
  pairHasSameParticipants,
  parseMatchSets,
  parseScoresFromMatch,
  updatePlayoffProgression,
} from '../../src/modules/events/domain/brackets';

const makeEntry = (name: string, overrides: Partial<TournamentEntry> = {}): TournamentEntry => ({
  email: `${name.toLowerCase()}@teste.com`,
  name,
  nickname: name,
  pin: name.slice(0, 4).toUpperCase(),
  gender: 'M',
  categoryIds: ['cat1'],
  joinedAt: 0,
  shirtSize: 'M',
  phone: '',
  checkedIn: false,
  disabled: false,
  disabledReason: '',
  ...overrides,
});

const makePair = (
  id: string,
  teamNumber: number,
  bracket: 1 | 2,
  categoryId = 'cat1',
): TournamentPair => ({
  id,
  categoryId,
  teamNumber,
  teamCode: `${String(teamNumber).padStart(3, '0')} - CAT`,
  bracket,
  p1: makeEntry(`${id}A`),
  p2: makeEntry(`${id}B`, { gender: 'F' }),
});

const makeCategory = (overrides: Partial<EventCategory> = {}): EventCategory => ({
  id: 'cat1',
  name: 'Categoria Teste',
  format: 'Duplas',
  priority: 1,
  sportId: 'beach-tennis',
  abbreviation: 'CAT',
  gender1: 'M',
  gender2: 'F',
  ...overrides,
});

const makeMatch = (overrides: Partial<TournamentMatch> & { id: string }): TournamentMatch => ({
  id: overrides.id,
  status: 'waiting',
  categoryId: 'cat1',
  matchNumber: 1,
  matchCode: '01',
  phase: 'chave1',
  ...overrides,
});

describe('B-T01 - Parsing de placares', () => {
  it('interpreta placar unico no formato 6/4', () => {
    const match = makeMatch({
      id: 'm1',
      result: '6/4',
    });

    expect(parseScoresFromMatch(match)).toEqual({
      g1: 6,
      g2: 4,
      s1: 1,
      s2: 0,
    });
  });

  it('soma games e sets a partir de result textual com multiplos sets', () => {
    const match = makeMatch({
      id: 'm1',
      result: '6/4 4/6 10/8',
    });

    expect(parseScoresFromMatch(match)).toEqual({
      g1: 20,
      g2: 18,
      s1: 2,
      s2: 1,
    });
  });

  it('retorna zeros quando nao ha placar valido', () => {
    const match = makeMatch({
      id: 'm1',
      result: 'A definir',
    });

    expect(parseScoresFromMatch(match)).toEqual({
      g1: 0,
      g2: 0,
      s1: 0,
      s2: 0,
    });
  });

  it('prioriza scores estruturados sobre result textual', () => {
    const match = makeMatch({
      id: 'm1',
      result: '0/6',
      scores: [
        { p1: 7, p2: 5 },
        { p1: 6, p2: 4 },
      ],
    });

    expect(parseScoresFromMatch(match)).toEqual({
      g1: 13,
      g2: 9,
      s1: 2,
      s2: 0,
    });
  });

  it('ignora set em andamento ao contar sets vencidos de partida nao finalizada', () => {
    const match = makeMatch({
      id: 'm1',
      status: 'live',
      scores: [
        { p1: 6, p2: 4 },
        { p1: 3, p2: 2, inProgress: true },
      ],
    });

    const parsed = parseMatchSets(match, 3, 6);

    expect(parsed.setsWon1).toBe(1);
    expect(parsed.setsWon2).toBe(0);
    expect(parsed.scores).toHaveLength(3);
  });

  it('conta vencedor em melhor de tres sets finalizada', () => {
    const match = makeMatch({
      id: 'm1',
      status: 'finished',
      scores: [
        { p1: 6, p2: 4 },
        { p1: 4, p2: 6 },
        { p1: 10, p2: 8 },
      ],
    });

    const parsed = parseMatchSets(match, 3, 6);

    expect(parsed.setsWon1).toBe(2);
    expect(parsed.setsWon2).toBe(1);
  });
});

describe('B-T02 - Geracao e numeracao de partidas', () => {
  it('gera todos contra todos para todas as combinacoes de duplas', () => {
    const pairs = [
      makePair('p1', 1, 1),
      makePair('p2', 2, 1),
      makePair('p3', 3, 1),
    ];

    const matchups = generateRoundRobinPairs(pairs);

    expect(matchups.map(([a, b]) => `${a.id}-${b.id}`)).toEqual([
      'p1-p2',
      'p1-p3',
      'p2-p3',
    ]);
  });

  it('calcula o proximo numero de partida preservando partidas existentes', () => {
    const next = getNextMatchNumber([
      makeMatch({ id: 'm1', matchNumber: 1 }),
      makeMatch({ id: 'm7', matchNumber: 7 }),
      makeMatch({ id: 'm2', matchCode: '02', matchNumber: undefined }),
    ]);

    expect(next).toBe(8);
  });

  it('cria partida manual em chave quando as duplas estao no mesmo bracket', () => {
    const pair1 = makePair('p1', 1, 1);
    const pair2 = makePair('p2', 2, 1);
    const category = makeCategory();

    const match = createManualMatch(pair1, pair2, category, [
      makeMatch({ id: 'existing', matchNumber: 4 }),
    ]);

    expect(match.matchNumber).toBe(5);
    expect(match.matchCode).toBe('05');
    expect(match.phase).toBe('chave1');
    expect(match.pair1Id).toBe('p1');
    expect(match.pair2Id).toBe('p2');
  });

  it('gera grupos, semifinais, final e terceiro lugar para categoria com duas chaves', () => {
    const category = makeCategory();
    const pairs = [
      makePair('p1', 1, 1),
      makePair('p2', 2, 1),
      makePair('p3', 3, 2),
      makePair('p4', 4, 2),
    ];

    const matches = generateSystemMatchesForCategory(category, pairs);

    expect(matches.map((match) => match.phase)).toEqual([
      'chave1',
      'chave2',
      'semifinal',
      'semifinal',
      'final',
      '3lugar',
    ]);
    expect(matches.map((match) => match.matchCode)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(matches[2].pair1Label).toBe('1º chave1');
    expect(matches[2].pair2Label).toBe('2º chave2');
    expect(matches[4].pair1Label).toBe('Ganhador 03');
  });

  it('preserva a numeracao de partidas existentes de outras categorias', () => {
    const category = makeCategory({ id: 'cat2' });
    const pairs = [
      makePair('p1', 1, 1, 'cat2'),
      makePair('p2', 2, 1, 'cat2'),
    ];

    const matches = generateSystemMatchesForCategory(category, pairs, [
      makeMatch({ id: 'other', categoryId: 'cat1', matchNumber: 9, matchCode: '09' }),
      makeMatch({ id: 'same-cat-old', categoryId: 'cat2', matchNumber: 20, matchCode: '20' }),
    ]);

    expect(matches[0].matchNumber).toBe(10);
    expect(matches[0].matchCode).toBe('10');
  });
});

describe('B-T03 - Validacao e classificacao de chaves', () => {
  it('valida categoria mista exigindo um atleta masculino e uma feminina', () => {
    const category = makeCategory({ name: 'Dupla Mista B' });
    const homem = makeEntry('Carlos', { gender: 'M' });
    const mulher = makeEntry('Beatriz', { gender: 'F' });
    const outroHomem = makeEntry('Daniel', { gender: 'M' });

    expect(validateCategoryGenders(category, [homem, mulher])).toEqual({ valid: true });
    expect(validateCategoryGenders(category, [homem, outroHomem])).toEqual({
      valid: false,
      message: 'A categoria "Dupla Mista B" é mista e exige 1 atleta masculino e 1 jogadora feminina.',
    });
  });

  it('ordena standings por vitorias e saldo de games', () => {
    const p1 = makePair('p1', 1, 1);
    const p2 = makePair('p2', 2, 1);
    const p3 = makePair('p3', 3, 1);
    const matches = [
      makeMatch({
        id: 'm1',
        pair1Id: 'p1',
        pair2Id: 'p2',
        status: 'finished',
        winnerPairId: 'p1',
        scores: [{ p1: 6, p2: 2 }],
      }),
      makeMatch({
        id: 'm2',
        pair1Id: 'p1',
        pair2Id: 'p3',
        status: 'finished',
        winnerPairId: 'p3',
        scores: [{ p1: 5, p2: 7 }],
      }),
      makeMatch({
        id: 'm3',
        pair1Id: 'p2',
        pair2Id: 'p3',
        status: 'finished',
        winnerPairId: 'p2',
        scores: [{ p1: 6, p2: 4 }],
      }),
    ];

    const standings = calculateBracketStandings([p1, p2, p3], matches, 1);

    expect(standings.map((standing) => standing.pair.id)).toEqual(['p1', 'p3', 'p2']);
    expect(standings.map((standing) => standing.gamesDiff)).toEqual([2, 0, -2]);
    expect(standings.every((standing) => standing.isTiedWithOthers)).toBe(true);
  });
});

describe('B-T05 - Filtros de visao por categoria', () => {
  it('filtra inscricoes diretamente pelo id da categoria', () => {
    const cat1 = makeCategory();
    const cat2Entry = makeEntry('Bruno', { categoryIds: ['cat2'] });

    const entries = getCategoryEntries([makeEntry('Ana'), cat2Entry], cat1);

    expect(entries.map((entry) => entry.name)).toEqual(['Ana']);
  });

  it('filtra duplas por categoria e preserva fallback por inscricao quando habilitado', () => {
    const cat1 = makeCategory();
    const directPair = makePair('p1', 1, 1, 'cat1');
    const fallbackPair = {
      ...makePair('p2', 2, 1, 'cat3'),
      categoryId: undefined,
      p1: makeEntry('Fallback A', { categoryIds: ['cat1'] }),
      p2: makeEntry('Fallback B', { categoryIds: ['cat3'] }),
    };
    const otherPair = makePair('p3', 3, 1, 'cat3');

    expect(getCategoryPairs([directPair, fallbackPair, otherPair], cat1).map((pair) => pair.id)).toEqual([
      'p1',
      'p2',
    ]);
    expect(
      getCategoryPairs([directPair, fallbackPair, otherPair], cat1, {
        includeEntryCategoryFallback: false,
      }).map((pair) => pair.id)
    ).toEqual(['p1']);
  });

  it('filtra partidas por categoria e preserva fallback por dupla quando habilitado', () => {
    const cat1 = makeCategory();
    const catPair = makePair('p1', 1, 1, 'cat1');
    const otherPair = makePair('p2', 2, 1, 'cat2');
    const directMatch = makeMatch({ id: 'm1', categoryId: 'cat1', pair1Id: 'p1' });
    const fallbackMatch = makeMatch({
      id: 'm2',
      categoryId: undefined,
      pair1Id: 'p1',
      pair2Id: 'p2',
    });
    const otherMatch = makeMatch({ id: 'm3', categoryId: 'cat2', pair1Id: 'p2' });

    expect(
      getCategoryMatches([directMatch, fallbackMatch, otherMatch], [catPair, otherPair], cat1).map(
        (match) => match.id
      )
    ).toEqual(['m1', 'm2']);
    expect(
      getCategoryMatches([directMatch, fallbackMatch, otherMatch], [catPair, otherPair], cat1, {
        includePairCategoryFallback: false,
      }).map((match) => match.id)
    ).toEqual(['m1']);
  });

  it('monta mapa de duplas e localiza dupla por email ou pin normalizados', () => {
    const pair = {
      ...makePair('p1', 1, 1),
      p1: makeEntry('Ana', { email: 'ana@teste.com', pin: 'A001' }),
      p2: makeEntry('Bia', { email: 'bia@teste.com', pin: 'B002' }),
    };

    expect(buildPairsById([pair]).get('p1')).toBe(pair);
    expect(findPairForEntry(makeEntry('Busca Email', { email: ' ANA@TESTE.COM ' }), [pair])?.id).toBe('p1');
    expect(findPairForEntry(makeEntry('Busca Pin', { email: '', pin: ' b002 ' }), [pair])?.id).toBe('p1');
  });

  it('filtra participantes por nome ou apelido sem diferenciar maiusculas', () => {
    const entries = [
      makeEntry('Ana Clara', { nickname: 'AClara' }),
      makeEntry('Beatriz', { nickname: 'Bia Forte' }),
    ];

    expect(filterEntriesByParticipantSearch(entries, 'bia').map((entry) => entry.name)).toEqual([
      'Beatriz',
    ]);
    expect(filterEntriesByParticipantSearch(entries, '').map((entry) => entry.name)).toEqual([
      'Ana Clara',
      'Beatriz',
    ]);
  });
});

describe('B-T06 - Formacao de duplas', () => {
  it('detecta dupla ja formada independentemente da ordem dos participantes', () => {
    const pair = makePair('p1', 1, 1);

    expect(pairHasSameParticipants(pair, pair.p2, pair.p1)).toBe(true);
    expect(pairHasSameParticipants(pair, makeEntry('Outro'), pair.p1)).toBe(false);
  });

  it('calcula o proximo numero usando teamNumber, teamCode e fallback por indice', () => {
    expect(
      getNextTeamNumber([
        makePair('p1', 1, 1),
        { ...makePair('p2', 2, 1), teamNumber: undefined, teamCode: '009 - CAT' },
        { ...makePair('p3', 3, 1), teamNumber: undefined, teamCode: undefined },
      ])
    ).toBe(10);
  });

  it('cria dupla com codigo, categoria, bracket inicial e mulher como p1 quando mista', () => {
    const category = makeCategory({ abbreviation: 'MX' });
    const homem = makeEntry('Carlos', { gender: 'M' });
    const mulher = makeEntry('Bia', { gender: 'F' });
    const existing = [makePair('p1', 1, 1), makePair('p2', 2, 1)];

    const pair = createTournamentPair({
      first: homem,
      second: mulher,
      category,
      pairs: existing,
      categoryPairs: existing,
      id: 'pair_test',
    });

    expect(pair).toMatchObject({
      id: 'pair_test',
      categoryId: 'cat1',
      teamNumber: 3,
      teamCode: '003 - MX',
      bracket: 1,
      bracketOrder: 3,
    });
    expect(pair.p1.name).toBe('Bia');
    expect(pair.p2.name).toBe('Carlos');
  });
});

describe('B-T04 - Progressao de playoffs', () => {
  it('preenche semifinais quando as duas chaves terminam', () => {
    const category = makeCategory();
    const p1 = makePair('p1', 1, 1);
    const p2 = makePair('p2', 2, 1);
    const p3 = makePair('p3', 3, 2);
    const p4 = makePair('p4', 4, 2);
    const generated = generateSystemMatchesForCategory(category, [p1, p2, p3, p4]);
    const matches = generated.map((match) => {
      if (match.phase === 'chave1') {
        return { ...match, status: 'finished' as const, winnerPairId: 'p1', scores: [{ p1: 6, p2: 1 }] };
      }
      if (match.phase === 'chave2') {
        return { ...match, status: 'finished' as const, winnerPairId: 'p3', scores: [{ p1: 6, p2: 2 }] };
      }
      return match;
    });

    const progressed = updatePlayoffProgression([p1, p2, p3, p4], matches);
    const semifinals = progressed.filter((match) => match.phase === 'semifinal');

    expect(semifinals[0].pair1Id).toBe('p1');
    expect(semifinals[0].pair2Id).toBe('p4');
    expect(semifinals[1].pair1Id).toBe('p2');
    expect(semifinals[1].pair2Id).toBe('p3');
  });

  it('limpa final e terceiro lugar quando semifinais ainda nao terminaram', () => {
    const p1 = makePair('p1', 1, 1);
    const p2 = makePair('p2', 2, 1);
    const matches = [
      makeMatch({ id: 's1', phase: 'semifinal', matchNumber: 3, pair1Id: 'p1', pair2Id: 'p2' }),
      makeMatch({ id: 's2', phase: 'semifinal', matchNumber: 4, pair1Id: 'p2', pair2Id: 'p1' }),
      makeMatch({ id: 'f1', phase: 'final', matchNumber: 5, pair1Id: 'p1', pair2Id: 'p2' }),
      makeMatch({ id: 't1', phase: '3lugar', matchNumber: 6, pair1Id: 'p2', pair2Id: 'p1' }),
    ];

    const progressed = updatePlayoffProgression([p1, p2], matches);
    const final = progressed.find((match) => match.phase === 'final');
    const third = progressed.find((match) => match.phase === '3lugar');

    expect(final?.pair1Id).toBeUndefined();
    expect(final?.pair2Id).toBeUndefined();
    expect(final?.pair1Label).toBe('Ganhador 03');
    expect(third?.pair1Id).toBeUndefined();
    expect(third?.pair2Label).toBe('Perdedor 04');
  });
});
