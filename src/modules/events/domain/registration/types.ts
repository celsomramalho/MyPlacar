/**
 * Domínio: Inscrições de Torneio (Tournament Registration)
 *
 * Contratos de dados, etapas e modelos de cálculo do subdomínio de inscrições.
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 2
 */

import type {
  TournamentEntry,
  EventCategory,
  CategoryPartnerInfo,
  PaymentItem,
  TournamentPair,
} from '@modules/events/types';

// ─── Etapas do Fluxo de Inscrição ─────────────────────────────────────────────

export type RegistrationStep =
  | 'identity'      // Identificação do atleta (nome, fone, camiseta, gênero)
  | 'information'   // Informações do evento, local, datas, regulamento e aceite
  | 'categories'    // Seleção de categorias disponíveis e visualização de vagas
  | 'partners'      // Definição e validação de duplas para categorias em dupla
  | 'payment'       // Checkout: escolha entre Pix (Mercado Pago) ou Manual
  | 'confirmation'; // Confirmação final / comprovante

// ─── Estado do Formulário de Inscrição ───────────────────────────────────────

export interface RegistrationFormData {
  registrationId?: number;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  shirtSize: 'P' | 'M' | 'G';
  gender: 'M' | 'F';
  categoryIds: string[];
  categoryPartners: Record<string, CategoryPartnerInfo>;
  regulationAccepted: boolean;
}

// ─── Resultados dos Motores de Cálculo ───────────────────────────────────────

export interface PricingCalculationResult {
  dueAmount: number;
  baseFee: number;
  extraFee: number;
  extraCategoriesCount: number;
  isFree: boolean;
}

export interface PendingBalanceResult {
  totalPaid: number;
  pendingAmount: number;
  isFullyPaid: boolean;
}

export interface CategoryVacancyResult {
  limit: number;
  confirmedCount: number;
  remaining: number;
  isFull: boolean;
}

export interface PartnerValidationResult {
  isValid: boolean;
  errorMessage?: string;
  isMixedPair?: boolean;
}

// ─── Re-exports de Conveniência ──────────────────────────────────────────────

export type {
  TournamentEntry,
  EventCategory,
  CategoryPartnerInfo,
  PaymentItem,
  TournamentPair,
};
