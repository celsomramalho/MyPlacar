
import React from 'react';
import { Clock, Settings, User, HelpCircle, Check } from 'lucide-react';
import { ScoreboardIcon } from '../../components/ScoreboardIcon';

interface Props {
  activeTab: string;
  setActiveTab: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  onOpenRules: () => void;
  isSettingsInicialSaved?: boolean;
  isSettingsRegrasSaved?: boolean;
  isProfileSaved?: boolean;
  isMirroringActive?: boolean;
}

export const SettingsTabs: React.FC<Props> = ({ activeTab, setActiveTab, onOpenRules, isSettingsInicialSaved = true, isSettingsRegrasSaved = true, isProfileSaved = true, isMirroringActive = false }) => {
  const getBtnClass = (isActive: boolean) => 
    `flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] ${isActive ? 'opacity-100 scale-110' : 'opacity-40'}`;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-4 pt-3 pb-10 flex justify-between items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      <button onClick={() => setActiveTab('config')} className={getBtnClass(activeTab === 'config')}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${activeTab === 'config' ? (isSettingsInicialSaved ? 'bg-emerald-500 shadow-md' : 'bg-amber-500 shadow-md') : 'bg-transparent'}`}>
          <ScoreboardIcon className={`w-6 h-6 ${activeTab === 'config' ? 'text-white' : 'text-black'}`} />
          {activeTab === 'config' && isSettingsInicialSaved && isMirroringActive && (
            <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
              <Check size={8} strokeWidth={4} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-black text-black">Início</span>
      </button>
      <button onClick={onOpenRules} className={getBtnClass(false)}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${isSettingsRegrasSaved ? 'bg-emerald-500 shadow-md' : 'bg-amber-500 shadow-md'} opacity-50`}>
          <Settings size={22} className="text-white" />
          {isSettingsRegrasSaved && isMirroringActive && (
            <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
              <Check size={8} strokeWidth={4} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-black text-black">Regras</span>
      </button>
      <button onClick={() => setActiveTab('history')} className={getBtnClass(activeTab === 'history')}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 ${activeTab === 'history' ? 'bg-emerald-500 shadow-md' : 'bg-transparent'}`}>
          <Clock size={22} className={activeTab === 'history' ? 'text-white' : 'text-black'} />
        </div>
        <span className="text-[10px] font-black text-black">Histórico</span>
      </button>
      <button onClick={() => setActiveTab('profile')} className={getBtnClass(activeTab === 'profile')}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 relative ${activeTab === 'profile' ? (isProfileSaved ? 'bg-emerald-500 shadow-md' : 'bg-amber-500 shadow-md') : 'bg-transparent'}`}>
          <User size={22} className={activeTab === 'profile' ? 'text-white' : 'text-black'} />
          {activeTab === 'profile' && isProfileSaved && isMirroringActive && (
            <div className="absolute -top-1 -right-1 bg-white text-emerald-600 rounded-full p-0.5 shadow-sm border border-emerald-100 animate-in zoom-in">
              <Check size={8} strokeWidth={4} />
            </div>
          )}
        </div>
        <span className="text-[10px] font-black text-black">Perfil</span>
      </button>
      <button onClick={() => setActiveTab('help')} className={getBtnClass(activeTab === 'help')}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors duration-500 ${activeTab === 'help' ? 'bg-emerald-500 shadow-md' : 'bg-transparent'}`}>
          <HelpCircle size={22} className={activeTab === 'help' ? 'text-white' : 'text-black'} />
        </div>
        <span className="text-[10px] font-black text-black">Ajuda</span>
      </button>
    </nav>
  );
};
