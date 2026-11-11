import React, { useState } from 'react';
import {
  CreditCard,
  QrCode,
  Upload,
  CheckCircle2,
  DollarSign,
  Loader2,
  AlertCircle,
  Eye,
  FileText,
  ExternalLink,
  X,
  ChevronDown,
} from 'lucide-react';
import type { PaymentItem, TournamentEvent, TournamentEntry } from '@modules/events/types';
import type { PricingCalculationResult } from '../../types';
import type { UseRegistrationPaymentResult } from '../../hooks/useRegistrationPayment';
import { PixPaymentView } from './PixPaymentView';
import { StaticPixSection } from './StaticPixSection';

const openReceiptInNewTab = (url: string) => {
  // Chrome blocks top-level navigation to data: URLs. Convert stored receipts
  // to a temporary blob URL so the browser can render them in a new tab.
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
    console.error('[PaymentCheckoutStep] Não foi possível abrir o comprovante:', error);
  }
};

export interface PaymentCheckoutStepProps {
  event: TournamentEvent;
  /** Inscrição atual do atleta — usada para geração do txid Pix Estático. */
  entry: TournamentEntry;
  pricing: PricingCalculationResult;
  payment: UseRegistrationPaymentResult;
  readOnly?: boolean;
  requiresReceipt?: boolean;
  hasExistingReceipt?: boolean;
  existingPayments?: PaymentItem[];
  totalPaid?: number;
  pendingAmount?: number;
  isAdmin?: boolean;
  onUpdatePaymentItemStatus?: (
    paymentId: string,
    newStatus: 'Confirmado' | 'Aguardando Confirmação' | 'Recusado'
  ) => Promise<void> | void;
}

export const PaymentCheckoutStep: React.FC<PaymentCheckoutStepProps> = ({
  event,
  entry,
  pricing,
  payment,
  readOnly = false,
  requiresReceipt = false,
  hasExistingReceipt = false,
  existingPayments = [],
  totalPaid = 0,
  pendingAmount = 0,
  isAdmin = false,
  onUpdatePaymentItemStatus,
}) => {
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);

  const handlePaymentStatusChange = async (
    paymentId: string,
    newStatus: 'Confirmado' | 'Aguardando Confirmação' | 'Recusado'
  ) => {
    if (!onUpdatePaymentItemStatus) return;
    setUpdatingPaymentId(paymentId);
    try {
      await onUpdatePaymentItemStatus(paymentId, newStatus);
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  // Se o tipo de pagamento do evento é manual, inicia sempre no modo manual
  const eventPaymentType = String(event.paymentType ?? 'manual').trim().toLowerCase();
  const allowMercadoPago = eventPaymentType === 'mercadopago';
  const [paymentMode, setPaymentMode] = useState<'mercadopago' | 'manual'>(
    allowMercadoPago ? 'mercadopago' : 'manual',
  );
  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);

  const formatDateShort = (timestamp?: number) => {
    if (!timestamp) return '-';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  if (pricing.isFree) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600" />
            Pagamento da inscrição
          </h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Este evento possui participação gratuita.
          </p>
        </div>
        <div className="p-8 text-center bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800 font-bold text-xs flex flex-col items-center gap-2">
          <CheckCircle2 size={28} className="text-emerald-500" />
          <span>Inscrição gratuita — Nenhuma taxa é cobrada para este torneio. Clique em "Finalizar inscrição" abaixo para concluir.</span>
        </div>
      </div>
    );
  }

  // Se o Pix foi gerado e está ativo, exibe a tela do Pix
  if (payment.pixData) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <PixPaymentView
          pixData={payment.pixData}
          isApproved={payment.isApproved}
          onCancelPix={payment.cancelPix}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
          <CreditCard size={18} className="text-blue-600" />
          Forma de pagamento
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          Escolha como deseja realizar o pagamento da sua taxa de inscrição.
        </p>
      </div>

      {/* Resumo do Valor */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400">
              {totalPaid > 0 && pendingAmount > 0
                ? 'Diferença a pagar'
                : totalPaid > 0 && pendingAmount === 0
                ? 'Saldo pendente'
                : 'Total a pagar'}
            </span>
            <h4 className="text-2xl font-black text-slate-800">
              R${' '}
              {(totalPaid > 0 && pendingAmount > 0
                ? pendingAmount
                : totalPaid > 0 && pendingAmount === 0
                ? 0
                : pricing.dueAmount
              ).toFixed(2)}
            </h4>
          </div>
          <div className="text-xs font-bold px-3 py-1.5 rounded-2xl bg-blue-100/80 text-blue-700 flex flex-col items-center justify-center text-center leading-tight">
            {pricing.extraCategoriesCount > 0 ? (
              <>
                <span>Taxa base</span>
                <span className="whitespace-nowrap">
                  + {pricing.extraCategoriesCount} adicional(is)
                </span>
              </>
            ) : (
              <span>Taxa de inscrição</span>
            )}
          </div>
        </div>

        {totalPaid > 0 && (
          <div className="pt-2 border-t border-slate-200/70 space-y-1 text-xs font-bold">
            <p className="text-slate-500 whitespace-nowrap">
              Total das categorias: R$ {pricing.dueAmount.toFixed(2)}
            </p>
            <p className="text-emerald-600 font-black whitespace-nowrap">
              Total já comprovado: R$ {totalPaid.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Histórico de Comprovantes / Pagamentos Anexados */}
      {existingPayments.length > 0 && (
        <div className="space-y-3 p-4 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <div className="space-y-1 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-500 shrink-0" />
              <h4 className="text-xs font-black text-slate-800">
                Histórico de comprovantes / pagamentos ({existingPayments.length})
              </h4>
            </div>
            <p className="text-xs font-black text-emerald-600 whitespace-nowrap pl-6">
              Soma: R$ {totalPaid.toFixed(2)}
            </p>
          </div>

          <div className="space-y-2.5">
            {existingPayments.map((p, idx) => (
              <div
                key={p.id || idx}
                className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl space-y-2.5"
              >
                {/* Linha superior: Valor, Data e Tipo */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-slate-900 text-sm">
                    R$ {(p.amount || 0).toFixed(2)}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {formatDateShort(p.date)}
                  </span>
                  <span className="text-xs font-bold px-3 py-0.5 rounded-xl bg-white border border-slate-200 text-slate-700">
                    {p.provider === 'mercadopago' ? 'Mercado Pago' : 'Manual'}
                  </span>
                </div>

                {/* Linha inferior: Botão Ver e Status */}
                <div className="flex items-center gap-2">
                  {p.receiptUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedReceipt({
                          url: p.receiptUrl!,
                          title: `Comprovante - R$ ${(p.amount || 0).toFixed(2)} (${formatDateShort(p.date)})`,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                      title="Ver comprovante"
                    >
                      <Eye size={14} className="stroke-[2.5]" />
                      Ver
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-400 px-2 py-1">
                      Sem anexo
                    </span>
                  )}

                  {isAdmin && !readOnly && onUpdatePaymentItemStatus ? (
                    <div className="relative inline-flex items-center min-w-0">
                      {updatingPaymentId === (p.id || `payment-${idx}`) ? (
                        <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin text-emerald-600" />
                          Salvando...
                        </span>
                      ) : (
                        <>
                          <select
                            value={
                              p.status === 'Confirmado' ||
                              p.status === 'approved' ||
                              p.status === 'Pago'
                                ? 'Confirmado'
                                : p.status === 'Recusado' ||
                                  p.status === 'rejected' ||
                                  p.status === 'Cancelado'
                                ? 'Recusado'
                                : 'Aguardando Confirmação'
                            }
                            onChange={(e) =>
                              void handlePaymentStatusChange(
                                p.id || `payment-${idx}`,
                                e.target.value as 'Confirmado' | 'Aguardando Confirmação' | 'Recusado'
                              )
                            }
                            className={`text-xs font-black pl-3 pr-7 py-1.5 rounded-xl border appearance-none cursor-pointer transition-all shadow-xs ${
                              p.status === 'Confirmado' ||
                              p.status === 'approved' ||
                              p.status === 'Pago'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                : p.status === 'Recusado' ||
                                  p.status === 'rejected' ||
                                  p.status === 'Cancelado'
                                ? 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                            }`}
                            title="Alterar status deste pagamento"
                          >
                            <option value="Aguardando Confirmação">Aguardando confirmação</option>
                            <option value="Confirmado">Pagamento confirmado</option>
                            <option value="Recusado">Recusado</option>
                          </select>
                          <ChevronDown
                            size={14}
                            className="pointer-events-none absolute right-2 text-slate-500"
                          />
                        </>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl truncate ${
                        p.status === 'Confirmado' ||
                        p.status === 'approved' ||
                        p.status === 'Pago'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.status === 'Recusado' ||
                            p.status === 'rejected' ||
                            p.status === 'Cancelado'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100/80 text-amber-900'
                      }`}
                    >
                      {p.status === 'pending' ||
                      p.status === 'Aguardando Confirmação' ||
                      !p.status
                        ? 'Aguardando confirmação'
                        : p.status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pix Estático — exibido apenas para pagamentos manuais com chave Pix configurada */}
      {!allowMercadoPago && event.pixKey && (
        <StaticPixSection
          event={event}
          entry={entry}
          amount={
            totalPaid > 0 && pendingAmount > 0
              ? pendingAmount
              : pricing.dueAmount
          }
        />
      )}

      {/* Escolha do Método — só exibe os dois cards se MP estiver habilitado */}
      <div className={`grid grid-cols-1 gap-3 ${allowMercadoPago ? 'sm:grid-cols-2' : ''}`}>
        {/* Opção Pix Automático — oculta quando tipo pagamento = manual */}
        {allowMercadoPago && (
        <div
          onClick={() => setPaymentMode('mercadopago')}
          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-3 ${
            paymentMode === 'mercadopago'
              ? 'bg-blue-50/50 border-blue-500 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <QrCode size={20} />
            </div>
            <h4 className="text-sm font-black text-slate-800">
              Pix instantâneo (Mercado Pago)
            </h4>
            <p className="text-xs text-slate-500 font-bold">
              Gera QR Code na hora com aprovação imediata e confirmação automática.
            </p>
          </div>
          <span className="text-[11px] font-black text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={12} />
            Recomendado · Sem espera
          </span>
        </div>
        )}

        {/* Opção Manual / Comprovante */}
        <div
          onClick={() => setPaymentMode('manual')}
          className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between gap-3 ${
            allowMercadoPago ? 'cursor-pointer' : 'cursor-default'
          } ${
            paymentMode === 'manual'
              ? 'bg-blue-50/50 border-blue-500 shadow-xs'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-700 text-white flex items-center justify-center shadow-xs">
              <Upload size={20} />
            </div>
            <h4 className="text-sm font-black text-slate-800">
              {event.pixKey ? 'Pix / Comprovante' : 'Transferência / Comprovante'}
            </h4>
            <p className="text-xs text-slate-500 font-bold">
              {event.pixKey
                ? 'Copie o código Pix acima, pague e anexe o comprovante.'
                : 'Faça a transferência para o organizador e anexe o comprovante.'}
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            Validação manual pelo organizador
          </span>
        </div>
      </div>

      {/* Ação do Método Selecionado */}
      {paymentMode === 'mercadopago' ? (
        <div className="pt-2">
          {payment.pixError && (
            <div className="p-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{payment.pixError}</span>
            </div>
          )}
          <button
            type="button"
            disabled={payment.isCreatingPix || readOnly}
            onClick={() => payment.createPix()}
            className="w-full py-3.5 px-4 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all disabled:opacity-50"
          >
            {payment.isCreatingPix ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Gerando QR Code Pix...</span>
              </>
            ) : (
              <>
                <QrCode size={16} />
                <span>Gerar QR Code Pix para pagar</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className={`p-4 bg-white rounded-2xl border space-y-3 ${
          requiresReceipt && !payment.manualReceiptFile
            ? 'border-amber-400 bg-amber-50/40'
            : 'border-slate-200'
        }`}>
          <label className="text-xs font-black text-slate-700 block flex items-center gap-1">
            {totalPaid > 0 && pendingAmount > 0
              ? `Anexar comprovante da diferença (R$ ${pendingAmount.toFixed(2)})`
              : 'Anexar comprovante de pagamento'}
            {requiresReceipt && (
              <span className="text-rose-500 font-black ml-0.5">*</span>
            )}
          </label>

          {/* Se a inscrição está 100% quitada */}
          {!requiresReceipt && hasExistingReceipt && !payment.manualReceiptFile && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>Inscrição totalmente quitada pelos comprovantes anteriores. O envio de um novo arquivo é opcional.</span>
            </div>
          )}

          {/* Se precisa de comprovante da diferença */}
          {requiresReceipt && pendingAmount > 0 && totalPaid > 0 && !payment.manualReceiptFile && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black">Diferença de novas categorias pendente!</p>
                <p className="mt-0.5 text-[11px] font-bold text-amber-700">
                  Total das categorias: R$ {pricing.dueAmount.toFixed(2)} · Já comprovado: R$ {totalPaid.toFixed(2)}.<br />
                  É obrigatório anexar o comprovante da diferença de <strong>R$ {pendingAmount.toFixed(2)}</strong> para finalizar a inscrição.
                </p>
              </div>
            </div>
          )}

          {/* Se é o primeiro comprovante obrigatório */}
          {requiresReceipt && totalPaid === 0 && !payment.manualReceiptFile && (
            <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
              <AlertCircle size={12} />
              Obrigatório para finalizar a inscrição
            </p>
          )}

          <input
            type="file"
            disabled={readOnly}
            accept="image/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              payment.setManualReceiptFile(file);
            }}
            className="text-xs font-bold text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          {payment.manualReceiptFile && (
            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Arquivo selecionado: {payment.manualReceiptFile.name}
            </p>
          )}
        </div>
      )}

      {/* Modal de visualização de comprovante */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-4 space-y-3 shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-black text-slate-800 text-sm truncate">{selectedReceipt.title}</h3>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-slate-50 rounded-2xl p-2 border border-slate-200">
              {selectedReceipt.url.startsWith('data:application/pdf') || selectedReceipt.url.endsWith('.pdf') ? (
                <iframe src={selectedReceipt.url} className="w-full h-96 rounded-xl border-0" title="PDF" />
              ) : (
                <img
                  src={selectedReceipt.url}
                  alt={selectedReceipt.title}
                  className="max-h-[65vh] object-contain rounded-xl"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
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
                className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 font-black text-xs hover:bg-blue-100 flex items-center gap-1.5"
              >
                <ExternalLink size={14} /> Abrir em nova aba
              </a>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-black text-xs hover:bg-slate-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
