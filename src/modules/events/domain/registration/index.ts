/**
 * Ponto de entrada canônico do subdomínio: Inscrições de Torneio (Tournament Registration)
 *
 * Exporta tipos, motores de regras puras e hooks de orquestração.
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 2
 */

// Tipos de Domínio
export type {
  RegistrationStep,
  RegistrationFormData,
  PricingCalculationResult,
  PendingBalanceResult,
  CategoryVacancyResult,
  PartnerValidationResult,
  TournamentEntry,
  EventCategory,
  CategoryPartnerInfo,
  PaymentItem,
  TournamentPair,
} from './types';

// Motores Puros (sem React, sem Firebase)
export {
  calculateRegistrationPrice,
  calculatePendingBalance,
} from './engine/pricingEngine';

export {
  calculateCategoryVacancy,
  buildCategoryConfirmedCountMap,
} from './engine/vacancyCalculator';

export {
  validateCategoryPartner,
  orderPairEntriesForMixed,
} from './engine/partnerValidator';

// Hooks de Orquestração
export type {
  UseRegistrationFormOptions,
  UseRegistrationFormResult,
} from './hooks/useRegistrationForm';
export { useRegistrationForm } from './hooks/useRegistrationForm';

export type {
  PixCheckoutData,
  UseRegistrationPaymentOptions,
  UseRegistrationPaymentResult,
} from './hooks/useRegistrationPayment';
export { useRegistrationPayment } from './hooks/useRegistrationPayment';

// Componentes Visuais de Inscrição
export * from './components';

