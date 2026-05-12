import React, { useState } from 'react';
import { Crown, Eye, RefreshCw, Trash2, UserCheck, X } from 'lucide-react';
import { LiveIndicator } from '../../../components/LiveIndicator.tsx';
import { useLive } from '../useLive.ts';
import type { GameState } from '../../../types.ts';

// ─── Props ────────────────────────────────────────────────────────────────────
// Os handlers de lógica permanecem no App.tsx (serão migrados na Fase 7).
// O componente lê papéis/permissões diretamente do LiveContext via useLive().
interface Props {
  gameState: GameState | null;
  onClose: () => void;
  onControlLive: () => void;
  onSyncScoreboard: () => void;
  onCloseCloudLive: () => void;
  onDeleteJudge: () => void;
  /** Abre o painel já na confirmação de remoção de juiz (disparado pelo botão externo em NavigationDrawer) */
  initialConfirmDeleteJudge?: boolean;
}

export const LiveControlOverlay: React.FC<Props> = ({
  gameState,
  onClose,
  onControlLive,
  onSyncScoreboard,
  onCloseCloudLive,
  onDeleteJudge,
  initialConfirmDeleteJudge = false,
}) => {
  const {
    indicatorRole,
    isCurrentController,
    isOriginalOwner,
    livePapel,
    liveStatus,
    isJudgeOnline,
  } = useLive();

  // Estados internos de confirmação — vivem aqui, não no App.tsx
  const [confirmDeleteLive, setConfirmDeleteLive] = useState(false);
  const [confirmDeleteJudge, setConfirmDeleteJudge] = useState(initialConfirmDeleteJudge);

  const handleClose = () => {
    setConfirmDeleteLive(false);
    setConfirmDeleteJudge(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100005] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white/90 backdrop-blur-2xl rounded-[3rem] p-8 w-full max-sm shadow-2xl border border-white/50 flex flex-col items-center gap-6 animate-in zoom-in duration-300 relative">
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 p-2 text-black hover:bg-gray-100 rounded-full transition-colors active:scale-90"
        >
          <X size={28} strokeWidth={3} />
        </button>
        <LiveIndicator variant="card" className="scale-125 mb-2" role={indicatorRole} />

        {!confirmDeleteLive && !confirmDeleteJudge ? (
          <>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-black tracking-tight leading-tight">
                {isCurrentController ? 'Você está no controle' : 'Live em andamento'}
              </h3>
              <p className="text-xs font-bold text-slate-500">
                {livePapel === 'owner' ? 'Proprietário da live' : livePapel === 'judge' ? 'Juiz convidado' : 'Observador'}
                {liveStatus === 'controller' ? ' · Controlando' : ' · Assistindo'}
              </p>
            </div>

            <div className="flex flex-col w-full gap-3">

              {/* ── Sua participação ─────────────────────────────────── */}
              {/* A2: R2 — qualquer participante pode assumir o controle */}
              {!isCurrentController && (
                <button
                  onClick={onControlLive}
                  className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black text-base shadow-xl shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  {livePapel === 'owner' ? <Crown size={24} /> : livePapel === 'judge' ? <UserCheck size={24} /> : <Eye size={24} />} Controlar
                </button>
              )}

              {/* ── Sincronizar Placar ── */}
              <button
                onClick={onSyncScoreboard}
                className="w-full py-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl font-black text-sm active:scale-95 flex items-center justify-center gap-2 transition-all hover:bg-emerald-100"
              >
                <RefreshCw size={18} /> Sincronizar Placar
              </button>

              {/* ── Gestão (só proprietário) ─────────────────────────── */}
              {livePapel === 'owner' && (
                <div className="w-full mt-2 pt-4 border-t border-gray-100 space-y-3">
                  <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase px-1">Proprietário</p>

                  {/* Juiz */}
                  {!!(gameState?.judge?.pin || gameState?.judgePin) && (
                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-black">Juiz</span>
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black ${isJudgeOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                          <div className={`w-1 h-1 rounded-full ${isJudgeOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                          {isJudgeOnline ? 'Online' : 'Offline'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Encerrar (owner controlando OU controller ativo) — R11 ── */}
              {(livePapel === 'owner' && isCurrentController) || (!isOriginalOwner && isCurrentController) ? (
                <button
                  onClick={() => setConfirmDeleteLive(true)}
                  className="w-full py-4 text-red-500 font-black text-xs active:scale-95 flex items-center justify-center gap-2 mt-1"
                >
                  <Trash2 size={16} /> Encerrar transmissão
                </button>
              ) : null}

            </div>
          </>
        ) : confirmDeleteLive ? (
          <>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-red-500 tracking-tight leading-tight">Encerrar a live?</h3>
              <p className="text-xs font-bold text-slate-500">Todos os participantes perderão a conexão.</p>
            </div>
            <div className="flex flex-col w-full gap-3">
              <button onClick={onCloseCloudLive} className="w-full py-5 bg-red-600 text-white rounded-3xl font-black text-base shadow-xl shadow-red-200 active:scale-95 transition-all">Confirmar encerramento</button>
              <button onClick={() => setConfirmDeleteLive(false)} className="w-full py-4 text-slate-400 font-bold text-xs tracking-widest">Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-red-500 tracking-tight leading-tight">Remover juiz?</h3>
              <p className="text-xs font-bold text-slate-500">O juiz perderá o acesso de controle à partida.</p>
            </div>
            <div className="flex flex-col w-full gap-3">
              <button onClick={onDeleteJudge} className="w-full py-5 bg-red-600 text-white rounded-3xl font-black text-base shadow-xl shadow-red-200 active:scale-95 transition-all">Confirmar remoção</button>
              <button onClick={() => setConfirmDeleteJudge(false)} className="w-full py-4 text-slate-400 font-bold text-xs tracking-widest">Cancelar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
