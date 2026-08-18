import type { Firestore } from 'firebase/firestore';
import {
  fetchEventByPin,
  fetchEventEntry,
  saveEventEntry,
  saveUserEventRegistration,
} from '@infra/firebase/events';
import type { EventRegistration, PaymentItem, TournamentEntry, TournamentEvent } from '../types';

interface EventJoinProfile {
  email: string;
  name: string;
  nickname: string;
  pin: string;
  gender?: 'M' | 'F';
  categoryIds?: string[];
  phone?: string;
  shirtSize?: 'P' | 'M' | 'G';
  partnerName?: string;
  partnerEmail?: string;
}

interface PaymentData {
  payments?: PaymentItem[];
  dueAmount?: number;
  paidAmount?: number;
  paymentStatus?: 'Pendente' | 'Pago' | 'Isento';
}

export const joinTournamentEvent = async (
  db: Firestore,
  pin: string,
  profile: EventJoinProfile,
  paymentData?: PaymentData,
  entryOverride?: Partial<TournamentEntry>,
): Promise<{ event: TournamentEvent; joinedAt: number; registration: EventRegistration } | null> => {
  const event = await fetchEventByPin(db, pin) as TournamentEvent | null;
  if (!event || !event.active) return null;

  const email = (entryOverride?.email || profile.email).toLowerCase().trim();
  const existingEntry = await fetchEventEntry(db, pin, email);
  const joinedAt = existingEntry?.joinedAt ?? Date.now();

  const baseFee = event.registrationFee ?? 0;
  const extraFee = event.extraCategoryFee ?? 0;
  const categoryIds = entryOverride?.categoryIds ?? profile.categoryIds ?? [];
  const catCount = categoryIds.length;
  const computedDue = catCount === 0 ? baseFee : baseFee + (catCount - 1) * extraFee;

  const entry: TournamentEntry = {
    email,
    name: entryOverride?.name || profile.name,
    nickname: entryOverride?.nickname || profile.nickname,
    pin: entryOverride?.pin || profile.pin,
    gender: entryOverride?.gender || profile.gender || (profile.nickname.toLowerCase().endsWith('a') ? 'F' : 'M'),
    joinedAt,
    dueAmount: entryOverride?.dueAmount ?? paymentData?.dueAmount ?? computedDue,
    paymentStatus: entryOverride?.paymentStatus || 'Pendente',
    paidAmount: entryOverride?.paidAmount ?? paymentData?.paidAmount ?? 0,
    payments: entryOverride?.payments ?? paymentData?.payments ?? [],
    categoryIds,
    phone: entryOverride?.phone || profile.phone || '',
    shirtSize: entryOverride?.shirtSize || profile.shirtSize || 'M',
    partnerName: entryOverride?.partnerName || profile.partnerName || undefined,
    partnerEmail: entryOverride?.partnerEmail || profile.partnerEmail || undefined,
    partnerPhone: entryOverride?.partnerPhone || undefined,
    categoryPartners: entryOverride?.categoryPartners || undefined,
  };

  await saveEventEntry(db, pin, entry);

  const registration: EventRegistration = {
    pin,
    name: event.name,
    joinedAt,
    bannerUrl: event.bannerUrl || null,
  };
  await saveUserEventRegistration(db, email, pin, registration);

  // Disparar avisos automáticos
  try {
    const { eventNotificationService } = await import('./eventNotificationService');

    // a) Inscrição realizada - avisa sempre (confirmada, isenta ou pendente)
    void eventNotificationService.notifyRegistrationConfirmed(db, event, entry);

    // b) Pagamentos registrados
    if (entry.payments && entry.payments.length > 0) {
      for (const p of entry.payments) {
        void eventNotificationService.notifyPaymentCreated(db, event, entry, p);
      }
    }

    // c) Novas categorias inscritas
    for (const catId of categoryIds) {
      const catObj = (event.categories || []).find((c) => c.id === catId);
      if (catObj) {
        void eventNotificationService.notifyNewCategory(db, event, entry, catObj);
      }
    }

    // d) Valor pendente maior que zero
    const currentPending = Math.max(0, (entry.dueAmount ?? 0) - (entry.paidAmount || 0));
    if (currentPending > 0) {
      void eventNotificationService.notifyPendingPayment(db, event, entry, currentPending);
    }
  } catch (err) {
    console.warn('Erro ao disparar avisos de evento no join:', err);
  }

  return { event, joinedAt, registration };
};
