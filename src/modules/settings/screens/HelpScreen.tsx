import React from 'react';
import { HelpCircle, Settings, Cloud, MapPin, Mic, Play, Activity, Menu } from 'lucide-react';
import type { UserProfile } from '@modules/auth/types';

interface Props {
  profile: UserProfile;
  onNavigateToTab: (tab: 'config' | 'history' | 'help' | 'profile') => void;
  onOpenRules: () => void;
  onPlay?: () => void;
  canStartMatch: boolean;
  onOpenMenu: () => void;
}

export const HelpScreen: React.FC<Props> = ({ onPlay, canStartMatch, onOpenMenu }) => {
  const helpItems = [
    {
      title: "Placar e voz",
      icon: <Mic className="text-blue-500" />,
      content: "Controle o jogo dizendo 'ponto', 'ponto sacador' ou 'ponto contra'. Ative o árbitro Gemini para narrações emocionantes."
    },
    {
      title: "Regras do jogo",
      icon: <Settings className="text-orange-500" />,
      content: "Configure sets, games por set e modo de tie-break. No Pickleball, escolha entre o modo Tradicional (Side-out) ou Rally."
    },
    {
      title: "Sincronização",
      icon: <Cloud className="text-sky-500" />,
      content: "Suas partidas são salvas localmente e sincronizadas com a nuvem automaticamente quando você estiver online."
    },
    {
      title: "Localização",
      icon: <MapPin className="text-red-500" />,
      content: "Visualize o mapa de onde suas partidas ocorreram e acompanhe sua jornada esportiva por onde passar."
    }
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden animate-in fade-in duration-300">
      {/* CABEÇALHO CENTRALIZADO + PLAY BUTTON */}
      <header className="px-6 py-4 flex items-center bg-white border-b border-gray-100 sticky top-0 z-40 min-h-[72px]">
        <button onClick={onOpenMenu} className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all">
          <Menu size={20} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-2">
          <HelpCircle size={24} className="text-black stroke-[2.5]" />
          <h1 className="text-lg font-black text-black tracking-tight">Ajuda</h1>
        </div>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 no-scrollbar space-y-8">
        {/* GUIA DE RECURSOS COM PADRÃO DE TÍTULO DA IMAGEM 2 */}
        <div className="space-y-5">
          <div className="flex items-center gap-2 px-1">
            <Activity size={20} className="text-red-500" />
            <h3 className="text-sm font-black text-black">Guia de recursos</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {helpItems.map((item, i) => (
              <div key={i} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-gray-100 flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h4 className="font-black text-black mb-1">{item.title}</h4>
                  <p className="text-xs text-black font-black leading-relaxed">{item.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
