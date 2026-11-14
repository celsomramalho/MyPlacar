import type { PaymentItem, TournamentEntry, TournamentEvent } from '../types';
import { getRegistrationPeriodStatus } from './eventRegistrationPeriod';

export const getRegistrationCancellationRefundPercent = (
  event: TournamentEvent,
  now = new Date(),
): 100 | 75 | 50 => {
  if (getRegistrationPeriodStatus(event, now).isOpen) {
    return event.registrationCancellationRefundPercent ?? 100;
  }
  return event.outsideRegistrationCancellationRefundPercent ?? 50;
};

export const hasRegistrationReceiptAttachment = (entry: TournamentEntry): boolean =>
  Boolean((entry as TournamentEntry & { receiptUrl?: string }).receiptUrl) ||
  Boolean(entry.payments?.some((payment) => payment.receiptUrl));

export const createRegistrationCancellationRequest = (
  entry: TournamentEntry,
  event: TournamentEvent,
  now = new Date(),
): TournamentEntry => {
  if (entry.refundRequestedAt) return entry;
  const refundRate = getRegistrationCancellationRefundPercent(event, now) / 100;
  const payments: PaymentItem[] = entry.payments?.length
    ? entry.payments.map((payment) => {
        const wasPaid = ['Confirmado', 'Pago', 'approved'].includes(String(payment.status)) ||
          (!payment.status && ['Confirmado', 'Pago'].includes(String(entry.paymentStatus)));
        return {
          ...payment,
          status: 'A devolver',
          refundAmount: wasPaid ? (payment.amount || 0) * refundRate : 0,
        };
      })
    : [{
        id: `cancel-${entry.pin}-${Date.now()}`,
        date: Date.now(),
        amount: entry.paidAmount ?? entry.dueAmount ?? 0,
        receiptUrl: (entry as TournamentEntry & { receiptUrl?: string }).receiptUrl,
        receiptFileName: (entry as TournamentEntry & { receiptFileName?: string }).receiptFileName,
        status: 'A devolver',
        refundAmount: (['Confirmado', 'Pago'].includes(String(entry.paymentStatus))
          ? entry.paidAmount ?? entry.dueAmount ?? 0
          : 0) * refundRate,
      }];
  const refundAmount = payments.reduce((sum, payment) => sum + (payment.refundAmount || 0), 0);
  return {
    ...entry,
    payments,
    refundRate,
    refundAmount,
    refundRequestedAt: Date.now(),
    paymentStatus: 'Cancelado',
    disabled: true,
    disabledReason: `Cancelamento solicitado · reembolso ${Math.round(refundRate * 100)}%`,
  };
};
