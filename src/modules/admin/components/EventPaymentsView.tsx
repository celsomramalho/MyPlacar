import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, CheckCircle2, Search, X, Trash2, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatRegistrationId, type PaymentItem, type TournamentEvent, type TournamentEntry, type PaymentStatus } from '@modules/events/types';
import { getPaymentReviewStatus, type PaymentReviewStatus } from '@modules/events/services/eventPaymentStats';

interface Props {
  event: TournamentEvent;
  onUpdateEvent: (event: TournamentEvent) => void;
}

interface FlattenedPayment {
  paymentId: string;
  entryPin: string;
  participantName: string;
  registrationId?: number | string;
  dueAmount?: number;
  date: number;
  amount: number;
  categoriesStr: string;
  receiptUrl?: string;
  receiptFileName?: string;
}

const openReceiptInNewTab = (url: string) => {
  if (!url.startsWith('data:')) return;
  try {
    const [metadata, encodedData] = url.split(',', 2);
    if (!metadata || encodedData === undefined) return;
    const mimeType = metadata.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream';
    const bytes = metadata.includes(';base64')
      ? Uint8Array.from(atob(encodedData), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(encodedData));
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    console.error('[EventPaymentsView] Não foi possível abrir o comprovante:', error);
  }
};

const formatDateShort = (timestamp: number) => {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

export const EventPaymentsView: React.FC<Props> = ({ event, onUpdateEvent }) => {
  const [searchName, setSearchName] = useState('');
  const [paymentGroup, setPaymentGroup] = useState<
    'all' | 'awaiting' | 'pre' | 'to_refund' | 'refused' | 'confirmed' | 'exempt' | 'refunded'
  >('all');

  // a) Todos os blocos fechados por padrão
  const [isAwaitingExpanded, setIsAwaitingExpanded] = useState(false);
  const [isPreRegistrationExpanded, setIsPreRegistrationExpanded] = useState(false);
  const [isToRefundExpanded, setIsToRefundExpanded] = useState(false);
  const [isRefusedExpanded, setIsRefusedExpanded] = useState(false);
  const [isPaidExpanded, setIsPaidExpanded] = useState(false);
  const [isExemptExpanded, setIsExemptExpanded] = useState(false);
  const [isRefundedExpanded, setIsRefundedExpanded] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    pin: string;
    paymentId?: string;
    paymentIndex?: number;
    name: string;
    status: PaymentReviewStatus;
    isTotalRefund?: boolean;
  } | null>(null);

  const [pendingReceiptDeletion, setPendingReceiptDeletion] = useState<{
    pin: string;
    paymentId?: string;
    paymentIndex: number;
    name: string;
    amount: number;
    date: number;
  } | null>(null);

  const categories = event.categories || [];
  const entries = event.entries || [];

  const getCategoriesText = (entry: TournamentEntry) => {
    if (!entry.categoryIds || entry.categoryIds.length === 0) return 'Geral';
    const entryCats = categories.filter((c) => entry.categoryIds?.includes(c.id));
    if (entryCats.length === 0) return 'Geral';
    return entryCats.map((c) => c.abbreviation || c.name).join(', ');
  };

  const matchesSearch = (entry: TournamentEntry) => {
    const term = searchName.trim().toLocaleLowerCase();
    if (!term) return true;
    const normalizedId = formatRegistrationId(entry.registrationId).toLocaleLowerCase();
    return [entry.name, entry.nickname, entry.pin, entry.email, normalizedId, String(entry.registrationId ?? '')]
      .some((value) => String(value || '').toLocaleLowerCase().includes(term));
  };

  // Listas de agrupamento
  const paidPaymentsList: FlattenedPayment[] = [];
  const exemptEntriesList: TournamentEntry[] = [];
  const awaitingEntriesList: {
    entry: TournamentEntry;
    payment: PaymentItem;
    paymentIndex: number;
    dueAmount: number;
    paidAmount: number;
    pendingAmount: number;
    categoriesStr: string;
  }[] = [];
  const preRegistrationEntries: TournamentEntry[] = [];
  const refusedEntriesList: {
    entry: TournamentEntry;
    payment: PaymentItem;
    paymentIndex: number;
    dueAmount: number;
    categoriesStr: string;
  }[] = [];
  const toRefundEntriesList: {
    entry: TournamentEntry;
    payment: PaymentItem;
    paymentIndex: number;
    refundAmount: number;
    categoriesStr: string;
  }[] = [];
  const refundedEntriesList: {
    entry: TournamentEntry;
    payment: PaymentItem;
    paymentIndex: number;
    refundedAmount: number;
    categoriesStr: string;
  }[] = [];

  let totalPaidSum = 0;
  let totalAwaitingSum = 0;
  let totalPreSum = 0;
  let totalRefusedSum = 0;
  let totalToRefundSum = 0;
  let totalRefundedSum = 0;

  entries.forEach((entry) => {
    const showEntry = matchesSearch(entry);
    const entryDue = entry.dueAmount ?? (event.registrationFee || 0);
    const catStr = getCategoriesText(entry);
    const isCancelled = Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');
    const isExempt = entry.paymentStatus === 'Isento' || entry.payments?.some((p) => p.status === 'Isento');

    if (isExempt && !isCancelled) {
      if (showEntry) exemptEntriesList.push(entry);
      return;
    }

    const payments = entry.payments || [];
    let entryPaid = 0;

    if (payments.length > 0) {
      payments.forEach((p, idx) => {
        const revStatus = getPaymentReviewStatus(p);
        const amt = p.amount || 0;

        if (revStatus === 'Confirmado') {
          entryPaid += amt;
          totalPaidSum += amt;
          if (showEntry) {
            paidPaymentsList.push({
              paymentId: p.id || `p-${entry.pin}-${idx}`,
              entryPin: entry.pin,
              participantName: entry.name || entry.nickname,
              registrationId: entry.registrationId,
              dueAmount: entryDue,
              date: p.date,
              amount: amt,
              categoriesStr: catStr,
              receiptUrl: p.receiptUrl,
              receiptFileName: p.receiptFileName,
            });
          }
        } else if (revStatus === 'Aguardando Confirmação') {
          totalAwaitingSum += amt;
          if (showEntry) {
            awaitingEntriesList.push({
              entry,
              payment: p,
              paymentIndex: idx,
              dueAmount: entryDue,
              paidAmount: entryPaid,
              pendingAmount: amt,
              categoriesStr: catStr,
            });
          }
        } else if (revStatus === 'Recusado') {
          totalRefusedSum += amt;
          if (showEntry) {
            refusedEntriesList.push({
              entry,
              payment: p,
              paymentIndex: idx,
              dueAmount: entryDue,
              categoriesStr: catStr,
            });
          }
        } else if (revStatus === 'A devolver') {
          totalToRefundSum += amt;
          if (showEntry) {
            toRefundEntriesList.push({
              entry,
              payment: p,
              paymentIndex: idx,
              refundAmount: amt,
              categoriesStr: catStr,
            });
          }
        } else if (revStatus === 'Devolvido') {
          totalRefundedSum += amt;
          if (showEntry) {
            refundedEntriesList.push({
              entry,
              payment: p,
              paymentIndex: idx,
              refundedAmount: amt,
              categoriesStr: catStr,
            });
          }
        }
      });
    } else {
      // Legacy sem payments array
      if (!isCancelled && (entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago')) {
        const legacyPaid = entry.paidAmount ?? entryDue;
        entryPaid = legacyPaid;
        totalPaidSum += legacyPaid;
        if (showEntry) {
          paidPaymentsList.push({
            paymentId: `legacy-${entry.pin}`,
            entryPin: entry.pin,
            participantName: entry.name || entry.nickname,
            registrationId: entry.registrationId,
            dueAmount: entryDue,
            date: entry.joinedAt || Date.now(),
            amount: legacyPaid,
            categoriesStr: catStr,
            receiptUrl: undefined,
          });
        }
      } else if (entry.paymentStatus === 'Recusado') {
        totalRefusedSum += entryDue;
        if (showEntry) {
          refusedEntriesList.push({
            entry,
            payment: { id: `rec-${entry.pin}`, date: entry.joinedAt || Date.now(), amount: entryDue, status: 'Recusado' },
            paymentIndex: 0,
            dueAmount: entryDue,
            categoriesStr: catStr,
          });
        }
      } else if (entry.paymentStatus === 'A devolver') {
        const refundAmt = entry.paidAmount ?? entryDue;
        totalToRefundSum += refundAmt;
        if (showEntry) {
          toRefundEntriesList.push({
            entry,
            payment: { id: `dev-${entry.pin}`, date: entry.joinedAt || Date.now(), amount: refundAmt, status: 'A devolver' },
            paymentIndex: 0,
            refundAmount: refundAmt,
            categoriesStr: catStr,
          });
        }
      } else if (entry.paymentStatus === 'Devolvido') {
        const refundedAmt = entry.paidAmount ?? entryDue;
        totalRefundedSum += refundedAmt;
        if (showEntry) {
          refundedEntriesList.push({
            entry,
            payment: { id: `ref-${entry.pin}`, date: entry.joinedAt || Date.now(), amount: refundedAmt, status: 'Devolvido' },
            paymentIndex: 0,
            refundedAmount: refundedAmt,
            categoriesStr: catStr,
          });
        }
      }
    }

    // Pré-inscrição: ativa, sem análise pendente e com saldo em aberto
    const hasAwaitingReview = payments.some((p) => getPaymentReviewStatus(p) === 'Aguardando Confirmação');
    const remainingDue = Math.max(0, entryDue - entryPaid);
    const hasReceipt = payments.some((p) => Boolean(p.receiptUrl));

    if (!isCancelled && !isExempt && !hasAwaitingReview && remainingDue > 0 && (!hasReceipt || entryPaid === 0)) {
      totalPreSum += remainingDue;
      if (showEntry) {
        preRegistrationEntries.push(entry);
      }
    }
  });

  // Agrupamento por participante dos pagamentos confirmados
  const paidRegistrationsList = Array.from(
    paidPaymentsList.reduce((byPin, payment) => {
      const current = byPin.get(payment.entryPin);
      if (current) {
        current.amount += payment.amount;
        if (payment.date >= current.date) {
          current.date = payment.date;
          current.receiptUrl = payment.receiptUrl;
          current.receiptFileName = payment.receiptFileName;
          if (payment.registrationId) current.registrationId = payment.registrationId;
          if (payment.dueAmount) current.dueAmount = payment.dueAmount;
        }
      } else {
        byPin.set(payment.entryPin, { ...payment });
      }
      return byPin;
    }, new Map<string, FlattenedPayment>()).values()
  );

  const awaitingRegistrationCount = new Set(awaitingEntriesList.map((item) => item.entry.pin)).size;
  const refusedRegistrationCount = new Set(refusedEntriesList.map((item) => item.entry.pin)).size;
  const toRefundRegistrationCount = new Set(toRefundEntriesList.map((item) => item.entry.pin)).size;
  const refundedRegistrationCount = new Set(refundedEntriesList.map((item) => item.entry.pin)).size;

  // a) Ao selecionar algum filtro abra o bloco correspondente
  const handleSelectFilter = (group: typeof paymentGroup) => {
    if (paymentGroup === group) {
      setPaymentGroup('all');
      return;
    }
    setPaymentGroup(group);
    if (group === 'awaiting') setIsAwaitingExpanded(true);
    else if (group === 'pre') setIsPreRegistrationExpanded(true);
    else if (group === 'to_refund') setIsToRefundExpanded(true);
    else if (group === 'refused') setIsRefusedExpanded(true);
    else if (group === 'confirmed') setIsPaidExpanded(true);
    else if (group === 'exempt') setIsExemptExpanded(true);
    else if (group === 'refunded') setIsRefundedExpanded(true);
  };

  const handleOpenReceipt = (pay: FlattenedPayment) => {
    if (!pay.receiptUrl) {
      alert(`Nenhum comprovante anexado para ${pay.participantName}.`);
      return;
    }
    if (pay.receiptUrl.startsWith('data:')) {
      openReceiptInNewTab(pay.receiptUrl);
    } else {
      window.open(pay.receiptUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const confirmPaymentStatusChange = () => {
    if (!pendingStatusChange) return;
    onUpdateEvent({
      ...event,
      entries: entries.map((entry) => {
        if (entry.pin !== pendingStatusChange.pin) return entry;
        const payments = [...(entry.payments || [])];
        const receiptIndex = pendingStatusChange.paymentId
          ? payments.findIndex((p) => p.id === pendingStatusChange.paymentId)
          : pendingStatusChange.paymentIndex;

        if (receiptIndex !== undefined && receiptIndex >= 0 && payments[receiptIndex]) {
          payments[receiptIndex] = { ...payments[receiptIndex], status: pendingStatusChange.status };
        } else if (payments.length === 0) {
          payments.push({
            id: `pay-${Date.now()}`,
            date: Date.now(),
            amount: entry.dueAmount ?? event.registrationFee ?? 0,
            status: pendingStatusChange.status,
          });
        }

        const dueAmount = entry.dueAmount ?? event.registrationFee ?? 0;
        const paidAmount = payments.reduce(
          (sum, p) => (p.status === 'Confirmado' || p.status === 'approved' || p.status === 'Pago' ? sum + (p.amount || 0) : sum),
          0
        );

        let newPaymentStatus: PaymentStatus = entry.paymentStatus || 'Pendente';
        let disabled = entry.disabled;
        let disabledReason = entry.disabledReason;

        if (pendingStatusChange.status === 'Isento') {
          newPaymentStatus = 'Isento';
        } else if (pendingStatusChange.status === 'A devolver') {
          if (pendingStatusChange.isTotalRefund ?? true) {
            newPaymentStatus = 'Cancelado';
            disabled = true;
            disabledReason = 'Cancelada - A devolver';
          } else {
            newPaymentStatus = paidAmount >= dueAmount && dueAmount > 0 ? 'Confirmado' : 'Pendente';
          }
        } else if (pendingStatusChange.status === 'Devolvido') {
          if (disabled || entry.paymentStatus === 'Cancelado') {
            newPaymentStatus = 'Cancelado';
          } else {
            newPaymentStatus = paidAmount >= dueAmount && dueAmount > 0 ? 'Confirmado' : 'Pendente';
          }
        } else if (pendingStatusChange.status === 'Confirmado') {
          if (entry.paymentStatus === 'Cancelado') {
            disabled = false;
            disabledReason = '';
          }
          newPaymentStatus = paidAmount >= dueAmount && dueAmount > 0 ? 'Confirmado' : 'Pendente';
        } else if (pendingStatusChange.status === 'Recusado') {
          const hasConfirmed = payments.some((p) => p.status === 'Confirmado' || p.status === 'approved' || p.status === 'Pago');
          newPaymentStatus = hasConfirmed ? 'Pendente' : 'Recusado';
        } else if (pendingStatusChange.status === 'Aguardando Confirmação') {
          newPaymentStatus = 'Aguardando Confirmação';
        }

        return { ...entry, payments, paidAmount, paymentStatus: newPaymentStatus, disabled, disabledReason };
      }),
    });
    setPendingStatusChange(null);
  };

  const confirmReceiptDeletion = () => {
    if (!pendingReceiptDeletion) return;
    onUpdateEvent({
      ...event,
      entries: entries.map((entry) => {
        if (entry.pin !== pendingReceiptDeletion.pin) return entry;
        const payments = (entry.payments || []).filter((payment, index) =>
          pendingReceiptDeletion.paymentId
            ? payment.id !== pendingReceiptDeletion.paymentId
            : index !== pendingReceiptDeletion.paymentIndex
        );
        const paidAmount = payments.reduce(
          (sum, p) => (p.status === 'Confirmado' || p.status === 'approved' || p.status === 'Pago' ? sum + (p.amount || 0) : sum),
          0
        );
        const receiptPayments = payments.filter((payment) => Boolean(payment.receiptUrl));
        const hasAwaitingReview = receiptPayments.some((p) => ['pending', 'Aguardando Confirmação'].includes(String(p.status)));
        const hasRejected = receiptPayments.some((p) => ['rejected', 'Recusado', 'cancelled', 'Cancelado'].includes(String(p.status)));
        const dueAmount = entry.dueAmount ?? event.registrationFee ?? 0;
        const paymentStatus = hasAwaitingReview
          ? 'Aguardando Confirmação'
          : hasRejected
          ? 'Recusado'
          : paidAmount >= dueAmount && dueAmount > 0
          ? 'Confirmado'
          : 'Pendente';
        return { ...entry, payments, paidAmount, paymentStatus };
      }),
    });
    setPendingReceiptDeletion(null);
  };

  // b & c) Ordem dos filtros e respectivas cores
  const filterButtons = [
    {
      id: 'all' as const,
      label: 'Todos',
      count: entries.length,
      activeClasses: 'border-slate-800 bg-slate-800 text-white shadow-xs',
      inactiveClasses: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      badgeActive: 'bg-white/20 text-white',
      badgeInactive: 'bg-slate-100 text-slate-700',
    },
    {
      id: 'awaiting' as const,
      label: 'A confirmar',
      count: awaitingEntriesList.length,
      activeClasses: 'border-amber-500 bg-amber-500 text-white shadow-xs',
      inactiveClasses: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-amber-200/80 text-amber-900',
    },
    {
      id: 'pre' as const,
      label: 'Aguardando pgto',
      count: preRegistrationEntries.length,
      activeClasses: 'border-sky-500 bg-sky-500 text-white shadow-xs',
      inactiveClasses: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-sky-200/80 text-sky-900',
    },
    {
      id: 'to_refund' as const,
      label: 'A devolver',
      count: toRefundEntriesList.length,
      activeClasses: 'border-purple-600 bg-purple-600 text-white shadow-xs',
      inactiveClasses: 'border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-purple-200/80 text-purple-900',
    },
    {
      id: 'refused' as const,
      label: 'Recusados',
      count: refusedEntriesList.length,
      activeClasses: 'border-rose-500 bg-rose-500 text-white shadow-xs',
      inactiveClasses: 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-rose-200/80 text-rose-900',
    },
    {
      id: 'confirmed' as const,
      label: 'Pagos',
      count: paidRegistrationsList.length,
      activeClasses: 'border-emerald-500 bg-emerald-500 text-white shadow-xs',
      inactiveClasses: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-emerald-200/80 text-emerald-900',
    },
    {
      id: 'exempt' as const,
      label: 'Isentos',
      count: exemptEntriesList.length,
      activeClasses: 'border-slate-600 bg-slate-600 text-white shadow-xs',
      inactiveClasses: 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-slate-200 text-slate-800',
    },
    {
      id: 'refunded' as const,
      label: 'Devolvidos',
      count: refundedEntriesList.length,
      activeClasses: 'border-zinc-600 bg-zinc-600 text-white shadow-xs',
      inactiveClasses: 'border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80',
      badgeActive: 'bg-white/25 text-white',
      badgeInactive: 'bg-zinc-200 text-zinc-800',
    },
  ];

  return (
    <div className="space-y-4 animate-in fade-in">
      {/* Barra de Pesquisa e Filtros */}
      <div className="space-y-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Pesquisar por nome ou ID da inscrição..."
            className="w-full h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
          />
          {searchName && (
            <button
              type="button"
              onClick={() => setSearchName('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              title="Limpar pesquisa"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* b & c) Pílulas de Filtros na ordem solicitada com suas respectivas cores */}
        <div className="flex flex-wrap gap-1.5">
          {filterButtons.map((btn) => {
            const isSelected = paymentGroup === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => handleSelectFilter(btn.id)}
                aria-pressed={isSelected}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-black transition-all cursor-pointer ${
                  isSelected ? btn.activeClasses : btn.inactiveClasses
                }`}
              >
                <span>{btn.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-black ${isSelected ? btn.badgeActive : btn.badgeInactive}`}>
                  {btn.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal de confirmação de alteração de status */}
      {pendingStatusChange && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => setPendingStatusChange(null)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-black text-slate-800">Confirmar alteração de status</h3>
              <p className="mt-2 text-sm text-slate-600">
                Deseja alterar o status do comprovante de <strong>{pendingStatusChange.name}</strong> para{' '}
                <strong className="text-slate-900">
                  {pendingStatusChange.status === 'Confirmado'
                    ? 'Pagamento confirmado'
                    : pendingStatusChange.status === 'Recusado'
                    ? 'Pagamento recusado'
                    : pendingStatusChange.status === 'A devolver'
                    ? 'A devolver'
                    : pendingStatusChange.status === 'Devolvido'
                    ? 'Devolvido'
                    : pendingStatusChange.status === 'Isento'
                    ? 'Isento'
                    : 'A confirmar'}
                </strong>?
              </p>

              {/* Opção adicional para 'A devolver' (devolução total x parcial) */}
              {pendingStatusChange.status === 'A devolver' && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-2xl space-y-2">
                  <p className="text-[11px] font-black text-purple-900">Tipo de devolução:</p>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pendingStatusChange.isTotalRefund ?? true}
                      onChange={(e) =>
                        setPendingStatusChange((prev) => (prev ? { ...prev, isTotalRefund: e.target.checked } : null))
                      }
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    Devolução total (100%) - Cancela a inscrição
                  </label>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Desmarque caso seja devolução parcial (ex: cancelou apenas 1 de 2 categorias), mantendo a inscrição ativa.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingStatusChange(null)}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPaymentStatusChange}
                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-600 shadow-sm"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de exclusão de comprovante */}
      {pendingReceiptDeletion && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={() => setPendingReceiptDeletion(null)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-black text-slate-800">Excluir comprovante?</h3>
              <p className="mt-2 text-sm text-slate-600">
                O comprovante de <strong>{pendingReceiptDeletion.name}</strong>, no valor de{' '}
                <strong>R$ {pendingReceiptDeletion.amount.toFixed(2)}</strong> ({formatDateShort(pendingReceiptDeletion.date)}), será
                removido do histórico da inscrição.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingReceiptDeletion(null)}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmReceiptDeletion}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-700 shadow-sm"
              >
                Excluir comprovante
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de visualização de comprovante */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setSelectedReceipt(null)}
        >
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-800 text-sm">{selectedReceipt.title}</h3>
              <button onClick={() => setSelectedReceipt(null)} className="text-slate-400 hover:text-slate-600 text-xs font-black p-1">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-50 rounded-2xl">
              <img src={selectedReceipt.url} alt={selectedReceipt.title} className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <a
                href={selectedReceipt.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (selectedReceipt.url.startsWith('data:')) {
                    e.preventDefault();
                    openReceiptInNewTab(selectedReceipt.url);
                  }
                }}
                className="bg-sky-500 hover:bg-sky-600 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all"
              >
                Abrir em nova aba
              </a>
              <button onClick={() => setSelectedReceipt(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-all">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
        ========================================================================
        b) ORDEM DOS BLOCOS:
        1. A confirmar
        2. Aguardando pagamento
        3. A devolver
        4. Recusados
        5. Pagos
        6. Isentos
        7. Devolvidos
        ========================================================================
      */}

      {/* 1. Bloco: A confirmar (comprovante) */}
      {(paymentGroup === 'all' || paymentGroup === 'awaiting') && (
        <div className="border-2 border-amber-300/80 hover:border-amber-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsAwaitingExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800 tracking-tight">
                A confirmar (comprovante): R$ {totalAwaitingSum.toFixed(2)} · {awaitingEntriesList.length} comprovantes ·{' '}
                {awaitingRegistrationCount} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isAwaitingExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isAwaitingExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in space-y-3">
              {awaitingEntriesList.length === 0 ? (
                <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 font-black py-4">
                  <CheckCircle2 size={16} />
                  Nenhum comprovante aguardando confirmação.
                </div>
              ) : (
                awaitingEntriesList.map((item) => (
                  <article
                    key={`${item.entry.pin}-${item.payment.id || item.paymentIndex}`}
                    className="rounded-2xl border border-amber-200 bg-amber-50/30 p-3 space-y-2"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-800">{item.entry.name || item.entry.nickname}</p>
                        <p className="text-[10px] font-bold text-amber-600">
                          Inscrição: {formatRegistrationId(item.entry.registrationId) || '—'} · {formatDateShort(item.payment.date)}
                        </p>
                      </div>
                      <p className="text-right text-xs font-black text-amber-600">
                        R$ {item.pendingAmount.toFixed(2)}
                        <span className="block text-[9px] text-slate-400">comprovante</span>
                      </p>
                    </div>

                    <div className="flex justify-between border-t border-amber-100 pt-2 text-[10px] text-slate-500">
                      <span>Devido R$ {item.dueAmount.toFixed(2)}</span>
                      <span>{item.categoriesStr}</span>
                    </div>

                    {/* Botões de ação e Dropdown conforme Imagem 1 */}
                    <div className="flex flex-nowrap items-center gap-2 border-t border-amber-100 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          item.payment.receiptUrl &&
                          handleOpenReceipt({
                            paymentId: item.payment.id || `payment-${item.paymentIndex}`,
                            entryPin: item.entry.pin,
                            participantName: item.entry.name || item.entry.nickname,
                            registrationId: item.entry.registrationId,
                            dueAmount: item.dueAmount,
                            date: item.payment.date,
                            amount: item.payment.amount || 0,
                            categoriesStr: item.categoriesStr,
                            receiptUrl: item.payment.receiptUrl,
                            receiptFileName: item.payment.receiptFileName,
                          })
                        }
                        className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                      >
                        <Eye size={14} className="mr-1 inline" /> Ver
                      </button>

                      <button
                        type="button"
                        aria-label="Excluir comprovante"
                        title="Excluir comprovante"
                        onClick={() =>
                          setPendingReceiptDeletion({
                            pin: item.entry.pin,
                            paymentId: item.payment.id,
                            paymentIndex: item.paymentIndex,
                            name: item.entry.name || item.entry.nickname,
                            amount: item.payment.amount || 0,
                            date: item.payment.date,
                          })
                        }
                        className="shrink-0 rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>

                      <select
                        aria-label={`Status do comprovante de ${item.entry.name || item.entry.nickname}`}
                        value={getPaymentReviewStatus(item.payment)}
                        onChange={(e) =>
                          setPendingStatusChange({
                            pin: item.entry.pin,
                            paymentId: item.payment.id,
                            paymentIndex: item.paymentIndex,
                            name: item.entry.name || item.entry.nickname,
                            status: e.target.value as PaymentReviewStatus,
                          })
                        }
                        className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-emerald-100 px-2 py-2 text-[10px] font-bold text-emerald-900 focus:outline-none cursor-pointer"
                      >
                        <option value="Aguardando Confirmação">A confirmar</option>
                        <option value="Confirmado">Pagamento confirmado</option>
                        <option value="Recusado">Pagamento recusado</option>
                        <option value="A devolver">A devolver</option>
                        <option value="Devolvido">Devolvido</option>
                        <option value="Isento">Isento</option>
                      </select>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Bloco: Aguardando Pagamento (pré-inscritos) */}
      {(paymentGroup === 'all' || paymentGroup === 'pre') && (
        <div className="border-2 border-sky-300/80 hover:border-sky-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsPreRegistrationExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800 tracking-tight">
                Aguardando pagamento (pré-inscritos): R$ {totalPreSum.toFixed(2)} · {preRegistrationEntries.length} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isPreRegistrationExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isPreRegistrationExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-3 animate-in fade-in">
              {preRegistrationEntries.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhuma pré-inscrição sem comprovante.</p>
              ) : (
                preRegistrationEntries.map((entry) => {
                  const dueAmount = entry.dueAmount ?? (event.registrationFee || 0);
                  return (
                    <article key={entry.pin} className="rounded-2xl border border-sky-200 bg-sky-50/20 p-3 space-y-2">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-800">{entry.name || entry.nickname}</p>
                          <p className="text-[10px] font-bold text-sky-700">
                            Inscrição: {formatRegistrationId(entry.registrationId) || '—'} · {formatDateShort(entry.joinedAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-sky-700">R$ {dueAmount.toFixed(2)}</p>
                          <span className="block text-[9px] text-slate-400">pendente</span>
                        </div>
                      </div>
                      <div className="flex justify-between border-t border-sky-100 pt-2 text-[10px] text-slate-500">
                        <span>Devido R$ {dueAmount.toFixed(2)}</span>
                        <span>{getCategoriesText(entry)}</span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Bloco: A devolver */}
      {(paymentGroup === 'all' || paymentGroup === 'to_refund') && (
        <div className="border-2 border-purple-300/80 hover:border-purple-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsToRefundExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <RotateCcw size={18} className="text-purple-600" />
              <span className="text-sm font-black text-slate-800 tracking-tight">
                A devolver: R$ {totalToRefundSum.toFixed(2)} · {toRefundEntriesList.length} comprovantes ·{' '}
                {toRefundRegistrationCount} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isToRefundExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isToRefundExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in space-y-3">
              {toRefundEntriesList.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhum valor pendente de devolução.</p>
              ) : (
                toRefundEntriesList.map((item) => (
                  <article
                    key={`${item.entry.pin}-${item.payment.id || item.paymentIndex}`}
                    className="rounded-2xl border border-purple-200 bg-purple-50/40 p-3 space-y-2.5"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-black text-slate-800">{item.entry.name || item.entry.nickname}</p>
                          {item.entry.disabled || item.entry.paymentStatus === 'Cancelado' ? (
                            <span className="text-[9px] font-black bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-md">Cancelada</span>
                          ) : (
                            <span className="text-[9px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md">Devolução Parcial</span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-purple-700">
                          Inscrição: {formatRegistrationId(item.entry.registrationId) || '—'} · {formatDateShort(item.payment.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-purple-700">R$ {item.refundAmount.toFixed(2)}</p>
                        <span className="block text-[9px] text-slate-400">a devolver</span>
                      </div>
                    </div>

                    <div className="flex justify-between border-t border-purple-100 pt-2 text-[10px] text-slate-500">
                      <span>Devido R$ {(item.entry.dueAmount ?? event.registrationFee ?? 0).toFixed(2)}</span>
                      <span>{item.categoriesStr}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-purple-100 pt-2">
                      <div className="flex items-center gap-2">
                        {item.payment.receiptUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenReceipt({
                                paymentId: item.payment.id || `payment-${item.paymentIndex}`,
                                entryPin: item.entry.pin,
                                participantName: item.entry.name || item.entry.nickname,
                                registrationId: item.entry.registrationId,
                                dueAmount: item.entry.dueAmount ?? event.registrationFee ?? 0,
                                date: item.payment.date,
                                amount: item.refundAmount,
                                categoriesStr: item.categoriesStr,
                                receiptUrl: item.payment.receiptUrl,
                                receiptFileName: item.payment.receiptFileName,
                              })
                            }
                            className="shrink-0 rounded-xl bg-sky-50 px-2.5 py-1.5 text-xs font-black text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                          >
                            <Eye size={14} className="mr-1 inline" /> Ver
                          </button>
                        )}
                        <select
                          aria-label={`Alterar status de devolução de ${item.entry.name || item.entry.nickname}`}
                          value={getPaymentReviewStatus(item.payment)}
                          onChange={(e) =>
                            setPendingStatusChange({
                              pin: item.entry.pin,
                              paymentId: item.payment.id,
                              paymentIndex: item.paymentIndex,
                              name: item.entry.name || item.entry.nickname,
                              status: e.target.value as PaymentReviewStatus,
                            })
                          }
                          className="rounded-xl border border-purple-300 bg-purple-100 px-2 py-1.5 text-[10px] font-bold text-purple-900 focus:outline-none cursor-pointer"
                        >
                          <option value="A devolver">A devolver</option>
                          <option value="Devolvido">Devolvido</option>
                          <option value="Confirmado">Pagamento confirmado</option>
                          <option value="Recusado">Pagamento recusado</option>
                          <option value="Aguardando Confirmação">A confirmar</option>
                          <option value="Isento">Isento</option>
                        </select>
                      </div>

                      {/* Botão de Ação Rápida: Marcar como Devolvido */}
                      <button
                        type="button"
                        onClick={() =>
                          setPendingStatusChange({
                            pin: item.entry.pin,
                            paymentId: item.payment.id,
                            paymentIndex: item.paymentIndex,
                            name: item.entry.name || item.entry.nickname,
                            status: 'Devolvido',
                          })
                        }
                        className="rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-xs px-3 py-1.5 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={13} /> Marcar como Devolvido
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Bloco: Pagamento recusado */}
      {(paymentGroup === 'all' || paymentGroup === 'refused') && (
        <div className="border-2 border-rose-300/80 hover:border-rose-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsRefusedExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-500" />
              <span className="text-sm font-black text-slate-800 tracking-tight">
                Pagamento recusado: R$ {totalRefusedSum.toFixed(2)} · {refusedEntriesList.length} comprovantes ·{' '}
                {refusedRegistrationCount} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isRefusedExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isRefusedExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in space-y-3">
              {refusedEntriesList.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhum comprovante recusado.</p>
              ) : (
                refusedEntriesList.map((item) => (
                  <article
                    key={`${item.entry.pin}-${item.payment.id || item.paymentIndex}`}
                    className="rounded-2xl border border-rose-200 bg-rose-50/30 p-3 space-y-2"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-800">{item.entry.name || item.entry.nickname}</p>
                        <p className="text-[10px] font-bold text-rose-600">
                          Inscrição: {formatRegistrationId(item.entry.registrationId) || '—'} · {formatDateShort(item.payment.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-rose-600">R$ {(item.payment.amount || 0).toFixed(2)}</p>
                        <span className="block text-[9px] text-slate-400">recusado</span>
                      </div>
                    </div>

                    <div className="flex justify-between border-t border-rose-100 pt-2 text-[10px] text-slate-500">
                      <span>Devido R$ {item.dueAmount.toFixed(2)}</span>
                      <span>{item.categoriesStr}</span>
                    </div>

                    <div className="flex flex-nowrap items-center gap-2 border-t border-rose-100 pt-2">
                      {item.payment.receiptUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenReceipt({
                              paymentId: item.payment.id || `payment-${item.paymentIndex}`,
                              entryPin: item.entry.pin,
                              participantName: item.entry.name || item.entry.nickname,
                              registrationId: item.entry.registrationId,
                              dueAmount: item.dueAmount,
                              date: item.payment.date,
                              amount: item.payment.amount || 0,
                              categoriesStr: item.categoriesStr,
                              receiptUrl: item.payment.receiptUrl,
                              receiptFileName: item.payment.receiptFileName,
                            })
                          }
                          className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                        >
                          <Eye size={14} className="mr-1 inline" /> Ver
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label="Excluir comprovante"
                        title="Excluir comprovante"
                        onClick={() =>
                          setPendingReceiptDeletion({
                            pin: item.entry.pin,
                            paymentId: item.payment.id,
                            paymentIndex: item.paymentIndex,
                            name: item.entry.name || item.entry.nickname,
                            amount: item.payment.amount || 0,
                            date: item.payment.date,
                          })
                        }
                        className="shrink-0 rounded-xl bg-rose-50 p-2 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 size={16} />
                      </button>

                      <select
                        aria-label={`Status do comprovante de ${item.entry.name || item.entry.nickname}`}
                        value={getPaymentReviewStatus(item.payment)}
                        onChange={(e) =>
                          setPendingStatusChange({
                            pin: item.entry.pin,
                            paymentId: item.payment.id,
                            paymentIndex: item.paymentIndex,
                            name: item.entry.name || item.entry.nickname,
                            status: e.target.value as PaymentReviewStatus,
                          })
                        }
                        className="min-w-0 flex-1 rounded-xl border border-rose-300 bg-rose-100 px-2 py-2 text-[10px] font-bold text-rose-900 focus:outline-none cursor-pointer"
                      >
                        <option value="Recusado">Pagamento recusado</option>
                        <option value="Aguardando Confirmação">A confirmar</option>
                        <option value="Confirmado">Pagamento confirmado</option>
                        <option value="A devolver">A devolver</option>
                        <option value="Devolvido">Devolvido</option>
                        <option value="Isento">Isento</option>
                      </select>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. Bloco: Pagos (confirmados) */}
      {(paymentGroup === 'all' || paymentGroup === 'confirmed') && (
        <div className="border-2 border-emerald-300/80 hover:border-emerald-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsPaidExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800 tracking-tight">
                Pagos (confirmados): R$ {totalPaidSum.toFixed(2)} · {paidRegistrationsList.length} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isPaidExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isPaidExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in space-y-3">
              {paidRegistrationsList.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhum pagamento confirmado registrado.</p>
              ) : (
                paidRegistrationsList.map((pay, idx) => (
                  <article
                    key={`${pay.entryPin}-${idx}`}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/20 p-3 space-y-2"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-800">{pay.participantName}</p>
                        <p className="text-[10px] font-bold text-emerald-700">
                          Inscrição: {formatRegistrationId(pay.registrationId) || '—'} · {formatDateShort(pay.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-emerald-700">R$ {pay.amount.toFixed(2)}</p>
                        <span className="block text-[9px] text-slate-400">pago</span>
                      </div>
                    </div>

                    <div className="flex justify-between border-t border-emerald-100 pt-2 text-[10px] text-slate-500">
                      <span>Devido R$ {(pay.dueAmount ?? 0).toFixed(2)}</span>
                      <span>{pay.categoriesStr}</span>
                    </div>

                    <div className="flex flex-nowrap items-center gap-2 border-t border-emerald-100 pt-2">
                      {pay.receiptUrl && (
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(pay)}
                          className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                        >
                          <Eye size={14} className="mr-1 inline" /> Ver
                        </button>
                      )}

                      <select
                        aria-label={`Status do pagamento de ${pay.participantName}`}
                        value="Confirmado"
                        onChange={(e) =>
                          setPendingStatusChange({
                            pin: pay.entryPin,
                            paymentId: pay.paymentId,
                            name: pay.participantName,
                            status: e.target.value as PaymentReviewStatus,
                          })
                        }
                        className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-emerald-100 px-2 py-2 text-[10px] font-bold text-emerald-900 focus:outline-none cursor-pointer"
                      >
                        <option value="Confirmado">Pagamento confirmado</option>
                        <option value="A devolver">A devolver</option>
                        <option value="Devolvido">Devolvido</option>
                        <option value="Aguardando Confirmação">A confirmar</option>
                        <option value="Recusado">Pagamento recusado</option>
                        <option value="Isento">Isento</option>
                      </select>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. Bloco: Isentos (cortesia / staff / convidados) */}
      {(paymentGroup === 'all' || paymentGroup === 'exempt') && (
        <div className="border-2 border-slate-300 hover:border-slate-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsExemptExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-500" />
              <span className="text-sm font-black text-slate-800 tracking-tight">
                Isentos (cortesia / staff): {exemptEntriesList.length} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isExemptExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isExemptExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in space-y-3">
              {exemptEntriesList.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhuma inscrição isenta cadastrada.</p>
              ) : (
                exemptEntriesList.map((entry) => {
                  const receiptPayment = entry.payments?.find((p) => p.receiptUrl);
                  return (
                    <article key={entry.pin} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                      <div className="flex justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-black text-slate-800">{entry.name || entry.nickname}</p>
                            <span className="text-[9px] font-black bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md">Isento</span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500">
                            Inscrição: {formatRegistrationId(entry.registrationId) || '—'} · {formatDateShort(receiptPayment?.date || entry.joinedAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-600">R$ 0.00</p>
                          <span className="block text-[9px] text-slate-400">isento</span>
                        </div>
                      </div>

                      <div className="flex justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                        <span>Devido R$ 0.00</span>
                        <span>{getCategoriesText(entry)}</span>
                      </div>

                      <div className="flex flex-nowrap items-center gap-2 border-t border-slate-200 pt-2">
                        {receiptPayment?.receiptUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenReceipt({
                                paymentId: receiptPayment.id || 'exempt',
                                entryPin: entry.pin,
                                participantName: entry.name || entry.nickname,
                                registrationId: entry.registrationId,
                                dueAmount: 0,
                                date: receiptPayment.date,
                                amount: 0,
                                categoriesStr: getCategoriesText(entry),
                                receiptUrl: receiptPayment.receiptUrl,
                              })
                            }
                            className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                          >
                            <Eye size={14} className="mr-1 inline" /> Ver
                          </button>
                        )}

                        <select
                          aria-label={`Status de ${entry.name || entry.nickname}`}
                          value="Isento"
                          onChange={(e) =>
                            setPendingStatusChange({
                              pin: entry.pin,
                              paymentId: receiptPayment?.id,
                              name: entry.name || entry.nickname,
                              status: e.target.value as PaymentReviewStatus,
                            })
                          }
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-100 px-2 py-2 text-[10px] font-bold text-slate-800 focus:outline-none cursor-pointer"
                        >
                          <option value="Isento">Isento</option>
                          <option value="Confirmado">Pagamento confirmado</option>
                          <option value="Aguardando Confirmação">A confirmar</option>
                          <option value="Recusado">Pagamento recusado</option>
                          <option value="A devolver">A devolver</option>
                          <option value="Devolvido">Devolvido</option>
                        </select>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* 7. Bloco: Devolvidos (histórico de estornos) */}
      {(paymentGroup === 'all' || paymentGroup === 'refunded') && (
        <div className="border-2 border-zinc-200 hover:border-zinc-300 bg-white rounded-3xl p-4 shadow-sm transition-all">
          <button
            type="button"
            onClick={() => setIsRefundedExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left select-none group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-700 tracking-tight">
                Devolvidos: R$ {totalRefundedSum.toFixed(2)} · {refundedEntriesList.length} comprovantes ·{' '}
                {refundedRegistrationCount} inscrições
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
              {isRefundedExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {isRefundedExpanded && (
            <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in space-y-3">
              {refundedEntriesList.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhum valor devolvido registrado.</p>
              ) : (
                refundedEntriesList.map((item) => (
                  <article
                    key={`${item.entry.pin}-${item.payment.id || item.paymentIndex}`}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3 space-y-2"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-black text-slate-800">{item.entry.name || item.entry.nickname}</p>
                          <span className="text-[9px] font-black bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded-md">Devolvido</span>
                        </div>
                        <p className="text-[10px] font-bold text-zinc-600">
                          Inscrição: {formatRegistrationId(item.entry.registrationId) || '—'} · {formatDateShort(item.payment.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-zinc-700">R$ {item.refundedAmount.toFixed(2)}</p>
                        <span className="block text-[9px] text-slate-400">devolvido</span>
                      </div>
                    </div>

                    <div className="flex justify-between border-t border-zinc-200 pt-2 text-[10px] text-slate-500">
                      <span>Devido R$ {(item.entry.dueAmount ?? event.registrationFee ?? 0).toFixed(2)}</span>
                      <span>{item.categoriesStr}</span>
                    </div>

                    {item.payment.receiptUrl && (
                      <div className="flex justify-end border-t border-zinc-200 pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenReceipt({
                              paymentId: item.payment.id || `payment-${item.paymentIndex}`,
                              entryPin: item.entry.pin,
                              participantName: item.entry.name || item.entry.nickname,
                              registrationId: item.entry.registrationId,
                              dueAmount: item.entry.dueAmount ?? event.registrationFee ?? 0,
                              date: item.payment.date,
                              amount: item.refundedAmount,
                              categoriesStr: item.categoriesStr,
                              receiptUrl: item.payment.receiptUrl,
                            })
                          }
                          className="shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                        >
                          <Eye size={14} className="mr-1 inline" /> Ver
                        </button>
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
