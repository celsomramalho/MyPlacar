// ─── src/modules/localSync/components/LocalPairingModal.tsx ──────────────────
// Modal de escolha de papel: Controlador ou Espelho.
// Ponto de entrada para o modo Lite Offline.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { MonitorSmartphone, Watch, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChooseController: () => void;
  onChooseMirror: () => void;
}

export const LocalPairingModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onChooseController,
  onChooseMirror,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-xl flex items-end justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-[#0f172a] rounded-3xl w-full max-w-sm shadow-2xl border border-white/10 overflow-hidden animate-in slide-in-from-bottom duration-400">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-white font-black text-xl tracking-tight">Espelhar Placar</h2>
            <p className="text-gray-400 text-xs mt-0.5">Modo Lite • Offline • Sem internet</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
          >
            <X size={20} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5 mx-6" />

        {/* Opcoes */}
        <div className="p-6 flex flex-col gap-3">
          {/* Controlador */}
          <button
            id="btn-local-controller"
            onClick={onChooseController}
            className="group flex items-center gap-4 w-full p-4 rounded-2xl border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 active:scale-[0.98] transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <MonitorSmartphone size={24} className="text-orange-400" />
            </div>
            <div className="text-left">
              <div className="text-white font-black text-sm">Controlar Placar</div>
              <div className="text-gray-400 text-xs mt-0.5">Gera um PIN e transmite o placar</div>
            </div>
          </button>

          {/* Espelho */}
          <button
            id="btn-local-mirror"
            onClick={onChooseMirror}
            className="group flex items-center gap-4 w-full p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 active:scale-[0.98] transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <Watch size={24} className="text-cyan-400" />
            </div>
            <div className="text-left">
              <div className="text-white font-black text-sm">Espelhar Placar</div>
              <div className="text-gray-400 text-xs mt-0.5">Digita o PIN e recebe o placar</div>
            </div>
          </button>
        </div>

        {/* Nota de rodape */}
        <div className="px-6 pb-6">
          <p className="text-gray-600 text-xs text-center leading-relaxed">
            Ambos os dispositivos precisam estar na mesma rede local (ancoragem Bluetooth ou Wi-Fi)
          </p>
        </div>
      </div>
    </div>
  );
};
