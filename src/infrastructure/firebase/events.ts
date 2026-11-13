import {
  collection,
  serverTimestamp,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { minifyPairForStorage, type PaymentStatus, type TournamentPair } from '@modules/events/types';
import { getAuthInstance } from './authClient';

const auditValue = (value: unknown, field: string): unknown => {
  if (field !== 'payments' || !Array.isArray(value)) return value;
  return value.map((payment: any) => ({
    id: payment?.id || null,
    amount: payment?.amount ?? null,
    date: payment?.date ?? null,
    status: payment?.status ?? null,
    provider: payment?.provider ?? null,
    receipt: Boolean(payment?.receiptUrl),
    receiptName: payment?.receiptFileName || payment?.receiptName || null,
  }));
};

const trackedEntryFields = [
  'categoryIds', 'categoryPartners', 'partnerName', 'partnerEmail', 'partnerPhone',
  'paymentStatus', 'payments', 'dueAmount', 'paidAmount', 'checkedIn', 'checkInDate',
  'checkInDates', 'disabled', 'disabledReason',
] as const;

const auditSnapshot = (entry: Record<string, any> | undefined) => Object.fromEntries(
  trackedEntryFields
    .filter((field) => JSON.stringify(auditValue(entry?.[field], field)) !== undefined)
    .map((field) => [field, auditValue(entry?.[field] ?? null, field)]),
);

const appendEntryAudit = async (
  db: Firestore,
  eventPin: string,
  entry: FirebaseTournamentEntry,
  sanitized: Record<string, unknown>,
) => {
  const cleanEmail = entry.email.toLowerCase().trim();
  const entryRef = doc(db, 'events', eventPin, 'entries', cleanEmail);
  const eventRef = doc(db, 'events', eventPin);
  const auditRef = doc(collection(db, 'events', eventPin, 'audit_logs'));
  const authEmail = getAuthInstance()?.currentUser?.email?.toLowerCase().trim() || null;
  await runTransaction(db, async (transaction) => {
    const [eventSnapshot, current] = await Promise.all([transaction.get(eventRef), transaction.get(entryRef)]);
    const categories = (eventSnapshot.data()?.categories || []) as Array<{ id: string; format?: string; requiresPartner?: boolean }>;
    const selectedCategoryIds = entry.categoryIds || [];
    const currentData = current.exists() ? current.data() : undefined;
    const categorySelectionChanged = !currentData || JSON.stringify(currentData.categoryIds || []) !== JSON.stringify(selectedCategoryIds);
    if (categories.length && categorySelectionChanged && (!selectedCategoryIds.length || selectedCategoryIds.some((id) => !categories.some((category) => category.id === id)))) {
      throw new Error('A inscrição precisa ter ao menos uma categoria válida do evento.');
    }
    const eventData = eventSnapshot.data() as { teamDrawType?: string } | undefined;
    const requiresPartner = String(eventData?.teamDrawType || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('pre') &&
      selectedCategoryIds.some((id) => categories.some((category) => category.id === id && category.format === 'Duplas' && category.requiresPartner !== false));
    if (requiresPartner && categorySelectionChanged) {
      const missingPartner = selectedCategoryIds.some((id) => {
        const category = categories.find((item) => item.id === id);
        if (!category || category.format !== 'Duplas' || category.requiresPartner === false) return false;
        const partner = (entry as any).categoryPartners?.[id];
        return !(partner?.name && partner?.email && partner?.phone);
      });
      if (missingPartner) throw new Error('Informe os dados do parceiro para cada categoria de duplas pré-definidas.');
    }
    const oldData = currentData;
    const before = auditSnapshot(oldData);
    const after = auditSnapshot(entry as unknown as Record<string, any>);
    const changedFields: string[] = trackedEntryFields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
    if (!current.exists()) changedFields.unshift('$registration');
    transaction.set(entryRef, sanitized);
    if (changedFields.length) {
      transaction.set(auditRef, {
        id: auditRef.id,
        eventPin,
        registrationEmail: cleanEmail,
        registrationId: entry.registrationId ?? oldData?.registrationId ?? null,
        participantName: entry.name || entry.nickname || oldData?.name || oldData?.nickname || null,
        actorEmail: authEmail,
        actorRole: authEmail && authEmail === cleanEmail ? 'athlete' : authEmail ? 'admin_or_coadmin' : 'system',
        action: current.exists() ? 'registration_updated' : 'registration_created',
        changedFields,
        before: sanitizeForFirestore(Object.fromEntries(changedFields.map((field) => [field, before[field]]))),
        after: sanitizeForFirestore(Object.fromEntries(changedFields.map((field) => [field, after[field]]))),
        source: 'live',
        createdAt: serverTimestamp(),
      });
      const importantFields = ['categoryIds', 'categoryPartners', 'partnerName', 'partnerEmail', 'partnerPhone', 'paymentStatus'];
      const isAthleteChange = authEmail === cleanEmail;
      const oldPaymentIds = new Set((oldData?.payments || []).map((payment: any) => payment.id).filter(Boolean));
      const hasNewPayment = (entry.payments || []).some((payment: any) => payment.id && !oldPaymentIds.has(payment.id));
      const notifyFields = changedFields.filter((field) => importantFields.includes(field) || (field === 'payments' && (isAthleteChange || !hasNewPayment)));
      const eventData = eventSnapshot.data() as any;
      if (notifyFields.length && authEmail && current.exists()) {
        const communicationRef = doc(collection(db, 'communications'));
        const categories = (entry.categoryIds || []).map((id) => eventData?.categories?.find((category: any) => category.id === id)?.name).filter(Boolean);
        const actionText = notifyFields.some((field) => field === 'categoryIds' || field === 'categoryPartners')
          ? 'categorias/parceiro'
          : 'pagamento';
        transaction.set(communicationRef, {
          type: 'message',
          title: isAthleteChange ? 'Inscrição atualizada pelo atleta' : 'Inscrição atualizada pela organização',
          content: isAthleteChange
            ? `${entry.name || entry.nickname || cleanEmail} atualizou ${actionText} no evento ${eventData?.name || eventPin}${categories.length ? `. Categorias atuais: ${categories.join(', ')}` : ''}.`
            : `A organização atualizou ${actionText} da sua inscrição no evento ${eventData?.name || eventPin}${categories.length ? `. Categorias atuais: ${categories.join(', ')}` : ''}.`,
          authorId: 'system',
          authorName: eventData?.name || 'Organização',
          createdAt: Date.now(),
          targetUserId: isAthleteChange ? 'admin' : cleanEmail,
          targetUserEmail: isAthleteChange ? 'celsomramalho@gmail.com' : cleanEmail,
          targetUserPin: isAthleteChange ? '' : entry.pin || '',
          targetUserPins: isAthleteChange ? eventData?.coAdminPins || [] : [],
          targetUserEmails: isAthleteChange ? [eventData?.organizerEmail].filter(Boolean) : [cleanEmail],
          isPinned: false,
          readBy: [],
          eventPin,
          notificationType: isAthleteChange ? 'event_registration_updated_by_athlete' : 'event_registration_updated_by_admin',
          registrationId: entry.registrationId || null,
          auditId: auditRef.id,
        });
      }
    }
  });
};

interface FirebaseEventRegistration {
  pin: string;
  name: string;
  joinedAt: number;
  bannerUrl?: string | null;
  paymentStatus?: PaymentStatus;
}

interface FirebaseTournamentEntry {
  registrationId?: number;
  email: string;
  name: string;
  nickname: string;
  pin: string;
  joinedAt: number;
  gender?: 'M' | 'F';
  checkedIn?: boolean;
  checkInDate?: string;
  checkInDates?: string[];
  categoryIds?: string[];
  dueAmount?: number;
  paidAmount?: number;
  paymentStatus?: PaymentStatus;
  payments?: Array<{
    id: string;
    amount: number;
    date: number;
    receiptUrl?: string;
    receiptName?: string;
    provider?: 'manual' | 'mercadopago';
    providerPaymentId?: string;
    status?: string;
  }>;
  mercadoPagoCheckout?: {
    provider: 'mercadopago';
    preferenceId?: string;
    initPoint?: string;
    sandboxInitPoint?: string;
    externalReference?: string;
    amount?: number;
    status?: string;
    createdAt?: number;
    updatedAt?: number;
    lastPaymentId?: string;
  };
  phone: string;
  shirtSize: 'P' | 'M' | 'G';
  partnerName?: string;
  partnerEmail?: string;
  partnerPhone?: string;
  categoryPartners?: Record<string, { name: string; email: string; phone: string }>;
  disabled?: boolean;
  disabledReason?: string;
  regulationAccepted?: boolean;
  regulationAcceptedAt?: number;
  information?: string;
}

export interface FirebaseTournamentMatch {
  id: string;
  pair1Id?: string;
  pair2Id?: string;
  status: 'waiting' | 'live' | 'finished';
  result?: string;
  winnerPairId?: string;
  ownerPin?: string;
  matchId?: string;
  round?: number;
  stage?: string;
  categoryId?: string;
}

export interface FirebaseTournamentEvent {
  pin: string;
  name: string;
  bannerUrl?: string;
  active: boolean;
  createdAt: number;
  config?: Record<string, unknown>;
  pairs?: unknown[];
  matches?: FirebaseTournamentMatch[];
  interdictedCourts?: string[];
  coAdminPins?: string[];
  helperPins?: string[];
  judgePins?: string[];
  regulationUrl?: string;
  regulationFileName?: string;
  information?: string;
  eventType?: string;
  sportGroup?: string;
  sportId?: string;
  sportName?: string;
  sportRules?: Record<string, unknown>;
  setsCount?: number;
  gamesPerSet?: number;
  teamDrawType?: string;
  bracketDrawType?: string;
  matchDrawType?: string;
  tournamentStartDate?: string;
  tournamentEndDate?: string;
  locationMapUrl?: string;
  rankingMatchesPerTeam?: number;
  groupsPerBracket?: number;
  paymentType?: 'manual' | 'mercadopago';
  registrationType?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return undefined as any;
  if (value === null) return null as any;

  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value.map(sanitizeForFirestore).filter((v) => v !== undefined) as any;
  }

  if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined && typeof v !== 'function') {
        cleaned[k] = sanitizeForFirestore(v);
      }
    }
    return cleaned as T;
  }

  return value;
}

export const fetchEventByPin = async (db: Firestore, pin: string): Promise<FirebaseTournamentEvent | null> => {
  const snap = await getDoc(doc(db, 'events', pin));
  if (!snap.exists()) return null;
  return { pin: snap.id, ...snap.data() } as FirebaseTournamentEvent;
};

export const fetchEventByPinFromServer = async (db: Firestore, pin: string): Promise<FirebaseTournamentEvent | null> => {
  const snap = await getDocFromServer(doc(db, 'events', pin));
  if (!snap.exists()) return null;
  return { pin: snap.id, ...snap.data() } as FirebaseTournamentEvent;
};

export const subscribeEventByPin = (
  db: Firestore,
  pin: string,
  onEvent: (event: FirebaseTournamentEvent) => void,
): Unsubscribe => {
  return onSnapshot(
    doc(db, 'events', pin),
    (snap) => {
      if (snap.exists()) onEvent({ pin: snap.id, ...snap.data() } as FirebaseTournamentEvent);
    },
    (error) => {
      console.warn('subscribeEventByPin listener error (fallback to fetch):', error);
      fetchEventByPin(db, pin).then((ev) => ev && onEvent(ev)).catch(() => {});
    }
  );
};

export const subscribeEventEntries = (
  db: Firestore,
  eventPin: string,
  onEntries: (entries: FirebaseTournamentEntry[]) => void,
): Unsubscribe => {
  // Usar metadata.hasPendingWrites + fromCache para distinguir snapshot real de cache
  return onSnapshot(
    collection(db, 'events', eventPin, 'entries'),
    { includeMetadataChanges: false },
    (snap) => {
      const list: FirebaseTournamentEntry[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as FirebaseTournamentEntry);
      });
      // Honrar lista vazia: se a subcoleção não tem documentos, a lista real é vazia
      onEntries(list);
    },
    (error) => {
      console.warn('subscribeEventEntries listener error (fallback to fetch):', error);
      fetchEventEntries(db, eventPin).then(onEntries).catch(() => {});
    }
  );
};

export const fetchEventEntries = async (db: Firestore, eventPin: string): Promise<FirebaseTournamentEntry[]> => {
  const entries: FirebaseTournamentEntry[] = [];
  try {
    // Usa getDocsFromServer para garantir dados frescos do servidor, sem cache local
    const snap = await getDocsFromServer(query(collection(db, 'events', eventPin, 'entries')));
    for (const entryDoc of snap.docs) {
      const entryData = entryDoc.data() as FirebaseTournamentEntry;
      entries.push(entryData);
    }
  } catch (e) {
    console.warn('fetchEventEntries subcollection warning:', e);
  }

  // Não fazer fallback para data.entries[] ou data.pairs do doc raiz:
  // esses dados podem estar desatualizados e ressuscitariam participantes já deletados.
  // A subcoleção /events/{pin}/entries é a fonte de verdade.
  return entries;
};

export const fetchEventEntry = async (
  db: Firestore,
  eventPin: string,
  email: string,
): Promise<FirebaseTournamentEntry | null> => {
  const snap = await getDoc(doc(db, 'events', eventPin, 'entries', email.toLowerCase().trim()));
  if (!snap.exists()) return null;
  return snap.data() as FirebaseTournamentEntry;
};

export const fetchUserEventRegistrations = async (
  db: Firestore,
  email: string,
): Promise<FirebaseEventRegistration[]> => {
  const cleanEmail = email.toLowerCase().trim();
  const snap = await getDocs(query(collection(db, 'user_registrations', cleanEmail, 'events')));
  const registrations: FirebaseEventRegistration[] = [];
  const registeredPins = new Set<string>();

  // Validar se as inscrições em user_registrations continuam existindo na subcoleção entries do evento
  await Promise.all(
    snap.docs.map(async (registrationDoc) => {
      const reg = registrationDoc.data() as FirebaseEventRegistration;
      const eventPin = reg.pin;
      try {
        const entrySnap = await getDoc(doc(db, 'events', eventPin, 'entries', cleanEmail));
        if (entrySnap.exists()) {
          const entryData = entrySnap.data() as FirebaseTournamentEntry;
          registrations.push({ ...reg, paymentStatus: entryData.paymentStatus });
          registeredPins.add(eventPin.toUpperCase());
        } else {
          // A inscrição foi excluída do evento! Limpa o registro órfão
          await deleteDoc(doc(db, 'user_registrations', cleanEmail, 'events', eventPin)).catch(() => {});
        }
      } catch {
        // Fallback em caso de erro de rede/leitura: mantém
        registrations.push(reg);
        registeredPins.add(eventPin.toUpperCase());
      }
    })
  );

  // Reconciliação: se o usuário foi inscrito manualmente pelo admin, busca os eventos e reconhece a inscrição
  try {
    const eventsSnap = await getDocs(query(collection(db, 'events')));
    for (const eventDoc of eventsSnap.docs) {
      const eventPin = eventDoc.id;
      if (registeredPins.has(eventPin.toUpperCase())) continue;

      const entrySnap = await getDoc(doc(db, 'events', eventPin, 'entries', cleanEmail));
      if (entrySnap.exists()) {
        const entryData = entrySnap.data() as FirebaseTournamentEntry;
        const eventData = eventDoc.data() as FirebaseTournamentEvent;
        const autoReg: FirebaseEventRegistration = {
          pin: eventPin,
          name: eventData.name || eventPin,
          joinedAt: entryData.joinedAt || Date.now(),
          bannerUrl: eventData.bannerUrl || null,
          paymentStatus: entryData.paymentStatus,
        };
        registrations.push(autoReg);
        registeredPins.add(eventPin);

        // Salva na subcoleção do usuário para agilizar próximas consultas
        try {
          await saveUserEventRegistration(db, cleanEmail, eventPin, autoReg);
        } catch {}
      }
    }
  } catch (err) {
    console.warn('Reconciliação de inscrições:', err);
  }

  return registrations.sort((a, b) => b.joinedAt - a.joinedAt);
};

export const saveEventEntry = (
  db: Firestore,
  eventPin: string,
  entry: FirebaseTournamentEntry,
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(entry)));
  return appendEntryAudit(db, eventPin, entry, sanitized);
};

/**
 * Reserva um ID de inscrição sem colisões, inclusive quando várias inscrições
 * são iniciadas ao mesmo tempo. A reserva é estável por e-mail para que uma
 * repetição após falha de rede recupere o mesmo número.
 */
export const reserveNextRegistrationId = async (
  db: Firestore,
  eventPin: string,
  entryEmail: string,
): Promise<number> => {
  const cleanEmail = entryEmail.toLowerCase().trim();
  if (!eventPin || !cleanEmail) throw new Error('Evento e e-mail são necessários para reservar o ID da inscrição.');

  const entriesCollection = collection(db, 'events', eventPin, 'entries');
  const entriesSnapshot = await getDocsFromServer(query(entriesCollection));
  const idCounts = new Map<number, number>();
  let maxExistingId = 0;
  entriesSnapshot.forEach((entryDoc) => {
    const data = entryDoc.data() as FirebaseTournamentEntry;
    const id = Number(data.registrationId);
    if (Number.isInteger(id) && id > 0) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
      maxExistingId = Math.max(maxExistingId, id);
    }
  });

  const counterRef = doc(db, 'events', eventPin, 'registration_counters', 'sequence');
  const entryRef = doc(db, 'events', eventPin, 'entries', cleanEmail);
  const reservationRef = doc(db, 'events', eventPin, 'registration_reservations', encodeURIComponent(cleanEmail));

  return runTransaction(db, async (transaction) => {
    const [counterSnapshot, entrySnapshot, reservationSnapshot] = await Promise.all([
      transaction.get(counterRef),
      transaction.get(entryRef),
      transaction.get(reservationRef),
    ]);
    const counterLastIssued = Number(counterSnapshot.data()?.lastIssued) || 0;
    const currentEntryId = Number(entrySnapshot.data()?.registrationId);
    const reservedId = Number(reservationSnapshot.data()?.registrationId);
    const entryHasUniqueId = Number.isInteger(currentEntryId) && currentEntryId > 0 && idCounts.get(currentEntryId) === 1;
    const reservationHasUniqueId = Number.isInteger(reservedId) && reservedId > 0 &&
      (!idCounts.has(reservedId) || (entryHasUniqueId && currentEntryId === reservedId));

    let registrationId: number;
    if (entryHasUniqueId) {
      registrationId = currentEntryId;
    } else if (reservationHasUniqueId) {
      registrationId = reservedId;
    } else {
      registrationId = Math.max(counterLastIssued, maxExistingId) + 1;
    }

    transaction.set(counterRef, { lastIssued: Math.max(counterLastIssued, maxExistingId, registrationId), updatedAt: Date.now() }, { merge: true });
    transaction.set(reservationRef, { email: cleanEmail, registrationId, reservedAt: reservationSnapshot.data()?.reservedAt || Date.now() }, { merge: true });
    return registrationId;
  });
};

/**
 * Salva uma inscrição feita pelo painel administrativo. Em instalações onde
 * a sessão Firebase ainda não recebeu o claim de administrador, usa o mesmo
 * fallback server-side do salvamento do evento.
 */
export const saveAdminEventEntry = async (
  db: Firestore,
  eventPin: string,
  entry: FirebaseTournamentEntry,
  adminEmail?: string,
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(entry)));
  try {
    await saveEventEntry(db, eventPin, sanitized);
    return;
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    const isPermissionError = firebaseErr?.code === 'permission-denied' || firebaseErr?.message?.includes('Missing or insufficient permissions');
    if (!isPermissionError || !adminEmail) throw err;

    const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
    try {
      const response = await fetch(`${baseUrl}/api/admin-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', eventPin, entry: sanitized, adminEmail }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível salvar a inscrição no servidor.');
      }
    } catch (fetchErr) {
      console.error('Falha no fallback server-side de salvamento:', fetchErr);
      throw new Error(fetchErr instanceof Error ? fetchErr.message : 'Falha na conexão com o servidor ao salvar inscrição.');
    }
  }
};

/** Atualiza exclusivamente os campos de check-in com validação do papel no servidor. */
export const saveAdminEventCheckIn = async (
  eventPin: string,
  adminEmail: string,
  adminPin: string,
  entry: Pick<FirebaseTournamentEntry, 'email' | 'pin' | 'checkedIn' | 'checkInDate' | 'checkInDates'>,
) => {
  const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
  const response = await fetch(`${baseUrl}/api/admin-entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'check-in', eventPin, adminEmail, adminPin, entry }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível salvar o check-in.');
  }
};

export const saveUserEventRegistration = (
  db: Firestore,
  email: string,
  eventPin: string,
  registration: FirebaseEventRegistration,
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(registration)));
  return setDoc(doc(db, 'user_registrations', email.toLowerCase().trim(), 'events', eventPin), sanitized);
};

export const deleteEventEntry = (
  db: Firestore,
  eventPin: string,
  email: string,
) => {
  const cleanEmail = email.toLowerCase().trim();
  const entryRef = doc(db, 'events', eventPin, 'entries', cleanEmail);
  const auditRef = doc(collection(db, 'events', eventPin, 'audit_logs'));
  const actorEmail = getAuthInstance()?.currentUser?.email?.toLowerCase().trim() || null;
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(entryRef);
    if (!current.exists()) return;
    const data = current.data();
    transaction.delete(entryRef);
    transaction.set(auditRef, {
      id: auditRef.id,
      eventPin,
      registrationEmail: cleanEmail,
      registrationId: data.registrationId ?? null,
      participantName: data.name || data.nickname || null,
      actorEmail,
      actorRole: actorEmail === cleanEmail ? 'athlete' : actorEmail ? 'admin_or_coadmin' : 'system',
      action: 'registration_deleted',
      changedFields: ['$registration'],
      before: auditSnapshot(data),
      after: null,
      source: 'live',
      createdAt: serverTimestamp(),
    });
  });
};

export const deleteUserEventRegistration = (
  db: Firestore,
  email: string,
  eventPin: string,
) => deleteDoc(doc(db, 'user_registrations', email.toLowerCase().trim(), 'events', eventPin));

/**
 * Exclui uma inscrição pelo painel administrativo.
 * Tenta no cliente via SDK e, caso haja falha ou para garantir limpeza completa,
 * aciona a rota server-side /api/admin-entry com privilégios de Admin SDK.
 */
export const deleteAdminEventEntry = async (
  db: Firestore,
  eventPin: string,
  entryEmail: string,
  entryPin?: string,
  adminEmail?: string,
) => {
  let clientDeleted = false;
  try {
    if (entryEmail) {
      await deleteEventEntry(db, eventPin, entryEmail);
      await deleteUserEventRegistration(db, entryEmail, eventPin).catch(() => {});
      clientDeleted = true;
    }
  } catch (err: unknown) {
    console.warn('deleteEventEntry cliente falhou (permissão ou conexão), acionando fallback server-side:', err);
  }

  // Se o cliente já excluiu diretamente no Firestore com sucesso, disparamos a limpeza server-side
  // em segundo plano (fire-and-forget) sem travar a UI caso a API demore ou caia por timeout.
  if (clientDeleted) {
    if (adminEmail) {
      const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
      fetch(`${baseUrl}/api/admin-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          eventPin,
          entryEmail,
          entryPin,
          adminEmail,
        }),
      }).catch((apiErr) => {
        console.warn('Limpeza auxiliar em /api/admin-entry falhou/expirou (não afeta exclusão direta):', apiErr);
      });
    }
    return;
  }

  // Fallback: somente se o cliente NÃO conseguiu deletar no Firestore (ex: regras de permissão)
  if (adminEmail) {
    try {
      const baseUrl = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://myplacar.app.br';
      const response = await fetch(`${baseUrl}/api/admin-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          eventPin,
          entryEmail,
          entryPin,
          adminEmail,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível excluir a inscrição no servidor.');
      }
      return;
    } catch (err: unknown) {
      console.error('Falha no fallback server-side de exclusão:', err);
      throw new Error(err instanceof Error ? err.message : 'Falha na conexão com o servidor ao excluir inscrição.');
    }
  }

  if (!clientDeleted) {
    throw new Error('Falha ao excluir inscrição: permissão insuficiente e administrador não identificado.');
  }
};

export const updateEventEntry = (
  db: Firestore,
  eventPin: string,
  email: string,
  data: Partial<FirebaseTournamentEntry>,
) => {
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(data)));
  return updateDoc(doc(db, 'events', eventPin, 'entries', email.toLowerCase().trim()), sanitized);
};

export const updateEvent = async (
  db: Firestore,
  eventPin: string,
  data: Partial<FirebaseTournamentEvent>,
) => {
  const toSave = { ...data };
  if (Array.isArray(toSave.pairs)) {
    toSave.pairs = (toSave.pairs as TournamentPair[]).map(minifyPairForStorage);
  }
  const sanitized = sanitizeForFirestore(JSON.parse(JSON.stringify(toSave)));
  if (Array.isArray(toSave.pairs)) {
    const eventRef = doc(db, 'events', eventPin);
    const actorEmail = getAuthInstance()?.currentUser?.email?.toLowerCase().trim() || null;
    return runTransaction(db, async (transaction) => {
      const current = await transaction.get(eventRef);
      const oldPairs = (current.data()?.pairs || []) as TournamentPair[];
      const nextPairs = (sanitized as any).pairs as TournamentPair[];
      const oldById = new Map(oldPairs.map((pair) => [pair.id, pair]));
      const nextById = new Map(nextPairs.map((pair) => [pair.id, pair]));
      const candidatePairs = [
        ...nextPairs.filter((pair) => !oldById.has(pair.id)),
        ...nextPairs.filter((pair) => oldById.has(pair.id) && JSON.stringify(oldById.get(pair.id)) !== JSON.stringify(pair)),
      ];
      const eventData = current.data() as any;
      const eventCategories = (eventData?.categories || []) as Array<{ id: string; format?: string; gender1?: string; gender2?: string }>;
      const memberReads = await Promise.all(candidatePairs.flatMap((pair) => [pair.p1, pair.p2]
        .filter((person) => Boolean(person?.email))
        .map((person) => transaction.get(doc(db, 'events', eventPin, 'entries', person.email.toLowerCase().trim())))));
      const memberByEmail = new Map<string, Record<string, any>>();
      let memberReadIndex = 0;
      for (const pair of candidatePairs) {
        for (const person of [pair.p1, pair.p2].filter((item) => Boolean(item?.email))) {
          const member = memberReads[memberReadIndex++];
          if (member?.exists()) memberByEmail.set(person.email.toLowerCase().trim(), member.data());
        }
      }
      for (const pair of candidatePairs) {
        const category = eventCategories.find((item) => item.id === pair.categoryId);
        if (eventCategories.length && !category) throw new Error('Não foi possível validar a categoria do time. Atualize a tela e tente novamente.');
        if (category?.format === 'Duplas') {
          const participants = [pair.p1, pair.p2];
          for (const person of participants) {
            const email = person.email?.toLowerCase().trim();
            const registered = email ? memberByEmail.get(email) : undefined;
            const memberCategoryIds = registered?.categoryIds || person.categoryIds || [];
            if (!memberCategoryIds.includes(category.id)) throw new Error('Um dos atletas não está inscrito nesta categoria. Revise os participantes do time.');
          }
          const expectedGenders = [category.gender1, category.gender2].filter(Boolean).sort();
          const actualGenders = participants.map((person) => memberByEmail.get(person.email?.toLowerCase().trim() || '')?.gender || person.gender).filter(Boolean).sort();
          if (expectedGenders.length === 2 && actualGenders.length === 2 && expectedGenders.join('|') !== actualGenders.join('|')) {
            throw new Error('Os gêneros dos participantes não correspondem aos requisitos desta categoria.');
          }
        }
      }
      const changes = [
        ...nextPairs.filter((pair) => !oldById.has(pair.id)).map((pair) => ({ action: 'team_formed', pair, before: null })),
        ...oldPairs.filter((pair) => !nextById.has(pair.id)).map((pair) => ({ action: 'team_dissolved', pair, before: pair })),
        ...nextPairs.filter((pair) => oldById.has(pair.id) && JSON.stringify(oldById.get(pair.id)) !== JSON.stringify(pair)).map((pair) => ({ action: 'team_updated', pair, before: oldById.get(pair.id) })),
      ];
      transaction.update(eventRef, { ...sanitized, entries: deleteField() });
      for (const change of changes) {
        const participants = [change.pair.p1, change.pair.p2].filter(Boolean);
        for (const person of participants) {
          const auditRef = doc(collection(db, 'events', eventPin, 'audit_logs'));
          transaction.set(auditRef, {
            id: auditRef.id,
            eventPin,
            registrationEmail: person.email?.toLowerCase().trim() || null,
            registrationPin: person.pin?.toUpperCase().trim() || null,
            registrationId: person.registrationId || null,
            participantName: person.name || person.nickname || null,
            categoryId: change.pair.categoryId || null,
            actorEmail,
            actorRole: actorEmail && actorEmail === person.email?.toLowerCase().trim() ? 'athlete' : actorEmail ? 'admin_or_coadmin' : 'system',
            action: change.action,
            changedFields: ['pair'],
            before: change.before,
            after: change.action === 'team_dissolved' ? null : change.pair,
            source: 'live',
            createdAt: serverTimestamp(),
          });
          if (actorEmail) {
            const shouldNotifyPerson = actorEmail !== person.email?.toLowerCase().trim();
            if (shouldNotifyPerson && person.email && !person.email.toLowerCase().includes('@simplificada.local')) {
              const communicationRef = doc(collection(db, 'communications'));
              const verb = change.action === 'team_formed' ? 'foi formado' : change.action === 'team_dissolved' ? 'foi desfeito' : 'foi atualizado';
              const categoryName = eventData?.categories?.find((category: any) => category.id === change.pair.categoryId)?.name || 'do evento';
              transaction.set(communicationRef, {
                type: 'message',
                title: change.action === 'team_dissolved' ? 'Time desfeito' : 'Time atualizado',
                content: `Um time da categoria ${categoryName} ${verb} pela organização no evento ${eventData?.name || eventPin}.`,
                authorId: 'system',
                authorName: eventData?.name || 'Organização',
                createdAt: Date.now(),
                targetUserId: person.email.toLowerCase().trim(),
                targetUserEmail: person.email.toLowerCase().trim(),
                targetUserPin: person.pin || '',
                isPinned: false,
                readBy: [],
                eventPin,
                categoryId: change.pair.categoryId || null,
                notificationType: 'event_team_updated',
                auditId: auditRef.id,
              });
            }
          }
        }
      }
    });
  }
  try {
    return await updateDoc(doc(db, 'events', eventPin), {
      ...sanitized,
      entries: deleteField(),
    });
  } catch (_e) {
    return await updateDoc(doc(db, 'events', eventPin), sanitized);
  }
};

export const updateEventMatches = (
  db: Firestore,
  eventPin: string,
  matches: FirebaseTournamentMatch[],
) => updateDoc(doc(db, 'events', eventPin), { matches: sanitizeForFirestore(JSON.parse(JSON.stringify(matches))) });

/**
 * Garante que todas as inscrições existentes de um evento tenham Inscrição_ID sequencial único.
 * Para inscrições que ainda não possuem Inscrição_ID (ex: os 16 inscritos legados), atribui
 * automaticamente em ordem cronológica de inscrição (joinedAt) e persiste no Firestore.
 */
export const ensureEventEntriesRegistrationIds = async (
  db: Firestore,
  eventPin: string,
  entries: FirebaseTournamentEntry[],
): Promise<FirebaseTournamentEntry[]> => {
  if (!entries || entries.length === 0) return entries;

  let hasChanges = false;
  // Ordena por joinedAt para manter a ordem cronológica de inscrição
  const sorted = [...entries].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

  const existingIds = new Set<number>(
    sorted
      .map((e) => Number(e.registrationId))
      .filter((n) => !isNaN(n) && n > 0)
  );

  let nextSeq = 1;
  const getNextAvailableId = () => {
    while (existingIds.has(nextSeq)) {
      nextSeq++;
    }
    existingIds.add(nextSeq);
    return nextSeq;
  };

  const updatedEntries = sorted.map((entry) => {
    if (!entry.registrationId || isNaN(Number(entry.registrationId)) || Number(entry.registrationId) <= 0) {
      hasChanges = true;
      const assignedId = getNextAvailableId();
      return { ...entry, registrationId: assignedId };
    }
    return entry;
  });

  if (hasChanges && db && eventPin) {
    for (const entry of updatedEntries) {
      const original = entries.find((e) => e.email === entry.email);
      if (!original?.registrationId && entry.registrationId && entry.email) {
        try {
          void updateEventEntry(db, eventPin, entry.email, { registrationId: entry.registrationId });
        } catch (err) {
          console.warn('Erro ao auto-atribuir Inscrição_ID para', entry.email, err);
        }
      }
    }
  }

  return updatedEntries;
};
