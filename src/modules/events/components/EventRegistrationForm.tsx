import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, DollarSign, Eye, Loader2, Trash2, Upload, Users } from 'lucide-react';
import { MarsIcon, VenusIcon } from '@shared/components/GenderIcons';
import { findUserByPin, getDb } from '@infra/firebase';
import type { Firestore } from 'firebase/firestore';
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

interface Props {
  event: TournamentEvent;
  entry: TournamentEntry;
  mode: 'admin' | 'user';
  onSave: (entry: TournamentEntry) => Promise<void>;
  onUpdateEvent?: (event: TournamentEvent) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onPhoneSync?: (phone: string) => void;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const EventRegistrationForm: React.FC<Props> = ({ event, entry, mode, onSave, onUpdateEvent, onDelete, onCancel }) => {
  const canEdit = true;
  const isAdmin = mode === 'admin';
  const isNewAdminEntry = isAdmin && (!entry.email || entry.email.trim() === '') && (!entry.name || entry.name.trim() === '');
  const canEditIdentity = isNewAdminEntry;

  const registrationId = useMemo(
    () => entry.registrationId || getNextRegistrationId(event.entries || []),
    [entry.registrationId, event.entries]
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
  const [payments, setPayments] = useState<PaymentItem[]>(entry.payments || []);
  const [paymentStatus, setPaymentStatus] = useState(
    entry.paymentStatus === 'Pago' ? 'Confirmado' : entry.paymentStatus || 'Pendente'
  );
  const [dueAmount, setDueAmount] = useState(entry.dueAmount ?? event.registrationFee ?? 0);
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [newReceipt, setNewReceipt] = useState<{ url: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [expandedPartnerCategoryIds, setExpandedPartnerCategoryIds] = useState<Set<string>>(() => new Set());
  const [confirmTeamCategoryId, setConfirmTeamCategoryId] = useState<string | null>(null);

  const [isSearchingPin, setIsSearchingPin] = useState(false);
  const [pinLookupMessage, setPinLookupMessage] = useState<string | null>(null);

  const isSuper8 = event.eventType === 'Super 8';
  const isFreeEvent = (event.registrationFee ?? 0) === 0 && (event.extraCategoryFee ?? 0) === 0;

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
              setPinLookupMessage(`${user.nickname} já cadastrado`);
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
  const isDoubles = (cat: EventCategory) => !isSuper8 && (cat.format === 'Duplas' || !cat.format || cat.name.toLowerCase().includes('dupla') || Boolean(cat.gender2));
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const effectiveDueAmount = isFreeEvent
    ? 0
    : isAdmin
      ? dueAmount
      : (event.registrationFee ?? 0) + (Math.max(0, categoryIds.length - 1) * (event.extraCategoryFee ?? 0));
  const pendingAmount = Math.max(0, effectiveDueAmount - totalPaid);

  React.useEffect(() => {
    if (!editingPaymentId) {
      const diff = Math.max(0, effectiveDueAmount - totalPaid);
      setNewAmount(diff > 0 ? diff.toFixed(2) : '');
    }
  }, [categoryIds, payments, effectiveDueAmount, totalPaid, editingPaymentId]);

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

  const handleFormTeam = async (cat: EventCategory, partnerEntry: TournamentEntry) => {
    if (!onUpdateEvent) return;
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

  const toggleCategory = (categoryId: string) => setCategoryIds((ids) => {
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
      paymentStatus,
      payments: nextPayments,
      paidAmount: nextPayments.reduce((sum, payment) => sum + payment.amount, 0),
      partnerName: firstPartner?.name || undefined,
      partnerEmail: firstPartner?.email || undefined,
      partnerPhone: firstPartner?.phone || undefined,
      categoryPartners: Object.keys(selectedCategoryPartners).length > 0 ? selectedCategoryPartners : undefined,
    };
    return updated;
  };

  const initialCategoryIds = useMemo(() => entry.categoryIds || [], [entry.categoryIds]);

  const save = async (nextPayments: PaymentItem[] = payments) => {
    const trimmedName = name.trim();
    const trimmedNickname = nickname.trim();
    const trimmedEmail = email.trim();
    const cleanPhone = phone.replace(/\D/g, '').trim();

    if (isAdmin && !trimmedName) {
      setFeedback('Informe o nome do jogador antes de salvar.');
      return;
    }
    if (!trimmedNickname) {
      setFeedback('Informe como quer ser chamado (apelido) antes de salvar.');
      return;
    }
    if (!trimmedEmail) {
      setFeedback('Informe o e-mail antes de salvar.');
      return;
    }
    if (!cleanPhone) {
      setFeedback('Informe o telefone.');
      return;
    }
    // Validação de duplicidade: não permitir que o mesmo usuário se inscreva 2 vezes no mesmo evento
    if (canEditIdentity) {
      const normalizedEmail = trimmedEmail.toLowerCase();
      const normalizedPin = pin.trim().toUpperCase();
      const alreadyRegistered = (event.entries || []).some((e) => {
        const entryEmail = e.email?.toLowerCase().trim();
        const entryPin = e.pin?.toUpperCase().trim();
        return (entryEmail && entryEmail === normalizedEmail) || (normalizedPin && entryPin && entryPin === normalizedPin);
      });

      if (alreadyRegistered) {
        setFeedback('Este participante já está inscrito neste evento.');
        return;
      }
    }

    const effectiveCategoryIds = categoryIds.filter((catId) => availableCategories.some((c) => c.id === catId));
    if (effectiveCategoryIds.length === 0) {
      setFeedback('É obrigatório selecionar pelo menos uma categoria para a inscrição.');
      return;
    }

    for (const catId of effectiveCategoryIds) {
      const cat = (event.categories || []).find((c) => c.id === catId);
      if (isSuper8 || !cat || !isDoubles(cat)) continue;
      const pair = pairForCategory(cat.id);
      if (pair) continue; // Se já tem time formado, não precisa exigir dados do parceiro novamente
      const partner = categoryPartners[catId] || { name: '', email: '', phone: '' };
      const cleanedPartnerPhone = (partner.phone || '').replace(/\D/g, '');
      if (!partner.name?.trim() || !partner.email?.trim() || !cleanedPartnerPhone) {
        const msg = `Informe os dados do parceiro para ${cat.abbreviation || cat.name}.`;
        setFeedback(msg);
        setExpandedPartnerCategoryIds((prev) => new Set(prev).add(cat.id));
        return;
      }
    }

    const parsedAmount = Number(newAmount.replace(',', '.'));
    const willAddPayment = Boolean(parsedAmount && parsedAmount > 0);
    const hasReceipt = Boolean(newReceipt?.url || (editingPaymentId && payments.find((p) => p.id === editingPaymentId)?.receiptUrl));

    if (willAddPayment && !hasReceipt) {
      setFeedback('O comprovante é obrigatório para registrar o pagamento.');
      return;
    }

    let paymentsToSave = nextPayments;
    let addedPaymentItem: PaymentItem | null = null;
    if (willAddPayment && hasReceipt) {
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
    if (effectiveDueAmount > 0 && paymentStatus !== 'Isento' && totalPaymentsCount === 0) {
      setFeedback('É obrigatório informar o pagamento e anexar o comprovante para realizar a inscrição.');
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      if (willAddPayment && hasReceipt) {
        setPayments(paymentsToSave);
        setNewAmount('');
        setNewReceipt(null);
        setEditingPaymentId(null);
      }

      const cleanEntry = buildEntry(paymentsToSave, effectiveCategoryIds);
      const jsonClean = JSON.parse(JSON.stringify(cleanEntry));
      await onSave(jsonClean);
      setFeedback('✓ Inscrição salva com sucesso!');

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
    } catch (error) {
      console.error('Erro ao salvar inscrição:', error);
      const failure = error as { code?: string; message?: string };
      const message = failure.code === 'permission-denied'
        ? 'Sem permissão para salvar esta inscrição. Verifique seu acesso administrativo.'
        : failure.code === 'already-exists'
          ? 'Já existe uma inscrição com este PIN ou e-mail.'
          : failure.message || 'Não foi possível salvar a inscrição. Confira os campos obrigatórios.';
      setFeedback(message);
    } finally {
      setIsSaving(false);
    }
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
    {(event.information || event.regulationUrl) && <div className="space-y-2">
      {event.information && <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-[10px] font-black tracking-wider text-sky-600">Informações do evento</p><p className="text-xs font-bold leading-relaxed whitespace-pre-wrap text-slate-700 mt-1">{event.information}</p></div>}
      {event.regulationUrl && <a href={event.regulationUrl} target="_blank" rel="noopener noreferrer" className="w-full h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 font-black text-xs flex items-center justify-center gap-2"><Eye size={15} /> Regulamento</a>}
    </div>}

    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
      <h4 className="text-sm font-black text-slate-800">{isAdmin ? 'Editar inscrição' : 'Informações de inscrição'}</h4>
      {onDelete && (
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

    {/* Alerta de Feedback no Topo */}
    {feedback && (
      <div className={`p-3 rounded-2xl flex items-center gap-2 border text-xs font-black animate-in fade-in slide-in-from-top-1 ${
        feedback.includes('sucesso')
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}>
        {feedback.includes('sucesso') ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <AlertCircle size={18} className="shrink-0 text-red-600" />}
        <span>{feedback}</span>
      </div>
    )}

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
                pinLookupMessage.includes('cadastrado')
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
    <Field label="Telefone *"><input type="tel" required inputMode="numeric" value={formatPhone(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="(11) 91234-9988" className="event-registration-field" /></Field>
    <Field label="Tamanho camiseta *"><select required value={shirtSize} onChange={(e) => setShirtSize(e.target.value as 'P' | 'M' | 'G')} className="event-registration-field"><option value="P">P</option><option value="M">M</option><option value="G">G</option></select></Field>
    <Field label="Como quer ser chamado *"><div className="flex gap-2"><input required value={nickname} onChange={(e) => setNickname(e.target.value)} className="event-registration-field flex-1" /><button type="button" onClick={handleToggleGender} className={`w-11 rounded-xl border flex items-center justify-center ${gender === 'F' ? 'bg-pink-50 text-pink-600 border-pink-100' : 'bg-sky-50 text-sky-600 border-sky-100'}`}>{gender === 'F' ? <VenusIcon size={18} /> : <MarsIcon size={18} />}</button></div></Field>

    {!isFreeEvent && (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Valor devido">
          <input
            type="number"
            value={effectiveDueAmount}
            disabled={!isAdmin}
            onChange={(e) => setDueAmount(Number(e.target.value))}
            className="event-registration-field"
          />
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

    <Field label="Categorias vinculadas"><div className="space-y-2">{availableCategories.map((cat: EventCategory) => {
      const isSelected = categoryIds.includes(cat.id);
      const pair = pairForCategory(cat.id);
      const partner = categoryPartners[cat.id] || { name: '', email: '', phone: '' };
      const partnerEntry = partnerEntryForCategory(cat.id, partner.email);
      const partnerAlreadyPaired = partner.email ? pairForEmailInCategory(partner.email, cat.id) : undefined;
      const canShowFormTeam = Boolean(!isSuper8 && onUpdateEvent && isSelected && cat.format === 'Duplas' && partnerEntry && !pair && !partnerAlreadyPaired);
      const isPartnerFormExpanded = expandedPartnerCategoryIds.has(cat.id);
      const partnerFormMissingData = !partner.name.trim() || !partner.email.trim() || !partner.phone.trim();
      return (
        <div key={cat.id} className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-2">
            <label className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-black ${isSelected ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
              <input type="checkbox" checked={isSelected} onChange={() => toggleCategory(cat.id)} className="h-4 w-4 accent-emerald-500" />
              <span>{cat.name} ({cat.abbreviation})</span>
            </label>
            {!isSuper8 && isSelected ? (
              <span className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                pair ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {pair ? pair.teamCode || `Time ${pair.teamNumber || ''}` : 'A formar'}
              </span>
            ) : (
              <span />
            )}
            {!isSuper8 && isSelected && isDoubles(cat) ? (
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
          </div>
          {!isSuper8 && isSelected && isDoubles(cat) && isPartnerFormExpanded && (
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

    {!isFreeEvent && (
      <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-4">
        <div className="flex items-center justify-between"><span className="text-xs font-black text-slate-700">Pagamentos</span><span className="text-xs font-black text-emerald-600">Total pago: R$ {totalPaid.toFixed(2)}</span></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500">{editingPaymentId ? 'Editar pagamento' : 'Novo pagamento'}</span>
            <button
              type="button"
              onClick={addPayment}
              disabled={!newAmount || (!newReceipt && (!editingPaymentId || !payments.find((p) => p.id === editingPaymentId)?.receiptUrl)) || isSaving}
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
          <Field label="Comprovante *"><label className="event-registration-field flex items-center justify-between cursor-pointer"><span className="flex items-center gap-2 truncate"><Upload size={16} className="text-slate-400" />{newReceipt?.name || 'Anexar comprovante (obrigatório)...'}</span><span className="bg-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-lg">Buscar</span><input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setNewReceipt({ url: String(reader.result), name: file.name }); reader.readAsDataURL(file); }} className="hidden" /></label></Field>
        </div>
        {payments.length > 0 && <div className="space-y-2"><p className="text-[10px] font-black text-slate-400">Histórico de pagamentos</p>{payments.map((payment) => <div key={payment.id} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs font-bold"><button type="button" onClick={() => { setEditingPaymentId(payment.id); setNewAmount(String(payment.amount)); const date = new Date(payment.date); setNewDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); setNewReceipt(payment.receiptUrl ? { url: payment.receiptUrl, name: payment.receiptFileName || 'Comprovante' } : null); }} className="flex items-center gap-3 text-left"><span>{new Date(payment.date).toLocaleDateString('pt-BR')}</span><span>R$ {payment.amount.toFixed(2)}</span></button><div className="flex items-center gap-2"><button type="button" disabled={!payment.receiptUrl} onClick={() => payment.receiptUrl && window.open(payment.receiptUrl, '_blank', 'noopener,noreferrer')} className="text-sky-600 disabled:text-slate-300" title="Abrir comprovante"><Eye size={16} /></button><button type="button" onClick={() => void removePayment(payment.id)} className="text-red-500" title="Excluir pagamento"><Trash2 size={16} /></button></div></div>)}</div>}
      </div>
    )}
    {/* Alerta de Feedback no Rodapé */}
    {feedback && (
      <div className={`p-3 rounded-2xl flex items-center gap-2 border text-xs font-black animate-in fade-in slide-in-from-bottom-1 ${
        feedback.includes('sucesso')
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}>
        {feedback.includes('sucesso') ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <AlertCircle size={18} className="shrink-0 text-red-600" />}
        <span>{feedback}</span>
      </div>
    )}

    <div className="flex gap-3 pt-1">
      <button
        type="button"
        onClick={() => save()}
        disabled={isSaving}
        className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
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
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-2xl transition-colors active:scale-95"
        >
          Cancelar
        </button>
      )}
    </div>
  </div>;
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => <div className={`space-y-1 ${className}`}><label className="text-[10px] font-black text-slate-400 ml-1">{label}</label>{children}</div>;
