import React, { useMemo, useState, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Clock, DollarSign, Eye, Loader2, QrCode, Trash2, Upload, Users } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { findUserByPin, getDb } from '@infra/firebase';
import { fetchEventEntries } from '@infra/firebase/events';
import type { Firestore } from 'firebase/firestore';
import { playPaymentSuccessSound } from '@shared/utils/soundEffects';
import { createMercadoPagoPixPayment, getMercadoPagoPaymentStatus, type PixPaymentResult } from '../services/mercadoPagoCheckout';
import {
  formatRegistrationId,
  getNextRegistrationId,
  orderPairEntriesForMixed,
  type CategoryPartnerInfo,
  type EventCategory,
  type PaymentItem,
  type TournamentEntry,
  type TournamentEvent,
  type TournamentPair,
} from '../types';
import { isRankingEvent, isSuper8Event, isSinglePlayerEvent } from '../services/eventTypeHelpers';
import { openPdfOrUrl } from '../services/openRegulationPdf';

interface Props {
  event: TournamentEvent;
  entry: TournamentEntry;
  mode: 'admin' | 'user';
  isNew?: boolean;
  onSave: (entry: TournamentEntry) => Promise<void>;
  onUpdateEvent?: (event: TournamentEvent) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onPhoneSync?: (phone: string) => void;
  readOnly?: boolean;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const EventRegistrationForm: React.FC<Props> = ({ event, entry, mode, isNew, onSave, onUpdateEvent, onDelete, onCancel, readOnly = false }) => {
  const canEdit = !readOnly;
  const isAdmin = mode === 'admin';
  const isNewAdminEntry = isAdmin && (!entry.email || entry.email.trim() === '') && (!entry.name || entry.name.trim() === '');
  const canEditIdentity = !readOnly && isNewAdminEntry;

  // ── registrationId: busca as entries REAIS da subcoleção para novas inscrições ──
  // event.entries pode estar vazio (não é carregado no contexto do form de usuário),
  // então buscamos direto do Firestore para garantir ID único e sequencial.
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

  const registrationId = useMemo(
    () => entry.registrationId || getNextRegistrationId(liveEntries),
    [entry.registrationId, liveEntries]
  );

  const [nickname, setNickname] = useState(entry.nickname || '');
  const [name, setName] = useState(entry.name || '');
  const [pin, setPin] = useState(entry.pin || '');
  const [email, setEmail] = useState(entry.email || '');
  const [phone, setPhone] = useState(() => {
    if (entry.phone) return entry.phone;
    try {
      const saved = localStorage.getItem('myPlacarUserProfile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!entry.email || (parsed.email && parsed.email.toLowerCase() === entry.email.toLowerCase())) {
          return parsed.phone || '';
        }
      }
    } catch (e) {}
    return '';
  });
  const [shirtSize, setShirtSize] = useState<'P' | 'M' | 'G'>(entry.shirtSize || 'M');
  const [gender, setGender] = useState<'M' | 'F'>(entry.gender || 'M');
  const [categoryIds, setCategoryIds] = useState<string[]>(entry.categoryIds || []);
  const [categoryPartners, setCategoryPartners] = useState<Record<string, CategoryPartnerInfo>>(() => {
    const initialMap: Record<string, CategoryPartnerInfo> = {};

    // 1. Se já tem categoryPartners salvo no entry
    if (entry.categoryPartners && Object.keys(entry.categoryPartners).length > 0) {
      Object.assign(initialMap, entry.categoryPartners);
    }

    // 2. Para qualquer categoria que ainda não tem dados no map, se houver pair formado no event.pairs, carrega do pair
    (entry.categoryIds || []).forEach((catId) => {
      if (!initialMap[catId] || (!initialMap[catId].name && !initialMap[catId].email && !initialMap[catId].phone)) {
        const pair = event.pairs?.find((p) => {
          const isP1 = p.p1?.email === entry.email || p.p1?.pin === entry.pin;
          const isP2 = p.p2?.email === entry.email || p.p2?.pin === entry.pin;
          if (!isP1 && !isP2) return false;
          return p.categoryId === catId || (!p.categoryId && (p.p1?.categoryIds?.includes(catId) || p.p2?.categoryIds?.includes(catId)));
        });
        if (pair) {
          const isP1 = pair.p1?.email === entry.email || pair.p1?.pin === entry.pin;
          const partnerEntry = isP1 ? pair.p2 : pair.p1;
          if (partnerEntry) {
            initialMap[catId] = {
              name: partnerEntry.name || partnerEntry.nickname || '',
              email: partnerEntry.email || '',
              phone: partnerEntry.phone || '',
            };
          }
        }
      }

      // 3. Se ainda não tem, usa partnerName/partnerEmail legado se existir
      if (!initialMap[catId]) {
        if (entry.partnerName || entry.partnerEmail || entry.partnerPhone) {
          initialMap[catId] = {
            name: entry.partnerName || '',
            email: entry.partnerEmail || '',
            phone: entry.partnerPhone || '',
          };
        } else {
          initialMap[catId] = { name: '', email: '', phone: '' };
        }
      }
    });

    return initialMap;
  });

  const isSuper8 = isSuper8Event(event);
  const isRanking = isRankingEvent(event);
  const isSinglePlayer = isSinglePlayerEvent(event);
  const isFreeEvent = (event.registrationFee ?? 0) === 0 && (event.extraCategoryFee ?? 0) === 0;

  const [payments, setPayments] = useState<PaymentItem[]>(entry.payments || []);
  const [paymentStatus, setPaymentStatus] = useState<TournamentEntry['paymentStatus']>(() => {
    if (entry.paymentStatus === 'Cancelado') return 'Cancelado';
    if (isFreeEvent) return 'Confirmado';
    if (entry.paymentStatus === 'Pago') return 'Confirmado';
    return entry.paymentStatus || 'Pendente';
  });
  const [dueAmount, setDueAmount] = useState(entry.dueAmount ?? event.registrationFee ?? 0);
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [newReceipt, setNewReceipt] = useState<{ url: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedPartnerCategoryIds, setExpandedPartnerCategoryIds] = useState<Set<string>>(() => new Set());
  const [confirmTeamCategoryId, setConfirmTeamCategoryId] = useState<string | null>(null);

  const [disabled, setDisabled] = useState(Boolean(entry.disabled));
  const [disabledReason, setDisabledReason] = useState(entry.disabledReason || '');

  const [isSearchingPin, setIsSearchingPin] = useState(false);
  const [pinLookupMessage, setPinLookupMessage] = useState<string | null>(null);
  const usesAutomaticPayment = event.paymentType === 'mercadopago';
  const [isPayingPix, setIsPayingPix] = useState(false);
  const [pixPayment, setPixPayment] = useState<PixPaymentResult | null>(null);
  const [isCheckingPaymentStatus, setIsCheckingPaymentStatus] = useState(false);
  const [showManualAdminPayment, setShowManualAdminPayment] = useState(false);
  const canUseManualPaymentForm = !usesAutomaticPayment || (isAdmin && showManualAdminPayment);
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<PaymentItem | null>(null);

  // Estados para confirmação rápida do admin via código de transação
  const [showAdminTxForm, setShowAdminTxForm] = useState(false);
  const [adminTxCode, setAdminTxCode] = useState('');
  const [isAdminConfirmingTx, setIsAdminConfirmingTx] = useState(false);

  // Recupera dados salvos do Pix pendente (para poder reabrir o QR Code anterior)
  const [savedPixData, setSavedPixData] = useState<PixPaymentResult | null>(() => {
    if (typeof window === 'undefined') return null;
    const targetEmail = (entry.email || '').toLowerCase().trim();
    try {
      const dataKey = `mp_pending_data_${event.pin}_${targetEmail}`;
      const saved = localStorage.getItem(dataKey);
      if (saved) return JSON.parse(saved) as PixPaymentResult;
    } catch {}
    // Fallback do Firestore: se mercadoPagoCheckout contiver qrCode
    const entryAny = entry as unknown as Record<string, unknown>;
    const checkout = entryAny.mercadoPagoCheckout as Record<string, unknown> | undefined;
    if (
      checkout?.paymentId &&
      checkout.qrCode &&
      checkout.status !== 'approved' &&
      entry.paymentStatus !== 'Confirmado' &&
      entry.paymentStatus !== 'Pago'
    ) {
      return {
        paymentId: String(checkout.paymentId),
        status: String(checkout.status || 'pending'),
        qrCode: String(checkout.qrCode),
        qrCodeBase64: checkout.qrCodeBase64 ? String(checkout.qrCodeBase64) : undefined,
        amount: Number(checkout.amount || entry.dueAmount || event.registrationFee || 0),
        expiresAt: checkout.expiresAt ? String(checkout.expiresAt) : '',
        externalReference: checkout.externalReference ? String(checkout.externalReference) : '',
      };
    }
    return null;
  });

  // paymentId pendente — salvo no localStorage ao iniciar o Pix e limpo ao confirmar
  // Carrega também do mercadoPagoCheckout do Firestore como fallback (extra)
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const lsKey = `mp_pending_${event.pin}_${(entry.email || '').toLowerCase().trim()}`;
      const saved = localStorage.getItem(lsKey);
      if (saved) return saved;
    } catch {}
    // fallback: usar paymentId do Firestore se inscrição ainda está pendente
    const entryAny = entry as unknown as Record<string, unknown>;
    const checkout = entryAny.mercadoPagoCheckout as Record<string, unknown> | undefined;
    if (
      checkout?.paymentId &&
      checkout.status !== 'approved' &&
      entry.paymentStatus !== 'Confirmado' &&
      entry.paymentStatus !== 'Pago'
    ) {
      return String(checkout.paymentId);
    }
    return null;
  });

  const isActuallyNew = Boolean(
    isNew ||
    isNewAdminEntry ||
    (!entry.registrationId &&
      !(event.entries || []).some(
        (e) => (entry.email && e.email && e.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
               (entry.pin && e.pin && e.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
      ) &&
      !(liveEntries || []).some(
        (e) => (entry.email && e.email && e.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
               (entry.pin && e.pin && e.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
      )
    )
  );

  const isRegistrationSaved = !isActuallyNew;
  const isExistingRegistration = !isActuallyNew;

  // Listener em tempo real do Firestore para confirmação instantânea do pagamento
  React.useEffect(() => {
    const targetEmail = (entry.email || email).toLowerCase().trim();
    if (!event.pin || !targetEmail || paymentStatus === 'Confirmado') {
      return;
    }
    const db = getDb();
    if (!db) return;

    let unsub: (() => void) | null = null;
    let isMounted = true;

    import('firebase/firestore').then(({ doc, onSnapshot }) => {
      if (!isMounted) return;
      const entryDocRef = doc(db as Firestore, 'events', event.pin, 'entries', targetEmail);
      unsub = onSnapshot(entryDocRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data() as TournamentEntry;
          if (data.paymentStatus === 'Confirmado' || data.paymentStatus === 'Pago') {
            stopPolling();
            setPixPayment(null);
            setPaymentStatus('Confirmado');
            setPendingPaymentId(null);
            setSavedPixData(null);
            try {
              localStorage.removeItem(`mp_pending_${event.pin}_${targetEmail}`);
              localStorage.removeItem(`mp_pending_data_${event.pin}_${targetEmail}`);
            } catch {}
            if (Array.isArray(data.payments) && data.payments.length > 0) {
              setPayments(data.payments);
            }
            playPaymentSuccessSound();
            setFeedback('✅ Pagamento Pix confirmado com sucesso!');
            setIsPayingPix(false);
          }
        }
      });
    }).catch(() => {});

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, [event.pin, entry.email, email, paymentStatus]);


  React.useEffect(() => {
    if (!canEditIdentity) return;
    const cleanPin = pin.trim().toUpperCase();
    if (cleanPin.length >= 4) {
      setIsSearchingPin(true);
      const db = getDb();
      if (!db) {
        setIsSearchingPin(false);
        return;
      }
      const timer = setTimeout(async () => {
        try {
          const user = await findUserByPin(db as Firestore, cleanPin);
          if (user) {
            const isAlreadyInEvent = (event.entries || []).some(
              (e) => e.pin?.toUpperCase().trim() === cleanPin || (user.email && e.email?.toLowerCase().trim() === user.email.toLowerCase().trim())
            );
            if (isAlreadyInEvent) {
              setPinLookupMessage(`${user.nickname} já está inscrito neste evento`);
            } else {
              setPinLookupMessage(`${user.nickname} válido e apto para inscrição`);
            }
            if (user.name) setName(user.name);
            if (user.nickname) setNickname(user.nickname);
            if (user.email) setEmail(user.email);
            if (user.phone) setPhone(user.phone);
            if (user.gender) setGender(user.gender);
            if (user.shirtSize) setShirtSize(user.shirtSize);
          } else {
            setPinLookupMessage('PIN não localizado');
          }
        } catch (e) {
          setPinLookupMessage('Erro ao buscar PIN');
        } finally {
          setIsSearchingPin(false);
        }
      }, 300);

      return () => clearTimeout(timer);
    } else {
      setPinLookupMessage(null);
    }
  }, [pin, canEditIdentity, event.entries]);

  const categories = event.categories || [];
  const availableCategories = useMemo(() => categories.filter((cat) => !cat.gender1 || cat.gender1 === gender || cat.gender2 === gender), [categories, gender]);
  const categoryConfirmedCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    let entriesList = (liveEntries && liveEntries.length > 0) ? liveEntries : (event.entries || []);

    if (isExistingRegistration && entry && (entry.email || entry.pin) && entry.categoryIds && entry.categoryIds.length > 0) {
      const alreadyInList = entriesList.some((e) =>
        (entry.email && e.email && e.email.toLowerCase().trim() === entry.email.toLowerCase().trim()) ||
        (entry.pin && e.pin && e.pin.toUpperCase().trim() === entry.pin.toUpperCase().trim())
      );
      if (!alreadyInList) {
        entriesList = [...entriesList, entry];
      }
    }

    entriesList.forEach((e) => {
      if (e.disabled || e.paymentStatus === 'Cancelado') return;
      const isPaid = isFreeEvent || e.paymentStatus === 'Confirmado' || e.paymentStatus === 'Pago' || e.paymentStatus === 'Isento';
      if (isPaid && e.categoryIds) {
        e.categoryIds.forEach((catId) => {
          map[catId] = (map[catId] || 0) + 1;
        });
      }
    });
    return map;
  }, [liveEntries, event.entries, entry, isFreeEvent, isExistingRegistration]);
  const isDoubles = (cat: EventCategory) => !isSinglePlayer && (cat.format === 'Duplas' || !cat.format || cat.name.toLowerCase().includes('dupla') || Boolean(cat.gender2));
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const effectiveDueAmount = isFreeEvent
    ? 0
    : isAdmin
      ? dueAmount
      : (event.registrationFee ?? 0) + (Math.max(0, categoryIds.length - 1) * (event.extraCategoryFee ?? 0));
  const pendingAmount = Math.max(0, effectiveDueAmount - totalPaid);

  React.useEffect(() => {
    if (!editingPaymentId && canUseManualPaymentForm) {
      const diff = Math.max(0, effectiveDueAmount - totalPaid);
      setNewAmount(diff > 0 ? diff.toFixed(2) : '');
    } else if (!canUseManualPaymentForm) {
      setNewAmount('');
    }
  }, [categoryIds, payments, effectiveDueAmount, totalPaid, editingPaymentId, canUseManualPaymentForm]);

  const pairForCategory = (categoryId: string) => event.pairs?.find((pair) => {
    const isEntryPair = pair.p1.email === entry.email || pair.p2.email === entry.email || pair.p1.pin === entry.pin || pair.p2.pin === entry.pin;
    if (!isEntryPair) return false;
    return pair.categoryId === categoryId || (!pair.categoryId && (pair.p1.categoryIds?.includes(categoryId) || pair.p2.categoryIds?.includes(categoryId)));
  });

  const pairForEmailInCategory = (targetEmail: string, categoryId: string) => event.pairs?.find((pair) => {
    const normalizedTarget = targetEmail.toLowerCase().trim();
    const isTargetPair = pair.p1.email.toLowerCase().trim() === normalizedTarget || pair.p2.email.toLowerCase().trim() === normalizedTarget;
    if (!isTargetPair) return false;
    return pair.categoryId === categoryId || (!pair.categoryId && (pair.p1.categoryIds?.includes(categoryId) || pair.p2.categoryIds?.includes(categoryId)));
  });

  const partnerEntryForCategory = (categoryId: string, partnerEmail: string) => {
    const normalizedPartnerEmail = partnerEmail.toLowerCase().trim();
    if (!normalizedPartnerEmail) return undefined;
    return (event.entries || []).find((candidate) =>
      candidate.email.toLowerCase().trim() === normalizedPartnerEmail &&
      candidate.email.toLowerCase().trim() !== email.toLowerCase().trim() &&
      candidate.categoryIds?.includes(categoryId)
    );
  };

  // ── Controle de 3 Etapas para inscrição do usuário (1: Cadastro, 2: Categorias, 3: Pagamento) ──
  const hasPaymentRecorded = !isActuallyNew && (payments.length > 0 || (entry.paidAmount ?? 0) > 0 || entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago');
  const isCancelled = !isActuallyNew && Boolean(
    disabled ||
    paymentStatus === 'Cancelado' ||
    entry.disabled ||
    entry.paymentStatus === 'Cancelado'
  );
  const isConfirmedRegistration = isExistingRegistration && !isCancelled && (
    isFreeEvent ||
    paymentStatus === 'Confirmado' ||
    paymentStatus === 'Pago' ||
    paymentStatus === 'Isento' ||
    entry.paymentStatus === 'Confirmado' ||
    entry.paymentStatus === 'Pago' ||
    entry.paymentStatus === 'Isento'
  );
  const isPendingPaymentRegistration = isExistingRegistration && !isCancelled && !isConfirmedRegistration && !isFreeEvent;
  const hasInitialCategories = !isActuallyNew && ((entry.categoryIds && entry.categoryIds.length > 0) || categoryIds.length > 0);

  const [userStep, setUserStep] = useState<1 | 2 | 3>(() => {
    if (isAdmin) return 1;
    if (isActuallyNew) return 1;
    if (hasPaymentRecorded) return 3;
    if (hasInitialCategories) return 2;
    return 1;
  });

  const [maxUnlockedStep, setMaxUnlockedStep] = useState<number>(() => {
    if (isAdmin) return 3;
    if (isActuallyNew) return 1;
    if (hasPaymentRecorded) return 3;
    if (hasInitialCategories) return 2;
    return 1;
  });

  const [acceptedRegulation, setAcceptedRegulation] = useState<boolean>(
    Boolean((!isActuallyNew && entry.joinedAt) || !event.regulationUrl)
  );

  const [cancelModalConfig, setCancelModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    type: 'delete' | 'refund_with_fee' | 'cancel_no_refund' | 'cancel_with_matches';
  } | null>(null);

  const handleSaveStep1 = () => {
    if (!isAdmin && isCancelled) {
      setFeedback('Sua inscrição está cancelada. Clique em "Ativar inscrição" abaixo para reativá-la antes de continuar.');
      return;
    }

    const trimmedName = name.trim();
    const trimmedNickname = nickname.trim();
    const trimmedEmail = email.trim();
    const cleanPhone = phone.replace(/\D/g, '').trim();

    if (!trimmedName) {
      setFeedback('Informe seu nome antes de avançar.');
      return;
    }
    if (!trimmedNickname) {
      setFeedback('Informe como quer ser chamado (apelido).');
      return;
    }
    if (!trimmedEmail) {
      setFeedback('Informe seu e-mail.');
      return;
    }
    if (!cleanPhone) {
      setFeedback('Informe seu telefone.');
      return;
    }
    if (event.regulationUrl && !acceptedRegulation) {
      setFeedback('É necessário confirmar que leu o regulamento para avançar.');
      return;
    }

    setFeedback(null);
    setUserStep(2);
    setMaxUnlockedStep((prev) => Math.max(prev, 2));
    setFeedback('✓ Cadastro confirmado! Agora escolha sua(s) categoria(s).');
  };

  const handleSaveStep2 = async () => {
    const effectiveCategoryIds = categoryIds.filter((catId) => availableCategories.some((c) => c.id === catId));
    if (effectiveCategoryIds.length === 0) {
      setFeedback('É obrigatório selecionar pelo menos uma categoria.');
      return;
    }

    // Validação de limite de vagas
    for (const catId of effectiveCategoryIds) {
      if (!initialCategoryIds.includes(catId)) {
        const cat = (event.categories || []).find((c) => c.id === catId);
        const limit = cat?.maxPlayers ?? event.maxPlayersPerCategory ?? 8;
        const confirmed = categoryConfirmedCountMap[catId] || 0;
        if (confirmed >= limit) {
          setFeedback(`Vagas esgotadas: a categoria "${cat?.name || ''}" atingiu o limite de ${limit} inscritos com pagamento confirmado.`);
          return;
        }
      }
    }

    for (const catId of effectiveCategoryIds) {
      const cat = (event.categories || []).find((c) => c.id === catId);
      if (isSinglePlayer || !cat || !isDoubles(cat)) continue;
      const pair = pairForCategory(cat.id);
      if (pair) continue;
      const partner = categoryPartners[catId] || { name: '', email: '', phone: '' };
      const cleanedPartnerPhone = (partner.phone || '').replace(/\D/g, '');
      if (!partner.name?.trim() || !partner.email?.trim() || !cleanedPartnerPhone) {
        const msg = `Informe os dados do parceiro para ${cat.abbreviation || cat.name}.`;
        setFeedback(msg);
        setExpandedPartnerCategoryIds((prev) => new Set(prev).add(cat.id));
        return;
      }
    }

    setFeedback(null);
    const saved = await save(payments, true);
    if (saved) {
      setUserStep(3);
      setMaxUnlockedStep((prev) => Math.max(prev, 3));
      setFeedback('✓ Categorias salvas com sucesso! Prossiga para o pagamento.');
    }
  };

  const handleOpenCancelModal = () => {
    const userEmail = (entry.email || email || '').toLowerCase().trim();
    const userPin = (entry.pin || pin || '').toUpperCase().trim();

    // 1. Identificar se o atleta já participou de alguma partida finalizada neste evento
    const userPairIds = new Set<string>();
    (event.pairs || []).forEach((p) => {
      const isP1 = (p.p1?.email && p.p1.email.toLowerCase().trim() === userEmail) || (p.p1?.pin && p.p1.pin.toUpperCase().trim() === userPin);
      const isP2 = (p.p2?.email && p.p2.email.toLowerCase().trim() === userEmail) || (p.p2?.pin && p.p2.pin.toUpperCase().trim() === userPin);
      if (isP1 || isP2) {
        userPairIds.add(p.id);
      }
    });

    const hasFinishedMatches = (event.matches || []).some((m) => {
      if (m.status !== 'finished') return false;
      if (m.pair1Id && userPairIds.has(m.pair1Id)) return true;
      if (m.pair2Id && userPairIds.has(m.pair2Id)) return true;
      const p1 = m.pair1;
      const p2 = m.pair2;
      if (p1) {
        const isP1 = (p1.p1?.email && p1.p1.email.toLowerCase().trim() === userEmail) || (p1.p1?.pin && p1.p1.pin.toUpperCase().trim() === userPin) ||
                     (p1.p2?.email && p1.p2.email.toLowerCase().trim() === userEmail) || (p1.p2?.pin && p1.p2.pin.toUpperCase().trim() === userPin);
        if (isP1) return true;
      }
      if (p2) {
        const isP2 = (p2.p1?.email && p2.p1.email.toLowerCase().trim() === userEmail) || (p2.p1?.pin && p2.p1.pin.toUpperCase().trim() === userPin) ||
                     (p2.p2?.email && p2.p2.email.toLowerCase().trim() === userEmail) || (p2.p2?.pin && p2.p2.pin.toUpperCase().trim() === userPin);
        if (isP2) return true;
      }
      return false;
    });

    // 2. Situações para Evento Gratuito (valor de inscrição zero)
    if (isFreeEvent) {
      if (!hasFinishedMatches) {
        // 2.a) Sem partidas realizadas: exclui a inscrição
        setCancelModalConfig({
          isOpen: true,
          title: 'Cancelar inscrição?',
          message: 'Tem certeza que deseja cancelar sua inscrição? Sua inscrição será excluída imediatamente deste evento.',
          confirmLabel: 'Sim, excluir inscrição',
          type: 'delete',
        });
      } else {
        // 2.b) Com partida(s) realizada(s): cancela e impede de jogar
        setCancelModalConfig({
          isOpen: true,
          title: 'Cancelar inscrição com partidas realizadas?',
          message: 'Sua inscrição será cancelada mesmo já tendo partida(s) realizada(s). Você não poderá mais formar time e participar de partidas. Deseja prosseguir com o cancelamento?',
          confirmLabel: 'Confirmar cancelamento',
          type: 'cancel_with_matches',
        });
      }
      return;
    }

    // 3. Situações para Evento Pago
    // 1) Caso o usuário tentar cancelar sua inscrição mas se tiver partida finalizada
    if (hasFinishedMatches) {
      setCancelModalConfig({
        isOpen: true,
        title: 'Cancelar inscrição sem reembolso?',
        message: 'Sua inscrição será cancelada, mas não haverá reembolso por haver partida(s) realizada(s). Deseja prosseguir com o cancelamento?',
        confirmLabel: 'Confirmar cancelamento',
        type: 'cancel_with_matches',
      });
      return;
    }

    // Se não tiver partida finalizada:
    const hasPayment = payments.length > 0 || (entry.paidAmount ?? 0) > 0 || entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago';

    if (!hasPayment) {
      // Sem pagamento registrado: exclui
      setCancelModalConfig({
        isOpen: true,
        title: 'Cancelar e excluir inscrição?',
        message: 'Tem certeza que deseja cancelar sua inscrição? Como não há pagamentos registrados, sua inscrição será excluída imediatamente deste evento.',
        confirmLabel: 'Sim, excluir inscrição',
        type: 'delete',
      });
    } else {
      const today = new Date().toISOString().split('T')[0];
      const isWithinPeriod = !event.endDate || today <= event.endDate;

      if (isWithinPeriod) {
        // Com pagamento confirmado e dentro do prazo de inscrição
        setCancelModalConfig({
          isOpen: true,
          title: 'Cancelar inscrição com reembolso?',
          message: 'Sua inscrição será cancelada. O reembolso será realizado em até 5 dias úteis e será cobrada uma taxa administrativa de 30% do valor da inscrição.\n\nDeseja prosseguir com o cancelamento?',
          confirmLabel: 'Confirmar cancelamento',
          type: 'refund_with_fee',
        });
      } else {
        // Com pagamento confirmado e fora do prazo de inscrição
        setCancelModalConfig({
          isOpen: true,
          title: 'Cancelar inscrição fora do prazo?',
          message: 'Sua inscrição será cancelada, mas não haverá reembolso por estar fora do prazo de cancelamento.\n\nDeseja prosseguir com o cancelamento?',
          confirmLabel: 'Confirmar cancelamento',
          type: 'cancel_no_refund',
        });
      }
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalConfig) return;
    const { type } = cancelModalConfig;
    setCancelModalConfig(null);

    try {
      if (type === 'delete') {
        if (onDelete) {
          onDelete();
        } else {
          const db = getDb();
          const targetEmail = entry.email || email;
          if (db && event.pin && targetEmail) {
            const { deleteEventEntry, deleteUserEventRegistration } = await import('@infra/firebase/events');
            await deleteEventEntry(db as Firestore, event.pin, targetEmail);
            await deleteUserEventRegistration(db as Firestore, targetEmail, event.pin).catch(() => {});
          }
          if (onCancel) onCancel();
        }
      } else {
        let reason = '';
        if (type === 'cancel_with_matches') {
          reason = isFreeEvent
            ? 'Cancelamento solicitado pelo participante com partida(s) já realizada(s) (evento gratuito)'
            : 'Cancelamento solicitado pelo participante com partida(s) já realizada(s) (sem reembolso)';
        } else if (type === 'refund_with_fee') {
          reason = 'Cancelamento solicitado pelo participante dentro do prazo (taxa de 30%)';
        } else {
          reason = 'Cancelamento solicitado pelo participante fora do prazo (sem reembolso)';
        }

        const updatedEntry: TournamentEntry = {
          ...entry,
          paymentStatus: 'Cancelado',
          disabled: true,
          disabledReason: reason,
        };

        setPaymentStatus('Cancelado');
        setDisabled(true);
        setDisabledReason(reason);

        await onSave(updatedEntry);
        setFeedback('✓ Inscrição cancelada com sucesso.');
        setTimeout(() => {
          if (onCancel) onCancel();
        }, 1500);
      }
    } catch (err) {
      console.error('Erro ao cancelar inscrição:', err);
      setFeedback('Erro ao processar o cancelamento da inscrição.');
    }
  };

  const handleFormTeam = async (cat: EventCategory, partnerEntry: TournamentEntry) => {
    if (!onUpdateEvent) return;
    if (isCancelled || partnerEntry.disabled || partnerEntry.paymentStatus === 'Cancelado') {
      setFeedback('Não é possível formar time com inscrição cancelada ou desativada.');
      return;
    }
    const currentEntry = buildEntry();
    const pairs = event.pairs || [];
    const teamNumber = Math.max(
      0,
      ...pairs.map((pair, index) => pair.teamNumber || Number(pair.teamCode?.match(/^\d{3}/)?.[0]) || index + 1)
    ) + 1;
    const [orderedP1, orderedP2] = orderPairEntriesForMixed(currentEntry, partnerEntry);
    const newPair: TournamentPair = {
      id: `pair_${Date.now()}`,
      p1: orderedP1,
      p2: orderedP2,
      categoryId: cat.id,
      teamNumber,
      teamCode: `${String(teamNumber).padStart(3, '0')} - ${cat.abbreviation}`,
    };
    const updatedEntries = (event.entries || []).map((item) => item.pin === entry.pin ? currentEntry : item);
    await onSave(currentEntry);
    onUpdateEvent({ ...event, entries: updatedEntries, pairs: [...pairs, newPair] });
    setConfirmTeamCategoryId(null);
  };

  const togglePartnerForm = (categoryId: string) => {
    setExpandedPartnerCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
    setConfirmTeamCategoryId((current) => current === categoryId ? null : current);
  };

  const toggleCategory = (categoryId: string) => {
    const isAlreadySelected = categoryIds.includes(categoryId);
    if (!isAlreadySelected) {
      const cat = categories.find((c) => c.id === categoryId);
      const limit = cat?.maxPlayers ?? event.maxPlayersPerCategory ?? 8;
      const confirmed = categoryConfirmedCountMap[categoryId] || 0;
      const isAlreadyInEntry = (entry.categoryIds || []).includes(categoryId);
      if (!isAlreadyInEntry && confirmed >= limit) {
        setFeedback(`Vagas esgotadas: a categoria "${cat?.name || ''}" atingiu o limite de ${limit} inscritos com pagamento confirmado.`);
        return;
      }
    }
    setCategoryIds((ids) => {
      const next = ids.includes(categoryId) ? ids.filter((id) => id !== categoryId) : [...ids, categoryId];
      setDueAmount((event.registrationFee ?? 0) + (Math.max(0, next.length - 1) * (event.extraCategoryFee ?? 0)));
      if (!next.includes(categoryId)) {
        setConfirmTeamCategoryId((current) => current === categoryId ? null : current);
        setExpandedPartnerCategoryIds((current) => {
          const nextExpanded = new Set(current);
          nextExpanded.delete(categoryId);
          return nextExpanded;
        });
      }
      return next;
    });
  };

  const updateCategoryPartner = (categoryId: string, field: keyof CategoryPartnerInfo, value: string) => {
    setCategoryPartners((current) => ({
      ...current,
      [categoryId]: {
        name: current[categoryId]?.name || '',
        email: current[categoryId]?.email || '',
        phone: current[categoryId]?.phone || '',
        [field]: field === 'phone' ? value.replace(/\D/g, '').slice(0, 11) : value,
      },
    }));
  };

  const handleToggleGender = () => {
    const nextGender = gender === 'M' ? 'F' : 'M';
    setGender(nextGender);
    const nextAvailable = categories.filter((cat) => !cat.gender1 || cat.gender1 === nextGender || cat.gender2 === nextGender);
    const nextAvailableIds = new Set(nextAvailable.map((c) => c.id));
    setCategoryIds((prev) => prev.filter((id) => nextAvailableIds.has(id)));
  };

  const buildEntry = (nextPayments = payments, targetCategoryIds = categoryIds): TournamentEntry => {
    const normalizedName = name.trim() || entry.name;
    const normalizedPin = isAdmin
      ? (pin.trim().toUpperCase() || entry.pin || `TEMP${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
      : (entry.pin || `TEMP${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
    const selectedCategoryPartners: Record<string, CategoryPartnerInfo> = {};
    for (const catId of targetCategoryIds) {
      const partner = categoryPartners[catId];
      if (partner) {
        const trimmedName = partner.name?.trim() || '';
        const trimmedEmail = partner.email?.trim().toLowerCase() || '';
        const cleanedPhone = (partner.phone || '').replace(/\D/g, '');
        if (trimmedName || trimmedEmail || cleanedPhone) {
          selectedCategoryPartners[catId] = {
            name: trimmedName,
            email: trimmedEmail,
            phone: cleanedPhone,
          };
        }
      }
    }
    const firstPartner = Object.values(selectedCategoryPartners)[0];
    const updated: TournamentEntry = {
      ...entry,
      registrationId: entry.registrationId || registrationId,
      name: normalizedName,
      pin: normalizedPin,
      email: email.trim().toLowerCase(),
      nickname: nickname.trim() || entry.nickname,
      phone: phone.replace(/\D/g, ''),
      shirtSize,
      gender,
      categoryIds: targetCategoryIds,
      dueAmount: effectiveDueAmount,
      paymentStatus: (isFreeEvent && paymentStatus !== 'Cancelado') ? 'Confirmado' : paymentStatus,
      payments: nextPayments,
      paidAmount: nextPayments.reduce((sum, payment) => sum + payment.amount, 0),
      partnerName: firstPartner?.name || undefined,
      partnerEmail: firstPartner?.email || undefined,
      partnerPhone: firstPartner?.phone || undefined,
      categoryPartners: Object.keys(selectedCategoryPartners).length > 0 ? selectedCategoryPartners : undefined,
      disabled: Boolean(disabled),
      disabledReason: disabled ? disabledReason.trim() : '',
    };
    return updated;
  };

  const handleReactivateRegistration = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const restoredStatus = (hasPaymentRecorded || isFreeEvent) ? 'Confirmado' : 'Pendente';
      setDisabled(false);
      setDisabledReason('');
      setPaymentStatus(restoredStatus);

      const baseEntry = buildEntry();
      const updatedEntry: TournamentEntry = {
        ...baseEntry,
        disabled: false,
        disabledReason: '',
        paymentStatus: restoredStatus,
      };

      await onSave(updatedEntry);
      setFeedback('✓ Inscrição ativada com sucesso!');
    } catch (err) {
      console.error('Erro ao ativar inscrição:', err);
      setFeedback('Erro ao ativar inscrição. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const initialCategoryIds = useMemo(() => entry.categoryIds || [], [entry.categoryIds]);

  const save = async (nextPayments: PaymentItem[] = payments, skipFeedback = false): Promise<TournamentEntry | null> => {
    const trimmedName = name.trim();
    const trimmedNickname = nickname.trim();
    const trimmedEmail = email.trim();
    const cleanPhone = phone.replace(/\D/g, '').trim();

    if (isAdmin && !trimmedName) {
      setFeedback('Informe o nome do jogador antes de salvar.');
      return null;
    }
    if (!trimmedNickname) {
      setFeedback('Informe como quer ser chamado (apelido) antes de salvar.');
      return null;
    }
    if (!trimmedEmail) {
      setFeedback('Informe o e-mail antes de salvar.');
      return null;
    }
    if (!cleanPhone) {
      setFeedback('Informe o telefone.');
      return null;
    }
    if (disabled && !disabledReason.trim()) {
      setFeedback('Informe o motivo da desativação da inscrição.');
      return null;
    }
    // Validação de duplicidade: não permitir que o mesmo usuário se inscreva 2 vezes no mesmo evento
    if (canEditIdentity && !skipFeedback) {
      const normalizedEmail = trimmedEmail.toLowerCase();
      const normalizedPin = pin.trim().toUpperCase();
      const alreadyRegistered = (event.entries || []).some((e) => {
        if (entry.registrationId && e.registrationId === entry.registrationId) return false;
        if (entry.email && e.email?.toLowerCase().trim() === normalizedEmail) return false;
        if (entry.pin && e.pin?.toUpperCase().trim() === normalizedPin) return false;

        const entryEmail = e.email?.toLowerCase().trim();
        const entryPin = e.pin?.toUpperCase().trim();
        return (entryEmail && entryEmail === normalizedEmail) || (normalizedPin && entryPin && entryPin === normalizedPin);
      });

      if (alreadyRegistered) {
        setFeedback('Este participante já está inscrito neste evento.');
        return null;
      }
    }

    const effectiveCategoryIds = categoryIds.filter((catId) => availableCategories.some((c) => c.id === catId));
    if (effectiveCategoryIds.length === 0) {
      setFeedback('É obrigatório selecionar pelo menos uma categoria para a inscrição.');
      return null;
    }

    // Validação de limite de jogadores com pagamento confirmado por categoria
    for (const catId of effectiveCategoryIds) {
      if (!initialCategoryIds.includes(catId)) {
        const cat = (event.categories || []).find((c) => c.id === catId);
        const limit = cat?.maxPlayers ?? event.maxPlayersPerCategory ?? 8;
        const confirmed = categoryConfirmedCountMap[catId] || 0;
        if (confirmed >= limit) {
          setFeedback(`Vagas esgotadas: a categoria "${cat?.name || ''}" atingiu o limite de ${limit} inscritos com pagamento confirmado.`);
          return null;
        }
      }
    }

    for (const catId of effectiveCategoryIds) {
      const cat = (event.categories || []).find((c) => c.id === catId);
      if (isSinglePlayer || !cat || !isDoubles(cat)) continue;
      const pair = pairForCategory(cat.id);
      if (pair) continue; // Se já tem time formado, não precisa exigir dados do parceiro novamente
      const partner = categoryPartners[catId] || { name: '', email: '', phone: '' };
      const cleanedPartnerPhone = (partner.phone || '').replace(/\D/g, '');
      if (!partner.name?.trim() || !partner.email?.trim() || !cleanedPartnerPhone) {
        const msg = `Informe os dados do parceiro para ${cat.abbreviation || cat.name}.`;
        setFeedback(msg);
        setExpandedPartnerCategoryIds((prev) => new Set(prev).add(cat.id));
        return null;
      }
    }

    const parsedAmount = Number(newAmount.replace(',', '.'));
    const willAddPayment = canUseManualPaymentForm && Boolean(parsedAmount && parsedAmount > 0);
    const hasReceipt = Boolean(newReceipt?.url || (editingPaymentId && payments.find((p) => p.id === editingPaymentId)?.receiptUrl));

    if (willAddPayment && !hasReceipt && !isAdmin) {
      setFeedback('O comprovante é obrigatório para registrar o pagamento.');
      return null;
    }

    let paymentsToSave = nextPayments;
    let addedPaymentItem: PaymentItem | null = null;
    if (willAddPayment && (hasReceipt || isAdmin)) {
      const date = new Date(`${newDate}T12:00:00`).getTime();
      if (editingPaymentId) {
        paymentsToSave = paymentsToSave.map((payment) => {
          if (payment.id !== editingPaymentId) return payment;
          const item: PaymentItem = { id: payment.id, amount: parsedAmount, date };
          const rUrl = newReceipt?.url || payment.receiptUrl;
          const rName = newReceipt?.name || payment.receiptFileName;
          if (rUrl) item.receiptUrl = rUrl;
          if (rName) item.receiptFileName = rName;
          return item;
        });
        addedPaymentItem = paymentsToSave.find((p) => p.id === editingPaymentId) || null;
      } else {
        const newItem: PaymentItem = {
          id: `pay-${Date.now()}`,
          amount: parsedAmount,
          date,
          ...(newReceipt?.url ? { receiptUrl: newReceipt.url } : {}),
          ...(newReceipt?.name ? { receiptFileName: newReceipt.name } : {}),
        };
        paymentsToSave = [...paymentsToSave, newItem];
        addedPaymentItem = newItem;
      }
    }

    const totalPaymentsCount = paymentsToSave.length;
    // Comprovante manual só é obrigatório para eventos manuais; evento Pix do Mercado Pago é gerado online
    if (!usesAutomaticPayment && canUseManualPaymentForm && effectiveDueAmount > 0 && paymentStatus !== 'Isento' && totalPaymentsCount === 0) {
      setFeedback('É obrigatório informar o pagamento e anexar o comprovante para realizar a inscrição.');
      return null;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      if (willAddPayment && (hasReceipt || isAdmin)) {
        setPayments(paymentsToSave);
        setNewAmount('');
        setNewReceipt(null);
        setEditingPaymentId(null);
      }

      // Para NOVAS inscrições, re-busca as entries frescas no momento do save
      // para garantir que o registrationId seja único mesmo em inscrições simultâneas
      let freshRegistrationId: number | string | undefined = entry.registrationId;
      if (!entry.registrationId) {
        const db = getDb();
        if (db && event.pin) {
          try {
            const freshEntries = await fetchEventEntries(db as Firestore, event.pin);
            setLiveEntries(freshEntries as unknown as TournamentEntry[]);
            freshRegistrationId = getNextRegistrationId(freshEntries);
          } catch (err) {
            console.warn('[EventRegistrationForm] Erro ao buscar entries frescas no save:', err);
            freshRegistrationId = getNextRegistrationId(liveEntries);
          }
        } else {
          freshRegistrationId = getNextRegistrationId(liveEntries);
        }
      }

      const cleanEntry = buildEntry(paymentsToSave, effectiveCategoryIds);
      // Garante que o ID calculado com entries frescas é aplicado
      if (freshRegistrationId !== undefined) {
        cleanEntry.registrationId = Number(freshRegistrationId);
      }

      const jsonClean = JSON.parse(JSON.stringify(cleanEntry));
      await onSave(jsonClean);
      if (!skipFeedback) {
        setFeedback('✓ Inscrição salva com sucesso!');
      }

      // Sincroniza o telefone e o gênero com o cadastro do usuário (perfil)
      if (cleanEntry.email) {
        try {
          const db = getDb();
          const userUpdates: Record<string, unknown> = {};
          if (cleanPhone) userUpdates.phone = cleanPhone;
          if (cleanEntry.gender) userUpdates.gender = cleanEntry.gender;

          if (db && Object.keys(userUpdates).length > 0) {
            const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
            await setDoc(doc(db as Firestore, 'users', cleanEntry.email.toLowerCase().trim()), {
              ...userUpdates,
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }
          const savedLocal = localStorage.getItem('myPlacarUserProfile');
          if (savedLocal) {
            try {
              const parsed = JSON.parse(savedLocal);
              if (!parsed.email || parsed.email.toLowerCase() === cleanEntry.email.toLowerCase()) {
                if (cleanPhone) parsed.phone = cleanPhone;
                if (cleanEntry.gender) parsed.gender = cleanEntry.gender;
                localStorage.setItem('myPlacarUserProfile', JSON.stringify(parsed));
                window.dispatchEvent(new Event('storage'));
              }
            } catch (e) {}
          }
        } catch (e) {
          console.warn('Erro ao atualizar telefone/gênero no perfil:', e);
        }
      }

      // Envio automático dos avisos do sistema para edições de inscrições existentes (Imagem 2)
      const isExistingEntry = initialCategoryIds.length > 0;
      const db = getDb();
      if (db && isExistingEntry) {
        const { eventNotificationService } = await import('../services/eventNotificationService');

        // c) Novas categorias adicionadas após já estar inscrito (Imagem 2)
        const newlyAddedCategoryIds = categoryIds.filter((id) => !initialCategoryIds.includes(id));
        for (const catId of newlyAddedCategoryIds) {
          const catObj = (event.categories || []).find((c) => c.id === catId);
          if (catObj) {
            void eventNotificationService.notifyNewCategory(db as Firestore, event, cleanEntry, catObj);
          }
        }

        // b) Novo pagamento registrado em inscrição existente (Imagem 2)
        if (addedPaymentItem) {
          void eventNotificationService.notifyPaymentCreated(db as Firestore, event, cleanEntry, addedPaymentItem);
        }

        // a) Inscrição confirmada pelo admin (uma única vez)
        if (cleanEntry.paymentStatus === 'Confirmado' || cleanEntry.paymentStatus === 'Pago' || cleanEntry.paymentStatus === 'Isento') {
          void eventNotificationService.notifyRegistrationConfirmed(db as Firestore, event, cleanEntry);
        }
      }

      return jsonClean;
    } catch (error) {
      console.error('Erro ao salvar inscrição:', error);
      const failure = error as { code?: string; message?: string };
      const message = failure.code === 'permission-denied'
        ? 'Sem permissão para salvar esta inscrição. Verifique seu acesso administrativo.'
        : failure.code === 'already-exists'
          ? 'Já existe uma inscrição com este PIN ou e-mail.'
          : failure.message || 'Não foi possível salvar a inscrição. Confira os campos obrigatórios.';
      setFeedback(message);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const checkPixPaymentConfirmation = async (paymentId: string, targetEmail: string, isManualClick: boolean = false) => {
    setIsCheckingPaymentStatus(true);
    try {
      const status = await getMercadoPagoPaymentStatus({
        paymentId,
        eventPin: event.pin,
        email: targetEmail,
      });

      if (status.status === 'approved') {
        stopPolling();
        setPixPayment(null);
        setPaymentStatus('Confirmado');
        // Limpa paymentId pendente do localStorage e do estado
        setPendingPaymentId(null);
        setSavedPixData(null);
        try {
          const lsKey = `mp_pending_${event.pin}_${targetEmail}`;
          const dataKey = `mp_pending_data_${event.pin}_${targetEmail}`;
          localStorage.removeItem(lsKey);
          localStorage.removeItem(dataKey);
        } catch {}

        const payAmount = pixPayment?.amount || Number(dueAmount) || 0;
        const newPayItem: PaymentItem = {
          id: `mp-${paymentId}`,
          amount: payAmount,
          date: Date.now(),
          provider: 'mercadopago',
          providerPaymentId: paymentId,
          receiptFileName: `Pix Mercado Pago #${paymentId}`,
        };

        const alreadyRecorded = payments.some(
          (p) => p.id === newPayItem.id || String(p.providerPaymentId || '') === String(paymentId)
        );
        const nextPayments = alreadyRecorded ? payments : [...payments, newPayItem];

        setPayments(nextPayments);
        playPaymentSuccessSound();
        setFeedback('✅ Pagamento Pix confirmado com sucesso!');
        setIsPayingPix(false);

        // Salva e atualiza o evento e a inscrição automaticamente
        const saved = await save(nextPayments, true);
        if (!saved) {
          const finalEntry: TournamentEntry = {
            ...entry,
            name: name.trim(),
            nickname: nickname.trim() || name.trim(),
            email: email.trim(),
            pin: pin.trim().toUpperCase(),
            phone: phone.replace(/\D/g, '').trim(),
            shirtSize,
            gender,
            categoryIds,
            dueAmount,
            paidAmount: payAmount,
            paymentStatus: 'Confirmado',
            payments: nextPayments,
            joinedAt: entry.joinedAt || Date.now(),
          };
          await onSave(finalEntry);
        }
        return true;
      } else if (isManualClick) {
        setFeedback('⏳ Pagamento ainda não identificado como aprovado pelo Mercado Pago. Aguarde alguns segundos e tente novamente.');
      }
    } catch (err) {
      console.warn('Erro ao checar status do pagamento Pix:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao consultar status do pagamento.';
      setFeedback(msg);
    } finally {
      setIsCheckingPaymentStatus(false);
    }
    return false;
  };

  React.useEffect(() => {
    if (!pixPayment) return;
    const targetEmail = (entry.email || email).toLowerCase().trim();
    const handleRecheck = () => {
      void checkPixPaymentConfirmation(pixPayment.paymentId, targetEmail);
    };

    window.addEventListener('focus', handleRecheck);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleRecheck();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleRecheck);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pixPayment, entry.email, email]);

  const handleAdminQuickConfirmWithTxCode = async () => {
    const cleanTx = adminTxCode.trim();
    if (!cleanTx) {
      setFeedback('Informe o código da transação do Mercado Pago.');
      return;
    }
    setIsAdminConfirmingTx(true);
    setFeedback(null);
    try {
      const payAmount = pendingAmount > 0 ? pendingAmount : Number(dueAmount) || 0;
      const newPayItem: PaymentItem = {
        id: `mp-tx-${cleanTx}`,
        amount: payAmount,
        date: Date.now(),
        provider: 'mercadopago',
        providerPaymentId: cleanTx,
        receiptFileName: `Transação Mercado Pago #${cleanTx}`,
      };

      const nextPayments = [...payments, newPayItem];
      setPayments(nextPayments);
      setPaymentStatus('Confirmado');
      setPendingPaymentId(null);
      setSavedPixData(null);
      try {
        const targetEmail = (entry.email || email).toLowerCase().trim();
        localStorage.removeItem(`mp_pending_${event.pin}_${targetEmail}`);
        localStorage.removeItem(`mp_pending_data_${event.pin}_${targetEmail}`);
      } catch {}

      playPaymentSuccessSound();
      setFeedback('✅ Inscrição confirmada com sucesso via transação Mercado Pago!');
      setShowAdminTxForm(false);
      setAdminTxCode('');

      // Salva no banco
      await save(nextPayments, true);
    } catch (err) {
      console.error('Erro ao confirmar via código de transação:', err);
      setFeedback('Erro ao registrar confirmação da transação.');
    } finally {
      setIsAdminConfirmingTx(false);
    }
  };

  const handlePayViaPix = async () => {
    if (isSaving || isPayingPix) return;
    setIsPayingPix(true);
    setFeedback(null);
    try {
      // 1. Salva a inscrição antes de gerar o pagamento
      const savedEntry = await save(payments, true);
      if (!savedEntry) {
        setIsPayingPix(false);
        return;
      }

      // 2. Cria o pagamento Pix via Checkout Transparente
      const targetEmail = (savedEntry.email || email).toLowerCase().trim();
      const result = await createMercadoPagoPixPayment({
        eventPin: event.pin,
        entryEmail: targetEmail,
      });

      setPixPayment(result);
      setSavedPixData(result);

      // 3. Persiste o paymentId e os dados do Pix no localStorage para recuperação futura
      setPendingPaymentId(result.paymentId);
      try {
        const lsKey = `mp_pending_${event.pin}_${targetEmail}`;
        const dataKey = `mp_pending_data_${event.pin}_${targetEmail}`;
        localStorage.setItem(lsKey, result.paymentId);
        localStorage.setItem(dataKey, JSON.stringify(result));
      } catch {}

      // 4. Inicia polling a cada 4s para verificar confirmação
      stopPolling();
      pollingRef.current = setInterval(() => {
        void checkPixPaymentConfirmation(result.paymentId, targetEmail);
      }, 4000);
    } catch (err) {
      console.error('Erro ao iniciar pagamento Pix:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao iniciar pagamento Pix.';
      setFeedback(msg);
      setIsPayingPix(false);
    }
  };

  const handleCancelPixPayment = () => {
    stopPolling();
    setPixPayment(null);
    setIsPayingPix(false);
  };


  const addPayment = async () => {
    const amount = Number(newAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;

    const hasReceipt = newReceipt?.url || (editingPaymentId && payments.find((p) => p.id === editingPaymentId)?.receiptUrl);
    if (!hasReceipt) {
      setFeedback('O comprovante é obrigatório para registrar o pagamento.');
      return;
    }

    const date = new Date(`${newDate}T12:00:00`).getTime();
    const newPayItem: PaymentItem = {
      id: `pay-${Date.now()}`,
      amount,
      date,
      ...(newReceipt?.url ? { receiptUrl: newReceipt.url } : {}),
      ...(newReceipt?.name ? { receiptFileName: newReceipt.name } : {}),
    };
    const next = editingPaymentId
      ? payments.map((payment) => {
          if (payment.id !== editingPaymentId) return payment;
          const item: PaymentItem = { id: payment.id, amount, date };
          const rUrl = newReceipt?.url || payment.receiptUrl;
          const rName = newReceipt?.name || payment.receiptFileName;
          if (rUrl) item.receiptUrl = rUrl;
          if (rName) item.receiptFileName = rName;
          return item;
        })
      : [...payments, newPayItem];
    setPayments(next);
    setEditingPaymentId(null);
    setNewAmount('');
    setNewReceipt(null);
    await save(next);
  };

  const removePayment = async (id: string) => {
    const next = payments.filter((payment) => payment.id !== id);
    setPayments(next);
    if (editingPaymentId === id) setEditingPaymentId(null);
    await save(next);
  };

  const handleDeleteWithConfirmation = () => {
    if (!onDelete) return;
    onDelete();
  };

  return <div className="space-y-4 text-left">
    {!isAdmin && (event.information || event.regulationUrl || event.locationMapUrl) && <div className="space-y-2">
      {event.information && <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-[10px] font-black tracking-wider text-sky-600">Informações do evento</p><p className="text-xs font-bold leading-relaxed whitespace-pre-wrap text-slate-700 mt-1">{event.information}</p></div>}
      {event.locationMapUrl && (
        <a href={event.locationMapUrl} target="_blank" rel="noopener noreferrer" className="w-full h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-black text-xs flex items-center justify-center gap-2">
          📍 Abrir no Google Maps {event.location ? `(${event.location})` : ''}
        </a>
      )}
      {event.regulationUrl && (
        <button
          type="button"
          onClick={() => openPdfOrUrl(event.regulationUrl!, event.regulationFileName || 'regulamento.pdf')}
          className="w-full h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 font-black text-xs flex items-center justify-center gap-2 hover:bg-amber-100 active:scale-98 transition-all cursor-pointer"
        >
          <Eye size={15} /> Regulamento
        </button>
      )}
    </div>}

    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
      <h4 className="text-sm font-black text-slate-800">{isAdmin ? 'Editar inscrição' : 'Inscrição no torneio'}</h4>
      {isAdmin && !readOnly && onDelete && (
        <button
          type="button"
          onClick={handleDeleteWithConfirmation}
          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
          title="Excluir inscrição"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>

    {/* Stepper das 3 Etapas para o Usuário */}
    {!isAdmin && (
      <div className="flex items-center justify-between gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 mb-1">
        {[
          { step: 1, label: '1. Cadastro' },
          { step: 2, label: '2. Categorias' },
          { step: 3, label: '3. Pagamento' },
        ].map((item) => {
          const isCurrent = userStep === item.step;
          const isUnlocked = item.step <= maxUnlockedStep;
          return (
            <button
              key={item.step}
              type="button"
              disabled={!isUnlocked}
              onClick={() => isUnlocked && setUserStep(item.step as 1 | 2 | 3)}
              className={`flex-1 py-2.5 px-2 text-center text-xs font-black rounded-xl transition-all ${
                isCurrent
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : isUnlocked
                  ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
                  : 'text-slate-400 cursor-not-allowed opacity-50'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    )}

    {/* Banner de Status da Inscrição */}
    {isExistingRegistration && (
      <>
        {isCancelled ? (
          <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-200 text-red-800 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-red-600 shrink-0" size={18} />
              <span className="text-xs font-black uppercase tracking-wider">
                Inscrição Cancelada
              </span>
            </div>
            <p className="text-xs text-red-700 font-bold leading-relaxed">
              Esta inscrição está cancelada. Enquanto estiver cancelada, você não poderá formar time nem participar de partidas.
            </p>
            {(disabledReason || entry.disabledReason) && (
              <div className="text-[11px] text-red-600 bg-white/80 p-2.5 rounded-xl border border-red-100">
                <strong>Motivo:</strong> {disabledReason || entry.disabledReason}
              </div>
            )}
            <button
              type="button"
              onClick={handleReactivateRegistration}
              disabled={isSaving}
              className="w-full py-2.5 px-4 rounded-2xl border-2 border-emerald-500 bg-white hover:bg-emerald-50 text-emerald-700 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-xs disabled:opacity-60"
            >
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>{isSaving ? 'Ativando inscrição...' : 'Ativar inscrição'}</span>
            </button>
          </div>
        ) : isConfirmedRegistration ? (
          <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-800 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
                <span className="text-xs font-black uppercase tracking-wider">
                  Inscrição Ativa
                </span>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                Confirmada
              </span>
            </div>
            <p className="text-xs text-emerald-700 font-medium leading-relaxed">
              {isFreeEvent
                ? 'Sua inscrição está confirmada no evento gratuito e você está apto(a) a participar do torneio.'
                : 'Pagamento confirmado! Sua inscrição está ativa e você está apto(a) a participar do torneio.'}
            </p>
            <button
              type="button"
              onClick={handleOpenCancelModal}
              className="w-full py-2.5 px-4 rounded-2xl border border-red-200 bg-white hover:bg-red-50 text-red-700 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-xs"
            >
              <Trash2 size={15} />
              <span>Cancelar inscrição</span>
            </button>
          </div>
        ) : isPendingPaymentRegistration ? (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-200 text-amber-800 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="text-amber-600 shrink-0" size={18} />
                <span className="text-xs font-black uppercase tracking-wider">
                  Inscrição Pendente de Pagamento
                </span>
              </div>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                Pendente
              </span>
            </div>
            <p className="text-xs text-amber-700 font-medium leading-relaxed">
              Aguardando a confirmação do pagamento para garantir sua vaga no torneio.
            </p>
            <button
              type="button"
              onClick={handleOpenCancelModal}
              className="w-full py-2.5 px-4 rounded-2xl border border-red-200 bg-white hover:bg-red-50 text-red-700 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-xs"
            >
              <Trash2 size={15} />
              <span>Cancelar inscrição</span>
            </button>
          </div>
        ) : null}
      </>
    )}

    {/* Alerta de Feedback */}
    {feedback && (
      (() => {
        const isSuccess = Boolean(
          feedback.includes('sucesso') ||
          feedback.includes('✓') ||
          feedback.includes('✅') ||
          feedback.toLowerCase().includes('confirmad') ||
          feedback.toLowerCase().includes('salv')
        );

        return (
          <div className={`p-3 rounded-2xl flex items-center gap-2 border text-xs font-black animate-in fade-in slide-in-from-top-1 ${
            isSuccess
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {isSuccess ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <AlertCircle size={18} className="shrink-0 text-red-600" />}
            <span>{feedback}</span>
          </div>
        );
      })()
    )}

    {/* ── ETAPA 1: CADASTRO ── */}
    {(isAdmin || userStep === 1) && (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Inscrição_ID">
            <div className="event-registration-readonly font-mono font-black text-emerald-600 tracking-wider">
              {formatRegistrationId(entry.registrationId || registrationId)}
            </div>
          </Field>
          <Field label={canEditIdentity ? 'Nome jogador *' : 'Nome do usuário'} className="col-span-2">
            {canEditIdentity ? (
              <input required value={name} onChange={(e) => setName(e.target.value)} className="event-registration-field" />
            ) : (
              <div className="event-registration-readonly">{entry.name || name}</div>
            )}
          </Field>
          <Field label="PIN do usuário">
            {canEditIdentity ? (
              <div className="space-y-1">
                <div className="relative">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.toUpperCase())}
                    placeholder="Ex: CARLO"
                    className="event-registration-field uppercase"
                  />
                  {isSearchingPin && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
                {pinLookupMessage && (
                  <p className={`text-[10px] font-black ${
                    pinLookupMessage.includes('apto')
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}>
                    {pinLookupMessage}
                  </p>
                )}
              </div>
            ) : (
              <div className="event-registration-readonly">{entry.pin || pin || '-'}</div>
            )}
          </Field>
          <Field label="E-mail *" className="col-span-2">
            {canEditIdentity ? (
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="event-registration-field" />
            ) : (
              <div className="event-registration-readonly">{entry.email || email}</div>
            )}
          </Field>
        </div>

        {/* Como quer ser chamado + Gênero conforme Imagem 2 */}
        <Field label="Como quer ser chamado *">
          <div className="flex gap-2">
            <input
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Como quer ser chamado"
              className="event-registration-field flex-1"
            />
            <button
              type="button"
              onClick={handleToggleGender}
              className={`w-11 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                gender === 'F'
                  ? 'bg-pink-50 text-pink-600 border-pink-100 hover:bg-pink-100'
                  : 'bg-sky-50 text-sky-600 border-sky-100 hover:bg-sky-100'
              }`}
              title={gender === 'F' ? 'Feminino (clique para alternar)' : 'Masculino (clique para alternar)'}
            >
              {gender === 'F' ? <VenusIcon size={18} /> : <MarsIcon size={18} />}
            </button>
          </div>
        </Field>

        {/* Tamanho camiseta e Telefone alinhados na mesma linha conforme Imagem 2 */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tamanho camiseta *">
            <select
              required
              value={shirtSize}
              onChange={(e) => setShirtSize(e.target.value as 'P' | 'M' | 'G')}
              className="event-registration-field"
            >
              <option value="P">P</option>
              <option value="M">M</option>
              <option value="G">G</option>
            </select>
          </Field>
          <Field label="Telefone *" className="col-span-2">
            <input
              type="tel"
              required
              inputMode="numeric"
              value={formatPhone(phone)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="(11) 91234-9988"
              className="event-registration-field"
            />
          </Field>
        </div>

        {/* Bloco Desativar Inscrição: SOMENTE NO PAINEL DO ADMIN */}
        {isAdmin && (
          <div className={`p-3.5 rounded-2xl border transition-all ${disabled ? 'bg-blue-50/70 border-blue-200' : 'bg-slate-50 border-slate-200/80'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className={`text-xs font-black block ${disabled ? 'text-blue-700' : 'text-slate-700'}`}>Desativar inscrição</label>
                <p className="text-[10px] text-slate-400 font-bold">Impede o jogador de formar duplas ou participar de partidas</p>
              </div>
              {/* Toggle switch estilo iOS */}
              <button
                type="button"
                role="switch"
                aria-checked={disabled}
                onClick={() => {
                  if (disabled) {
                    setDisabled(false);
                    setDisabledReason('');
                  } else {
                    setDisabled(true);
                  }
                }}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  disabled ? 'bg-blue-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
                    disabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {disabled && (
              <div className="pt-2.5 mt-2.5 border-t border-blue-200/60 space-y-1.5 animate-in fade-in duration-200">
                <label className="text-[10px] font-black text-blue-600 ml-1">
                  Motivo <span className="text-blue-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={disabledReason}
                  onChange={(e) => setDisabledReason(e.target.value)}
                  placeholder="Informe o motivo (obrigatório)"
                  className="event-registration-field border-blue-300 focus:border-blue-500 bg-white"
                />
              </div>
            )}
          </div>
        )}

        {/* Regulamento e Ações da Etapa 1: SOMENTE PARA O USUÁRIO */}
        {!isAdmin && (
          <div className="space-y-3 pt-2">
            {event.regulationUrl && (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                    <Eye size={16} className="text-amber-600" />
                    <span>Regulamento oficial do torneio</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPdfOrUrl(event.regulationUrl!, event.regulationFileName || 'regulamento.pdf')}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    Ver regulamento
                  </button>
                </div>
                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedRegulation}
                    onChange={(e) => setAcceptedRegulation(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded accent-emerald-500 cursor-pointer shrink-0"
                  />
                  <span className="text-xs font-bold text-slate-700 leading-tight">
                    Declaro que li e concordo com o regulamento do torneio. <span className="text-red-500">*</span>
                  </span>
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveStep1}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>Salvar cadastro</span>
            </button>

          </div>
        )}
      </div>
    )}

    {/* ── ETAPA 2: CATEGORIAS ── */}
    {(isAdmin || userStep === 2) && (
      <div className="space-y-4 animate-in fade-in duration-150">
        <Field label="Categorias vinculadas"><div className="space-y-2">{availableCategories.map((cat: EventCategory) => {
          const isSelected = categoryIds.includes(cat.id);
          const limit = cat.maxPlayers ?? event.maxPlayersPerCategory ?? 8;
          const confirmedCount = categoryConfirmedCountMap[cat.id] || 0;
          const isAlreadyInEntry = (entry.categoryIds || []).includes(cat.id);
          const isCategoryFull = !isAlreadyInEntry && confirmedCount >= limit;
          const pair = pairForCategory(cat.id);
          const partner = categoryPartners[cat.id] || { name: '', email: '', phone: '' };
          const partnerEntry = partnerEntryForCategory(cat.id, partner.email);
          const partnerAlreadyPaired = partner.email ? pairForEmailInCategory(partner.email, cat.id) : undefined;
          const isPartnerCancelled = Boolean(partnerEntry?.disabled || partnerEntry?.paymentStatus === 'Cancelado');
          const canShowFormTeam = Boolean(!isCancelled && !isSinglePlayer && onUpdateEvent && isSelected && cat.format === 'Duplas' && partnerEntry && !isPartnerCancelled && !pair && !partnerAlreadyPaired);
          const isPartnerFormExpanded = expandedPartnerCategoryIds.has(cat.id);
          const partnerFormMissingData = !partner.name.trim() || !partner.email.trim() || !partner.phone.trim();
          return (
            <div key={cat.id} className="space-y-2">
              <div className={isSinglePlayer ? 'w-full' : 'grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-2'}>
                <label className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${
                  isSelected 
                    ? 'bg-emerald-500 text-white border-emerald-500' 
                    : isCategoryFull 
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 cursor-pointer'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      disabled={!isSelected && isCategoryFull} 
                      onChange={() => toggleCategory(cat.id)} 
                      className="h-4 w-4 accent-emerald-500" 
                    />
                    <span className="truncate">{cat.name} ({cat.abbreviation})</span>
                  </div>
                  {isCategoryFull && !isSelected ? (
                    <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0 font-black">
                      Esgotada ({confirmedCount}/{limit})
                    </span>
                  ) : (
                    <span className={`text-[10px] font-bold shrink-0 ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {confirmedCount}/{limit}
                    </span>
                  )}
                </label>
                {!isSinglePlayer && (
                  <>
                    {isSelected ? (
                      <span className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                        pair ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}>
                        {pair ? pair.teamCode || `Time ${pair.teamNumber || ''}` : 'A formar'}
                      </span>
                    ) : (
                      <span />
                    )}
                    {isSelected && isDoubles(cat) ? (
                      <button
                        type="button"
                        onClick={() => togglePartnerForm(cat.id)}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-white transition-all active:scale-95 ${isPartnerFormExpanded ? 'bg-emerald-600' : 'bg-emerald-500'}`}
                        title="Informe seu parceiro"
                      >
                        <Users size={17} />
                        {partnerFormMissingData && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
                      </button>
                    ) : (
                      <span />
                    )}
                  </>
                )}
              </div>
              {!isSinglePlayer && isSelected && isDoubles(cat) && isPartnerFormExpanded && (
                <div className="ml-7 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  <p className="text-[10px] font-black text-slate-400">Informe seu parceiro - {cat.abbreviation || cat.name} *</p>
                  <input required value={partner.name} onChange={(e) => updateCategoryPartner(cat.id, 'name', e.target.value)} placeholder="Nome do parceiro" className="event-registration-field bg-white" />
                  <input type="email" required value={partner.email} onChange={(e) => updateCategoryPartner(cat.id, 'email', e.target.value)} placeholder="E-mail do parceiro" className="event-registration-field bg-white" />
                  <input type="tel" required inputMode="numeric" value={formatPhone(partner.phone)} onChange={(e) => updateCategoryPartner(cat.id, 'phone', e.target.value)} placeholder="(11) 91234-9988" className="event-registration-field bg-white" />
                  {canShowFormTeam && confirmTeamCategoryId !== cat.id && (
                    <button type="button" onClick={() => setConfirmTeamCategoryId(cat.id)} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white transition-all active:scale-95">
                      Formar time
                    </button>
                  )}
                  {canShowFormTeam && confirmTeamCategoryId === cat.id && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void handleFormTeam(cat, partnerEntry!)} className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white transition-all active:scale-95">
                        Confirmar
                      </button>
                      <button type="button" onClick={() => setConfirmTeamCategoryId(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600 transition-all active:scale-95">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}</div></Field>

        {!isAdmin && (
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setUserStep(1)}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-2xl transition-all active:scale-95 cursor-pointer"
            >
              ← Voltar para cadastro
            </button>
            <button
              type="button"
              onClick={handleSaveStep2}
              disabled={isSaving}
              className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Salvando categorias...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Salvar categorias</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    )}

    {/* ── ETAPA 3: PAGAMENTO ── */}
    {(isAdmin || userStep === 3) && (
      <div className="space-y-4 animate-in fade-in duration-150">
        {isFreeEvent && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs font-black text-emerald-800">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-black text-emerald-900">Inscrição Gratuita</p>
              <p className="text-[11px] font-medium text-emerald-700">Este evento não possui taxa de inscrição. Sua inscrição é confirmada automaticamente.</p>
            </div>
          </div>
        )}
        {!isFreeEvent && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Valor devido">
              <div className="event-registration-readonly">
                R$ {effectiveDueAmount.toFixed(2)}
              </div>
            </Field>
            <Field label="Valor pendente">
              <div className="event-registration-readonly text-amber-600">
                R$ {pendingAmount.toFixed(2)}
              </div>
            </Field>
            <Field label="Status do pagamento" className="col-span-2">
              {isAdmin ? (
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)}
                  className="event-registration-field"
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Confirmado">Confirmado</option>
                  <option value="Isento">Isento</option>
                </select>
              ) : (
                <div className="event-registration-readonly">{paymentStatus}</div>
              )}
            </Field>
          </div>
        )}

    {/* Modal inline do QR Code Pix */}
    {pixPayment && (
      <div className="border-2 border-emerald-400 rounded-3xl p-5 bg-gradient-to-b from-emerald-50 to-white space-y-4 shadow-lg animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <QrCode size={18} />
            </div>
            <div>
              <span className="text-xs font-black text-slate-800 block">Pague via Pix</span>
              <span className="text-[10px] font-bold text-emerald-700">R$ {pixPayment.amount.toFixed(2)} · Expira em 24h</span>
            </div>
          </div>
          <button type="button" onClick={handleCancelPixPayment} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* QR Code image */}
        {pixPayment.qrCodeBase64 && (
          <div className="flex justify-center">
            <img
              src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
              alt="QR Code Pix"
              className="w-52 h-52 rounded-2xl border-4 border-white shadow-md"
            />
          </div>
        )}

        {/* Pix Copia e Cola */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-black text-slate-400">PIX COPIA E COLA</p>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-3">
            <span className="text-[10px] font-mono text-slate-600 flex-1 truncate">{pixPayment.qrCode}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pixPayment.qrCode);
                setFeedback('✅ Código Pix copiado!');
                setTimeout(() => setFeedback(null), 3000);
              }}
              className="shrink-0 bg-emerald-500 text-white text-[10px] font-black px-3 py-1.5 rounded-xl hover:bg-emerald-600 active:scale-95 transition-all"
            >
              Copiar
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => void checkPixPaymentConfirmation(pixPayment.paymentId, (entry.email || email).toLowerCase().trim(), true)}
            disabled={isCheckingPaymentStatus}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-60"
          >
            {isCheckingPaymentStatus ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Consultando confirmação...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Já fiz o Pix! Confirmar agora</span>
              </>
            )}
          </button>

          <p className="text-[11px] font-medium text-slate-600 text-center bg-emerald-50 border border-emerald-100 rounded-2xl p-3 leading-relaxed">
            ⏳ Aguardando confirmação do pagamento...<br />
            <span className="text-[10px] text-slate-400">A confirmação é automática após o pagamento.</span>
          </p>
        </div>
      </div>
    )}

    {/* Bloco de Pagamento Automático Pix (Mercado Pago) — só para inscrições já salvas */}
    {!isFreeEvent && usesAutomaticPayment && !pixPayment && isRegistrationSaved && (
      <div className="border border-emerald-200 rounded-3xl p-5 bg-gradient-to-b from-emerald-50/80 to-white space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <QrCode size={18} />
            </div>
            <div>
              <span className="text-xs font-black text-slate-800 block">Pagamento da Inscrição</span>
              <span className="text-[10px] font-bold text-emerald-700">Exclusivo via Pix (Mercado Pago)</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 block">Total a pagar</span>
            <span className="text-sm font-black text-emerald-600">R$ {pendingAmount.toFixed(2)}</span>
          </div>
        </div>

        {pendingAmount > 0 ? (
          <div className="space-y-3">
            <p className="text-[11px] font-medium text-slate-600 leading-relaxed bg-white/90 p-3 rounded-2xl border border-emerald-100">
              ⚡ O pagamento é confirmado <strong>automaticamente</strong> em segundos após a leitura do Pix. Não precisa anexar comprovante.
            </p>

            {/* Banner Melhoria D + Extra: Pix pendente recuperado */}
            {pendingPaymentId && !pixPayment && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                <p className="text-[11px] font-black text-amber-800">
                  ⏳ Há um Pix aguardando confirmação
                </p>
                <p className="text-[10px] text-amber-700">
                  ID do pagamento: <span className="font-mono">{pendingPaymentId}</span>
                </p>
                <button
                  type="button"
                  onClick={() => void checkPixPaymentConfirmation(pendingPaymentId, (entry.email || email).toLowerCase().trim(), true)}
                  disabled={isCheckingPaymentStatus}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {isCheckingPaymentStatus ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Verificar confirmação do Pix</span>
                    </>
                  )}
                </button>

                {/* Melhoria: Reabrir QR Code anterior sem gerar novo */}
                {savedPixData?.qrCode && (
                  <button
                    type="button"
                    onClick={() => {
                      setPixPayment(savedPixData);
                      stopPolling();
                      pollingRef.current = setInterval(() => {
                        void checkPixPaymentConfirmation(savedPixData.paymentId, (entry.email || email).toLowerCase().trim());
                      }, 4000);
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    <QrCode size={14} />
                    <span>Ver QR Code / Copiar Pix anterior</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPendingPaymentId(null);
                    setSavedPixData(null);
                    try {
                      const targetEmail = (entry.email || email).toLowerCase().trim();
                      localStorage.removeItem(`mp_pending_${event.pin}_${targetEmail}`);
                      localStorage.removeItem(`mp_pending_data_${event.pin}_${targetEmail}`);
                    } catch {}
                  }}
                  className="w-full text-[10px] text-amber-600 hover:text-amber-800 font-medium underline cursor-pointer"
                >
                  Descartar e gerar novo Pix
                </button>
              </div>
            )}

            {/* Melhoria C: botão de pagar via Pix só aparece se inscrição já salva, sem pendingPaymentId */}
            {!pendingPaymentId && (
              <>
                {isRegistrationSaved ? (
                  <button
                    type="button"
                    onClick={handlePayViaPix}
                    disabled={isSaving || isPayingPix}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isPayingPix ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Iniciando pagamento Pix...</span>
                      </>
                    ) : (
                      <>
                        <QrCode size={16} />
                        <span>Pagar R$ {pendingAmount.toFixed(2)} via PIX</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                    <p className="text-[11px] font-bold text-slate-500">
                      💾 Salve a inscrição primeiro para liberar o pagamento via Pix
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="p-3.5 bg-emerald-100/70 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs font-black text-emerald-800">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>Inscrição com pagamento quitado (R$ {totalPaid.toFixed(2)})</span>
          </div>
        )}

        {/* Histórico de pagamentos já registrados */}
        {payments.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-[10px] font-black text-slate-400">Histórico de pagamentos confirmados</p>
            {payments.map((payment) => {
              const isMpPayment = payment.provider === 'mercadopago' || !!payment.providerPaymentId;
              return (
                <div key={payment.id} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setViewingReceipt(payment)}
                    className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                  >
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700">{new Date(payment.date).toLocaleDateString('pt-BR')}</span>
                        <span className="text-emerald-600 font-black">R$ {payment.amount.toFixed(2)}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {payment.receiptFileName || (isMpPayment ? 'Pix Mercado Pago' : 'Comprovante')}
                      </span>
                    </div>
                  </button>
                  {isAdmin && !isMpPayment && (
                    <button type="button" onClick={() => void removePayment(payment.id)} className="text-red-500 p-1 hover:bg-red-50 rounded-lg ml-2 shrink-0" title="Excluir pagamento">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Opções administrativas para confirmação manual ou via transação Mercado Pago */}
        {isAdmin && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            {!showAdminTxForm ? (
              <div className="flex flex-col gap-1.5 text-center">
                <button
                  type="button"
                  onClick={() => setShowAdminTxForm(true)}
                  className="text-[11px] font-black text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 py-2.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  ⚡ Confirmar via código de transação Mercado Pago (Admin)
                </button>
                {!showManualAdminPayment && (
                  <button
                    type="button"
                    onClick={() => setShowManualAdminPayment(true)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    + Registrar pagamento manual em dinheiro (Admin)
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-800">
                    Confirmar por código de transação MP
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAdminTxForm(false)}
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                  >
                    Cancelar
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Cole o código de transação ou autorização do comprovante do Mercado Pago (ex: <span className="font-mono font-bold text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">B33AZ00ST29DCM5JK</span>):
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adminTxCode}
                    onChange={(e) => setAdminTxCode(e.target.value)}
                    placeholder="Ex: B33AZ00ST29DCM5JK"
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAdminQuickConfirmWithTxCode()}
                    disabled={isAdminConfirmingTx || !adminTxCode.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isAdminConfirmingTx ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )}

    {/* Bloco de Pagamento Manual (Eventos manuais ou lançamento de admin) */}
    {!isFreeEvent && canUseManualPaymentForm && (
      <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-slate-700">
            {usesAutomaticPayment ? 'Lançamento Manual de Pagamento (Admin)' : 'Pagamentos'}
          </span>
          <span className="text-xs font-black text-emerald-600">Total pago: R$ {totalPaid.toFixed(2)}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500">{editingPaymentId ? 'Editar pagamento' : 'Novo pagamento'}</span>
            <button
              type="button"
              onClick={addPayment}
              disabled={!newAmount || (!newReceipt && (!editingPaymentId || !payments.find((p) => p.id === editingPaymentId)?.receiptUrl) && !isAdmin) || isSaving}
              className="px-4 py-2 bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
            >
              <DollarSign size={14} /> {editingPaymentId ? 'Salvar pagamento' : 'Adicionar pagamento'}
            </button>
          </div>
          <Field label="Valor do pagamento (R$)">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={newAmount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.,]/g, '');
                setNewAmount(val);
              }}
              className="event-registration-field"
            />
          </Field>
          <Field label="Data do pagamento"><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="event-registration-field" /></Field>
          <Field label={isAdmin ? 'Comprovante (opcional para admin)' : 'Comprovante *'}>
            <label className="event-registration-field flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 truncate">
                <Upload size={16} className="text-slate-400" />
                {newReceipt?.name || (isAdmin ? 'Anexar comprovante (opcional)...' : 'Anexar comprovante (obrigatório)...')}
              </span>
              <span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-lg">Buscar</span>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setNewReceipt({ url: String(reader.result), name: file.name }); reader.readAsDataURL(file); }} className="hidden" />
            </label>
          </Field>
        </div>
        {payments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400">Histórico de pagamentos</p>
            {payments.map((payment) => {
              const isMpPayment = payment.provider === 'mercadopago' || !!payment.providerPaymentId;
              return (
                <div key={payment.id} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      if (isMpPayment) {
                        setViewingReceipt(payment);
                      } else {
                        setEditingPaymentId(payment.id);
                        setNewAmount(String(payment.amount));
                        const date = new Date(payment.date);
                        setNewDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
                        setNewReceipt(payment.receiptUrl ? { url: payment.receiptUrl, name: payment.receiptFileName || 'Comprovante' } : null);
                      }
                    }}
                    className="flex items-center gap-3 text-left flex-1 min-w-0"
                  >
                    <span>{new Date(payment.date).toLocaleDateString('pt-BR')}</span>
                    <span>R$ {payment.amount.toFixed(2)}</span>
                    {isMpPayment && <span className="text-[10px] text-slate-400 font-medium">Pix MP</span>}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isMpPayment && (
                      <button
                        type="button"
                        disabled={!payment.receiptUrl}
                        onClick={() => payment.receiptUrl && window.open(payment.receiptUrl, '_blank', 'noopener,noreferrer')}
                        className="text-sky-600 disabled:text-slate-300"
                        title="Abrir comprovante"
                      >
                        <Eye size={16} />
                      </button>
                    )}
                    {!isMpPayment && (
                      <button type="button" onClick={() => void removePayment(payment.id)} className="text-red-500" title="Excluir pagamento">
                        <Trash2 size={16} />
                      </button>
                    )}
                    {isMpPayment && (
                      <button type="button" onClick={() => setViewingReceipt(payment)} className="text-sky-600" title="Ver comprovante">
                        <Eye size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {usesAutomaticPayment && showManualAdminPayment && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowManualAdminPayment(false)}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline"
            >
              Ocultar lançamento manual
            </button>
          </div>
        )}
      </div>
    )}

        {!isAdmin && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setUserStep(2)}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-2xl transition-all active:scale-95 cursor-pointer"
            >
              ← Voltar para categorias
            </button>
          </div>
        )}
      </div>
    )}



    {(isAdmin || userStep === 3) && (
      <div className="flex flex-wrap gap-2.5 pt-1">
      {!readOnly && (
        <>
          {usesAutomaticPayment && pendingAmount > 0 && !pixPayment && !isRegistrationSaved ? (
            <>
              {/* Nova inscrição + evento Pix: salva primeiro, depois o card mostra o botão de pagar */}
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                className="flex-1 min-w-[170px] py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Salvando inscrição...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Salvar e pagar depois</span>
                  </>
                )}
              </button>
            </>
          ) : usesAutomaticPayment && pendingAmount > 0 && !pixPayment && isRegistrationSaved ? (
            // Inscrição salva com pagamento MP pendente: o card de pagamento já tem o botão PIX
            // Não mostra botão de salvar aqui para evitar confusão
            null
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={isSaving}
              className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Salvando inscrição...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Salvar inscrição</span>
                </>
              )}
            </button>
          )}
        </>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className={`${readOnly ? 'w-full' : 'px-5'} py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-colors active:scale-95`}
        >
          {readOnly ? 'Fechar' : 'Cancelar'}
        </button>
      )}
    </div>
    )}

    {/* Botão de Fechar auxiliar para as Etapas 1 e 2 do Usuário */}
    {!isAdmin && userStep !== 3 && onCancel && (
      <div className="pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-colors active:scale-95"
        >
          Fechar
        </button>
      </div>
    )}

    {/* Modal de Cancelamento de Inscrição */}
    {cancelModalConfig && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
        onClick={() => setCancelModalConfig(null)}
      >
        <div
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} />
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-black text-slate-900">{cancelModalConfig.title}</h3>
            <p className="text-xs font-bold text-slate-500 leading-relaxed whitespace-pre-line">{cancelModalConfig.message}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCancelModalConfig(null)}
              className="flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs active:scale-95 transition-all cursor-pointer"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmCancel()}
              className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-xs active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              {cancelModalConfig.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de Comprovante de Pagamento (Mercado Pago) */}
    {viewingReceipt && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={() => setViewingReceipt(null)}
      >
        <div
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-500" />
              <span className="font-black text-slate-800 text-sm">Comprovante de Pagamento</span>
            </div>
            <button
              type="button"
              onClick={() => setViewingReceipt(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              ✕
            </button>
          </div>

          {/* Detalhes */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Método</span>
              <span className="text-xs font-black text-slate-700">
                {viewingReceipt.provider === 'mercadopago' ? '⚡ Pix via Mercado Pago' : viewingReceipt.provider ?? 'Manual'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Valor pago</span>
              <span className="text-sm font-black text-emerald-600">R$ {viewingReceipt.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Data</span>
              <span className="text-xs font-black text-slate-700">
                {new Date(viewingReceipt.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {viewingReceipt.providerPaymentId && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-slate-500 font-medium shrink-0">ID Pagamento</span>
                <span className="text-[10px] font-mono font-bold text-slate-600 text-right break-all">
                  {viewingReceipt.providerPaymentId}
                </span>
              </div>
            )}
            {viewingReceipt.receiptFileName && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500 font-medium">Arquivo</span>
                <span className="text-xs font-black text-slate-700">{viewingReceipt.receiptFileName}</span>
              </div>
            )}
          </div>

          {/* Se tiver URL de comprovante (pagamento manual), abre em nova aba */}
          {viewingReceipt.receiptUrl && (
            <button
              type="button"
              onClick={() => window.open(viewingReceipt.receiptUrl!, '_blank', 'noopener,noreferrer')}
              className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Eye size={14} />
              Abrir comprovante
            </button>
          )}

          <button
            type="button"
            onClick={() => setViewingReceipt(null)}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl active:scale-95 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    )}
  </div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => <div className={`space-y-1 ${className}`}><label className="text-[10px] font-black text-slate-400 ml-1">{label}</label>{children}</div>;
