/**
 * Componente: EventRegistrationForm (Orquestrador Desacoplado)
 *
 * Orquestra o fluxo de inscrição em steps utilizando `useRegistrationForm`
 * e `useRegistrationPayment`, delegando a renderização para subcomponentes modulares.
 *
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 4
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, Trash2, X, AlertCircle } from 'lucide-react';
import {
  getNextRegistrationId,
  orderPairEntriesForMixed,
  minifyEntryForPair,
  type TournamentEvent,
  type TournamentEntry,
  type TournamentPair,
  type EventCategory,
} from '@modules/events/types';
import { getDb } from '@infra/firebase';
import { fetchEventEntries } from '@infra/firebase/events';
import type { Firestore } from 'firebase/firestore';
import { useRegistrationForm } from '../hooks/useRegistrationForm';
import { useRegistrationPayment } from '../hooks/useRegistrationPayment';
import {
  AthleteIdentityStep,
  CategorySelectionStep,
  PartnerSelectionStep,
  PaymentCheckoutStep,
  RegulationStep,
} from './steps';

export interface EventRegistrationFormProps {
  event: TournamentEvent;
  entry: TournamentEntry;
  mode: 'admin' | 'user';
  isNew?: boolean;
  onSave: (entry: TournamentEntry) => Promise<void>;
  onSaveDraft?: (entry: TournamentEntry) => Promise<void>;
  onUpdateEvent?: (event: TournamentEvent) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onPhoneSync?: (phone: string) => void;
  readOnly?: boolean;
}

export const EventRegistrationForm: React.FC<EventRegistrationFormProps> = ({
  event,
  entry,
  mode,
  isNew = false,
  onSave,
  onSaveDraft,
  onUpdateEvent,
  onDelete,
  onCancel,
  readOnly = false,
}) => {
  const isAdmin = mode === 'admin';
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── registrationId e vagas: busca as entries REAIS da subcoleção para o formulário ──
  // event.entries pode estar vazio (não é carregado no contexto do form de usuário),
  // então buscamos direto do Firestore para garantir integridade de vagas e ID único.
  const [liveEntries, setLiveEntries] = useState<TournamentEntry[]>(event.entries || []);
  const liveEntriesLoadedRef = useRef(false);

  useEffect(() => {
    if (liveEntriesLoadedRef.current) return;
    liveEntriesLoadedRef.current = true;
    const db = getDb();
    if (!db || !event.pin) return;
    fetchEventEntries(db as Firestore, event.pin)
      .then((entries) => setLiveEntries(entries as unknown as TournamentEntry[]))
      .catch((err) => console.warn('[EventRegistrationForm] Erro ao buscar entries:', err));
  }, [event.pin]);

  useEffect(() => {
    if (event.entries && event.entries.length > 0) {
      setLiveEntries(event.entries);
    }
  }, [event.entries]);

  const form = useRegistrationForm({
    event,
    entry,
    liveEntries,
    mode,
    initialStep: 'identity',
  });

  const payment = useRegistrationPayment({
    eventPin: event.pin,
    payerEmail: form.formData.email,
    payerName: form.formData.name,
    dueAmount: form.pricing.dueAmount,
    onPaymentApproved: async () => {
      const submission = form.getSubmissionEntry();
      submission.paymentStatus = 'Confirmado';
      await onSave(submission);
    },
  });

  // ── Formação de Time ─────────────────────────────────────────────────────────
  const handleFormTeam = useCallback(async (categoryId: string, partnerEntry: TournamentEntry) => {
    if (!onUpdateEvent || (!form.isTeamDrawPreDefined && event.allowUserTeamFormation !== true)) return;

    const isSelfCancelled = Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');
    if (isSelfCancelled || partnerEntry.disabled || partnerEntry.paymentStatus === 'Cancelado') {
      setFeedback('Não é possível formar time com inscrição cancelada ou desativada.');
      return;
    }

    const currentEntry = form.getSubmissionEntry();
    const pairs = event.pairs || [];
    const teamNumber =
      Math.max(
        0,
        ...pairs.map(
          (pair, index) =>
            pair.teamNumber || Number(pair.teamCode?.match(/^\d{3}/)?.[0]) || index + 1
        )
      ) + 1;

    const cat = (event.categories || []).find((c: EventCategory) => c.id === categoryId);

    const [orderedP1, orderedP2] = orderPairEntriesForMixed(
      minifyEntryForPair(currentEntry),
      minifyEntryForPair(partnerEntry)
    );

    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: orderedP1,
      p2: orderedP2,
      categoryId,
      teamNumber,
      bracket: 1,
      bracketOrder: pairs.filter((pair) => pair.categoryId === categoryId && (pair.bracket ?? 1) === 1).length + 1,
      teamCode: `${String(teamNumber).padStart(3, '0')} - ${cat?.abbreviation || cat?.name || categoryId}`,
    };

    const updatedEntries = (event.entries || []).map((item) =>
      item.pin === entry.pin ? currentEntry : item
    );

    await (onSaveDraft || onSave)(currentEntry);
    onUpdateEvent({ ...event, entries: updatedEntries, pairs: [...pairs, newPair] });
  }, [entry, event, form, onSave, onSaveDraft, onUpdateEvent]);

  const handleNext = () => {
    setFeedback(null);
    const validation = form.isStepValid(form.currentStep);
    if (!validation.isValid) {
      setFeedback(validation.error || 'Preencha os campos obrigatórios.');
      return;
    }
    form.goToNextStep();
  };

  const handleSubmit = async () => {
    setFeedback(null);
    const submission = form.getSubmissionEntry();

    if (!submission.name.trim()) {
      setFeedback('Informe o nome completo do atleta.');
      return;
    }
    if (!submission.categoryIds || submission.categoryIds.length === 0) {
      setFeedback('Selecione pelo menos uma categoria.');
      return;
    }
    const partnerValidation = form.isStepValid('partners');
    if (!partnerValidation.isValid) {
      setFeedback(partnerValidation.error || 'Preencha os dados obrigatórios do parceiro(a).');
      return;
    }

    if (!submission.registrationId) {
      submission.registrationId = getNextRegistrationId(liveEntries);
    }

    setIsSubmitting(true);
    try {
      await onSave(submission);
    } catch (err: any) {
      console.error('[EventRegistrationForm] Erro ao salvar inscrição:', err);
      setFeedback(err.message || 'Erro ao processar a inscrição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSelfCancelled = Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');
  const registrationSteps = form.requiresPartnerDetails
    ? ['identity', 'categories', 'partners', 'payment'] as const
    : ['identity', 'categories', 'payment'] as const;
  const stepLabels = {
    identity: 'Atleta',
    categories: 'Categorias',
    partners: 'Duplas',
    payment: 'Pagamento',
  } as const;

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4 sm:p-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
      {/* Barra de Progresso dos Steps */}
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <div className="grid flex-1 min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {registrationSteps.map((stepKey, idx) => {
            const isActive = form.currentStep === stepKey;
            return (
              <button
                key={stepKey}
                type="button"
                onClick={() => form.goToStep(stepKey)}
                className={`flex min-w-0 items-center justify-center gap-1 text-[11px] font-black px-2 py-2 rounded-xl transition-all sm:text-xs ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <span>{idx + 1}.</span>
                <span className="whitespace-nowrap">{stepLabels[stepKey]}</span>
              </button>
            );
          })}
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2 animate-in fade-in">
          <AlertCircle size={15} className="shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Renderização Condicional do Step Ativo */}
      <div className="min-h-[280px]">
        {form.currentStep === 'identity' && (
          <AthleteIdentityStep
            formData={form.formData}
            updateField={form.updateField}
            isAdmin={isAdmin}
            readOnly={readOnly}
          />
        )}

        {form.currentStep === 'categories' && (
          <div className="space-y-6">
            <CategorySelectionStep
              categories={form.availableCategories}
              selectedCategoryIds={form.formData.categoryIds}
              toggleCategory={form.toggleCategory}
              categoryVacancyMap={form.categoryVacancyMap}
              pricing={form.pricing}
              readOnly={readOnly}
            />
            <RegulationStep
              event={event}
              accepted={form.formData.regulationAccepted}
              onToggleAccept={() =>
                form.updateField('regulationAccepted', !form.formData.regulationAccepted)
              }
              readOnly={readOnly}
            />
          </div>
        )}

        {form.currentStep === 'partners' && (
          <PartnerSelectionStep
            categories={form.availableCategories}
            selectedCategoryIds={form.formData.categoryIds}
            categoryPartners={form.formData.categoryPartners}
            updateCategoryPartner={form.updateCategoryPartner}
            isTeamDrawPreDefined={form.isTeamDrawPreDefined}
            allowUserTeamFormation={event.allowUserTeamFormation === true}
            readOnly={readOnly}
            getPartnerEntryForCategory={form.getPartnerEntryForCategory}
            getPairForCategory={form.getPairForCategory}
            getPairForEmailInCategory={form.getPairForEmailInCategory}
            onFormTeam={onUpdateEvent ? handleFormTeam : undefined}
            isSelfCancelled={isSelfCancelled}
          />
        )}

        {form.currentStep === 'payment' && (
          <PaymentCheckoutStep
            event={event}
            pricing={form.pricing}
            payment={payment}
            readOnly={readOnly}
          />
        )}
      </div>

      {/* Barra Inferior de Navegação e Ações */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-wrap gap-2">
        <div>
          {onDelete && !isNew && (
            <button
              type="button"
              disabled={readOnly || isSubmitting}
              onClick={onDelete}
              className="px-3.5 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 border border-rose-200 flex items-center gap-1.5 transition-all"
            >
              <Trash2 size={14} />
              Excluir Inscrição
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {form.currentStep !== 'identity' && (
            <button
              type="button"
              onClick={form.goToPrevStep}
              className="px-4 py-2 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5 transition-all"
            >
              <ChevronLeft size={16} />
              Voltar
            </button>
          )}

          {form.currentStep !== 'payment' ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
            >
              Avançar
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={readOnly || isSubmitting}
              onClick={handleSubmit}
              className="px-6 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              <Check size={16} />
              {isSubmitting ? 'Salvando...' : 'Finalizar Inscrição'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
