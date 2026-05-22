import type { ReactNode } from 'react';
import { ArrowLeft, LayoutGrid, Send, Settings as SettingsIcon, ShieldCheck, Ticket, User } from 'lucide-react';
import type { AdminTab } from '@modules/admin/types';

interface AdminHeaderProps {
  activeTab: AdminTab;
  onBack: () => void;
  onSelectTab: (tab: AdminTab) => void;
}

const ADMIN_TABS: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
  { id: 'configs', label: 'Configs', icon: <SettingsIcon size={14} /> },
  { id: 'users', label: 'Usuários', icon: <User size={14} /> },
  { id: 'icons', label: 'Ícones', icon: <LayoutGrid size={14} /> },
  { id: 'events', label: 'Eventos', icon: <Ticket size={14} /> },
  { id: 'comms', label: 'Avisos', icon: <Send size={14} /> },
];

export const AdminHeader = ({ activeTab, onBack, onSelectTab }: AdminHeaderProps) => (
  <header className="px-6 py-6 bg-white border-b border-gray-200 sticky top-0 z-50">
    <div className="flex items-center justify-between max-w-md mx-auto">
      <button onClick={onBack} className="p-2 -ml-2 text-black active:scale-90"><ArrowLeft size={24} /></button>
      <div className="flex items-center gap-2">
        <ShieldCheck size={24} className="text-black" />
        <h1 className="text-xl font-black text-black tracking-tight leading-tight">Painel administrativo</h1>
      </div>
      <div className="w-10"></div>
    </div>

    <div className="grid grid-cols-5 gap-1 mt-6 max-w-md mx-auto">
      {ADMIN_TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelectTab(tab.id)}
          className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-[8px] font-black transition-all border leading-tight text-center ${activeTab === tab.id ? 'bg-black text-white border-black shadow-md scale-105' : 'bg-white text-black border-slate-100'}`}
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  </header>
);
