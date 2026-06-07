import { Clock, Menu, Settings as SettingsIcon, User } from 'lucide-react';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';
import type { Tab } from '../../../types';

interface AdminBottomNavProps {
  onNavigateToTab?: (tab: Tab) => void;
  onOpenRules?: () => void;
  onOpenMenu?: () => void;
}

export const AdminBottomNav = ({ onNavigateToTab, onOpenRules, onOpenMenu }: AdminBottomNavProps) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-gray-100 px-4 pt-3 pb-safe flex justify-between items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
    <button onClick={() => onNavigateToTab?.('config')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
      <ScoreboardIcon className="w-6 h-6" />
      <span className="text-[10px] font-black text-black">Início</span>
    </button>
    <button onClick={() => onOpenRules?.()} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
      <SettingsIcon size={22} className="text-black" />
      <span className="text-[10px] font-black text-black">Regras</span>
    </button>
    <button onClick={() => onNavigateToTab?.('history')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
      <Clock size={22} className="text-black" />
      <span className="text-[10px] font-black text-black">Histórico</span>
    </button>
    <button onClick={() => onNavigateToTab?.('profile')} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
      <User size={22} className="text-black" />
      <span className="text-[10px] font-black text-black">Perfil</span>
    </button>
    <button onClick={onOpenMenu} className="flex flex-col items-center justify-center gap-1 transition-all flex-1 min-h-[56px] opacity-40">
      <Menu size={22} className="text-black" />
      <span className="text-[10px] font-black text-black">Menu</span>
    </button>
  </nav>
);
