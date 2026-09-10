import React from 'react';
import { MoreVertical, Smartphone, PlusSquare, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAndroidModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-300 border border-slate-100 flex flex-col relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 shadow-inner">
            <Smartphone size={36} />
          </div>

          <h3 className="text-xl font-black text-slate-800 tracking-tight">
            Instalar MyPlacar no Android
          </h3>
          <p className="text-xs font-bold text-slate-500 mt-1 max-w-xs">
            Para criar o atalho e instalar no seu celular, siga os passos abaixo no navegador:
          </p>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
              1
            </div>
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-1.5 font-black text-slate-800">
                <span>Menu do Navegador</span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 text-slate-700">
                  <MoreVertical size={13} />
                </span>
              </div>
              <p className="text-slate-500 font-medium mt-0.5 leading-relaxed">
                Toque no ícone de <span className="font-bold text-slate-700">três pontinhos (⋮)</span> no canto superior direito do navegador Chrome.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
              2
            </div>
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-1.5 font-black text-slate-800">
                <span>Instalar ou Adicionar</span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-100 text-emerald-700">
                  <PlusSquare size={13} />
                </span>
              </div>
              <p className="text-slate-500 font-medium mt-0.5 leading-relaxed">
                No menu, selecione <span className="font-bold text-slate-700">"Instalar aplicativo"</span> ou <span className="font-bold text-slate-700">"Adicionar à tela inicial"</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-600/20 active:scale-98 transition-all"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};
