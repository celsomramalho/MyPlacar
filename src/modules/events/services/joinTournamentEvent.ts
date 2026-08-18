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

  // Sincroniza telefone e gênero com o cadastro do usuário (perfil)
  if (email && (entry.phone || entry.gender)) {
    try {
      const userUpdates: Record<string, unknown> = {};
      if (entry.phone) userUpdates.phone = entry.phone;
      if (entry.gender) userUpdates.gender = entry.gender;
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(db, 'users', email), {
        ...userUpdates,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const savedLocal = typeof localStorage !== 'undefined' ? localStorage.getItem('myPlacarUserProfile') : null;
      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (!parsed.email || parsed.email.toLowerCase() === email.toLowerCase()) {
            if (entry.phone) parsed.phone = entry.phone;
            if (entry.gender) parsed.gender = entry.gender;
            localStorage.setItem('myPlacarUserProfile', JSON.stringify(parsed));
            window.dispatchEvent(new Event('storage'));
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Erro ao atualizar telefone/gênero no perfil via join:', err);
    }
  }

  // Disparar avisos automáticos da nova inscrição (Avisos 1 e 2)
  try {
    const { eventNotificationService } = await import('./eventNotificationService');

    // 1) Inscrição recebida / confirmada (contém nome do evento, categorias, local e data)
    void eventNotificationService.notifyRegistrationConfirmed(db, event, entry);

    // 2) Pagamento registrado (se informado comprovante/pagamento no ato da inscrição)
    if (entry.payments && entry.payments.length > 0) {
      for (const p of entry.payments) {
        void eventNotificationService.notifyPaymentCreated(db, event, entry, p);
      }
    }
  } catch (err) {
    console.warn('Erro ao disparar avisos de evento no join:', err);
  }

  return { event, joinedAt, registration };
};
