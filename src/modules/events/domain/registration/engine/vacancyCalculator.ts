/**
 * Domínio: Inscrições de Torneio — Calculadora de Vagas e Capacidade (Vacancy Calculator)
 *
 * Funções puras para verificar disponibilidade de vagas por categoria,
 * respeitando o limite individual da categoria.
 *
 * @pure — sem efeitos colaterais.
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 2
 */

import type { TournamentEntry, EventCategory } from '@modules/events/types';
import type { CategoryVacancyResult } from '../types';

/**
 * Calcula a capacidade, inscritos e vagas restantes de uma categoria.
 *
 * Regras:
 * 1. Limite definido na categoria (`category.maxPlayers`), com padrão de 8 jogadores.
 * 2. Se o atleta já estava inscrito previamente nessa categoria (`isAlreadyEnrolled = true`),
 *    ele não é considerado bloqueado por "vagas esgotadas" ao editar seus dados.
 */
export function calculateCategoryVacancy(
  category: Pick<EventCategory, 'maxPlayers'>,
  occupiedEntriesCount: number,
  isAlreadyEnrolled = false
): CategoryVacancyResult {
  const limit = category.maxPlayers && category.maxPlayers > 0 ? category.maxPlayers : 8;
  const isFull = !isAlreadyEnrolled && occupiedEntriesCount >= limit;
  const remaining = Math.max(0, limit - occupiedEntriesCount);

  return {
    limit,
    confirmedCount: occupiedEntriesCount,
    remaining,
    isFull,
  };
}

/**
 * Mapeia as inscrições que ocupam vaga para cada ID de categoria do evento.
 * Pagamento pendente também ocupa vaga; apenas inscrições canceladas ou
 * desativadas deixam de contar.
 */
export function buildCategoryOccupancyCountMap(entries: TournamentEntry[]): Record<string, number> {
  const countMap: Record<string, number> = {};

  for (const entry of entries) {
    if (entry.disabled || entry.paymentStatus === 'Cancelado') continue;
    if (entry.categoryIds) {
      for (const catId of entry.categoryIds) {
        countMap[catId] = (countMap[catId] || 0) + 1;
      }
    }
  }

  return countMap;
}

/** Mantém o contrato legado de contagem confirmada usado por relatórios e testes. */
export function buildCategoryConfirmedCountMap(
  entries: TournamentEntry[],
  isFreeEvent = false
): Record<string, number> {
  const countMap: Record<string, number> = {};
  for (const entry of entries) {
    if (entry.disabled || entry.paymentStatus === 'Cancelado') continue;
    const isConfirmed = isFreeEvent ||
      entry.paymentStatus === 'Confirmado' ||
      entry.paymentStatus === 'Pago' ||
      entry.paymentStatus === 'Isento';
    if (!isConfirmed) continue;
    for (const catId of entry.categoryIds || []) {
      countMap[catId] = (countMap[catId] || 0) + 1;
    }
  }
  return countMap;
}
