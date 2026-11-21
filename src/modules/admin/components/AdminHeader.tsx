import type { ReactNode } from 'react';
import { Menu, LayoutGrid, Send, Settings as SettingsIcon, ShieldCheck, Ticket, User } from 'lucide-react';
import type { AdminTab } from '@modules/admin/types';

interface AdminHeaderProps {
  activeTab: AdminTab;
  onBack: () => void;
  onOpenMenu?: () => void;
  onSelectTab: (tab: AdminTab) => void;
  hideTabs?: boolean;
}

const ADMIN_TABS: Array<{ id: AdminTab; label: string; icon: ReactNode }> = [
  { id: 'configs', label: 'Configs', icon: <SettingsIcon size={22} /> },
  { id: 'comms', label: 'Avisos', icon: <Send size={22} /> },
  { id: 'events', label: 'Eventos', icon: <Ticket size={22} /> },
  { id: 'users', label: 'Usuários', icon: <User size={22} /> },
  { id: 'icons', label: 'Ícones', icon: <LayoutGrid size={22} /> },
];

export const AdminHeader = ({ activeTab, onBack, onOpenMenu, onSelectTab, hideTabs = false }: AdminHeaderProps) => (
  <header className="px-4 py-5 bg-white border-b border-gray-200 sticky top-0 z-50">
    <div className="flex items-center justify-between max-w-md mx-auto">
      <button
        type="button"
        onClick={onOpenMenu || onBack}
        aria-label="Abrir menu"
        className="w-10 h-10 -ml-2 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all"
      ><Menu size={20} /></button>
      <div className="flex items-center gap-2">
        <ShieldCheck size={24} className="text-black" />
        <h1 className="text-xl font-black text-black tracking-tight leading-tight">
          {hideTabs ? 'Painel do evento' : 'Painel administrativo'}
        </h1>
      </div>
      <div className="w-10"></div>
    </div>

    {/* Carrossel de botões maiores (Estilo App de Banco) */}
    {!hideTabs && (
      <div className="mt-5 max-w-md mx-auto overflow-x-auto no-scrollbar snap-x snap-mandatory flex gap-3 px-1 py-1">
        {ADMIN_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex-none w-[105px] h-[85px] snap-start flex flex-col items-center justify-center gap-2 rounded-2xl text-xs font-black transition-all border leading-tight text-center active:scale-95 ${
              activeTab === tab.id
                ? 'bg-sky-500 text-white border-sky-500 shadow-md scale-[1.02]'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    )}
  </header>
);
