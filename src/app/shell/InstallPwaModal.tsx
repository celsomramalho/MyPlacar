import React, { useState, useEffect } from 'react';
import { Share, MoreVertical, PlusSquare, Smartphone, CheckCircle2, MonitorDown } from 'lucide-react';
import { Toggle } from '@shared/components/Toggle';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt?: any;
}

export const InstallPwaModal: React.FC<Props> = ({ isOpen, onClose, deferredPrompt }) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const userAgent = globalThis.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setActiveTab('ios');
    } else {
      setActiveTab('android');
    }
  }, []);

  const handleInstallClick = async () => {
    let finalDontShow = dontShowAgain;

    if (deferredPrompt && activeTab === 'android') {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        finalDontShow = true;
        setDontShowAgain(true);
      }
    }

    if (finalDontShow) {
      localStorage.setItem('myPlacarHideInstallPrompt', 'true');
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300 p-4">
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl animate-in slide-in-from-bottom-full duration-500 overflow-hidden pb-8">
        <div className="w-full flex flex-col items-center pt-3 pb-4">
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-6" />
          
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600 mb-4 shadow-inner">
            <Smartphone size={32} />
          </div>
          
          <h2 className="text-xl font-black text-black tracking-tight px-8 text-center">
            Instalar Myplacar pro
          </h2>
          <p className="text-sm font-bold text-gray-500 mt-2 px-10 text-center leading-tight">
            Para uma experiência mais rápida, estável e em tela cheia, adicione o app à sua tela inicial.
          </p>
        </div>

        <div className="px-8 space-y-5">
          <div className="flex bg-gray-100 p-1 rounded-2xl">
            <button 
              onClick={() => setActiveTab('android')}
              className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${activeTab === 'android' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400'}`}
            >
              Passo a passo para android
            </button>
            <button 
              onClick={() => setActiveTab('ios')}
              className={`flex-1 py-2 text-[10px] font-black rounded-xl transition-all ${activeTab === 'ios' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-400'}`}
            >
              Passo a passo para ios
            </button>
          </div>

          <div className="bg-gray-50 rounded-[2rem] p-6 border border-gray-100 space-y-5 min-h-[160px] flex flex-col justify-center">
            {activeTab === 'android' ? (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm text-gray-700">
                    <MoreVertical size={20} />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    1. Toque no ícone de <span className="font-black">menu</span> (três pontinhos) do Chrome.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm text-gray-700">
                    <MonitorDown size={20} />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    2. No menu apresentado localize a opção: <br/>
                    <span className="font-black">"Adicionar à tela inicial"</span>.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm overflow-hidden p-1.5">
                    <ScoreboardIcon className="w-full h-full" />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    3. Na próxima vez que entrar no Myplacar use o ícone criado na sua tela inicial.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm text-blue-500">
                    <Share size={20} />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    1. Toque no ícone de <span className="font-black">compartilhar</span> na barra inferior do Safari.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm text-gray-700">
                    <PlusSquare size={20} />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    2. Role a lista para baixo e selecione: <br/>
                    <span className="font-black">"Adicionar à tela de início"</span>.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm overflow-hidden p-1.5">
                    <ScoreboardIcon className="w-full h-full" />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">
                    3. Na próxima vez que entrar no Myplacar use o ícone criado na sua tela inicial.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-white border border-gray-100 px-6 py-1 rounded-2xl">
            <span className="text-[11px] font-black text-gray-400 tracking-tight">Não mostrar novamente</span>
            <Toggle id="hide-install-prompt" checked={dontShowAgain} onChange={setDontShowAgain} />
          </div>

          <button 
            onClick={handleInstallClick}
            className="w-full py-5 bg-brand-600 text-white rounded-3xl font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={20} /> Entendi, vou instalar!
          </button>
          
          <button 
            onClick={onClose}
            className="w-full py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
          >
            Agora não, obrigado
          </button>
        </div>
      </div>
    </div>
  );
};
