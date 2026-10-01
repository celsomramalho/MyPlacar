/**
 * Domínio: Inscrições de Torneio — Motor de Preços e Tarifação (Pricing Engine)
 *
 * Funções puras e determinísticas para cálculo de taxas de inscrição,
 * categorias adicionais e reconciliação de pagamentos parciais.
 *
 * @pure — sem efeitos colaterais, sem dependências de React ou Firebase.
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 2
 */

import type { TournamentEvent } from '@modules/events/types';
import type {
  PaymentItem,
  PricingCalculationResult,
  PendingBalanceResult,
} from '../types';

/**
 * Calcula o valor devido para uma inscrição com base na quantidade de categorias
 * selecionadas e nas regras financeiras configuradas no evento.
 *
 * Regras:
 * 1. Evento gratuito (ambas as taxas zeradas): dueAmount = 0, isFree = true.
 * 2. Administrador informando valor customizado: prevalece o valor definido pelo admin.
 * 3. 1 Categoria: cobra exatamente a registrationFee.
 * 4. 2 ou mais Categorias: cobra registrationFee + (N - 1) * extraCategoryFee.
 */
export function calculateRegistrationPrice(
  categoryIds: string[],
  event: Pick<TournamentEvent, 'registrationFee' | 'extraCategoryFee'>,
  isAdmin = false,
  adminCustomDue?: number
): PricingCalculationResult {
  const baseFee = event.registrationFee ?? 0;
  const extraFee = event.extraCategoryFee ?? 0;
  const isFree = baseFee === 0 && extraFee === 0;

  if (isFree) {
    return {
      dueAmount: 0,
      baseFee: 0,
      extraFee: 0,
      extraCategoriesCount: 0,
      isFree: true,
    };
  }

  if (isAdmin && adminCustomDue !== undefined) {
    return {
      dueAmount: Math.max(0, adminCustomDue),
      baseFee,
      extraFee,
      extraCategoriesCount: Math.max(0, categoryIds.length - 1),
      isFree: false,
    };
  }

  const count = categoryIds.length;
  if (count === 0) {
    return {
      dueAmount: 0,
      baseFee,
      extraFee,
      extraCategoriesCount: 0,
      isFree: false,
    };
  }

  const extraCategoriesCount = Math.max(0, count - 1);
  const dueAmount = baseFee + extraCategoriesCount * extraFee;

  return {
    dueAmount,
    baseFee,
    extraFee,
    extraCategoriesCount,
    isFree: false,
  };
}

/**
 * Calcula o saldo pendente de uma inscrição comparando o valor devido
 * com a soma dos pagamentos com status 'Confirmado' ou 'approved'.
 */
export function calculatePendingBalance(
  dueAmount: number,
  payments: PaymentItem[] = []
): PendingBalanceResult {
  const totalPaid = payments
    .filter((p) => p.status === 'Confirmado' || (p as any).status === 'approved')
    .reduce((acc, p) => acc + (p.amount || 0), 0);

  const pendingAmount = Math.max(0, dueAmount - totalPaid);
  const isFullyPaid = pendingAmount === 0 && dueAmount > 0;

  return {
    totalPaid,
    pendingAmount,
    isFullyPaid,
  };
}
