import { addDoc, collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { EventCategory, PaymentItem, TournamentEntry, TournamentEvent } from '../types';

export const eventNotificationService = {
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
      if (!userPin && !userEmail) return;

      // Verificar se já existe aviso de confirmação enviado para este evento e usuário (uma única vez)
      const existingQuery = query(
        collection(db, 'communications'),
        where('targetUserId', 'in', [userPin, userEmail, userPin.toUpperCase(), userEmail.toLowerCase()]),
      );
      const snap = await getDocs(existingQuery);
      const alreadyNotified = snap.docs.some((docSnap) => {
        const data = docSnap.data();
        return (
          data.eventPin === event.pin &&
          data.notificationType === 'registration_confirmed'
        );
      });

      if (alreadyNotified) return;

      const locationStr = event.location ? `${event.location}` : 'Local a definir';
      const dateStr = event.eventDateText
        ? event.eventDateText
        : event.startDate
          ? new Date(event.startDate).toLocaleDateString('pt-BR')
          : 'Data a confirmar';

      const catNames = (entry.categoryIds || [])
        .map((id) => {
          const cat = (event.categories || []).find((c) => c.id === id);
          return cat ? `${cat.name} (${cat.abbreviation})` : null;
        })
        .filter(Boolean)
        .join(', ');
      const catStr = catNames ? `, categoria(s): ${catNames}` : '';

      const content = `Inscrição confirmada no evento ${event.name}${catStr}, ${locationStr} e ${dateStr}.`;

      await addDoc(collection(db, 'communications'), {
        type: 'message',
        title: 'Inscrição Confirmada',
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
      console.warn('Erro ao criar aviso de inscrição confirmada:', err);
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
};
