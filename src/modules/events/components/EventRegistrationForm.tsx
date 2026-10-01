/**
 * @deprecated
 * Este arquivo é uma ponte de retrocompatibilidade.
 * O componente de formulário de inscrição foi decomposto em subcomponentes
 * e migrado para o subdomínio canônico:
 *   src/modules/events/domain/registration/components/EventRegistrationForm.tsx
 *
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 4
 */

export * from '../domain/registration/components/EventRegistrationForm';
export { EventRegistrationForm as default } from '../domain/registration/components/EventRegistrationForm';
