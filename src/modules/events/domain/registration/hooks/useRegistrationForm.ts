/**
 * Hook: useRegistrationForm
 *
 * Gerencia o estado completo do formulário de inscrição de atletas em torneios,
 * incluindo fluxo em steps, validações em tempo real de cada etapa e
 * cálculo financeiro automatizado (via pricingEngine e vacancyCalculator).
 *
 * @see docs/PLANO_REFATORACAO_INSCRICOES_TORNEIO.md — Fase 3
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  TournamentEvent,
  TournamentEntry,
  TournamentPair,
  EventCategory,
  CategoryPartnerInfo,
} from '@modules/events/types';
import type {
  RegistrationStep,
  RegistrationFormData,
  PricingCalculationResult,
} from '../types';
import { calculateRegistrationPrice } from '../engine/pricingEngine';
import { calculateCategoryVacancy, buildCategoryConfirmedCountMap } from '../engine/vacancyCalculator';
import { isPreDefinedTeamDraw, requiresPartnerDetails as shouldRequirePartnerDetails } from '../engine/partnerRequirements';

export interface UseRegistrationFormOptions {
  event: TournamentEvent;
  entry?: Partial<TournamentEntry>;
  liveEntries?: TournamentEntry[];
  mode?: 'admin' | 'user';
  initialStep?: RegistrationStep;
}

export interface UseRegistrationFormResult {
  currentStep: RegistrationStep;
  goToStep: (step: RegistrationStep) => void;
  goToNextStep: () => boolean;
  goToPrevStep: () => void;
  formData: RegistrationFormData;
  updateField: <K extends keyof RegistrationFormData>(field: K, value: RegistrationFormData[K]) => void;
  toggleCategory: (categoryId: string) => void;
  updateCategoryPartner: (categoryId: string, partner: CategoryPartnerInfo) => void;
  removeCategoryPartner: (categoryId: string) => void;
  pricing: PricingCalculationResult;
  categoryVacancyMap: Record<string, ReturnType<typeof calculateCategoryVacancy>>;
  availableCategories: EventCategory[];
  isTeamDrawPreDefined: boolean;
  requiresPartnerDetails: boolean;
  isStepValid: (step: RegistrationStep) => { isValid: boolean; error?: string };
  canProceedToNext: boolean;
  getSubmissionEntry: () => TournamentEntry;
  /** Retorna o TournamentEntry do parceiro inscrito no e-mail informado no evento */
  getPartnerEntryForCategory: (categoryId: string, partnerEmail: string) => TournamentEntry | undefined;
  /** Retorna o TournamentPair do atleta na categoria (se já formado) */
  getPairForCategory: (categoryId: string) => TournamentPair | undefined;
  /** Retorna o TournamentPair do e-mail do parceiro na categoria (se já formado) */
  getPairForEmailInCategory: (targetEmail: string, categoryId: string) => TournamentPair | undefined;
}

export function useRegistrationForm({
  event,
  entry = {},
  liveEntries = [],
  mode = 'user',
  initialStep = 'identity',
}: UseRegistrationFormOptions): UseRegistrationFormResult {
  const isAdmin = mode === 'admin';

  // ─── Estado do Formulário ──────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<RegistrationStep>(initialStep);
  const [formData, setFormData] = useState<RegistrationFormData>(() => ({
    registrationId: entry.registrationId,
    name: entry.name || '',
    nickname: entry.nickname || '',
    email: entry.email || '',
    phone: entry.phone || '',
    shirtSize: entry.shirtSize || 'M',
    gender: entry.gender || 'M',
    categoryIds: entry.categoryIds || [],
    categoryPartners: entry.categoryPartners ? { ...entry.categoryPartners } : {},
    regulationAccepted: false,
  }));

  // ─── Detecção do Método de Formação de Duplas ──────────────────────────────
  const isTeamDrawPreDefined = isPreDefinedTeamDraw(event.teamDrawType);
  const requiresPartnerDetails = useMemo(
    () => shouldRequirePartnerDetails(event.teamDrawType, event.categories || [], formData.categoryIds),
    [event.categories, event.teamDrawType, formData.categoryIds]
  );
  const stepOrder = useMemo<RegistrationStep[]>(
    () => requiresPartnerDetails
      ? ['identity', 'categories', 'partners', 'payment', 'confirmation']
      : ['identity', 'categories', 'payment', 'confirmation'],
    [requiresPartnerDetails]
  );

  useEffect(() => {
    if (!requiresPartnerDetails && currentStep === 'partners') {
      setCurrentStep('payment');
    }
  }, [currentStep, requiresPartnerDetails]);

  // ─── Filtragem de Categorias por Gênero do Atleta ───────────────────────────
  const availableCategories = useMemo(() => {
    const all = event.categories || [];
    return all.filter((cat) => {
      // Se não tiver restrição de gênero informada, exibe para todos
      if (!cat.gender1 && !cat.gender2) return true;
      // Exibe se o gênero do atleta for compatível com qualquer uma das vagas da dupla
      return cat.gender1 === formData.gender || cat.gender2 === formData.gender;
    });
  }, [event.categories, formData.gender]);

  // Se o gênero mudar, remove seleções de categorias incompatíveis
  const handleUpdateField = useCallback(
    <K extends keyof RegistrationFormData>(field: K, value: RegistrationFormData[K]) => {
      if (field === 'gender') {
        const newGender = value as 'M' | 'F';
        setFormData((prev) => {
          const validCatIds = (event.categories || [])
            .filter((cat) => !cat.gender1 && !cat.gender2 || cat.gender1 === newGender || cat.gender2 === newGender)
            .map((c) => c.id);
          const nextCategoryIds = prev.categoryIds.filter((id) => validCatIds.includes(id));
          return {
            ...prev,
            gender: newGender,
            categoryIds: nextCategoryIds,
          };
        });
        return;
      }
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [event.categories]
  );

  // ─── Motor de Preço ────────────────────────────────────────────────────────
  const pricing = useMemo(
    () => calculateRegistrationPrice(formData.categoryIds, event, isAdmin),
    [formData.categoryIds, event, isAdmin]
  );

  // ─── Vagas e Confirmações por Categoria ────────────────────────────────────
  const confirmedCountMap = useMemo(
    () => buildCategoryConfirmedCountMap(liveEntries, pricing.isFree),
    [liveEntries, pricing.isFree]
  );

  const categoryVacancyMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof calculateCategoryVacancy>> = {};
    const categories = event.categories || [];
    for (const cat of categories) {
      const isAlreadyInEntry = (entry.categoryIds || []).includes(cat.id);
      const confirmed = confirmedCountMap[cat.id] || 0;
      map[cat.id] = calculateCategoryVacancy(cat, event, confirmed, isAlreadyInEntry);
    }
    return map;
  }, [event, entry.categoryIds, confirmedCountMap]);

  // ─── Seleção de Categorias ─────────────────────────────────────────────────
  const toggleCategory = useCallback((categoryId: string) => {
    setFormData((prev) => {
      const exists = prev.categoryIds.includes(categoryId);
      const nextCategoryIds = exists
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...prev.categoryIds, categoryId];

      const nextCategoryPartners = { ...prev.categoryPartners };
      if (exists) {
        delete nextCategoryPartners[categoryId];
      }

      return {
        ...prev,
        categoryIds: nextCategoryIds,
        categoryPartners: nextCategoryPartners,
      };
    });
  }, []);

  const updateCategoryPartner = useCallback((categoryId: string, partner: CategoryPartnerInfo) => {
    setFormData((prev) => ({
      ...prev,
      categoryPartners: {
        ...prev.categoryPartners,
        [categoryId]: partner,
      },
    }));
  }, []);

  const removeCategoryPartner = useCallback((categoryId: string) => {
    setFormData((prev) => {
      const nextPartners = { ...prev.categoryPartners };
      delete nextPartners[categoryId];
      return { ...prev, categoryPartners: nextPartners };
    });
  }, []);

  // ─── Validações por Etapa ──────────────────────────────────────────────────
  const isStepValid = useCallback(
    (step: RegistrationStep): { isValid: boolean; error?: string } => {
      if (step === 'identity') {
        if (!formData.name.trim()) return { isValid: false, error: 'O nome completo é obrigatório.' };
        if (!formData.nickname.trim()) return { isValid: false, error: 'O apelido/nome de jogo é obrigatório.' };
        return { isValid: true };
      }

      if (step === 'categories') {
        if (formData.categoryIds.length === 0) {
          return { isValid: false, error: 'Selecione pelo menos uma categoria.' };
        }
        for (const catId of formData.categoryIds) {
          const vacancy = categoryVacancyMap[catId];
          if (vacancy?.isFull) {
            const catName = (event.categories || []).find((c) => c.id === catId)?.name || 'selecionada';
            return { isValid: false, error: `Vagas esgotadas na categoria ${catName}.` };
          }
        }
        if (event.regulationUrl && !formData.regulationAccepted) {
          return { isValid: false, error: 'Você precisa ler e concordar com o regulamento do torneio para continuar.' };
        }
        return { isValid: true };
      }

      if (step === 'partners') {
        if (!requiresPartnerDetails) {
          return { isValid: true };
        }

        const categories = event.categories || [];
        for (const catId of formData.categoryIds) {
          const cat = categories.find((c) => c.id === catId);
          if (cat && cat.format === 'Duplas') {
            const partner = formData.categoryPartners[catId];
            const cleanedPhone = (partner?.phone || '').replace(/\D/g, '');
            if (!partner || !partner.name?.trim() || !partner.email?.trim() || !cleanedPhone) {
              return {
                isValid: false,
                error: `Preencha todos os dados do parceiro(a) (nome, e-mail e WhatsApp) para a categoria ${cat.name}.`,
              };
            }
          }
        }
        return { isValid: true };
      }

      return { isValid: true };
    },
    [formData, categoryVacancyMap, event.categories, event.regulationUrl, requiresPartnerDetails]
  );

  const canProceedToNext = useMemo(() => isStepValid(currentStep).isValid, [currentStep, isStepValid]);

  // ─── Navegação entre Steps ─────────────────────────────────────────────────
  const goToStep = useCallback(
    (target: RegistrationStep) => {
      const targetIndex = stepOrder.indexOf(target);
      const currentIndex = stepOrder.indexOf(currentStep);
      if (targetIndex > currentIndex) {
        if (!isStepValid(currentStep).isValid) return;
      }
      setCurrentStep(target);
    },
    [currentStep, isStepValid, stepOrder]
  );

  const goToNextStep = useCallback((): boolean => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (!isStepValid(currentStep).isValid) return false;
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
      return true;
    }
    return false;
  }, [currentStep, isStepValid, stepOrder]);

  const goToPrevStep = useCallback(() => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  }, [currentStep, stepOrder]);

  // ─── Objeto Final para Submissão ───────────────────────────────────────────
  const getSubmissionEntry = useCallback((): TournamentEntry => {
    return {
      ...(entry as TournamentEntry),
      name: formData.name.trim(),
      nickname: formData.nickname.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      shirtSize: formData.shirtSize,
      gender: formData.gender,
      categoryIds: formData.categoryIds,
      categoryPartners: formData.categoryPartners,
      dueAmount: pricing.dueAmount,
      paymentStatus: (pricing.isFree && entry.paymentStatus !== 'Cancelado')
        ? 'Confirmado'
        : (entry.paymentStatus || (pricing.isFree ? 'Confirmado' : 'Pendente')),
      registrationId: formData.registrationId,
      joinedAt: entry.joinedAt || Date.now(),
    };
  }, [entry, formData, pricing.dueAmount, pricing.isFree]);

  // ─── Helpers de Formação de Time ───────────────────────────────────────────
  const getPairForCategory = useCallback((categoryId: string): TournamentPair | undefined => {
    const entryEmail = (entry.email || '').toLowerCase().trim();
    const entryPin = (entry.pin || '').toUpperCase().trim();
    return (event.pairs || []).find((pair) => {
      const isEntryPair =
        (entryEmail && (pair.p1.email.toLowerCase().trim() === entryEmail || pair.p2.email.toLowerCase().trim() === entryEmail)) ||
        (entryPin && (pair.p1.pin?.toUpperCase().trim() === entryPin || pair.p2.pin?.toUpperCase().trim() === entryPin));
      if (!isEntryPair) return false;
      return (
        pair.categoryId === categoryId ||
        (!pair.categoryId &&
          (pair.p1.categoryIds?.includes(categoryId) || pair.p2.categoryIds?.includes(categoryId)))
      );
    });
  }, [event.pairs, entry.email, entry.pin]);

  const getPairForEmailInCategory = useCallback((targetEmail: string, categoryId: string): TournamentPair | undefined => {
    const normalized = targetEmail.toLowerCase().trim();
    if (!normalized) return undefined;
    return (event.pairs || []).find((pair) => {
      const isTargetPair =
        pair.p1.email.toLowerCase().trim() === normalized ||
        pair.p2.email.toLowerCase().trim() === normalized;
      if (!isTargetPair) return false;
      return (
        pair.categoryId === categoryId ||
        (!pair.categoryId &&
          (pair.p1.categoryIds?.includes(categoryId) || pair.p2.categoryIds?.includes(categoryId)))
      );
    });
  }, [event.pairs]);

  const getPartnerEntryForCategory = useCallback((_categoryId: string, partnerEmail: string): TournamentEntry | undefined => {
    const normalizedPartner = partnerEmail.toLowerCase().trim();
    const normalizedSelf = (formData.email || entry.email || '').toLowerCase().trim();
    if (!normalizedPartner) return undefined;
    return liveEntries.find((candidate) =>
      candidate.email.toLowerCase().trim() === normalizedPartner &&
      candidate.email.toLowerCase().trim() !== normalizedSelf
    );
  }, [liveEntries, formData.email, entry.email]);

  return {
    currentStep,
    goToStep,
    goToNextStep,
    goToPrevStep,
    formData,
    updateField: handleUpdateField,
    toggleCategory,
    updateCategoryPartner,
    removeCategoryPartner,
    pricing,
    categoryVacancyMap,
    availableCategories,
    isTeamDrawPreDefined,
    requiresPartnerDetails,
    isStepValid,
    canProceedToNext,
    getSubmissionEntry,
    getPartnerEntryForCategory,
    getPairForCategory,
    getPairForEmailInCategory,
  };
}
