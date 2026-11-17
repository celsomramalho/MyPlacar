/**
 * Domínio: Inscrições de Torneio — Calculadora de Vagas e Capacidade (Vacancy Calculator)
 *
 * Funções puras para verificar disponibilidade de vagas por categoria,
 * respeitando o limite individual da categoria.
 *
 * @pure — sem efeitos colaterais.
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 2
 */

import type { TournamentEntry, EventCategory, TournamentEvent } from '@modules/events/types';
import type { CategoryVacancyResult } from '../types';

/**
 * Verifica se a categoria é mista (duplas mistas ou Super 8 misto).
 */
export function isCategoryMixed(
  category: Pick<EventCategory, 'name' | 'gender1' | 'gender2'>
): boolean {
  if (
    (category.gender1 === 'M' && category.gender2 === 'F') ||
    (category.gender1 === 'F' && category.gender2 === 'M')
  ) {
    return true;
  }
  const name = (category.name || '').toLowerCase();
  return name.includes('misto') || name.includes('mista');
}

/**
 * Verifica se o atleta de determinado gênero pode se inscrever na categoria.
 * Caso o gênero não esteja informado, aceita qualquer categoria.
 */
export function isCategoryCompatibleWithGender(
  category: Pick<EventCategory, 'name' | 'gender1' | 'gender2'>,
  athleteGender?: 'M' | 'F' | string | null
): boolean {
  if (!athleteGender) return true;
  const gender = athleteGender.toUpperCase() as 'M' | 'F';
  if (gender !== 'M' && gender !== 'F') return true;

  // Se a categoria especificou restrição formal por campos gender1/gender2
  if (category.gender1 || category.gender2) {
    return category.gender1 === gender || category.gender2 === gender;
  }

  // Fallback baseado no nome da categoria
  const name = (category.name || '').toLowerCase();
  if (name.includes('misto') || name.includes('mista')) return true;
  if (name.includes('fem') || name.includes('dama') || name.includes('mulher')) {
    return gender === 'F';
  }
  if (name.includes('masc') || name.includes('homem')) {
    return gender === 'M';
  }

  return true;
}

/**
 * Calcula a capacidade, inscritos e vagas restantes de uma categoria.
 *
 * Regras:
 * 1. Limite definido na categoria (`category.maxPlayers`), com padrão de 8 jogadores.
 * 2. Se o atleta já estava inscrito previamente nessa categoria (`isAlreadyEnrolled = true`),
 *    ele não é considerado bloqueado por "vagas esgotadas" ao editar seus dados.
 * 3. Se for categoria mista e o gênero do atleta for especificado, respeita a cota do gênero (metade das vagas).
 */
export function calculateCategoryVacancy(
  category: Pick<EventCategory, 'maxPlayers' | 'name' | 'gender1' | 'gender2'>,
  occupiedEntriesCount: number,
  isAlreadyEnrolled = false,
  athleteGender?: 'M' | 'F' | string | null,
  genderOccupiedCount?: number
): CategoryVacancyResult {
  const limit = category.maxPlayers && category.maxPlayers > 0 ? category.maxPlayers : 8;
  const isMixed = isCategoryMixed(category);

  let isFull = !isAlreadyEnrolled && occupiedEntriesCount >= limit;
  let remaining = Math.max(0, limit - occupiedEntriesCount);

  if (isMixed && (athleteGender === 'M' || athleteGender === 'F') && typeof genderOccupiedCount === 'number') {
    const genderLimit = Math.ceil(limit / 2);
    const isGenderFull = !isAlreadyEnrolled && genderOccupiedCount >= genderLimit;
    if (isGenderFull) {
      isFull = true;
      remaining = 0;
    } else {
      remaining = Math.min(remaining, Math.max(0, genderLimit - genderOccupiedCount));
    }
  }

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

/**
 * Mapeia as inscrições que ocupam vaga por gênero para cada ID de categoria do evento.
 */
export function buildCategoryGenderOccupancyCountMap(
  entries: TournamentEntry[]
): Record<string, { M: number; F: number }> {
  const map: Record<string, { M: number; F: number }> = {};
  for (const entry of entries) {
    if (entry.disabled || entry.paymentStatus === 'Cancelado') continue;
    if (entry.categoryIds) {
      for (const catId of entry.categoryIds) {
        if (!map[catId]) map[catId] = { M: 0, F: 0 };
        if (entry.gender === 'M' || entry.gender === 'F') {
          map[catId][entry.gender]++;
        }
      }
    }
  }
  return map;
}

/**
 * Verifica se ainda há pelo menos uma vaga disponível para o atleta no evento,
 * considerando o gênero do atleta e as cotas/limites das categorias compatíveis.
 *
 * Regras:
 * - Categorias incompatíveis com o gênero do atleta são ignoradas.
 * - Em categorias mistas, a cota por gênero é respeitada (ceil(limit/2)).
 * - Categorias do mesmo `categoryGroup` são mutuamente exclusivas: o atleta só pode
 *   entrar em 1 categoria do grupo. Se o atleta já está inscrito em alguma categoria
 *   do grupo (identificado por athleteEmail ou athletePin), o grupo inteiro é bloqueado.
 *
 * @param event Evento contendo suas categorias
 * @param athleteGender Gênero do atleta ('M' ou 'F')
 * @param entries Inscrições existentes no evento (opcional, pode usar event.entries)
 * @param athleteEmail Email do atleta para detectar se já está inscrito em algum grupo
 * @param athletePin PIN do atleta para detectar se já está inscrito em algum grupo
 */
export function hasAvailableVacanciesForAthlete(
  event: Pick<TournamentEvent, 'categories' | 'entries'>,
  athleteGender?: 'M' | 'F' | string | null,
  entries?: TournamentEntry[],
  athleteEmail?: string | null,
  athletePin?: string | null
): { hasVacancies: boolean; totalVacancies: number } {
  const categories = event.categories || [];
  if (categories.length === 0) {
    return { hasVacancies: false, totalVacancies: 0 };
  }

  const entriesToUse = entries !== undefined ? entries : event.entries;
  // Se a lista de inscrições ainda não foi carregada (undefined), assume verdadeiro para não bloquear temporariamente
  if (entriesToUse === undefined) {
    return { hasVacancies: true, totalVacancies: -1 };
  }

  const activeEntries = entriesToUse.filter(
    (e) => !e.disabled && e.paymentStatus !== 'Cancelado'
  );

  const compatibleCategories = categories.filter((cat) =>
    isCategoryCompatibleWithGender(cat, athleteGender)
  );

  if (compatibleCategories.length === 0) {
    return { hasVacancies: false, totalVacancies: 0 };
  }

  // Detecta os grupos em que o atleta já está inscrito
  const athleteEmailNorm = athleteEmail?.toLowerCase().trim();
  const athletePinNorm = athletePin?.toUpperCase().trim();
  const athleteAlreadyInGroups = new Set<string>();

  if (athleteEmailNorm || athletePinNorm) {
    for (const entry of activeEntries) {
      const sameEmail = athleteEmailNorm && (entry.email || '').toLowerCase().trim() === athleteEmailNorm;
      const samePin = athletePinNorm && (entry.pin || '').toUpperCase().trim() === athletePinNorm;
      if (!sameEmail && !samePin) continue;
      for (const catId of entry.categoryIds || []) {
        const group = categories.find((c) => c.id === catId)?.categoryGroup;
        if (group) athleteAlreadyInGroups.add(group);
      }
    }
  }

  // Agrupa categorias por categoryGroup e calcula disponibilidade
  const groupAvailability = new Map<string, boolean>(); // groupKey → temVaga
  let ungroupedSpots = 0;

  for (const cat of compatibleCategories) {
    const group = cat.categoryGroup;

    // Atleta já ocupa uma categoria deste grupo → grupo bloqueado para ele
    if (group && athleteAlreadyInGroups.has(group)) {
      if (!groupAvailability.has(group)) groupAvailability.set(group, false);
      continue;
    }

    const limit = cat.maxPlayers && cat.maxPlayers > 0 ? cat.maxPlayers : 8;
    const catEntries = activeEntries.filter((e) => (e.categoryIds || []).includes(cat.id));
    const isMixed = isCategoryMixed(cat);

    let hasSpotInCat = false;
    if (catEntries.length < limit) {
      if (isMixed && (athleteGender === 'M' || athleteGender === 'F')) {
        const genderQuota = Math.ceil(limit / 2);
        const sameGenderCount = catEntries.filter((e) => e.gender === athleteGender).length;
        hasSpotInCat = sameGenderCount < genderQuota;
      } else {
        hasSpotInCat = true;
      }
    }

    if (group) {
      const current = groupAvailability.get(group) ?? false;
      groupAvailability.set(group, current || hasSpotInCat);
    } else {
      ungroupedSpots += hasSpotInCat ? 1 : 0;
    }
  }

  // Soma: cada grupo conta no máximo 1 vaga (atleta inscreve-se em apenas 1 do grupo)
  let totalAvailableSpots = ungroupedSpots;
  for (const hasSpot of groupAvailability.values()) {
    if (hasSpot) totalAvailableSpots++;
  }

  return {
    hasVacancies: totalAvailableSpots > 0,
    totalVacancies: totalAvailableSpots,
  };
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
