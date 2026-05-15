
import React, { useMemo } from 'react';
import { Play, User, X, Clock, Trash2, Share2, Check, Bell, Menu, LogOut } from 'lucide-react';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';
import { LiveIndicator } from '../../../components/LiveIndicator';
import { isWatchDevice } from '@shared/utils/device';

interface Props {
  isSelectionMode: boolean;
  selectedCount: number;
  activeTab: string;
  onStart: () => void;
  onDeleteSelected?: () => void;
  onClearSelection?: () => void;
  isSettingsInicialSaved: boolean;
  isProfileSaved?: boolean;
  canStartMatch: boolean;
  onShareSelected?: () => void;
  isMirroringActive?: boolean;
  onOpenLiveControl?: () => void;
  role?: 'owner' | 'judge' | 'observer' | 'spectator';
  onOpenCommunications?: () => void;
  unreadCount?: number;
  onOpenMenu?: () => void;
  isOfflineMode?: boolean;
  onExitOffline?: () => void;
}

export const SettingsHeader: React.FC<Props> = ({ 
  isSelectionMode, 
  selectedCount, 
  activeTab, 
  onStart, 
  onDeleteSelected, 
  onClearSelection,
  isSettingsInicialSaved,
  isProfileSaved = true,
  canStartMatch,
  onShareSelected,
  isMirroringActive,
  onOpenLiveControl,
  role,
  onOpenCommunications,
  unreadCount = 0,
  onOpenMenu,
  isOfflineMode = false,
  onExitOffline,
}) => {
  const isHistory = activeTab === 'history';
  const isProfile = activeTab === 'profile';

  const isLiveActive = useMemo(() => {
    return !!isMirroringActive;
  }, [isMirroringActive]);

  if (isSelectionMode) {
    return (
      <header className="px-6 py-5 flex items-center justify-between bg-sky-600 text-white sticky top-0 z-40 shadow-lg animate-in slide-in-from-top">
        <div className="flex items-center gap-4">
          <button onClick={onClearSelection} className="p-2 -ml-2 active:scale-90 transition-transform"><X size={24} /></button>
          <h1 className="text-lg font-bold">{selectedCount} selecionadas</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onShareSelected} className="p-2 active:scale-90 transition-transform">
            <Share2 size={22} />
          </button>
          <button onClick={onDeleteSelected} className="p-2 active:scale-90 transition-transform text-red-500">
            <Trash2 size={22} />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="px-6 py-5 flex items-center justify-between border-b border-gray-100 bg-white sticky top-0 z-40 shadow-sm min-h-[72px]">
      {isProfile ? (
        <div className="flex items-center justify-between w-full">
          <button 
            onClick={onOpenCommunications}
            className="p-2 -ml-2 text-slate-400 hover:text-brand-600 transition-colors relative"
          >
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="flex items-center justify-center gap-2 flex-1">
            {/* MC1: Círculo de status dinâmico para o perfil */}
            <div className={`p-1.5 rounded-full shadow-lg transition-colors duration-500 relative ${isProfileSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              <User size={22} className="text-white stroke-[2.5]" />
              {isProfileSaved && isLiveActive && (
                <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                  <Check size={8} strokeWidth={4} />
                </div>
              )}
            </div>
            <h1 className="text-lg font-bold text-black tracking-tight">Meu perfil</h1>
          </div>
          {isWatchDevice() ? (
            <button
              onClick={onStart}
              disabled={!canStartMatch}
              className={`p-2 -mr-2 active:scale-90 transition-all ${canStartMatch ? 'text-green-500' : 'text-slate-300 opacity-50 cursor-not-allowed'}`}
            >
              <Play size={30} fill="currentColor" />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      ) : (
        <>
          <div className={`${isWatchDevice() ? 'w-24' : 'w-16'} flex items-center justify-start gap-1`}>
            <button 
              onClick={onOpenCommunications}
              className="p-2 -ml-2 text-slate-400 hover:text-brand-600 transition-colors relative"
            >
              <Bell size={24} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {isWatchDevice() && (
              <button
                onClick={onOpenMenu}
                className="p-2 text-slate-400 hover:text-brand-600 transition-colors active:scale-90"
              >
                <Menu size={22} />
              </button>
            )}
            {isMirroringActive && <LiveIndicator onClick={onOpenLiveControl} role={role} />}
          </div>
          <div className="flex items-center justify-center gap-2 flex-1">
            <div className={`p-1.5 rounded-full transition-colors duration-500 relative ${isHistory ? 'bg-emerald-500 shadow-lg' : (isSettingsInicialSaved ? 'bg-emerald-500 shadow-emerald-100 shadow-lg' : 'bg-amber-500 shadow-amber-100 shadow-lg')}`}>
              {isHistory ? <Clock size={20} className="text-white" /> : <ScoreboardIcon className="w-6 h-6" />}
              {!isHistory && isSettingsInicialSaved && isLiveActive && (
                <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                  <Check size={8} strokeWidth={4} />
                </div>
              )}
            </div>
            <h1 className="text-lg font-bold text-black tracking-tight">
              {isHistory ? 'Histórico' : 'Nova partida'}
            </h1>
          </div>
          {isWatchDevice() && isOfflineMode ? (
            <button
              onClick={onExitOffline}
              className="p-2 -mr-2 active:scale-90 transition-all text-red-500"
            >
              <LogOut size={26} />
            </button>
          ) : (
            <button 
              onClick={onStart} 
              disabled={!canStartMatch}
              className={`p-2 -mr-2 active:scale-90 transition-all ${canStartMatch ? 'text-green-500' : 'text-slate-300 opacity-50 cursor-not-allowed'}`}
            >
              <Play size={30} fill="currentColor" />
            </button>
          )}
        </>
      )}
    </header>
  );
};
