// ─── src/modules/localSync/components/LocalControllerView.tsx ────────────────
// Tela do Controlador: exibe PIN gerado e status de conexao com o Espelho.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { X, Loader2, Check, Gamepad2, Wifi } from 'lucide-react';
import type { LocalSyncStatus } from '@infra/network/LocalSyncService';

interface Props {
  pin: string;
  status: LocalSyncStatus;
  error?: string | null;
  logs?: string[];
  onStop: () => void;
  onConnectToPhone?: (ip: string) => void;
  phoneIp?: string | null;
}

export const LocalControllerView: React.FC<Props> = ({ pin, status, error, logs = [], onStop, onConnectToPhone, phoneIp }) => {
  const [ip, setIp] = useState(() => {
    if (phoneIp) return phoneIp;
    try { return localStorage.getItem('myplacar_last_phone_ip') || ''; } catch { return ''; }
  });
  const isWaiting = status === 'waiting_mirror' || status === 'error' || status === 'disconnected';
  const isConnected = status === 'connected';

  // Ícone central igual ao LiveIndicator (Gamepad2 = controlador)
  const RoleIcon = () => (
    <div className="relative flex items-center justify-center w-14 h-7">
      {/* Ondas de sinal azul */}
      <svg width="32" height="20" viewBox="0 0 24 18" fill="none" className="absolute">
        <path d="M4 4C2.5 6 2.5 12 4 14" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M20 4C21.5 6 21.5 12 20 14" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M7 6.5C6.5 7.5 6.5 10.5 7 11.5" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M17 6.5C17.5 7.5 17.5 10.5 17 11.5" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      <Gamepad2 size={18} className="text-orange-500 relative z-10" strokeWidth={2.5} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[1000000] bg-[#0a0f1e]/95 backdrop-blur-xl flex flex-col items-center overflow-hidden p-6 animate-in fade-in duration-300">
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

      <div className="w-full flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col items-center gap-4 py-2">
        {isWaiting && onConnectToPhone && (
          <div className="w-full max-w-xs space-y-2">
            <label className="block text-gray-300 text-sm font-semibold text-center">
              IP do celular espelho (sem porta)
            </label>
            <input
              value={ip}
              onChange={event => setIp(event.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Ex: 192.168.44.1"
              type="text"
              inputMode="decimal"
              pattern="[0-9.]*"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white text-xl outline-none focus:border-cyan-400 transition-all placeholder:text-gray-600 font-mono"
            />
            <p className="text-[10px] text-gray-500 text-center">A porta :8080 será adicionada automaticamente</p>
            <button
              onClick={() => {
                try { localStorage.setItem('myplacar_last_phone_ip', ip.trim()); } catch { /* best effort */ }
                onConnectToPhone(ip);
              }}
              disabled={!ip.trim()}
              className="w-full py-3 rounded-xl bg-cyan-600 text-white font-black text-sm disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Wifi size={16} /> Conectar ao celular
            </button>
            {logs.length > 0 && (
              <div className="bg-black/60 rounded-xl p-3 w-full border border-cyan-500/20 text-[10px] font-mono text-cyan-200 space-y-1 text-left max-h-28 overflow-y-auto">
                <div className="text-cyan-400 font-bold uppercase tracking-wider">Log da conexão:</div>
                {logs.map((log, index) => <div key={`${log}-${index}`} className="break-words">• {log}</div>)}
              </div>
            )}
          </div>
        )}

        {/* PIN Display */}
      <div className="flex flex-col items-center gap-6 w-full">
        <div className="text-gray-300 text-lg font-semibold uppercase tracking-widest">PIN de Pareamento</div>

        {/* PIN compacto e legível no relógio */}
        <div className="relative">
          <div className="absolute -inset-4 bg-orange-500/10 rounded-3xl blur-xl" />
          <div className={`relative px-5 py-2 rounded-2xl border-2 font-black text-4xl tracking-[0.25em] text-center transition-all duration-300 ${
            isConnected
              ? 'border-green-500/60 bg-green-500/10 text-green-300'
              : 'border-orange-500/50 bg-orange-500/10 text-orange-300'
          }`}>
            {pin}
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

        {error && (
          <div className="w-full max-w-xs rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-300">
            {error}
          </div>
        )}

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
              <RoleIcon />
              <p className="text-green-300 text-xs font-semibold">
                Sincronismo ativo — continue jogando normalmente
              </p>
            </div>
          </div>
        )}
        {/* Painel de Diagnóstico com Instrução de IP */}
        <div className="bg-black/40 rounded-xl p-3 w-full max-w-xs border border-white/10 text-[10px] font-mono text-gray-400 space-y-1">
          <div className="text-orange-400 font-bold uppercase tracking-wider">Status do Rádio Local:</div>
          <div>• PIN: <span className="text-white font-bold">{pin}</span></div>
          <div>• Canal: myplacar-mirror-{pin}</div>
          <div className="text-gray-300 pt-1 border-t border-white/10 mt-1">
            💡 <span className="text-white font-bold">Conectando 2 Aparelhos Diferentes?</span>
          </div>
          <div className="text-gray-400 leading-normal">
            No dispositivo Espelho, digite o PIN e também o <span className="text-cyan-300 font-bold">IP local deste celular</span> (ex: no Wi-Fi ou Hotspot).
          </div>
        </div>
      </div>
      </div>

    </div>
  );
};
