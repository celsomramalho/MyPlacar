/**
 * StaticPixSection.tsx
 *
 * Seção de Pix Estático exibida na etapa de pagamento da inscrição.
 * Mostra os dados do recebedor, o botão "Copiar Código Pix" e,
 * opcionalmente (via botão), o QR Code visual gerado via API externa.
 */

import React, { useState, useMemo } from 'react';
import { Copy, Check, QrCode, ChevronDown, ChevronUp } from 'lucide-react';
import { buildPixBrCode } from '@shared/utils/pixBrCode';
import { buildPixTxid } from '@shared/utils/pixTxid';
import { copyToClipboard } from '@shared/utils/clipboard';
import type { TournamentEvent, TournamentEntry } from '@modules/events/types';

export interface StaticPixSectionProps {
  event: TournamentEvent;
  entry: TournamentEntry;
  /** Valor total a pagar neste momento (pode ser diferente do total da inscrição). */
  amount: number;
}

export const StaticPixSection: React.FC<StaticPixSectionProps> = ({
  event,
  entry,
  amount,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const { pixKey, pixReceiverName, pixCity } = event;

  // Não renderiza se os dados mínimos do Pix não estiverem preenchidos
  if (!pixKey || !pixReceiverName || !pixCity) return null;
  if (amount <= 0) return null;

  // ── Geração do txid e do BR Code ─────────────────────────────────────────
  const txid = buildPixTxid({
    eventPin: event.pin,
    registrationId: entry.registrationId,
    paymentsCount: entry.payments?.length ?? 0,
  });

  const brCode = buildPixBrCode({
    pixKey,
    amount,
    receiverName: pixReceiverName,
    city: pixCity,
    txid,
  });

  // URL para geração do QR Code visual via serviço público
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(brCode)}&size=200x200&margin=10`;

  const handleCopy = async () => {
    const success = await copyToClipboard(brCode);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <QrCode size={15} />
        </div>
        <div>
          <p className="text-xs font-black text-emerald-900">Pague via Pix</p>
          <p className="text-[10px] font-bold text-emerald-700">
            Copie o código e pague no app do seu banco
          </p>
        </div>
      </div>

      {/* Dados resumidos */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-bold text-slate-600 bg-white/70 rounded-xl px-3 py-2.5 border border-emerald-100">
        <span className="text-slate-400 font-black">Recebedor</span>
        <span className="truncate">{pixReceiverName}</span>
        <span className="text-slate-400 font-black">Chave</span>
        <span className="truncate">{pixKey}</span>
        <span className="text-slate-400 font-black">Valor</span>
        <span className="font-black text-emerald-700">R$ {amount.toFixed(2)}</span>
        <span className="text-slate-400 font-black">Referência</span>
        <span className="font-mono text-xs">{txid}</span>
      </div>

      {/* Botão Copiar */}
      <button
        type="button"
        onClick={handleCopy}
        className={`w-full py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-xs active:scale-95 ${
          copied
            ? 'bg-emerald-600 text-white'
            : 'bg-emerald-700 hover:bg-emerald-800 text-white'
        }`}
      >
        {copied ? (
          <>
            <Check size={15} />
            <span>Código Pix Copiado!</span>
          </>
        ) : (
          <>
            <Copy size={15} />
            <span>Copiar Código Pix de sua inscrição</span>
          </>
        )}
      </button>

      {/* Botão Mostrar/Ocultar QR Code */}
      <button
        type="button"
        onClick={() => setShowQr((v) => !v)}
        className="w-full py-2 px-4 rounded-xl text-[11px] font-black text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 flex items-center justify-center gap-1.5 transition-all active:scale-95"
      >
        <QrCode size={13} />
        <span>{showQr ? 'Ocultar QR Code' : 'Mostrar QR Code'}</span>
        {showQr ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {/* QR Code visual — visível somente quando showQr = true */}
      {showQr && (
        <div className="flex flex-col items-center gap-2 pt-1 animate-in fade-in duration-200">
          <div className="p-2 bg-white rounded-2xl border border-emerald-200 shadow-xs">
            <img
              src={qrCodeUrl}
              alt="QR Code Pix"
              className="w-48 h-48 object-contain"
              loading="lazy"
            />
          </div>
          <p className="text-[10px] font-bold text-slate-400 text-center">
            Escaneie com a câmera do celular ou pelo app do banco
          </p>
        </div>
      )}
    </div>
  );
};
