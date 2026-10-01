/**
 * Domínio: Inscrições de Torneio — Validador de Duplas e Gênero (Partner Validator)
 *
 * Funções puras para validação de elegibilidade de duplas conforme as regras de gênero
 * da categoria (Masculina, Feminina, Mista ou Livre).
 *
 * @pure — sem efeitos colaterais.
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 2
 */

import {
  orderPairEntriesForMixed,
  type EventCategory,
  type TournamentEntry,
} from '@modules/events/types';
import type { PartnerValidationResult } from '../types';

/**
 * Valida a compatibilidade de gênero de uma dupla para uma categoria.
 */
export function validateCategoryPartner(
  category: Pick<EventCategory, 'name' | 'format' | 'gender1' | 'gender2'>,
  playerGender: 'M' | 'F',
  partnerGender?: 'M' | 'F'
): PartnerValidationResult {
  const isDoubles = category.format === 'Duplas';
  if (!isDoubles) {
    return { isValid: true };
  }

  if (!partnerGender) {
    return {
      isValid: false,
      errorMessage: 'Esta categoria exige a indicação de um parceiro(a).',
    };
  }

  const catNameLower = (category.name || '').toLowerCase();

  // 1. Categoria Mista
  const isMixedCategory =
    (category.gender1 === 'F' && category.gender2 === 'M') ||
    (category.gender1 === 'M' && category.gender2 === 'F') ||
    catNameLower.includes('misto') ||
    catNameLower.includes('mista');

  if (isMixedCategory) {
    const isMixed =
      (playerGender === 'M' && partnerGender === 'F') ||
      (playerGender === 'F' && partnerGender === 'M');

    if (!isMixed) {
      return {
        isValid: false,
        errorMessage: 'Categoria mista exige uma dupla formada por um homem e uma mulher.',
        isMixedPair: false,
      };
    }

    return { isValid: true, isMixedPair: true };
  }

  // 2. Categoria Feminina
  const isAllFemale =
    (category.gender1 === 'F' && category.gender2 === 'F') ||
    catNameLower.includes('fem') ||
    catNameLower.includes('dama') ||
    catNameLower.includes('mulher');

  if (isAllFemale) {
    if (playerGender !== 'F' || partnerGender !== 'F') {
      return {
        isValid: false,
        errorMessage: 'Categoria feminina exige que ambas as atletas sejam do gênero feminino.',
      };
    }
    return { isValid: true };
  }

  // 3. Categoria Masculina
  const isAllMale =
    (category.gender1 === 'M' && category.gender2 === 'M') ||
    catNameLower.includes('masc') ||
    catNameLower.includes('homem');

  if (isAllMale) {
    if (playerGender !== 'M' || partnerGender !== 'M') {
      return {
        isValid: false,
        errorMessage: 'Categoria masculina exige que ambos os atletas sejam do gênero masculino.',
      };
    }
    return { isValid: true };
  }

  // Categoria sem restrição de gênero específica (Open)
  return { isValid: true };
}

// Re-exporta a ordenação determinística de dupla mista
export { orderPairEntriesForMixed };
