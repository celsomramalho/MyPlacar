import type { TournamentEvent, TournamentEntry, PaymentItem } from '../types';

export interface EventPaymentStats {
  totalDue: number;
  totalPaid: number;
  totalAwaiting: number;
  totalPre: number;
  totalRefused: number;
  totalToRefund: number;
  totalRefunded: number;

  paidCount: number;
  exemptCount: number;
  awaitingReceiptsCount: number;
  awaitingCount: number;
  preCount: number;
  refusedReceiptsCount: number;
  refusedCount: number;
  toRefundReceiptsCount: number;
  toRefundCount: number;
  refundedReceiptsCount: number;
  refundedCount: number;

  actionablePendingCount: number;
}

export type PaymentReviewStatus =
  | 'Confirmado'
  | 'Aguardando Confirmação'
  | 'Recusado'
  | 'A devolver'
  | 'Devolvido'
  | 'Isento';

export const getPaymentReviewStatus = (payment: PaymentItem): PaymentReviewStatus => {
  if (payment.status === 'Confirmado' || payment.status === 'approved' || payment.status === 'Pago') {
    return 'Confirmado';
  }
  if (payment.status === 'Recusado' || payment.status === 'rejected') {
    return 'Recusado';
  }
  if (payment.status === 'A devolver') {
    return 'A devolver';
  }
  if (payment.status === 'Devolvido' || payment.status === 'refunded' || payment.status === 'cancelled' || payment.status === 'Cancelado') {
    return 'Devolvido';
  }
  if (payment.status === 'Isento') {
    return 'Isento';
  }
  return 'Aguardando Confirmação';
};

export const getEventPaymentStats = (event: TournamentEvent): EventPaymentStats => {
  const entries = event.entries || [];
  const defaultFee = event.registrationFee || 0;

  let totalDue = 0;
  let totalPaid = 0;
  let totalAwaiting = 0;
  let totalPre = 0;
  let totalRefused = 0;
  let totalToRefund = 0;
  let totalRefunded = 0;

  const paidPins = new Set<string>();
  const exemptPins = new Set<string>();
  const awaitingPins = new Set<string>();
  const prePins = new Set<string>();
  const refusedPins = new Set<string>();
  const toRefundPins = new Set<string>();
  const refundedPins = new Set<string>();

  let awaitingReceiptsCount = 0;
  let refusedReceiptsCount = 0;
  let toRefundReceiptsCount = 0;
  let refundedReceiptsCount = 0;

  entries.forEach((entry) => {
    const isCancelled = Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');
    const isExempt = entry.paymentStatus === 'Isento' || entry.payments?.some((p) => p.status === 'Isento');
    const entryDue = isExempt ? 0 : (entry.dueAmount ?? defaultFee);

    // Soma ao total devido apenas inscrições ativas (não canceladas) e não isentas
    if (!isCancelled && !isExempt) {
      totalDue += entryDue;
    }

    if (isExempt && !isCancelled) {
      exemptPins.add(entry.pin);
    }

    const payments = entry.payments || [];
    let entryPaid = 0;

    if (payments.length > 0) {
      payments.forEach((p) => {
        const revStatus = getPaymentReviewStatus(p);
        const amt = p.amount || 0;

        if (revStatus === 'Confirmado') {
          entryPaid += amt;
          totalPaid += amt;
          paidPins.add(entry.pin);
        } else if (revStatus === 'Aguardando Confirmação') {
          totalAwaiting += amt;
          awaitingReceiptsCount++;
          awaitingPins.add(entry.pin);
        } else if (revStatus === 'Recusado') {
          totalRefused += amt;
          refusedReceiptsCount++;
          refusedPins.add(entry.pin);
        } else if (revStatus === 'A devolver') {
          totalToRefund += amt;
          toRefundReceiptsCount++;
          toRefundPins.add(entry.pin);
        } else if (revStatus === 'Devolvido') {
          totalRefunded += amt;
          refundedReceiptsCount++;
          refundedPins.add(entry.pin);
        }
      });
    } else {
      // Legacy sem payments array
      if (!isCancelled && (entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago')) {
        const legacyPaid = entry.paidAmount ?? entryDue;
        entryPaid = legacyPaid;
        totalPaid += legacyPaid;
        paidPins.add(entry.pin);
      } else if (entry.paymentStatus === 'Recusado') {
        refusedPins.add(entry.pin);
        totalRefused += entryDue;
      } else if (entry.paymentStatus === 'A devolver') {
        toRefundPins.add(entry.pin);
        totalToRefund += entry.paidAmount ?? entryDue;
      } else if (entry.paymentStatus === 'Devolvido') {
        refundedPins.add(entry.pin);
        totalRefunded += entry.paidAmount ?? entryDue;
      }
    }

    // Pré-inscrito: Ativo, não isento, sem comprovante em análise e com saldo devido em aberto
    const hasPendingReview = payments.some((p) => getPaymentReviewStatus(p) === 'Aguardando Confirmação');
    const remainingDue = Math.max(0, entryDue - entryPaid);

    if (!isCancelled && !isExempt && !hasPendingReview && remainingDue > 0) {
      // Se não tem comprovante anexado
      const hasReceipt = payments.some((p) => Boolean(p.receiptUrl));
      if (!hasReceipt || entryPaid === 0) {
        prePins.add(entry.pin);
        totalPre += remainingDue;
      }
    }
  });

  return {
    totalDue,
    totalPaid,
    totalAwaiting,
    totalPre,
    totalRefused,
    totalToRefund,
    totalRefunded,

    paidCount: paidPins.size,
    exemptCount: exemptPins.size,
    awaitingReceiptsCount,
    awaitingCount: awaitingPins.size,
    preCount: prePins.size,
    refusedReceiptsCount,
    refusedCount: refusedPins.size,
    toRefundReceiptsCount,
    toRefundCount: toRefundPins.size,
    refundedReceiptsCount,
    refundedCount: refundedPins.size,

    actionablePendingCount: awaitingReceiptsCount + toRefundReceiptsCount,
  };
};
