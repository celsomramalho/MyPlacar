import { addDoc, collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { EventCategory, PaymentItem, TournamentEntry, TournamentEvent } from '../types';

export const eventNotificationService = {
  /** Cria avisos direcionados ao administrador principal e aos co-administradores do evento. */
  notifyEventAdmins: async (
    db: Firestore,
    event: TournamentEvent,
    title: string,
    content: string,
    notificationType: string,
    metadata: Record<string, unknown> = {},
  ) => {
    try {
      const coAdminPins = Array.from(new Set((event.coAdminPins || [])
        .map((pin) => pin.trim().toUpperCase())
        .filter(Boolean)));
      const usersSnapshot = coAdminPins.length
        ? await getDocs(collection(db, 'users'))
        : null;
      const coAdmins = (usersSnapshot?.docs || [])
        .map((snapshot) => ({ id: snapshot.id, ...(snapshot.data() as Record<string, unknown>) }))
        .filter((user) => coAdminPins.includes(String(user['pin'] || '').trim().toUpperCase()));
      const recipients = [
        { targetUserId: 'admin', targetUserEmail: 'celsomramalho@gmail.com', targetUserPin: '' },
        ...coAdmins.map((user) => ({
          targetUserId: String(user['pin'] || '').trim().toUpperCase(),
          targetUserEmail: String(user['email'] || '').trim().toLowerCase(),
          targetUserPin: String(user['pin'] || '').trim().toUpperCase(),
        })),
      ];
      const seen = new Set<string>();
      for (const recipient of recipients) {
        const key = recipient.targetUserEmail || recipient.targetUserPin;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        await addDoc(collection(db, 'communications'), {
          type: 'message', title, content,
          authorId: 'system', authorName: event.name || 'Organização', createdAt: Date.now(),
          ...recipient, isPinned: false, readBy: [], eventPin: event.pin, notificationType, ...metadata,
        });
      }
    } catch (err) {
      console.warn(`Erro ao criar aviso ${notificationType} para administradores do evento:`, err);
    }
  },
  /**
   * a & e) Envia aviso para o usuário toda vez que ele fizer uma inscrição e ela for confirmada:
   * "Inscrição confirmada no evento [nome do evento], categoria(s): [categorias], [local] e [data]" (uma única vez).
   */
  notifyRegistrationConfirmed: async (
    db: Firestore,
    event: TournamentEvent,
    entry: TournamentEntry,
  ) => {
    try {
      const userPin = (entry.pin || '').trim();
      const userEmail = (entry.email || '').trim().toLowerCase();
      const catNames = (entry.categoryIds || [])
        .map((id) => {
          const cat = (event.categories || []).find((c) => c.id === id);
          return cat ? `${cat.name} (${cat.abbreviation})` : null;
        })
        .filter(Boolean)
        .join(', ');
      const catStr = catNames ? `, categoria(s): ${catNames}` : '';

      await eventNotificationService.notifyEventAdmins(
        db,
        event,
        'Nova Inscrição no Evento',
        `${entry.name || entry.nickname || userEmail || userPin || 'Novo participante'} realizou inscrição no evento ${event.name}${catStr}.`,
        'event_registration_created',
        { registrationId: entry.registrationId || null },
      );
      if (event.registrationType === 'Simplificada' || (!userPin && !userEmail)) return;

      const locationStr = event.location ? `${event.location}` : 'Local a definir';
      const dateStr = event.eventDateText
        ? event.eventDateText
        : event.startDate
          ? new Date(event.startDate).toLocaleDateString('pt-BR')
          : 'Data a confirmar';

      const isConfirmed = entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago' || entry.paymentStatus === 'Isento';
      const title = isConfirmed ? 'Inscrição Confirmada' : 'Inscrição Recebida';
      const content = isConfirmed
        ? `Inscrição confirmada no evento ${event.name}${catStr}, ${locationStr} e ${dateStr}.`
        : `Sua inscrição no evento ${event.name}${catStr} foi recebida. ${locationStr}, ${dateStr}. Aguardando confirmação de pagamento.`;

      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title,
        content,
        authorId: 'system',
        authorName: event.name || 'Organização',
        createdAt: Date.now(),
        targetUserId: userPin || userEmail,
        targetUserPin: userPin,
        targetUserEmail: userEmail,
        isPinned: true,
        readBy: [],
        eventPin: event.pin,
        notificationType: 'registration_confirmed',
      });
    } catch (err) {
      console.warn('Erro ao criar aviso de inscrição:', err);
    }
  },

  /**
   * b) Envia aviso para o usuário toda vez que for criado um histórico de pagamento:
   * "Pagamento salvo e pendente de confirmação, [data], [valor], [comprovante]"
   */
  notifyPaymentCreated: async (
    db: Firestore,
    event: TournamentEvent,
    entry: TournamentEntry,
    payment: PaymentItem,
  ) => {
    try {
      await eventNotificationService.notifyEventAdmins(
        db,
        event,
        'Novo Pagamento no Evento',
        `${entry.name || entry.nickname || entry.email || 'Participante'} registrou um pagamento de R$ ${payment.amount.toFixed(2)} no evento ${event.name}.`,
        'event_payment_created',
        { paymentId: payment.id || null, registrationId: entry.registrationId || null },
      );
      if (event.registrationType === 'Simplificada') return;
      const userPin = (entry.pin || '').trim();
      const userEmail = (entry.email || '').trim().toLowerCase();
      if (!userPin && !userEmail) return;

      const dateFormatted = new Date(payment.date).toLocaleDateString('pt-BR');
      const amountFormatted = `R$ ${payment.amount.toFixed(2)}`;
      const receiptFormatted = payment.receiptUrl
        ? (payment.receiptFileName || 'Comprovante anexado')
        : 'Sem comprovante';

      const content = `Pagamento salvo e pendente de confirmação. Data: ${dateFormatted}, Valor: ${amountFormatted}, Comprovante: ${receiptFormatted}.`;

      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title: 'Pagamento Salvo',
        content,
        authorId: 'system',
        authorName: event.name || 'Organização',
        createdAt: Date.now(),
        targetUserId: userPin || userEmail,
        targetUserPin: userPin,
        targetUserEmail: userEmail,
        isPinned: false,
        readBy: [],
        eventPin: event.pin,
        paymentId: payment.id,
        notificationType: 'payment_created',
      });
    } catch (err) {
      console.warn('Erro ao criar aviso de pagamento salvo:', err);
    }
  },

  /**
   * c) Envia aviso para o usuário toda vez que se inscreve em uma nova categoria:
   * "Você foi inscrito na categoria [Categoria (Sigla)] no evento [Nome do Evento]"
   */
  notifyNewCategory: async (
    db: Firestore,
    event: TournamentEvent,
    entry: TournamentEntry,
    category: EventCategory,
  ) => {
    try {
      if (event.registrationType === 'Simplificada') return;
      const userPin = (entry.pin || '').trim();
      const userEmail = (entry.email || '').trim().toLowerCase();
      if (!userPin && !userEmail) return;

      const content = `Você foi inscrito na categoria ${category.name} (${category.abbreviation}) no evento ${event.name}.`;

      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title: 'Inscrição em Categoria',
        content,
        authorId: 'system',
        authorName: event.name || 'Organização',
        createdAt: Date.now(),
        targetUserId: userPin || userEmail,
        targetUserPin: userPin,
        targetUserEmail: userEmail,
        isPinned: false,
        readBy: [],
        eventPin: event.pin,
        categoryId: category.id,
        notificationType: 'new_category',
      });
    } catch (err) {
      console.warn('Erro ao criar aviso de nova categoria:', err);
    }
  },

  /**
   * Envia aviso para o usuário toda vez que inscrição for salva e tiver valor pendente maior que zero:
   * "Sua inscrição tem valores não pagos, sua inscrição só será válida após informar pagamento e este for confirmado"
   */
  notifyPendingPayment: async (
    db: Firestore,
    event: TournamentEvent,
    entry: TournamentEntry,
    pendingAmount: number,
  ) => {
    try {
      if (event.registrationType === 'Simplificada') return;
      const userPin = (entry.pin || '').trim();
      const userEmail = (entry.email || '').trim().toLowerCase();
      if (!userPin && !userEmail) return;
      if (pendingAmount <= 0) return;

      const content = `Sua inscrição tem valores não pagos (R$ ${pendingAmount.toFixed(2)} pendente). Sua inscrição só será válida após informar pagamento e este for confirmado.`;

      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title: 'Valores Pendentes na Inscrição',
        content,
        authorId: 'system',
        authorName: event.name || 'Organização',
        createdAt: Date.now(),
        targetUserId: userPin || userEmail,
        targetUserPin: userPin,
        targetUserEmail: userEmail,
        isPinned: false,
        readBy: [],
        eventPin: event.pin,
        notificationType: 'pending_payment',
      });
    } catch (err) {
      console.warn('Erro ao criar aviso de pagamento pendente:', err);
    }
  },

  /**
   * Envia aviso para o usuário ao confirmar a saída ou exclusão de uma inscrição:
   * "Exclusão de inscrição confirmada: Sua inscrição no evento [Nome do Evento] foi cancelada/excluída com sucesso."
   */
  notifyRegistrationDeleted: async (
    db: Firestore,
    event: TournamentEvent,
    userPinOrEmail: string,
    _userNickname?: string,
  ) => {
    try {
      if (event.registrationType === 'Simplificada') return;
      const target = (userPinOrEmail || '').trim();
      if (!target) return;

      const content = `Sua inscrição no evento ${event.name || 'do torneio'} foi cancelada/excluída com sucesso.`;

      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title: 'Exclusão de Inscrição Confirmada',
        content,
        authorId: 'system',
        authorName: event.name || 'Organização',
        createdAt: Date.now(),
        targetUserId: target,
        targetUserEmail: target.includes('@') ? target.toLowerCase() : '',
        targetUserPin: !target.includes('@') ? target : '',
        isPinned: false,
        readBy: [],
        eventPin: event.pin,
        notificationType: 'registration_deleted',
      });
    } catch (err) {
      console.warn('Erro ao criar aviso de exclusão de inscrição:', err);
    }
  },
};
