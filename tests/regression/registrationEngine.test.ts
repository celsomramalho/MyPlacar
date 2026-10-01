/**
 * Fase 1 – Testes de Regressão: Inscrições de Torneio (Tournament Registration Engine)
 *
 * Objetivo: Capturar e blindar com testes automatizados as regras de negócio
 * de preços, vagas, duplas e períodos de inscrição antes da modularização do domínio.
 *
 * Cobertura:
 *   R-T01  Cálculo de preço para evento gratuito (taxa zero)
 *   R-T02  Cálculo de preço com 1 categoria (apenas taxa base)
 *   R-T03  Cálculo de preço com 2 ou mais categorias (taxa base + taxas adicionais)
 *   R-T04  Cálculo de saldo devedor pendente descontando pagamentos parciais
 *   R-T05  Capacidade da categoria: limite padrão 8 quando não configurado
 *   R-T06  Capacidade da categoria: prioridade do limite específico da categoria
 *   R-T07  Vagas esgotadas: bloqueio quando inscritos confirmados atingem o limite
 *   R-T08  Regra de Dupla Mista: mulher é sempre p1 e homem é p2 (orderPairEntriesForMixed)
 *   R-T09  Regra de Dupla Mista: ordem inalterada se já estiver mulher em p1
 *   R-T10  Período de inscrição: 'not_started' antes da data inicial
 *   R-T11  Período de inscrição: 'open' dentro do intervalo
 *   R-T12  Período de inscrição: 'closed' após a data final
 *   R-T13  Período de inscrição: evento inativo retorna 'closed'
 *   R-T14  Check-in de participante: validado na data do torneio
 *   R-T15  ID sequencial de inscrição: incremento único a partir dos existentes
 */

import { describe, it, expect } from 'vitest';
import {
  orderPairEntriesForMixed,
  formatRegistrationId,
  getNextRegistrationId,
  type TournamentEvent,
  type TournamentEntry,
  type EventCategory,
  type PaymentItem,
} from '../../src/modules/events/types';
import {
  getRegistrationPeriodStatus,
  isRegistrationPeriodOpen,
  isTournamentPeriodActive,
  isEntryCheckedInToday,
  getTodayDateStr,
} from '../../src/modules/events/services/eventRegistrationPeriod';

// ─── Helpers de Teste ────────────────────────────────────────────────────────

const makeEntry = (overrides: Partial<TournamentEntry> = {}): TournamentEntry => ({
  email: 'atleta@teste.com',
  name: 'Atleta Teste',
  nickname: 'Atleta',
  pin: '1234',
  gender: 'M',
  categoryIds: ['cat1'],
  joinedAt: Date.now(),
  shirtSize: 'M',
  phone: '11999999999',
  checkedIn: false,
  disabled: false,
  disabledReason: '',
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

import {
  calculateRegistrationPrice,
  calculatePendingBalance,
  calculateCategoryVacancy,
  buildCategoryConfirmedCountMap,
  validateCategoryPartner,
} from '../../src/modules/events/domain/registration';

// ─── Grupo 1: Regras Financeiras e Tarifação (Pricing) ───────────────────────

describe('R-T01 a R-T04 – Cálculo de Preço e Saldo Devedor', () => {
  it('R-T01: evento com taxa zero retorna valor zero e isFree=true', () => {
    const event = { registrationFee: 0, extraCategoryFee: 0 };
    const price = calculateRegistrationPrice(['cat1', 'cat2'], event);

    expect(price.dueAmount).toBe(0);
    expect(price.isFree).toBe(true);
  });

  it('R-T02: inscrição em 1 categoria cobra exatamente a taxa base', () => {
    const event = { registrationFee: 100, extraCategoryFee: 50 };
    const price = calculateRegistrationPrice(['cat1'], event);

    expect(price.dueAmount).toBe(100);
    expect(price.isFree).toBe(false);
  });

  it('R-T03: inscrição em múltiplas categorias soma taxa base + taxas extras', () => {
    const event = { registrationFee: 120, extraCategoryFee: 60 };

    // 2 categorias: 120 + 1 * 60 = 180
    const price2 = calculateRegistrationPrice(['cat1', 'cat2'], event);
    expect(price2.dueAmount).toBe(180);

    // 3 categorias: 120 + 2 * 60 = 240
    const price3 = calculateRegistrationPrice(['cat1', 'cat2', 'cat3'], event);
    expect(price3.dueAmount).toBe(240);
  });

  it('R-T04: calcula corretamente o saldo pendente após pagamentos parciais', () => {
    const dueAmount = 240;
    const payments: PaymentItem[] = [
      { id: 'pay1', amount: 100, date: '2026-09-01', method: 'pix', status: 'Confirmado' },
      { id: 'pay2', amount: 40, date: '2026-09-02', method: 'pix', status: 'Confirmado' },
      { id: 'pay3', amount: 100, date: '2026-09-03', method: 'pix', status: 'Pendente' }, // Não deve somar
    ];

    const balance = calculatePendingBalance(dueAmount, payments);
    expect(balance.totalPaid).toBe(140);
    expect(balance.pendingAmount).toBe(100);
    expect(balance.isFullyPaid).toBe(false);

    // Quando quita o restante
    const fullPayments: PaymentItem[] = [
      ...payments.slice(0, 2),
      { id: 'pay4', amount: 100, date: '2026-09-04', method: 'pix', status: 'Confirmado' },
    ];
    const fullBalance = calculatePendingBalance(dueAmount, fullPayments);
    expect(fullBalance.pendingAmount).toBe(0);
    expect(fullBalance.isFullyPaid).toBe(true);
  });
});

// ─── Grupo 2: Capacidade e Vagas por Categoria (Vacancy) ────────────────────

describe('R-T05 a R-T07 – Controle de Vagas por Categoria', () => {
  it('R-T05: utiliza o padrão de 8 atletas quando não há limite definido na categoria ou evento', () => {
    const cat = makeCategory({ id: 'cat1', maxPlayers: undefined });
    const event = { maxPlayersPerCategory: undefined };

    const vacancy = calculateCategoryVacancy(cat, event, 3);
    expect(vacancy.limit).toBe(8);
    expect(vacancy.remaining).toBe(5);
    expect(vacancy.isFull).toBe(false);
  });

  it('R-T06: respeita o limite específico configurado na categoria sobre o global do evento', () => {
    const cat = makeCategory({ id: 'cat1', maxPlayers: 16 });
    const event = { maxPlayersPerCategory: 8 };

    const vacancy = calculateCategoryVacancy(cat, event, 10);
    expect(vacancy.limit).toBe(16);
    expect(vacancy.remaining).toBe(6);
    expect(vacancy.isFull).toBe(false);
  });

  it('R-T07: bloqueia novas inscrições quando a categoria atinge a capacidade máxima', () => {
    const cat = makeCategory({ id: 'cat1', maxPlayers: 8 });
    const event = { maxPlayersPerCategory: 8 };

    // Novo inscrito tentando entrar com 8 já confirmados
    const fullVacancy = calculateCategoryVacancy(cat, event, 8, false);
    expect(fullVacancy.isFull).toBe(true);
    expect(fullVacancy.remaining).toBe(0);

    // Atleta que já estava inscrito editando seus dados não deve ser bloqueado
    const existingVacancy = calculateCategoryVacancy(cat, event, 8, true);
    expect(existingVacancy.isFull).toBe(false);
  });
});

// ─── Grupo 3: Regras de Duplas e Pareamento (Pairing) ─────────────────────────

describe('R-T08 e R-T09 – Pareamento e Duplas Mistas', () => {
  it('R-T08: inverte a ordem para que a mulher (F) seja sempre p1 e o homem (M) seja p2', () => {
    const homem = makeEntry({ name: 'Carlos', gender: 'M' });
    const mulher = makeEntry({ name: 'Beatriz', gender: 'F' });

    // Homem passado como primeiro e mulher como segunda
    const [p1, p2] = orderPairEntriesForMixed(homem, mulher);

    expect(p1.name).toBe('Beatriz');
    expect(p1.gender).toBe('F');
    expect(p2.name).toBe('Carlos');
    expect(p2.gender).toBe('M');
  });

  it('R-T09: mantém a ordem inalterada se a mulher já estiver na primeira posição', () => {
    const mulher = makeEntry({ name: 'Beatriz', gender: 'F' });
    const homem = makeEntry({ name: 'Carlos', gender: 'M' });

    const [p1, p2] = orderPairEntriesForMixed(mulher, homem);

    expect(p1.name).toBe('Beatriz');
    expect(p2.name).toBe('Carlos');
  });

  it('mantém a ordem inalterada para duplas do mesmo gênero (M/M ou F/F)', () => {
    const homem1 = makeEntry({ name: 'Carlos', gender: 'M' });
    const homem2 = makeEntry({ name: 'Daniel', gender: 'M' });

    const [p1, p2] = orderPairEntriesForMixed(homem1, homem2);
    expect(p1.name).toBe('Carlos');
    expect(p2.name).toBe('Daniel');
  });

  it('validateCategoryPartner valida categoria mista exigindo homem e mulher', () => {
    const catMista = makeCategory({ id: 'mista', name: 'Duplas Mistas B', format: 'Duplas', gender1: 'M', gender2: 'F' });

    // Homem com Mulher -> Válido
    const validResult = validateCategoryPartner(catMista, 'M', 'F');
    expect(validResult.isValid).toBe(true);
    expect(validResult.isMixedPair).toBe(true);

    // Homem com Homem em mista -> Inválido
    const invalidResult = validateCategoryPartner(catMista, 'M', 'M');
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errorMessage).toContain('mista');
  });

  it('validateCategoryPartner valida categoria feminina exigindo duas mulheres', () => {
    const catFem = makeCategory({ id: 'fem', name: 'Duplas Femininas', format: 'Duplas', gender1: 'F', gender2: 'F' });

    expect(validateCategoryPartner(catFem, 'F', 'F').isValid).toBe(true);
    expect(validateCategoryPartner(catFem, 'F', 'M').isValid).toBe(false);
  });
});

// ─── Grupo 4: Validação do Período de Inscrição e Check-in ───────────────────

describe('R-T10 a R-T14 – Períodos de Inscrição e Check-in', () => {
  it('R-T10: retorna "not_started" se a data atual for anterior ao startDate', () => {
    const event = {
      active: true,
      startDate: '2026-10-15',
      endDate: '2026-10-25',
    };
    // Simulando data 2026-09-30 (antes de 15/10)
    const fixedNow = new Date('2026-09-30T12:00:00');
    const result = getRegistrationPeriodStatus(event, fixedNow);

    expect(result.status).toBe('not_started');
    expect(result.isOpen).toBe(false);
    expect(result.message).toContain('15/10/2026');
  });

  it('R-T11: retorna "open" quando a data atual estiver no intervalo', () => {
    const event = {
      active: true,
      startDate: '2026-09-01',
      endDate: '2026-10-15',
    };
    const fixedNow = new Date('2026-09-30T12:00:00');
    const result = getRegistrationPeriodStatus(event, fixedNow);

    expect(result.status).toBe('open');
    expect(result.isOpen).toBe(true);
    expect(isRegistrationPeriodOpen(event, fixedNow)).toBe(true);
  });

  it('R-T12: retorna "closed" quando a data atual for posterior ao endDate', () => {
    const event = {
      active: true,
      startDate: '2026-08-01',
      endDate: '2026-09-15',
    };
    const fixedNow = new Date('2026-09-30T12:00:00');
    const result = getRegistrationPeriodStatus(event, fixedNow);

    expect(result.status).toBe('closed');
    expect(result.isOpen).toBe(false);
  });

  it('R-T13: evento inativo sempre retorna closed', () => {
    const event = {
      active: false,
      startDate: '2026-09-01',
      endDate: '2026-10-15',
    };
    const result = getRegistrationPeriodStatus(event);
    expect(result.isOpen).toBe(false);
    expect(result.status).toBe('closed');
  });

  it('R-T14: verifica se o check-in diário do participante está registrado para hoje', () => {
    const today = getTodayDateStr();
    const entryCheckedToday = makeEntry({
      checkedIn: true,
      checkInDates: [today],
    });
    expect(isEntryCheckedInToday(entryCheckedToday)).toBe(true);

    const entryCheckedPast = makeEntry({
      checkedIn: true,
      checkInDates: ['2026-09-01'],
    });
    expect(isEntryCheckedInToday(entryCheckedPast)).toBe(false);
  });
});

// ─── Grupo 5: Identificador Sequencial ───────────────────────────────────────

describe('R-T15 – Geração de IDs Sequenciais de Inscrição', () => {
  it('getNextRegistrationId retorna 1 quando a lista de inscritos está vazia', () => {
    expect(getNextRegistrationId([])).toBe(1);
  });

  it('getNextRegistrationId incrementa a partir do maior número existente', () => {
    const entries = [
      makeEntry({ registrationId: 5 }),
      makeEntry({ registrationId: 12 }),
      makeEntry({ registrationId: 3 }),
    ];
    expect(getNextRegistrationId(entries)).toBe(13);
  });

  it('formatRegistrationId formata com 4 dígitos com padding', () => {
    expect(formatRegistrationId(1)).toBe('0001');
    expect(formatRegistrationId(42)).toBe('0042');
    expect(formatRegistrationId(105)).toBe('0105');
  });
});

// ─── Grupo 6: Filtragem por Gênero e Formação Manual ─────────────────────────

describe('R-T16 e R-T17 – Filtragem de Categorias e Formação Manual', () => {
  const catMasc = makeCategory({ id: 'c1', name: 'Super 8 Masculino', gender1: 'M', gender2: 'M' });
  const catFem = makeCategory({ id: 'c2', name: 'Super 8 Feminino', gender1: 'F', gender2: 'F' });
  const catMista = makeCategory({ id: 'c3', name: 'Super 8 Misto', gender1: 'M', gender2: 'F' });
  const catLivre = makeCategory({ id: 'c4', name: 'Super 8 Livre' }); // Sem gender1/gender2

  const allCategories = [catMasc, catFem, catMista, catLivre];

  it('R-T16: atleta masculino não deve ter acesso à categoria feminina', () => {
    const playerGender = 'M';
    const available = allCategories.filter((cat) => {
      if (!cat.gender1 && !cat.gender2) return true;
      return cat.gender1 === playerGender || cat.gender2 === playerGender;
    });

    const ids = available.map((c) => c.id);
    expect(ids).toContain('c1'); // Masculino
    expect(ids).toContain('c3'); // Misto
    expect(ids).toContain('c4'); // Livre
    expect(ids).not.toContain('c2'); // Feminino bloqueado para homem!
  });

  it('R-T17: atleta feminina não deve ter acesso à categoria masculina', () => {
    const playerGender = 'F';
    const available = allCategories.filter((cat) => {
      if (!cat.gender1 && !cat.gender2) return true;
      return cat.gender1 === playerGender || cat.gender2 === playerGender;
    });

    const ids = available.map((c) => c.id);
    expect(ids).toContain('c2'); // Feminino
    expect(ids).toContain('c3'); // Misto
    expect(ids).toContain('c4'); // Livre
    expect(ids).not.toContain('c1'); // Masculino bloqueado para mulher!
  });
});

// ─── Grupo 7: Contagem de Vagas em Tempo Real e Eventos Gratuitos ───────────

describe('R-T18 a R-T20 – Mapeamento de Inscritos e Vagas em Eventos Gratuitos vs Pagos', () => {
  it('R-T18: evento gratuito conta todos os atletas inscritos não-cancelados como confirmados', () => {
    const entries: TournamentEntry[] = [
      makeEntry({ email: 'a1@test.com', categoryIds: ['cat1'], paymentStatus: undefined }),
      makeEntry({ email: 'a2@test.com', categoryIds: ['cat1'], paymentStatus: 'Pendente' }),
      makeEntry({ email: 'a3@test.com', categoryIds: ['cat1', 'cat2'], paymentStatus: 'Confirmado' }),
      makeEntry({ email: 'a4@test.com', categoryIds: ['cat1'], paymentStatus: 'Cancelado' }), // Ignorado
      makeEntry({ email: 'a5@test.com', categoryIds: ['cat1'], disabled: true }), // Ignorado
    ];

    const countMap = buildCategoryConfirmedCountMap(entries, true);
    expect(countMap['cat1']).toBe(3); // a1, a2, a3
    expect(countMap['cat2']).toBe(1); // a3
  });

  it('R-T19: evento pago conta apenas Confirmado, Pago e Isento', () => {
    const entries: TournamentEntry[] = [
      makeEntry({ email: 'a1@test.com', categoryIds: ['cat1'], paymentStatus: 'Confirmado' }),
      makeEntry({ email: 'a2@test.com', categoryIds: ['cat1'], paymentStatus: 'Pago' }),
      makeEntry({ email: 'a3@test.com', categoryIds: ['cat1'], paymentStatus: 'Isento' }),
      makeEntry({ email: 'a4@test.com', categoryIds: ['cat1'], paymentStatus: 'Pendente' }), // Ignorado
      makeEntry({ email: 'a5@test.com', categoryIds: ['cat1'], paymentStatus: 'Cancelado' }), // Ignorado
    ];

    const countMap = buildCategoryConfirmedCountMap(entries, false);
    expect(countMap['cat1']).toBe(3);
  });

  it('R-T20: categoria com 8 inscritos em evento gratuito esgota vagas (0 restantes, isFull=true)', () => {
    const cat = makeCategory({ id: 'super8', maxPlayers: 8 });
    const event = { maxPlayersPerCategory: 8, registrationFee: 0, extraCategoryFee: 0 };

    // 8 atletas inscritos
    const entries: TournamentEntry[] = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ email: `atleta${i}@test.com`, categoryIds: ['super8'] })
    );

    const isFree = (event.registrationFee ?? 0) === 0 && (event.extraCategoryFee ?? 0) === 0;
    const countMap = buildCategoryConfirmedCountMap(entries, isFree);
    expect(countMap['super8']).toBe(8);

    // Novo atleta tentando entrar
    const vacancy = calculateCategoryVacancy(cat, event, countMap['super8'], false);
    expect(vacancy.limit).toBe(8);
    expect(vacancy.confirmedCount).toBe(8);
    expect(vacancy.remaining).toBe(0);
    expect(vacancy.isFull).toBe(true);
  });
});

// ─── Grupo 8: Formação de Times Pré-definida e Dados do Parceiro ─────────────

describe('R-T21 e R-T22 – Detecção de Formação de Duplas e Validação de Parceiro', () => {
  const isPreDefinedDraw = (teamDrawType?: string): boolean => {
    const normalized = (teamDrawType || 'Manual')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return (
      normalized.includes('pre definida') ||
      normalized.includes('pre-definida') ||
      normalized.includes('pre_definida') ||
      normalized.includes('predefinida')
    );
  };

  it('R-T21: detecta corretamente formação "Pré definida" em suas variações', () => {
    expect(isPreDefinedDraw('Pré definida')).toBe(true);
    expect(isPreDefinedDraw('pre definida')).toBe(true);
    expect(isPreDefinedDraw('Pré-definida')).toBe(true);
    expect(isPreDefinedDraw('duplas pré-definidas')).toBe(true);
    expect(isPreDefinedDraw('Manual')).toBe(false);
    expect(isPreDefinedDraw('Sistema')).toBe(false);
    expect(isPreDefinedDraw(undefined)).toBe(false);
  });

  it('R-T22: em duplas pré-definidas, exige nome, email e whatsapp válidos', () => {
    const validatePartnerFields = (partner?: { name?: string; email?: string; phone?: string }) => {
      const cleanedPhone = (partner?.phone || '').replace(/\D/g, '');
      return Boolean(partner?.name?.trim() && partner?.email?.trim() && cleanedPhone);
    };

    // Parceiro com todos os campos preenchidos
    expect(validatePartnerFields({ name: 'João Silva', email: 'joao@email.com', phone: '(11) 98765-4321' })).toBe(true);

    // Faltando WhatsApp
    expect(validatePartnerFields({ name: 'João Silva', email: 'joao@email.com', phone: '' })).toBe(false);

    // Faltando E-mail
    expect(validatePartnerFields({ name: 'João Silva', email: '', phone: '11987654321' })).toBe(false);

    // Faltando Nome
    expect(validatePartnerFields({ name: '', email: 'joao@email.com', phone: '11987654321' })).toBe(false);
  });

  it('R-T23: botão "Formar time" só deve ser exibido quando parceiro está inscrito, não cancelado e nem emparelhado', () => {
    interface CanShowFormTeamParams {
      isSelfCancelled: boolean;
      hasOnFormTeam: boolean;
      partnerEntry?: { disabled?: boolean; paymentStatus?: string };
      existingPair?: unknown;
      partnerAlreadyPaired?: unknown;
    }

    const canShowFormTeam = ({
      isSelfCancelled,
      hasOnFormTeam,
      partnerEntry,
      existingPair,
      partnerAlreadyPaired,
    }: CanShowFormTeamParams) => {
      const isPartnerCancelled = Boolean(
        partnerEntry?.disabled || partnerEntry?.paymentStatus === 'Cancelado'
      );
      return Boolean(
        !isSelfCancelled &&
        hasOnFormTeam &&
        partnerEntry &&
        !isPartnerCancelled &&
        !existingPair &&
        !partnerAlreadyPaired
      );
    };

    // Caso ideal: parceiro inscrito, válido, sem par formado -> Deve exibir botão
    expect(
      canShowFormTeam({
        isSelfCancelled: false,
        hasOnFormTeam: true,
        partnerEntry: { disabled: false, paymentStatus: 'Confirmado' },
        existingPair: undefined,
        partnerAlreadyPaired: undefined,
      })
    ).toBe(true);

    // Parceiro não encontrado/não inscrito -> NÃO deve exibir
    expect(
      canShowFormTeam({
        isSelfCancelled: false,
        hasOnFormTeam: true,
        partnerEntry: undefined,
        existingPair: undefined,
        partnerAlreadyPaired: undefined,
      })
    ).toBe(false);

    // Parceiro com inscrição cancelada -> NÃO deve exibir
    expect(
      canShowFormTeam({
        isSelfCancelled: false,
        hasOnFormTeam: true,
        partnerEntry: { disabled: false, paymentStatus: 'Cancelado' },
        existingPair: undefined,
        partnerAlreadyPaired: undefined,
      })
    ).toBe(false);

    // Atleta já possui par formado nesta categoria -> NÃO deve exibir
    expect(
      canShowFormTeam({
        isSelfCancelled: false,
        hasOnFormTeam: true,
        partnerEntry: { disabled: false, paymentStatus: 'Confirmado' },
        existingPair: { id: 'pair_1' },
        partnerAlreadyPaired: undefined,
      })
    ).toBe(false);

    // Parceiro já está emparelhado com outro atleta -> NÃO deve exibir
    expect(
      canShowFormTeam({
        isSelfCancelled: false,
        hasOnFormTeam: true,
        partnerEntry: { disabled: false, paymentStatus: 'Confirmado' },
        existingPair: undefined,
        partnerAlreadyPaired: { id: 'pair_2' },
      })
    ).toBe(false);
  });

  it('R-T24: formação de time calcula teamNumber e teamCode sequencial corretamente', () => {
    const existingPairs = [
      { teamNumber: 1, teamCode: '001 - SUP8M' },
      { teamNumber: 2, teamCode: '002 - SUP8M' },
    ];

    const nextTeamNumber =
      Math.max(
        0,
        ...existingPairs.map(
          (p, i) => p.teamNumber || Number(p.teamCode?.match(/^\d{3}/)?.[0]) || i + 1
        )
      ) + 1;

    expect(nextTeamNumber).toBe(3);
    const teamCode = `${String(nextTeamNumber).padStart(3, '0')} - SUP8M`;
    expect(teamCode).toBe('003 - SUP8M');
  });
});

