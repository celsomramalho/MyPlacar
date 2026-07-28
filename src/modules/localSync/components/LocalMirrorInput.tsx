// ─── src/modules/localSync/components/LocalMirrorInput.tsx ───────────────────
// Tela do Espelho: input do PIN para conectar ao Controlador.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from 'react';
import { Loader2, X, Wifi, AlertCircle, Check } from 'lucide-react';
import type { LocalSyncStatus } from '@infra/network/LocalSyncService';

interface Props {
  status: LocalSyncStatus;
  error: string | null;
  onConnect: (pin: string, ip?: string) => void;
  onStop: () => void;
  isWebEnvironment?: boolean;
}

export const LocalMirrorInput: React.FC<Props> = ({
  status,
  error,
  onConnect,
  onStop,
  isWebEnvironment = true,
}) => {
  const [pin, setPin] = useState(['', '', '', '']);
  const [ip, setIp] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  const isConnecting = status === 'connecting';
  const isConnected = status === 'connected';
  const isDisconnected = status === 'disconnected';

  const handlePinChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);

    // Avanca automaticamente para o proximo input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleConnect = () => {
    const pinStr = pin.join('');
    if (pinStr.length !== 4) return;
    onConnect(pinStr, isWebEnvironment ? undefined : ip);
  };

  const pinComplete = pin.every(d => d !== '');

  return (
    <div className="fixed inset-0 z-[99998] bg-[#0a0f1e]/95 backdrop-blur-xl flex flex-col items-center justify-between p-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="w-full flex items-center justify-between pt-2">
        <div>
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-0.5">Modo Lite • Espelho</div>
          <div className="text-white/50 text-xs">Recebendo placar do controlador</div>
        </div>
        <button
          onClick={onStop}
          id="btn-local-stop-mirror"
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all active:scale-90"
        >
          <X size={18} />
        </button>
      </div>

      {/* Conteudo */}
      <div className="flex flex-col items-center gap-6 flex-1 justify-center w-full max-w-xs">

        {/* Conectado */}
        {isConnected ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/40 flex items-center justify-center">
              <Check size={36} className="text-green-400" />
            </div>
            <div className="text-green-300 font-black text-xl">Conectado!</div>
            <div className="bg-green-500/10 rounded-2xl p-4 border border-green-500/20 text-center">
              <div className="flex items-center gap-2 justify-center">
                <Wifi size={16} className="text-green-400" />
                <p className="text-green-300 text-xs font-semibold">Espelhamento ativo</p>
              </div>
              <p className="text-gray-400 text-xs mt-1">O placar sera atualizado automaticamente</p>
            </div>
          </div>
        ) : (
          <>
            <div className="text-gray-300 text-sm font-semibold text-center">
              Digite o PIN exibido no <span className="text-cyan-400">Controlador</span>
            </div>

            {/* PIN Inputs */}
            <div className="flex gap-3">
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  id={`pin-input-${i}`}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={isConnecting}
                  className={`w-14 h-16 text-center text-3xl font-black rounded-2xl border-2 bg-white/5 outline-none transition-all duration-200 ${
                    digit
                      ? 'border-cyan-500/70 text-cyan-300 bg-cyan-500/10'
                      : 'border-white/20 text-white'
                  } focus:border-cyan-400 focus:bg-cyan-500/15`}
                />
              ))}
            </div>

            {/* IP (apenas em producao nativa) */}
            {!isWebEnvironment && (
              <div className="w-full">
                <label className="text-gray-400 text-xs font-semibold mb-1.5 block">
                  IP do Controlador <span className="text-gray-600">(ex: 192.168.44.1)</span>
                </label>
                <input
                  id="ip-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="192.168.44.1"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  disabled={isConnecting}
                  className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white text-sm outline-none focus:border-cyan-400 transition-all placeholder:text-gray-600"
                />
              </div>
            )}

            {/* Erros */}
            {(error || isDisconnected) && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 w-full">
                <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-xs">
                  {error || 'Conexao perdida. Tentando reconectar...'}
                </p>
              </div>
            )}

            {/* Botao Conectar */}
            <button
              id="btn-local-connect"
              onClick={handleConnect}
              disabled={!pinComplete || isConnecting || (!isWebEnvironment && !ip)}
              className="w-full py-4 rounded-2xl font-black text-sm tracking-wider transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                'Conectar ao Controlador'
              )}
            </button>

            {/* Nota */}
            <p className="text-gray-600 text-xs text-center leading-relaxed">
              {isWebEnvironment
                ? 'Para testar: abra outra aba com o app e escolha "Controlar Placar"'
                : 'Certifique-se de que a ancoragem Bluetooth esta ativa no celular controlador'}
            </p>
          </>
        )}
      </div>

      {/* Rodape */}
      <div className="w-full text-center">
        <span className="text-gray-600 text-xs">Sem internet necessaria</span>
      </div>
    </div>
  );
};
