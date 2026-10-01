import React, { useState } from 'react';
import { QrCode, Copy, Check, CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import type { PixCheckoutData } from '../../hooks/useRegistrationPayment';
import { copyToClipboard } from '@shared/utils/clipboard';

export interface PixPaymentViewProps {
  pixData: PixCheckoutData;
  isApproved: boolean;
  onCancelPix?: () => void;
}

export const PixPaymentView: React.FC<PixPaymentViewProps> = ({
  pixData,
  isApproved,
  onCancelPix,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!pixData.qrCode) return;
    const success = await copyToClipboard(pixData.qrCode);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (isApproved) {
    return (
      <div className="p-8 bg-emerald-50 rounded-2xl border-2 border-emerald-500 text-center space-y-3 animate-in zoom-in-95 duration-200">
        <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
          <CheckCircle2 size={32} />
        </div>
        <h4 className="text-lg font-black text-emerald-900">
          Pagamento Confirmado!
        </h4>
        <p className="text-xs font-bold text-emerald-700 max-w-sm mx-auto">
          O Mercado Pago identificou o recebimento do seu Pix. Sua inscrição foi confirmada com sucesso!
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4 text-center">
      <div className="space-y-1">
        <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl inline-flex items-center gap-1.5">
          <Clock size={12} className="text-emerald-600" />
          Aguardando Pagamento Pix
        </span>
        <h4 className="text-xl font-black text-slate-800 pt-1">
          R$ {pixData.amount.toFixed(2)}
        </h4>
        <p className="text-xs text-slate-400 font-bold">
          Abra o app do seu banco e escaneie o código abaixo ou use o Copia e Cola.
        </p>
      </div>

      {/* QR Code Imagem */}
      {pixData.qrCodeBase64 ? (
        <div className="flex justify-center p-3 bg-white rounded-2xl border border-slate-200 w-fit mx-auto shadow-xs">
          <img
            src={`data:image/png;base64,${pixData.qrCodeBase64}`}
            alt="QR Code Pix"
            className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
          />
        </div>
      ) : (
        <div className="w-48 h-48 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
          <QrCode size={48} />
        </div>
      )}

      {/* Código Copia e Cola */}
      {pixData.qrCode && (
        <div className="space-y-2 max-w-md mx-auto">
          <button
            type="button"
            onClick={handleCopy}
            className={`w-full py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-xs active:scale-95 ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? (
              <>
                <Check size={16} />
                <span>Código Pix Copiado com Sucesso!</span>
              </>
            ) : (
              <>
                <Copy size={16} />
                <span>Copiar Código Pix Copia e Cola</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Indicador de Polling */}
      <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-500 pt-2">
        <Loader2 size={14} className="animate-spin text-blue-600" />
        <span>Identificando pagamento em tempo real...</span>
      </div>

      {onCancelPix && (
        <button
          type="button"
          onClick={onCancelPix}
          className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors pt-2"
        >
          Escolher outra forma de pagamento
        </button>
      )}
    </div>
  );
};
