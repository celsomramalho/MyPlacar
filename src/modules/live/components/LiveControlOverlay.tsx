import React, { useState } from 'react';
import { Crown, Eye, RefreshCw, Trash2, UserCheck, X, Gamepad2, Smartphone, Tablet, Laptop, Watch } from 'lucide-react';
import { LiveIndicator } from './LiveIndicator.tsx';
import { useLive } from '../useLive.ts';
import type { GameState } from '../../../types.ts';

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
  } = useLive();

  // Estados internos de confirmação — vivem aqui, não no App.tsx
  const [confirmDeleteLive, setConfirmDeleteLive] = useState(false);
  const [confirmDeleteJudge, setConfirmDeleteJudge] = useState(initialConfirmDeleteJudge);

  const handleClose = () => {
    setConfirmDeleteLive(false);
    setConfirmDeleteJudge(false);
    onClose();
  };

  // Filtra dispositivos ativos (vistos nos últimos 60s)
  const activeDevices = Object.entries(gameState?.controllers || {})
    .map(([id, c]) => ({ id, ...c }))
    .filter(c => c.lastSeen && (Date.now() - c.lastSeen < 60000))
    .sort((a, b) => {
      // Ordenação: Owner primeiro, Juiz em segundo, Observadores por último
      const roleOrder = { owner: 0, judge: 1, observer: 2 };
      const orderA = roleOrder[a.role || 'observer'];
      const orderB = roleOrder[b.role || 'observer'];
      if (orderA !== orderB) return orderA - orderB;
      return (a.nickname || a.label).localeCompare(b.nickname || b.label);
    });

  const renderDeviceIcon = (deviceType?: 'watch' | 'phone' | 'tablet' | 'laptop') => {
    switch (deviceType) {
      case 'watch':
        return <Watch size={16} />;
      case 'tablet':
        return <Tablet size={16} />;
      case 'laptop':
        return <Laptop size={16} />;
      case 'phone':
      default:
        return <Smartphone size={16} />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100005] flex items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-[#1e293b] border border-slate-800 rounded-[2.5rem] p-6 w-full max-w-md shadow-2xl flex flex-col gap-5 animate-in zoom-in duration-300 relative text-white overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <LiveIndicator variant="header" className="scale-90 pointer-events-none" role={indicatorRole} />
            <h3 className="text-lg font-black tracking-tight text-white">
              Painel da Live
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all active:scale-90"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {!confirmDeleteLive && !confirmDeleteJudge ? (
          <>
            {/* Status do Dispositivo Local */}
            <div className="text-center bg-slate-850/50 border border-slate-800 p-4 rounded-2xl space-y-1.5">
              <h4 className="text-base font-black tracking-tight leading-tight">
                {isCurrentController ? 'Você está no controle' : 'Transmissão ativa'}
              </h4>
              <p className="text-xs font-bold text-slate-400">
                Seu papel: <span className="text-[#7dd3fc]">{livePapel === 'owner' ? 'Proprietário' : livePapel === 'judge' ? 'Juiz convidado' : 'Espectador'}</span>
                {liveStatus === 'controller' ? ' · Controlando' : ' · Assistindo'}
              </p>
            </div>

            {/* Ações Rápidas */}
            <div className="flex flex-col w-full gap-3">
              {/* Botão de Assumir Controle (qualquer um pode pedir controle a qualquer momento) */}
              {!isCurrentController && (
                <button
                  onClick={onControlLive}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-900/30 active:scale-95 transition-all flex items-center justify-center gap-2.5"
                >
                  {livePapel === 'owner' ? (
                    <Crown size={18} className="fill-white/10" />
                  ) : livePapel === 'judge' ? (
                    <UserCheck size={18} />
                  ) : (
                    <Eye size={18} />
                  )} 
                  Pedir Controle da Partida
                </button>
              )}
            </div>

            {/* Lista de Dispositivos Conectados */}
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto max-h-[260px] pr-1">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                Dispositivos conectados ({activeDevices.length})
              </span>
              
              <div className="flex flex-col gap-2">
                {activeDevices.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs font-bold bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl">
                    Nenhum dispositivo conectado
                  </div>
                ) : (
                  activeDevices.map(device => (
                    <div key={device.id} className="flex items-center justify-between p-3 bg-slate-900/30 hover:bg-slate-900/50 border border-slate-800 rounded-xl transition-all duration-200">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-850 flex items-center justify-center text-slate-400 border border-slate-700/50">
                          {renderDeviceIcon(device.deviceType)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-black tracking-tight text-white leading-snug">
                            {device.nickname || device.label.split(' (')[0]}
                          </span>
                          <span className="text-[9px] font-bold text-slate-500 leading-none">
                            {device.label.includes('(') ? device.label.substring(device.label.indexOf('(') + 1, device.label.length - 1) : device.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Badges de Role */}
                        {device.role === 'owner' && (
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400" title="Proprietário">
                            <Crown size={12} className="fill-amber-400/20" />
                          </div>
                        )}
                        {device.role === 'judge' && (
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400" title="Juiz Convidado">
                            <UserCheck size={12} />
                          </div>
                        )}

                        {/* Status Icon */}
                        {device.status === 'controller' ? (
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" title="Controlando">
                            <Gamepad2 size={12} className="animate-pulse" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 border border-slate-800 text-slate-500" title="Observando">
                            <Eye size={12} />
                          </div>
                        )}

                        {/* Botão de Remover Juiz (visível apenas para o Owner) */}
                        {device.role === 'judge' && livePapel === 'owner' && (
                          <button
                            onClick={() => setConfirmDeleteJudge(true)}
                            className="flex items-center justify-center w-6 h-6 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-colors ml-1"
                            title="Remover Juiz"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Rodapé e Ações Secundárias */}
            <div className="flex flex-col gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={onSyncScoreboard}
                className="w-full py-4 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-yellow-950/10"
              >
                <RefreshCw size={18} /> Sincronizar Placar
              </button>

              {/* Encerrar Transmissão (apenas se for Owner ou o Controller ativo) */}
              {((livePapel === 'owner' && isCurrentController) || (!isOriginalOwner && isCurrentController)) && (
                <button
                  onClick={() => setConfirmDeleteLive(true)}
                  className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-white rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-red-950/10 mt-1"
                >
                  <Trash2 size={18} /> Encerrar transmissão
                </button>
              )}
            </div>
          </>
        ) : confirmDeleteLive ? (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black text-red-500">Encerrar a live?</h4>
              <p className="text-xs font-bold text-slate-400">Todos os participantes conectados perderão a conexão e serão desconectados.</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={onCloseCloudLive} 
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-red-900/30 active:scale-95 transition-all"
              >
                Confirmar encerramento
              </button>
              <button 
                onClick={() => setConfirmDeleteLive(false)} 
                className="w-full py-3 text-slate-400 hover:text-white font-bold text-xs tracking-wider uppercase transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-black text-red-500">Remover Juiz?</h4>
              <p className="text-xs font-bold text-slate-400">O juiz convidado perderá a permissão de controle e o acesso privilegiado à live.</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={() => { onDeleteJudge(); setConfirmDeleteJudge(false); }} 
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-red-900/30 active:scale-95 transition-all"
              >
                Confirmar remoção
              </button>
              <button 
                onClick={() => setConfirmDeleteJudge(false)} 
                className="w-full py-3 text-slate-400 hover:text-white font-bold text-xs tracking-wider uppercase transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
