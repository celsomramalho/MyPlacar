import React, { useState } from 'react';
import { CreditCard, QrCode, Upload, CheckCircle2, DollarSign, Loader2, AlertCircle } from 'lucide-react';
import type { TournamentEvent } from '@modules/events/types';
import type { PricingCalculationResult } from '../../types';
import type { UseRegistrationPaymentResult } from '../../hooks/useRegistrationPayment';
import { PixPaymentView } from './PixPaymentView';

export interface PaymentCheckoutStepProps {
  event: TournamentEvent;
  pricing: PricingCalculationResult;
  payment: UseRegistrationPaymentResult;
  readOnly?: boolean;
}

export const PaymentCheckoutStep: React.FC<PaymentCheckoutStepProps> = ({
  event,
  pricing,
  payment,
  readOnly = false,
}) => {
  const [paymentMode, setPaymentMode] = useState<'mercadopago' | 'manual'>('mercadopago');

  if (pricing.isFree) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600" />
            Pagamento da Inscrição
          </h3>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            Este evento possui participação gratuita.
          </p>
        </div>
        <div className="p-8 text-center bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800 font-bold text-xs flex flex-col items-center gap-2">
          <CheckCircle2 size={28} className="text-emerald-500" />
          <span>Inscrição Gratuita — Nenhuma taxa é cobrada para este torneio. Avance para confirmar.</span>
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
          Forma de Pagamento
        </h3>
        <p className="text-xs text-slate-400 font-bold mt-0.5">
          Escolha como deseja realizar o pagamento da sua taxa de inscrição.
        </p>
      </div>

      {/* Resumo do Valor */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-400">Total a Pagar</span>
          <h4 className="text-2xl font-black text-slate-800">
            R$ {pricing.dueAmount.toFixed(2)}
          </h4>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-blue-100 text-blue-700">
          {pricing.extraCategoriesCount > 0
            ? `Taxa Base + ${pricing.extraCategoriesCount} adicional(is)`
            : 'Taxa de Inscrição'}
        </span>
      </div>

      {/* Escolha do Método */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Opção Pix Automático */}
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
              Pix Instantâneo (Mercado Pago)
            </h4>
            <p className="text-xs text-slate-500 font-bold">
              Gera QR Code na hora com aprovação imediata e confirmação automática.
            </p>
          </div>
          <span className="text-[11px] font-black text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={12} />
            Recomendado · Sem Espera
          </span>
        </div>

        {/* Opção Manual / Comprovante */}
        <div
          onClick={() => setPaymentMode('manual')}
          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-3 ${
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
              Transferência / Comprovante
            </h4>
            <p className="text-xs text-slate-500 font-bold">
              Faça a transferência para o organizador e anexe o comprovante.
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
                <span>Gerar QR Code Pix para Pagar</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
          <label className="text-xs font-black text-slate-700 block">
            Anexar Comprovante de Pagamento
          </label>
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
    </div>
  );
};
