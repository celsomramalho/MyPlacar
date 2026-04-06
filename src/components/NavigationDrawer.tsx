
import React from 'react';
import { 
  X, Home, Trophy, Users, Bell, History, User, Settings, ShieldAlert, LogOut, Play, Menu, HelpCircle, User as UserIcon, Clock, Settings as SettingsIcon, MapPin, Ticket, Send, LayoutGrid
} from 'lucide-react';
import { UserProfile, Screen } from '../types.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  currentScreen: Screen;
  currentTab?: string;
  onNavigate: (screen: Screen, tab?: string) => void;
  onLogout: () => void;
  isAdmin: boolean;
  canStartMatch: boolean;
}

export const NavigationDrawer: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  userProfile, 
  currentScreen, 
  currentTab,
  onNavigate, 
  onLogout,
  isAdmin,
  canStartMatch
}) => {
  if (!isOpen) return null;

  const menuGroups = [
    {
      id: 1,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      items: [
        { id: 'home', label: 'Início', icon: Home, screen: 'settings' as Screen, tab: 'config' },
        { id: 'partners', label: 'Meus parceiros', icon: Users, screen: 'partners' as Screen },
        { id: 'tournaments', label: 'Meus eventos', icon: Trophy, screen: 'tournaments' as Screen },
      ]
    },
    {
      id: 2,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      items: [
        { id: 'rules', label: 'Regras e configurações', icon: Settings, screen: 'new-game' as Screen },
      ]
    },
    {
      id: 3,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      items: [
        { id: 'scoreboard', label: 'Placar', icon: Play, screen: 'scoreboard' as Screen },
      ]
    },
    {
      id: 4,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      items: [
        { id: 'history', label: 'Meus históricos', icon: History, screen: 'settings' as Screen, tab: 'history' },
        { id: 'location', label: 'Minha localidades', icon: MapPin, screen: 'location' as Screen },
      ]
    },
    {
      id: 5,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      items: [
        { id: 'profile', label: 'Meu perfil', icon: User, screen: 'settings' as Screen, tab: 'profile' },
      ]
    },
    {
      id: 6,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      items: [
        { id: 'communications', label: 'Comunicados e avisos', icon: Bell, screen: 'communications' as Screen },
      ]
    },
    {
      id: 7,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      isAdmin: true,
      label: 'Administração',
      items: [
        { id: 'admin-panel', label: 'Painel administrativo', icon: ShieldAlert, screen: 'admin' as Screen },
        { id: 'admin-configs', label: 'Configurações', icon: SettingsIcon, screen: 'admin' as Screen, tab: 'configs' },
        { id: 'admin-users', label: 'Usuários', icon: UserIcon, screen: 'admin' as Screen, tab: 'users' },
        { id: 'admin-icons', label: 'Ícones', icon: LayoutGrid, screen: 'admin' as Screen, tab: 'icons' },
        { id: 'admin-events', label: 'Eventos', icon: Ticket, screen: 'admin' as Screen, tab: 'events' },
        { id: 'admin-comms', label: 'Avisos', icon: Send, screen: 'admin' as Screen, tab: 'comms' },
      ]
    }
  ];

  const handleNavigate = (screen: Screen, tab?: string) => {
    if (screen === 'scoreboard' && !canStartMatch) {
      return;
    }
    onNavigate(screen, tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex animate-in fade-in duration-300">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Drawer Content */}
      <div className="relative w-80 max-w-[85%] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
        {/* Header */}
        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-blue-600 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <User size={20} />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight leading-none">{userProfile.nickname || userProfile.name || 'Usuário'}</p>
              <p className="text-[10px] font-bold opacity-70 mt-1 uppercase tracking-widest">{userProfile.pin}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          {menuGroups.map((group, index) => {
            if (group.isAdmin && !isAdmin) return null;
            return (
              <React.Fragment key={group.id}>
                {index > 0 && <div className="h-[2px] bg-slate-200 mx-4 my-2" />}
                <div className="space-y-1">
                  {group.label && (
                    <p className={`px-4 mb-2 text-[10px] font-black uppercase tracking-widest ${group.color} opacity-70`}>
                      {group.label}
                    </p>
                  )}
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.screen, item.tab)}
                      className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] ${
                        currentScreen === item.screen && (!item.tab || item.tab === currentTab)
                          ? group.bgColor 
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <item.icon size={20} className={currentScreen === item.screen && (!item.tab || item.tab === currentTab) ? group.color : 'text-slate-400'} />
                      <span className={`text-sm font-bold ${group.color}`}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-50">
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-red-500 hover:bg-red-50 transition-all active:scale-[0.98]"
          >
            <LogOut size={20} />
            <span className="text-sm font-bold">Sair da conta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
