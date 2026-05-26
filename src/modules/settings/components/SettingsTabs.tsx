import React from 'react';
import { Clock, Settings, User, Menu, Check, LogOut, Home, Users } from 'lucide-react';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';
import { isWatchDevice } from '@shared/utils/device';
import { useUI } from '@modules/ui';

interface Props {
  activeTab: string;
  setActiveTab: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  onOpenRules: () => void;
  isSettingsInicialSaved?: boolean;
  isSettingsRegrasSaved?: boolean;
  isProfileSaved?: boolean;
  isMirroringActive?: boolean;
  onOpenMenu: () => void;
  isOfflineMode?: boolean;
  onExitOffline?: () => void;
}

export const SettingsTabs: React.FC<Props> = ({ 
  activeTab, 
  setActiveTab, 
  onOpenRules, 
  isSettingsInicialSaved = true, 
  isSettingsRegrasSaved = true, 
  isProfileSaved = true, 
  isMirroringActive = false, 
  onOpenMenu, 
  isOfflineMode = false,
  onExitOffline
}) => {
  const { currentScreen, setCurrentScreen } = useUI();

  const getBtnClass = (isActive: boolean) => 
    `flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] ${isActive ? 'opacity-100 scale-110' : 'opacity-40'}`;

  if (isWatchDevice()) return null;

  // Layout simplificado para o modo Offline
  if (isOfflineMode) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-12 pt-3 pb-safe flex justify-around items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <button onClick={onExitOffline} className={getBtnClass(false)}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 bg-red-50 shadow-sm border border-red-100">
            <LogOut size={22} />
          </div>
          <span className="text-[10px] font-black text-black">Sair</span>
        </button>

        <button 
          onClick={() => {
            setCurrentScreen('new-game');
            onOpenRules();
          }} 
          className={getBtnClass(currentScreen === 'new-game')}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${currentScreen === 'new-game' ? (isSettingsRegrasSaved ? 'bg-emerald-500 shadow-md' : 'bg-amber-500 shadow-md') : (isSettingsRegrasSaved ? 'bg-emerald-500 shadow-md opacity-50' : 'bg-amber-500 shadow-md opacity-50')}`}>
            <Settings size={22} className="text-white" />
            {isSettingsRegrasSaved && isMirroringActive && (
              <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
                <Check size={8} strokeWidth={4} />
              </div>
            )}
          </div>
          <span className="text-[10px] font-black text-black">Regras</span>
        </button>
      </nav>
    );
  }

  const isHomeActive = currentScreen === 'home';
  const isTimesActive = currentScreen === 'settings' && activeTab === 'config';
  const isRegrasActive = currentScreen === 'new-game';
  const isHistoryActive = currentScreen === 'settings' && activeTab === 'history';
  const isProfileActive = currentScreen === 'settings' && activeTab === 'profile';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-4 pt-3 pb-safe flex justify-between items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      {/* Home */}
      <button 
        onClick={() => {
          setCurrentScreen('home');
        }} 
        className={getBtnClass(isHomeActive)}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-500 ${isHomeActive ? 'bg-emerald-500 shadow-md text-white' : 'bg-transparent text-black'}`}>
          <Home size={22} className={isHomeActive ? 'text-white' : 'text-black'} />
        </div>
        <span className="text-[10px] font-black text-black">Home</span>
      </button>

      {/* Times (Cor Azul Celeste ativa) */}
      <button 
        onClick={() => {
          setCurrentScreen('settings');
          setActiveTab('config');
        }} 
        className={getBtnClass(isTimesActive)}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${isTimesActive ? (isSettingsInicialSaved ? 'bg-sky-600 shadow-md' : 'bg-amber-500 shadow-md') : (isSettingsInicialSaved ? 'bg-sky-600 shadow-md opacity-50' : 'bg-amber-500 shadow-md opacity-50')}`}>
          <Users size={22} className="text-white" />
          {isSettingsInicialSaved && isMirroringActive && (
            <div className="absolute -top-1 -right-1 bg-white text-sky-600 rounded-full p-0.5 shadow-sm border border-sky-100 animate-in zoom-in">
              <Check size={8} strokeWidth={4} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-black text-black">Times</span>
      </button>

      {/* Regras */}
      <button 
        onClick={() => {
          setCurrentScreen('new-game');
          onOpenRules();
        }} 
        className={getBtnClass(isRegrasActive)}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${isRegrasActive ? (isSettingsRegrasSaved ? 'bg-emerald-500 shadow-md' : 'bg-amber-500 shadow-md') : (isSettingsRegrasSaved ? 'bg-emerald-500 shadow-md opacity-50' : 'bg-amber-500 shadow-md opacity-50')}`}>
          <Settings size={22} className="text-white" />
          {isSettingsRegrasSaved && isMirroringActive && (
            <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
              <Check size={8} strokeWidth={4} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-black text-black">Regras</span>
      </button>

      {/* Histórico */}
      <button 
        onClick={() => {
          setCurrentScreen('settings');
          setActiveTab('history');
        }} 
        className={getBtnClass(isHistoryActive)}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 ${isHistoryActive ? 'bg-emerald-500 shadow-md' : 'bg-transparent'}`}>
          <Clock size={22} className={isHistoryActive ? 'text-white' : 'text-black'} />
        </div>
        <span className="text-[10px] font-black text-black">Histórico</span>
      </button>

      {/* Perfil */}
      <button 
        onClick={() => {
          setCurrentScreen('settings');
          setActiveTab('profile');
        }} 
        className={getBtnClass(isProfileActive)}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${isProfileActive ? (isProfileSaved ? 'bg-emerald-500 shadow-md' : 'bg-amber-500 shadow-md') : 'bg-transparent'}`}>
          <User size={22} className={isProfileActive ? 'text-white' : 'text-black'} />
          {isProfileActive && isProfileSaved && isMirroringActive && (
            <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
              <Check size={8} strokeWidth={4} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-black text-black">Perfil</span>
      </button>

      {!isOfflineMode && (
        <button onClick={onOpenMenu} className={getBtnClass(false)}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-black transition-colors duration-500 bg-transparent">
            <Menu size={22} />
          </div>
          <span className="text-[10px] font-black text-black">Menu</span>
        </button>
      )}
    </nav>
  );
};
