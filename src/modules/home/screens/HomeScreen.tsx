import React, { useState } from 'react';
import { Users, Play, Settings, UserCheck, History, Trophy, HelpCircle, LogOut, RotateCw, Bell, Loader2, ChevronRight, Menu } from 'lucide-react';
import type { UserProfile } from '@modules/auth/types';
import { APP_VERSION } from '../../../constants';
import { SettingsTabs } from '@modules/settings';
import { useGame } from '@modules/game';
import { useGameRules } from '@modules/game/hooks/useGameRules';
import { useLive } from '@modules/live';
import { useUI } from '@modules/ui';
import { isWatchDevice } from '@shared/utils/device';
import { ScoreboardIcon } from '@shared/components/ScoreboardIcon';

interface HomeScreenProps {
  userProfile: UserProfile;
  unreadCommsCount: number;
  onNavigate: (screen: any, tab?: any) => void;
  onLogout: () => void;
  onCheckUpdate: () => Promise<string | null>;
  onOpenMenu: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userProfile,
  unreadCommsCount,
  onNavigate,
  onLogout,
  onCheckUpdate,
  onOpenMenu,
}) => {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  const { initGameState, matchSettings } = useGame();
  const { cloudLiveExists } = useLive();
  const { canStartMatch, persistMatchSettings } = useGameRules();
  const { setModalConfig } = useUI();
  const isLiveActive = !!cloudLiveExists;

  const handlePlayShortcut = () => {
    if (canStartMatch) {
      persistMatchSettings();
      // Respeita a configuração de modo definida na tela de Regras:
      // - Dispositivo relógio OU modo relógio ativo → ScoreboardScreen renderiza WatchBoard
      // - Modo placar ativo → ScoreboardScreen renderiza no modo placar
      // - Sem modo ativo → ScoreboardScreen no modo controle padrão
      // Em todos os casos o ScoreboardScreen resolve internamente qual UI renderizar
      // com base no matchConfig.isWatchMode e matchConfig.isScoreboardMode persistidos.
      initGameState(false);
      onNavigate('scoreboard');
    } else {
      setModalConfig({
        title: 'Atenção',
        message: 'Não é possível iniciar a partida. Verifique se os nomes dos jogadores estão preenchidos na tela de Times.',
        onConfirm: () => {
          setModalConfig(null);
          onNavigate('settings', 'config');
        },
        onCancel: () => setModalConfig(null)
      });
    }
  };

  // Referência local dos modos para uso futuro (ex: ícone dinâmico no card Play)
  const _isWatch = isWatchDevice() || !!matchSettings.isWatchMode;
  void _isWatch; // evita warning de variável não usada

  // Calcula as iniciais do nome (CR)
  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(userProfile.name || userProfile.nickname);
  const greetingName = userProfile.nickname || userProfile.name.split(' ')[0] || 'Usuário';

  const handleUpdateCheck = async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      const result = await onCheckUpdate();
      if (!result) {
        setUpdateFeedback('App atualizado');
      } else {
        setUpdateFeedback(`Nova versão: ${result}`);
      }
      setTimeout(() => setUpdateFeedback(null), 3000);
    } catch {
      setUpdateFeedback('Erro de rede');
      setTimeout(() => setUpdateFeedback(null), 3000);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const gridItems = [
    { label: 'Times',     icon: <Users     size={36} className="text-sky-600" />,                    colorClass: 'bg-sky-50/60 text-sky-600 border-sky-100/50 hover:bg-sky-100/50',           action: () => onNavigate('settings', 'config') },
    { label: 'Play',      icon: <Play      size={36} className="text-emerald-500 fill-emerald-500" />, colorClass: 'bg-emerald-50/60 text-emerald-600 border-emerald-100/50 hover:bg-emerald-100/50', action: handlePlayShortcut, showLiveIndicator: isLiveActive },
    { label: 'Regras',    icon: <Settings  size={36} className="text-amber-500" />,                    colorClass: 'bg-amber-50/60 text-amber-600 border-amber-100/50 hover:bg-amber-100/50',     action: () => onNavigate('new-game') },
    { label: 'Parceiros', icon: <UserCheck size={36} className="text-teal-700" />,                     colorClass: 'bg-[#40E0D0]/10 text-teal-700 border-teal-100/30 hover:bg-[#40E0D0]/20',    action: () => onNavigate('partners') },
    { label: 'Histórico', icon: <History   size={36} className="text-emerald-500" />,                  colorClass: 'bg-emerald-50/60 text-emerald-600 border-emerald-100/50 hover:bg-emerald-100/50', action: () => onNavigate('settings', 'history') },
    { label: 'Torneios',  icon: <Trophy    size={36} className="text-blue-500" />,                     colorClass: 'bg-blue-50/60 text-blue-600 border-blue-100/50 hover:bg-blue-100/50',        action: () => onNavigate('tournaments') },
    { label: 'Ajuda',     icon: <HelpCircle size={36} className="text-gray-500" />,                   colorClass: 'bg-gray-50/60 text-gray-600 border-gray-100/50 hover:bg-gray-100/50',        action: () => onNavigate('settings', 'help') },
    { label: 'Sair',      icon: <LogOut    size={36} className="text-red-500" />,                      colorClass: 'bg-red-50/60 text-red-600 border-red-100/50 hover:bg-red-100/50',            action: onLogout },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#F3F4F6] relative pb-32">
      {/* Cabeçalho */}
      <header className="bg-white border-b border-gray-100 px-4 py-5 flex items-center justify-between sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        {/* Botão Menu (hambúrguer) */}
        <button
          onClick={onOpenMenu}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all border border-slate-200"
        >
          <Menu size={20} />
        </button>

        {/* Logo + Título */}
        <div className="flex items-center gap-2">
          <ScoreboardIcon className="w-16 h-16" />
          <span className="text-[2.25rem] font-black text-slate-800 tracking-tighter leading-none">MyPlacar</span>
        </div>

        {/* Notificações (Sino) */}
        <button
          onClick={() => onNavigate('communications')}
          className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 active:scale-95 transition-all border border-slate-200 relative"
        >
          <Bell size={20} />
          {unreadCommsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white animate-pulse">
              {unreadCommsCount}
            </span>
          )}
        </button>
      </header>

      {/* Grid de Atalhos */}
      <main className="flex-1 p-5 max-w-md mx-auto w-full space-y-6">

        {/* Botão de Perfil */}
        <button
          onClick={() => onNavigate('settings', 'profile')}
          className="w-full bg-white border border-gray-100 text-slate-700 py-4 px-6 rounded-3xl font-black text-sm flex items-center gap-3 shadow-[0_4px_12px_rgba(0,0,0,0.02)] active:scale-95 transition-all hover:bg-slate-50"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-500 text-white font-black text-sm flex items-center justify-center shadow-inner shrink-0">
            {initials}
          </div>
          <div className="flex flex-col text-left flex-1">
            <span className="text-[21px] font-black text-slate-800 leading-tight">Olá, {greetingName}</span>
            <span className="text-[16.5px] font-bold text-slate-400 lowercase">{userProfile.email}</span>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
        <div className="grid grid-cols-2 gap-4">
          {gridItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-3xl border border-gray-100 shadow-[0_4px_12px_rgba(0,0,0,0.02)] active:scale-95 transition-all aspect-[3/2] relative ${item.colorClass}`}
            >
              <div className="relative p-3 bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                {item.icon}
                {item.showLiveIndicator && (
                  <span className="absolute left-1/2 bottom-1 -translate-x-1/2 bg-[#f59e0b] rounded-[4px] px-1.5 py-0.5 text-[8px] font-black text-white tracking-tighter leading-none shadow-sm pointer-events-none">
                    Live
                  </span>
                )}
              </div>
              <span className="text-[21px] font-black tracking-tight">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Botão de Versão */}
        <button
          onClick={handleUpdateCheck}
          disabled={isCheckingUpdate}
          className="w-full bg-white border border-gray-100 text-slate-700 py-4 px-6 rounded-3xl font-black text-sm flex items-center justify-center gap-3 shadow-[0_4px_12px_rgba(0,0,0,0.02)] active:scale-95 transition-all hover:bg-slate-50 disabled:opacity-70"
        >
          {isCheckingUpdate ? (
            <Loader2 size={18} className="animate-spin text-slate-500" />
          ) : (
            <RotateCw size={18} className="text-emerald-500" />
          )}
          <span className="text-[21px]">{updateFeedback || `Versão ${APP_VERSION}`}</span>
        </button>
      </main>
    </div>
  );
};
