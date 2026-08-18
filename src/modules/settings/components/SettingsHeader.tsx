
import React, { useMemo } from 'react';
import { Play, User, X, Clock, Trash2, Share2, Check, Bell, Menu, LogOut, Users } from 'lucide-react';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';
import { LiveIndicator } from '@modules/live';
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
            onClick={onOpenMenu}
            className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center justify-center gap-2 flex-1">
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
          {onOpenCommunications ? (
            <button
              type="button"
              onClick={onOpenCommunications}
              className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all relative"
              title="Comunicados e avisos"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      ) : (
        <>
          <div className="w-16 flex items-center justify-start gap-1">
            <button 
              onClick={onOpenMenu}
              className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
            >
              <Menu size={20} />
            </button>
            {isMirroringActive && <LiveIndicator onClick={onOpenLiveControl} role={role} />}
          </div>
          <div className="flex items-center justify-center gap-2 flex-1">
            <div className={`p-1.5 rounded-full transition-colors duration-500 relative ${isHistory ? 'bg-emerald-500 shadow-lg' : (isSettingsInicialSaved ? 'bg-sky-600 shadow-sky-100 shadow-lg' : 'bg-amber-500 shadow-amber-100 shadow-lg')}`}>
              {isHistory ? <Clock size={20} className="text-white" /> : <Users size={20} className="text-white" />}
              {!isHistory && isSettingsInicialSaved && isLiveActive && (
                <div className="absolute -top-1 -right-1 bg-white text-sky-600 rounded-full p-0.5 shadow-sm border border-sky-100 animate-in zoom-in">
                  <Check size={8} strokeWidth={4} />
                </div>
              )}
            </div>
            <h1 className="text-lg font-bold text-black tracking-tight">
              {isHistory ? 'Histórico' : 'Nova partida'}
            </h1>
          </div>
          {onOpenCommunications ? (
            <button
              type="button"
              onClick={onOpenCommunications}
              className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all relative"
              title="Comunicados e avisos"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>
          ) : (
            <div className="w-10" />
          )}
        </>
      )}
    </header>
  );
};
