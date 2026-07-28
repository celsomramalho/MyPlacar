// ─── src/modules/localSync/components/LocalControllerView.tsx ────────────────
// Tela do Controlador: exibe PIN gerado e status de conexao com o Espelho.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Wifi, WifiOff, X, Loader2, Check } from 'lucide-react';
import type { LocalSyncStatus } from '@infra/network/LocalSyncService';

interface Props {
  pin: string;
  status: LocalSyncStatus;
  onStop: () => void;
}

export const LocalControllerView: React.FC<Props> = ({ pin, status, onStop }) => {
  const isWaiting = status === 'waiting_mirror';
  const isConnected = status === 'connected';

  // Formata PIN com espaco central: "12 34"
  const pinFormatted = pin.slice(0, 2) + ' ' + pin.slice(2);

  return (
    <div className="fixed inset-0 z-[99998] bg-[#0a0f1e]/95 backdrop-blur-xl flex flex-col items-center justify-between p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="w-full flex items-center justify-between pt-2">
        <div>
          <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-0.5">Modo Lite • Controlador</div>
          <div className="text-white/50 text-xs">Transmitindo placar localmente</div>
        </div>
        <button
          onClick={onStop}
          id="btn-local-stop-controller"
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90"
        >
          <X size={18} />
        </button>
      </div>

      {/* PIN Display */}
      <div className="flex flex-col items-center gap-6 flex-1 justify-center">
        <div className="text-gray-400 text-sm font-semibold uppercase tracking-widest">PIN de Pareamento</div>

        {/* PIN grande */}
        <div className="relative">
          <div className="absolute -inset-4 bg-orange-500/10 rounded-3xl blur-xl" />
          <div className="relative flex gap-3">
            {pin.split('').map((digit, i) => (
              <div
                key={i}
                className={`w-16 h-20 flex items-center justify-center rounded-2xl border-2 font-black text-5xl transition-all duration-300 ${
                  isConnected
                    ? 'border-green-500/60 bg-green-500/10 text-green-300'
                    : 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                }`}
              >
                {digit}
              </div>
            ))}
          </div>
        </div>

        {/* Status */}
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all duration-500 ${
          isConnected
            ? 'border-green-500/40 bg-green-500/10 text-green-400'
            : 'border-orange-500/30 bg-orange-500/10 text-orange-400'
        }`}>
          {isConnected ? (
            <>
              <Check size={16} />
              <span>Espelho Conectado!</span>
            </>
          ) : (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Aguardando espelho...</span>
            </>
          )}
        </div>

        {/* Instrucoes */}
        {isWaiting && (
          <div className="bg-white/5 rounded-2xl p-4 w-full max-w-xs border border-white/5">
            <p className="text-gray-400 text-xs text-center leading-relaxed">
              No dispositivo Espelho (relogio), selecione
              <span className="text-white font-semibold"> "Espelhar Placar"</span> e
              digite o PIN acima
            </p>
          </div>
        )}

        {isConnected && (
          <div className="bg-green-500/10 rounded-2xl p-4 w-full max-w-xs border border-green-500/20">
            <div className="flex items-center gap-2 justify-center">
              <Wifi size={16} className="text-green-400" />
              <p className="text-green-300 text-xs font-semibold">
                Sincronismo ativo — continue jogando normalmente
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Rodape */}
      <div className="w-full">
        <div className="flex items-center gap-2 justify-center mb-3">
          {isConnected ? (
            <Wifi size={14} className="text-green-400" />
          ) : (
            <WifiOff size={14} className="text-gray-500" />
          )}
          <span className="text-gray-500 text-xs">
            {isConnected ? 'Conexao local estabelecida' : 'Sem conexao de internet necessaria'}
          </span>
        </div>
      </div>
    </div>
  );
};
