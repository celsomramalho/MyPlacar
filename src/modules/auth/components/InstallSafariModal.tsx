import React, { useState } from 'react';
import { Share, PlusSquare, Check, Copy, X, Compass, ExternalLink } from 'lucide-react';
import { copyToClipboard } from '@shared/utils/clipboard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isSafari: boolean;
  targetUrl?: string;
}

export const InstallSafariModal: React.FC<Props> = ({
  isOpen,
  onClose,
  isSafari,
  targetUrl = 'https://www.myplacar.app.br/',
}) => {
  const [copied, setCopied] = useState(true);

  if (!isOpen) return null;

  const handleCopyAgain = async () => {
    const success = await copyToClipboard(targetUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

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
          <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-3 shadow-inner">
            <Compass size={36} className="animate-spin-slow" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black mb-2">
            <Check size={14} /> Link copiado!
          </div>

          <h3 className="text-xl font-black text-slate-800 tracking-tight">
            Instalar MyPlacar no Safari
          </h3>
          <p className="text-xs font-bold text-slate-500 mt-1 max-w-xs">
            {isSafari 
              ? 'Você já está no Safari! Siga os passos rápidos abaixo para adicionar à sua tela inicial:'
              : 'Siga os passos abaixo no Safari para instalar e criar o atalho:'}
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {!isSafari && (
            <div className="flex items-start gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
                1
              </div>
              <div className="flex-1 text-xs">
                <p className="font-black text-slate-800">Abra o Safari e cole o link</p>
                <p className="text-slate-500 font-medium mt-0.5 leading-relaxed">
                  Abra o app <span className="font-bold text-slate-700">Safari</span> no seu dispositivo, cole o link copiado na barra de endereços e dê enter.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
              {!isSafari ? '2' : '1'}
            </div>
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-1.5 font-black text-slate-800">
                <span>Toque em Compartilhar</span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-blue-600">
                  <Share size={13} />
                </span>
              </div>
              <p className="text-slate-500 font-medium mt-0.5 leading-relaxed">
                Na barra inferior (ou superior no iPad) do Safari, toque no botão de compartilhar.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 font-black text-xs shadow-sm">
              {!isSafari ? '3' : '2'}
            </div>
            <div className="flex-1 text-xs">
              <div className="flex items-center gap-1.5 font-black text-slate-800">
                <span>Adicionar à Tela de Início</span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-200 text-slate-700">
                  <PlusSquare size={13} />
                </span>
              </div>
              <p className="text-slate-500 font-medium mt-0.5 leading-relaxed">
                Role o menu para baixo, selecione <span className="font-bold text-slate-700">"Adicionar à Tela de Início"</span> e confirme no topo em <span className="font-bold text-slate-700">"Adicionar"</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handleCopyAgain}
            className="w-full py-3 px-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors active:scale-98"
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            {copied ? 'Link copiado novamente!' : 'Copiar link https://www.myplacar.app.br/'}
          </button>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black text-sm shadow-md shadow-sky-600/20 active:scale-98 transition-all"
          >
            Entendi, vou instalar
          </button>
        </div>
      </div>
    </div>
  );
};
