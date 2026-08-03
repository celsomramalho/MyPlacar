import React from 'react';
import { AlertCircle, RotateCw, Wifi, X, Loader2, ArrowLeftRight } from 'lucide-react';

interface GlobalOverlaysProps {
  isWaitingSync: boolean;
  setIsWaitingSync: (v: boolean) => void;
  isServiceInterrupted: boolean;
  newAppUrl: string;
  isUpdatingVersion: boolean;
  activeCloudMatch: { id: string; sport: string } | null;
  handleConnectRemote: () => void;
  handleRejectRemote: () => void;
}

export function GlobalOverlays({
  isWaitingSync,
  setIsWaitingSync,
  isServiceInterrupted,
  newAppUrl,
  isUpdatingVersion,
  activeCloudMatch,
  handleConnectRemote,
  handleRejectRemote,
}: GlobalOverlaysProps): React.ReactElement | null {
  return (
    <>
      {isWaitingSync && (
        <div className="fixed inset-0 z-[100002] bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
          <Loader2 className="text-blue-600 animate-spin mb-6" size={48} />
          <h2 className="text-2xl font-black text-black tracking-tight">Sincronizando com a nuvem...</h2>
          <p className="text-slate-500 font-bold mt-2 mb-10">Aguardando dados da partida ao vivo</p>
          <button onClick={() => setIsWaitingSync(false)} className="px-8 py-4 bg-gray-100 text-black rounded-2xl font-black text-xs tracking-widest active:scale-95 transition-all shadow-sm border border-gray-100">Cancelar sincronismo</button>
        </div>
      )}

      {isServiceInterrupted && (
        <div className="fixed inset-0 z-[200000] bg-slate-900 flex items-center justify-center p-6 text-center">
          <div className="bg-white rounded-[3rem] p-10 w-full max-md shadow-2xl space-y-8 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto shadow-inner">
              <AlertCircle size={48} />
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Versão descontinuada</h2>
              <p className="text-sm font-bold text-slate-500 leading-relaxed">Esta versão do aplicativo não é mais suportada. Por favor, utilize o novo endereço oficial para continuar usando o My placar.</p>
            </div>
            <div className="pt-4">
              <button
                onClick={() => globalThis.location.href = newAppUrl}
                className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-base shadow-xl shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Acessar novo endereço <ArrowLeftRight size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCloudMatch && (
        <div className="fixed top-20 left-4 right-4 z-[999] bg-blue-600 text-white rounded-[2rem] p-5 shadow-2xl animate-in slide-in-from-top-10 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Wifi size={24} className="animate-pulse text-blue-200" />
            <div className="flex-1">
              <h4 className="font-black text-sm">Partida ao vivo disponível!</h4>
              <p className="text-xs font-bold text-blue-100">Deseja sincronizar com a partida {activeCloudMatch.sport}?</p>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleRejectRemote} className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-black text-xs transition-colors">Ignorar</button>
            <button onClick={handleConnectRemote} className="flex-1 py-3 bg-white text-blue-600 rounded-xl font-black text-xs shadow-md transition-all active:scale-95">Sincronizar</button>
          </div>
        </div>
      )}

      {isUpdatingVersion && (
        <div className="fixed inset-0 z-[20000] bg-blue-600 flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
          <RotateCw className="text-white animate-spin mb-8" size={48} />
          <h2 className="text-3xl font-black text-white mb-4">Atualizando sistema</h2>
          <p className="text-blue-100 font-bold text-lg">Sincronizando nova versão...</p>
        </div>
      )}
    </>
  );
}
