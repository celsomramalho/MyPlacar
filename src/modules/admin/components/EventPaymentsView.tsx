import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, CheckCircle2, Search, X } from 'lucide-react';
import { formatRegistrationId, type TournamentEvent, type TournamentEntry } from '@modules/events/types';

interface Props {
  event: TournamentEvent;
  onUpdateEvent: (event: TournamentEvent) => void;
}

interface FlattenedPayment {
  paymentId: string;
  entryPin: string;
  participantName: string;
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
  const [paymentGroup, setPaymentGroup] = useState<'all' | 'confirmed' | 'awaiting' | 'pre' | 'inactive'>('all');
  const [isPaidExpanded, setIsPaidExpanded] = useState(true);
  const [isPendingExpanded, setIsPendingExpanded] = useState(true);
  const [isPreRegistrationExpanded, setIsPreRegistrationExpanded] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    pin: string;
    name: string;
    status: 'Confirmado' | 'Aguardando Confirmação' | 'Recusado';
  } | null>(null);

  const categories = event.categories || [];
  const entries = event.entries || [];
  const hasReceipt = (entry: TournamentEntry) => Boolean(entry.payments?.some((payment) => payment.receiptUrl));
  const isConfirmedEntry = (entry: TournamentEntry) => {
    const payments = entry.payments || [];
    const hasExplicitStatuses = payments.some((payment) => Boolean(payment.status));
    if (hasExplicitStatuses) return payments.some((payment) => payment.status === 'Confirmado' || payment.status === 'approved' || payment.status === 'Pago');
    return entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago';
  };
  const hasPendingReviewReceipt = (entry: TournamentEntry) => {
    const receiptPayments = (entry.payments || []).filter((payment) => payment.receiptUrl);
    if (receiptPayments.some((payment) => ['pending', 'Aguardando Confirmação', 'rejected', 'Recusado', 'cancelled', 'Cancelado'].includes(String(payment.status)))) return true;
    return receiptPayments.length > 0 && (entry.paymentStatus === 'Aguardando Confirmação' || entry.paymentStatus === 'Recusado');
  };
  const getReceiptStatus = (entry: TournamentEntry): 'Confirmado' | 'Aguardando Confirmação' | 'Recusado' => {
    const latestReceipt = (entry.payments || []).filter((payment) => payment.receiptUrl).at(-1);
    if (latestReceipt?.status === 'Confirmado' || latestReceipt?.status === 'approved' || latestReceipt?.status === 'Pago') return 'Confirmado';
    if (latestReceipt?.status === 'Recusado' || latestReceipt?.status === 'rejected' || latestReceipt?.status === 'Cancelado' || latestReceipt?.status === 'cancelled') return 'Recusado';
    if (latestReceipt?.status === 'pending' || latestReceipt?.status === 'Aguardando Confirmação') return 'Aguardando Confirmação';
    return entry.paymentStatus === 'Recusado' ? 'Recusado' : entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago' ? 'Confirmado' : 'Aguardando Confirmação';
  };
  const matchesSearch = (entry: TournamentEntry) => {
    const term = searchName.trim().toLocaleLowerCase();
    if (!term) return true;
    const normalizedId = formatRegistrationId(entry.registrationId).toLocaleLowerCase();
    return [entry.name, entry.nickname, entry.pin, entry.email, normalizedId, String(entry.registrationId ?? '')]
      .some((value) => String(value || '').toLocaleLowerCase().includes(term));
  };
  const isInSelectedGroup = (entry: TournamentEntry) => {
    if (paymentGroup === 'all') return true;
    if (paymentGroup === 'inactive') return Boolean(entry.disabled || entry.paymentStatus === 'Cancelado');
    if (entry.disabled || entry.paymentStatus === 'Cancelado') return false;
    if (paymentGroup === 'confirmed') return isConfirmedEntry(entry);
    if (paymentGroup === 'awaiting') return hasPendingReviewReceipt(entry) || (hasReceipt(entry) && !isConfirmedEntry(entry));
    return !hasReceipt(entry) && !isConfirmedEntry(entry);
  };
  const visibleEntries = new Set(entries.filter((entry) => matchesSearch(entry) && isInSelectedGroup(entry)).map((entry) => entry.pin));
  const paymentGroupCounts = {
    confirmed: entries.filter((entry) => !entry.disabled && entry.paymentStatus !== 'Cancelado' && isConfirmedEntry(entry)).length,
    awaiting: entries.filter((entry) => !entry.disabled && entry.paymentStatus !== 'Cancelado' && (hasPendingReviewReceipt(entry) || (hasReceipt(entry) && !isConfirmedEntry(entry)))).length,
    pre: entries.filter((entry) => !entry.disabled && entry.paymentStatus !== 'Cancelado' && !hasReceipt(entry) && !isConfirmedEntry(entry)).length,
    inactive: entries.filter((entry) => entry.disabled || entry.paymentStatus === 'Cancelado').length,
  };

  // Helper para obter texto de categorias
  const getCategoriesText = (entry: TournamentEntry) => {
    if (!entry.categoryIds || entry.categoryIds.length === 0) return 'Geral';
    const entryCats = categories.filter((c) => entry.categoryIds?.includes(c.id));
    if (entryCats.length === 0) return 'Geral';
    return entryCats.map((c) => c.abbreviation || c.name).join(', ');
  };

  // Coletar histórico de todos os pagamentos realizados
  const paidPaymentsList: FlattenedPayment[] = [];
  let totalPaidSum = 0;
  let totalDueSum = 0;
  let totalPendingSum = 0;

  const pendingEntriesList: {
    entry: TournamentEntry;
    dueAmount: number;
    paidAmount: number;
    pendingAmount: number;
    categoriesStr: string;
  }[] = [];
  const preRegistrationEntries: TournamentEntry[] = [];

  entries.forEach((entry) => {
    const showEntry = visibleEntries.has(entry.pin);
    const entryDue = entry.dueAmount ?? (event.registrationFee || 0);
    const isConfirmed = isConfirmedEntry(entry);
    const isIsento = entry.paymentStatus === 'Isento';
    const catStr = getCategoriesText(entry);

    let sumPayments = 0;
    if (entry.payments && entry.payments.length > 0) {
      entry.payments.forEach((p) => {
        const isPaymentConfirmed = p.status === 'Confirmado' || p.status === 'approved' || p.status === 'Pago';
        const isLegacyConfirmed = !p.status && isConfirmed;
        if (isPaymentConfirmed || isLegacyConfirmed) {
          sumPayments += p.amount || 0;
          if (showEntry) paidPaymentsList.push({
            paymentId: p.id,
            entryPin: entry.pin,
            participantName: entry.nickname || entry.name,
            date: p.date,
            amount: p.amount,
            categoriesStr: catStr,
            receiptUrl: p.receiptUrl,
            receiptFileName: p.receiptFileName,
          });
        }
      });
    } else if (isConfirmed && entry.paidAmount && entry.paidAmount > 0) {
      sumPayments = entry.paidAmount;
      if (showEntry) paidPaymentsList.push({
        paymentId: `legacy-${entry.pin}`,
        entryPin: entry.pin,
        participantName: entry.nickname || entry.name,
        date: entry.joinedAt || Date.now(),
        amount: entry.paidAmount,
        categoriesStr: catStr,
        receiptUrl: undefined,
      });
    } else if (isConfirmed && entryDue > 0) {
      // Se está confirmado mas não tem lista de pagamentos explícita
      if (showEntry) paidPaymentsList.push({
        paymentId: `conf-${entry.pin}`,
        entryPin: entry.pin,
        participantName: entry.nickname || entry.name,
        date: entry.joinedAt || Date.now(),
        amount: entryDue,
        categoriesStr: catStr,
        receiptUrl: undefined,
      });
    }

    // c) a soma valor pago é a soma do valor pago com status confirmado
    const hasExplicitPaymentStatuses = Boolean(entry.payments?.some((payment) => Boolean(payment.status)));
    const entryPaid = entry.payments?.length
      ? sumPayments > 0 ? sumPayments : hasExplicitPaymentStatuses ? 0 : isConfirmed ? entry.paidAmount ?? entryDue : 0
      : isConfirmed ? sumPayments > 0 ? sumPayments : entry.paidAmount ?? entryDue : 0;

    // d) a soma valor pendente é a soma do valor pendente de todos os inscritos
    const entryPending = isIsento ? 0 : Math.max(0, entryDue - entryPaid);

    // b) a soma valor devido é a soma do valor devido de todos os inscritos
    totalDueSum += entryDue;
    totalPaidSum += entryPaid;
    totalPendingSum += entryPending;

    const hasReceiptHistory = Boolean(entry.payments?.some((payment) => payment.receiptUrl));
    if (
      showEntry &&
      (hasPendingReviewReceipt(entry) || entry.paymentStatus === 'Aguardando Confirmação' || entry.paymentStatus === 'Recusado') &&
      hasReceiptHistory
    ) {
      pendingEntriesList.push({
        entry,
        dueAmount: entryDue,
        paidAmount: entryPaid,
        pendingAmount: entryPending,
        categoriesStr: catStr,
      });
    }
    if (showEntry && !entry.disabled && entry.paymentStatus !== 'Cancelado' && !hasReceiptHistory && !isConfirmed && !isIsento) {
      preRegistrationEntries.push(entry);
    }
  });

  // Ordenar pagamentos mais recentes primeiro
  paidPaymentsList.sort((a, b) => b.date - a.date);
  const paidRegistrationsList = Array.from(paidPaymentsList.reduce((byPin, payment) => {
    const current = byPin.get(payment.entryPin);
    if (current) {
      current.amount += payment.amount;
      if (payment.date >= current.date) {
        current.date = payment.date;
        current.receiptUrl = payment.receiptUrl;
        current.receiptFileName = payment.receiptFileName;
      }
    } else {
      byPin.set(payment.entryPin, { ...payment });
    }
    return byPin;
  }, new Map<string, FlattenedPayment>()).values());

  const handleOpenReceipt = (pay: FlattenedPayment) => {
    if (!pay.receiptUrl) {
      alert(`Nenhum comprovante anexado para o pagamento de ${pay.participantName}.`);
      return;
    }
    // Chrome blocks top-level navigation to data: URLs; use a blob URL instead.
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
        const receiptIndex = payments.map((payment, index) => ({ payment, index })).filter(({ payment }) => payment.receiptUrl).at(-1)?.index;
        if (receiptIndex !== undefined) payments[receiptIndex] = { ...payments[receiptIndex], status: pendingStatusChange.status };
        const paidAmount = payments.reduce((sum, payment) => sum + (payment.status === 'Confirmado' || payment.status === 'approved' || payment.status === 'Pago' ? (payment.amount || 0) : 0), 0);
        return { ...entry, payments, paidAmount, paymentStatus: pendingStatusChange.status };
      }),
    });
    setPendingStatusChange(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in">
      <div className="space-y-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Pesquisar por nome ou ID da inscrição..." className="w-full h-10 pl-9 pr-8 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-emerald-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400" />
          {searchName && <button type="button" onClick={() => setSearchName('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg" title="Limpar pesquisa"><X size={14} /></button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['confirmed', 'Confirmados', paymentGroupCounts.confirmed, 'border-emerald-300 bg-emerald-100 text-emerald-800'],
            ['awaiting', 'Ag. conf./recusados', paymentGroupCounts.awaiting, 'border-amber-300 bg-amber-100 text-amber-800'],
            ['pre', 'Pré-inscritos', paymentGroupCounts.pre, 'border-sky-300 bg-sky-100 text-sky-800'],
            ['inactive', 'Cancel./desat.', paymentGroupCounts.inactive, 'border-slate-300 bg-slate-200 text-slate-700'],
          ] as const).map(([group, label, count, activeClasses]) => <button key={group} type="button" onClick={() => setPaymentGroup(paymentGroup === group ? 'all' : group)} aria-pressed={paymentGroup === group} className={`flex min-w-0 items-center justify-between gap-1 rounded-xl border px-2.5 py-2 text-[10px] font-black transition-colors ${paymentGroup === group ? activeClasses : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}><span className="truncate">{label}</span><span>{count}</span></button>)}
        </div>
      </div>
      {pendingStatusChange && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setPendingStatusChange(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-black text-slate-800">Confirmar alteração de pagamento</h3>
              <p className="mt-2 text-sm text-slate-600">Deseja alterar o status de <strong>{pendingStatusChange.name}</strong> para <strong>{pendingStatusChange.status === 'Confirmado' ? 'Pagamento confirmado' : pendingStatusChange.status === 'Recusado' ? 'Recusado' : 'Aguardando confirmação'}</strong>?</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingStatusChange(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200">Cancelar</button>
              <button type="button" onClick={confirmPaymentStatusChange} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-600">Confirmar</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal simples de visualização de comprovante caso necessário */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-black text-slate-800 text-sm">{selectedReceipt.title}</h3>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-black p-1"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-50 rounded-2xl">
              <img
                src={selectedReceipt.url}
                alt={selectedReceipt.title}
                className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <a
                href={selectedReceipt.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (selectedReceipt.url.startsWith('data:')) {
                    event.preventDefault();
                    openReceiptInNewTab(selectedReceipt.url);
                  }
                }}
                className="bg-sky-500 hover:bg-sky-600 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all"
              >
                Abrir em nova aba
              </a>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quadro 1: Valor Pago (Accordion conforme Imagem 2) */}
      {(paymentGroup === 'all' || paymentGroup === 'confirmed') && (
      <div className="border-2 border-emerald-300/80 hover:border-emerald-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
        <button
          type="button"
          onClick={() => setIsPaidExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-left select-none group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-800 tracking-tight">
              Valor pago: R$ {totalPaidSum.toFixed(2)} · {paidRegistrationsList.length} inscrições
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
            {isPaidExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {isPaidExpanded && (
          <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in">
            {paidRegistrationsList.length === 0 ? (
              <p className="text-xs text-slate-400 font-bold text-center py-4">
                Nenhum pagamento registrado até o momento.
              </p>
            ) : (
              <>
              <div className="space-y-3 md:hidden">
                {paidRegistrationsList.map((pay, idx) => (
                  <article key={`${pay.entryPin}-${idx}`} className="rounded-2xl border border-emerald-100 bg-white p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-black text-slate-800">{pay.participantName}</p><p className="text-[10px] font-bold text-slate-500">{formatDateShort(pay.date)} · {pay.categoriesStr}</p></div>
                    <div className="shrink-0 text-right"><p className="mb-1 text-xs font-black text-slate-800">R$ {pay.amount.toFixed(2)}</p><button type="button" onClick={() => handleOpenReceipt(pay)} className="px-2.5 py-1.5 text-sky-700 bg-sky-50 rounded-lg inline-flex items-center gap-1 font-black text-xs"><Eye size={14} /> Ver</button></div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-black text-slate-700 border-b border-slate-100">
                      <th className="py-2.5 px-3">Participante</th>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Valor</th>
                      <th className="py-2.5 px-3">Categorias</th>
                      <th className="py-2.5 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-bold text-slate-700">
                    {paidRegistrationsList.map((pay, idx) => (
                      <tr
                        key={`${pay.paymentId}-${idx}`}
                        className="hover:bg-emerald-50/40 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <span className="font-black text-slate-800">{pay.participantName}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{formatDateShort(pay.date)}</td>
                        <td className="py-3 px-3 text-slate-800 font-black">{pay.amount.toFixed(2)}</td>
                        <td className="py-3 px-3 text-slate-600">{pay.categoriesStr}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenReceipt(pay)}
                            className={`p-1.5 rounded-lg transition-all inline-flex items-center justify-center ${
                              pay.receiptUrl
                                ? 'text-sky-500 hover:text-sky-700 hover:bg-sky-50 active:scale-95'
                                : 'text-slate-300 hover:text-slate-400'
                            }`}
                            title={pay.receiptUrl ? 'Ver comprovante' : 'Sem comprovante anexado'}
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* Quadro 2: Valor Pendente (Accordion) */}
      {(paymentGroup === 'all' || paymentGroup === 'awaiting') && (
      <div className="border-2 border-amber-300/80 hover:border-amber-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
        <button
          type="button"
          onClick={() => setIsPendingExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-left select-none group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-800 tracking-tight">
              Valor pendente: R$ {totalPendingSum.toFixed(2)} · {pendingEntriesList.length} inscrições
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
            {isPendingExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {isPendingExpanded && (
          <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in">
            {pendingEntriesList.length === 0 ? (
              <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 font-black py-4">
                <CheckCircle2 size={16} />
                Nenhum comprovante aguardando análise ou recusado.
              </div>
            ) : (
              <>
              <div className="space-y-3 md:hidden">
                {pendingEntriesList.map((item) => (
                  <article key={item.entry.pin} className="rounded-2xl border border-amber-100 p-3 space-y-2">
                    <div className="flex justify-between gap-3"><div><p className="font-black text-slate-800">{item.entry.nickname || item.entry.name}</p><p className="text-[10px] font-bold text-amber-600">Inscrição: {formatRegistrationId(item.entry.registrationId) || '—'}</p></div><p className="text-right text-xs font-black text-amber-600">R$ {item.pendingAmount.toFixed(2)}<span className="block text-[9px] text-slate-400">pendente</span></p></div>
                    <div className="flex justify-between border-t pt-2 text-[10px] text-slate-500"><span>Devido R$ {item.dueAmount.toFixed(2)}</span><span>{item.categoriesStr}</span></div>
                    <div className="flex flex-wrap gap-2 border-t pt-2"><button type="button" onClick={() => { const payment = item.entry.payments?.filter((p) => p.receiptUrl).at(-1); if (payment?.receiptUrl) handleOpenReceipt({ paymentId: payment.id, entryPin: item.entry.pin, participantName: item.entry.nickname || item.entry.name, date: payment.date, amount: payment.amount, categoriesStr: item.categoriesStr, receiptUrl: payment.receiptUrl, receiptFileName: payment.receiptFileName }); }} className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700"><Eye size={14} className="mr-1 inline" />Ver comprovante</button><select aria-label={`Status do pagamento de ${item.entry.nickname || item.entry.name}`} value={getReceiptStatus(item.entry)} onChange={(changeEvent) => setPendingStatusChange({ pin: item.entry.pin, name: item.entry.nickname || item.entry.name, status: changeEvent.target.value as 'Confirmado' | 'Aguardando Confirmação' | 'Recusado' })} className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-emerald-100 px-2 py-2 text-[10px] font-bold text-emerald-900"><option value="Aguardando Confirmação">Aguardando confirmação</option><option value="Confirmado">Pagamento confirmado</option><option value="Recusado">Recusado</option></select></div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[11px] font-black text-slate-700 border-b border-slate-100">
                      <th className="py-2.5 px-3">Participante</th>
                      <th className="py-2.5 px-3">Pendente</th>
                      <th className="py-2.5 px-3">Devido</th>
                      <th className="py-2.5 px-3">Categorias</th>
                      <th className="py-2.5 px-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-bold text-slate-700">
                    {pendingEntriesList.map((item) => (
                      <tr
                        key={item.entry.pin}
                        className="hover:bg-amber-50/40 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div>
                            <span className="font-black text-slate-800">
                              {item.entry.nickname || item.entry.name}
                            </span>
                            <span className="block text-[10px] text-amber-600 font-bold">
                              Inscrição: {formatRegistrationId(item.entry.registrationId) || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-amber-600 font-black">
                          R$ {item.pendingAmount.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-bold">
                          R$ {item.dueAmount.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{item.categoriesStr}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const payment = item.entry.payments?.filter((p) => p.receiptUrl).at(-1);
                                if (payment?.receiptUrl) handleOpenReceipt({ paymentId: payment.id, entryPin: item.entry.pin, participantName: item.entry.nickname || item.entry.name, date: payment.date, amount: payment.amount, categoriesStr: item.categoriesStr, receiptUrl: payment.receiptUrl, receiptFileName: payment.receiptFileName });
                              }}
                              className="px-2 py-1 text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg inline-flex items-center gap-1 font-black text-xs"
                              title="Ver comprovante anexado"
                            ><Eye size={14} /> Ver</button>
                            <select
                              aria-label={`Status do pagamento de ${item.entry.nickname || item.entry.name}`}
                              value={getReceiptStatus(item.entry)}
                              onChange={(changeEvent) => setPendingStatusChange({ pin: item.entry.pin, name: item.entry.nickname || item.entry.name, status: changeEvent.target.value as 'Confirmado' | 'Aguardando Confirmação' | 'Recusado' })}
                              className="max-w-40 rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-900"
                            >
                              <option value="Aguardando Confirmação">Aguardando confirmação</option>
                              <option value="Confirmado">Pagamento confirmado</option>
                              <option value="Recusado">Recusado</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {(paymentGroup === 'all' || paymentGroup === 'pre') && (
      <div className="border-2 border-sky-200 bg-white rounded-3xl p-4 shadow-sm">
        <button type="button" onClick={() => setIsPreRegistrationExpanded((prev) => !prev)} className="w-full flex items-center justify-between text-left select-none group">
          <span className="text-sm font-black text-slate-800">Pré-inscrição: {preRegistrationEntries.length}</span>
          <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">{isPreRegistrationExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
        </button>
        {isPreRegistrationExpanded && <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
          {preRegistrationEntries.length === 0 ? <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhuma pré-inscrição sem comprovante.</p> : preRegistrationEntries.map((entry) => {
            const dueAmount = entry.dueAmount ?? (event.registrationFee || 0);
            return <article key={entry.pin} className="rounded-2xl border border-sky-100 bg-white p-3 space-y-2">
              <div className="flex justify-between gap-3">
                <div><p className="font-black text-slate-800">{entry.nickname || entry.name}</p><p className="text-[10px] font-bold text-sky-700">Inscrição: {formatRegistrationId(entry.registrationId) || '—'}</p></div>
                <p className="text-right text-xs font-black text-sky-700">R$ {dueAmount.toFixed(2)}<span className="block text-[9px] text-slate-400">pendente</span></p>
              </div>
              <div className="flex justify-between gap-2 border-t pt-2 text-[10px] text-slate-500"><span>Devido R$ {dueAmount.toFixed(2)}</span><span className="text-right">{getCategoriesText(entry)}</span></div>
            </article>;
          })}
        </div>}
      </div>
      )}
      {paymentGroup === 'inactive' && <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-black text-slate-800">Cancelados/desativados: {paymentGroupCounts.inactive}</h3>
        {entries.filter((entry) => visibleEntries.has(entry.pin) && (entry.disabled || entry.paymentStatus === 'Cancelado')).map((entry) => <div key={entry.pin} className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-xs"><span className="font-bold">{entry.nickname || entry.name}<small className="block text-slate-500">Inscrição: {formatRegistrationId(entry.registrationId) || '—'}</small></span><span className="font-bold text-slate-500">{entry.disabled ? 'Desativado' : 'Cancelado'}</span></div>)}
      </div>}
    </div>
  );
};
