// ─── src/modules/localSync/components/LocalMirrorInput.tsx ───────────────────
// Tela do Espelho: input do PIN para conectar ao Controlador.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, X, Eye, AlertCircle, Check, Copy } from 'lucide-react';
import QRCode from 'qrcode';
import type { LocalSyncStatus } from '@infra/network/LocalSyncService';

interface Props {
  status: LocalSyncStatus;
  error: string | null;
  logs?: string[];
  onConnect: (pin: string, ip?: string) => void;
  onStop: () => void;
  isWebEnvironment?: boolean;
  localIp?: string | null;
}

const LocalWebAppQr: React.FC<{ url: string }> = ({ url }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 170,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0f1e', light: '#ffffff' },
    });
  }, [url]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 mt-2">
      <canvas ref={canvasRef} className="rounded-xl bg-white p-2" aria-label={`QR Code para ${url}`} />
      <p className="text-gray-400 text-xs">Escaneie para abrir no relógio</p>
      <button
        type="button"
        onClick={copyUrl}
        className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 active:scale-95"
      >
        <Copy size={14} />
        {copied ? 'Endereço copiado!' : 'Copiar endereço completo'}
      </button>
    </div>
  );
};

export const LocalMirrorInput: React.FC<Props> = ({
  status,
  error,
  logs = [],
  onConnect,
  onStop,
  isWebEnvironment = true,
  localIp,
}) => {
  const [pin, setPin] = useState(['', '', '', '']);
  const [ip, setIp] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  // O servidor HTTP local pode estar sendo preparado antes do PIN ser digitado.
  // Só bloqueia os campos depois que o PIN estiver completo e a conexão começar.
  const isConnecting = status === 'connecting' && pin.every(d => d !== '');
  const isConnected = status === 'connected';
  const isWaiting = status === 'waiting_mirror';
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
    onConnect(pinStr, isWebEnvironment ? ip : undefined);
  };

  const pinComplete = pin.every(d => d !== '');

  return (
    <div className="fixed inset-0 z-[1000000] bg-[#0a0f1e]/95 backdrop-blur-xl flex flex-col items-center justify-between p-6 animate-in fade-in duration-300">
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
                {/* Eye + ondas = ícone do Espelho */}
                <div className="relative flex items-center justify-center w-14 h-7">
                  <svg width="32" height="20" viewBox="0 0 24 18" fill="none" className="absolute">
                    <path d="M4 4C2.5 6 2.5 12 4 14" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M20 4C21.5 6 21.5 12 20 14" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M7 6.5C6.5 7.5 6.5 10.5 7 11.5" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M17 6.5C17.5 7.5 17.5 10.5 17 11.5" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                  <Eye size={18} className="text-slate-400 relative z-10" strokeWidth={3} />
                </div>
                <p className="text-green-300 text-xs font-semibold">Espelhamento ativo</p>
              </div>
              <p className="text-gray-400 text-xs mt-1">O placar sera atualizado automaticamente</p>
            </div>
          </div>
        ) : isWaiting ? (
          <div className="flex flex-col items-center gap-5 text-center max-w-xs">
            <div className="w-20 h-20 rounded-full bg-cyan-500/10 border-2 border-cyan-500/40 flex items-center justify-center">
              <Loader2 size={36} className="text-cyan-300 animate-spin" />
            </div>
            <div className="text-cyan-200 font-black text-xl">Servidor local ativo</div>
            <div className="bg-cyan-500/10 rounded-2xl p-4 border border-cyan-500/20 text-center space-y-2">
              <p className="text-gray-300 text-sm">No relógio, abra este endereço para carregar o PWA local:</p>
              {localIp && <p className="text-white text-lg font-black font-mono break-all">http://{localIp}:8081</p>}
              {localIp && <p className="text-gray-400 text-xs font-mono">Sincronização: {localIp}:8080</p>}
              {localIp && <LocalWebAppQr url={`http://${localIp}:8081`} />}
              <p className="text-cyan-300 text-xs font-black tracking-widest">PIN {pin.join('')}</p>
              <p className="text-gray-300 text-sm">Aguardando conexão do relógio...</p>
            </div>
            {logs.length > 0 && (
              <div className="bg-black/60 rounded-xl p-3 w-full border border-cyan-500/20 text-sm font-mono text-cyan-200 space-y-1 text-left max-h-40 overflow-y-auto">
                <div className="text-cyan-400 font-bold uppercase tracking-wider">Log do servidor:</div>
                {logs.map((log, index) => <div key={`${log}-${index}`} className="break-words">• {log}</div>)}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-gray-200 text-lg font-semibold text-center">
              Digite o PIN exibido no <span className="text-cyan-400">Controlador</span>
            </div>

            {!isWebEnvironment && localIp && (
              <div className="w-full rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-center">
                <p className="text-gray-300 text-sm">No relógio, abra primeiro:</p>
                <p className="text-white text-base font-black font-mono break-all">http://{localIp}:8081</p>
                <p className="text-gray-400 text-xs mt-1">Depois escolha Controlar Placar e informe o PIN aqui.</p>
                <LocalWebAppQr url={`http://${localIp}:8081`} />
              </div>
            )}

            {/* PIN Inputs */}
            {isWebEnvironment && (
              <div className="w-full">
                <label htmlFor="local-mirror-ip" className="block text-gray-300 text-sm font-bold mb-2">
                  IP do celular servidor (opcional para duas abas)
                </label>
                <input
                  id="local-mirror-ip"
                  type="text"
                  inputMode="decimal"
                  value={ip}
                  onChange={(e) => setIp(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="Ex.: 192.168.1.25"
                  disabled={isConnecting}
                  className="w-full h-12 px-4 rounded-xl border-2 border-white/20 bg-white/5 text-white text-xl font-mono outline-none focus:border-cyan-400"
                />
              </div>
            )}

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

            {/* Erros */}
            {(error || isDisconnected) && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 w-full text-sm">
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
              disabled={!pinComplete || isConnecting}
              className="w-full py-4 rounded-2xl font-black text-sm tracking-wider transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 flex items-center justify-center gap-2"
            >
              {isConnecting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Conectando ao PIN {pin.join('')}...</span>
                </>
              ) : (
                'Conectar ao Controlador'
              )}
            </button>

            {/* Painel de Diagnóstico do Espelho */}
            {isConnecting && (
              <div className="bg-black/40 rounded-xl p-3 w-full border border-cyan-500/30 text-sm font-mono text-cyan-300 animate-pulse">
                <div>{ip ? `📡 Conectando a ws://${ip}:8080` : `📡 Buscando canal: myplacar-mirror-${pin.join('')}`}</div>
                <div>⏳ Aguardando confirmação do Controlador...</div>
              </div>
            )}

            {logs.length > 0 && (
              <div className="bg-black/60 rounded-xl p-3 w-full border border-cyan-500/20 text-[10px] font-mono text-cyan-200 space-y-1 text-left max-h-28 overflow-y-auto">
                <div className="text-cyan-400 font-bold uppercase tracking-wider">Log da conexão:</div>
                {logs.map((log, index) => <div key={`${log}-${index}`} className="break-words">• {log}</div>)}
              </div>
            )}

            {/* Nota */}
            <p className="text-gray-600 text-xs text-center leading-relaxed">
              {isWebEnvironment
                ? 'No celular servidor, informe o IP mostrado na tela dele. Deixe vazio apenas para testar em duas abas.'
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
