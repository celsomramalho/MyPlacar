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
): Promise<{ event: TournamentEvent; joinedAt: number; registration: EventRegistration } | null> => {
  const event = await fetchEventByPin(db, pin) as TournamentEvent | null;
  if (!event || !event.active) return null;

  const email = profile.email.toLowerCase().trim();
  const existingEntry = await fetchEventEntry(db, pin, email);
  const joinedAt = existingEntry?.joinedAt ?? Date.now();

  if (!existingEntry) {
    const baseFee = event.registrationFee ?? 0;
    const extraFee = event.extraCategoryFee ?? 0;
    const catCount = profile.categoryIds?.length ?? 0;
    const computedDue = catCount === 0 ? baseFee : baseFee + (catCount - 1) * extraFee;

    const entry: TournamentEntry = {
      email,
      name: profile.name,
      nickname: profile.nickname,
      pin: profile.pin,
      gender: profile.gender || (profile.nickname.toLowerCase().endsWith('a') ? 'F' : 'M'),
      joinedAt,
      dueAmount: paymentData?.dueAmount ?? computedDue,
      paymentStatus: 'Pendente',
      paidAmount: paymentData?.paidAmount ?? 0,
      payments: paymentData?.payments ?? [],
      ...(profile.categoryIds && profile.categoryIds.length > 0 ? { categoryIds: profile.categoryIds } : {}),
      phone: profile.phone || '',
      shirtSize: profile.shirtSize || 'M',
      ...(profile.partnerName ? { partnerName: profile.partnerName } : {}),
      ...(profile.partnerEmail ? { partnerEmail: profile.partnerEmail } : {}),
    };
    await saveEventEntry(db, pin, entry);
  } else if (paymentData?.payments && paymentData.payments.length > 0) {
    // Se o jogador já estava inscrito mas adicionou pagamentos, atualizar
    const updatedEntry: TournamentEntry = {
      ...existingEntry,
      payments: paymentData.payments,
      paidAmount: paymentData.paidAmount ?? existingEntry.paidAmount,
      paymentStatus: existingEntry.paymentStatus === 'Isento' ? 'Isento' : 'Pendente',
    };
    await saveEventEntry(db, pin, updatedEntry);
  }

  const registration: EventRegistration = {
    pin,
    name: event.name,
    joinedAt,
    bannerUrl: event.bannerUrl || null,
  };
  await saveUserEventRegistration(db, email, pin, registration);

  return { event, joinedAt, registration };
};
