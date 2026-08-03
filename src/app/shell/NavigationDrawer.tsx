import React from 'react';
import { 
  X, Home, Trophy, Users, Bell, History, User, Settings, ShieldAlert, LogOut, Play, Menu, HelpCircle, User as UserIcon, Clock, Settings as SettingsIcon, MapPin, Ticket, Send, LayoutGrid
} from 'lucide-react';
import { Screen } from '@game/types';
import { useGame } from '@modules/game';
import { useGameRules } from '@modules/game/hooks/useGameRules';
import { useUI } from '@modules/ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentScreen: Screen;
  currentTab?: string;
  onNavigate: (screen: Screen, tab?: string) => void;
  onLogout: () => void;
  onExitOffline?: () => void;
  isAdmin: boolean;
  canStartMatch: boolean;
  isOfflineMode?: boolean;
}

export const NavigationDrawer: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  currentScreen, 
  currentTab,
  onNavigate, 
  onLogout,
  onExitOffline,
  isAdmin,
  canStartMatch: _unused_canStartMatch,
  isOfflineMode = false
}) => {
  const { userProfile, initGameState } = useGame();
  const { canStartMatch, persistMatchSettings } = useGameRules();
  const { setModalConfig } = useUI();

  if (!isOpen) return null;

  const handlePlayShortcut = () => {
    if (canStartMatch) {
      persistMatchSettings();
      initGameState(false);
      onNavigate('scoreboard');
      onClose();
    } else {
      setModalConfig({
        title: 'Atenção',
        message: 'Não é possível iniciar a partida. Verifique se os nomes dos jogadores estão preenchidos na tela de Times.',
        onConfirm: () => {
          setModalConfig(null);
          onNavigate('settings', 'config');
          onClose();
        },
        onCancel: () => setModalConfig(null)
      });
    }
  };

  const menuGroups = [
    {
      id: 1,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      items: [
        { id: 'home', label: 'Home', icon: Home, screen: 'home' as Screen },
        { id: 'config', label: 'Times', icon: Users, screen: 'settings' as Screen, tab: 'config' },
        { id: 'partners', label: 'Meus parceiros', icon: Users, screen: 'partners' as Screen },
        { id: 'tournaments', label: 'Meus torneios', icon: Trophy, screen: 'tournaments' as Screen },
      ]
    },
    {
      id: 2,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
      items: [
        { id: 'rules', label: 'Regras e configurações', icon: Settings, screen: 'new-game' as Screen },
      ]
    },
    {
      id: 3,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      items: [
        { id: 'scoreboard', label: 'Placar', icon: Play, screen: 'scoreboard' as Screen, action: handlePlayShortcut },
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
    onNavigate(screen, tab);
    onClose();
  };

  if (isOfflineMode) {
    return (
      <div className="fixed inset-0 z-[1000] flex animate-in fade-in duration-300">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-80 max-w-[85%] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
          <div className="py-5 pl-5 pr-5 flex items-center justify-between bg-amber-50 border-b border-amber-100/50 text-slate-700">
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleNavigate('scoreboard')}
                className="p-2 text-emerald-500 hover:bg-amber-100/40 rounded-full transition-colors"
                title="Placar"
              >
                <Play size={22} className="fill-emerald-500" />
              </button>
              {onExitOffline && (
                <button
                  onClick={() => { onExitOffline(); onClose(); }}
                  className="p-2 text-red-500 hover:bg-amber-100/40 rounded-full transition-colors"
                  title="Sair do modo offline"
                >
                  <LogOut size={22} />
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:bg-amber-100/40 rounded-full transition-colors"
              title="Fechar"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
            <div className="space-y-1">
              <button
                onClick={() => handleNavigate('scoreboard')}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] ${
                  currentScreen === 'scoreboard' ? 'bg-orange-50' : 'hover:bg-slate-50'
                }`}
              >
                <Play size={20} className="text-emerald-500 fill-emerald-500" />
                <span className="text-sm font-bold text-black">Placar</span>
              </button>

            </div>

            <div className="h-[2px] bg-slate-200 mx-4 my-2" />

            {onExitOffline && (
              <button
                onClick={() => { onExitOffline(); onClose(); }}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all active:scale-[0.98]"
              >
                <LogOut size={20} />
                <span className="text-sm font-bold">Sair do modo offline</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

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
        <div className="py-5 pl-14 pr-5 flex items-center justify-between bg-amber-50 border-b border-amber-100/50 text-slate-700">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => handleNavigate('settings', 'config')}
              className="p-2 text-blue-600 hover:bg-amber-100/40 rounded-full transition-colors"
              title="Times"
            >
              <Users size={22} />
            </button>
            <button 
              onClick={() => handleNavigate('new-game')}
              className="p-2 text-amber-500 hover:bg-amber-100/40 rounded-full transition-colors"
              title="Regras"
            >
              <Settings size={22} />
            </button>
            <button 
              onClick={handlePlayShortcut}
              className="p-2 text-emerald-500 hover:bg-amber-100/40 rounded-full transition-colors"
              title="Play"
            >
              <Play size={22} className="fill-emerald-500" />
            </button>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-500 hover:bg-amber-100/40 rounded-full transition-colors"
            title="Fechar"
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
                  {group.items.map((item) => {
                    const isActive = currentScreen === item.screen && (!item.tab || item.tab === currentTab);
                    const iconColor = item.id === 'home' ? 'text-orange-500' : group.color;
                    const activeBg = item.id === 'home' ? 'bg-orange-50' : group.bgColor;
                    return (
                      <button
                        key={item.id}
                        onClick={item.action ? item.action : () => handleNavigate(item.screen, item.tab)}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] ${
                          isActive ? activeBg : 'hover:bg-slate-50'
                        }`}
                      >
                        <item.icon size={20} className={iconColor} />
                        <span className="text-sm font-bold text-black">{item.label}</span>
                      </button>
                    );
                  })}
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
