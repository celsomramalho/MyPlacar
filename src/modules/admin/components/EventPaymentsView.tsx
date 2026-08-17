import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, FileText, User, DollarSign, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { TournamentEvent, TournamentEntry, PaymentItem } from '@modules/events/types';

interface Props {
  event: TournamentEvent;
  onNavigateToEntry: (email: string) => void;
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

const formatDateShort = (timestamp: number) => {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

export const EventPaymentsView: React.FC<Props> = ({ event, onNavigateToEntry }) => {
  const [isPaidExpanded, setIsPaidExpanded] = useState(true);
  const [isPendingExpanded, setIsPendingExpanded] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);

  const categories = event.categories || [];
  const entries = event.entries || [];

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

  entries.forEach((entry) => {
    const entryDue = entry.dueAmount ?? (event.registrationFee || 0);
    const isConfirmed = entry.paymentStatus === 'Confirmado' || entry.paymentStatus === 'Pago';
    const isIsento = entry.paymentStatus === 'Isento';
    const catStr = getCategoriesText(entry);

    let sumPayments = 0;
    if (entry.payments && entry.payments.length > 0) {
      entry.payments.forEach((p) => {
        sumPayments += p.amount || 0;
        // Adiciona ao histórico se confirmado ou se houver registro de pagamento
        paidPaymentsList.push({
          paymentId: p.id,
          entryPin: entry.pin,
          participantName: entry.nickname || entry.name,
          date: p.date,
          amount: p.amount,
          categoriesStr: catStr,
          receiptUrl: p.receiptUrl,
          receiptFileName: p.receiptFileName,
        });
      });
    } else if (entry.paidAmount && entry.paidAmount > 0) {
      sumPayments = entry.paidAmount;
      paidPaymentsList.push({
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
      paidPaymentsList.push({
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
    const entryPaid = isConfirmed
      ? sumPayments > 0
        ? sumPayments
        : entry.paidAmount ?? entryDue
      : 0;

    // d) a soma valor pendente é a soma do valor pendente de todos os inscritos
    const entryPending = isIsento
      ? 0
      : isConfirmed
      ? Math.max(0, entryDue - entryPaid)
      : entryDue;

    // b) a soma valor devido é a soma do valor devido de todos os inscritos
    totalDueSum += entryDue;
    totalPaidSum += entryPaid;
    totalPendingSum += entryPending;

    if (entryPending > 0 || (!isConfirmed && !isIsento)) {
      pendingEntriesList.push({
        entry,
        dueAmount: entryDue,
        paidAmount: entryPaid,
        pendingAmount: entryPending,
        categoriesStr: catStr,
      });
    }
  });

  // Ordenar pagamentos mais recentes primeiro
  paidPaymentsList.sort((a, b) => b.date - a.date);

  const handleOpenReceipt = (pay: FlattenedPayment) => {
    if (!pay.receiptUrl) {
      alert(`Nenhum comprovante anexado para o pagamento de ${pay.participantName}.`);
      return;
    }
    // Abrir em nova aba ou modal
    window.open(pay.receiptUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4 animate-in fade-in">
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
      <div className="border-2 border-emerald-300/80 hover:border-emerald-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
        <button
          type="button"
          onClick={() => setIsPaidExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-left select-none group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-800 tracking-tight">
              Valor pago: R$ {totalPaidSum.toFixed(2)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
            {isPaidExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {isPaidExpanded && (
          <div className="mt-4 pt-3 border-t border-slate-100 animate-in fade-in">
            {paidPaymentsList.length === 0 ? (
              <p className="text-xs text-slate-400 font-bold text-center py-4">
                Nenhum pagamento registrado até o momento.
              </p>
            ) : (
              <div className="overflow-x-auto">
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
                    {paidPaymentsList.map((pay, idx) => (
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
            )}
          </div>
        )}
      </div>

      {/* Quadro 2: Valor Pendente (Accordion) */}
      <div className="border-2 border-amber-300/80 hover:border-amber-400 bg-white rounded-3xl p-4 shadow-sm transition-all">
        <button
          type="button"
          onClick={() => setIsPendingExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-left select-none group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-800 tracking-tight">
              Valor pendente: R$ {totalPendingSum.toFixed(2)}
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
                Nenhum pagamento pendente! Todas as inscrições estão quitadas.
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                              PIN: {item.entry.pin}
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
                          <button
                            type="button"
                            onClick={() => onNavigateToEntry(item.entry.email)}
                            className="p-1.5 text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded-lg transition-all active:scale-95 inline-flex items-center gap-1 font-black text-xs"
                            title="Ir para a inscrição deste participante"
                          >
                            <Eye size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
