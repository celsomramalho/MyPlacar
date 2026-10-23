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
  isSimplifiedRegistrationEvent,
  type TournamentEvent,
  type TournamentEntry,
  type TournamentPair,
  type EventCategory,
} from '@modules/events/types';
import { getDb } from '@infra/firebase';
import { fetchEventEntries } from '@infra/firebase/events';
import type { FirebaseUserByPin } from '@infra/firebase/users';
import type { Firestore } from 'firebase/firestore';
import { useRegistrationForm } from '../hooks/useRegistrationForm';
import { useRegistrationPayment } from '../hooks/useRegistrationPayment';
import { loadMercadoPagoSecurityScript } from '@modules/events/services/mercadoPagoCheckout';
import { getRegistrationPeriodStatus } from '@modules/events/services/eventRegistrationPeriod';
import type { RegistrationStep } from '../types';
import {
  AthleteIdentityStep,
  EventInformationStep,
  CategorySelectionStep,
  PartnerSelectionStep,
  PaymentCheckoutStep,
} from './steps';

import type { UserProfile } from '@modules/auth/types';

export interface EventRegistrationFormProps {
  event: TournamentEvent;
  entry: TournamentEntry;
  mode: 'admin' | 'user';
  isNew?: boolean;
  /** Indica se a inscrição está sendo realizada para um terceiro via botão "Nova inscrição" */
  isPartnerRegistration?: boolean;
  onSave: (entry: TournamentEntry) => Promise<void>;
  onSaveDraft?: (entry: TournamentEntry) => Promise<void>;
  onUpdateEvent?: (event: TournamentEvent) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onPhoneSync?: (phone: string) => void;
  readOnly?: boolean;
  /** Perfil do usuário autenticado — usado para travar nome/email e sincronizar phone/gender */
  userProfile?: UserProfile;
  /** Callback para sincronizar phone e/ou gender de volta ao perfil do usuário */
  onProfileSync?: (updates: { phone?: string; gender?: 'M' | 'F' }) => void;
}

export const EventRegistrationForm: React.FC<EventRegistrationFormProps> = ({
  event,
  entry,
  mode,
  isNew = false,
  isPartnerRegistration = false,
  onSave,
  onSaveDraft,
  onUpdateEvent,
  onDelete,
  onCancel,
  readOnly = false,
  userProfile,
  onProfileSync,
}) => {
  const isAdmin = mode === 'admin';
  const shouldLoadMercadoPagoSecurity =
    event.paymentType === 'mercadopago' && getRegistrationPeriodStatus(event).isOpen;
  const hasExistingRealUser = Boolean(
    entry.email &&
    !entry.email.toLowerCase().includes('@simplificada.local') &&
    entry.pin &&
    !entry.pin.toUpperCase().startsWith('TEMP') &&
    !entry.pin.toUpperCase().startsWith('SIMP')
  );
  const [isConfirmedUserBound, setIsConfirmedUserBound] = useState(hasExistingRealUser);

  // Trava nome/email quando o usuário já tem cadastro ou quando foi vinculado a um cadastro confirmado
  const disableIdentity =
    (!isAdmin && !isPartnerRegistration && Boolean(userProfile?.email)) ||
    (!isAdmin && isConfirmedUserBound);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!shouldLoadMercadoPagoSecurity) return;
    void loadMercadoPagoSecurityScript().catch(() => {
      // Device ID is optional; payment can still proceed without the fingerprint.
    });
  }, [shouldLoadMercadoPagoSecurity]);

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
    isNew,
  });

  const payment = useRegistrationPayment({
    eventPin: event.pin,
    payerEmail: form.formData.email,
    payerName: form.formData.name,
    dueAmount: form.pricing.dueAmount,
    loadDeviceFingerprint: shouldLoadMercadoPagoSecurity,
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
    const identityValidation = form.isStepValid('identity');
    if (!identityValidation.isValid) {
      setFeedback(identityValidation.error || 'Preencha os dados do atleta.');
      return;
    }
    const submission = form.getSubmissionEntry();
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
      // Sincroniza WhatsApp e Gênero de volta ao perfil do usuário se tiver mudado
      if (onProfileSync && userProfile) {
        const updates: { phone?: string; gender?: 'M' | 'F' } = {};
        if (submission.phone && submission.phone !== userProfile.phone) {
          updates.phone = submission.phone;
        }
        const submissionGender = submission.gender as 'M' | 'F' | undefined;
        if (submissionGender && submissionGender !== userProfile.gender) {
          updates.gender = submissionGender;
        }
        if (Object.keys(updates).length > 0) {
          onProfileSync(updates);
        }
      }
      // No modo admin, o formulário expandido é fechado pelo pai (via onCancel).
      // No modo user, mantém o fluxo habitual (o pai fecha o modal após onSave).
      if (mode === 'admin' && onCancel) {
        onCancel();
      }
    } catch (err: any) {
      console.error('[EventRegistrationForm] Erro ao salvar inscrição:', err);
      setFeedback(err.message || 'Erro ao processar a inscrição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSelfCancelled = Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');
  const registrationSteps = (form.requiresPartnerDetails || event.allowUserTeamFormation === true)
    ? ['identity', 'information', 'categories', 'partners', 'payment'] as const
    : ['identity', 'information', 'categories', 'payment'] as const;
  const stepLabels: Record<RegistrationStep, string> = {
    identity: 'Atleta',
    information: 'Informações',
    categories: 'Categorias',
    partners: 'Duplas',
    payment: 'Pagamento',
    confirmation: 'Confirmação',
  };

  const handleConfirmUser = async (user: FirebaseUserByPin) => {
    setFeedback(null);
    setIsConfirmedUserBound(true);
    if (user.name) form.updateField('name', user.name);
    if (user.nickname) form.updateField('nickname', user.nickname);
    if (user.email) form.updateField('email', user.email);
    if (user.phone) form.updateField('phone', user.phone);
    if (user.pin) form.updateField('pin', user.pin);
    if (user.gender) form.updateField('gender', user.gender);
    if (user.shirtSize) form.updateField('shirtSize', user.shirtSize);

    // Salva imediatamente os dados da aba Atleta
    const current = form.getSubmissionEntry();
    const resolvedEmail = (user.email || current.email || '').toLowerCase().trim();
    const resolvedPin = (user.pin || current.pin || '').toUpperCase().trim();
    const resolvedName = (user.name || current.name || user.nickname || current.nickname || '').trim();
    const resolvedNickname = (user.nickname || current.nickname || user.name || current.name || '').trim();

    const updatedEntry: TournamentEntry = {
      ...current,
      name: resolvedName,
      nickname: resolvedNickname,
      email: resolvedEmail,
      phone: user.phone || current.phone,
      pin: resolvedPin,
      gender: user.gender || current.gender,
      shirtSize: user.shirtSize || current.shirtSize,
    };

    if (onSaveDraft) {
      await onSaveDraft(updatedEntry);
    } else if (onSave) {
      await onSave(updatedEntry);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4 sm:p-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
      {/* Barra de Progresso dos Steps */}
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <div className="grid flex-1 min-w-0 grid-cols-2 gap-2">
          {registrationSteps.map((stepKey, idx) => {
            const isActive = form.currentStep === stepKey;
            return (
              <button
                key={stepKey}
                id={`reg-step-${stepKey}`}
                type="button"
                onClick={() => form.goToStep(stepKey)}
                className={`flex min-w-0 items-center justify-center gap-1.5 text-xs font-black px-3 py-2.5 rounded-xl transition-all ${
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
            isSimplified={form.isSimplified}
            nameConflictWarning={form.nameConflictWarning}
            disableIdentity={disableIdentity || isConfirmedUserBound}
            onConfirmUser={handleConfirmUser}
          />
        )}

        {form.currentStep === 'information' && (
          <EventInformationStep
            event={event}
            accepted={form.formData.regulationAccepted}
            onToggleAccept={() =>
              form.updateField('regulationAccepted', !form.formData.regulationAccepted)
            }
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
              conflictingCategoryIds={form.conflictingCategoryIds}
              nickname={form.formData.nickname}
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
              Excluir inscrição
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
              {isSubmitting ? 'Salvando...' : 'Finalizar inscrição'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
